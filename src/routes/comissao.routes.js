const logger = require('../config/logger')
const express = require('express')
const router = express.Router()
const ComissaoPaga = require('../models/ComissaoPaga')
const Log = require('../models/Log')
const { protect, authorize } = require('../middleware/auth.middleware')

router.use(protect)

router.get('/', authorize('admin', 'gerente'), async (req, res) => {
  try {
    const { vendedorId } = req.query
    const filtro = vendedorId ? { vendedor: vendedorId } : {}
    const historico = await ComissaoPaga.find(filtro)
      .populate('vendedor', 'nome')
      .populate('registradoPor', 'nome')
      .sort({ createdAt: -1 })
      .limit(200)
    const totalPago = historico.reduce((s, c) => s + c.valorComissao, 0)
    res.json({ historico, totalPago: parseFloat(totalPago.toFixed(2)) })
  } catch (error) {
    logger.error('Erro ao listar histórico de comissões:', error)
    res.status(500).json({ mensagem: 'Erro ao listar histórico de comissões' })
  }
})

router.post('/', authorize('admin', 'gerente'), async (req, res) => {
  try {
    const { vendedorId, periodoInicio, periodoFim, totalVendas, percentualComissao, valorComissao, observacao } = req.body
    if (!vendedorId || !periodoInicio || !periodoFim || valorComissao == null)
      return res.status(400).json({ mensagem: 'Vendedor, período e valor são obrigatórios' })
    const registro = await ComissaoPaga.create({
      vendedor: vendedorId,
      periodoInicio: new Date(periodoInicio),
      periodoFim: new Date(periodoFim),
      totalVendas: totalVendas || 0,
      percentualComissao: percentualComissao || 0,
      valorComissao,
      observacao,
      registradoPor: req.user._id,
    })
    await Log.create({
      usuario: req.user._id, nomeUsuario: req.user.nome,
      acao: 'comissao_paga',
      detalhes: `Comissão registrada — R$${valorComissao}`,
      referencia: registro._id,
    })
    const populado = await ComissaoPaga.findById(registro._id)
      .populate('vendedor', 'nome')
      .populate('registradoPor', 'nome')
    res.status(201).json({ registro: populado })
  } catch (error) {
    logger.error('Erro ao registrar pagamento de comissão:', error)
    res.status(500).json({ mensagem: 'Erro ao registrar comissão' })
  }
})

router.delete('/:id', authorize('admin'), async (req, res) => {
  try {
    const registro = await ComissaoPaga.findByIdAndDelete(req.params.id)
    if (!registro) return res.status(404).json({ mensagem: 'Registro não encontrado' })
    res.json({ mensagem: 'Registro removido' })
  } catch (error) {
    logger.error('Erro ao deletar registro de comissão:', error)
    res.status(500).json({ mensagem: 'Erro ao deletar' })
  }
})

module.exports = router
