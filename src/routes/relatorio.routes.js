const logger = require('../config/logger')
const express = require('express')
const router = express.Router()
const Venda = require('../models/Venda')
const Troca = require('../models/Troca')
const Produto = require('../models/Produto')
const Log = require('../models/Log')
const Configuracao = require('../models/Configuracao')
const Cliente = require('../models/Cliente')
const Retirada = require('../models/Retirada')
const User = require('../models/User')
const Despesa = require('../models/Despesa')
const { protect, authorize } = require('../middleware/auth.middleware')

router.use(protect)

router.get('/vendas', authorize('admin', 'gerente'), async (req, res) => {
  try {
    const { inicio, fim } = req.query
    const filtro = { cancelada: false }
    if (inicio) filtro.createdAt = { $gte: new Date(inicio) }
    if (fim) filtro.createdAt = { ...filtro.createdAt, $lte: new Date(fim) }
    // Mesmo filtro de data pras trocas — elas também mexem no caixa (diferença
    // paga entra, devolução ao cliente sai), então precisam entrar aqui também
    // pra "total" e "por categoria" baterem com o que o caixa realmente soma.
    const filtroTroca = {}
    if (inicio) filtroTroca.createdAt = { $gte: new Date(inicio) }
    if (fim) filtroTroca.createdAt = { ...filtroTroca.createdAt, $lte: new Date(fim) }
    const [vendas, trocas, config] = await Promise.all([
      Venda.find(filtro)
        .populate('vendedor', 'nome comissao')
        .populate({ path: 'itens.produto', select: 'categoria', populate: { path: 'categoria', select: 'nome icone' } })
        .sort({ createdAt: -1 }),
      Troca.find(filtroTroca)
        .populate('vendedor', 'nome')
        .populate({ path: 'itensNovos.produto', select: 'categoria', populate: { path: 'categoria', select: 'nome icone' } })
        .populate({ path: 'itensDevolvidos.produto', select: 'categoria', populate: { path: 'categoria', select: 'nome icone' } }),
      Configuracao.findOne().lean()
    ])
    const comissaoAtiva = config?.comissao?.ativa ?? false
    let total = vendas.reduce((acc, v) => acc + v.total, 0)
    // Pagamento "misto" não pode ir inteiro pro balde genérico "misto" — quebra pelas
    // formas reais (formasPagamento[]), senão o valor recebido em pix/dinheiro/cartão
    // dentro de um misto nunca aparece nas formas individuais (só bate por coincidência
    // quando não existe nenhum misto no período).
    const porForma = {}
    vendas.forEach(v => {
      if (v.formaPagamento === 'misto' && Array.isArray(v.formasPagamento) && v.formasPagamento.length > 0) {
        v.formasPagamento.forEach(p => {
          if (p.metodo && p.valor) porForma[p.metodo] = (porForma[p.metodo] || 0) + p.valor
        })
      } else {
        porForma[v.formaPagamento] = (porForma[v.formaPagamento] || 0) + v.total
      }
    })
    const porVendedor = {}
    const porCategoria = {}
    const porCategoriaDetalhe = {}
    vendas.forEach(v => {
      const nome = v.vendedor?.nome || 'Sem nome'
      const comissaoPct = comissaoAtiva ? (v.vendedor?.comissao ?? 0) : 0
      if (!porVendedor[nome]) porVendedor[nome] = { total: 0, quantidade: 0, comissaoPct, comissaoValor: 0 }
      porVendedor[nome].total += v.total
      porVendedor[nome].quantidade++
      porVendedor[nome].comissaoValor = parseFloat((porVendedor[nome].total * comissaoPct / 100).toFixed(2))
      // O desconto geral do carrinho (v.desconto) não é gravado por item — item.subtotal
      // é sempre pré-desconto-geral. Sem isso, a soma por categoria fica maior que
      // v.total (e maior que o que entra no caixa) em toda venda com desconto geral.
      const fatorDesconto = v.subtotal > 0 ? v.total / v.subtotal : 1
      v.itens.forEach(item => {
        const cat = item.produto?.categoria
        const catNome = cat?.nome || 'Sem categoria'
        const valorLiquido = (item.subtotal || 0) * fatorDesconto
        if (!porCategoria[catNome]) porCategoria[catNome] = { total: 0, quantidade: 0, icone: cat?.icone || '📦' }
        porCategoria[catNome].total += valorLiquido
        porCategoria[catNome].quantidade += item.quantidade || 0
        // detalhe por produto dentro de cada categoria
        if (!porCategoriaDetalhe[catNome]) porCategoriaDetalhe[catNome] = {}
        const prodNome = item.nomeProduto || 'Produto'
        if (!porCategoriaDetalhe[catNome][prodNome]) porCategoriaDetalhe[catNome][prodNome] = { quantidade: 0, total: 0 }
        porCategoriaDetalhe[catNome][prodNome].quantidade += item.quantidade || 0
        porCategoriaDetalhe[catNome][prodNome].total += valorLiquido
      })
    })

    // Trocas entram aqui do mesmo jeito que entram no caixa: item novo soma na
    // categoria (é uma venda de fato), item devolvido subtrai (estorna a receita
    // que a venda original já tinha contado) — a soma líquida é sempre a diferença,
    // igual ao que troca.controller.js aplica no totalVendas do caixa.
    trocas.forEach(t => {
      total += t.diferenca
      const nome = t.vendedor?.nome || 'Sem nome'
      if (!porVendedor[nome]) porVendedor[nome] = { total: 0, quantidade: 0, comissaoPct: 0, comissaoValor: 0 }
      porVendedor[nome].total += t.diferenca
      if (t.diferenca > 0 && t.formaPagamentoDiferenca) {
        porForma[t.formaPagamentoDiferenca] = (porForma[t.formaPagamentoDiferenca] || 0) + t.diferenca
      }
      // Trocas antigas (registradas antes de itensDevolvidos existir no schema) podem
      // não ter esses arrays gravados — || [] evita que uma delas derrube o relatório
      // inteiro com um erro 500 assim que a data selecionada incluir esse registro.
      ;(t.itensNovos || []).forEach(item => {
        const cat = item.produto?.categoria
        const catNome = cat?.nome || 'Sem categoria'
        if (!porCategoria[catNome]) porCategoria[catNome] = { total: 0, quantidade: 0, icone: cat?.icone || '📦' }
        porCategoria[catNome].total += item.subtotal || 0
        porCategoria[catNome].quantidade += item.quantidade || 0
        if (!porCategoriaDetalhe[catNome]) porCategoriaDetalhe[catNome] = {}
        const prodNome = item.nomeProduto || 'Produto'
        if (!porCategoriaDetalhe[catNome][prodNome]) porCategoriaDetalhe[catNome][prodNome] = { quantidade: 0, total: 0 }
        porCategoriaDetalhe[catNome][prodNome].quantidade += item.quantidade || 0
        porCategoriaDetalhe[catNome][prodNome].total += item.subtotal || 0
      })
      ;(t.itensDevolvidos || []).forEach(item => {
        const cat = item.produto?.categoria
        const catNome = cat?.nome || 'Sem categoria'
        if (!porCategoria[catNome]) porCategoria[catNome] = { total: 0, quantidade: 0, icone: cat?.icone || '📦' }
        porCategoria[catNome].total -= item.subtotal || 0
        porCategoria[catNome].quantidade -= item.quantidade || 0
        if (!porCategoriaDetalhe[catNome]) porCategoriaDetalhe[catNome] = {}
        const prodNome = item.nomeProduto || 'Produto'
        if (!porCategoriaDetalhe[catNome][prodNome]) porCategoriaDetalhe[catNome][prodNome] = { quantidade: 0, total: 0 }
        porCategoriaDetalhe[catNome][prodNome].quantidade -= item.quantidade || 0
        porCategoriaDetalhe[catNome][prodNome].total -= item.subtotal || 0
      })
    })

    res.json({ total, quantidade: vendas.length, porFormaPagamento: porForma, porVendedor, porCategoria, porCategoriaDetalhe, comissaoAtiva })
  } catch (error) {
    logger.error('Erro ao gerar relatório de vendas:', error)
    res.status(500).json({ mensagem: 'Erro ao gerar relatório de vendas' })
  }
})

