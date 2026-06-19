const logger = require('../config/logger')
const express = require('express')
const router = express.Router()
const Log = require('../models/Log')
const { protect, authorize } = require('../middleware/auth.middleware')

router.use(protect)
router.use(authorize('admin', 'gerente'))

// GET /logs?acao=&usuario=&inicio=&fim=&pagina=&limite=
router.get('/', async (req, res) => {
  try {
    const { acao, usuario, inicio, fim, pagina = 1, limite = 50 } = req.query
    const filtro = {}

    if (acao) filtro.acao = acao
    if (usuario) filtro.nomeUsuario = new RegExp(usuario, 'i')
    if (inicio || fim) {
      filtro.createdAt = {}
      if (inicio) filtro.createdAt.$gte = new Date(inicio)
      if (fim) filtro.createdAt.$lte = new Date(new Date(fim).setHours(23, 59, 59, 999))
    }

    const skip = (parseInt(pagina) - 1) * parseInt(limite)
    const [logs, total] = await Promise.all([
      Log.find(filtro).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limite)),
      Log.countDocuments(filtro),
    ])

    res.json({ logs, total, pagina: parseInt(pagina), totalPaginas: Math.ceil(total / parseInt(limite)) })
  } catch (error) {
    logger.error('Erro ao buscar logs:', error)
    res.status(500).json({ mensagem: 'Erro ao buscar logs' })
  }
})

module.exports = router
