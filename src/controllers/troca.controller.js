const mongoose = require('mongoose')
const logger = require('../config/logger')
const socket = require('../config/socket')
const Produto = require('../models/Produto')
const Troca = require('../models/Troca')
const Caixa = require('../models/Caixa')
const MovimentoEstoque = require('../models/MovimentoEstoque')
const Configuracao = require('../models/Configuracao')
const Log = require('../models/Log')
const { incrementosCaixa, ErroVenda } = require('./venda.controller')

// Monta os itens (devolvidos ou novos) validando o produto e agregando quantidade
// por produto — evita que duas linhas do mesmo produto furem a checagem de estoque.
async function montarItens(itens, session, { checarEstoque } = {}) {
  const quantidadePorProduto = new Map()
  for (const item of itens) {
    quantidadePorProduto.set(item.produtoId, (quantidadePorProduto.get(item.produtoId) || 0) + item.quantidade)
  }
  const produtoMap = new Map()
  const completos = []
  let valorTotal = 0
  for (const item of itens) {
    const produto = await Produto.findById(item.produtoId).session(session)
    if (!produto) throw new ErroVenda(400, `Produto não encontrado: ${item.produtoId}`)
    produtoMap.set(produto._id.toString(), produto)
    if (checarEstoque) {
      const quantidadeTotalPedida = quantidadePorProduto.get(item.produtoId)
      if (produto.estoque < quantidadeTotalPedida) {
        throw new ErroVenda(400, `Estoque insuficiente para ${produto.nome}`, {
          estoqueDisponivel: produto.estoque,
          solicitado: quantidadeTotalPedida
        })
      }
    }
    const precoUnitario = item.precoUnitario && item.precoUnitario > 0 ? item.precoUnitario : produto.precoVenda
    const subtotal = precoUnitario * item.quantidade
    valorTotal += subtotal
    completos.push({
      produto: produto._id,
      nomeProduto: produto.nome,
      quantidade: item.quantidade,
      precoUnitario,
      subtotal
    })
  }
  return { completos, valorTotal, produtoMap }
}

