const mongoose = require('mongoose')
const logger = require('../config/logger')
const socket = require('../config/socket')
const Produto = require('../models/Produto')
const Venda = require('../models/Venda')
const Troca = require('../models/Troca')
const Caixa = require('../models/Caixa')
const MovimentoEstoque = require('../models/MovimentoEstoque')
const Configuracao = require('../models/Configuracao')
const Log = require('../models/Log')
const Cliente = require('../models/Cliente')
const Retirada = require('../models/Retirada')
const { incrementosCaixa, ErroVenda } = require('./venda.controller')

// Busca todos os produtos citados numa única consulta e expande qualquer kit/combo
// pros componentes reais — kit não tem estoque próprio, quem baixa/devolve são os
// produtos de verdade dentro dele (mesmo princípio de venda.controller.js).
async function buscarProdutosComComponentes(produtoIds, session) {
  const produtos = await Produto.find({ _id: { $in: produtoIds } }).session(session)
  const produtoMap = new Map(produtos.map(p => [p._id.toString(), p]))
  const idsComponentes = produtos
    .filter(p => p.tipo === 'combo')
    .flatMap(p => p.componentes.map(c => c.produto.toString()))
  if (idsComponentes.length) {
    const componentesReais = await Produto.find({ _id: { $in: idsComponentes } }).session(session)
    for (const cp of componentesReais) produtoMap.set(cp._id.toString(), cp)
    const idFaltando = idsComponentes.find(id => !produtoMap.has(id))
    if (idFaltando) {
      throw new ErroVenda(400, 'Um dos kits selecionados tem um componente que não existe mais. Edite o kit em Estoque antes de trocar.')
    }
  }
  return produtoMap
}

// Achata itens (devolvidos ou novos) em linhas sobre produtos reais, expandindo
// kit/combo pros componentes — o produto-combo em si nunca recebe movimento de estoque.
function expandirParaComponentes(itensCompletos, produtoMap) {
  const linhas = []
  for (const item of itensCompletos) {
    const produto = produtoMap.get(item.produto.toString())
    if (produto.tipo === 'combo') {
      for (const c of produto.componentes) {
        linhas.push({ produto: produtoMap.get(c.produto.toString()), quantidade: c.quantidade * item.quantidade, kitNome: produto.nome })
      }
    } else {
      linhas.push({ produto, quantidade: item.quantidade, kitNome: null })
    }
  }
  return linhas
}

// Itens novos: valida produto/kit, calcula preço (atacado/override) e monta as linhas
// completas. A checagem de estoque acontece à parte (função abaixo), depois de agregar
// a necessidade de componentes entre todos os kits do carrinho.
function montarItensNovos(itens, produtoMap) {
  const completos = []
  let valorTotal = 0
  for (const item of itens) {
    const produto = produtoMap.get(item.produtoId)
    if (!produto || !produto.ativo) throw new ErroVenda(400, `Produto não encontrado: ${item.produtoId}`)
    if (produto.tipo === 'combo' && !produto.componentes?.length) {
      throw new ErroVenda(400, `Kit "${produto.nome}" não tem componentes cadastrados`)
    }
    let precoUnitario = produto.precoVenda
    if (produto.precoAtacado > 0 && produto.quantidadeAtacado > 0 && item.quantidade >= produto.quantidadeAtacado) {
      precoUnitario = produto.precoAtacado
    }
    if (item.precoUnitario && item.precoUnitario > 0) {
      const precoCusto = produto.precoCusto || 0
      if (precoCusto > 0 && item.precoUnitario < precoCusto) {
        throw new ErroVenda(400, `Preço de venda (R$${item.precoUnitario.toFixed(2)}) não pode ser inferior ao custo (R$${precoCusto.toFixed(2)}) para ${produto.nome}`)
      }
      precoUnitario = item.precoUnitario
    }
    const subtotal = precoUnitario * item.quantidade
    valorTotal += subtotal
    completos.push({ produto: produto._id, nomeProduto: produto.nome, quantidade: item.quantidade, precoUnitario, subtotal })
  }
  return { completos, valorTotal }
}

