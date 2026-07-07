const logger = require('../config/logger')
const express = require('express')
const router = express.Router()
const ContaPagar = require('../models/ContaPagar')
const Log = require('../models/Log')
const { protect, authorize } = require('../middleware/auth.middleware')
const { randomUUID } = require('crypto')

router.use(protect)

router.get('/', authorize('admin', 'gerente'), async (req, res) => {
  try {
    const { status, inicio, fim } = req.query
    const filtro = {}
    if (status === 'pendente') filtro.paga = false
    else if (status === 'paga') filtro.paga = true
    if (inicio) filtro.vencimento = { $gte: new Date(inicio) }
    if (fim) filtro.vencimento = { ...(filtro.vencimento || {}), $lte: new Date(new Date(fim).setHours(23, 59, 59, 999)) }
    const contas = await ContaPagar.find(filtro)
      .populate('fornecedor', 'nome')
      .populate('registradaPor', 'nome')
      .sort({ vencimento: 1 })
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
    const totais = {
      totalPendente: 0, totalPago: 0, vencidas: 0, venceHoje: 0, vencemEssaSemana: 0
    }
    const semana = new Date(hoje); semana.setDate(semana.getDate() + 7)
    contas.forEach(c => {
      if (c.paga) { totais.totalPago += c.valorPago || c.valor; return }
      totais.totalPendente += c.valor
      const venc = new Date(c.vencimento); venc.setHours(0, 0, 0, 0)
      if (venc < hoje) totais.vencidas++
      else if (venc.getTime() === hoje.getTime()) totais.venceHoje++
      else if (venc <= semana) totais.vencemEssaSemana++
    })
    res.json({ contas, totais })
  } catch (error) {
    logger.error('Erro ao listar contas a pagar:', error)
    res.status(500).json({ mensagem: 'Erro ao listar contas a pagar' })
  }
})

router.post('/', authorize('admin', 'gerente'), async (req, res) => {
  try {
    const { descricao, valor, categoria, vencimento, observacao, fornecedor, parcelas } = req.body
    if (!descricao || !valor || !vencimento)
      return res.status(400).json({ mensagem: 'Descrição, valor e vencimento são obrigatórios' })
    if (valor <= 0)
      return res.status(400).json({ mensagem: 'Valor deve ser maior que zero' })
    const numParcelas = Math.max(1, parseInt(parcelas) || 1)
    const grupoId = numParcelas > 1 ? randomUUID() : undefined
    const contas = []
    const dataBase = new Date(vencimento)
    for (let i = 0; i < numParcelas; i++) {
      const dataVenc = new Date(dataBase)
      dataVenc.setMonth(dataVenc.getMonth() + i)
      const conta = await ContaPagar.create({
        descricao: numParcelas > 1 ? `${descricao} (${i + 1}/${numParcelas})` : descricao,
        valor, categoria, vencimento: dataVenc, observacao,
        fornecedor: fornecedor || undefined,
        parcelas: numParcelas, parcelaAtual: i + 1,
        grupoId, registradaPor: req.user._id
      })
      contas.push(conta)
    }
    await Log.create({
      usuario: req.user._id, nomeUsuario: req.user.nome,
      acao: 'conta_pagar_criada',
      detalhes: `${descricao} — R$${valor}${numParcelas > 1 ? ` (${numParcelas}x)` : ''}`,
    })
    res.status(201).json({ contas })
  } catch (error) {
    logger.error('Erro ao criar conta a pagar:', error)
    res.status(500).json({ mensagem: 'Erro ao criar conta a pagar' })
  }
})

router.put('/:id/pagar', authorize('admin', 'gerente'), async (req, res) => {
  try {
    const { valorPago } = req.body
    const conta = await ContaPagar.findById(req.params.id)
    if (!conta) return res.status(404).json({ mensagem: 'Conta não encontrada' })
    conta.paga = true
    conta.pagaEm = new Date()
    conta.valorPago = valorPago || conta.valor
    await conta.save()
    await Log.create({
      usuario: req.user._id, nomeUsuario: req.user.nome,
      acao: 'conta_pagar_paga',
      detalhes: `${conta.descricao} — R$${conta.valorPago}`,
      referencia: conta._id
    })
    res.json({ conta })
  } catch (error) {
    logger.error('Erro ao marcar conta como paga:', error)
    res.status(500).json({ mensagem: 'Erro ao pagar conta' })
  }
})

router.put('/:id', authorize('admin', 'gerente'), async (req, res) => {
  try {
    const { descricao, valor, categoria, vencimento, observacao, fornecedor } = req.body
    const conta = await ContaPagar.findByIdAndUpdate(
      req.params.id,
      { $set: { descricao, valor, categoria, vencimento, observacao, fornecedor: fornecedor || null } },
      { new: true }
    )
    if (!conta) return res.status(404).json({ mensagem: 'Conta não encontrada' })
    res.json({ conta })
  } catch (error) {
    logger.error('Erro ao atualizar conta:', error)
    res.status(500).json({ mensagem: 'Erro ao atualizar conta' })
  }
})

router.delete('/:id', authorize('admin', 'gerente'), async (req, res) => {
  try {
    const conta = await ContaPagar.findByIdAndDelete(req.params.id)
    if (!conta) return res.status(404).json({ mensagem: 'Conta não encontrada' })
    res.json({ mensagem: 'Conta removida' })
  } catch (error) {
    logger.error('Erro ao deletar conta:', error)
    res.status(500).json({ mensagem: 'Erro ao deletar conta' })
  }
})

module.exports = router
