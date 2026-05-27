const express = require('express')
const router = express.Router()
const { registrar, cancelar, listar, vendasHoje, vendasCliente } = require('../controllers/venda.controller')
const { protect, authorize } = require('../middleware/auth.middleware')

router.use(protect)
router.get('/', listar)
router.get('/hoje', vendasHoje)
router.post('/', registrar)
router.put('/:id/cancelar', authorize('admin', 'gerente'), cancelar)
router.get('/cliente/:id', vendasCliente)

module.exports = router