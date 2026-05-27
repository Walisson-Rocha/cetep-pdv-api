const express = require('express')
const router = express.Router()
const { login, refresh, me, alterarSenha } = require('../controllers/auth.controller')
const { protect } = require('../middleware/auth.middleware')
const Log = require('../models/Log')

router.post('/login', login)
router.post('/refresh', refresh)

router.post('/logout', protect, async (req, res) => {
  try {
    await Log.create({
      usuario: req.user._id, nomeUsuario: req.user.nome,
      acao: 'logout', detalhes: 'Logout realizado', ip: req.ip
    })
  } catch { /* não bloqueia o logout */ }
  res.json({ mensagem: 'Logout realizado com sucesso' })
})

router.get('/me', protect, me)
router.put('/senha', protect, alterarSenha)

module.exports = router
