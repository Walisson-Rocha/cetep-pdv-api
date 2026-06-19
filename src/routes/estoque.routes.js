const logger = require('../config/logger')
const express = require('express')
const router = express.Router()
const Produto = require('../models/Produto')
const MovimentoEstoque = require('../models/MovimentoEstoque')
const Log = require('../models/Log')
const { protect, authorize } = require('../middleware/auth.middleware')

router.use(protect)

router.get('/historico', async (req, res) => {
  try {
    const { produtoId, page = 1, limit = 20 } = req.query
    const filtro = produtoId ? { produto: produtoId } : {}
    const movimentos = await MovimentoEstoque.find(filtro)
      .populate('produto', 'nome')
      .populate('responsavel', 'nome')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
    const total = await MovimentoEstoque.countDocuments(filtro)
    res.json({ movimentos, total, paginas: Math.ceil(total / limit) })
  } catch (error) {
    logger.error('Erro ao buscar histórico de estoque:', error)
    res.status(500).json({ mensagem: 'Erro ao buscar histórico de estoque' })
  }
})

router.post('/entrada', authorize('admin', 'gerente', 'estoquista'), async (req, res) => {
  try {
    const { produtoId, quantidade, motivo = 'Entrada manual', destino } = req.body
    if (!produtoId) return res.status(400).json({ mensagem: 'Produto é obrigatório' })
    if (!quantidade || quantidade <= 0) {
      return res.status(400).json({ mensagem: 'Quantidade deve ser maior que zero' })
    }
    const produto = await Produto.findById(produtoId)
    if (!produto) return res.status(404).json({ mensagem: 'Produto não encontrado' })
    const estoqueAnterior = produto.estoque
    produto.estoque += Number(quantidade)
    await produto.save()
    const movimento = await MovimentoEstoque.create({
      produto: produto._id,
      tipo: 'entrada',
      quantidade: Number(quantidade),
      estoqueAnterior,
      estoqueAtual: produto.estoque,
      motivo,
      destino: destino || undefined,
      responsavel: req.user._id
    })
    await Log.create({
      usuario: req.user._id,
      nomeUsuario: req.user.nome,
      acao: 'estoque_entrada',
      detalhes: `${produto.nome}: +${quantidade} un`,
      referencia: produto._id
    })
    res.json({ movimento, produto })
  } catch (error) {
    logger.error('Erro ao registrar entrada de estoque:', error)
    res.status(500).json({ mensagem: 'Erro ao registrar entrada de estoque' })
  }
})

module.exports = router