router.get('/clientes', authorize('admin', 'gerente'), async (req, res) => {
  try {
    const { inicio, fim } = req.query
    const filtro = { cancelada: false }
    if (inicio) filtro.createdAt = { $gte: new Date(inicio) }
    if (fim) filtro.createdAt = { ...filtro.createdAt, $lte: new Date(fim) }

    const [vendas, clientes] = await Promise.all([
      Venda.find({ ...filtro, cliente: { $exists: true, $ne: null } })
        .select('cliente total createdAt')
        .lean(),
      Cliente.find({ ativo: true }).lean(),
    ])

    const porCliente = {}
    vendas.forEach(v => {
      const id = v.cliente?.toString()
      if (!id) return
      if (!porCliente[id]) porCliente[id] = { totalGasto: 0, qtdCompras: 0, ultimaCompra: null }
      porCliente[id].totalGasto += v.total
      porCliente[id].qtdCompras++
      if (!porCliente[id].ultimaCompra || v.createdAt > porCliente[id].ultimaCompra) {
        porCliente[id].ultimaCompra = v.createdAt
      }
    })

    const DIAS_INATIVO = 60
    const agora = new Date()
    const resultado = clientes.map(c => {
      const stats = porCliente[c._id.toString()] || { totalGasto: 0, qtdCompras: 0, ultimaCompra: null }
      const diasSemComprar = stats.ultimaCompra
        ? Math.floor((agora.getTime() - new Date(stats.ultimaCompra).getTime()) / (1000 * 60 * 60 * 24))
        : null
      return {
        _id: c._id,
        nome: c.nome,
        telefone: c.whatsapp || c.telefone || '',
        saldoFiado: c.saldoFiado,
        pontos: c.pontos,
        totalGasto: parseFloat(stats.totalGasto.toFixed(2)),
        qtdCompras: stats.qtdCompras,
        ultimaCompra: stats.ultimaCompra,
        diasSemComprar,
        inativo: diasSemComprar !== null ? diasSemComprar >= DIAS_INATIVO : stats.qtdCompras === 0,
        ticketMedio: stats.qtdCompras > 0 ? parseFloat((stats.totalGasto / stats.qtdCompras).toFixed(2)) : 0,
      }
    })

    const topCompradores = [...resultado].sort((a, b) => b.totalGasto - a.totalGasto).slice(0, 20)
    const inativos = resultado.filter(c => c.inativo).sort((a, b) => (b.diasSemComprar ?? 999) - (a.diasSemComprar ?? 999))
    const semCompras = resultado.filter(c => c.qtdCompras === 0).length
    const totalClientes = clientes.length
    const totalGastoGeral = resultado.reduce((s, c) => s + c.totalGasto, 0)

    res.json({ topCompradores, inativos, totalClientes, totalGastoGeral: parseFloat(totalGastoGeral.toFixed(2)), semCompras })
  } catch (error) {
    logger.error('Erro ao gerar relatório de clientes:', error)
    res.status(500).json({ mensagem: 'Erro ao gerar relatório de clientes' })
  }
})

