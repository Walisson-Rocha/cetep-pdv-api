const logger = require('../config/logger')
const express = require('express')
const router = express.Router()
const bcrypt = require('bcryptjs')
const { body, param } = require('express-validator')
const User = require('../models/User')
const Log = require('../models/Log')
const { protect, authorize } = require('../middleware/auth.middleware')
const validate = require('../middleware/validate.middleware')

router.use(protect)

const validarCriar = [
  body('nome').trim().notEmpty().withMessage('Nome é obrigatório'),
  body('email').trim().isEmail().withMessage('E-mail inválido').customSanitizer(v => v.toLowerCase()),
  body('senha').isLength({ min: 6 }).withMessage('Senha deve ter pelo menos 6 caracteres'),
]
const validarAtualizar = [
  param('id').isMongoId().withMessage('ID inválido'),
  body('email').optional().trim().isEmail().withMessage('E-mail inválido').customSanitizer(v => v.toLowerCase()),
  body('senha').optional({ checkFalsy: true }).isLength({ min: 6 }).withMessage('Senha deve ter pelo menos 6 caracteres'),
]
const validarId = [param('id').isMongoId().withMessage('ID inválido')]

const CAMPOS_ENDERECO = ['cep', 'logradouro', 'numero', 'bairro', 'cidade', 'estado']
const CAMPOS_EDITAVEIS = [
  'nome', 'email', 'perfil', 'ativo', 'comissao',
  'telefone', 'whatsapp',
  'cep', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'estado',
  'observacao', 'dataAdmissao', 'dataDesligamento',
]

function validarEndereco(body) {
  const temAlgum = CAMPOS_ENDERECO.some(c => body[c]?.trim())
  if (!temAlgum) return []
  return CAMPOS_ENDERECO
    .filter(c => !body[c]?.trim())
    .map(c => `Campo de endereço obrigatório: ${c}`)
}

// Listagem simplificada de usuários ativos — acessível a qualquer perfil autenticado
router.get('/vendedores', async (req, res) => {
  try {
    const usuarios = await User.find({ ativo: true }, 'nome perfil').sort({ nome: 1 })
    res.json({ usuarios })
  } catch (error) {
    logger.error('Erro ao buscar vendedores:', error)
    res.status(500).json({ mensagem: 'Erro ao buscar vendedores' })
  }
})

router.get('/', authorize('admin', 'gerente'), async (req, res) => {
  try {
    if (req.query.all === 'true') {
      const usuarios = await User.find().sort({ nome: 1 })
      return res.json({ usuarios })
    }
    const page = Math.max(1, parseInt(req.query.page) || 1)
    const limit = Math.min(50, parseInt(req.query.limit) || 10)
    const filtro = {}
    if (req.query.perfil) filtro.perfil = req.query.perfil

    const [total, usuarios, perfilAgg] = await Promise.all([
      User.countDocuments(filtro),
      User.find(filtro).sort({ nome: 1 }).skip((page - 1) * limit).limit(limit),
      User.aggregate([{ $group: { _id: '$perfil', count: { $sum: 1 } } }]),
    ])

    const counts = Object.fromEntries(perfilAgg.map(p => [p._id, p.count]))
    const totalAll = Object.values(counts).reduce((a, b) => a + b, 0)

    res.json({ usuarios, total, totalAll, totalPages: Math.ceil(total / limit) || 1, page, counts })
  } catch (error) {
    logger.error('Erro ao buscar usuários:', error)
    res.status(500).json({ mensagem: 'Erro ao buscar usuários' })
  }
})

router.post('/', authorize('admin', 'gerente'), validarCriar, validate, async (req, res) => {
  try {
    const { nome, email, senha, perfil } = req.body
    if (!nome || !email || !senha)
      return res.status(400).json({ mensagem: 'Nome, e-mail e senha são obrigatórios' })
    if (senha.length < 6)
      return res.status(400).json({ mensagem: 'Senha deve ter pelo menos 6 caracteres' })

    if (!req.body.telefone?.trim() && !req.body.whatsapp?.trim())
      return res.status(400).json({ mensagem: 'Informe ao menos Telefone 1 ou WhatsApp' })

    const errosEnd = validarEndereco(req.body)
    if (errosEnd.length) return res.status(400).json({ mensagem: errosEnd[0] })

    const perfisValidos = ['admin', 'gerente', 'caixa', 'estoquista', 'colaborador']
    if (perfil && !perfisValidos.includes(perfil))
      return res.status(400).json({ mensagem: 'Perfil inválido' })

    const payload = {
      nome, email, senha,
      perfil: perfil || 'caixa',
      comissao: req.body.comissao ?? 0,
      telefone: req.body.telefone || '',
      whatsapp: req.body.whatsapp || '',
      cep: req.body.cep || '', logradouro: req.body.logradouro || '',
      numero: req.body.numero || '', complemento: req.body.complemento || '',
      bairro: req.body.bairro || '', cidade: req.body.cidade || '',
      estado: req.body.estado || '',
      observacao: req.body.observacao || '',
      dataAdmissao: req.body.dataAdmissao || undefined,
      dataDesligamento: req.body.dataDesligamento || undefined,
      ativo: req.body.ativo !== undefined ? req.body.ativo : true,
    }

    const user = await User.create(payload)
    await Log.create({
      usuario: req.user._id, nomeUsuario: req.user.nome,
      acao: 'usuario_criado',
      detalhes: `Usuário: ${user.nome} (${user.perfil})`,
      referencia: user._id,
    })
    res.status(201).json({ usuario: user })
  } catch (error) {
    if (error.code === 11000)
      return res.status(400).json({ mensagem: 'E-mail já cadastrado' })
    logger.error('Erro ao criar usuário:', error)
    res.status(500).json({ mensagem: 'Erro ao criar usuário' })
  }
})

