const logger = require('../config/logger')
const socket = require('../config/socket')
const Produto = require('../models/Produto')
const Log = require('../models/Log')
const HistoricoPreco = require('../models/HistoricoPreco')

// Traduz o status virtual (statusEstoque) do model em condição de query do Mongo,
// para poder filtrar e paginar no banco em vez de carregar tudo e filtrar em JS.
const construirCondicaoStatus = (status, agora) => {
  const limiteVencimento = new Date(agora.getTime() + 5 * 24 * 60 * 60 * 1000)
  switch (status) {
    case 'zerado':
      return { estoque: 0 }
    case 'baixo':
      return { estoque: { $gt: 0 }, $expr: { $lte: ['$estoque', '$estoqueMinimo'] } }
    case 'vencendo':
      return {
        estoque: { $gt: 0 },
        $expr: { $gt: ['$estoque', '$estoqueMinimo'] },
        validade: { $ne: null, $lte: limiteVencimento },
      }
    case 'normal':
      return {
        estoque: { $gt: 0 },
        $expr: { $gt: ['$estoque', '$estoqueMinimo'] },
        $or: [{ validade: null }, { validade: { $gt: limiteVencimento } }],
      }
    default:
      return null
  }
}

const combinarCondicoes = (condicoes) => {
  const validas = condicoes.filter(Boolean)
  if (validas.length === 0) return {}
  return validas.length > 1 ? { $and: validas } : validas[0]
}

const listar = async (req, res) => {
  try {
    const { busca, categoria, status, page = 1, limit = 50, sort = 'nome' } = req.query
    const agora = new Date()
    const limiteVencimento = new Date(agora.getTime() + 5 * 24 * 60 * 60 * 1000)

    const condicoesBase = [{ ativo: true }]
    if (busca) {
      const safe = String(busca).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').slice(0, 100)
      condicoesBase.push({
        $or: [
          { nome: { $regex: safe, $options: 'i' } },
          { codigoBarras: busca },
          { codigosBarras: busca }
        ]
      })
    }
    if (categoria) condicoesBase.push({ categoria })
    const matchBase = combinarCondicoes(condicoesBase)

    // Uma única passada pela coleção calcula as 4 contagens (em vez de 4 count separados,
    // cada um varrendo a coleção inteira — isso deixava a listagem lenta/travando)
    const [agg] = await Produto.aggregate([
      { $match: matchBase },
      { $addFields: {
          _baixo: { $and: [{ $gt: ['$estoque', 0] }, { $lte: ['$estoque', '$estoqueMinimo'] }] },
          _vencendo: { $and: [
            { $gt: ['$estoque', '$estoqueMinimo'] },
            { $ne: ['$validade', null] },
            { $lte: ['$validade', limiteVencimento] },
          ] },
      }},
      { $group: {
          _id: null,
          todos: { $sum: 1 },
          zerado: { $sum: { $cond: [{ $eq: ['$estoque', 0] }, 1, 0] } },
          baixo: { $sum: { $cond: ['$_baixo', 1, 0] } },
          vencendo: { $sum: { $cond: ['$_vencendo', 1, 0] } },
      }},
    ])
    const contagens = {
      todos: agg?.todos || 0,
      zerado: agg?.zerado || 0,
      baixo: agg?.baixo || 0,
      vencendo: agg?.vencendo || 0,
      normal: (agg?.todos || 0) - (agg?.zerado || 0) - (agg?.baixo || 0) - (agg?.vencendo || 0),
    }

    const filtro = combinarCondicoes([matchBase, construirCondicaoStatus(status, agora)])
    const sortObj = sort === 'novo' ? { createdAt: -1 } : { nome: 1 }
    const produtos = await Produto.find(filtro)
      .populate('categoria', 'nome cor icone')
      .populate('fornecedor', 'nome')
      .sort(sortObj)
      .limit(limit * 1)
      .skip((page - 1) * limit)

    const total = Object.prototype.hasOwnProperty.call(contagens, status) ? contagens[status] : contagens.todos
    res.json({ produtos, total, paginas: Math.ceil(total / limit), contagens })
  } catch (error) {
    logger.error('Erro ao listar produtos:', error)
    res.status(500).json({ mensagem: 'Erro ao listar produtos' })
  }
}