router.get('/logs', authorize('admin', 'gerente'), async (req, res) => {
  try {
    const { page = 1, limit = 50, inicio, fim } = req.query
    // Sem isso, o card "Logs registrados" nunca respeitava o filtro de data da
    // tela — sempre voltava os últimos 50 logs de todo o histórico.
    const filtro = {}
    if (inicio) filtro.createdAt = { $gte: new Date(inicio) }
    if (fim) filtro.createdAt = { ...(filtro.createdAt || {}), $lte: new Date(fim) }
    const logs = await Log.find(filtro)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
    const total = await Log.countDocuments(filtro)
    res.json({ logs, total, paginas: Math.ceil(total / limit) })
  } catch (error) {
    logger.error('Erro ao buscar logs:', error)
    res.status(500).json({ mensagem: 'Erro ao buscar logs' })
  }
})

router.get('/lucratividade', authorize('admin', 'gerente'), async (req, res) => {
  try {
    const { inicio, fim } = req.query
    const filtro = { cancelada: false }
    if (inicio) filtro.createdAt = { $gte: new Date(inicio) }
    if (fim) filtro.createdAt = { ...filtro.createdAt, $lte: new Date(fim) }

    const vendas = await Venda.find(filtro)
      .populate({ path: 'itens.produto', select: 'precoCusto categoria', populate: { path: 'categoria', select: 'nome icone' } })
      .lean()

    const porProduto = {}
    const porCategoria = {}

    vendas.forEach(v => {
      // item.subtotal é pré-desconto-geral do carrinho — sem isso a receita fica
      // inflada (e o lucro/margem também) em toda venda com desconto geral aplicado.
      const fatorDesconto = v.subtotal > 0 ? v.total / v.subtotal : 1
      v.itens.forEach(item => {
        const nome = item.nomeProduto || 'Produto'
        const receita = (item.subtotal || 0) * fatorDesconto
        const precoCusto = item.produto?.precoCusto || 0
        const custo = precoCusto * (item.quantidade || 0)
        const lucro = receita - custo
        const cat = item.produto?.categoria
        const catNome = cat?.nome || 'Sem categoria'
        const catIcone = cat?.icone || '📦'

        if (!porProduto[nome]) porProduto[nome] = { nome, quantidade: 0, receita: 0, custo: 0, lucro: 0, categoria: catNome }
        porProduto[nome].quantidade += item.quantidade || 0
        porProduto[nome].receita += receita
        porProduto[nome].custo += custo
        porProduto[nome].lucro += lucro

        if (!porCategoria[catNome]) porCategoria[catNome] = { nome: catNome, icone: catIcone, quantidade: 0, receita: 0, custo: 0, lucro: 0 }
        porCategoria[catNome].quantidade += item.quantidade || 0
        porCategoria[catNome].receita += receita
        porCategoria[catNome].custo += custo
        porCategoria[catNome].lucro += lucro
      })
    })

    const produtos = Object.values(porProduto).map(p => ({
      ...p,
      receita: parseFloat(p.receita.toFixed(2)),
      custo: parseFloat(p.custo.toFixed(2)),
      lucro: parseFloat(p.lucro.toFixed(2)),
      margem: p.receita > 0 ? parseFloat(((p.lucro / p.receita) * 100).toFixed(1)) : 0,
    })).sort((a, b) => b.lucro - a.lucro)

    const categorias = Object.values(porCategoria).map(c => ({
      ...c,
      receita: parseFloat(c.receita.toFixed(2)),
      custo: parseFloat(c.custo.toFixed(2)),
      lucro: parseFloat(c.lucro.toFixed(2)),
      margem: c.receita > 0 ? parseFloat(((c.lucro / c.receita) * 100).toFixed(1)) : 0,
    })).sort((a, b) => b.lucro - a.lucro)

    const totalReceita = parseFloat(produtos.reduce((s, p) => s + p.receita, 0).toFixed(2))
    const totalCusto = parseFloat(produtos.reduce((s, p) => s + p.custo, 0).toFixed(2))
    const totalLucro = parseFloat(produtos.reduce((s, p) => s + p.lucro, 0).toFixed(2))
    const margemGeral = totalReceita > 0 ? parseFloat(((totalLucro / totalReceita) * 100).toFixed(1)) : 0

    res.json({ produtos, categorias, totalReceita, totalCusto, totalLucro, margemGeral })
  } catch (error) {
    logger.error('Erro ao gerar relatório de lucratividade:', error)
    res.status(500).json({ mensagem: 'Erro ao gerar relatório' })
  }
})

