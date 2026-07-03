jest.mock('../src/config/database')
jest.mock('../src/models/Venda')
jest.mock('../src/models/Produto')
jest.mock('../src/models/Caixa')
jest.mock('../src/models/MovimentoEstoque')
jest.mock('../src/models/Cliente')
jest.mock('../src/models/Log')
jest.mock('../src/models/Configuracao')
jest.mock('../src/models/Lote')
jest.mock('../src/models/Retirada')
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
const Caixa = require('../src/models/Caixa')
const MovimentoEstoque = require('../src/models/MovimentoEstoque')
const Cliente = require('../src/models/Cliente')
const Log = require('../src/models/Log')
const Configuracao = require('../src/models/Configuracao')
const Lote = require('../src/models/Lote')

const app = express()
app.use(express.json())
app.use('/api/vendas', require('../src/routes/venda.routes'))

// ─── helpers ──────────────────────────────────────────────────────────────────
function mockCaixaAberto() {
  const caixa = { _id: 'cx1', status: 'aberto', saldoInicial: 0, totalVendas: 0, sangrias: [] }
  Caixa.findOne.mockResolvedValue(caixa)
  Caixa.findByIdAndUpdate.mockResolvedValue(caixa)
  return caixa
}

function mockProdutoDisponivel(overrides = {}) {
  const prod = {
    _id: '507f1f77bcf86cd799439031', nome: 'Caneta', precoVenda: 5, ativo: true, estoque: 10,
    save: jest.fn().mockResolvedValue(true),
    ...overrides,
  }
  Produto.findById.mockResolvedValue(prod)
  return prod
}

function mockVendaCriada(overrides = {}) {
  const venda = { _id: '507f1f77bcf86cd799439051', numero: 42, total: 5, formaPagamento: 'pix', itens: [], ...overrides }
  Venda.create.mockResolvedValue(venda)
  // controller encadeia 3x .populate() (cliente, colaborador, vendedor) antes de resolver
  Venda.findById.mockReturnValue({
    populate: jest.fn().mockReturnValue({
      populate: jest.fn().mockReturnValue({
        populate: jest.fn().mockResolvedValue(venda),
      }),
    }),
  })
  MovimentoEstoque.create.mockResolvedValue({})
  Log.create.mockResolvedValue({})
  return venda
}

beforeEach(() => {
  jest.clearAllMocks()
  Configuracao.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) })
  Lote.find.mockReturnValue({ sort: jest.fn().mockResolvedValue([]) })
})

// ─── POST /api/vendas ─────────────────────────────────────────────────────────
describe('POST /api/vendas', () => {
  test('400 quando não há caixa aberto', async () => {
    Caixa.findOne.mockResolvedValue(null)
    const res = await request(app).post('/api/vendas').send({
      itens: [{ produtoId: '507f1f77bcf86cd799439031', quantidade: 1 }],
      formaPagamento: 'pix',
    })
    expect(res.status).toBe(400)
    expect(res.body.mensagem).toMatch(/caixa/i)
  })

  test('400 quando produto não existe', async () => {
    mockCaixaAberto()
    Produto.findById.mockResolvedValue(null)
    const res = await request(app).post('/api/vendas').send({
      itens: [{ produtoId: '507f1f77bcf86cd799439032', quantidade: 1 }],
      formaPagamento: 'pix',
    })
    expect(res.status).toBe(400)
    expect(res.body.mensagem).toMatch(/produto não encontrado/i)
  })

  test('400 quando estoque insuficiente', async () => {
    mockCaixaAberto()
    mockProdutoDisponivel({ estoque: 2 })
    const res = await request(app).post('/api/vendas').send({
      itens: [{ produtoId: '507f1f77bcf86cd799439031', quantidade: 5 }],
      formaPagamento: 'pix',
    })
    expect(res.status).toBe(400)
    expect(res.body.mensagem).toMatch(/estoque insuficiente/i)
    expect(res.body.estoqueDisponivel).toBe(2)
    expect(res.body.solicitado).toBe(5)
  })

  test('201 venda registrada com sucesso via PIX', async () => {
    mockCaixaAberto()
    mockProdutoDisponivel()
    mockVendaCriada()
    const res = await request(app).post('/api/vendas').send({
      itens: [{ produtoId: '507f1f77bcf86cd799439031', quantidade: 2 }],
      formaPagamento: 'pix',
    })
    expect(res.status).toBe(201)
    expect(res.body.venda.numero).toBe(42)
    expect(Venda.create).toHaveBeenCalledTimes(1)
    expect(MovimentoEstoque.create).toHaveBeenCalledTimes(1)
    expect(Log.create).toHaveBeenCalledTimes(1)
  })

  test('201 venda fiado incrementa saldoFiado do cliente', async () => {
    mockCaixaAberto()
    mockProdutoDisponivel()
    mockVendaCriada({ formaPagamento: 'fiado', total: 10 })
    Cliente.findByIdAndUpdate.mockResolvedValue({})
    await request(app).post('/api/vendas').send({
      itens: [{ produtoId: '507f1f77bcf86cd799439031', quantidade: 2 }],
      formaPagamento: 'fiado',
      clienteId: '507f1f77bcf86cd799439041',
    })
    expect(Cliente.findByIdAndUpdate).toHaveBeenCalledWith('507f1f77bcf86cd799439041', { $inc: { saldoFiado: expect.any(Number) } })
  })

  test('201 calcula total corretamente com desconto', async () => {
    mockCaixaAberto()
    mockProdutoDisponivel({ precoVenda: 20 })
    const venda = mockVendaCriada({ total: 35 })
    const res = await request(app).post('/api/vendas').send({
      itens: [{ produtoId: '507f1f77bcf86cd799439031', quantidade: 2 }],
      formaPagamento: 'dinheiro',
      desconto: 5,
    })
    expect(res.status).toBe(201)
    expect(Venda.create).toHaveBeenCalledWith(expect.objectContaining({ desconto: 5 }))
  })
})

