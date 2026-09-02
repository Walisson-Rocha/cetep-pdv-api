const logger = require('../config/logger')
const express = require('express')
const router = express.Router()
const Venda = require('../models/Venda')
const Troca = require('../models/Troca')
const Despesa = require('../models/Despesa')
const Cliente = require('../models/Cliente')
const Log = require('../models/Log')
const { protect, authorize } = require('../middleware/auth.middleware')
const { getIntervaloHoje, diaBRT } = require('../utils/brt')

router.use(protect)

router.get('/', authorize('admin', 'gerente'), async (req, res) => {
  try {
    const { periodo = '7' } = req.query
    const dias = Math.min(Math.max(parseInt(periodo) || 7, 1), 365)
    // Início do intervalo em horário de Brasília, não meia-noite do servidor
    // (UTC) — senão o "hoje" desse período fica ~3h adiantado/atrasado.
    const inicio = getIntervaloHoje().inicio
    inicio.setUTCDate(inicio.getUTCDate() - (dias - 1))

    const [vendas, trocas, despesas, clientesComFiado] = await Promise.all([
      Venda.find({ createdAt: { $gte: inicio }, cancelada: false }),
      // Trocas também são receita (diferença paga soma, devolução subtrai) —
      // sem isso o financeiro nunca bate com dashboard/DRE/relatório de vendas.
      Troca.find({ createdAt: { $gte: inicio } }),
      Despesa.find({ createdAt: { $gte: inicio } }).sort({ createdAt: -1 }),
      Cliente.find({ saldoFiado: { $gt: 0 } }).sort({ saldoFiado: -1 })
    ])

    const totalReceita = vendas.reduce((acc, v) => acc + v.total, 0) + trocas.reduce((acc, t) => acc + t.diferenca, 0)
    const totalDespesas = despesas.reduce((acc, d) => acc + d.valor, 0)

    // Agrupar por dia (em BRT) para o gráfico de fluxo de caixa — .toISOString()
    // usa o dia em UTC, jogando uma venda feita às 22h de BRT pro dia seguinte.
    const receitaPorDia = {}
    for (const v of vendas) {
      const dia = diaBRT(v.createdAt)
      receitaPorDia[dia] = (receitaPorDia[dia] || 0) + v.total
    }
    for (const t of trocas) {
      const dia = diaBRT(t.createdAt)
      receitaPorDia[dia] = (receitaPorDia[dia] || 0) + t.diferenca
    }
    const despesaPorDia = {}
    for (const d of despesas) {
      const dia = diaBRT(d.createdAt)
      despesaPorDia[dia] = (despesaPorDia[dia] || 0) + d.valor
    }
    const todasDatas = new Set([...Object.keys(receitaPorDia), ...Object.keys(despesaPorDia)])
    // Preencher todos os dias no intervalo
    for (let i = 0; i < dias; i++) {
      const d = new Date(inicio)
      d.setUTCDate(d.getUTCDate() + i)
      todasDatas.add(diaBRT(d))
    }
    const fluxoCaixa = Array.from(todasDatas).sort().map(data => ({
      data: data.split('-').reverse().slice(0, 2).join('/'),
      receita: receitaPorDia[data] || 0,
      despesas: despesaPorDia[data] || 0,
    }))

    // Despesas por categoria
    const porCategoria = despesas.reduce((acc, d) => {
      acc[d.categoria] = (acc[d.categoria] || 0) + d.valor
      return acc
    }, {})

    res.json({
      totalReceita,
      totalDespesas,
      lucro: totalReceita - totalDespesas,
      margemLucro: totalReceita > 0
        ? Math.round(((totalReceita - totalDespesas) / totalReceita) * 100)
        : 0,
      despesasList: despesas,
      contasReceber: clientesComFiado,
      fluxoCaixa,
      despesasPorCategoria: porCategoria,
    })
  } catch (error) {
    logger.error('Erro ao buscar financeiro:', error)
    res.status(500).json({ mensagem: 'Erro ao buscar dados financeiros' })
  }
})

router.post('/despesas', authorize('admin', 'gerente'), async (req, res) => {
  try {
    const { descricao, valor, categoria, vencimento } = req.body
    if (!descricao || !valor)
      return res.status(400).json({ mensagem: 'Descrição e valor são obrigatórios' })
    if (valor <= 0)
      return res.status(400).json({ mensagem: 'Valor deve ser maior que zero' })
    const despesa = await Despesa.create({
      descricao, valor, categoria,
      vencimento: vencimento || null,
      registradaPor: req.user._id
    })
    await Log.create({
      usuario: req.user._id, nomeUsuario: req.user.nome,
      acao: 'despesa_criada',
      detalhes: `${despesa.descricao} — R$${despesa.valor}`,
      referencia: despesa._id
    })
    res.status(201).json({ despesa })
  } catch (error) {
    logger.error('Erro ao criar despesa:', error)
    res.status(500).json({ mensagem: 'Erro ao criar despesa' })
  }
})

router.put('/despesas/:id', authorize('admin', 'gerente'), async (req, res) => {
  try {
    const { paga } = req.body
    const update = { paga }
    if (paga) update.pagaEm = new Date()
    const despesa = await Despesa.findByIdAndUpdate(req.params.id, update, { new: true })
    if (!despesa) return res.status(404).json({ mensagem: 'Despesa não encontrada' })
    res.json({ despesa })
  } catch (error) {
    logger.error('Erro ao atualizar despesa:', error)
    res.status(500).json({ mensagem: 'Erro ao atualizar despesa' })
  }
})

router.delete('/despesas/:id', authorize('admin', 'gerente'), async (req, res) => {
  try {
    const despesa = await Despesa.findByIdAndDelete(req.params.id)
    if (!despesa) return res.status(404).json({ mensagem: 'Despesa não encontrada' })
    res.json({ mensagem: 'Despesa removida' })
  } catch (error) {
    logger.error('Erro ao deletar despesa:', error)
    res.status(500).json({ mensagem: 'Erro ao deletar despesa' })
  }
})

module.exports = router