router.get('/produtos-parados', authorize('admin', 'gerente'), async (req, res) => {
  try {
    const trintaDiasAtras = new Date()
    trintaDiasAtras.setDate(trintaDiasAtras.getDate() - 30)
    const [vendidos, todos] = await Promise.all([
      Venda.find({ createdAt: { $gte: trintaDiasAtras }, cancelada: false }),
      Produto.find({ ativo: true }).populate('categoria', 'nome')
    ])
    const idsVendidos = new Set(vendidos.flatMap(v => v.itens.map(i => i.produto.toString())))
    const parados = todos.filter(p => !idsVendidos.has(p._id.toString()))
    res.json({ parados })
  } catch (error) {
    logger.error('Erro ao buscar produtos parados:', error)
    res.status(500).json({ mensagem: 'Erro ao buscar produtos parados' })
  }
})

router.get('/consumo-colaborador', authorize('admin', 'gerente'), async (req, res) => {
  try {
    const { colaboradorId, inicio, fim } = req.query
    const colaboradores = await User.find({ ativo: true }, 'nome email').sort({ nome: 1 })
    if (!colaboradorId) {
      return res.json({ colaboradores, retiradas: [], itens: [], totais: { totalValor: 0, totalItens: 0, qtdRetiradas: 0 } })
    }
    const filtro = { colaborador: colaboradorId }
    if (inicio) filtro.createdAt = { $gte: new Date(inicio) }
    if (fim) filtro.createdAt = { ...(filtro.createdAt || {}), $lte: new Date(new Date(fim).setHours(23, 59, 59, 999)) }
    const retiradas = await Retirada.find(filtro)
      .populate('colaborador', 'nome email')
      .populate('registradaPor', 'nome')
      .sort({ createdAt: -1 })
    const porProduto = {}
    retiradas.forEach(r => {
      r.itens.forEach(item => {
        const nome = item.nomeProduto || 'Produto'
        if (!porProduto[nome]) porProduto[nome] = { nome, quantidade: 0, valor: 0 }
        porProduto[nome].quantidade += item.quantidade
        porProduto[nome].valor += item.subtotal || 0
      })
    })
    const itens = Object.values(porProduto).sort((a, b) => b.valor - a.valor)
    const totalValor = parseFloat(retiradas.reduce((s, r) => s + r.total, 0).toFixed(2))
    const totalItens = retiradas.reduce((s, r) => s + r.itens.reduce((q, i) => q + i.quantidade, 0), 0)
    const colaborador = colaboradores.find(c => c._id.toString() === colaboradorId) || null
    res.json({ colaboradores, colaborador, retiradas, itens, totais: { totalValor, totalItens, qtdRetiradas: retiradas.length } })
  } catch (error) {
    logger.error('Erro ao gerar relatório de consumo:', error)
    res.status(500).json({ mensagem: 'Erro ao gerar relatório de consumo' })
  }
})

