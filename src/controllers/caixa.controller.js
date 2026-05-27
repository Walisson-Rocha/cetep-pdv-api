const Caixa = require('../models/Caixa')
const Log = require('../models/Log')

const abrirCaixa = async (req, res) => {
  try {
    const caixaAberto = await Caixa.findOne({ status: 'aberto' })
    if (caixaAberto) return res.status(400).json({ mensagem: 'Já existe um caixa aberto' })
    const { saldoInicial = 0 } = req.body
    const caixa = await Caixa.create({ abertoPor: req.user._id, saldoInicial })
    await Log.create({
      usuario: req.user._id, nomeUsuario: req.user.nome,
      acao: 'caixa_aberto',
      detalhes: `Caixa aberto com saldo inicial de R$${saldoInicial}`,
      referencia: caixa._id
    })
    res.status(201).json({ caixa, mensagem: 'Caixa aberto com sucesso' })
  } catch (error) {
    console.error('Erro ao abrir caixa:', error)
    res.status(500).json({ mensagem: 'Erro ao abrir caixa' })
  }
}

const fecharCaixa = async (req, res) => {
  try {
    const { saldoContado } = req.body
    const caixa = await Caixa.findOne({ status: 'aberto' })
    if (!caixa) return res.status(400).json({ mensagem: 'Nenhum caixa aberto' })
    const totalSangrias = caixa.sangrias.reduce((acc, s) => acc + s.valor, 0)
    const saldoFinal = caixa.saldoInicial + caixa.totalVendas - totalSangrias
    const diferenca = saldoContado - saldoFinal
    caixa.status = 'fechado'
    caixa.fechadoEm = new Date()
    caixa.fechadoPor = req.user._id
    caixa.saldoFinal = saldoFinal
    caixa.saldoContado = saldoContado
    caixa.diferenca = diferenca
    await caixa.save()
    await Log.create({
      usuario: req.user._id, nomeUsuario: req.user.nome,
      acao: 'caixa_fechado',
      detalhes: `Caixa fechado. Vendas: R$${caixa.totalVendas}. Diferença: R$${diferenca}`,
      referencia: caixa._id
    })
    res.json({ caixa, mensagem: 'Caixa fechado com sucesso' })
  } catch (error) {
    console.error('Erro ao fechar caixa:', error)
    res.status(500).json({ mensagem: 'Erro ao fechar caixa' })
  }
}

const registrarSangria = async (req, res) => {
  try {
    const { valor, motivo } = req.body
    const caixa = await Caixa.findOne({ status: 'aberto' })
    if (!caixa) return res.status(400).json({ mensagem: 'Nenhum caixa aberto' })
    caixa.sangrias.push({ valor, motivo, registradoPor: req.user._id })
    await caixa.save()
    await Log.create({
      usuario: req.user._id, nomeUsuario: req.user.nome,
      acao: 'sangria',
      detalhes: `Sangria R$${valor} — ${motivo}`,
      referencia: caixa._id
    })
    res.json({ mensagem: 'Sangria registrada', caixa })
  } catch (error) {
    console.error('Erro ao registrar sangria:', error)
    res.status(500).json({ mensagem: 'Erro ao registrar sangria' })
  }
}

const caixaAtual = async (req, res) => {
  try {
    const caixa = await Caixa.findOne({ status: 'aberto' }).populate('abertoPor', 'nome')
    res.json({ caixa: caixa || null })
  } catch (error) {
    console.error('Erro ao buscar caixa:', error)
    res.status(500).json({ mensagem: 'Erro ao buscar caixa' })
  }
}

const listarHistorico = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query
    const caixas = await Caixa.find({ status: 'fechado' })
      .populate('abertoPor', 'nome')
      .populate('fechadoPor', 'nome')
      .sort({ fechadoEm: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit))
    const total = await Caixa.countDocuments({ status: 'fechado' })
    res.json({ caixas, total, paginas: Math.ceil(total / Number(limit)) })
  } catch (error) {
    console.error('Erro ao listar histórico de caixas:', error)
    res.status(500).json({ mensagem: 'Erro ao buscar histórico' })
  }
}

module.exports = { abrirCaixa, fecharCaixa, registrarSangria, caixaAtual, listarHistorico }