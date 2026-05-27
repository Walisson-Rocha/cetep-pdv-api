const express = require('express')
const router = express.Router()
const Venda = require('../models/Venda')
const Despesa = require('../models/Despesa')
const Cliente = require('../models/Cliente')
const Log = require('../models/Log')
const { protect, authorize } = require('../middleware/auth.middleware')

router.use(protect)

router.get('/', authorize('admin', 'gerente'), async (req, res) => {
  try {
    const { periodo = '7' } = req.query
    const dias = Math.min(Math.max(parseInt(periodo) || 7, 1), 365)
    const inicio = new Date()
    inicio.setDate(inicio.getDate() - dias)
    inicio.setHours(0, 0, 0, 0)

    const [vendas, despesas, clientesComFiado] = await Promise.all([
      Venda.find({ createdAt: { $gte: inicio }, cancelada: false }),
      Despesa.find({ createdAt: { $gte: inicio } }).sort({ createdAt: -1 }),
      Cliente.find({ saldoFiado: { $gt: 0 } }).sort({ saldoFiado: -1 })
    ])

    const totalReceita = vendas.reduce((acc, v) => acc + v.total, 0)
    const totalDespesas = despesas.filter(d => !d.paga === false || true).reduce((acc, d) => acc + d.valor, 0)

    // Agrupar por dia para o gráfico de fluxo de caixa
    const receitaPorDia = {}
    for (const v of vendas) {
      const dia = v.createdAt.toISOString().split('T')[0]
      receitaPorDia[dia] = (receitaPorDia[dia] || 0) + v.total
    }
    const despesaPorDia = {}
    for (const d of despesas) {
      const dia = d.createdAt.toISOString().split('T')[0]
      despesaPorDia[dia] = (despesaPorDia[dia] || 0) + d.valor
    }
    const todasDatas = new Set([...Object.keys(receitaPorDia), ...Object.keys(despesaPorDia)])
    // Preencher todos os dias no intervalo
    for (let i = 0; i < dias; i++) {
      const d = new Date(inicio)
      d.setDate(d.getDate() + i)
      todasDatas.add(d.toISOString().split('T')[0])
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
    console.error('Erro ao buscar financeiro:', error)
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
    console.error('Erro ao criar despesa:', error)
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
    console.error('Erro ao atualizar despesa:', error)
    res.status(500).json({ mensagem: 'Erro ao atualizar despesa' })
  }
})

router.delete('/despesas/:id', authorize('admin', 'gerente'), async (req, res) => {
  try {
    const despesa = await Despesa.findByIdAndDelete(req.params.id)
    if (!despesa) return res.status(404).json({ mensagem: 'Despesa não encontrada' })
    res.json({ mensagem: 'Despesa removida' })
  } catch (error) {
    console.error('Erro ao deletar despesa:', error)
    res.status(500).json({ mensagem: 'Erro ao deletar despesa' })
  }
})

module.exports = router