router.get('/consumo-todos-colaboradores', authorize('admin', 'gerente'), async (req, res) => {
  try {
    const { inicio, fim } = req.query
    const filtro = {}
    if (inicio) filtro.createdAt = { $gte: new Date(inicio) }
    if (fim) filtro.createdAt = { ...(filtro.createdAt || {}), $lte: new Date(new Date(fim).setHours(23, 59, 59, 999)) }

    const [colaboradores, retiradas] = await Promise.all([
      User.find({ ativo: true }, 'nome email').sort({ nome: 1 }),
      Retirada.find(filtro).populate('colaborador', 'nome email').lean(),
    ])

    const porColab = {}
    retiradas.forEach(r => {
      const id = r.colaborador?._id?.toString()
      if (!id) return
      if (!porColab[id]) porColab[id] = { colaborador: r.colaborador, totalValor: 0, totalItens: 0, qtdRetiradas: 0, itens: {} }
      porColab[id].totalValor += r.total
      porColab[id].qtdRetiradas++
      r.itens.forEach(item => {
        porColab[id].totalItens += item.quantidade
        const nome = item.nomeProduto || 'Produto'
        if (!porColab[id].itens[nome]) porColab[id].itens[nome] = { nome, quantidade: 0, valor: 0 }
        porColab[id].itens[nome].quantidade += item.quantidade
        porColab[id].itens[nome].valor += item.subtotal || 0
      })
    })

    const resultado = colaboradores.map(col => {
      const dados = porColab[col._id.toString()] || { totalValor: 0, totalItens: 0, qtdRetiradas: 0, itens: {} }
      return {
        colaborador: { _id: col._id, nome: col.nome, email: col.email },
        totalValor: parseFloat((dados.totalValor || 0).toFixed(2)),
        totalItens: dados.totalItens || 0,
        qtdRetiradas: dados.qtdRetiradas || 0,
        itensList: Object.values(dados.itens || {}).sort((a, b) => b.valor - a.valor),
      }
    }).sort((a, b) => b.totalValor - a.totalValor)

    const totalGeral = parseFloat(resultado.reduce((s, c) => s + c.totalValor, 0).toFixed(2))
    res.json({ colaboradores: resultado, totalGeral, periodoInicio: inicio || null, periodoFim: fim || null })
  } catch (error) {
    logger.error('Erro ao gerar consumo em massa:', error)
    res.status(500).json({ mensagem: 'Erro ao gerar relatório' })
  }
})