const registrar = async (req, res) => {
  const {
    itensDevolvidos = [], itensNovos = [],
    formaPagamentoDiferenca, formasPagamentoDiferenca = [],
    vendaOrigemId, vendedorId, observacao = ''
  } = req.body
  if (itensDevolvidos.length === 0 && itensNovos.length === 0) {
    return res.status(400).json({ mensagem: 'Informe ao menos um item devolvido ou um item novo' })
  }
  const session = await mongoose.startSession()
  let trocaPopulada, numero, diferenca
  try {
    await session.withTransaction(async () => {
      const caixa = await Caixa.findOne({ status: 'aberto' }).session(session)
      if (!caixa) throw new ErroVenda(400, 'Não há caixa aberto. Solicite ao gerente que abra o caixa.')
      const config = await Configuracao.findOne().session(session).lean()
      const permitirEstoqueNegativo = config?.estoqueNegativo ?? false

      const { completos: itensDevolvidosCompletos, valorTotal: valorDevolvido, produtoMap: produtoMapDevolvidos } =
        await montarItens(itensDevolvidos, session)

      const [troca] = await Troca.create([{
        vendaOrigem: vendaOrigemId || null,
        itensDevolvidos: itensDevolvidosCompletos,
        itensNovos: [],
        valorDevolvido, valorNovo: 0, diferenca: 0,
        formaPagamentoDiferenca: null,
        caixa: caixa._id,
        vendedor: vendedorId || req.user._id,
        registradaPor: req.user._id,
        observacao: observacao.trim(),
      }], { session })
      numero = troca.numero

      // Devolve estoque dos itens devolvidos ANTES de checar os itens novos —
      // numa troca do mesmo produto (ex: peça com defeito), a unidade devolvida
      // precisa contar como disponível de novo antes da checagem abaixo.
      for (const item of itensDevolvidosCompletos) {
        const produtoAtual = produtoMapDevolvidos.get(item.produto.toString())
        const estoqueAnterior = produtoAtual.estoque
        const estoqueAtual = produtoAtual.estoque + item.quantidade
        await Produto.findByIdAndUpdate(item.produto, { $inc: { estoque: item.quantidade } }, { session })
        await MovimentoEstoque.create([{
          produto: item.produto, tipo: 'entrada',
          quantidade: item.quantidade, estoqueAnterior, estoqueAtual,
          motivo: `Troca #${numero} — item devolvido`,
          responsavel: req.user._id
        }], { session })
      }

      // Só agora monta e checa os itens novos — o estoque já reflete a devolução acima.
      const { completos: itensNovosCompletos, valorTotal: valorNovo, produtoMap } = await montarItens(
        itensNovos, session, { checarEstoque: !permitirEstoqueNegativo }
      )
      diferenca = valorNovo - valorDevolvido

      if (diferenca > 0 && !formaPagamentoDiferenca) {
        throw new ErroVenda(400, 'Informe a forma de pagamento da diferença que o cliente pagou')
      }

      // Decrementa estoque dos itens novos
      for (const item of itensNovosCompletos) {
        const produto = produtoMap.get(item.produto.toString())
        const estoqueAnterior = produto.estoque
        const estoqueAtual = produto.estoque - item.quantidade
        await Produto.findByIdAndUpdate(item.produto, { $inc: { estoque: -item.quantidade } }, { session })
        await MovimentoEstoque.create([{
          produto: item.produto, tipo: 'saida',
          quantidade: item.quantidade, estoqueAnterior, estoqueAtual,
          motivo: `Troca #${numero} — item novo`,
          responsavel: req.user._id
        }], { session })
      }

      troca.itensNovos = itensNovosCompletos
      troca.valorNovo = valorNovo
      troca.diferenca = diferenca
      troca.formaPagamentoDiferenca = diferenca > 0 ? formaPagamentoDiferenca : null
      await troca.save({ session })

      if (diferenca > 0) {
        // Cliente pagou a diferença — entra no caixa como uma venda normal entraria.
        await Caixa.findByIdAndUpdate(caixa._id, {
          $inc: incrementosCaixa(formaPagamentoDiferenca, formasPagamentoDiferenca, diferenca)
        }, { session })
      } else if (diferenca < 0) {
        // Loja devolveu dinheiro ao cliente — registra como sangria automática,
        // pra reduzir o saldo esperado em espécie e o fechamento bater certo.
        await Caixa.findByIdAndUpdate(caixa._id, {
          $push: {
            sangrias: {
              valor: Math.abs(diferenca),
              motivo: `Troca #${numero} — devolução ao cliente`,
              registradoPor: req.user._id
            }
          }
        }, { session })
      }

      await Log.create([{
        usuario: req.user._id, nomeUsuario: req.user.nome,
        acao: 'troca_realizada',
        detalhes: `Troca #${numero} — devolvido R$${valorDevolvido.toFixed(2)}, novo R$${valorNovo.toFixed(2)}, diferença R$${diferenca.toFixed(2)}`,
        referencia: troca._id
      }], { session })

      trocaPopulada = await Troca.findById(troca._id)
        .session(session)
        .populate('vendedor', 'nome')
        .populate('registradaPor', 'nome')
    })
    socket.emit('troca:nova', { numero, diferenca })
    res.status(201).json({ troca: trocaPopulada, mensagem: 'Troca registrada com sucesso' })
  } catch (error) {
    if (error instanceof ErroVenda) {
      return res.status(error.status).json({ mensagem: error.message, ...error.extra })
    }
    logger.error('Erro ao registrar troca:', error)
    res.status(500).json({ mensagem: 'Erro ao registrar troca' })
  } finally {
    session.endSession()
  }
}

const listar = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query
    const trocas = await Troca.find()
      .populate('vendedor', 'nome')
      .populate('registradaPor', 'nome')
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit))
    const total = await Troca.countDocuments()
    res.json({ trocas, total, paginas: Math.ceil(total / Number(limit)) })
  } catch (error) {
    logger.error('Erro ao listar trocas:', error)
    res.status(500).json({ mensagem: 'Erro ao listar trocas' })
  }
}

const buscarPorId = async (req, res) => {
  try {
    const troca = await Troca.findById(req.params.id)
      .populate('vendedor', 'nome')
      .populate('registradaPor', 'nome')
    if (!troca) return res.status(404).json({ mensagem: 'Troca não encontrada' })
    res.json({ troca })
  } catch (error) {
    logger.error('Erro ao buscar troca:', error)
    res.status(500).json({ mensagem: 'Erro ao buscar troca' })
  }
}

module.exports = { registrar, listar, buscarPorId }