// ─── PUT /api/vendas/:id/cancelar ─────────────────────────────────────────────
describe('PUT /api/vendas/:id/cancelar', () => {
  test('404 quando venda não existe', async () => {
    Venda.findById.mockResolvedValue(null)
    const res = await request(app).put('/api/vendas/507f1f77bcf86cd799439051/cancelar').send({ motivo: 'Erro' })
    expect(res.status).toBe(404)
  })

  test('400 quando venda já cancelada', async () => {
    Venda.findById.mockResolvedValue({ _id: '507f1f77bcf86cd799439051', cancelada: true, itens: [] })
    const res = await request(app).put('/api/vendas/507f1f77bcf86cd799439051/cancelar').send({ motivo: 'Erro' })
    expect(res.status).toBe(400)
    expect(res.body.mensagem).toMatch(/já cancelada/i)
  })

  test('200 cancela venda e restaura estoque', async () => {
    const mockProd = { _id: '507f1f77bcf86cd799439061', estoque: 3, save: jest.fn().mockResolvedValue(true) }
    const venda = {
      _id: '507f1f77bcf86cd799439051', numero: 1, cancelada: false, formaPagamento: 'pix',
      total: 15, cliente: null,
      itens: [{ produto: '507f1f77bcf86cd799439061', quantidade: 2, nomeProduto: 'Caneta' }],
      save: jest.fn().mockResolvedValue(true),
    }
    Venda.findById.mockResolvedValue(venda)
    Produto.findById.mockResolvedValue(mockProd)
    MovimentoEstoque.create.mockResolvedValue({})
    Log.create.mockResolvedValue({})
    const res = await request(app).put('/api/vendas/507f1f77bcf86cd799439051/cancelar').send({ motivo: 'Pedido do cliente' })
    expect(res.status).toBe(200)
    expect(Produto.findByIdAndUpdate).toHaveBeenCalledWith(mockProd._id, { $inc: { estoque: 2 } })
    expect(venda.cancelada).toBe(true)
    expect(venda.motivoCancelamento).toBe('Pedido do cliente')
  })

  test('cancelamento de venda fiado reverte saldoFiado', async () => {
    const venda = {
      _id: '507f1f77bcf86cd799439051', numero: 1, cancelada: false, formaPagamento: 'fiado',
      total: 50, cliente: '507f1f77bcf86cd799439041',
      itens: [{ produto: '507f1f77bcf86cd799439061', quantidade: 1, nomeProduto: 'Cesta' }],
      save: jest.fn().mockResolvedValue(true),
    }
    Venda.findById.mockResolvedValue(venda)
    Produto.findById.mockResolvedValue({ _id: '507f1f77bcf86cd799439061', estoque: 0, save: jest.fn() })
    Cliente.findByIdAndUpdate.mockResolvedValue({})
    MovimentoEstoque.create.mockResolvedValue({})
    Log.create.mockResolvedValue({})
    await request(app).put('/api/vendas/507f1f77bcf86cd799439051/cancelar').send({ motivo: 'Devolvido' })
    expect(Cliente.findByIdAndUpdate).toHaveBeenCalledWith('507f1f77bcf86cd799439041', { $inc: { saldoFiado: -50 } })
  })
})

// ─── GET /api/vendas ──────────────────────────────────────────────────────────
describe('GET /api/vendas', () => {
  test('200 retorna lista de vendas', async () => {
    const populateMock = { populate: jest.fn().mockReturnThis(), sort: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), skip: jest.fn().mockResolvedValue([{ _id: 'v1' }]) }
    Venda.find.mockReturnValue(populateMock)
    Venda.countDocuments.mockResolvedValue(1)
    const res = await request(app).get('/api/vendas')
    expect(res.status).toBe(200)
    expect(res.body.vendas).toHaveLength(1)
    expect(res.body.total).toBe(1)
  })

  test('filtra por formaPagamento quando informado', async () => {
    const populateMock = { populate: jest.fn().mockReturnThis(), sort: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), skip: jest.fn().mockResolvedValue([]) }
    Venda.find.mockReturnValue(populateMock)
    Venda.countDocuments.mockResolvedValue(0)
    await request(app).get('/api/vendas?formaPagamento=pix')
    expect(Venda.find).toHaveBeenCalledWith(expect.objectContaining({ formaPagamento: 'pix' }))
  })
})

// ─── GET /api/vendas/hoje ─────────────────────────────────────────────────────
describe('GET /api/vendas/hoje', () => {
  test('200 retorna vendas do dia com totais', async () => {
    const vendas = [
      { total: 30, formaPagamento: 'pix' },
      { total: 20, formaPagamento: 'dinheiro' },
    ]
    const populateMock = { populate: jest.fn().mockReturnThis(), sort: jest.fn().mockResolvedValue(vendas) }
    Venda.find.mockReturnValue(populateMock)
    const res = await request(app).get('/api/vendas/hoje')
    expect(res.status).toBe(200)
    expect(res.body.total).toBe(50)
    expect(res.body.quantidade).toBe(2)
    expect(res.body.porFormaPagamento.pix).toBe(30)
    expect(res.body.porFormaPagamento.dinheiro).toBe(20)
  })
})
