const express = require('express')
const router = express.Router()
const Categoria = require('../models/Categoria')
const { protect, authorize } = require('../middleware/auth.middleware')

router.use(protect)

router.get('/', async (req, res) => {
  try {
    const categorias = await Categoria.find({ ativo: true }).sort({ nome: 1 })
    res.json({ categorias })
  } catch (error) {
    console.error('Erro ao buscar categorias:', error)
    res.status(500).json({ mensagem: 'Erro ao buscar categorias' })
  }
})

router.post('/', authorize('admin'), async (req, res) => {
  try {
    const { nome, cor, icone } = req.body
    if (!nome) return res.status(400).json({ mensagem: 'Nome é obrigatório' })
    const cat = await Categoria.create({ nome, cor, icone })
    res.status(201).json({ categoria: cat })
  } catch (error) {
    console.error('Erro ao criar categoria:', error)
    res.status(500).json({ mensagem: 'Erro ao criar categoria' })
  }
})

router.put('/:id', authorize('admin'), async (req, res) => {
  try {
    const { nome, cor, icone, ativo } = req.body
    const cat = await Categoria.findByIdAndUpdate(
      req.params.id,
      { nome, cor, icone, ativo },
      { new: true, runValidators: true }
    )
    if (!cat) return res.status(404).json({ mensagem: 'Categoria não encontrada' })
    res.json({ categoria: cat })
  } catch (error) {
    console.error('Erro ao atualizar categoria:', error)
    res.status(500).json({ mensagem: 'Erro ao atualizar categoria' })
  }
})

module.exports = router
