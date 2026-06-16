const Produto = require('../models/Produto')
const Venda = require('../models/Venda')
const Caixa = require('../models/Caixa')
const MovimentoEstoque = require('../models/MovimentoEstoque')
const Cliente = require('../models/Cliente')
const Retirada = require('../models/Retirada')
const Log = require('../models/Log')

const registrar = async (req, res) => {
  try {
    const { itens, formaPagamento, formasPagamento = [], clienteId, colaboradorId, desconto = 0, troco = 0 } = req.body
    const caixa = await Caixa.findOne({ status: 'aberto' })
    if (!caixa) return res.status(400).json({ mensagem: 'Nenhum caixa aberto.' })
    let subtotal = 0
    const itensCompletos = []
    const produtoMap = new Map()
    for (const item of itens) {
      const produto = await Produto.findById(item.produtoId)
      if (!produto || !produto.ativo) {
        return res.status(400).json({ mensagem: `Produto não encontrado: ${item.produtoId}` })
      }
      produtoMap.set(produto._id.toString(), produto)
      if (produto.estoque < item.quantidade) {
        return res.status(400).json({
          mensagem: `Estoque insuficiente para ${produto.nome}`,
          estoqueDisponivel: produto.estoque,
          solicitado: item.quantidade
        })
      }
      // Aplica preço atacado automaticamente se quantidade atingiu o mínimo
      let precoUnitario = produto.precoVenda
      if (produto.precoAtacado > 0 && produto.quantidadeAtacado > 0 && item.quantidade >= produto.quantidadeAtacado) {
        precoUnitario = produto.precoAtacado
      }
      // Permite override manual do frontend (atacado forçado pelo operador)
      if (item.precoUnitario && item.precoUnitario > 0 && item.precoUnitario <= produto.precoVenda) {
        precoUnitario = item.precoUnitario
      }
      const itemSubtotal = (precoUnitario - (item.desconto || 0)) * item.quantidade
      subtotal += itemSubtotal
      itensCompletos.push({
        produto: produto._id,
        nomeProduto: produto.nome,
        quantidade: item.quantidade,
        precoUnitario,
        desconto: item.desconto || 0,
        subtotal: itemSubtotal
      })
    }
    const total = Math.max(0, subtotal - desconto)

    // Valida limite de crédito antes de registrar fiado
    if (formaPagamento === 'fiado' && clienteId) {
      const cli = await Cliente.findById(clienteId)
      if (cli && cli.limiteCredito > 0 && (cli.saldoFiado + total) > cli.limiteCredito) {
        const disponivel = Math.max(0, cli.limiteCredito - cli.saldoFiado)
        return res.status(400).json({
          mensagem: `Limite de crédito excedido. Disponível: R$${disponivel.toFixed(2)} de R$${cli.limiteCredito.toFixed(2)}`
        })
      }
    }

    const venda = await Venda.create({
      itens: itensCompletos, subtotal, desconto, total,
      formaPagamento, formasPagamento, troco,
      cliente: clienteId || null,
      colaborador: colaboradorId || null,
      caixa: caixa._id,
      vendedor: req.user._id
    })
    for (const item of itensCompletos) {
      const produto = produtoMap.get(item.produto.toString())
      const estoqueAnterior = produto.estoque
      produto.estoque -= item.quantidade
      await produto.save()
      await MovimentoEstoque.create({
        produto: produto._id, tipo: 'saida',
        quantidade: item.quantidade,
        estoqueAnterior, estoqueAtual: produto.estoque,
        motivo: `Venda #${venda.numero}`,
        venda: venda._id, responsavel: req.user._id
      })
    }
    if (clienteId && (formaPagamento === 'fiado' || formaPagamento === 'misto')) {
      const valorFiado = formaPagamento === 'misto'
        ? (formasPagamento.find(p => p.metodo === 'fiado')?.valor || 0)
        : total
      if (valorFiado > 0) {
        await Cliente.findByIdAndUpdate(clienteId, { $inc: { saldoFiado: valorFiado } })
      }
    }
    // Venda descontada do colaborador — cria Retirada para aparecer na folha
    // Estoque já foi deduzido pela venda acima; Retirada.create direto (sem rota) não deduz novamente
    if (formaPagamento === 'colaborador' && colaboradorId) {
      const agora = new Date()
      const mes = parseInt(`${agora.getFullYear()}${String(agora.getMonth() + 1).padStart(2, '0')}`)
      await Retirada.create({
        colaborador: colaboradorId,
        itens: itensCompletos.map(i => ({
          produto: i.produto,
          nomeProduto: i.nomeProduto,
          quantidade: i.quantidade,
          precoUnitario: i.precoUnitario,
          subtotal: i.subtotal,
        })),
        total,
        mes,
        observacao: `Venda #${venda.numero} — PDV`,
        registradaPor: req.user._id,
        vendaOrigem: venda._id,
      })
    }
    await Caixa.findByIdAndUpdate(caixa._id, {
      $inc: { totalVendas: total, totalTransacoes: 1 }
    })
    await Log.create({
      usuario: req.user._id, nomeUsuario: req.user.nome,
      acao: 'venda_realizada',
      detalhes: `Venda #${venda.numero} — R$${total.toFixed(2)} (${formaPagamento})`,
      referencia: venda._id
    })
    const vendaPopulada = await Venda.findById(venda._id)
      .populate('cliente', 'nome telefone')
      .populate('colaborador', 'nome')
      .populate('vendedor', 'nome')
    res.status(201).json({ venda: vendaPopulada, mensagem: 'Venda registrada com sucesso' })
  } catch (error) {
    console.error('Erro ao registrar venda:', error)
    res.status(500).json({ mensagem: 'Erro ao registrar venda' })
  }
}

