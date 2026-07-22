const express = require('express')
const router = express.Router()
const { body } = require('express-validator')
const { registrar, listar } = require('../controllers/troca.controller')
const { protect } = require('../middleware/auth.middleware')
const validate = require('../middleware/validate.middleware')

const FORMAS_PAGAMENTO = ['dinheiro', 'pix', 'debito', 'credito', 'fiado', 'boleto', 'colaborador', 'misto']

const validarRegistrar = [
  body('vendaId').isMongoId().withMessage('Venda inválida'),
  body('itemIndex').isInt({ min: 0 }).withMessage('Item da venda inválido'),
  body('quantidadeTroca').isFloat({ gt: 0 }).withMessage('Quantidade a trocar inválida'),
  body('produtoNovoId').isMongoId().withMessage('Produto novo inválido'),
  body('quantidadeNova').isFloat({ gt: 0 }).withMessage('Quantidade do produto novo inválida'),
  body('formaPagamentoDiferenca').optional({ nullable: true }).isIn(FORMAS_PAGAMENTO).withMessage('Forma de pagamento inválida'),
  body('formasPagamentoDiferenca').optional().isArray().withMessage('Pagamento misto inválido'),
  body('clienteId').optional({ nullable: true }).isMongoId().withMessage('Cliente inválido'),
  body('colaboradorId').optional({ nullable: true }).isMongoId().withMessage('Colaborador inválido'),
]

router.use(protect)
router.get('/', listar)
router.post('/', validarRegistrar, validate, registrar)

module.exports = router
