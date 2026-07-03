const logger = require('../config/logger')
const express = require('express')
const router = express.Router()
const Lote = require('../models/Lote')
const Produto = require('../models/Produto')
const { protect, authorize } = require('../middleware/auth.middleware')

router.use(protect)

// Lista lotes de um produto
router.get('/', async (req, res) => {
  try {
    const { produto, ativo } = req.query
    const filtro = {}
    if (produto) filtro.produto = produto
    if (ativo !== undefined) filtro.ativo = ativo === 'true'
    const lotes = await Lote.find(filtro).sort({ dataValidade: 1 })
    res.json({ lotes })
  } catch (error) {
    logger.error('Erro ao buscar lotes:', error)
    res.status(500).json({ mensagem: 'Erro ao buscar lotes' })
  }
})

// Lotes com vencimento próximo ou vencidos
router.get('/alertas', async (req, res) => {
  try {
    const dias = parseInt(req.query.dias) || 30
    const limite = new Date()
    limite.setDate(limite.getDate() + dias)
    const lotes = await Lote.find({
      ativo: true,
      quantidade: { $gt: 0 },
      dataValidade: { $lte: limite },
    })
      .populate('produto', 'nome categoria imagem')
      .sort({ dataValidade: 1 })
    res.json({ lotes })
  } catch (error) {
    logger.error('Erro ao buscar alertas de lotes:', error)
    res.status(500).json({ mensagem: 'Erro ao buscar alertas' })
  }
})

// Atualizar lote manualmente (ajuste de quantidade ou correção)
router.put('/:id', authorize('admin', 'gerente', 'estoquista'), async (req, res) => {
  try {
    const { quantidade, loteNumero, notaFiscal } = req.body
    const lote = await Lote.findById(req.params.id)
    if (!lote) return res.status(404).json({ mensagem: 'Lote não encontrado' })

    const diffQtd = quantidade !== undefined ? Number(quantidade) - lote.quantidade : 0

    if (quantidade !== undefined) lote.quantidade = Number(quantidade)
    if (loteNumero !== undefined) lote.loteNumero = loteNumero
    if (notaFiscal !== undefined) lote.notaFiscal = notaFiscal
    lote.ativo = lote.quantidade > 0

    await lote.save()

    // Sincronizar estoque do produto se quantidade mudou
    if (diffQtd !== 0) {
      await Produto.findByIdAndUpdate(lote.produto, { $inc: { estoque: diffQtd } })
    }

    res.json({ lote })
  } catch (error) {
    logger.error('Erro ao atualizar lote:', error)
    res.status(500).json({ mensagem: 'Erro ao atualizar lote' })
  }
})

// Dar baixa em lote (ex: descarte por vencimento)
router.delete('/:id', authorize('admin', 'gerente'), async (req, res) => {
  try {
    const lote = await Lote.findById(req.params.id)
    if (!lote) return res.status(404).json({ mensagem: 'Lote não encontrado' })

    // Desconta do produto antes de desativar
    if (lote.quantidade > 0) {
      await Produto.findByIdAndUpdate(lote.produto, { $inc: { estoque: -lote.quantidade } })
    }
    lote.quantidade = 0
    lote.ativo = false
    await lote.save()

    res.json({ mensagem: 'Lote descartado', lote })
  } catch (error) {
    logger.error('Erro ao descartar lote:', error)
    res.status(500).json({ mensagem: 'Erro ao descartar lote' })
  }
})

module.exports = router
