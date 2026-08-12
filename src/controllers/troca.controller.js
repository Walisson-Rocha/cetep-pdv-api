const logger = require('../config/logger')
const socket = require('../config/socket')
const Produto = require('../models/Produto')
const Venda = require('../models/Venda')
const Caixa = require('../models/Caixa')
const MovimentoEstoque = require('../models/MovimentoEstoque')
const Lote = require('../models/Lote')
const Troca = require('../models/Troca')
const Log = require('../models/Log')
const Configuracao = require('../models/Configuracao')
const Cliente = require('../models/Cliente')
const Retirada = require('../models/Retirada')
const { incrementosPorForma } = require('../utils/caixaPagamento')

// Formas aceitas quando a loja devolve dinheiro ao cliente (diferença negativa) —
// boleto/colaborador/misto não fazem sentido para uma devolução
const FORMAS_DEVOLUCAO = ['dinheiro', 'pix', 'debito', 'credito', 'fiado']
const FORMAS_MISTO = ['dinheiro', 'pix', 'debito', 'credito', 'fiado', 'boleto']

// Trocas registradas antes da troca multi-item (um item de cada lado só) não têm itensOrigem/
// itensNovos no banco — sintetiza a partir dos campos antigos pra não perder esse histórico
// (senão o item de uma troca antiga parece nunca ter sido trocado, permitindo trocar de novo).
// Só funciona em documentos "lean" (plain object), já que os campos antigos não existem mais
// no schema e o Mongoose descarta paths fora do schema ao hidratar um Document normal.
const normalizarTroca = (t) => {
  if (t.itensOrigem?.length || t.itensNovos?.length) return t
  return {
    ...t,
    itensOrigem: t.itemOrigem ? [{
      itemIndex: t.itemIndex, produto: t.itemOrigem.produto, nomeProduto: t.itemOrigem.nomeProduto,
      quantidade: t.itemOrigem.quantidade, precoUnitario: t.itemOrigem.precoUnitario, subtotal: t.itemOrigem.subtotal,
    }] : [],
    itensNovos: t.itemNovo ? [t.itemNovo] : [],
  }
}

