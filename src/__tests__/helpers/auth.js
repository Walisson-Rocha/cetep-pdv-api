const jwt = require('jsonwebtoken')
const User = require('../../models/User')

let counter = 0

const criarUsuario = async (overrides = {}) => {
  counter++
  const user = await User.create({
    nome: overrides.nome || `Usuário Teste ${counter}`,
    email: overrides.email || `teste${counter}@exemplo.com`,
    senha: overrides.senha || 'senha123',
    perfil: overrides.perfil || 'admin',
    telefone: overrides.telefone || '11999999999',
    ativo: overrides.ativo !== undefined ? overrides.ativo : true,
  })
  return user
}

const gerarToken = (user) => jwt.sign({ id: user._id, tv: user.tokenVersion ?? 0 }, process.env.JWT_SECRET, { expiresIn: '1h' })

const criarUsuarioComToken = async (overrides = {}) => {
  const user = await criarUsuario(overrides)
  const token = gerarToken(user)
  return { user, token }
}

module.exports = { criarUsuario, gerarToken, criarUsuarioComToken }
