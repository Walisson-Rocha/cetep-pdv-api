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
  try {
    const { itens, formaPagamento, formasPagamento = [], clienteId, colaboradorId, vendedorId, desconto = 0, troco = 0, pontosResgatados = 0, observacao = '', cpfConsumidor = '' } = req.body
    const caixa = await Caixa.findOne({ status: 'aberto' })
    if (!caixa) return res.status(400).json({ mensagem: 'Não há caixa aberto. Solicite ao gerente que abra o caixa.' })
    const config = await Configuracao.findOne().lean()
    const permitirEstoqueNegativo = config?.estoqueNegativo ?? false
    let subtotal = 0
    let valorCatalogoTotal = 0
    const itensCompletos = []
    // Busca todos os produtos do carrinho numa única consulta, em vez de um round-trip por item
    const produtos = await Produto.find({ _id: { $in: itens.map(item => item.produtoId) } })
    const produtoMap = new Map(produtos.map(p => [p._id.toString(), p]))
    for (const item of itens) {
      const produto = produtoMap.get(item.produtoId)
      if (!produto || !produto.ativo) {
        return res.status(400).json({ mensagem: `Produto não encontrado: ${item.produtoId}` })
      }
      if (!permitirEstoqueNegativo && produto.estoque < item.quantidade) {
        return res.status(400).json({
          mensagem: `Estoque insuficiente para ${produto.nome}`,
          estoqueDisponivel: produto.estoque,
          solicitado: item.quantidade
        })
      }
      // Aplica preço atacado automaticamente se quantidade atingiu o mínimo
      let precoUnitario = produto.precoVenda
      if (produto.precoAtacado > 0 && produto.quantidadeAtacado > 0 && item.quantidade >= produto.quantidadeAtacado) {
        precoUnitario = produto.precoAtacado
      }
      // Preço de catálogo (sem override/desconto) — referência para o cálculo do % de desconto efetivo
      const precoCatalogo = precoUnitario
      // Permite override de preço do frontend (atacado forçado, parcelamento, desconto por item)
      if (item.precoUnitario && item.precoUnitario > 0) {
        const precoCusto = produto.precoCusto || 0
        // Bloqueia venda abaixo do custo (apenas se custo cadastrado)
        if (precoCusto > 0 && item.precoUnitario < precoCusto) {
          return res.status(400).json({
            mensagem: `Preço de venda (R$${item.precoUnitario.toFixed(2)}) não pode ser inferior ao custo (R$${precoCusto.toFixed(2)}) para ${produto.nome}`
          })
        }
        if (item.precoUnitario !== produto.precoVenda && item.precoUnitario !== produto.precoAtacado) {
          logger.info(`Preço override: ${produto.nome} — cadastrado R$${produto.precoVenda} | vendido R$${item.precoUnitario} | operador ${req.user.nome}`)
        }
        precoUnitario = item.precoUnitario
      }
      const descontoItem = item.desconto || 0
      if (descontoItem < 0 || descontoItem > precoUnitario) {
        return res.status(400).json({
          mensagem: `Desconto do item não pode ser maior que o preço (R$${precoUnitario.toFixed(2)}) para ${produto.nome}`
        })
      }
      const itemSubtotal = (precoUnitario - descontoItem) * item.quantidade
      subtotal += itemSubtotal
      valorCatalogoTotal += precoCatalogo * item.quantidade
      itensCompletos.push({
        produto: produto._id,
        nomeProduto: produto.nome,
        quantidade: item.quantidade,
        precoUnitario,
        desconto: descontoItem,
        subtotal: itemSubtotal
      })
    }
    if (desconto < 0 || desconto > subtotal) {
      return res.status(400).json({
        mensagem: `Desconto (R$${desconto.toFixed(2)}) não pode ser maior que o subtotal da venda (R$${subtotal.toFixed(2)})`
      })
    }
    const total = Math.max(0, subtotal - desconto)

    // Limite de desconto por perfil — só entra em vigor depois que o admin configurar pelo menos uma vez
    if (config?.limitesDesconto && valorCatalogoTotal > 0) {
      const limite = config.limitesDesconto[req.user.perfil] ?? 0
      const descontoPercentual = ((valorCatalogoTotal - total) / valorCatalogoTotal) * 100
      if (descontoPercentual > limite + 0.01) {
        return res.status(400).json({
          mensagem: `Desconto de ${descontoPercentual.toFixed(1)}% excede o limite do seu perfil (${limite}%). Peça autorização a um gerente ou administrador.`
        })
      }
    }

    // Valida limite de crédito antes de registrar fiado
    if (formaPagamento === 'fiado' && clienteId) {
      const cli = await Cliente.findById(clienteId)
      if (cli && cli.limiteCredito > 0 && (cli.saldoFiado + total) > cli.limiteCredito) {
        const disponivel = Math.max(0, cli.limiteCredito - cli.saldoFiado)
        return res.status(400).json({
          mensagem: `Limite de crédito excedido. Disponível: R$${disponivel.toFixed(2)} de R$${cli.limiteCredito.toFixed(2)}`
        })
      }
    }

    const venda = await Venda.create({
      itens: itensCompletos, subtotal, desconto, total,
      formaPagamento, formasPagamento, troco,
      observacao: observacao.trim(),
      cpfConsumidor: cpfConsumidor.replace(/\D/g, '').slice(0, 11) || '',
      cliente: clienteId || null,
      colaborador: colaboradorId || null,
      caixa: caixa._id,
      vendedor: vendedorId || req.user._id
    })
    // Busca os lotes de todos os produtos da venda numa única consulta (evita N+1 no FEFO)
    const todosLotes = await Lote.find({
      produto: { $in: itensCompletos.map(i => i.produto) }, ativo: true, quantidade: { $gt: 0 }
    }).sort({ dataValidade: 1 })
    const lotesPorProduto = new Map()
    for (const lote of todosLotes) {
      const key = lote.produto.toString()
      if (!lotesPorProduto.has(key)) lotesPorProduto.set(key, [])
      lotesPorProduto.get(key).push(lote)
    }
    const bulkEstoque = []
    const movimentos = []
    const bulkLotes = []
    for (const item of itensCompletos) {
      const produto = produtoMap.get(item.produto.toString())
      const estoqueAnterior = produto.estoque
      const estoqueAtual = produto.estoque - item.quantidade
      bulkEstoque.push({ updateOne: { filter: { _id: produto._id }, update: { $inc: { estoque: -item.quantidade } } } })
      movimentos.push({
        produto: produto._id, tipo: 'saida',
        quantidade: item.quantidade,
        estoqueAnterior, estoqueAtual,
        motivo: `Venda #${venda.numero}`,
        venda: venda._id, responsavel: req.user._id
      })
      // FEFO: deduz dos lotes mais antigos primeiro
      const lotes = lotesPorProduto.get(produto._id.toString()) || []
      let restante = item.quantidade
      for (const lote of lotes) {
        if (restante <= 0) break
        const deduzir = Math.min(lote.quantidade, restante)
        lote.quantidade -= deduzir
        bulkLotes.push({
          updateOne: {
            filter: { _id: lote._id },
            update: { $set: { quantidade: lote.quantidade, ativo: lote.quantidade > 0 } }
          }
        })
        restante -= deduzir
      }
    }
    await Promise.all([
      bulkEstoque.length ? Produto.bulkWrite(bulkEstoque) : null,
      movimentos.length ? MovimentoEstoque.insertMany(movimentos) : null,
      bulkLotes.length ? Lote.bulkWrite(bulkLotes) : null,
    ])
    if (clienteId && (formaPagamento === 'fiado' || formaPagamento === 'misto')) {
      const valorFiado = formaPagamento === 'misto'
        ? (formasPagamento.find(p => p.metodo === 'fiado')?.valor || 0)
        : total
      if (valorFiado > 0) {
        await Cliente.findByIdAndUpdate(clienteId, { $inc: { saldoFiado: valorFiado } })
      }
    }

    // Fidelidade: debita pontos resgatados e acumula novos
    if (clienteId && config?.fidelidade?.ativo) {
      const pontosPorReal = config.fidelidade.pontosPorReal ?? 1
      const pontosGanhos = Math.floor(total * pontosPorReal)
      const cliAtual = await Cliente.findById(clienteId)
      if (cliAtual) {
        const pontosDebitar = Math.min(pontosResgatados, cliAtual.pontos ?? 0)
        const novoSaldo = Math.max(0, (cliAtual.pontos ?? 0) - pontosDebitar + pontosGanhos)
        await Cliente.findByIdAndUpdate(clienteId, { pontos: novoSaldo })
      }
    }
    // Venda descontada do colaborador — cria Retirada para aparecer na folha
    // Estoque já foi deduzido pela venda acima; Retirada.create direto (sem rota) não deduz novamente
    if (formaPagamento === 'colaborador' && colaboradorId) {
      const agora = new Date()
      const mes = parseInt(`${agora.getFullYear()}${String(agora.getMonth() + 1).padStart(2, '0')}`)
      await Retirada.create({
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
      })
    }
    const campoForma = {
      dinheiro: 'totalDinheiro', pix: 'totalPix', debito: 'totalDebito',
      credito: 'totalCredito', fiado: 'totalFiado', misto: 'totalMisto',
      boleto: 'totalBoleto', colaborador: 'totalColaborador',
    }[formaPagamento] || 'totalMisto'
    await Caixa.findByIdAndUpdate(caixa._id, {
      $inc: { totalVendas: total, totalTransacoes: 1, [campoForma]: total }
    })
    await Log.create({
      usuario: req.user._id, nomeUsuario: req.user.nome,
      acao: 'venda_realizada',
      detalhes: `Venda #${venda.numero} — R$${total.toFixed(2)} (${formaPagamento})`,
      referencia: venda._id
    })
    const vendaPopulada = await Venda.findById(venda._id)
      .populate('cliente', 'nome telefone')
      .populate('colaborador', 'nome')
      .populate('vendedor', 'nome')
    socket.emit('venda:nova', {
      numero: venda.numero, total: venda.total, formaPagamento: venda.formaPagamento,
      vendedor: req.user.nome,
    })
    res.status(201).json({ venda: vendaPopulada, mensagem: 'Venda registrada com sucesso' })
  } catch (error) {
    logger.error('Erro ao registrar venda:', error)
    res.status(500).json({ mensagem: 'Erro ao registrar venda' })
  }
}