const registrar = async (req, res) => {
  try {
    const {
      vendaId, itens, itensNovos,
      formaPagamentoDiferenca, formasPagamentoDiferenca = [],
      clienteId, colaboradorId, motivo = ''
    } = req.body

    const caixa = await Caixa.findOne({ status: 'aberto' })
    if (!caixa) return res.status(400).json({ mensagem: 'Não há caixa aberto. Solicite ao gerente que abra o caixa.' })

    const venda = await Venda.findById(vendaId)
    if (!venda) return res.status(404).json({ mensagem: 'Venda não encontrada' })
    if (venda.cancelada) return res.status(400).json({ mensagem: 'Não é possível trocar itens de uma venda cancelada' })

    // Agrega por itemIndex (por segurança, caso o mesmo índice venha duplicado)
    const itensAgregados = new Map()
    for (const it of itens) {
      itensAgregados.set(it.itemIndex, (itensAgregados.get(it.itemIndex) || 0) + it.quantidade)
    }

    // Quanto já foi trocado de cada item dessa venda, olhando todas as trocas anteriores
    // (.lean() pra conseguir ler o formato antigo de trocas registradas antes da troca multi-item)
    const trocasAnteriores = await Troca.find({ vendaOrigem: venda._id }).lean()
    const jaTrocadoPorIndex = new Map()
    for (const tRaw of trocasAnteriores) {
      const t = normalizarTroca(tRaw)
      for (const io of t.itensOrigem) {
        jaTrocadoPorIndex.set(io.itemIndex, (jaTrocadoPorIndex.get(io.itemIndex) || 0) + io.quantidade)
      }
    }

    const itensOrigemCompletos = []
    let valorAntigo = 0
    for (const [idx, quantidade] of itensAgregados) {
      const itemOrigem = venda.itens[idx]
      if (!itemOrigem) return res.status(400).json({ mensagem: `Item da venda não encontrado (índice ${idx})` })
      const jaTrocado = jaTrocadoPorIndex.get(idx) || 0
      if (jaTrocado + quantidade > itemOrigem.quantidade) {
        return res.status(400).json({
          mensagem: `Quantidade indisponível para troca de "${itemOrigem.nomeProduto}". Comprado: ${itemOrigem.quantidade}, já trocado: ${jaTrocado}`
        })
      }
      const valorUnitarioAntigo = itemOrigem.subtotal / itemOrigem.quantidade
      const subtotal = Math.round(valorUnitarioAntigo * quantidade * 100) / 100
      valorAntigo += subtotal
      itensOrigemCompletos.push({
        itemIndex: idx,
        produto: itemOrigem.produto,
        nomeProduto: itemOrigem.nomeProduto,
        quantidade,
        precoUnitario: valorUnitarioAntigo,
        subtotal,
      })
    }
    valorAntigo = Math.round(valorAntigo * 100) / 100

    const config = await Configuracao.findOne().lean()
    const permitirEstoqueNegativo = config?.estoqueNegativo ?? false

    // Agrega quantidade por produto (caso o mesmo produto apareça mais de uma vez na lista)
    const novosAgregados = new Map()
    for (const it of itensNovos) {
      const atual = novosAgregados.get(it.produtoId) || { quantidade: 0, precoUnitarioNovo: it.precoUnitarioNovo }
      atual.quantidade += it.quantidade
      novosAgregados.set(it.produtoId, atual)
    }

    const produtosNovosMap = new Map()
    const itensNovosCompletos = []
    let valorNovo = 0
    for (const [produtoId, { quantidade, precoUnitarioNovo }] of novosAgregados) {
      const produtoNovo = await Produto.findById(produtoId)
      if (!produtoNovo || !produtoNovo.ativo) {
        return res.status(400).json({ mensagem: 'Produto novo não encontrado' })
      }
      if (produtoNovo.tipo === 'combo' && !produtoNovo.componentes?.length) {
        return res.status(400).json({ mensagem: `Kit "${produtoNovo.nome}" não tem componentes cadastrados` })
      }
      // Combo/kit não tem estoque próprio — a checagem real é feita mais abaixo, em cima dos componentes
      if (produtoNovo.tipo !== 'combo' && !permitirEstoqueNegativo && produtoNovo.estoque < quantidade) {
        return res.status(400).json({
          mensagem: `Estoque insuficiente para ${produtoNovo.nome}`,
          estoqueDisponivel: produtoNovo.estoque,
          solicitado: quantidade
        })
      }
      let precoNovo = produtoNovo.precoVenda
      if (produtoNovo.precoAtacado > 0 && produtoNovo.quantidadeAtacado > 0 && quantidade >= produtoNovo.quantidadeAtacado) {
        precoNovo = produtoNovo.precoAtacado
      }
      if (precoUnitarioNovo && precoUnitarioNovo > 0) {
        const precoCusto = produtoNovo.precoCusto || 0
        if (precoCusto > 0 && precoUnitarioNovo < precoCusto) {
          return res.status(400).json({
            mensagem: `Preço de venda (R$${precoUnitarioNovo.toFixed(2)}) não pode ser inferior ao custo (R$${precoCusto.toFixed(2)}) para ${produtoNovo.nome}`
          })
        }
        precoNovo = precoUnitarioNovo
      }
      const subtotal = Math.round(precoNovo * quantidade * 100) / 100
      valorNovo += subtotal
      produtosNovosMap.set(produtoId, produtoNovo)
      itensNovosCompletos.push({
        produto: produtoNovo._id,
        nomeProduto: produtoNovo.nome,
        quantidade,
        precoUnitario: precoNovo,
        subtotal,
      })
    }
    valorNovo = Math.round(valorNovo * 100) / 100

    // Combo/kit entre os produtos novos não tem estoque próprio — a baixa e a checagem são
    // feitas em cima dos componentes reais, igual venda.controller.js faz na venda normal
    const idsComponentesNovos = [...produtosNovosMap.values()]
      .filter(p => p.tipo === 'combo')
      .flatMap(p => p.componentes.map(c => c.produto.toString()))
    const componentesNovosMap = new Map()
    if (idsComponentesNovos.length) {
      const componentesReais = await Produto.find({ _id: { $in: idsComponentesNovos } })
      for (const cp of componentesReais) componentesNovosMap.set(cp._id.toString(), cp)
      const idComponenteFaltando = idsComponentesNovos.find(id => !componentesNovosMap.has(id))
      if (idComponenteFaltando) {
        return res.status(400).json({ mensagem: 'Um dos kits selecionados tem um componente que não existe mais. Edite o kit em Estoque antes de trocar.' })
      }
    }
    if (!permitirEstoqueNegativo) {
      // Soma a necessidade de cada componente por todos os kits selecionados de uma vez, pra não
      // deixar dois kits que compartilham um componente passarem cada um isolado e estourar juntos
      const necessidadesNovos = new Map()
      for (const [produtoId, { quantidade }] of novosAgregados) {
        const p = produtosNovosMap.get(produtoId)
        if (p.tipo !== 'combo') continue
        for (const c of p.componentes) {
          const key = c.produto.toString()
          necessidadesNovos.set(key, (necessidadesNovos.get(key) || 0) + c.quantidade * quantidade)
        }
      }
      for (const [compId, necessario] of necessidadesNovos) {
        const compReal = componentesNovosMap.get(compId)
        const jaDireto = novosAgregados.get(compId)?.quantidade || 0
        const totalNecessario = necessario + jaDireto
        if (!compReal || compReal.estoque < totalNecessario) {
          return res.status(400).json({
            mensagem: `Estoque insuficiente de "${compReal?.nome || compId}" para completar o(s) kit(s) selecionado(s)`,
            estoqueDisponivel: compReal?.estoque ?? 0,
            solicitado: totalNecessario
          })
        }
      }
    }

    const diferenca = Math.round((valorNovo - valorAntigo) * 100) / 100

    if (diferenca !== 0 && !formaPagamentoDiferenca) {
      return res.status(400).json({ mensagem: 'Informe a forma de pagamento da diferença' })
    }

    let cliente = null
    let legFiadoMisto = null
    if (diferenca > 0) {
      if (formaPagamentoDiferenca === 'fiado') {
        if (!clienteId) return res.status(400).json({ mensagem: 'Selecione o cliente para pagamento fiado' })
        cliente = await Cliente.findById(clienteId)
        if (!cliente) return res.status(400).json({ mensagem: 'Cliente não encontrado' })
        if (cliente.limiteCredito > 0 && (cliente.saldoFiado + diferenca) > cliente.limiteCredito) {
          const disponivel = Math.max(0, cliente.limiteCredito - cliente.saldoFiado)
          return res.status(400).json({ mensagem: `Limite de crédito excedido. Disponível: R$${disponivel.toFixed(2)}` })
        }
      } else if (formaPagamentoDiferenca === 'colaborador') {
        if (!colaboradorId) return res.status(400).json({ mensagem: 'Selecione o colaborador para descontar a diferença' })
      } else if (formaPagamentoDiferenca === 'misto') {
        const somaMisto = formasPagamentoDiferenca.reduce((s, p) => s + (Number(p.valor) || 0), 0)
        const metodosValidos = formasPagamentoDiferenca.length > 0 && formasPagamentoDiferenca.every(p => FORMAS_MISTO.includes(p.metodo))
        if (!metodosValidos || Math.abs(somaMisto - diferenca) > 0.01) {
          return res.status(400).json({ mensagem: 'As formas de pagamento misto devem somar exatamente a diferença' })
        }
        legFiadoMisto = formasPagamentoDiferenca.find(p => p.metodo === 'fiado') || null
        if (legFiadoMisto) {
          if (!clienteId) return res.status(400).json({ mensagem: 'Selecione o cliente para o valor fiado do pagamento misto' })
          cliente = await Cliente.findById(clienteId)
          if (!cliente) return res.status(400).json({ mensagem: 'Cliente não encontrado' })
          if (cliente.limiteCredito > 0 && (cliente.saldoFiado + legFiadoMisto.valor) > cliente.limiteCredito) {
            const disponivel = Math.max(0, cliente.limiteCredito - cliente.saldoFiado)
            return res.status(400).json({ mensagem: `Limite de crédito excedido. Disponível: R$${disponivel.toFixed(2)}` })
          }
        }
      }
    } else if (diferenca < 0) {
      if (!FORMAS_DEVOLUCAO.includes(formaPagamentoDiferenca)) {
        return res.status(400).json({ mensagem: 'Forma de pagamento inválida para devolução ao cliente' })
      }
      if (formaPagamentoDiferenca === 'fiado') {
        if (!clienteId) return res.status(400).json({ mensagem: 'Selecione o cliente para abater no fiado' })
        cliente = await Cliente.findById(clienteId)
        if (!cliente) return res.status(400).json({ mensagem: 'Cliente não encontrado' })
      }
    }

    // Devolve estoque de cada item de origem — kit/combo devolve pros componentes reais
    // (o produto-combo em si nunca recebe baixa/estorno, é puramente virtual)
    for (const io of itensOrigemCompletos) {
      const produtoOrigem = await Produto.findById(io.produto)
      if (!produtoOrigem) continue
      if (produtoOrigem.tipo === 'combo') {
        for (const c of produtoOrigem.componentes || []) {
          const compReal = await Produto.findById(c.produto)
          if (!compReal) continue
          const qtd = c.quantidade * io.quantidade
          const estoqueAnterior = compReal.estoque
          const estoqueAtual = compReal.estoque + qtd
          await Produto.findByIdAndUpdate(compReal._id, { $inc: { estoque: qtd } })
          await MovimentoEstoque.create({
            produto: compReal._id, tipo: 'entrada',
            quantidade: qtd,
            estoqueAnterior, estoqueAtual,
            motivo: `Troca item venda #${venda.numero} (kit: ${produtoOrigem.nome})`,
            venda: venda._id, responsavel: req.user._id
          })
        }
        continue
      }
      const estoqueAnterior = produtoOrigem.estoque
      const estoqueAtual = produtoOrigem.estoque + io.quantidade
      await Produto.findByIdAndUpdate(produtoOrigem._id, { $inc: { estoque: io.quantidade } })
      await MovimentoEstoque.create({
        produto: produtoOrigem._id, tipo: 'entrada',
        quantidade: io.quantidade,
        estoqueAnterior, estoqueAtual,
        motivo: `Troca item venda #${venda.numero}`,
        venda: venda._id, responsavel: req.user._id
      })
    }

    // Debita estoque de cada item novo — achata em linhas sobre produtos reais, expandindo
    // kit/combo pros seus componentes (mesmo princípio de venda.controller.js na venda normal)
    const linhasDebito = []
    for (const inv of itensNovosCompletos) {
      const produtoNovo = produtosNovosMap.get(inv.produto.toString())
      if (produtoNovo.tipo === 'combo') {
        for (const c of produtoNovo.componentes) {
          linhasDebito.push({ produto: componentesNovosMap.get(c.produto.toString()), quantidade: c.quantidade * inv.quantidade, kitNome: produtoNovo.nome })
        }
      } else {
        linhasDebito.push({ produto: produtoNovo, quantidade: inv.quantidade, kitNome: null })
      }
    }
    for (const linha of linhasDebito) {
      const produto = linha.produto
      const estoqueAnteriorNovo = produto.estoque
      const estoqueAtualNovo = produto.estoque - linha.quantidade
      produto.estoque = estoqueAtualNovo
      await Produto.findByIdAndUpdate(produto._id, { $inc: { estoque: -linha.quantidade } })
      await MovimentoEstoque.create({
        produto: produto._id, tipo: 'saida',
        quantidade: linha.quantidade,
        estoqueAnterior: estoqueAnteriorNovo, estoqueAtual: estoqueAtualNovo,
        motivo: linha.kitNome ? `Troca item venda #${venda.numero} (kit: ${linha.kitNome})` : `Troca item venda #${venda.numero}`,
        venda: venda._id, responsavel: req.user._id
      })
      const lotes = await Lote.find({ produto: produto._id, ativo: true, quantidade: { $gt: 0 } }).sort({ dataValidade: 1 })
      if (lotes.length > 0) {
        let restante = linha.quantidade
        for (const lote of lotes) {
          if (restante <= 0) break
          const deduzir = Math.min(lote.quantidade, restante)
          lote.quantidade -= deduzir
          if (lote.quantidade === 0) lote.ativo = false
          await lote.save()
          restante -= deduzir
        }
      }
    }

    const troca = await Troca.create({
      vendaOrigem: venda._id,
      itensOrigem: itensOrigemCompletos,
      itensNovos: itensNovosCompletos,
      valorAntigo,
      valorNovo,
      diferenca,
      formaPagamentoDiferenca: diferenca !== 0 ? formaPagamentoDiferenca : null,
      formasPagamentoDiferenca: formaPagamentoDiferenca === 'misto' ? formasPagamentoDiferenca : [],
      cliente: cliente?._id || null,
      colaborador: formaPagamentoDiferenca === 'colaborador' ? colaboradorId : null,
      caixa: caixa._id,
      responsavel: req.user._id,
      motivo
    })

    // Efeitos da forma de pagamento da diferença
    if (diferenca > 0 && formaPagamentoDiferenca === 'fiado' && cliente) {
      await Cliente.findByIdAndUpdate(cliente._id, { $inc: { saldoFiado: diferenca } })
    } else if (diferenca > 0 && formaPagamentoDiferenca === 'misto' && legFiadoMisto && cliente) {
      await Cliente.findByIdAndUpdate(cliente._id, { $inc: { saldoFiado: legFiadoMisto.valor } })
    } else if (diferenca < 0 && formaPagamentoDiferenca === 'fiado' && cliente) {
      const abatimento = Math.min(cliente.saldoFiado, Math.abs(diferenca))
      await Cliente.findByIdAndUpdate(cliente._id, { $inc: { saldoFiado: -abatimento } })
    }

    if (diferenca > 0 && formaPagamentoDiferenca === 'colaborador' && colaboradorId) {
      const agora = new Date()
      const mes = parseInt(`${agora.getFullYear()}${String(agora.getMonth() + 1).padStart(2, '0')}`)
      await Retirada.create({
        colaborador: colaboradorId,
        itens: [{
          produto: itensNovosCompletos[0].produto,
          nomeProduto: `Diferença troca venda #${venda.numero}`,
          quantidade: 1,
          precoUnitario: diferenca,
          subtotal: diferenca,
        }],
        total: diferenca,
        mes,
        observacao: `Troca venda #${venda.numero} — PDV`,
        registradaPor: req.user._id,
        vendaOrigem: venda._id,
      })
    }

    // Além de totalTrocas (usado no saldo geral do caixa), a diferença também entra no total
    // do método de pagamento real (dinheiro/pix/etc) — senão a conferência por forma de
    // pagamento nunca reflete o dinheiro/pix que efetivamente entrou ou saiu numa troca
    const incPagamentoDiferenca = diferenca !== 0
      ? incrementosPorForma(formaPagamentoDiferenca, formasPagamentoDiferenca, Math.abs(diferenca), diferenca > 0 ? 1 : -1)
      : {}
    await Caixa.findByIdAndUpdate(caixa._id, {
      $push: {
        trocas: {
          troca: troca._id,
          diferenca,
          formaPagamento: diferenca !== 0 ? formaPagamentoDiferenca : null,
          registradoPor: req.user._id
        }
      },
      $inc: { totalTrocas: diferenca, ...incPagamentoDiferenca }
    })

    await Log.create({
      usuario: req.user._id, nomeUsuario: req.user.nome,
      acao: 'troca_realizada',
      detalhes: `Troca na venda #${venda.numero}: ${itensOrigemCompletos.map(i => `${i.quantidade}x ${i.nomeProduto}`).join(', ')} → ${itensNovosCompletos.map(i => `${i.quantidade}x ${i.nomeProduto}`).join(', ')} (diferença R$${diferenca.toFixed(2)})`,
      referencia: troca._id
    })

    const trocaPopulada = await Troca.findById(troca._id)
      .populate('vendaOrigem', 'numero')
      .populate('responsavel', 'nome')
      .populate('cliente', 'nome')
      .populate('colaborador', 'nome')

    socket.emit('troca:realizada', {
      vendaNumero: venda.numero, diferenca,
      responsavel: req.user.nome
    })

    res.status(201).json({ troca: trocaPopulada, mensagem: 'Troca registrada com sucesso' })
  } catch (error) {
    logger.error('Erro ao registrar troca:', error)
    res.status(500).json({ mensagem: 'Erro ao registrar troca' })
  }
}