const buscarPorCodigo = async (req, res) => {
  try {
    const produto = await Produto.findOne({
      $or: [{ codigoBarras: req.params.codigo }, { codigosBarras: req.params.codigo }],
      ativo: true
    }).populate('categoria', 'nome cor icone')
    if (!produto) return res.status(404).json({ mensagem: 'Produto não encontrado' })
    res.json({ produto })
  } catch (error) {
    logger.error('Erro na busca:', error)
    res.status(500).json({ mensagem: 'Erro na busca' })
  }
}

const buscarPorId = async (req, res) => {
  try {
    const produto = await Produto.findById(req.params.id)
      .populate('categoria', 'nome cor icone')
      .populate('componentes.produto', 'nome precoVenda estoque unidade')
    if (!produto) return res.status(404).json({ mensagem: 'Produto não encontrado' })
    res.json({ produto })
  } catch (error) {
    logger.error('Erro ao buscar produto:', error)
    res.status(500).json({ mensagem: 'Erro ao buscar produto' })
  }
}

const criar = async (req, res) => {
  try {
    const produto = await Produto.create(req.body)
    await produto.populate('categoria', 'nome cor icone')
    await Log.create({
      usuario: req.user._id,
      nomeUsuario: req.user.nome,
      acao: 'produto_criado',
      detalhes: `Produto criado: ${produto.nome}`,
      referencia: produto._id
    })
    res.status(201).json({ produto, mensagem: 'Produto criado com sucesso' })
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ mensagem: 'Código de barras já cadastrado' })
    }
    logger.error('Erro ao criar produto:', error)
    res.status(500).json({ mensagem: 'Erro ao criar produto' })
  }
}

const atualizar = async (req, res) => {
  try {
    const produtoAntes = await Produto.findById(req.params.id)
    if (!produtoAntes) return res.status(404).json({ mensagem: 'Produto não encontrado' })
    const precoVendaMudou = req.body.precoVenda !== undefined && parseFloat(req.body.precoVenda) !== produtoAntes.precoVenda
    const precoCustoMudou = req.body.precoCusto !== undefined && parseFloat(req.body.precoCusto) !== produtoAntes.precoCusto
    if (precoVendaMudou || precoCustoMudou) {
      await HistoricoPreco.create({
        produto: produtoAntes._id,
        nomeProduto: produtoAntes.nome,
        precoVendaAnterior: produtoAntes.precoVenda,
        precoVendaNovo: precoVendaMudou ? parseFloat(req.body.precoVenda) : undefined,
        precoCustoAnterior: produtoAntes.precoCusto,
        precoCustoNovo: precoCustoMudou ? parseFloat(req.body.precoCusto) : undefined,
        usuario: req.user._id,
        nomeUsuario: req.user.nome,
      })
    }
    if (precoVendaMudou) {
      await Log.create({
        usuario: req.user._id,
        nomeUsuario: req.user.nome,
        acao: 'preco_alterado',
        detalhes: `${produtoAntes.nome}: R$${produtoAntes.precoVenda} → R$${req.body.precoVenda}`,
        referencia: produtoAntes._id
      })
    }
    const produto = await Produto.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true })
      .populate('categoria', 'nome cor icone')
    if (req.body.estoque !== undefined) {
      socket.emit('estoque:atualizado', {
        produtoId: produto._id, nome: produto.nome, estoque: produto.estoque,
        baixo: produto.estoque <= produto.estoqueMinimo,
      })
    }
    res.json({ produto, mensagem: 'Produto atualizado' })
  } catch (error) {
    logger.error('Erro ao atualizar produto:', error)
    res.status(500).json({ mensagem: 'Erro ao atualizar produto' })
  }
}

