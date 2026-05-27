jest.mock('../src/config/database', () => jest.fn())
jest.mock('../src/middleware/auth.middleware', () => ({
  protect: (req, res, next) => {
    req.user = { _id: 'usr123', nome: 'Admin', perfil: 'admin' }
    next()
  },
  authorize: () => (req, res, next) => next(),
}))
jest.mock('../src/models/Log', () => ({ create: jest.fn().mockResolvedValue({}) }))

const makeVenda = (total, daysAgo = 0) => {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  return { total, createdAt: d, cancelada: false }
}

const makeDespesa = (valor, categoria = 'outros', daysAgo = 0) => {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  return { valor, categoria, createdAt: d, paga: false }
}

jest.mock('../src/models/Venda', () => ({ find: jest.fn() }))
jest.mock('../src/models/Despesa', () => ({
  find: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  findByIdAndDelete: jest.fn(),
}))
jest.mock('../src/models/Cliente', () => ({ find: jest.fn() }))

const request = require('supertest')
const express = require('express')
const Venda = require('../src/models/Venda')
const Despesa = require('../src/models/Despesa')
const Cliente = require('../src/models/Cliente')

const app = express()
app.use(express.json())
app.use('/api/financeiro', require('../src/routes/financeiro.routes'))

describe('GET /api/financeiro', () => {
  beforeEach(() => jest.clearAllMocks())

  test('calcula totalReceita, totalDespesas e lucro corretamente', async () => {
    Venda.find.mockResolvedValue([makeVenda(1000), makeVenda(500)])
    Despesa.find.mockReturnValue({
      sort: jest.fn().mockResolvedValue([makeDespesa(300)]),
    })
    Cliente.find.mockReturnValue({ sort: jest.fn().mockResolvedValue([]) })

    const res = await request(app).get('/api/financeiro')
    expect(res.status).toBe(200)
    expect(res.body.totalReceita).toBe(1500)
    expect(res.body.totalDespesas).toBe(300)
    expect(res.body.lucro).toBe(1200)
  })

  test('margemLucro é 0 quando não há receita', async () => {
    Venda.find.mockResolvedValue([])
    Despesa.find.mockReturnValue({
      sort: jest.fn().mockResolvedValue([makeDespesa(100)]),
    })
    Cliente.find.mockReturnValue({ sort: jest.fn().mockResolvedValue([]) })

    const res = await request(app).get('/api/financeiro')
    expect(res.status).toBe(200)
    expect(res.body.totalReceita).toBe(0)
    expect(res.body.margemLucro).toBe(0)
    expect(res.body.lucro).toBe(-100)
  })

  test('retorna fluxoCaixa agrupado por dia com receita e despesas', async () => {
    Venda.find.mockResolvedValue([makeVenda(200, 1)])
    Despesa.find.mockReturnValue({
      sort: jest.fn().mockResolvedValue([makeDespesa(50, 'aluguel', 1)]),
    })
    Cliente.find.mockReturnValue({ sort: jest.fn().mockResolvedValue([]) })

    const res = await request(app).get('/api/financeiro')
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.fluxoCaixa)).toBe(true)
    const diaComVenda = res.body.fluxoCaixa.find(f => f.receita === 200)
    expect(diaComVenda).toBeDefined()
    expect(diaComVenda.despesas).toBe(50)
  })

  test('agrupa despesasPorCategoria corretamente', async () => {
    Venda.find.mockResolvedValue([])
    Despesa.find.mockReturnValue({
      sort: jest.fn().mockResolvedValue([
        makeDespesa(400, 'aluguel'),
        makeDespesa(100, 'energia'),
        makeDespesa(200, 'aluguel'),
      ]),
    })
    Cliente.find.mockReturnValue({ sort: jest.fn().mockResolvedValue([]) })

    const res = await request(app).get('/api/financeiro')
    expect(res.status).toBe(200)
    expect(res.body.despesasPorCategoria.aluguel).toBe(600)
    expect(res.body.despesasPorCategoria.energia).toBe(100)
  })

  test('retorna contasReceber com clientes com saldo fiado', async () => {
    Venda.find.mockResolvedValue([])
    Despesa.find.mockReturnValue({ sort: jest.fn().mockResolvedValue([]) })
    Cliente.find.mockReturnValue({
      sort: jest.fn().mockResolvedValue([
        { nome: 'João', saldoFiado: 150 },
        { nome: 'Maria', saldoFiado: 80 },
      ]),
    })

    const res = await request(app).get('/api/financeiro')
    expect(res.status).toBe(200)
    expect(res.body.contasReceber).toHaveLength(2)
    expect(res.body.contasReceber[0].saldoFiado).toBe(150)
  })
})

describe('PUT /api/financeiro/despesas/:id', () => {
  beforeEach(() => jest.clearAllMocks())

  test('marca despesa como paga', async () => {
    const despesaAtualizada = { _id: 'dep1', descricao: 'Aluguel', paga: true, pagaEm: new Date() }
    Despesa.findByIdAndUpdate.mockResolvedValue(despesaAtualizada)

    const res = await request(app)
      .put('/api/financeiro/despesas/dep1')
      .send({ paga: true })
    expect(res.status).toBe(200)
    expect(res.body.despesa.paga).toBe(true)
  })

  test('404 quando despesa não existe', async () => {
    Despesa.findByIdAndUpdate.mockResolvedValue(null)
    const res = await request(app)
      .put('/api/financeiro/despesas/inexistente')
      .send({ paga: true })
    expect(res.status).toBe(404)
  })
})

describe('DELETE /api/financeiro/despesas/:id', () => {
  beforeEach(() => jest.clearAllMocks())

  test('remove despesa existente', async () => {
    Despesa.findByIdAndDelete.mockResolvedValue({ _id: 'dep1', descricao: 'Energia' })
    const res = await request(app).delete('/api/financeiro/despesas/dep1')
    expect(res.status).toBe(200)
    expect(res.body.mensagem).toMatch(/removida/)
  })

  test('404 quando despesa não existe', async () => {
    Despesa.findByIdAndDelete.mockResolvedValue(null)
    const res = await request(app).delete('/api/financeiro/despesas/xxx')
    expect(res.status).toBe(404)
  })
})
