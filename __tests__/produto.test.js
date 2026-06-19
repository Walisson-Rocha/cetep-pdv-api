jest.mock('../src/config/database')
jest.mock('../src/models/Produto')
jest.mock('../src/models/MovimentoEstoque')
jest.mock('../src/models/Log')
jest.mock('../src/middleware/auth.middleware', () => ({
  protect: (req, _res, next) => {
    req.user = { _id: 'usr1', nome: 'Admin', perfil: 'admin' }
    next()
  },
  authorize: () => (_req, _res, next) => next(),
}))

const request = require('supertest')
const express = require('express')
const Produto = require('../src/models/Produto')
const Log = require('../src/models/Log')

const app = express()
app.use(express.json())
app.use('/api/produtos', require('../src/routes/produto.routes'))

beforeEach(() => jest.clearAllMocks())

// ─── GET /api/produtos ────────────────────────────────────────────────────────
describe('GET /api/produtos', () => {
  test('200 retorna lista de produtos ativos', async () => {
    const produtos = [
      { _id: '507f1f77bcf86cd799439011', nome: 'Caneta', precoVenda: 5, statusEstoque: 'normal' },
      { _id: '507f1f77bcf86cd799439012', nome: 'Caderno', precoVenda: 15, statusEstoque: 'normal' },
    ]
    Produto.find.mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      skip: jest.fn().mockResolvedValue(produtos),
    })
    Produto.countDocuments.mockResolvedValue(2)
    const res = await request(app).get('/api/produtos')
    expect(res.status).toBe(200)
    expect(res.body.produtos).toHaveLength(2)
    expect(res.body.total).toBe(2)
  })

  test('filtra por busca quando parâmetro fornecido', async () => {
    Produto.find.mockReturnValue({
      populate: jest.fn().mockReturnThis(), sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(), skip: jest.fn().mockResolvedValue([]),
    })
    Produto.countDocuments.mockResolvedValue(0)
    await request(app).get('/api/produtos?busca=caneta')
    expect(Produto.find).toHaveBeenCalledWith(expect.objectContaining({
      $or: expect.arrayContaining([expect.objectContaining({ nome: expect.any(Object) })])
    }))
  })
})

// ─── GET /api/produtos/alertas ────────────────────────────────────────────────
describe('GET /api/produtos/alertas', () => {
  test('200 retorna zerados, baixos e vencendo', async () => {
    Produto.find.mockReturnValue({ populate: jest.fn().mockResolvedValue([]) })
    const res = await request(app).get('/api/produtos/alertas')
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('zerados')
    expect(res.body).toHaveProperty('baixos')
    expect(res.body).toHaveProperty('vencendo')
  })

  test('classifica zerados vs baixos corretamente', async () => {
    const produtos = [
      { _id: '507f1f77bcf86cd799439011', estoque: 0, estoqueMinimo: 5, validade: null },
      { _id: '507f1f77bcf86cd799439012', estoque: 2, estoqueMinimo: 5, validade: null },
      { _id: '507f1f77bcf86cd799439013', estoque: 20, estoqueMinimo: 5, validade: null },
    ]
    Produto.find.mockReturnValue({ populate: jest.fn().mockResolvedValue(produtos) })
    const res = await request(app).get('/api/produtos/alertas')
    expect(res.body.zerados.map(p => p._id)).toContain('507f1f77bcf86cd799439011')
    expect(res.body.baixos.map(p => p._id)).toContain('507f1f77bcf86cd799439012')
    expect(res.body.zerados.map(p => p._id)).not.toContain('507f1f77bcf86cd799439013')
    expect(res.body.baixos.map(p => p._id)).not.toContain('507f1f77bcf86cd799439013')
  })

  test('identifica produtos vencendo em até 5 dias', async () => {
    const amanha = new Date()
    amanha.setDate(amanha.getDate() + 2)
    const produtos = [{ _id: '507f1f77bcf86cd799439011', estoque: 10, estoqueMinimo: 5, validade: amanha }]
    Produto.find.mockReturnValue({ populate: jest.fn().mockResolvedValue(produtos) })
    const res = await request(app).get('/api/produtos/alertas')
    expect(res.body.vencendo.map(p => p._id)).toContain('507f1f77bcf86cd799439011')
  })
})

