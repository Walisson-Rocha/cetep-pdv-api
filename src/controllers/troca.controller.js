const logger = require('../config/logger')
const socket = require('../config/socket')
const Produto = require('../models/Produto')
const Venda = require('../models/Venda')
const Caixa = require('../models/Caixa')
const MovimentoEstoque = require('../models/MovimentoEstoque')
const Lote = require('../models/Lote')
const Troca = require('../models/Troca')
const Log = require('../models/Log')
const Configuracao = require('../models/Configuracao')
const Cliente = require('../models/Cliente')
const Retirada = require('../models/Retirada')
const { incrementosPorForma } = require('../utils/caixaPagamento')

// Formas aceitas quando a loja devolve dinheiro ao cliente (diferença negativa) —
// boleto/colaborador/misto não fazem sentido para uma devolução
const FORMAS_DEVOLUCAO = ['dinheiro', 'pix', 'debito', 'credito', 'fiado']
const FORMAS_MISTO = ['dinheiro', 'pix', 'debito', 'credito', 'fiado', 'boleto']

const registrar = async (req, res) => {
  try {
    const {
      vendaId, itemIndex, quantidadeTroca,
      produtoNovoId, quantidadeNova, precoUnitarioNovo,
      formaPagamentoDiferenca, formasPagamentoDiferenca = [],
      clienteId, colaboradorId, motivo = ''
    } = req.body

    const caixa = await Caixa.findOne({ status: 'aberto' })
    if (!caixa) return res.status(400).json({ mensagem: 'Não há caixa aberto. Solicite ao gerente que abra o caixa.' })

    const venda = await Venda.findById(vendaId)
    if (!venda) return res.status(404).json({ mensagem: 'Venda não encontrada' })
    if (venda.cancelada) return res.status(400).json({ mensagem: 'Não é possível trocar itens de uma venda cancelada' })

    const itemOrigem = venda.itens[itemIndex]
    if (!itemOrigem) return res.status(400).json({ mensagem: 'Item da venda não encontrado' })

    const trocasAnteriores = await Troca.find({ vendaOrigem: venda._id, itemIndex })
    const jaTrocado = trocasAnteriores.reduce((acc, t) => acc + t.itemOrigem.quantidade, 0)
    if (jaTrocado + quantidadeTroca > itemOrigem.quantidade) {
      return res.status(400).json({
        mensagem: `Quantidade indisponível para troca. Comprado: ${itemOrigem.quantidade}, já trocado: ${jaTrocado}`
      })
    }

    const produtoOrigem = await Produto.findById(itemOrigem.produto)
    const produtoNovo = await Produto.findById(produtoNovoId)
    if (!produtoNovo || !produtoNovo.ativo) {
      return res.status(400).json({ mensagem: 'Produto novo não encontrado' })
    }

    const config = await Configuracao.findOne().lean()
    const permitirEstoqueNegativo = config?.estoqueNegativo ?? false
    if (!permitirEstoqueNegativo && produtoNovo.estoque < quantidadeNova) {
      return res.status(400).json({
        mensagem: `Estoque insuficiente para ${produtoNovo.nome}`,
        estoqueDisponivel: produtoNovo.estoque,
        solicitado: quantidadeNova
      })
    }

    let precoNovo = produtoNovo.precoVenda
    if (produtoNovo.precoAtacado > 0 && produtoNovo.quantidadeAtacado > 0 && quantidadeNova >= produtoNovo.quantidadeAtacado) {
      precoNovo = produtoNovo.precoAtacado
    }
    if (precoUnitarioNovo && precoUnitarioNovo > 0) {
      const precoCusto = produtoNovo.precoCusto || 0
      if (precoCusto > 0 && precoUnitarioNovo < precoCusto) {
        return res.status(400).json({
          mensagem: `Preço de venda (R$${precoUnitarioNovo.toFixed(2)}) não pode ser inferior ao custo (R$${precoCusto.toFixed(2)}) para ${produtoNovo.nome}`
        })
      }
      precoNovo = precoUnitarioNovo
    }

    const valorUnitarioAntigo = itemOrigem.subtotal / itemOrigem.quantidade
    const valorAntigo = Math.round(valorUnitarioAntigo * quantidadeTroca * 100) / 100
    const valorNovo = Math.round(precoNovo * quantidadeNova * 100) / 100
    const diferenca = Math.round((valorNovo - valorAntigo) * 100) / 100

    if (diferenca !== 0 && !formaPagamentoDiferenca) {
      return res.status(400).json({ mensagem: 'Informe a forma de pagamento da diferença' })
    }

    let cliente = null
    let legFiadoMisto = null
    if (diferenca > 0) {
      if (formaPagamentoDiferenca === 'fiado') {
        if (!clienteId) return res.status(400).json({ mensagem: 'Selecione o cliente para pagamento fiado' })
        cliente = await Cliente.findById(clienteId)
        if (!cliente) return res.status(400).json({ mensagem: 'Cliente não encontrado' })
        if (cliente.limiteCredito > 0 && (cliente.saldoFiado + diferenca) > cliente.limiteCredito) {
          const disponivel = Math.max(0, cliente.limiteCredito - cliente.saldoFiado)
          return res.status(400).json({ mensagem: `Limite de crédito excedido. Disponível: R$${disponivel.toFixed(2)}` })
        }
      } else if (formaPagamentoDiferenca === 'colaborador') {
        if (!colaboradorId) return res.status(400).json({ mensagem: 'Selecione o colaborador para descontar a diferença' })
      } else if (formaPagamentoDiferenca === 'misto') {
        const somaMisto = formasPagamentoDiferenca.reduce((s, p) => s + (Number(p.valor) || 0), 0)
        const metodosValidos = formasPagamentoDiferenca.length > 0 && formasPagamentoDiferenca.every(p => FORMAS_MISTO.includes(p.metodo))
        if (!metodosValidos || Math.abs(somaMisto - diferenca) > 0.01) {
          return res.status(400).json({ mensagem: 'As formas de pagamento misto devem somar exatamente a diferença' })
        }
        legFiadoMisto = formasPagamentoDiferenca.find(p => p.metodo === 'fiado') || null
        if (legFiadoMisto) {
          if (!clienteId) return res.status(400).json({ mensagem: 'Selecione o cliente para o valor fiado do pagamento misto' })
          cliente = await Cliente.findById(clienteId)
          if (!cliente) return res.status(400).json({ mensagem: 'Cliente não encontrado' })
          if (cliente.limiteCredito > 0 && (cliente.saldoFiado + legFiadoMisto.valor) > cliente.limiteCredito) {
            const disponivel = Math.max(0, cliente.limiteCredito - cliente.saldoFiado)
            return res.status(400).json({ mensagem: `Limite de crédito excedido. Disponível: R$${disponivel.toFixed(2)}` })
          }
        }
      }
    } else if (diferenca < 0) {
      if (!FORMAS_DEVOLUCAO.includes(formaPagamentoDiferenca)) {
        return res.status(400).json({ mensagem: 'Forma de pagamento inválida para devolução ao cliente' })
      }
      if (formaPagamentoDiferenca === 'fiado') {
        if (!clienteId) return res.status(400).json({ mensagem: 'Selecione o cliente para abater no fiado' })
        cliente = await Cliente.findById(clienteId)
        if (!cliente) return res.status(400).json({ mensagem: 'Cliente não encontrado' })
      }
    }

    // Devolve estoque do produto antigo
    if (produtoOrigem) {
      const estoqueAnterior = produtoOrigem.estoque
      const estoqueAtual = produtoOrigem.estoque + quantidadeTroca
      await Produto.findByIdAndUpdate(produtoOrigem._id, { $inc: { estoque: quantidadeTroca } })
      await MovimentoEstoque.create({
        produto: produtoOrigem._id, tipo: 'entrada',
        quantidade: quantidadeTroca,
        estoqueAnterior, estoqueAtual,
        motivo: `Troca item venda #${venda.numero}`,
        venda: venda._id, responsavel: req.user._id
      })
    }

    // Debita estoque do produto novo
    const estoqueAnteriorNovo = produtoNovo.estoque
    const estoqueAtualNovo = produtoNovo.estoque - quantidadeNova
    await Produto.findByIdAndUpdate(produtoNovo._id, { $inc: { estoque: -quantidadeNova } })
    await MovimentoEstoque.create({
      produto: produtoNovo._id, tipo: 'saida',
      quantidade: quantidadeNova,
      estoqueAnterior: estoqueAnteriorNovo, estoqueAtual: estoqueAtualNovo,
      motivo: `Troca item venda #${venda.numero}`,
      venda: venda._id, responsavel: req.user._id
    })
    const lotes = await Lote.find({ produto: produtoNovo._id, ativo: true, quantidade: { $gt: 0 } }).sort({ dataValidade: 1 })
    if (lotes.length > 0) {
      let restante = quantidadeNova
      for (const lote of lotes) {
        if (restante <= 0) break
        const deduzir = Math.min(lote.quantidade, restante)
        lote.quantidade -= deduzir
        if (lote.quantidade === 0) lote.ativo = false
        await lote.save()
        restante -= deduzir
      }
    }

    const troca = await Troca.create({
      vendaOrigem: venda._id,
      itemIndex,
      itemOrigem: {
        produto: itemOrigem.produto,
        nomeProduto: itemOrigem.nomeProduto,
        quantidade: quantidadeTroca,
        precoUnitario: valorUnitarioAntigo,
        subtotal: valorAntigo
      },
      itemNovo: {
        produto: produtoNovo._id,
        nomeProduto: produtoNovo.nome,
        quantidade: quantidadeNova,
        precoUnitario: precoNovo,
        subtotal: valorNovo
      },
      valorAntigo,
      valorNovo,
      diferenca,
      formaPagamentoDiferenca: diferenca !== 0 ? formaPagamentoDiferenca : null,
      formasPagamentoDiferenca: formaPagamentoDiferenca === 'misto' ? formasPagamentoDiferenca : [],
      cliente: cliente?._id || null,
      colaborador: formaPagamentoDiferenca === 'colaborador' ? colaboradorId : null,
      caixa: caixa._id,
      responsavel: req.user._id,
      motivo
    })

    // Efeitos da forma de pagamento da diferença
    if (diferenca > 0 && formaPagamentoDiferenca === 'fiado' && cliente) {
      await Cliente.findByIdAndUpdate(cliente._id, { $inc: { saldoFiado: diferenca } })
    } else if (diferenca > 0 && formaPagamentoDiferenca === 'misto' && legFiadoMisto && cliente) {
      await Cliente.findByIdAndUpdate(cliente._id, { $inc: { saldoFiado: legFiadoMisto.valor } })
    } else if (diferenca < 0 && formaPagamentoDiferenca === 'fiado' && cliente) {
      const abatimento = Math.min(cliente.saldoFiado, Math.abs(diferenca))
      await Cliente.findByIdAndUpdate(cliente._id, { $inc: { saldoFiado: -abatimento } })
    }

    if (diferenca > 0 && formaPagamentoDiferenca === 'colaborador' && colaboradorId) {
      const agora = new Date()
      const mes = parseInt(`${agora.getFullYear()}${String(agora.getMonth() + 1).padStart(2, '0')}`)
      await Retirada.create({
        colaborador: colaboradorId,
        itens: [{
          produto: produtoNovo._id,
          nomeProduto: `Diferença troca venda #${venda.numero}`,
          quantidade: 1,
          precoUnitario: diferenca,
          subtotal: diferenca,
        }],
        total: diferenca,
        mes,
        observacao: `Troca venda #${venda.numero} — PDV`,
        registradaPor: req.user._id,
        vendaOrigem: venda._id,
      })
    }

    // Além de totalTrocas (usado no saldo geral do caixa), a diferença também entra no total
    // do método de pagamento real (dinheiro/pix/etc) — senão a conferência por forma de
    // pagamento nunca reflete o dinheiro/pix que efetivamente entrou ou saiu numa troca
    const incPagamentoDiferenca = diferenca !== 0
      ? incrementosPorForma(formaPagamentoDiferenca, formasPagamentoDiferenca, Math.abs(diferenca), diferenca > 0 ? 1 : -1)
      : {}
    await Caixa.findByIdAndUpdate(caixa._id, {
      $push: {
        trocas: {
          troca: troca._id,
          diferenca,
          formaPagamento: diferenca !== 0 ? formaPagamentoDiferenca : null,
          registradoPor: req.user._id
        }
      },
      $inc: { totalTrocas: diferenca, ...incPagamentoDiferenca }
    })

    await Log.create({
      usuario: req.user._id, nomeUsuario: req.user.nome,
      acao: 'troca_realizada',
      detalhes: `Troca na venda #${venda.numero}: ${itemOrigem.nomeProduto} → ${produtoNovo.nome} (diferença R$${diferenca.toFixed(2)})`,
      referencia: troca._id
    })

    const trocaPopulada = await Troca.findById(troca._id)
      .populate('vendaOrigem', 'numero')
      .populate('responsavel', 'nome')
      .populate('cliente', 'nome')
      .populate('colaborador', 'nome')

    socket.emit('troca:realizada', {
      vendaNumero: venda.numero, diferenca,
      responsavel: req.user.nome
    })

    res.status(201).json({ troca: trocaPopulada, mensagem: 'Troca registrada com sucesso' })
  } catch (error) {
    logger.error('Erro ao registrar troca:', error)
    res.status(500).json({ mensagem: 'Erro ao registrar troca' })
  }
}

const listar = async (req, res) => {
  try {
    const { inicio, fim, vendaOrigem, numero, page = 1, limit = 20 } = req.query
    const filtro = {}
    if (vendaOrigem) {
      filtro.vendaOrigem = vendaOrigem
    } else if (numero) {
      const venda = await Venda.findOne({ numero: Number(numero) }).select('_id')
      filtro.vendaOrigem = venda ? venda._id : null
    }
    if (!vendaOrigem && !numero && (inicio || fim)) {
      filtro.createdAt = {}
      if (inicio) filtro.createdAt.$gte = new Date(inicio)
      if (fim) filtro.createdAt.$lte = new Date(fim)
    }
    const trocas = await Troca.find(filtro)
      .populate('vendaOrigem', 'numero')
      .populate('responsavel', 'nome')
      .populate('cliente', 'nome')
      .populate('colaborador', 'nome')
      .populate('caixa', 'abertoEm')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
    const total = await Troca.countDocuments(filtro)
    res.json({ trocas, total, paginas: Math.ceil(total / limit) })
  } catch (error) {
    logger.error('Erro ao listar trocas:', error)
    res.status(500).json({ mensagem: 'Erro ao listar trocas' })
  }
}

module.exports = { registrar, listar }
