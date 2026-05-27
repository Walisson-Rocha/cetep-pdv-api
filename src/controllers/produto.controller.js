const Produto = require('../models/Produto')
const MovimentoEstoque = require('../models/MovimentoEstoque')
const Log = require('../models/Log')

const listar = async (req, res) => {
  try {
    const { busca, categoria, status, page = 1, limit = 50 } = req.query
    const filtro = { ativo: true }
    if (busca) {
      filtro.$or = [
        { nome: { $regex: busca, $options: 'i' } },
        { codigoBarras: busca }
      ]
    }
    if (categoria) filtro.categoria = categoria
    const produtos = await Produto.find(filtro)
      .populate('categoria', 'nome cor icone')
      .sort({ nome: 1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
    const total = await Produto.countDocuments(filtro)
    const lista = status ? produtos.filter(p => p.statusEstoque === status) : produtos
    res.json({ produtos: lista, total, paginas: Math.ceil(total / limit) })
  } catch (error) {
    console.error('Erro ao listar produtos:', error)
    res.status(500).json({ mensagem: 'Erro ao listar produtos' })
  }
}

const buscarPorCodigo = async (req, res) => {
  try {
    const produto = await Produto.findOne({
      codigoBarras: req.params.codigo,
      ativo: true
    }).populate('categoria', 'nome cor icone')
    if (!produto) return res.status(404).json({ mensagem: 'Produto não encontrado' })
    res.json({ produto })
  } catch (error) {
    console.error('Erro na busca:', error)
    res.status(500).json({ mensagem: 'Erro na busca' })
  }
}

const buscarPorId = async (req, res) => {
  try {
    const produto = await Produto.findById(req.params.id)
      .populate('categoria', 'nome cor icone')
    if (!produto) return res.status(404).json({ mensagem: 'Produto não encontrado' })
    res.json({ produto })
  } catch (error) {
    console.error('Erro ao buscar produto:', error)
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
    console.error('Erro ao criar produto:', error)
    res.status(500).json({ mensagem: 'Erro ao criar produto' })
  }
}

const atualizar = async (req, res) => {
  try {
    const produtoAntes = await Produto.findById(req.params.id)
    if (!produtoAntes) return res.status(404).json({ mensagem: 'Produto não encontrado' })
    if (req.body.precoVenda && req.body.precoVenda !== produtoAntes.precoVenda) {
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
    res.json({ produto, mensagem: 'Produto atualizado' })
  } catch (error) {
    console.error('Erro ao atualizar produto:', error)
    res.status(500).json({ mensagem: 'Erro ao atualizar produto' })
  }
}

const deletar = async (req, res) => {
  try {
    await Produto.findByIdAndUpdate(req.params.id, { ativo: false })
    res.json({ mensagem: 'Produto removido com sucesso' })
  } catch (error) {
    console.error('Erro ao remover produto:', error)
    res.status(500).json({ mensagem: 'Erro ao remover produto' })
  }
}

const alertas = async (req, res) => {
  try {
    const produtos = await Produto.find({ ativo: true }).populate('categoria', 'nome')
    const zerados = produtos.filter(p => p.estoque === 0)
    const baixos = produtos.filter(p => p.estoque > 0 && p.estoque <= p.estoqueMinimo)
    const vencendo = produtos.filter(p => {
      if (!p.validade) return false
      const dias = Math.ceil((new Date(p.validade) - new Date()) / (1000 * 60 * 60 * 24))
      return dias <= 5 && dias >= 0
    })
    res.json({ zerados, baixos, vencendo })
  } catch (error) {
    console.error('Erro ao buscar alertas:', error)
    res.status(500).json({ mensagem: 'Erro ao buscar alertas' })
  }
}

const reajustarPrecos = async (req, res) => {
  try {
    const { percentual, categoriaId } = req.body
    if (!percentual || percentual === 0) return res.status(400).json({ mensagem: 'Informe um percentual válido' })
    const filtro = { ativo: true }
    if (categoriaId) filtro.categoria = categoriaId
    const produtos = await Produto.find(filtro)
    const fator = 1 + (percentual / 100)
    for (const p of produtos) {
      const precoNovo = Math.round(p.precoVenda * fator * 100) / 100
      await Produto.findByIdAndUpdate(p._id, { precoVenda: precoNovo })
    }
    await Log.create({
      usuario: req.user._id, nomeUsuario: req.user.nome,
      acao: 'preco_alterado',
      detalhes: `Reajuste em massa ${percentual > 0 ? '+' : ''}${percentual}% em ${produtos.length} produto(s)${categoriaId ? ' da categoria selecionada' : ''}`,
    })
    res.json({ atualizados: produtos.length, mensagem: `${produtos.length} produto(s) reajustados com sucesso` })
  } catch (error) {
    console.error('Erro no reajuste de preços:', error)
    res.status(500).json({ mensagem: 'Erro ao reajustar preços' })
  }
}

module.exports = { listar, buscarPorCodigo, buscarPorId, criar, atualizar, deletar, alertas, reajustarPrecos }