// ─── POST /api/produtos ───────────────────────────────────────────────────────
describe('POST /api/produtos', () => {
  test('201 cria produto e registra log', async () => {
    // O controller chama produto.populate() na instância retornada pelo create
    const mockPopulate = jest.fn().mockResolvedValue(undefined)
    const produto = { _id: '507f1f77bcf86cd799439011', nome: 'Caneta', precoVenda: 5, populate: mockPopulate }
    Produto.create.mockResolvedValue(produto)
    Log.create.mockResolvedValue({})
    const res = await request(app).post('/api/produtos').send({
      nome: 'Caneta', precoVenda: 5, categoria: '507f1f77bcf86cd799439021',
    })
    expect(res.status).toBe(201)
    expect(mockPopulate).toHaveBeenCalled()
    expect(Log.create).toHaveBeenCalledWith(expect.objectContaining({ acao: 'produto_criado' }))
  })

  test('400 quando código de barras duplicado', async () => {
    const err = new Error(); err.code = 11000
    Produto.create.mockRejectedValue(err)
    const res = await request(app).post('/api/produtos').send({
      nome: 'Caneta', precoVenda: 5, categoria: '507f1f77bcf86cd799439021', codigoBarras: '1234',
    })
    expect(res.status).toBe(400)
    expect(res.body.mensagem).toMatch(/código de barras/i)
  })
})

// ─── PUT /api/produtos/:id ────────────────────────────────────────────────────
describe('PUT /api/produtos/:id', () => {
  test('200 atualiza produto', async () => {
    Produto.findById.mockResolvedValue({ precoVenda: 5 })
    // O controller encadeia .findByIdAndUpdate().populate()
    const produto = { _id: '507f1f77bcf86cd799439011', nome: 'Caneta Azul', precoVenda: 6 }
    Produto.findByIdAndUpdate = jest.fn().mockReturnValue({
      populate: jest.fn().mockResolvedValue(produto),
    })
    Log.create.mockResolvedValue({})
    const res = await request(app).put('/api/produtos/507f1f77bcf86cd799439011').send({ nome: 'Caneta Azul', precoVenda: 6 })
    expect(res.status).toBe(200)
    expect(res.body.produto.nome).toBe('Caneta Azul')
  })

  test('registra log preco_alterado quando preço muda', async () => {
    Produto.findById.mockResolvedValue({ precoVenda: 5, nome: 'Caneta', _id: '507f1f77bcf86cd799439011' })
    Produto.findByIdAndUpdate = jest.fn().mockReturnValue({
      populate: jest.fn().mockResolvedValue({ _id: '507f1f77bcf86cd799439011', precoVenda: 8 }),
    })
    Log.create.mockResolvedValue({})
    await request(app).put('/api/produtos/507f1f77bcf86cd799439011').send({ precoVenda: 8 })
    expect(Log.create).toHaveBeenCalledWith(expect.objectContaining({ acao: 'preco_alterado' }))
  })

  test('404 quando produto não existe', async () => {
    Produto.findById.mockResolvedValue(null)
    const res = await request(app).put('/api/produtos/507f1f77bcf86cd799439099').send({ precoVenda: 5 })
    expect(res.status).toBe(404)
  })
})

// ─── DELETE /api/produtos/:id ─────────────────────────────────────────────────
describe('DELETE /api/produtos/:id', () => {
  test('200 soft delete — não verifica existência, apenas desativa', async () => {
    // O controller não verifica se o produto existe, apenas faz findByIdAndUpdate
    Produto.findByIdAndUpdate = jest.fn().mockResolvedValue({ _id: '507f1f77bcf86cd799439011', ativo: false })
    const res = await request(app).delete('/api/produtos/507f1f77bcf86cd799439011')
    expect(res.status).toBe(200)
    expect(res.body.mensagem).toMatch(/removido/i)
    expect(Produto.findByIdAndUpdate).toHaveBeenCalledWith('507f1f77bcf86cd799439011', { ativo: false })
  })
})
