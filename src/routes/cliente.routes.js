const express = require('express')
const router = express.Router()
const Cliente = require('../models/Cliente')
const Log = require('../models/Log')
const { protect, authorize } = require('../middleware/auth.middleware')

router.use(protect)

router.get('/', async (req, res) => {
  try {
    const { busca } = req.query
    const filtro = { ativo: true }
    if (busca) {
      filtro.$or = [
        { nome: { $regex: busca, $options: 'i' } },
        { telefone: { $regex: busca, $options: 'i' } }
      ]
    }
    const clientes = await Cliente.find(filtro).sort({ nome: 1 })
    res.json({ clientes })
  } catch (error) {
    console.error('Erro ao buscar clientes:', error)
    res.status(500).json({ mensagem: 'Erro ao buscar clientes' })
  }
})

router.post('/', authorize('admin', 'gerente'), async (req, res) => {
  try {
    const { nome, tipo, cpf, cnpj, dataNascimento, telefone, whatsapp, email, endereco, limiteCredito, observacoes } = req.body
    if (!nome) return res.status(400).json({ mensagem: 'Nome é obrigatório' })
    const cliente = await Cliente.create({ nome, tipo, cpf, cnpj, dataNascimento, telefone, whatsapp, email, endereco, limiteCredito, observacoes })
    await Log.create({
      usuario: req.user._id,
      nomeUsuario: req.user.nome,
      acao: 'cliente_criado',
      detalhes: `Cliente: ${cliente.nome}`,
      referencia: cliente._id
    })
    res.status(201).json({ cliente })
  } catch (error) {
    console.error('Erro ao criar cliente:', error)
    res.status(500).json({ mensagem: 'Erro ao criar cliente' })
  }
})

router.put('/:id', authorize('admin', 'gerente'), async (req, res) => {
  try {
    const { nome, tipo, cpf, cnpj, dataNascimento, telefone, whatsapp, email, endereco, limiteCredito, observacoes, ativo } = req.body
    const cliente = await Cliente.findByIdAndUpdate(
      req.params.id,
      { nome, tipo, cpf, cnpj, dataNascimento, telefone, whatsapp, email, endereco, limiteCredito, observacoes, ativo },
      { new: true, runValidators: true }
    )
    if (!cliente) return res.status(404).json({ mensagem: 'Cliente não encontrado' })
    res.json({ cliente })
  } catch (error) {
    console.error('Erro ao atualizar cliente:', error)
    res.status(500).json({ mensagem: 'Erro ao atualizar cliente' })
  }
})

router.put('/:id/quitar', authorize('admin', 'gerente'), async (req, res) => {
  try {
    const { valor } = req.body
    if (!valor || isNaN(valor) || valor <= 0) {
      return res.status(400).json({ mensagem: 'Valor inválido para quitação' })
    }
    const cliente = await Cliente.findById(req.params.id)
    if (!cliente) return res.status(404).json({ mensagem: 'Cliente não encontrado' })
    if (valor > cliente.saldoFiado) {
      return res.status(400).json({
        mensagem: 'Valor superior ao saldo devedor',
        saldoAtual: cliente.saldoFiado
      })
    }
    cliente.saldoFiado = Math.max(0, cliente.saldoFiado - valor)
    await cliente.save()
    await Log.create({
      usuario: req.user._id,
      nomeUsuario: req.user.nome,
      acao: 'fiado_quitado',
      detalhes: `Quitação de R$${valor.toFixed(2)} para ${cliente.nome}`,
      referencia: cliente._id
    })
    res.json({ cliente, mensagem: `Fiado quitado: R$${parseFloat(valor).toFixed(2)}` })
  } catch (error) {
    console.error('Erro ao quitar fiado:', error)
    res.status(500).json({ mensagem: 'Erro ao quitar fiado' })
  }
})

module.exports = router
