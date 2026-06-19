const express = require('express')
const router = express.Router()
const { body, param } = require('express-validator')
const ctrl = require('../controllers/produto.controller')
const { protect, authorize } = require('../middleware/auth.middleware')
const validate = require('../middleware/validate.middleware')

const validarProdutoCriar = [
  body('nome').trim().notEmpty().withMessage('Nome é obrigatório'),
  body('categoria').isMongoId().withMessage('Categoria inválida'),
  body('precoVenda').isFloat({ min: 0 }).withMessage('Preço de venda deve ser um número maior ou igual a 0'),
  body('precoAtacado').optional().isFloat({ min: 0 }).withMessage('Preço de atacado inválido'),
  body('precoCusto').optional().isFloat({ min: 0 }).withMessage('Preço de custo inválido'),
  body('estoque').optional().isFloat({ min: 0 }).withMessage('Estoque inválido'),
  body('unidade').optional().isIn(['un', 'kg', 'g', 'l', 'ml', 'cx', 'pct']).withMessage('Unidade inválida'),
]

const validarProdutoAtualizar = [
  param('id').isMongoId().withMessage('ID inválido'),
  body('nome').optional().trim().notEmpty().withMessage('Nome não pode ser vazio'),
  body('categoria').optional().isMongoId().withMessage('Categoria inválida'),
  body('precoVenda').optional().isFloat({ min: 0 }).withMessage('Preço de venda inválido'),
  body('precoAtacado').optional().isFloat({ min: 0 }).withMessage('Preço de atacado inválido'),
  body('precoCusto').optional().isFloat({ min: 0 }).withMessage('Preço de custo inválido'),
  body('estoque').optional().isFloat({ min: 0 }).withMessage('Estoque inválido'),
  body('unidade').optional().isIn(['un', 'kg', 'g', 'l', 'ml', 'cx', 'pct']).withMessage('Unidade inválida'),
]

router.use(protect)
router.put('/reajuste', authorize('admin', 'gerente'), ctrl.reajustarPrecos)
router.get('/', ctrl.listar)
router.get('/alertas', ctrl.alertas)
router.get('/barcode/:codigo', ctrl.buscarPorCodigo)
router.get('/:id', param('id').isMongoId().withMessage('ID inválido'), validate, ctrl.buscarPorId)
router.post('/', authorize('admin', 'gerente', 'estoquista'), validarProdutoCriar, validate, ctrl.criar)
router.put('/:id', authorize('admin', 'gerente', 'estoquista'), validarProdutoAtualizar, validate, ctrl.atualizar)
router.delete('/:id', authorize('admin'), param('id').isMongoId().withMessage('ID inválido'), validate, ctrl.deletar)

module.exports = router
