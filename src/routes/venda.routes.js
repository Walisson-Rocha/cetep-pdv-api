const express = require('express')
const router = express.Router()
const { body, param } = require('express-validator')
const { registrar, cancelar, listar, vendasHoje, vendasCliente } = require('../controllers/venda.controller')
const { protect, authorize } = require('../middleware/auth.middleware')
const validate = require('../middleware/validate.middleware')

const FORMAS_PAGAMENTO = ['dinheiro', 'pix', 'debito', 'credito', 'fiado', 'boleto', 'colaborador', 'misto']

const validarRegistrar = [
  body('itens').isArray({ min: 1 }).withMessage('A venda precisa ter ao menos um item'),
  body('itens.*.produtoId').isMongoId().withMessage('Produto inválido em um dos itens'),
  body('itens.*.quantidade').isFloat({ gt: 0 }).withMessage('Quantidade inválida em um dos itens'),
  body('formaPagamento').isIn(FORMAS_PAGAMENTO).withMessage('Forma de pagamento inválida'),
  body('desconto').optional().isFloat({ min: 0 }).withMessage('Desconto inválido'),
  body('troco').optional().isFloat({ min: 0 }).withMessage('Troco inválido'),
  body('clienteId').optional().isMongoId().withMessage('Cliente inválido'),
  body('colaboradorId').optional().isMongoId().withMessage('Colaborador inválido'),
]

router.use(protect)
router.get('/', listar)
router.get('/hoje', vendasHoje)
router.post('/', validarRegistrar, validate, registrar)
router.put('/:id/cancelar', authorize('admin', 'gerente'), param('id').isMongoId().withMessage('ID inválido'), validate, cancelar)
router.get('/cliente/:id', param('id').isMongoId().withMessage('ID inválido'), validate, vendasCliente)

module.exports = router