router.get('/categorias-por-vendedor', authorize('admin', 'gerente'), async (req, res) => {
  try {
    const { inicio, fim } = req.query
    const filtro = { cancelada: false }
    if (inicio) filtro.createdAt = { $gte: new Date(inicio) }
    if (fim) filtro.createdAt = { ...(filtro.createdAt || {}), $lte: new Date(new Date(fim).setHours(23, 59, 59, 999)) }
    const [vendas, trocas] = await Promise.all([
      Venda.find(filtro)
        .populate('vendedor', 'nome')
        .populate({ path: 'itens.produto', select: 'categoria', populate: { path: 'categoria', select: 'nome icone' } })
        .sort({ createdAt: -1 }),
      Troca.find(filtro.createdAt ? { createdAt: filtro.createdAt } : {})
        .populate('vendedor', 'nome')
        .populate({ path: 'itensNovos.produto', select: 'categoria', populate: { path: 'categoria', select: 'nome icone' } })
        .populate({ path: 'itensDevolvidos.produto', select: 'categoria', populate: { path: 'categoria', select: 'nome icone' } }),
    ])
    const porVendedorCategoria = {}
    vendas.forEach(v => {
      const vendNome = v.vendedor?.nome || 'Sem vendedor'
      if (!porVendedorCategoria[vendNome]) porVendedorCategoria[vendNome] = {}
      // Mesmo ajuste do /vendas — item.subtotal é pré-desconto-geral do carrinho.
      const fatorDesconto = v.subtotal > 0 ? v.total / v.subtotal : 1
      v.itens.forEach(item => {
        const cat = item.produto?.categoria
        const catNome = cat?.nome || 'Sem categoria'
        const catIcone = cat?.icone || '📦'
        if (!porVendedorCategoria[vendNome][catNome])
          porVendedorCategoria[vendNome][catNome] = { nome: catNome, icone: catIcone, total: 0, quantidade: 0 }
        porVendedorCategoria[vendNome][catNome].total += (item.subtotal || 0) * fatorDesconto
        porVendedorCategoria[vendNome][catNome].quantidade += item.quantidade || 0
      })
    })
    // Trocas somam/subtraem igual no /vendas — item novo é receita da categoria,
    // item devolvido estorna a receita que a venda original já tinha contado.
    trocas.forEach(t => {
      const vendNome = t.vendedor?.nome || 'Sem vendedor'
      if (!porVendedorCategoria[vendNome]) porVendedorCategoria[vendNome] = {}
      // || [] — mesma proteção contra trocas antigas sem itensDevolvidos gravado.
      ;(t.itensNovos || []).forEach(item => {
        const cat = item.produto?.categoria
        const catNome = cat?.nome || 'Sem categoria'
        const catIcone = cat?.icone || '📦'
        if (!porVendedorCategoria[vendNome][catNome])
          porVendedorCategoria[vendNome][catNome] = { nome: catNome, icone: catIcone, total: 0, quantidade: 0 }
        porVendedorCategoria[vendNome][catNome].total += item.subtotal || 0
        porVendedorCategoria[vendNome][catNome].quantidade += item.quantidade || 0
      })
      ;(t.itensDevolvidos || []).forEach(item => {
        const cat = item.produto?.categoria
        const catNome = cat?.nome || 'Sem categoria'
        const catIcone = cat?.icone || '📦'
        if (!porVendedorCategoria[vendNome][catNome])
          porVendedorCategoria[vendNome][catNome] = { nome: catNome, icone: catIcone, total: 0, quantidade: 0 }
        porVendedorCategoria[vendNome][catNome].total -= item.subtotal || 0
        porVendedorCategoria[vendNome][catNome].quantidade -= item.quantidade || 0
      })
    })
    const vendedores = Object.entries(porVendedorCategoria).map(([nome, cats]) => ({
      nome,
      categorias: Object.values(cats).sort((a, b) => b.total - a.total).map(c => ({
        ...c,
        total: parseFloat(c.total.toFixed(2)),
      })),
      totalGeral: parseFloat(Object.values(cats).reduce((s, c) => s + c.total, 0).toFixed(2)),
    })).sort((a, b) => b.totalGeral - a.totalGeral)
    res.json({ vendedores, totalVendas: vendas.length })
  } catch (error) {
    logger.error('Erro ao gerar relatório categorias por vendedor:', error)
    res.status(500).json({ mensagem: 'Erro ao gerar relatório' })
  }
})

