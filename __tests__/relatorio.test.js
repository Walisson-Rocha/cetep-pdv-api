jest.mock('../src/config/database')
jest.mock('../src/models/Venda')
jest.mock('../src/models/Produto')
jest.mock('../src/models/Cliente')
jest.mock('../src/models/Log')
jest.mock('../src/models/Configuracao')
jest.mock('../src/middleware/auth.middleware', () => ({
  protect: (req, _res, next) => {
    req.user = { _id: 'usr1', nome: 'Admin', perfil: 'admin' }
    next()
  },
  authorize: () => (_req, _res, next) => next(),
}))

const request = require('supertest')
const express = require('express')
const Venda = require('../src/models/Venda')
const Produto = require('../src/models/Produto')
const Cliente = require('../src/models/Cliente')
const Log = require('../src/models/Log')
const Configuracao = require('../src/models/Configuracao')

const app = express()
app.use(express.json())
app.use('/api/relatorio', require('../src/routes/relatorio.routes'))

const mockVenda = (overrides = {}) => ({
  _id: 'v1', total: 100, formaPagamento: 'pix', cancelada: false, createdAt: new Date(),
  vendedor: { nome: 'Vendedor1', comissao: 5 },
  itens: [{ produto: { categoria: { nome: 'Bebidas', icone: '🍺' } }, nomeProduto: 'Cerveja', quantidade: 2, subtotal: 20 }],
  ...overrides,
})

beforeEach(() => {
  jest.clearAllMocks()
  Configuracao.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) })
})

// ─── GET /api/relatorio/vendas ────────────────────────────────────────────────
describe('GET /api/relatorio/vendas', () => {
  test('200 retorna relatório de vendas com totais', async () => {
    const vendas = [mockVenda(), mockVenda({ total: 50, formaPagamento: 'dinheiro' })]
    Venda.find.mockReturnValue({ populate: jest.fn().mockReturnThis(), sort: jest.fn().mockResolvedValue(vendas) })
    const res = await request(app).get('/api/relatorio/vendas')
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('total')
    expect(res.body).toHaveProperty('porFormaPagamento')
    expect(res.body).toHaveProperty('porVendedor')
    expect(res.body).toHaveProperty('porCategoria')
    expect(res.body.total).toBe(150)
  })

  test('200 retorna lista vazia quando não há vendas', async () => {
    Venda.find.mockReturnValue({ populate: jest.fn().mockReturnThis(), sort: jest.fn().mockResolvedValue([]) })
    const res = await request(app).get('/api/relatorio/vendas')
    expect(res.status).toBe(200)
    expect(res.body.total).toBe(0)
    expect(res.body.quantidade).toBe(0)
  })

  test('200 filtra por data quando início e fim informados', async () => {
    Venda.find.mockReturnValue({ populate: jest.fn().mockReturnThis(), sort: jest.fn().mockResolvedValue([]) })
    const res = await request(app).get('/api/relatorio/vendas?inicio=2026-01-01&fim=2026-01-31')
    expect(res.status).toBe(200)
    expect(Venda.find).toHaveBeenCalledWith(expect.objectContaining({ createdAt: expect.any(Object) }))
  })

  test('200 calcula comissão quando config comissao ativa', async () => {
    Configuracao.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue({ comissao: { ativa: true } }) })
    const vendas = [mockVenda()]
    Venda.find.mockReturnValue({ populate: jest.fn().mockReturnThis(), sort: jest.fn().mockResolvedValue(vendas) })
    const res = await request(app).get('/api/relatorio/vendas')
    expect(res.status).toBe(200)
    expect(res.body.comissaoAtiva).toBe(true)
  })

  test('500 retorna erro interno em falha', async () => {
    Venda.find.mockReturnValue({ populate: jest.fn().mockReturnThis(), sort: jest.fn().mockRejectedValue(new Error('DB down')) })
    const res = await request(app).get('/api/relatorio/vendas')
    expect(res.status).toBe(500)
  })
})