const cancelar = async (req, res) => {
  try {
    const { motivo } = req.body
    const venda = await Venda.findById(req.params.id)
    if (!venda) return res.status(404).json({ mensagem: 'Venda não encontrada' })
    if (venda.cancelada) return res.status(400).json({ mensagem: 'Venda já cancelada' })
    if (!['admin', 'gerente'].includes(req.user.perfil)) {
      return res.status(403).json({ mensagem: 'Sem permissão para cancelar vendas' })
    }
    const produtosCancelados = await Produto.find({ _id: { $in: venda.itens.map(i => i.produto) } })
    const produtoMapCancel = new Map(produtosCancelados.map(p => [p._id.toString(), p]))
    const bulkEstoqueCancel = []
    const movimentosCancel = []
    for (const item of venda.itens) {
      const produto = produtoMapCancel.get(item.produto.toString())
      if (produto) {
        const estoqueAnterior = produto.estoque
        const estoqueAtual = produto.estoque + item.quantidade
        bulkEstoqueCancel.push({ updateOne: { filter: { _id: produto._id }, update: { $inc: { estoque: item.quantidade } } } })
        movimentosCancel.push({
          produto: produto._id, tipo: 'entrada',
          quantidade: item.quantidade,
          estoqueAnterior, estoqueAtual,
          motivo: `Cancelamento venda #${venda.numero}`,
          venda: venda._id, responsavel: req.user._id
        })
      }
    }
    await Promise.all([
      bulkEstoqueCancel.length ? Produto.bulkWrite(bulkEstoqueCancel) : null,
      movimentosCancel.length ? MovimentoEstoque.insertMany(movimentosCancel) : null,
    ])
    if (venda.formaPagamento === 'fiado' && venda.cliente) {
      await Cliente.findByIdAndUpdate(venda.cliente, { $inc: { saldoFiado: -venda.total } })
    }
    // Estorna a Retirada criada automaticamente pelo PDV
    if (venda.formaPagamento === 'colaborador' && venda.colaborador) {
      await Retirada.findOneAndDelete({ vendaOrigem: venda._id })
    }
    venda.cancelada = true
    venda.motivoCancelamento = motivo
    venda.canceladaPor = req.user._id
    venda.canceladaEm = new Date()

    // Cancela NFC-e na SEFAZ automaticamente se estiver autorizada
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
        nfceCancelada = true
        logger.info(`NFC-e ref=${venda.nfce.referencia} cancelada junto com venda #${venda.numero}`)
      } catch (err) {
        nfceErro = err.message
        logger.error(`Falha ao cancelar NFC-e ref=${venda.nfce.referencia}: ${err.message}`)
      }
    }

    await venda.save()

    // Estorna o valor do caixa
    if (venda.caixa) {
      const campoForma = {
        dinheiro: 'totalDinheiro', pix: 'totalPix', debito: 'totalDebito',
        credito: 'totalCredito', fiado: 'totalFiado', misto: 'totalMisto',
        boleto: 'totalBoleto', colaborador: 'totalColaborador',
      }[venda.formaPagamento] || 'totalMisto'
      await Caixa.findByIdAndUpdate(venda.caixa, {
        $inc: { totalVendas: -venda.total, totalTransacoes: -1, [campoForma]: -venda.total }
      })
    }

    await Log.create({
      usuario: req.user._id, nomeUsuario: req.user.nome,
      acao: 'venda_cancelada',
      detalhes: `Venda #${venda.numero} cancelada. Motivo: ${motivo}`,
      referencia: venda._id
    })
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
    logger.error('Erro ao cancelar venda:', error)
    res.status(500).json({ mensagem: 'Erro ao cancelar venda' })
  }
}

