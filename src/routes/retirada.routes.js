const express = require('express')
const router = express.Router()
const Retirada = require('../models/Retirada')
const Produto = require('../models/Produto')
const User = require('../models/User')
const Log = require('../models/Log')
const { protect, authorize } = require('../middleware/auth.middleware')

router.use(protect)

// GET /retiradas/colaboradores — lista colaboradores ativos (usado no PDV para selecionar)
router.get('/colaboradores', async (req, res) => {
  try {
    const colaboradores = await User.find({ perfil: 'colaborador', ativo: true }, 'nome email')
      .sort({ nome: 1 })
    res.json({ colaboradores })
  } catch (error) {
    console.error('Erro ao buscar colaboradores:', error)
    res.status(500).json({ mensagem: 'Erro ao buscar colaboradores' })
  }
})

// GET /retiradas/minhas — apenas protect, sem authorize (colaborador vê as próprias)
router.get('/minhas', async (req, res) => {
  try {
    const mes = req.query.mes ? parseInt(req.query.mes) : parseInt(
      new Date().getFullYear().toString() + String(new Date().getMonth() + 1).padStart(2, '0')
    )
    const retiradas = await Retirada.find({ colaborador: req.user._id, mes })
      .sort({ createdAt: -1 })
    res.json({ retiradas, mes })
  } catch (error) {
    console.error('Erro ao listar retiradas próprias:', error)
    res.status(500).json({ mensagem: 'Erro ao listar retiradas' })
  }
})

router.use(authorize('admin', 'gerente'))

// GET /retiradas?mes=202605&colaboradorId=xxx&page=1&limit=10
router.get('/', async (req, res) => {
  try {
    const mes = req.query.mes ? parseInt(req.query.mes) : parseInt(
      new Date().getFullYear().toString() + String(new Date().getMonth() + 1).padStart(2, '0')
    )
    const page = Math.max(1, parseInt(req.query.page) || 1)
    const limit = Math.min(50, parseInt(req.query.limit) || 10)
    const filtro = { mes }
    if (req.query.colaboradorId) filtro.colaborador = req.query.colaboradorId

    const [total, retiradas] = await Promise.all([
      Retirada.countDocuments(filtro),
      Retirada.find(filtro)
        .populate('colaborador', 'nome email perfil')
        .populate('registradaPor', 'nome')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
    ])

    res.json({ retiradas, total, totalPages: Math.ceil(total / limit) || 1, page, mes })
  } catch (error) {
    console.error('Erro ao listar retiradas:', error)
    res.status(500).json({ mensagem: 'Erro ao listar retiradas' })
  }
})

// GET /retiradas/folha?mes=202605 — resumo mensal por colaborador
router.get('/folha', async (req, res) => {
  try {
    const mes = req.query.mes ? parseInt(req.query.mes) : parseInt(
      new Date().getFullYear().toString() + String(new Date().getMonth() + 1).padStart(2, '0')
    )

    const colaboradores = await User.find({ perfil: 'colaborador', ativo: true }, 'nome email')
    const retiradas = await Retirada.find({ mes }).populate('colaborador', 'nome email')

    const folha = colaboradores.map(col => {
      const minhas = retiradas.filter(r => r.colaborador?._id.toString() === col._id.toString())
      return {
        colaborador: { id: col._id, nome: col.nome, email: col.email },
        totalRetiradas: minhas.reduce((acc, r) => acc + r.total, 0),
        qtdRetiradas: minhas.length,
        itens: minhas.flatMap(r => r.itens),
      }
    })

    res.json({ folha, mes, totalGeral: folha.reduce((acc, f) => acc + f.totalRetiradas, 0) })
  } catch (error) {
    console.error('Erro ao gerar folha:', error)
    res.status(500).json({ mensagem: 'Erro ao gerar folha' })
  }
})

// POST /retiradas
router.post('/', async (req, res) => {
  try {
    const { colaboradorId, itens, observacao } = req.body
    if (!colaboradorId || !itens || itens.length === 0)
      return res.status(400).json({ mensagem: 'Colaborador e itens são obrigatórios' })

    const colaborador = await User.findById(colaboradorId)
    if (!colaborador || colaborador.perfil !== 'colaborador')
      return res.status(400).json({ mensagem: 'Colaborador inválido' })

    // Valida e desconta estoque
    let total = 0
    const itensFormatados = []
    for (const item of itens) {
      const produto = await Produto.findById(item.produtoId)
      if (!produto) return res.status(400).json({ mensagem: `Produto não encontrado: ${item.produtoId}` })
      if (produto.estoque < item.quantidade)
        return res.status(400).json({ mensagem: `Estoque insuficiente: ${produto.nome} (disponível: ${produto.estoque})` })

      const subtotal = produto.precoVenda * item.quantidade
      total += subtotal
      itensFormatados.push({
        produto: produto._id,
        nomeProduto: produto.nome,
        quantidade: item.quantidade,
        precoUnitario: produto.precoVenda,
        subtotal,
      })
      await Produto.findByIdAndUpdate(produto._id, { $inc: { estoque: -item.quantidade } })
    }

    const agora = new Date()
    const mes = parseInt(`${agora.getFullYear()}${String(agora.getMonth() + 1).padStart(2, '0')}`)

    const retirada = await Retirada.create({
      colaborador: colaboradorId,
      itens: itensFormatados,
      total,
      mes,
      observacao: observacao || '',
      registradaPor: req.user._id,
    })

    await Log.create({
      usuario: req.user._id,
      nomeUsuario: req.user.nome,
      acao: 'retirada_criada',
      detalhes: `Retirada de ${colaborador.nome} — R$${total.toFixed(2)}`,
      referencia: retirada._id,
    })

    res.status(201).json({ retirada })
  } catch (error) {
    console.error('Erro ao criar retirada:', error)
    res.status(500).json({ mensagem: 'Erro ao registrar retirada' })
  }
})

// DELETE /retiradas/:id — estorna e remove
router.delete('/:id', async (req, res) => {
  try {
    const retirada = await Retirada.findById(req.params.id)
    if (!retirada) return res.status(404).json({ mensagem: 'Retirada não encontrada' })

    for (const item of retirada.itens) {
      await Produto.findByIdAndUpdate(item.produto, { $inc: { estoque: item.quantidade } })
    }

    await Retirada.findByIdAndDelete(req.params.id)
    res.json({ mensagem: 'Retirada estornada e removida' })
  } catch (error) {
    console.error('Erro ao deletar retirada:', error)
    res.status(500).json({ mensagem: 'Erro ao remover retirada' })
  }
})

module.exports = router
