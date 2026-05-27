jest.mock('../src/config/database')
jest.mock('../src/models/Cliente')
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
const Cliente = require('../src/models/Cliente')
const Log = require('../src/models/Log')

const app = express()
app.use(express.json())
app.use('/api/clientes', require('../src/routes/cliente.routes'))

beforeEach(() => jest.clearAllMocks())

// ─── GET /api/clientes ────────────────────────────────────────────────────────
describe('GET /api/clientes', () => {
  test('200 retorna lista de clientes ativos', async () => {
    const clientes = [
      { _id: 'c1', nome: 'João Silva', tipo: 'PF', saldoFiado: 0 },
      { _id: 'c2', nome: 'Empresa LTDA', tipo: 'PJ', saldoFiado: 150 },
    ]
    Cliente.find.mockReturnValue({ sort: jest.fn().mockResolvedValue(clientes) })
    const res = await request(app).get('/api/clientes')
    expect(res.status).toBe(200)
    expect(res.body.clientes).toHaveLength(2)
  })

  test('aplica busca por nome via regex', async () => {
    Cliente.find.mockReturnValue({ sort: jest.fn().mockResolvedValue([]) })
    await request(app).get('/api/clientes?busca=João')
    expect(Cliente.find).toHaveBeenCalledWith(expect.objectContaining({
      ativo: true,
      $or: expect.arrayContaining([expect.objectContaining({ nome: expect.any(Object) })])
    }))
  })
})

// ─── POST /api/clientes ───────────────────────────────────────────────────────
describe('POST /api/clientes', () => {
  test('201 cria cliente PF', async () => {
    const cliente = { _id: 'c1', nome: 'João Silva', tipo: 'PF', cpf: '12345678900' }
    Cliente.create.mockResolvedValue(cliente)
    Log.create.mockResolvedValue({})
    const res = await request(app).post('/api/clientes').send({
      nome: 'João Silva', tipo: 'PF', cpf: '12345678900',
    })
    expect(res.status).toBe(201)
    expect(Log.create).toHaveBeenCalledWith(expect.objectContaining({ acao: 'cliente_criado' }))
  })

  test('400 quando nome não é fornecido', async () => {
    // A rota valida o nome antes de chamar Cliente.create
    const res = await request(app).post('/api/clientes').send({ tipo: 'PF' })
    expect(res.status).toBe(400)
    expect(res.body.mensagem).toMatch(/nome.*obrigatório/i)
    expect(Cliente.create).not.toHaveBeenCalled()
  })
})

// ─── PUT /api/clientes/:id ────────────────────────────────────────────────────
describe('PUT /api/clientes/:id', () => {
  test('200 atualiza dados do cliente', async () => {
    const atualizado = { _id: 'c1', nome: 'João Atualizado' }
    Cliente.findByIdAndUpdate = jest.fn().mockResolvedValue(atualizado)
    const res = await request(app).put('/api/clientes/c1').send({ nome: 'João Atualizado' })
    expect(res.status).toBe(200)
    expect(res.body.cliente.nome).toBe('João Atualizado')
  })

  test('404 quando cliente não existe', async () => {
    Cliente.findByIdAndUpdate = jest.fn().mockResolvedValue(null)
    const res = await request(app).put('/api/clientes/inexistente').send({ nome: 'X' })
    expect(res.status).toBe(404)
  })
})

// ─── PUT /api/clientes/:id/quitar ─────────────────────────────────────────────
describe('PUT /api/clientes/:id/quitar', () => {
  test('200 quita parcialmente o fiado usando save()', async () => {
    // A rota usa findById + cliente.saldoFiado -= valor + cliente.save()
    const mockSave = jest.fn().mockResolvedValue(true)
    const cliente = { _id: 'c1', nome: 'João', saldoFiado: 100, save: mockSave }
    Cliente.findById.mockResolvedValue(cliente)
    Log.create.mockResolvedValue({})
    const res = await request(app).put('/api/clientes/c1/quitar').send({ valor: 40 })
    expect(res.status).toBe(200)
    expect(cliente.saldoFiado).toBe(60)
    expect(mockSave).toHaveBeenCalled()
    expect(res.body.mensagem).toMatch(/fiado quitado/i)
  })

  test('400 quando valor maior que saldo devedor', async () => {
    Cliente.findById.mockResolvedValue({ _id: 'c1', saldoFiado: 30, save: jest.fn() })
    const res = await request(app).put('/api/clientes/c1/quitar').send({ valor: 50 })
    expect(res.status).toBe(400)
    expect(res.body.saldoAtual).toBe(30)
  })

  test('400 quando valor é zero', async () => {
    Cliente.findById.mockResolvedValue({ _id: 'c1', saldoFiado: 100, save: jest.fn() })
    const res = await request(app).put('/api/clientes/c1/quitar').send({ valor: 0 })
    expect(res.status).toBe(400)
    expect(res.body.mensagem).toMatch(/valor inválido/i)
  })

  test('400 quando valor é negativo', async () => {
    Cliente.findById.mockResolvedValue({ _id: 'c1', saldoFiado: 100, save: jest.fn() })
    const res = await request(app).put('/api/clientes/c1/quitar').send({ valor: -10 })
    expect(res.status).toBe(400)
  })

  test('404 quando cliente não existe', async () => {
    Cliente.findById.mockResolvedValue(null)
    const res = await request(app).put('/api/clientes/inexistente/quitar').send({ valor: 10 })
    expect(res.status).toBe(404)
  })
})
