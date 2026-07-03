jest.mock('../src/config/database')
jest.mock('../src/models/Caixa')
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
const Caixa = require('../src/models/Caixa')
const Log = require('../src/models/Log')

const app = express()
app.use(express.json())
app.use('/api/caixa', require('../src/routes/caixa.routes'))

beforeEach(() => jest.clearAllMocks())

// ─── GET /api/caixa/atual ─────────────────────────────────────────────────────
describe('GET /api/caixa/atual', () => {
  test('200 retorna caixa aberto quando existe', async () => {
    const caixa = { _id: 'cx1', status: 'aberto', saldoInicial: 100 }
    Caixa.findOne.mockReturnValue({ populate: jest.fn().mockResolvedValue(caixa) })
    const res = await request(app).get('/api/caixa/atual')
    expect(res.status).toBe(200)
    expect(res.body.caixa._id).toBe('cx1')
  })

  test('200 retorna null quando não há caixa aberto', async () => {
    Caixa.findOne.mockReturnValue({ populate: jest.fn().mockResolvedValue(null) })
    const res = await request(app).get('/api/caixa/atual')
    expect(res.status).toBe(200)
    expect(res.body.caixa).toBeNull()
  })
})

// ─── POST /api/caixa/abrir ────────────────────────────────────────────────────
describe('POST /api/caixa/abrir', () => {
  test('201 abre caixa com saldo inicial', async () => {
    Caixa.findOne.mockResolvedValue(null)
    Caixa.create.mockResolvedValue({ _id: 'cx1', saldoInicial: 200 })
    Log.create.mockResolvedValue({})
    const res = await request(app).post('/api/caixa/abrir').send({ saldoInicial: 200 })
    expect(res.status).toBe(201)
    expect(res.body.caixa.saldoInicial).toBe(200)
    expect(Log.create).toHaveBeenCalledWith(expect.objectContaining({ acao: 'caixa_aberto' }))
  })

  test('201 abre caixa sem saldo inicial (default 0)', async () => {
    Caixa.findOne.mockResolvedValue(null)
    Caixa.create.mockResolvedValue({ _id: 'cx1', saldoInicial: 0 })
    Log.create.mockResolvedValue({})
    const res = await request(app).post('/api/caixa/abrir').send({})
    expect(res.status).toBe(201)
    expect(Caixa.create).toHaveBeenCalledWith(expect.objectContaining({ saldoInicial: 0 }))
  })

  test('400 quando já existe caixa aberto', async () => {
    Caixa.findOne.mockResolvedValue({ _id: 'cx1', status: 'aberto' })
    const res = await request(app).post('/api/caixa/abrir').send({ saldoInicial: 0 })
    expect(res.status).toBe(400)
    expect(res.body.mensagem).toMatch(/já existe um caixa aberto/i)
    expect(Caixa.create).not.toHaveBeenCalled()
  })
})

// ─── PUT /api/caixa/fechar ────────────────────────────────────────────────────
describe('PUT /api/caixa/fechar', () => {
  test('200 fecha caixa e calcula diferença corretamente', async () => {
    const mockSave = jest.fn().mockResolvedValue(true)
    const caixa = {
      _id: 'cx1', status: 'aberto',
      saldoInicial: 100, totalVendas: 300,
      sangrias: [{ valor: 50 }],
      save: mockSave,
    }
    Caixa.findOne.mockResolvedValue(caixa)
    Log.create.mockResolvedValue({})
    // saldoFinal = 100 + 300 - 50 = 350 | diferença = 340 - 350 = -10
    const res = await request(app).put('/api/caixa/cx1/fechar').send({ saldoContado: 340 })
    expect(res.status).toBe(200)
    expect(caixa.status).toBe('fechado')
    expect(caixa.saldoFinal).toBe(350)
    expect(caixa.diferenca).toBe(-10)
    expect(mockSave).toHaveBeenCalled()
    expect(Log.create).toHaveBeenCalledWith(expect.objectContaining({ acao: 'caixa_fechado' }))
  })

  test('200 diferença positiva quando contado maior que esperado', async () => {
    const caixa = { _id: 'cx1', saldoInicial: 100, totalVendas: 200, sangrias: [], save: jest.fn() }
    Caixa.findOne.mockResolvedValue(caixa)
    Log.create.mockResolvedValue({})
    await request(app).put('/api/caixa/cx1/fechar').send({ saldoContado: 320 })
    // saldoFinal = 300, diferenca = 20
    expect(caixa.diferenca).toBe(20)
  })

  test('400 quando não há caixa aberto', async () => {
    Caixa.findOne.mockResolvedValue(null)
    const res = await request(app).put('/api/caixa/cx1/fechar').send({ saldoContado: 100 })
    expect(res.status).toBe(400)
    expect(res.body.mensagem).toMatch(/não encontrado ou já fechado/i)
  })
})

// ─── POST /api/caixa/sangria ──────────────────────────────────────────────────
describe('POST /api/caixa/sangria', () => {
  test('200 registra sangria no caixa aberto', async () => {
    const caixa = {
      _id: 'cx1', sangrias: [],
      push: jest.fn(),
      save: jest.fn().mockResolvedValue(true),
    }
    // Simula o comportamento de array.push na sangrias
    caixa.sangrias.push = jest.fn()
    Caixa.findOne.mockResolvedValue(caixa)
    Log.create.mockResolvedValue({})
    const res = await request(app).post('/api/caixa/sangria').send({ valor: 50, motivo: 'Troco pequeno' })
    expect(res.status).toBe(200)
    expect(caixa.sangrias.push).toHaveBeenCalledWith(expect.objectContaining({ valor: 50, motivo: 'Troco pequeno' }))
    expect(Log.create).toHaveBeenCalledWith(expect.objectContaining({ acao: 'sangria' }))
  })

  test('400 quando não há caixa aberto', async () => {
    Caixa.findOne.mockResolvedValue(null)
    const res = await request(app).post('/api/caixa/sangria').send({ valor: 50, motivo: 'Teste' })
    expect(res.status).toBe(400)
    expect(res.body.mensagem).toMatch(/não há caixa aberto/i)
  })
})
