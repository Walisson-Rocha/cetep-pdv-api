const express = require('express')
const router = express.Router()
const ctrl = require('../controllers/produto.controller')
const { protect, authorize } = require('../middleware/auth.middleware')

router.use(protect)
router.put('/reajuste', authorize('admin', 'gerente'), ctrl.reajustarPrecos)
router.get('/', ctrl.listar)
router.get('/alertas', ctrl.alertas)
router.get('/barcode/:codigo', ctrl.buscarPorCodigo)
router.get('/:id', ctrl.buscarPorId)
router.post('/', authorize('admin', 'gerente', 'estoquista'), ctrl.criar)
router.put('/:id', authorize('admin', 'gerente', 'estoquista'), ctrl.atualizar)
router.delete('/:id', authorize('admin'), ctrl.deletar)

module.exports = router