const listar = async (req, res) => {
  try {
    const { inicio, fim, formaPagamento, numero, page = 1, limit = 20 } = req.query
    const filtro = {}
    if (numero) {
      // Busca por número é exata — ignora o filtro de período, já que o objetivo é achar uma venda específica
      filtro.numero = Number(numero)
    } else if (inicio || fim) {
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

const listarNaoFiscal = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, inicio, fim } = req.query
    const filtro = { 'nfce.status': { $exists: false } }
    if (status === 'cancelada') filtro.cancelada = true
    if (status === 'concluida') filtro.cancelada = false
    if (inicio || fim) {
      filtro.createdAt = {}
      if (inicio) filtro.createdAt.$gte = new Date(inicio)
      if (fim) filtro.createdAt.$lte = new Date(fim)
    }
    const [vendas, total] = await Promise.all([
      Venda.find(filtro)
        .select('numero total subtotal desconto createdAt cancelada formaPagamento vendedor cliente cpfConsumidor itens')
        .populate('vendedor', 'nome')
        .populate('cliente', 'nome')
        .sort({ createdAt: -1 })
        .skip((Number(page) - 1) * Number(limit))
        .limit(Number(limit)),
      Venda.countDocuments(filtro),
    ])
    const counts = await Venda.aggregate([
      { $match: filtro },
      { $group: { _id: { $cond: ['$cancelada', 'cancelada', 'concluida'] }, total: { $sum: 1 } } },
    ])
    const totaisAgg = await Venda.aggregate([
      { $match: { ...filtro, cancelada: false } },
      { $group: { _id: null, totalValor: { $sum: '$total' } } },
    ])
    const totalValor = totaisAgg[0]?.totalValor || 0
    res.json({ vendas, total, paginas: Math.ceil(total / Number(limit)) || 1, counts, totalValor })
  } catch (error) {
    logger.error('Erro ao listar cupons não fiscais:', error)
    res.status(500).json({ mensagem: 'Erro ao listar cupons não fiscais' })
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

module.exports = { registrar, cancelar, listar, vendasHoje, vendasCliente, listarNaoFiscal }
