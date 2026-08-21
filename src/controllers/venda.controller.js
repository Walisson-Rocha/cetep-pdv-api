const mongoose = require('mongoose')

// Erro de validação de negócio lançado dentro de uma transação — aborta a transação
// sem disparar o retry automático do withTransaction (que é só pra conflitos
// transitórios de rede/gravação) e carrega o status HTTP e o payload de resposta.
class ErroVenda extends Error {
  constructor(status, mensagem, extra = {}) {
    super(mensagem)
    this.status = status
    this.extra = extra
  }
}

const CAMPO_FORMA = {
  dinheiro: 'totalDinheiro', pix: 'totalPix', debito: 'totalDebito',
  credito: 'totalCredito', fiado: 'totalFiado', misto: 'totalMisto',
  boleto: 'totalBoleto', colaborador: 'totalColaborador',
}

// Para venda com forma "misto", quebra o valor por método real (dinheiro, pix...)
// em vez de jogar tudo em totalMisto — senão o caixa nunca sabe quanto entrou em espécie.
const incrementosCaixa = (formaPagamento, formasPagamento, total) => {
  const inc = { totalVendas: total, totalTransacoes: 1 }
  if (formaPagamento === 'misto' && Array.isArray(formasPagamento) && formasPagamento.length > 0) {
    inc.totalMisto = total
    for (const p of formasPagamento) {
      const campo = CAMPO_FORMA[p.metodo]
      if (campo && campo !== 'totalMisto' && p.valor) {
        inc[campo] = (inc[campo] || 0) + p.valor
      }
    }
  } else {
    const campo = CAMPO_FORMA[formaPagamento] || 'totalMisto'
    inc[campo] = (inc[campo] || 0) + total
  }
  return inc
}

const logger = require('../config/logger')
const socket = require('../config/socket')
const Produto = require('../models/Produto')
const Venda = require('../models/Venda')
const Caixa = require('../models/Caixa')
const MovimentoEstoque = require('../models/MovimentoEstoque')
const Lote = require('../models/Lote')
const Cliente = require('../models/Cliente')
const Retirada = require('../models/Retirada')
const Log = require('../models/Log')
const Configuracao = require('../models/Configuracao')
const nfceService = require('../services/nfce')

