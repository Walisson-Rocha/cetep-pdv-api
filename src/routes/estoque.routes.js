const logger = require('../config/logger')
const express = require('express')
const router = express.Router()
const Produto = require('../models/Produto')
const MovimentoEstoque = require('../models/MovimentoEstoque')
const Lote = require('../models/Lote')
const Log = require('../models/Log')
const Configuracao = require('../models/Configuracao')
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
    const { produtoId, quantidade, motivo = 'Entrada manual', destino, valorUnitario, dataValidade, loteNumero, notaFiscal, fornecedor } = req.body
    if (!produtoId) return res.status(400).json({ mensagem: 'Produto é obrigatório' })
    if (!quantidade || quantidade <= 0) {
      return res.status(400).json({ mensagem: 'Quantidade deve ser maior que zero' })
    }
    const produto = await Produto.findById(produtoId)
    if (!produto) return res.status(404).json({ mensagem: 'Produto não encontrado' })
    const estoqueAnterior = produto.estoque
    const estoqueAtual = estoqueAnterior + Number(quantidade)
    await Produto.findByIdAndUpdate(produtoId, { $inc: { estoque: Number(quantidade) } })

    let lote = null
    if (dataValidade) {
      lote = await Lote.create({
        produto: produto._id,
        dataValidade: new Date(dataValidade),
        loteNumero: loteNumero || '',
        notaFiscal: notaFiscal || '',
        fornecedor: fornecedor || '',
        quantidadeInicial: Number(quantidade),
        quantidade: Number(quantidade),
        precoCusto: valorUnitario ? Number(valorUnitario) : 0,
        ativo: true,
      })
    }

    const vUnit = valorUnitario != null ? Number(valorUnitario) : null
    const motivoFinal = dataValidade
      ? `${motivo} — Lote: ${loteNumero || 'S/N'} val. ${new Date(dataValidade).toLocaleDateString('pt-BR')}`
      : motivo
    const movimento = await MovimentoEstoque.create({
      produto: produto._id,
      tipo: 'entrada',
      quantidade: Number(quantidade),
      estoqueAnterior,
      estoqueAtual,
      motivo: motivoFinal,
      destino: destino || undefined,
      valorUnitario: vUnit,
      valorTotal: vUnit != null ? vUnit * Number(quantidade) : null,
      responsavel: req.user._id
    })
    await Log.create({
      usuario: req.user._id,
      nomeUsuario: req.user.nome,
      acao: 'estoque_entrada',
      detalhes: `${produto.nome}: +${quantidade} un${dataValidade ? ` (val. ${new Date(dataValidade).toLocaleDateString('pt-BR')})` : ''}`,
      referencia: produto._id
    })
    res.json({ movimento, produto: { ...produto.toObject(), estoque: estoqueAtual }, lote })
  } catch (error) {
    logger.error('Erro ao registrar entrada de estoque:', error)
    res.status(500).json({ mensagem: 'Erro ao registrar entrada de estoque' })
  }
})

router.post('/saida', authorize('admin', 'gerente', 'estoquista'), async (req, res) => {
  try {
    const { produtoId, quantidade, motivo = 'Saída manual', destino } = req.body
    if (!produtoId) return res.status(400).json({ mensagem: 'Produto é obrigatório' })
    if (!quantidade || quantidade <= 0) {
      return res.status(400).json({ mensagem: 'Quantidade deve ser maior que zero' })
    }
    const produto = await Produto.findById(produtoId)
    if (!produto) return res.status(404).json({ mensagem: 'Produto não encontrado' })
    const config = await Configuracao.findOne().lean()
    const permitirEstoqueNegativo = config?.estoqueNegativo ?? false
    if (!permitirEstoqueNegativo && produto.estoque < quantidade) {
      return res.status(400).json({
        mensagem: `Estoque insuficiente para ${produto.nome}`,
        estoqueDisponivel: produto.estoque,
        solicitado: quantidade
      })
    }
    const estoqueAnterior = produto.estoque
    const estoqueAtual = produto.estoque - Number(quantidade)
    await Produto.findByIdAndUpdate(produtoId, { $inc: { estoque: -Number(quantidade) } })
    const movimento = await MovimentoEstoque.create({
      produto: produto._id,
      tipo: 'saida',
      quantidade: Number(quantidade),
      estoqueAnterior,
      estoqueAtual,
      motivo,
      destino: destino || undefined,
      responsavel: req.user._id
    })
    await Log.create({
      usuario: req.user._id,
      nomeUsuario: req.user.nome,
      acao: 'estoque_saida',
      detalhes: `${produto.nome}: -${quantidade} un (${motivo})`,
      referencia: produto._id
    })
    res.json({ movimento, produto })
  } catch (error) {
    console.error('Erro ao registrar saída de estoque:', error)
    res.status(500).json({ mensagem: 'Erro ao registrar saída de estoque' })
  }
})

module.exports = router
