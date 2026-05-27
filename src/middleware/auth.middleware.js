const jwt = require('jsonwebtoken')
const User = require('../models/User')

const protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ mensagem: 'Não autorizado — token ausente' })
    }
    const token = authHeader.split(' ')[1]
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    const user = await User.findById(decoded.id).select('-senha')
    if (!user || !user.ativo) {
      return res.status(401).json({ mensagem: 'Usuário inativo ou não encontrado' })
    }
    req.user = user
    next()
  } catch (error) {
    return res.status(401).json({ mensagem: 'Token inválido ou expirado' })
  }
}

const authorize = (...perfis) => {
  return (req, res, next) => {
    if (!perfis.includes(req.user.perfil)) {
      return res.status(403).json({
        mensagem: `Perfil "${req.user.perfil}" não tem permissão para esta ação`
      })
    }
    next()
  }
}

module.exports = { protect, authorize }