const registrar = async (req, res) => {
  const { itens, formaPagamento, formasPagamento = [], clienteId, colaboradorId, vendedorId, desconto = 0, troco = 0, pontosResgatados = 0, observacao = '', cpfConsumidor = '' } = req.body
  const session = await mongoose.startSession()
  let vendaPopulada, total, numero
  try {
    // Toda a leitura+escrita de estoque acontece dentro da transação: se duas vendas
    // concorrentes tocarem o mesmo produto, o Mongo bloqueia/conflita uma delas e o
    // withTransaction repete a tentativa automaticamente — fecha a corrida de estoque
    // (checar disponibilidade e decrementar deixam de ser dois passos separados e
    // vulneráveis) e garante que a venda inteira grava tudo ou nada.
    await session.withTransaction(async () => {
      const caixa = await Caixa.findOne({ status: 'aberto' }).session(session)
      if (!caixa) throw new ErroVenda(400, 'Não há caixa aberto. Solicite ao gerente que abra o caixa.')
      const config = await Configuracao.findOne().session(session).lean()
      const permitirEstoqueNegativo = config?.estoqueNegativo ?? false
      let subtotal = 0
      const itensCompletos = []
      const produtoMap = new Map()
      // Soma a quantidade pedida por produto antes de checar estoque — um carrinho com
      // duas linhas do mesmo produto não pode passar na checagem individual e depois
      // vender mais do que existe no total.
      const quantidadeTotalPorProduto = new Map()
      for (const item of itens) {
        quantidadeTotalPorProduto.set(item.produtoId, (quantidadeTotalPorProduto.get(item.produtoId) || 0) + item.quantidade)
      }
      for (const item of itens) {
        const produto = await Produto.findById(item.produtoId).session(session)
        if (!produto || !produto.ativo) {
          throw new ErroVenda(400, `Produto não encontrado: ${item.produtoId}`)
        }
        produtoMap.set(produto._id.toString(), produto)
        const quantidadeTotalPedida = quantidadeTotalPorProduto.get(item.produtoId)
        if (!permitirEstoqueNegativo && produto.estoque < quantidadeTotalPedida) {
          throw new ErroVenda(400, `Estoque insuficiente para ${produto.nome}`, {
            estoqueDisponivel: produto.estoque,
            solicitado: quantidadeTotalPedida
          })
        }
        // Aplica preço atacado automaticamente se quantidade atingiu o mínimo
        let precoUnitario = produto.precoVenda
        if (produto.precoAtacado > 0 && produto.quantidadeAtacado > 0 && item.quantidade >= produto.quantidadeAtacado) {
          precoUnitario = produto.precoAtacado
        }
        // Permite override de preço do frontend (atacado forçado, parcelamento, desconto por item)
        if (item.precoUnitario && item.precoUnitario > 0) {
          const precoCusto = produto.precoCusto || 0
          // Bloqueia venda abaixo do custo (apenas se custo cadastrado)
          if (precoCusto > 0 && item.precoUnitario < precoCusto) {
            throw new ErroVenda(400, `Preço de venda (R$${item.precoUnitario.toFixed(2)}) não pode ser inferior ao custo (R$${precoCusto.toFixed(2)}) para ${produto.nome}`)
          }
          if (item.precoUnitario !== produto.precoVenda && item.precoUnitario !== produto.precoAtacado) {
            logger.info(`Preço override: ${produto.nome} — cadastrado R$${produto.precoVenda} | vendido R$${item.precoUnitario} | operador ${req.user.nome}`)
          }
          precoUnitario = item.precoUnitario
        }
        const itemSubtotal = (precoUnitario - (item.desconto || 0)) * item.quantidade
        subtotal += itemSubtotal
        itensCompletos.push({
          produto: produto._id,
          nomeProduto: produto.nome,
          quantidade: item.quantidade,
          precoUnitario,
          desconto: item.desconto || 0,
          subtotal: itemSubtotal
        })
      }
      total = Math.max(0, subtotal - desconto)

      // Valida limite de crédito antes de registrar fiado
      if (formaPagamento === 'fiado' && clienteId) {
        const cli = await Cliente.findById(clienteId).session(session)
        if (cli && cli.limiteCredito > 0 && (cli.saldoFiado + total) > cli.limiteCredito) {
          const disponivel = Math.max(0, cli.limiteCredito - cli.saldoFiado)
          throw new ErroVenda(400, `Limite de crédito excedido. Disponível: R$${disponivel.toFixed(2)} de R$${cli.limiteCredito.toFixed(2)}`)
        }
      }

      const [venda] = await Venda.create([{
        itens: itensCompletos, subtotal, desconto, total,
        formaPagamento, formasPagamento, troco,
        observacao: observacao.trim(),
        cpfConsumidor: cpfConsumidor.replace(/\D/g, '').slice(0, 11) || '',
        cliente: clienteId || null,
        colaborador: colaboradorId || null,
        caixa: caixa._id,
        vendedor: vendedorId || req.user._id
      }], { session })
      numero = venda.numero

      for (const item of itensCompletos) {
        const produto = produtoMap.get(item.produto.toString())
        const estoqueAnterior = produto.estoque
        const estoqueAtual = produto.estoque - item.quantidade
        await Produto.findByIdAndUpdate(produto._id, { $inc: { estoque: -item.quantidade } }, { session })
        await MovimentoEstoque.create([{
          produto: produto._id, tipo: 'saida',
          quantidade: item.quantidade,
          estoqueAnterior, estoqueAtual,
          motivo: `Venda #${venda.numero}`,
          venda: venda._id, responsavel: req.user._id
        }], { session })
        // FEFO: deduz dos lotes mais antigos primeiro
        const lotes = await Lote.find({ produto: produto._id, ativo: true, quantidade: { $gt: 0 } }).session(session).sort({ dataValidade: 1 })
        if (lotes.length > 0) {
          let restante = item.quantidade
          for (const lote of lotes) {
            if (restante <= 0) break
            const deduzir = Math.min(lote.quantidade, restante)
            lote.quantidade -= deduzir
            if (lote.quantidade === 0) lote.ativo = false
            await lote.save({ session })
            restante -= deduzir
          }
        }
      }
      if (clienteId && (formaPagamento === 'fiado' || formaPagamento === 'misto')) {
        const valorFiado = formaPagamento === 'misto'
          ? (formasPagamento.find(p => p.metodo === 'fiado')?.valor || 0)
          : total
        if (valorFiado > 0) {
          await Cliente.findByIdAndUpdate(clienteId, { $inc: { saldoFiado: valorFiado } }, { session })
        }
      }

      // Fidelidade: debita pontos resgatados e acumula novos
      if (clienteId && config?.fidelidade?.ativo) {
        const pontosPorReal = config.fidelidade.pontosPorReal ?? 1
        const pontosGanhos = Math.floor(total * pontosPorReal)
        const cliAtual = await Cliente.findById(clienteId).session(session)
        if (cliAtual) {
          const pontosDebitar = Math.min(pontosResgatados, cliAtual.pontos ?? 0)
          const novoSaldo = Math.max(0, (cliAtual.pontos ?? 0) - pontosDebitar + pontosGanhos)
          await Cliente.findByIdAndUpdate(clienteId, { pontos: novoSaldo }, { session })
        }
      }
      // Venda descontada do colaborador — cria Retirada para aparecer na folha
      // Estoque já foi deduzido pela venda acima; Retirada.create direto (sem rota) não deduz novamente
      if (formaPagamento === 'colaborador' && colaboradorId) {
        const agora = new Date()
        const mes = parseInt(`${agora.getFullYear()}${String(agora.getMonth() + 1).padStart(2, '0')}`)
        await Retirada.create([{
          colaborador: colaboradorId,
          itens: itensCompletos.map(i => ({
            produto: i.produto,
            nomeProduto: i.nomeProduto,
            quantidade: i.quantidade,
            precoUnitario: i.precoUnitario,
            subtotal: i.subtotal,
          })),
          total,
          mes,
          observacao: `Venda #${venda.numero} — PDV`,
          registradaPor: req.user._id,
          vendaOrigem: venda._id,
        }], { session })
      }
      await Caixa.findByIdAndUpdate(caixa._id, {
        $inc: incrementosCaixa(formaPagamento, formasPagamento, total)
      }, { session })
      await Log.create([{
        usuario: req.user._id, nomeUsuario: req.user.nome,
        acao: 'venda_realizada',
        detalhes: `Venda #${venda.numero} — R$${total.toFixed(2)} (${formaPagamento})`,
        referencia: venda._id
      }], { session })
      vendaPopulada = await Venda.findById(venda._id)
        .session(session)
        .populate('cliente', 'nome telefone')
        .populate('colaborador', 'nome')
        .populate('vendedor', 'nome')
    })
    socket.emit('venda:nova', {
      numero, total, formaPagamento,
      vendedor: req.user.nome,
    })
    res.status(201).json({ venda: vendaPopulada, mensagem: 'Venda registrada com sucesso' })
  } catch (error) {
    if (error instanceof ErroVenda) {
      return res.status(error.status).json({ mensagem: error.message, ...error.extra })
    }
    logger.error('Erro ao registrar venda:', error)
    res.status(500).json({ mensagem: 'Erro ao registrar venda' })
  } finally {
    session.endSession()
  }
}

