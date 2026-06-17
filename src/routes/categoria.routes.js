const express = require('express')
const router = express.Router()
const Categoria = require('../models/Categoria')
const { protect, authorize } = require('../middleware/auth.middleware')

router.use(protect)

router.get('/', async (req, res) => {
  try {
    const categorias = await Categoria.find({ ativo: true }).sort({ nome: 1 })
    res.json({ categorias })
  } catch (error) {
    console.error('Erro ao buscar categorias:', error)
    res.status(500).json({ mensagem: 'Erro ao buscar categorias' })
  }
})

router.post('/', authorize('admin'), async (req, res) => {
  try {
    const { nome, cor, icone } = req.body
    if (!nome) return res.status(400).json({ mensagem: 'Nome é obrigatório' })
    const cat = await Categoria.create({ nome, cor, icone })
    res.status(201).json({ categoria: cat })
  } catch (error) {
    console.error('Erro ao criar categoria:', error)
    res.status(500).json({ mensagem: 'Erro ao criar categoria' })
  }
})

const CATEGORIAS_PADRAO = [
  { nome: 'Papelaria',                 cor: '#7C3AED', icone: '📒' },
  { nome: 'Escritório',                cor: '#6B7280', icone: '🗂️' },
  { nome: 'Saúde',                     cor: '#EF4444', icone: '❤️' },
  { nome: 'Lanchonete',                cor: '#F59E0B', icone: '🍔' },
  { nome: 'Bomboniere',                cor: '#EC4899', icone: '🍬' },
  { nome: 'Brinquedos',                cor: '#8B5CF6', icone: '🧸' },
  { nome: 'Utilidades do Lar',         cor: '#059669', icone: '🏠' },
  { nome: 'Armarinho',                 cor: '#D97706', icone: '🧵' },
  { nome: 'Variedades',                cor: '#3B82F6', icone: '🛍️' },
  { nome: 'Ferramentas',               cor: '#374151', icone: '🔧' },
  { nome: 'Embalagens',                cor: '#92400E', icone: '📦' },
  { nome: 'Informática e Eletrônicos', cor: '#1D4ED8', icone: '💻' },
  { nome: 'Uniforme',                  cor: '#1F2937', icone: '👔' },
  { nome: 'Espaço Mulher',             cor: '#DB2777', icone: '👗' },
  { nome: 'Roupa',                     cor: '#7C3AED', icone: '👕' },
  { nome: 'Alimentos',                 cor: '#16A97B', icone: '🌾' },
  { nome: 'Bebidas',                   cor: '#2563EB', icone: '💧' },
]

router.post('/seed', authorize('admin'), async (req, res) => {
  try {
    const existentes = await Categoria.find({}, 'nome').lean()
    const nomesExistentes = new Set(existentes.map(c => c.nome.toLowerCase()))
    const novas = CATEGORIAS_PADRAO.filter(c => !nomesExistentes.has(c.nome.toLowerCase()))
    if (novas.length === 0) {
      return res.json({ mensagem: 'Todas as categorias padrão já existem.', criadas: 0 })
    }
    await Categoria.insertMany(novas)
    res.json({ mensagem: `${novas.length} categoria${novas.length !== 1 ? 's' : ''} criada${novas.length !== 1 ? 's' : ''} com sucesso.`, criadas: novas.length })
  } catch (error) {
    console.error('Erro ao criar categorias padrão:', error)
    res.status(500).json({ mensagem: 'Erro ao criar categorias padrão' })
  }
})

router.put('/:id', authorize('admin'), async (req, res) => {
  try {
    const { nome, cor, icone, ativo } = req.body
    const cat = await Categoria.findByIdAndUpdate(
      req.params.id,
      { nome, cor, icone, ativo },
      { new: true, runValidators: true }
    )
    if (!cat) return res.status(404).json({ mensagem: 'Categoria não encontrada' })
    res.json({ categoria: cat })
  } catch (error) {
    console.error('Erro ao atualizar categoria:', error)
    res.status(500).json({ mensagem: 'Erro ao atualizar categoria' })
  }
})

router.delete('/:id', authorize('admin'), async (req, res) => {
  try {
    const cat = await Categoria.findByIdAndDelete(req.params.id)
    if (!cat) return res.status(404).json({ mensagem: 'Categoria não encontrada' })
    res.json({ mensagem: 'Categoria removida' })
  } catch (error) {
    console.error('Erro ao deletar categoria:', error)
    res.status(500).json({ mensagem: 'Erro ao deletar categoria' })
  }
})

module.exports = router