// ─── GET /api/relatorio/clientes ──────────────────────────────────────────────
describe('GET /api/relatorio/clientes', () => {
  test('200 retorna top compradores e inativos', async () => {
    const vendas = [
      { _id: 'v1', cliente: 'cli1', total: 200, createdAt: new Date() },
      { _id: 'v2', cliente: 'cli2', total: 50, createdAt: new Date('2025-01-01') },
    ]
    const clientes = [
      { _id: 'cli1', nome: 'João', ativo: true, saldoFiado: 0, pontos: 10 },
      { _id: 'cli2', nome: 'Maria', ativo: true, saldoFiado: 50, pontos: 0 },
    ]
    Venda.find.mockReturnValue({ select: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue(vendas) })
    Cliente.find.mockReturnValue({ lean: jest.fn().mockResolvedValue(clientes) })
    const res = await request(app).get('/api/relatorio/clientes')
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('topCompradores')
    expect(res.body).toHaveProperty('inativos')
    expect(res.body).toHaveProperty('totalClientes')
    expect(res.body.totalClientes).toBe(2)
  })

  test('200 retorna resultado vazio quando não há clientes', async () => {
    Venda.find.mockReturnValue({ select: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue([]) })
    Cliente.find.mockReturnValue({ lean: jest.fn().mockResolvedValue([]) })
    const res = await request(app).get('/api/relatorio/clientes')
    expect(res.status).toBe(200)
    expect(res.body.totalClientes).toBe(0)
    expect(res.body.topCompradores).toHaveLength(0)
  })

  test('500 retorna erro interno em falha', async () => {
    Venda.find.mockReturnValue({ select: jest.fn().mockReturnThis(), lean: jest.fn().mockRejectedValue(new Error('DB down')) })
    Cliente.find.mockReturnValue({ lean: jest.fn().mockResolvedValue([]) })
    const res = await request(app).get('/api/relatorio/clientes')
    expect(res.status).toBe(500)
  })
})

// ─── GET /api/relatorio/logs ──────────────────────────────────────────────────
describe('GET /api/relatorio/logs', () => {
  test('200 retorna lista de logs paginada', async () => {
    const logs = [{ _id: 'l1', acao: 'venda_realizada' }, { _id: 'l2', acao: 'caixa_aberto' }]
    Log.find.mockReturnValue({ sort: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), skip: jest.fn().mockResolvedValue(logs) })
    Log.countDocuments.mockResolvedValue(2)
    const res = await request(app).get('/api/relatorio/logs')
    expect(res.status).toBe(200)
    expect(res.body.logs).toHaveLength(2)
    expect(res.body.total).toBe(2)
  })

  test('500 retorna erro interno em falha', async () => {
    Log.find.mockReturnValue({ sort: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), skip: jest.fn().mockRejectedValue(new Error('DB down')) })
    const res = await request(app).get('/api/relatorio/logs')
    expect(res.status).toBe(500)
  })
})

// ─── GET /api/relatorio/lucratividade ────────────────────────────────────────
describe('GET /api/relatorio/lucratividade', () => {
  test('200 retorna lucratividade por produto e categoria', async () => {
    const vendas = [{
      cancelada: false,
      itens: [{
        nomeProduto: 'Cerveja', quantidade: 5, subtotal: 50,
        produto: { precoCusto: 5, categoria: { nome: 'Bebidas', icone: '🍺' } },
      }],
    }]
    Venda.find.mockReturnValue({ populate: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue(vendas) })
    const res = await request(app).get('/api/relatorio/lucratividade')
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('produtos')
    expect(res.body).toHaveProperty('categorias')
    expect(res.body).toHaveProperty('totalReceita')
    expect(res.body).toHaveProperty('totalLucro')
    expect(res.body.produtos[0].nome).toBe('Cerveja')
    expect(res.body.produtos[0].receita).toBe(50)
    expect(res.body.produtos[0].custo).toBe(25)
    expect(res.body.produtos[0].lucro).toBe(25)
  })

  test('200 retorna resultado vazio quando não há vendas', async () => {
    Venda.find.mockReturnValue({ populate: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue([]) })
    const res = await request(app).get('/api/relatorio/lucratividade')
    expect(res.status).toBe(200)
    expect(res.body.totalReceita).toBe(0)
    expect(res.body.produtos).toHaveLength(0)
  })

  test('500 retorna erro interno em falha', async () => {
    Venda.find.mockReturnValue({ populate: jest.fn().mockReturnThis(), lean: jest.fn().mockRejectedValue(new Error('DB down')) })
    const res = await request(app).get('/api/relatorio/lucratividade')
    expect(res.status).toBe(500)
  })
})

// ─── GET /api/relatorio/produtos-parados ─────────────────────────────────────
describe('GET /api/relatorio/produtos-parados', () => {
  test('200 retorna produtos não vendidos nos últimos 30 dias', async () => {
    const vendidos = [{ itens: [{ produto: { toString: () => 'p1' } }] }]
    const todos = [
      { _id: { toString: () => 'p1' }, nome: 'Cerveja', ativo: true, categoria: { nome: 'Bebidas' } },
      { _id: { toString: () => 'p2' }, nome: 'Biscoito', ativo: true, categoria: { nome: 'Snacks' } },
    ]
    Venda.find.mockResolvedValue(vendidos)
    Produto.find.mockReturnValue({ populate: jest.fn().mockResolvedValue(todos) })
    const res = await request(app).get('/api/relatorio/produtos-parados')
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('parados')
  })

  test('500 retorna erro interno em falha', async () => {
    Venda.find.mockRejectedValue(new Error('DB down'))
    const res = await request(app).get('/api/relatorio/produtos-parados')
    expect(res.status).toBe(500)
  })
})