const cancelar = async (req, res) => {
  const { motivo } = req.body
  if (!['admin', 'gerente'].includes(req.user.perfil)) {
    return res.status(403).json({ mensagem: 'Sem permissão para cancelar vendas' })
  }
  const session = await mongoose.startSession()
  let venda
  try {
    // Estoque, caixa e o próprio flag "cancelada" viram uma coisa só dentro da
    // transação — nunca mais fica um estado no meio do caminho se algo falhar.
    await session.withTransaction(async () => {
      const v = await Venda.findById(req.params.id).session(session)
      if (!v) throw new ErroVenda(404, 'Venda não encontrada')
      if (v.cancelada) throw new ErroVenda(400, 'Venda já cancelada')

      v.cancelada = true
      v.motivoCancelamento = motivo
      v.canceladaPor = req.user._id
      v.canceladaEm = new Date()
      await v.save({ session })

      for (const item of v.itens) {
        const produto = await Produto.findById(item.produto).session(session)
        if (produto) {
          const estoqueAnterior = produto.estoque
          const estoqueAtual = produto.estoque + item.quantidade
          await Produto.findByIdAndUpdate(produto._id, { $inc: { estoque: item.quantidade } }, { session })
          await MovimentoEstoque.create([{
            produto: produto._id, tipo: 'entrada',
            quantidade: item.quantidade,
            estoqueAnterior, estoqueAtual,
            motivo: `Cancelamento venda #${v.numero}`,
            venda: v._id, responsavel: req.user._id
          }], { session })
        }
      }
      if (v.formaPagamento === 'fiado' && v.cliente) {
        await Cliente.findByIdAndUpdate(v.cliente, { $inc: { saldoFiado: -v.total } }, { session })
      }
      // Estorna a Retirada criada automaticamente pelo PDV
      if (v.formaPagamento === 'colaborador' && v.colaborador) {
        await Retirada.findOneAndDelete({ vendaOrigem: v._id }, { session })
      }

      // Estorna o valor do caixa — só se o caixa daquela venda ainda estiver aberto.
      // Estornar num caixa já fechado reescreveria um saldoFinal/diferença que já foi
      // conferido e arquivado; nesse caso o estorno fica só registrado no log/venda.
      if (v.caixa) {
        const caixaDaVenda = await Caixa.findById(v.caixa).session(session)
        if (caixaDaVenda && caixaDaVenda.status === 'aberto') {
          const inc = incrementosCaixa(v.formaPagamento, v.formasPagamento, v.total)
          for (const campo of Object.keys(inc)) inc[campo] = -inc[campo]
          await Caixa.findByIdAndUpdate(v.caixa, { $inc: inc }, { session })
        } else {
          logger.info(`Venda #${v.numero} cancelada com caixa já fechado — estorno não aplicado aos totais do caixa`)
        }
      }

      await Log.create([{
        usuario: req.user._id, nomeUsuario: req.user.nome,
        acao: 'venda_cancelada',
        detalhes: `Venda #${v.numero} cancelada. Motivo: ${motivo}`,
        referencia: v._id
      }], { session })

      venda = v
    })

    // Cancela NFC-e na SEFAZ depois que a transação já commitou — é uma chamada
    // externa (Focus NFe/SEFAZ) que não pode ser desfeita, então não pode entrar
    // dentro de uma transação que ainda pode dar rollback.
    let nfceCancelada = false
    let nfceErro = null
    if (venda.nfce?.status === 'autorizado' && venda.nfce?.referencia) {
      try {
        const config = await Configuracao.findOne()
        const justificativa = motivo.length >= 15
          ? motivo
          : `Cancelamento venda #${venda.numero} - ${motivo}`.slice(0, 255)
        await nfceService.cancelar(venda.nfce.referencia, justificativa, config)
        venda.nfce.status = 'cancelado'
        await venda.save()
        nfceCancelada = true
        logger.info(`NFC-e ref=${venda.nfce.referencia} cancelada junto com venda #${venda.numero}`)
      } catch (err) {
        nfceErro = err.message
        logger.error(`Falha ao cancelar NFC-e ref=${venda.nfce.referencia}: ${err.message}`)
      }
    }

    socket.emit('venda:cancelada', { numero: venda.numero, total: venda.total })
    res.json({
      mensagem: 'Venda cancelada e estoque estornado',
      venda,
      nfce: nfceCancelada
        ? { cancelada: true, mensagem: 'NFC-e cancelada na SEFAZ com sucesso' }
        : nfceErro
        ? { cancelada: false, mensagem: `NFC-e NÃO cancelada na SEFAZ: ${nfceErro}` }
        : { cancelada: false, mensagem: 'Sem NFC-e autorizada para cancelar' },
    })
  } catch (error) {
    if (error instanceof ErroVenda) {
      return res.status(error.status).json({ mensagem: error.message })
    }
    logger.error('Erro ao cancelar venda:', error)
    res.status(500).json({ mensagem: 'Erro ao cancelar venda' })
  } finally {
    session.endSession()
  }
}