router.get('/estoque-giro', authorize('admin', 'gerente'), async (req, res) => {
  try {
    const { dias = 30 } = req.query
    const diasNum = Math.min(Math.max(parseInt(dias) || 30, 7), 365)
    const inicio = new Date()
    inicio.setDate(inicio.getDate() - diasNum)
    const [produtos, vendas] = await Promise.all([
      Produto.find({ ativo: true }).populate('categoria', 'nome icone').lean(),
      Venda.find({ createdAt: { $gte: inicio }, cancelada: false }).lean()
    ])
    const vendidoPorProduto = {}
    vendas.forEach(v => {
      // item.subtotal é pré-desconto-geral do carrinho — corrige pra receita bater com o total real da venda.
      const fatorDesconto = v.subtotal > 0 ? v.total / v.subtotal : 1
      v.itens.forEach(item => {
        const id = item.produto.toString()
        if (!vendidoPorProduto[id]) vendidoPorProduto[id] = { quantidade: 0, receita: 0 }
        vendidoPorProduto[id].quantidade += item.quantidade
        vendidoPorProduto[id].receita += (item.subtotal || 0) * fatorDesconto
      })
    })
    const resultado = produtos.map(p => {
      const vendido = vendidoPorProduto[p._id.toString()] || { quantidade: 0, receita: 0 }
      const giroDiario = parseFloat((vendido.quantidade / diasNum).toFixed(3))
      const coberturaDias = giroDiario > 0 ? Math.floor(p.estoque / giroDiario) : null
      const status = coberturaDias === null ? 'parado' : coberturaDias <= 7 ? 'critico' : coberturaDias <= 30 ? 'baixo' : 'ok'
      return {
        _id: p._id, nome: p.nome, categoria: p.categoria,
        estoque: p.estoque, unidade: p.unidade,
        qtdVendida: vendido.quantidade,
        receita: parseFloat(vendido.receita.toFixed(2)),
        giroDiario, coberturaDias, status
      }
    }).sort((a, b) => b.qtdVendida - a.qtdVendida)
    const parados = resultado.filter(p => p.status === 'parado').length
    const criticos = resultado.filter(p => p.status === 'critico').length
    const baixos = resultado.filter(p => p.status === 'baixo').length
    res.json({ produtos: resultado, totalProdutos: resultado.length, parados, criticos, baixos, perioDias: diasNum })
  } catch (error) {
    logger.error('Erro ao gerar relatório de giro de estoque:', error)
    res.status(500).json({ mensagem: 'Erro ao gerar relatório de giro de estoque' })
  }
})