router.put('/:id', authorize('admin', 'gerente'), validarAtualizar, validate, async (req, res) => {
  try {
    const body = req.body
    const perfisValidos = ['admin', 'gerente', 'caixa', 'estoquista', 'colaborador']
    if (body.perfil && !perfisValidos.includes(body.perfil))
      return res.status(400).json({ mensagem: 'Perfil inválido' })

    const errosEnd = validarEndereco(body)
    if (errosEnd.length) return res.status(400).json({ mensagem: errosEnd[0] })

    const update = {}
    for (const campo of CAMPOS_EDITAVEIS) {
      if (body[campo] !== undefined) update[campo] = body[campo]
    }
    // Senha requer hash manual (findByIdAndUpdate ignora pre-save hook)
    if (body.senha && body.senha.length >= 6) {
      update.senha = await bcrypt.hash(body.senha, 12)
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { $set: update },
      { new: true, runValidators: true }
    )
    if (!user) return res.status(404).json({ mensagem: 'Usuário não encontrado' })
    res.json({ usuario: user })
  } catch (error) {
    if (error.code === 11000)
      return res.status(400).json({ mensagem: 'E-mail já cadastrado' })
    logger.error('Erro ao atualizar usuário:', error)
    res.status(500).json({ mensagem: 'Erro ao atualizar usuário' })
  }
})

router.put('/:id/permissoes', authorize('admin', 'gerente'), validarId, validate, async (req, res) => {
  try {
    const { acessosExtra } = req.body
    if (!Array.isArray(acessosExtra))
      return res.status(400).json({ mensagem: 'acessosExtra deve ser um array' })
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { $set: { acessosExtra } },
      { new: true }
    )
    if (!user) return res.status(404).json({ mensagem: 'Usuário não encontrado' })
    await Log.create({
      usuario: req.user._id, nomeUsuario: req.user.nome,
      acao: 'permissoes_atualizadas',
      detalhes: `Permissões atualizadas: ${user.nome} — ${acessosExtra.join(', ') || 'nenhuma extra'}`,
      referencia: user._id,
    })
    res.json({ usuario: user })
  } catch (error) {
    logger.error('Erro ao atualizar permissões:', error)
    res.status(500).json({ mensagem: 'Erro ao atualizar permissões' })
  }
})

router.delete('/:id/permanente', authorize('admin', 'gerente'), validarId, validate, async (req, res) => {
  try {
    if (req.params.id === req.user._id.toString())
      return res.status(400).json({ mensagem: 'Você não pode excluir sua própria conta' })
    const user = await User.findByIdAndDelete(req.params.id)
    if (!user) return res.status(404).json({ mensagem: 'Usuário não encontrado' })
    await Log.create({
      usuario: req.user._id, nomeUsuario: req.user.nome,
      acao: 'usuario_excluido_permanente',
      detalhes: `Usuário excluído permanentemente: ${user.nome} (${user.perfil})`,
      referencia: user._id,
    })
    res.json({ mensagem: 'Usuário excluído permanentemente' })
  } catch (error) {
    logger.error('Erro ao excluir usuário:', error)
    res.status(500).json({ mensagem: 'Erro ao excluir usuário' })
  }
})

router.delete('/:id', authorize('admin', 'gerente'), validarId, validate, async (req, res) => {
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
      referencia: user._id,
    })
    res.json({ mensagem: 'Usuário desativado', usuario: user })
  } catch (error) {
    logger.error('Erro ao desativar usuário:', error)
    res.status(500).json({ mensagem: 'Erro ao desativar usuário' })
  }
})

module.exports = router
