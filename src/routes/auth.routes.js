const express = require('express')
const router = express.Router()
const { login, refresh, me, logout, alterarSenha, atualizarPerfil } = require('../controllers/auth.controller')
const { protect } = require('../middleware/auth.middleware')

router.post('/login', login)
router.post('/refresh', refresh)
router.post('/logout', protect, logout)
router.get('/me', protect, me)
router.put('/me', protect, atualizarPerfil)
router.put('/senha', protect, alterarSenha)

module.exports = router
