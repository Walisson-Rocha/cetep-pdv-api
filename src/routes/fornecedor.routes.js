const express = require('express')
const router = express.Router()
const Fornecedor = require('../models/Fornecedor')
const { protect, authorize } = require('../middleware/auth.middleware')

router.use(protect)

router.get('/', async (req, res) => {
  try {
    const fornecedores = await Fornecedor.find({ ativo: true }).sort({ nome: 1 })
    res.json({ fornecedores })
  } catch (error) {
    console.error('Erro ao buscar fornecedores:', error)
    res.status(500).json({ mensagem: 'Erro ao buscar fornecedores' })
  }
})

router.post('/', authorize('admin', 'gerente'), async (req, res) => {
  try {
    const { nome, cnpj, telefone, email, contato, observacoes } = req.body
    if (!nome) return res.status(400).json({ mensagem: 'Nome é obrigatório' })
    const f = await Fornecedor.create({ nome, cnpj, telefone, email, contato, observacoes })
    res.status(201).json({ fornecedor: f })
  } catch (error) {
    console.error('Erro ao criar fornecedor:', error)
    res.status(500).json({ mensagem: 'Erro ao criar fornecedor' })
  }
})

router.put('/:id', authorize('admin', 'gerente'), async (req, res) => {
  try {
    const { nome, cnpj, telefone, email, contato, observacoes, ativo } = req.body
    const f = await Fornecedor.findByIdAndUpdate(
      req.params.id,
      { nome, cnpj, telefone, email, contato, observacoes, ativo },
      { new: true, runValidators: true }
    )
    if (!f) return res.status(404).json({ mensagem: 'Fornecedor não encontrado' })
    res.json({ fornecedor: f })
  } catch (error) {
    console.error('Erro ao atualizar fornecedor:', error)
    res.status(500).json({ mensagem: 'Erro ao atualizar fornecedor' })
  }
})

module.exports = router
