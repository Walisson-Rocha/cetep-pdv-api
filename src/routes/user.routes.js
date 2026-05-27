const express = require('express')
const router = express.Router()
const User = require('../models/User')
const Log = require('../models/Log')
const { protect, authorize } = require('../middleware/auth.middleware')

router.use(protect)

router.get('/', authorize('admin'), async (req, res) => {
  try {
    const usuarios = await User.find().sort({ nome: 1 })
    res.json({ usuarios })
  } catch (error) {
    console.error('Erro ao buscar usuários:', error)
    res.status(500).json({ mensagem: 'Erro ao buscar usuários' })
  }
})

router.post('/', authorize('admin'), async (req, res) => {
  try {
    const { nome, email, senha, perfil } = req.body
    if (!nome || !email || !senha)
      return res.status(400).json({ mensagem: 'Nome, email e senha são obrigatórios' })
    if (senha.length < 6)
      return res.status(400).json({ mensagem: 'Senha deve ter pelo menos 6 caracteres' })
    const perfisValidos = ['admin', 'gerente', 'caixa', 'estoquista', 'colaborador']
    if (perfil && !perfisValidos.includes(perfil))
      return res.status(400).json({ mensagem: 'Perfil inválido' })
    const user = await User.create({ nome, email, senha, perfil: perfil || 'caixa' })
    await Log.create({
      usuario: req.user._id, nomeUsuario: req.user.nome,
      acao: 'usuario_criado',
      detalhes: `Usuário: ${user.nome} (${user.perfil})`,
      referencia: user._id
    })
    res.status(201).json({ usuario: user })
  } catch (error) {
    if (error.code === 11000)
      return res.status(400).json({ mensagem: 'Email já cadastrado' })
    console.error('Erro ao criar usuário:', error)
    res.status(500).json({ mensagem: 'Erro ao criar usuário' })
  }
})

router.put('/:id', authorize('admin'), async (req, res) => {
  try {
    const { nome, email, perfil, ativo } = req.body
    const perfisValidos = ['admin', 'gerente', 'caixa', 'estoquista', 'colaborador']
    if (perfil && !perfisValidos.includes(perfil))
      return res.status(400).json({ mensagem: 'Perfil inválido' })
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { nome, email, perfil, ativo },
      { new: true, runValidators: true }
    )
    if (!user) return res.status(404).json({ mensagem: 'Usuário não encontrado' })
    res.json({ usuario: user })
  } catch (error) {
    console.error('Erro ao atualizar usuário:', error)
    res.status(500).json({ mensagem: 'Erro ao atualizar usuário' })
  }
})

// Soft-delete: desativa o usuário sem apagar dados
router.delete('/:id', authorize('admin'), async (req, res) => {
  try {
    if (req.params.id === req.user._id.toString())
      return res.status(400).json({ mensagem: 'Você não pode desativar sua própria conta' })
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { ativo: false },
      { new: true }
    )
    if (!user) return res.status(404).json({ mensagem: 'Usuário não encontrado' })
    await Log.create({
      usuario: req.user._id, nomeUsuario: req.user.nome,
      acao: 'usuario_desativado',
      detalhes: `Usuário desativado: ${user.nome}`,
      referencia: user._id
    })
    res.json({ mensagem: 'Usuário desativado', usuario: user })
  } catch (error) {
    console.error('Erro ao desativar usuário:', error)
    res.status(500).json({ mensagem: 'Erro ao desativar usuário' })
  }
})

module.exports = router