const listar = async (req, res) => {
  try {
    const { inicio, fim, formaPagamento, page = 1, limit = 20 } = req.query
    const filtro = {}
    if (inicio || fim) {
      filtro.createdAt = {}
      if (inicio) filtro.createdAt.$gte = new Date(inicio)
      if (fim) filtro.createdAt.$lte = new Date(fim)
    }
    if (formaPagamento) filtro.formaPagamento = formaPagamento
    const vendas = await Venda.find(filtro)
      .populate('cliente', 'nome')
      .populate('colaborador', 'nome')
      .populate('vendedor', 'nome')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
    const total = await Venda.countDocuments(filtro)
    res.json({ vendas, total, paginas: Math.ceil(total / limit) })
  } catch (error) {
    logger.error('Erro ao listar vendas:', error)
    res.status(500).json({ mensagem: 'Erro ao listar vendas' })
  }
}

const vendasHoje = async (req, res) => {
  try {
    const inicio = new Date()
    inicio.setHours(0, 0, 0, 0)
    const fim = new Date()
    fim.setHours(23, 59, 59, 999)
    const vendas = await Venda.find({
      createdAt: { $gte: inicio, $lte: fim },
      cancelada: false
    })
      .populate('cliente', 'nome')
      .populate('colaborador', 'nome')
      .populate('vendedor', 'nome')
      .sort({ createdAt: -1 })
    const total = vendas.reduce((acc, v) => acc + v.total, 0)
    const porForma = vendas.reduce((acc, v) => {
      acc[v.formaPagamento] = (acc[v.formaPagamento] || 0) + v.total
      return acc
    }, {})
    res.json({ vendas, total, quantidade: vendas.length, porFormaPagamento: porForma })
  } catch (error) {
    logger.error('Erro ao buscar vendas de hoje:', error)
    res.status(500).json({ mensagem: 'Erro ao buscar vendas de hoje' })
  }
}

const vendasCliente = async (req, res) => {
  try {
    const mongoose = require('mongoose')
    const { page = 1, limit = 15 } = req.query
    const filtro = { cliente: req.params.id }
    const vendas = await Venda.find(filtro)
      .populate('vendedor', 'nome')
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit))
    const total = await Venda.countDocuments(filtro)
    const agg = await Venda.aggregate([
      { $match: { cliente: new mongoose.Types.ObjectId(req.params.id), cancelada: false } },
      { $group: { _id: null, totalGasto: { $sum: '$total' }, qtd: { $sum: 1 } } }
    ])
    res.json({
      vendas, total,
      paginas: Math.ceil(total / Number(limit)),
      totalGasto: agg[0]?.totalGasto || 0,
      quantidadeTotal: agg[0]?.qtd || 0
    })
  } catch (error) {
    logger.error('Erro ao buscar vendas do cliente:', error)
    res.status(500).json({ mensagem: 'Erro ao buscar histórico do cliente' })
  }
}

module.exports = { registrar, cancelar, listar, vendasHoje, vendasCliente, incrementosCaixa, ErroVenda }