const deletar = async (req, res) => {
  try {
    await Produto.findByIdAndUpdate(req.params.id, { ativo: false })
    res.json({ mensagem: 'Produto removido com sucesso' })
  } catch (error) {
    logger.error('Erro ao remover produto:', error)
    res.status(500).json({ mensagem: 'Erro ao remover produto' })
  }
}

const alertas = async (req, res) => {
  try {
    // Reaproveita os mesmos filtros de status usados em listar(), já traduzidos pra
    // condição de query — em vez de carregar o catálogo inteiro e filtrar em JS 3x.
    const agora = new Date()
    const [zerados, baixos, vencendo] = await Promise.all([
      Produto.find(combinarCondicoes([{ ativo: true }, construirCondicaoStatus('zerado', agora)]))
        .select('nome estoque').lean(),
      Produto.find(combinarCondicoes([{ ativo: true }, construirCondicaoStatus('baixo', agora)]))
        .select('nome estoque').lean(),
      Produto.find(combinarCondicoes([{ ativo: true }, construirCondicaoStatus('vencendo', agora)]))
        .select('nome estoque validade').lean(),
    ])
    res.json({ zerados, baixos, vencendo })
  } catch (error) {
    logger.error('Erro ao buscar alertas:', error)
    res.status(500).json({ mensagem: 'Erro ao buscar alertas' })
  }
}

const reajustarPrecos = async (req, res) => {
  try {
    const { percentual, categoriaId } = req.body
    if (!percentual || percentual === 0) return res.status(400).json({ mensagem: 'Informe um percentual válido' })
    const filtro = { ativo: true }
    if (categoriaId) filtro.categoria = categoriaId
    const produtos = await Produto.find(filtro).select('precoVenda').lean()
    const fator = 1 + (percentual / 100)
    if (produtos.length > 0) {
      await Produto.bulkWrite(produtos.map(p => ({
        updateOne: {
          filter: { _id: p._id },
          update: { precoVenda: Math.round(p.precoVenda * fator * 100) / 100 }
        }
      })))
    }
    await Log.create({
      usuario: req.user._id, nomeUsuario: req.user.nome,
      acao: 'preco_alterado',
      detalhes: `Reajuste em massa ${percentual > 0 ? '+' : ''}${percentual}% em ${produtos.length} produto(s)${categoriaId ? ' da categoria selecionada' : ''}`,
    })
    res.json({ atualizados: produtos.length, mensagem: `${produtos.length} produto(s) reajustados com sucesso` })
  } catch (error) {
    logger.error('Erro no reajuste de preços:', error)
    res.status(500).json({ mensagem: 'Erro ao reajustar preços' })
  }
}

const historicoPreco = async (req, res) => {
  try {
    const historico = await HistoricoPreco.find({ produto: req.params.id })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean()
    res.json({ historico })
  } catch (error) {
    logger.error('Erro ao buscar histórico de preços:', error)
    res.status(500).json({ mensagem: 'Erro ao buscar histórico' })
  }
}

const fixarCsosn = async (req, res) => {
  try {
    const result = await Produto.updateMany(
      { csosn: '400' },
      { $set: { csosn: '102' } }
    )
    logger.info(`Fix CSOSN: ${result.modifiedCount} produtos atualizados de 400 → 102`)
    res.json({ mensagem: `${result.modifiedCount} produto(s) atualizados de CSOSN 400 → 102` })
  } catch (error) {
    logger.error('Erro ao fixar CSOSN:', error)
    res.status(500).json({ mensagem: 'Erro ao atualizar CSOSN dos produtos' })
  }
}

module.exports = { listar, buscarPorCodigo, buscarPorId, criar, atualizar, deletar, alertas, reajustarPrecos, historicoPreco, fixarCsosn }