function checarEstoqueNovos(itens, produtoMap) {
  const quantidadeTotalPorProduto = new Map()
  for (const item of itens) {
    quantidadeTotalPorProduto.set(item.produtoId, (quantidadeTotalPorProduto.get(item.produtoId) || 0) + item.quantidade)
  }
  for (const [produtoId, quantidade] of quantidadeTotalPorProduto) {
    const p = produtoMap.get(produtoId)
    if (p.tipo !== 'combo' && p.estoque < quantidade) {
      throw new ErroVenda(400, `Estoque insuficiente para ${p.nome}`, { estoqueDisponivel: p.estoque, solicitado: quantidade })
    }
  }
  // Necessidade agregada de componentes de kit — soma todos os kits que compartilham
  // um componente antes de checar, senão dois kits passam isolados e estouram juntos.
  const necessidades = new Map()
  for (const [produtoId, quantidade] of quantidadeTotalPorProduto) {
    const p = produtoMap.get(produtoId)
    if (p.tipo !== 'combo') continue
    for (const c of p.componentes) {
      const key = c.produto.toString()
      necessidades.set(key, (necessidades.get(key) || 0) + c.quantidade * quantidade)
    }
  }
  for (const [compId, necessario] of necessidades) {
    const compReal = produtoMap.get(compId)
    const jaDireto = quantidadeTotalPorProduto.get(compId) || 0
    const totalNecessario = necessario + jaDireto
    if (!compReal || compReal.estoque < totalNecessario) {
      throw new ErroVenda(400, `Estoque insuficiente de "${compReal?.nome || compId}" para completar o(s) kit(s) selecionado(s)`, {
        estoqueDisponivel: compReal?.estoque ?? 0, solicitado: totalNecessario
      })
    }
  }
}

// Itens devolvidos: quando o item vem com itemIndex (ligado a uma venda de origem), usa o
// preço realmente cobrado naquela venda — não o preço de catálogo atual — e valida contra
// quanto desse item já foi trocado antes (soma de trocas anteriores da mesma venda), pra
// travar trocar a mesma peça duas vezes. Sem itemIndex, funciona como devolução avulsa
// (sem nota/vinculação), usando o preço informado ou o de catálogo como referência.
function montarItensDevolvidos(itens, produtoMap, venda, jaTrocadoPorIndex) {
  const completos = []
  let valorTotal = 0
  for (const item of itens) {
    const produto = produtoMap.get(item.produtoId)
    if (!produto) throw new ErroVenda(400, `Produto não encontrado: ${item.produtoId}`)
    let precoUnitario = item.precoUnitario && item.precoUnitario > 0 ? item.precoUnitario : produto.precoVenda
    let itemIndex = null
    if (venda && Number.isInteger(item.itemIndex)) {
      const itemOrigem = venda.itens[item.itemIndex]
      if (!itemOrigem) throw new ErroVenda(400, `Item da venda não encontrado (índice ${item.itemIndex})`)
      if (itemOrigem.produto.toString() !== item.produtoId) {
        throw new ErroVenda(400, `Produto não corresponde ao item ${item.itemIndex} da venda de origem`)
      }
      const jaTrocado = jaTrocadoPorIndex.get(item.itemIndex) || 0
      if (jaTrocado + item.quantidade > itemOrigem.quantidade) {
        throw new ErroVenda(400, `Quantidade indisponível para troca de "${itemOrigem.nomeProduto}". Comprado: ${itemOrigem.quantidade}, já trocado: ${jaTrocado}`)
      }
      precoUnitario = itemOrigem.subtotal / itemOrigem.quantidade
      itemIndex = item.itemIndex
      jaTrocadoPorIndex.set(item.itemIndex, jaTrocado + item.quantidade)
    }
    const subtotal = precoUnitario * item.quantidade
    valorTotal += subtotal
    completos.push({ produto: produto._id, nomeProduto: produto.nome, quantidade: item.quantidade, precoUnitario, subtotal, itemIndex })
  }
  return { completos, valorTotal }
}