const cancelar = async (req, res) => {
  try {
    const { motivo } = req.body
    const venda = await Venda.findById(req.params.id)
    if (!venda) return res.status(404).json({ mensagem: 'Venda não encontrada' })
    if (venda.cancelada) return res.status(400).json({ mensagem: 'Venda já cancelada' })
    if (!['admin', 'gerente'].includes(req.user.perfil)) {
      return res.status(403).json({ mensagem: 'Sem permissão para cancelar vendas' })
    }
    for (const item of venda.itens) {
      const produto = await Produto.findById(item.produto)
      if (produto) {
        const estoqueAnterior = produto.estoque
        produto.estoque += item.quantidade
        await produto.save()
        await MovimentoEstoque.create({
          produto: produto._id, tipo: 'entrada',
          quantidade: item.quantidade,
          estoqueAnterior, estoqueAtual: produto.estoque,
          motivo: `Cancelamento venda #${venda.numero}`,
          venda: venda._id, responsavel: req.user._id
        })
      }
    }
    if (venda.formaPagamento === 'fiado' && venda.cliente) {
      await Cliente.findByIdAndUpdate(venda.cliente, { $inc: { saldoFiado: -venda.total } })
    }
    // Estorna a Retirada criada automaticamente pelo PDV
    if (venda.formaPagamento === 'colaborador' && venda.colaborador) {
      await Retirada.findOneAndDelete({ vendaOrigem: venda._id })
    }
    venda.cancelada = true
    venda.motivoCancelamento = motivo
    venda.canceladaPor = req.user._id
    venda.canceladaEm = new Date()
    await venda.save()
    await Log.create({
      usuario: req.user._id, nomeUsuario: req.user.nome,
      acao: 'venda_cancelada',
      detalhes: `Venda #${venda.numero} cancelada. Motivo: ${motivo}`,
      referencia: venda._id
    })
    res.json({ mensagem: 'Venda cancelada e estoque estornado', venda })
  } catch (error) {
    console.error('Erro ao cancelar venda:', error)
    res.status(500).json({ mensagem: 'Erro ao cancelar venda' })
  }
}

const listar = async (req, res) => {
  try {
    const { inicio, fim, formaPagamento, page = 1, limit = 20 } = req.query
    const filtro = {}
    if (inicio || fim) {
      filtro.createdAt = {}
      if (inicio) filtro.createdAt.$gte = new Date(inicio)
      if (fim) filtro.createdAt.$lte = new Date(fim)
    }
    if (formaPagamento) filtro.formaPagamento = formaPagamento
    const vendas = await Venda.find(filtro)
      .populate('cliente', 'nome')
      .populate('colaborador', 'nome')
      .populate('vendedor', 'nome')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
    const total = await Venda.countDocuments(filtro)
    res.json({ vendas, total, paginas: Math.ceil(total / limit) })
  } catch (error) {
    console.error('Erro ao listar vendas:', error)
    res.status(500).json({ mensagem: 'Erro ao listar vendas' })
  }
}

const vendasHoje = async (req, res) => {
  try {
    const inicio = new Date()
    inicio.setHours(0, 0, 0, 0)
    const fim = new Date()
    fim.setHours(23, 59, 59, 999)
    const vendas = await Venda.find({
      createdAt: { $gte: inicio, $lte: fim },
      cancelada: false
    })
      .populate('cliente', 'nome')
      .populate('colaborador', 'nome')
      .populate('vendedor', 'nome')
      .sort({ createdAt: -1 })
    const total = vendas.reduce((acc, v) => acc + v.total, 0)
    const porForma = vendas.reduce((acc, v) => {
      acc[v.formaPagamento] = (acc[v.formaPagamento] || 0) + v.total
      return acc
    }, {})
    res.json({ vendas, total, quantidade: vendas.length, porFormaPagamento: porForma })
  } catch (error) {
    console.error('Erro ao buscar vendas de hoje:', error)
    res.status(500).json({ mensagem: 'Erro ao buscar vendas de hoje' })
  }
}

const vendasCliente = async (req, res) => {
  try {
    const mongoose = require('mongoose')
    const { page = 1, limit = 15 } = req.query
    const filtro = { cliente: req.params.id }
    const vendas = await Venda.find(filtro)
      .populate('vendedor', 'nome')
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit))
    const total = await Venda.countDocuments(filtro)
    const agg = await Venda.aggregate([
      { $match: { cliente: new mongoose.Types.ObjectId(req.params.id), cancelada: false } },
      { $group: { _id: null, totalGasto: { $sum: '$total' }, qtd: { $sum: 1 } } }
    ])
    res.json({
      vendas, total,
      paginas: Math.ceil(total / Number(limit)),
      totalGasto: agg[0]?.totalGasto || 0,
      quantidadeTotal: agg[0]?.qtd || 0
    })
  } catch (error) {
    console.error('Erro ao buscar vendas do cliente:', error)
    res.status(500).json({ mensagem: 'Erro ao buscar histórico do cliente' })
  }
}

module.exports = { registrar, cancelar, listar, vendasHoje, vendasCliente }
