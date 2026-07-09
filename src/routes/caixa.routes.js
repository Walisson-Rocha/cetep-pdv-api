const express = require('express')
const router = express.Router()
const { abrirCaixa, fecharCaixa, registrarSangria, caixaAtual, listarAbertos, listarHistorico } = require('../controllers/caixa.controller')
const { protect, authorize } = require('../middleware/auth.middleware')

router.use(protect)
router.get('/atual', caixaAtual)
router.get('/abertos', authorize('admin', 'gerente'), listarAbertos)
router.post('/abrir', authorize('admin', 'gerente'), abrirCaixa)
router.put('/:id/fechar', authorize('admin', 'gerente'), fecharCaixa)
router.post('/sangria', authorize('admin', 'gerente'), registrarSangria)
router.get('/historico', listarHistorico)

module.exports = router