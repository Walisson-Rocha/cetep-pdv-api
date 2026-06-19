const logger = require('../config/logger')
const express = require('express')
const router = express.Router()
const Venda = require('../models/Venda')
const Produto = require('../models/Produto')
const Log = require('../models/Log')
const Configuracao = require('../models/Configuracao')
const { protect, authorize } = require('../middleware/auth.middleware')

router.use(protect)

router.get('/vendas', authorize('admin', 'gerente'), async (req, res) => {
  try {
    const { inicio, fim } = req.query
    const filtro = { cancelada: false }
    if (inicio) filtro.createdAt = { $gte: new Date(inicio) }
    if (fim) filtro.createdAt = { ...filtro.createdAt, $lte: new Date(fim) }
    const [vendas, config] = await Promise.all([
      Venda.find(filtro)
        .populate('vendedor', 'nome comissao')
        .populate({ path: 'itens.produto', select: 'categoria', populate: { path: 'categoria', select: 'nome icone' } })
        .sort({ createdAt: -1 }),
      Configuracao.findOne().lean()
    ])
    const comissaoAtiva = config?.comissao?.ativa ?? false
    const total = vendas.reduce((acc, v) => acc + v.total, 0)
    const porForma = vendas.reduce((acc, v) => {
      acc[v.formaPagamento] = (acc[v.formaPagamento] || 0) + v.total
      return acc
    }, {})
    const porVendedor = {}
    const porCategoria = {}
    vendas.forEach(v => {
      const nome = v.vendedor?.nome || 'Sem nome'
      const comissaoPct = comissaoAtiva ? (v.vendedor?.comissao ?? 0) : 0
      if (!porVendedor[nome]) porVendedor[nome] = { total: 0, quantidade: 0, comissaoPct, comissaoValor: 0 }
      porVendedor[nome].total += v.total
      porVendedor[nome].quantidade++
      porVendedor[nome].comissaoValor = parseFloat((porVendedor[nome].total * comissaoPct / 100).toFixed(2))
      v.itens.forEach(item => {
        const cat = item.produto?.categoria
        const catNome = cat?.nome || 'Sem categoria'
        if (!porCategoria[catNome]) porCategoria[catNome] = { total: 0, quantidade: 0, icone: cat?.icone || '📦' }
        porCategoria[catNome].total += item.subtotal || 0
        porCategoria[catNome].quantidade += item.quantidade || 0
      })
    })
    res.json({ total, quantidade: vendas.length, porFormaPagamento: porForma, porVendedor, porCategoria, comissaoAtiva })
  } catch (error) {
    logger.error('Erro ao gerar relatório de vendas:', error)
    res.status(500).json({ mensagem: 'Erro ao gerar relatório de vendas' })
  }
})

router.get('/logs', authorize('admin', 'gerente'), async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query
    const logs = await Log.find()
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
    const total = await Log.countDocuments()
    res.json({ logs, total, paginas: Math.ceil(total / limit) })
  } catch (error) {
    logger.error('Erro ao buscar logs:', error)
    res.status(500).json({ mensagem: 'Erro ao buscar logs' })
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

module.exports = router
