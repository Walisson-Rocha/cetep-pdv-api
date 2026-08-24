const express = require('express')
const router = express.Router()
const { body, param } = require('express-validator')
const { registrar, listar, buscarPorId } = require('../controllers/troca.controller')
const { protect } = require('../middleware/auth.middleware')
const validate = require('../middleware/validate.middleware')

const FORMAS_PAGAMENTO = ['dinheiro', 'pix', 'debito', 'credito', 'fiado', 'boleto', 'colaborador', 'misto']

const validarRegistrar = [
  body('itensDevolvidos').optional().isArray().withMessage('Itens devolvidos inválidos'),
  body('itensDevolvidos.*.produtoId').if(body('itensDevolvidos').exists()).isMongoId().withMessage('Produto inválido em um item devolvido'),
  body('itensDevolvidos.*.quantidade').if(body('itensDevolvidos').exists()).isFloat({ gt: 0 }).withMessage('Quantidade inválida em um item devolvido'),
  body('itensDevolvidos.*.itemIndex').optional({ nullable: true }).isInt({ min: 0 }).withMessage('Índice de item inválido'),
  body('itensNovos').optional().isArray().withMessage('Itens novos inválidos'),
  body('itensNovos.*.produtoId').if(body('itensNovos').exists()).isMongoId().withMessage('Produto inválido em um item novo'),
  body('itensNovos.*.quantidade').if(body('itensNovos').exists()).isFloat({ gt: 0 }).withMessage('Quantidade inválida em um item novo'),
  body('formaPagamentoDiferenca').optional().isIn(FORMAS_PAGAMENTO).withMessage('Forma de pagamento da diferença inválida'),
  body('vendaOrigemId').optional().isMongoId().withMessage('Venda de origem inválida'),
  body('vendedorId').optional().isMongoId().withMessage('Vendedor inválido'),
  body('clienteId').optional().isMongoId().withMessage('Cliente inválido'),
  body('colaboradorId').optional().isMongoId().withMessage('Colaborador inválido'),
]

router.use(protect)
router.get('/', listar)
router.get('/:id', param('id').isMongoId().withMessage('ID inválido'), validate, buscarPorId)
router.post('/', validarRegistrar, validate, registrar)

module.exports = router
