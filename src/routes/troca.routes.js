const express = require('express')
const router = express.Router()
const { body } = require('express-validator')
const { registrar, listar } = require('../controllers/troca.controller')
const { protect } = require('../middleware/auth.middleware')
const validate = require('../middleware/validate.middleware')

const FORMAS_PAGAMENTO = ['dinheiro', 'pix', 'debito', 'credito', 'fiado', 'boleto', 'colaborador', 'misto']

const validarRegistrar = [
  body('vendaId').isMongoId().withMessage('Venda inválida'),
  body('itens').isArray({ min: 1 }).withMessage('Selecione ao menos um item pra trocar'),
  body('itens.*.itemIndex').isInt({ min: 0 }).withMessage('Item da venda inválido'),
  body('itens.*.quantidade').isFloat({ gt: 0 }).withMessage('Quantidade a trocar inválida'),
  body('itensNovos').isArray({ min: 1 }).withMessage('Selecione ao menos um produto novo'),
  body('itensNovos.*.produtoId').isMongoId().withMessage('Produto novo inválido'),
  body('itensNovos.*.quantidade').isFloat({ gt: 0 }).withMessage('Quantidade do produto novo inválida'),
  body('formaPagamentoDiferenca').optional({ nullable: true }).isIn(FORMAS_PAGAMENTO).withMessage('Forma de pagamento inválida'),
  body('formasPagamentoDiferenca').optional().isArray().withMessage('Pagamento misto inválido'),
  body('clienteId').optional({ nullable: true }).isMongoId().withMessage('Cliente inválido'),
  body('colaboradorId').optional({ nullable: true }).isMongoId().withMessage('Colaborador inválido'),
]

router.use(protect)
router.get('/', listar)
router.post('/', validarRegistrar, validate, registrar)

module.exports = router
