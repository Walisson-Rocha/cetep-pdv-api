const express = require('express')
const router = express.Router()
const { abrirCaixa, fecharCaixa, registrarSangria, caixaAtual, listarAbertos, listarHistorico } = require('../controllers/caixa.controller')
const { protect, authorize } = require('../middleware/auth.middleware')

router.use(protect)
router.get('/atual', caixaAtual)
router.get('/abertos', authorize('admin', 'gerente'), listarAbertos)
// Quem opera o caixa no dia a dia (perfil "caixa") também pode abrir, fechar e
// registrar sangria do próprio turno, sem precisar de um gerente pra cada ação.
router.post('/abrir', authorize('admin', 'gerente', 'caixa'), abrirCaixa)
router.put('/:id/fechar', authorize('admin', 'gerente', 'caixa'), fecharCaixa)
router.post('/sangria', authorize('admin', 'gerente', 'caixa'), registrarSangria)
router.get('/historico', listarHistorico)

module.exports = router