const listar = async (req, res) => {
  try {
    const { inicio, fim, vendaOrigem, numero, page = 1, limit = 20 } = req.query
    const filtro = {}
    if (vendaOrigem) {
      filtro.vendaOrigem = vendaOrigem
    } else if (numero) {
      const venda = await Venda.findOne({ numero: Number(numero) }).select('_id')
      filtro.vendaOrigem = venda ? venda._id : null
    }
    if (!vendaOrigem && !numero && (inicio || fim)) {
      filtro.createdAt = {}
      if (inicio) filtro.createdAt.$gte = new Date(inicio)
      if (fim) filtro.createdAt.$lte = new Date(fim)
    }
    const trocas = await Troca.find(filtro)
      .populate('vendaOrigem', 'numero')
      .populate('responsavel', 'nome')
      .populate('cliente', 'nome')
      .populate('colaborador', 'nome')
      .populate('caixa', 'abertoEm')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .lean()
    const total = await Troca.countDocuments(filtro)
    res.json({ trocas: trocas.map(normalizarTroca), total, paginas: Math.ceil(total / limit) })
  } catch (error) {
    logger.error('Erro ao listar trocas:', error)
    res.status(500).json({ mensagem: 'Erro ao listar trocas' })
  }
}

module.exports = { registrar, listar }