router.get('/dre', authorize('admin', 'gerente'), async (req, res) => {
  try {
    const { inicio, fim } = req.query
    const filtroVenda = { cancelada: false }
    const filtroCancelada = { cancelada: true }
    const filtroDespesa = {}
    if (inicio) {
      filtroVenda.createdAt = { $gte: new Date(inicio) }
      filtroCancelada.createdAt = { $gte: new Date(inicio) }
      filtroDespesa.createdAt = { $gte: new Date(inicio) }
    }
    if (fim) {
      const fimDate = new Date(new Date(fim).setHours(23, 59, 59, 999))
      filtroVenda.createdAt = { ...(filtroVenda.createdAt || {}), $lte: fimDate }
      filtroCancelada.createdAt = { ...(filtroCancelada.createdAt || {}), $lte: fimDate }
      filtroDespesa.createdAt = { ...(filtroDespesa.createdAt || {}), $lte: fimDate }
    }
    const [vendas, canceladas, despesas, config, trocas] = await Promise.all([
      Venda.find(filtroVenda)
        .populate({ path: 'itens.produto', select: 'precoCusto' })
        .populate('vendedor', 'nome comissao')
        .lean(),
      Venda.find(filtroCancelada).lean(),
      Despesa.find(filtroDespesa).lean(),
      Configuracao.findOne().lean(),
      // Trocas também afetam a receita bruta (diferença paga soma, devolução ao
      // cliente subtrai) — sem isso o DRE nunca bate com o caixa/relatório de vendas.
      Troca.find(inicio || fim ? { createdAt: filtroVenda.createdAt } : {}).select('diferenca').lean(),
    ])
    const receitaBruta = vendas.reduce((s, v) => s + v.total, 0) + trocas.reduce((s, t) => s + t.diferenca, 0)
    const descontos = vendas.reduce((s, v) => s + (v.desconto || 0), 0)
    const devolucoes = canceladas.reduce((s, v) => s + v.total, 0)
    const receitaLiquida = receitaBruta - devolucoes
    let cmv = 0
    vendas.forEach(v => {
      v.itens.forEach(item => {
        cmv += (item.produto?.precoCusto || 0) * (item.quantidade || 0)
      })
    })
    const lucroBruto = receitaLiquida - cmv
    const comissaoAtiva = config?.comissao?.ativa ?? false
    let totalComissoes = 0
    if (comissaoAtiva) {
      vendas.forEach(v => {
        const pct = v.vendedor?.comissao || 0
        totalComissoes += (v.total * pct) / 100
      })
    }
    const despesasOp = despesas.reduce((s, d) => s + d.valor, 0)
    const despesasPorCategoria = despesas.reduce((acc, d) => {
      acc[d.categoria] = (acc[d.categoria] || 0) + d.valor
      return acc
    }, {})
    const resultadoOperacional = lucroBruto - despesasOp - totalComissoes
    const margem = receitaLiquida > 0 ? parseFloat(((resultadoOperacional / receitaLiquida) * 100).toFixed(1)) : 0
    const margemBruta = receitaLiquida > 0 ? parseFloat(((lucroBruto / receitaLiquida) * 100).toFixed(1)) : 0
    res.json({
      receitaBruta: parseFloat(receitaBruta.toFixed(2)),
      descontos: parseFloat(descontos.toFixed(2)),
      devolucoes: parseFloat(devolucoes.toFixed(2)),
      receitaLiquida: parseFloat(receitaLiquida.toFixed(2)),
      cmv: parseFloat(cmv.toFixed(2)),
      lucroBruto: parseFloat(lucroBruto.toFixed(2)),
      margemBruta,
      despesasOperacionais: parseFloat(despesasOp.toFixed(2)),
      despesasPorCategoria,
      comissoes: parseFloat(totalComissoes.toFixed(2)),
      resultadoOperacional: parseFloat(resultadoOperacional.toFixed(2)),
      margem,
      qtdVendas: vendas.length,
      qtdCanceladas: canceladas.length,
    })
  } catch (error) {
    logger.error('Erro ao gerar DRE:', error)
    res.status(500).json({ mensagem: 'Erro ao gerar DRE' })
  }
})

module.exports = router
