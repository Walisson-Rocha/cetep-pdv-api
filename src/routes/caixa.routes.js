const express = require('express')
const router = express.Router()
const { abrirCaixa, fecharCaixa, registrarSangria, caixaAtual, listarHistorico } = require('../controllers/caixa.controller')
const { protect, authorize } = require('../middleware/auth.middleware')

router.use(protect)
router.get('/atual', caixaAtual)
router.post('/abrir', abrirCaixa)
router.put('/fechar', authorize('admin', 'gerente'), fecharCaixa)
router.post('/sangria', registrarSangria)
router.get('/historico', listarHistorico)

module.exports = router