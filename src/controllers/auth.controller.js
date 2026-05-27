const jwt = require('jsonwebtoken')
const User = require('../models/User')
const Log = require('../models/Log')

const REFRESH_SECRET = (process.env.JWT_SECRET || 'fallback') + '_refresh'

const _attempts = new Map() // email -> { count, firstAttempt }
const MAX_TENTATIVAS = 5
const JANELA_MS = 15 * 60 * 1000 // 15 min

function verificarRateLimit(email) {
  const agora = Date.now()
  const rec = _attempts.get(email) || { count: 0, firstAttempt: agora }
  if (agora - rec.firstAttempt > JANELA_MS) { rec.count = 0; rec.firstAttempt = agora }
  rec.count++
  _attempts.set(email, rec)
  if (rec.count > MAX_TENTATIVAS) {
    const minRestantes = Math.ceil((JANELA_MS - (agora - rec.firstAttempt)) / 60000)
    return minRestantes
  }
  return 0
}

const gerarToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '1h' })

const gerarRefreshToken = (id) =>
  jwt.sign({ id }, REFRESH_SECRET, { expiresIn: '30d' })

const login = async (req, res) => {
  try {
    const { email, senha } = req.body
    if (!email || !senha)
      return res.status(400).json({ mensagem: 'Email e senha são obrigatórios' })
    const wait = verificarRateLimit(email)
    if (wait > 0)
      return res.status(429).json({ mensagem: `Muitas tentativas. Aguarde ${wait} minuto(s) e tente novamente.` })
    const user = await User.findOne({ email }).select('+senha')
    if (!user || !user.ativo)
      return res.status(401).json({ mensagem: 'Credenciais inválidas' })
    const senhaCorreta = await user.compararSenha(senha)
    if (!senhaCorreta)
      return res.status(401).json({ mensagem: 'Credenciais inválidas' })
    _attempts.delete(email) // limpa tentativas após login bem-sucedido
    user.ultimoAcesso = new Date()
    await user.save({ validateBeforeSave: false })
    await Log.create({
      usuario: user._id, nomeUsuario: user.nome,
      acao: 'login', detalhes: 'Login realizado', ip: req.ip
    })
    const token = gerarToken(user._id)
    const refreshToken = gerarRefreshToken(user._id)
    res.json({
      token,
      refreshToken,
      usuario: { id: user._id, nome: user.nome, email: user.email, perfil: user.perfil }
    })
  } catch (error) {
    console.error('Erro no login:', error)
    res.status(500).json({ mensagem: 'Erro ao fazer login' })
  }
}

const refresh = async (req, res) => {
  try {
    const { refreshToken } = req.body
    if (!refreshToken)
      return res.status(401).json({ mensagem: 'Refresh token ausente' })
    const decoded = jwt.verify(refreshToken, REFRESH_SECRET)
    const user = await User.findById(decoded.id)
    if (!user || !user.ativo)
      return res.status(401).json({ mensagem: 'Usuário não encontrado ou inativo' })
    res.json({ token: gerarToken(user._id) })
  } catch {
    res.status(401).json({ mensagem: 'Refresh token inválido ou expirado. Faça login novamente.' })
  }
}

const me = async (req, res) => {
  res.json({
    usuario: {
      id: req.user._id, nome: req.user.nome,
      email: req.user.email, perfil: req.user.perfil,
      ultimoAcesso: req.user.ultimoAcesso
    }
  })
}

const alterarSenha = async (req, res) => {
  try {
    const { senhaAtual, novaSenha } = req.body
    if (!senhaAtual || !novaSenha)
      return res.status(400).json({ mensagem: 'Senha atual e nova senha são obrigatórias' })
    if (novaSenha.length < 6)
      return res.status(400).json({ mensagem: 'Nova senha deve ter pelo menos 6 caracteres' })
    const user = await User.findById(req.user._id).select('+senha')
    const correta = await user.compararSenha(senhaAtual)
    if (!correta)
      return res.status(400).json({ mensagem: 'Senha atual incorreta' })
    user.senha = novaSenha
    await user.save()
    res.json({ mensagem: 'Senha alterada com sucesso' })
  } catch (error) {
    console.error('Erro ao alterar senha:', error)
    res.status(500).json({ mensagem: 'Erro ao alterar senha' })
  }
}

module.exports = { login, refresh, me, alterarSenha }
