jest.mock('../src/config/database')
jest.mock('../src/models/Retirada')
jest.mock('../src/models/User')
jest.mock('../src/models/Produto')
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
const Retirada = require('../src/models/Retirada')
const User = require('../src/models/User')
const Produto = require('../src/models/Produto')
const Log = require('../src/models/Log')

const app = express()
app.use(express.json())
app.use('/api/retiradas', require('../src/routes/retirada.routes'))

beforeEach(() => jest.clearAllMocks())

// ─── GET /api/retiradas ───────────────────────────────────────────────────────
describe('GET /api/retiradas', () => {
  test('200 retorna retiradas do mês', async () => {
    const retiradas = [{ _id: 'r1', total: 50, mes: 202605 }]
    Retirada.countDocuments.mockResolvedValue(1)
    Retirada.find.mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue(retiradas),
    })
    const res = await request(app).get('/api/retiradas?mes=202605')
    expect(res.status).toBe(200)
    expect(res.body.retiradas).toHaveLength(1)
    expect(res.body.mes).toBe(202605)
  })
})

// ─── GET /api/retiradas/folha ─────────────────────────────────────────────────
describe('GET /api/retiradas/folha', () => {
  test('200 retorna folha agrupada por colaborador', async () => {
    const colId = { toString: () => 'col1' }
    const colaboradores = [{ _id: colId, nome: 'Fernanda', email: 'f@test.com' }]
    const retiradas = [
      { colaborador: { _id: colId }, total: 80, itens: [{ nomeProduto: 'Caneta', quantidade: 2 }] },
      { colaborador: { _id: colId }, total: 40, itens: [{ nomeProduto: 'Lápis', quantidade: 4 }] },
    ]
    User.find.mockResolvedValue(colaboradores)
    Retirada.find.mockReturnValue({ populate: jest.fn().mockResolvedValue(retiradas) })
    const res = await request(app).get('/api/retiradas/folha?mes=202605')
    expect(res.status).toBe(200)
    expect(res.body.folha).toHaveLength(1)
    expect(res.body.folha[0].totalRetiradas).toBe(120)
    expect(res.body.totalGeral).toBe(120)
  })

  test('200 colaborador sem retiradas tem total zero', async () => {
    const colId = { toString: () => 'col2' }
    User.find.mockResolvedValue([{ _id: colId, nome: 'Carlos', email: 'c@test.com' }])
    Retirada.find.mockReturnValue({ populate: jest.fn().mockResolvedValue([]) })
    const res = await request(app).get('/api/retiradas/folha?mes=202605')
    expect(res.status).toBe(200)
    expect(res.body.folha[0].totalRetiradas).toBe(0)
    expect(res.body.totalGeral).toBe(0)
  })
})

// ─── POST /api/retiradas ──────────────────────────────────────────────────────
describe('POST /api/retiradas', () => {
  test('400 quando colaborador tem perfil incorreto', async () => {
    User.findById.mockResolvedValue({ _id: 'usr2', nome: 'João', perfil: 'caixa' })
    const res = await request(app).post('/api/retiradas').send({
      colaboradorId: 'usr2',
      itens: [{ produtoId: 'prod1', quantidade: 2 }],
    })
    expect(res.status).toBe(400)
    expect(res.body.mensagem).toMatch(/colaborador inválido/i)
  })

  test('400 quando colaborador não existe (perfil !== colaborador)', async () => {
    // A rota retorna 400 para colaborador null — não 404
    User.findById.mockResolvedValue(null)
    const res = await request(app).post('/api/retiradas').send({
      colaboradorId: 'inexistente',
      itens: [{ produtoId: 'p1', quantidade: 1 }],
    })
    expect(res.status).toBe(400)
    expect(res.body.mensagem).toMatch(/colaborador inválido/i)
  })

  test('400 quando estoque insuficiente', async () => {
    User.findById.mockResolvedValue({ _id: 'col1', nome: 'Fernanda', perfil: 'colaborador' })
    Produto.findById.mockResolvedValue({ _id: 'p1', nome: 'Caneta', estoque: 1, precoVenda: 5 })
    const res = await request(app).post('/api/retiradas').send({
      colaboradorId: 'col1',
      itens: [{ produtoId: 'p1', quantidade: 5 }],
    })
    expect(res.status).toBe(400)
    expect(res.body.mensagem).toMatch(/estoque insuficiente/i)
  })

  test('201 registra retirada e chama findByIdAndUpdate para descontar estoque', async () => {
    User.findById.mockResolvedValue({ _id: 'col1', nome: 'Fernanda', perfil: 'colaborador' })
    Produto.findById.mockResolvedValue({ _id: 'p1', nome: 'Caneta', estoque: 10, precoVenda: 5 })
    // A rota usa Produto.findByIdAndUpdate (não produto.save) para decrementar estoque
    Produto.findByIdAndUpdate = jest.fn().mockResolvedValue({})
    const retirada = { _id: 'ret1', total: 10, mes: 202605 }
    Retirada.create.mockResolvedValue(retirada)
    Log.create.mockResolvedValue({})
    const res = await request(app).post('/api/retiradas').send({
      colaboradorId: 'col1',
      itens: [{ produtoId: 'p1', quantidade: 2 }],
    })
    expect(res.status).toBe(201)
    expect(Produto.findByIdAndUpdate).toHaveBeenCalledWith(
      expect.anything(),
      { $inc: { estoque: -2 } }
    )
    expect(Retirada.create).toHaveBeenCalledWith(expect.objectContaining({
      colaborador: 'col1',
      total: 10,
    }))
    expect(Log.create).toHaveBeenCalledWith(expect.objectContaining({ acao: 'retirada_criada' }))
  })

  test('400 quando itens não enviados', async () => {
    const res = await request(app).post('/api/retiradas').send({ colaboradorId: 'col1' })
    expect(res.status).toBe(400)
    expect(res.body.mensagem).toMatch(/obrigatórios/i)
  })
})

// ─── DELETE /api/retiradas/:id ────────────────────────────────────────────────
describe('DELETE /api/retiradas/:id', () => {
  test('200 estorna retirada e restaura estoque via findByIdAndUpdate', async () => {
    const retirada = {
      _id: 'ret1',
      itens: [
        { produto: 'p1', nomeProduto: 'Caneta', quantidade: 2 },
        { produto: 'p2', nomeProduto: 'Caderno', quantidade: 1 },
      ],
    }
    Retirada.findById.mockResolvedValue(retirada)
    Produto.findByIdAndUpdate = jest.fn().mockResolvedValue({})
    Retirada.findByIdAndDelete = jest.fn().mockResolvedValue({})
    const res = await request(app).delete('/api/retiradas/ret1')
    expect(res.status).toBe(200)
    expect(Produto.findByIdAndUpdate).toHaveBeenCalledTimes(2)
    expect(Produto.findByIdAndUpdate).toHaveBeenCalledWith('p1', { $inc: { estoque: 2 } })
    expect(Produto.findByIdAndUpdate).toHaveBeenCalledWith('p2', { $inc: { estoque: 1 } })
    expect(Retirada.findByIdAndDelete).toHaveBeenCalledWith('ret1')
  })

  test('404 quando retirada não existe', async () => {
    Retirada.findById.mockResolvedValue(null)
    const res = await request(app).delete('/api/retiradas/inexistente')
    expect(res.status).toBe(404)
  })
})