const registrar = async (req, res) => {
  const {
    itensDevolvidos = [], itensNovos = [],
    formaPagamentoDiferenca, formasPagamentoDiferenca = [],
    vendaOrigemId, vendedorId, clienteId, colaboradorId, observacao = ''
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

      let venda = null
      const jaTrocadoPorIndex = new Map()
      if (vendaOrigemId) {
        venda = await Venda.findById(vendaOrigemId).session(session)
        if (!venda) throw new ErroVenda(404, 'Venda de origem não encontrada')
        if (venda.cancelada) throw new ErroVenda(400, 'Não é possível trocar itens de uma venda cancelada')
        const trocasAnteriores = await Troca.find({ vendaOrigem: venda._id }).session(session)
        for (const t of trocasAnteriores) {
          for (const io of t.itensDevolvidos) {
            if (Number.isInteger(io.itemIndex)) {
              jaTrocadoPorIndex.set(io.itemIndex, (jaTrocadoPorIndex.get(io.itemIndex) || 0) + io.quantidade)
            }
          }
        }
      }

      const produtoIdsDevolvidos = itensDevolvidos.map(i => i.produtoId)
      const produtoMapDevolvidos = await buscarProdutosComComponentes(produtoIdsDevolvidos, session)
      const { completos: itensDevolvidosCompletos, valorTotal: valorDevolvido } =
        montarItensDevolvidos(itensDevolvidos, produtoMapDevolvidos, venda, jaTrocadoPorIndex)

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

      // Devolve estoque dos itens devolvidos (expandindo kit pros componentes) ANTES de
      // checar os itens novos — numa troca do mesmo produto (ex: peça com defeito), a
      // unidade devolvida precisa contar como disponível de novo antes da checagem abaixo.
      const linhasDevolucao = expandirParaComponentes(itensDevolvidosCompletos, produtoMapDevolvidos)
      for (const linha of linhasDevolucao) {
        const produto = linha.produto
        const estoqueAnterior = produto.estoque
        const estoqueAtual = produto.estoque + linha.quantidade
        produto.estoque = estoqueAtual
        await Produto.findByIdAndUpdate(produto._id, { $inc: { estoque: linha.quantidade } }, { session })
        await MovimentoEstoque.create([{
          produto: produto._id, tipo: 'entrada',
          quantidade: linha.quantidade, estoqueAnterior, estoqueAtual,
          motivo: linha.kitNome ? `Troca #${numero} — item devolvido (kit: ${linha.kitNome})` : `Troca #${numero} — item devolvido`,
          responsavel: req.user._id
        }], { session })
      }

      // Só agora monta e checa os itens novos — o estoque já reflete a devolução acima.
      const produtoMapNovos = await buscarProdutosComComponentes(itensNovos.map(i => i.produtoId), session)
      const { completos: itensNovosCompletos, valorTotal: valorNovo } = montarItensNovos(itensNovos, produtoMapNovos)
      if (!permitirEstoqueNegativo) checarEstoqueNovos(itensNovos, produtoMapNovos)
      diferenca = Math.round((valorNovo - valorDevolvido) * 100) / 100

      if (diferenca !== 0 && !formaPagamentoDiferenca) {
        throw new ErroVenda(400, diferenca > 0
          ? 'Informe a forma de pagamento da diferença que o cliente pagou'
          : 'Informe a forma de pagamento usada para devolver a diferença ao cliente')
      }

      let cliente = null
      if (formaPagamentoDiferenca === 'fiado' && diferenca !== 0) {
        if (!clienteId) throw new ErroVenda(400, 'Selecione o cliente para o pagamento em fiado')
        cliente = await Cliente.findById(clienteId).session(session)
        if (!cliente) throw new ErroVenda(400, 'Cliente não encontrado')
        if (diferenca > 0 && cliente.limiteCredito > 0 && (cliente.saldoFiado + diferenca) > cliente.limiteCredito) {
          const disponivel = Math.max(0, cliente.limiteCredito - cliente.saldoFiado)
          throw new ErroVenda(400, `Limite de crédito excedido. Disponível: R$${disponivel.toFixed(2)}`)
        }
      }
      if (formaPagamentoDiferenca === 'colaborador' && diferenca > 0 && !colaboradorId) {
        throw new ErroVenda(400, 'Selecione o colaborador para descontar a diferença em folha')
      }

      // Decrementa estoque dos itens novos (expandindo kit pros componentes)
      const linhasNovo = expandirParaComponentes(itensNovosCompletos, produtoMapNovos)
      for (const linha of linhasNovo) {
        const produto = linha.produto
        const estoqueAnterior = produto.estoque
        const estoqueAtual = produto.estoque - linha.quantidade
        produto.estoque = estoqueAtual
        await Produto.findByIdAndUpdate(produto._id, { $inc: { estoque: -linha.quantidade } }, { session })
        await MovimentoEstoque.create([{
          produto: produto._id, tipo: 'saida',
          quantidade: linha.quantidade, estoqueAnterior, estoqueAtual,
          motivo: linha.kitNome ? `Troca #${numero} — item novo (kit: ${linha.kitNome})` : `Troca #${numero} — item novo`,
          responsavel: req.user._id
        }], { session })
      }

      troca.itensNovos = itensNovosCompletos
      troca.valorNovo = valorNovo
      troca.diferenca = diferenca
      troca.formaPagamentoDiferenca = diferenca !== 0 ? formaPagamentoDiferenca : null
      await troca.save({ session })

      // Efeitos da forma de pagamento da diferença sobre fiado/folha do colaborador
      if (formaPagamentoDiferenca === 'fiado' && cliente) {
        if (diferenca > 0) {
          await Cliente.findByIdAndUpdate(cliente._id, { $inc: { saldoFiado: diferenca } }, { session })
        } else if (diferenca < 0) {
          const abatimento = Math.min(cliente.saldoFiado, Math.abs(diferenca))
          await Cliente.findByIdAndUpdate(cliente._id, { $inc: { saldoFiado: -abatimento } }, { session })
        }
      }
      if (formaPagamentoDiferenca === 'colaborador' && diferenca > 0 && colaboradorId) {
        const agora = new Date()
        const mes = parseInt(`${agora.getFullYear()}${String(agora.getMonth() + 1).padStart(2, '0')}`)
        await Retirada.create([{
          colaborador: colaboradorId,
          itens: [{
            produto: itensNovosCompletos[0].produto,
            nomeProduto: `Diferença troca #${numero}`,
            quantidade: 1, precoUnitario: diferenca, subtotal: diferenca,
          }],
          total: diferenca, mes,
          observacao: `Troca #${numero} — PDV`,
          registradaPor: req.user._id,
          vendaOrigem: venda?._id || null,
        }], { session })
      }

      if (diferenca > 0 && formaPagamentoDiferenca !== 'fiado' && formaPagamentoDiferenca !== 'colaborador') {
        // Cliente pagou a diferença num método real — entra no caixa como uma venda normal entraria.
        await Caixa.findByIdAndUpdate(caixa._id, {
          $inc: incrementosCaixa(formaPagamentoDiferenca, formasPagamentoDiferenca, diferenca)
        }, { session })
      } else if (diferenca > 0) {
        // Fiado/colaborador não passam dinheiro pela gaveta — só a receita conta.
        await Caixa.findByIdAndUpdate(caixa._id, { $inc: { totalVendas: diferenca } }, { session })
      } else if (diferenca < 0 && formaPagamentoDiferenca === 'fiado') {
        // Abatido do saldo fiado do cliente — não saiu dinheiro físico da gaveta, só a receita cai.
        await Caixa.findByIdAndUpdate(caixa._id, { $inc: { totalVendas: diferenca } }, { session })
      } else if (diferenca < 0) {
        // Loja devolveu dinheiro ao cliente — duas coisas acontecem, não só uma:
        // 1) o dinheiro sai fisicamente da gaveta → sangria (mantém o saldo em
        //    espécie do fechamento correto);
        // 2) a receita reconhecida cai (o item devolvido já tinha contado como
        //    venda antes) → decrementa totalVendas, senão o relatório de vendas
        //    continua maior que o caixa depois de qualquer troca com devolução.
        await Caixa.findByIdAndUpdate(caixa._id, {
          $inc: { totalVendas: diferenca },
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
        detalhes: `Troca #${numero}${venda ? ` (venda #${venda.numero})` : ''} — devolvido R$${valorDevolvido.toFixed(2)}, novo R$${valorNovo.toFixed(2)}, diferença R$${diferenca.toFixed(2)}`,
        referencia: troca._id
      }], { session })

      trocaPopulada = await Troca.findById(troca._id)
        .session(session)
        .populate('vendedor', 'nome')
        .populate('registradaPor', 'nome')
        .populate('vendaOrigem', 'numero')
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
    const { page = 1, limit = 20, vendaOrigem, numero } = req.query
    const filtro = {}
    if (vendaOrigem) {
      filtro.vendaOrigem = vendaOrigem
    } else if (numero) {
      const venda = await Venda.findOne({ numero: Number(numero) }).select('_id')
      filtro.vendaOrigem = venda ? venda._id : null
    }
    const trocas = await Troca.find(filtro)
      .populate('vendedor', 'nome')
      .populate('registradaPor', 'nome')
      .populate('vendaOrigem', 'numero')
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit))
    const total = await Troca.countDocuments(filtro)
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
      .populate('vendaOrigem', 'numero')
    if (!troca) return res.status(404).json({ mensagem: 'Troca não encontrada' })
    res.json({ troca })
  } catch (error) {
    logger.error('Erro ao buscar troca:', error)
    res.status(500).json({ mensagem: 'Erro ao buscar troca' })
  }
}

module.exports = { registrar, listar, buscarPorId }
