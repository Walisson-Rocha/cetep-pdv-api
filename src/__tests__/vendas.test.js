const request = require('supertest')
const app = require('../server')
const Categoria = require('../models/Categoria')
const Produto = require('../models/Produto')
const Caixa = require('../models/Caixa')
const { waitForConnection, clearDB, closeDB } = require('./helpers/db')
const { criarUsuarioComToken } = require('./helpers/auth')

beforeAll(async () => { await waitForConnection() })
afterEach(async () => { await clearDB() })
afterAll(async () => { await closeDB() })

const criarProduto = async (overrides = {}) => {
  const categoria = await Categoria.create({ nome: `Cat ${Date.now()}-${Math.random()}`, cor: '#000', icone: '📦' })
  return Produto.create({
    nome: overrides.nome || 'Produto Venda', categoria: categoria._id,
    precoVenda: overrides.precoVenda ?? 10, estoque: overrides.estoque ?? 50,
  })
}

const abrirCaixa = (userId) => Caixa.create({ abertoPor: userId, saldoInicial: 100, status: 'aberto' })

describe('POST /api/vendas', () => {
  it('registra venda com caixa aberto e estoque suficiente', async () => {
    const { user, token } = await criarUsuarioComToken({ perfil: 'caixa' })
    await abrirCaixa(user._id)
    const produto = await criarProduto({ estoque: 10 })
    const res = await request(app).post('/api/vendas').set('Authorization', `Bearer ${token}`)
      .send({ itens: [{ produtoId: produto._id, quantidade: 2 }], formaPagamento: 'dinheiro' })
    expect(res.status).toBe(201)
    expect(res.body.venda.total).toBe(20)
    const atualizado = await Produto.findById(produto._id)
    expect(atualizado.estoque).toBe(8)
  })

  it('rejeita venda sem caixa aberto', async () => {
    const { token } = await criarUsuarioComToken({ perfil: 'caixa' })
    const produto = await criarProduto()
    const res = await request(app).post('/api/vendas').set('Authorization', `Bearer ${token}`)
      .send({ itens: [{ produtoId: produto._id, quantidade: 1 }], formaPagamento: 'dinheiro' })
    expect(res.status).toBe(400)
  })

  it('rejeita venda com estoque insuficiente', async () => {
    const { user, token } = await criarUsuarioComToken({ perfil: 'caixa' })
    await abrirCaixa(user._id)
    const produto = await criarProduto({ estoque: 1 })
    const res = await request(app).post('/api/vendas').set('Authorization', `Bearer ${token}`)
      .send({ itens: [{ produtoId: produto._id, quantidade: 5 }], formaPagamento: 'dinheiro' })
    expect(res.status).toBe(400)
  })

  it('rejeita venda sem itens', async () => {
    const { user, token } = await criarUsuarioComToken({ perfil: 'caixa' })
    await abrirCaixa(user._id)
    const res = await request(app).post('/api/vendas').set('Authorization', `Bearer ${token}`)
      .send({ itens: [], formaPagamento: 'dinheiro' })
    expect(res.status).toBe(400)
  })

  it('rejeita forma de pagamento inválida', async () => {
    const { user, token } = await criarUsuarioComToken({ perfil: 'caixa' })
    await abrirCaixa(user._id)
    const produto = await criarProduto()
    const res = await request(app).post('/api/vendas').set('Authorization', `Bearer ${token}`)
      .send({ itens: [{ produtoId: produto._id, quantidade: 1 }], formaPagamento: 'criptomoeda' })
    expect(res.status).toBe(400)
  })

  it('rejeita produto inexistente no carrinho', async () => {
    const { user, token } = await criarUsuarioComToken({ perfil: 'caixa' })
    await abrirCaixa(user._id)
    const res = await request(app).post('/api/vendas').set('Authorization', `Bearer ${token}`)
      .send({ itens: [{ produtoId: 'id-invalido', quantidade: 1 }], formaPagamento: 'dinheiro' })
    expect(res.status).toBe(400)
  })
})

describe('PUT /api/vendas/:id/cancelar', () => {
  it('cancela venda e estorna estoque (admin)', async () => {
    const { user, token } = await criarUsuarioComToken({ perfil: 'admin' })
    await abrirCaixa(user._id)
    const produto = await criarProduto({ estoque: 10 })
    const venda = await request(app).post('/api/vendas').set('Authorization', `Bearer ${token}`)
      .send({ itens: [{ produtoId: produto._id, quantidade: 3 }], formaPagamento: 'dinheiro' })
    const res = await request(app).put(`/api/vendas/${venda.body.venda._id}/cancelar`).set('Authorization', `Bearer ${token}`)
      .send({ motivo: 'Teste de cancelamento' })
    expect(res.status).toBe(200)
    const atualizado = await Produto.findById(produto._id)
    expect(atualizado.estoque).toBe(10)
  })

  it('rejeita cancelamento por perfil sem permissão', async () => {
    const { user, token: tokenCaixa } = await criarUsuarioComToken({ perfil: 'caixa' })
    await abrirCaixa(user._id)
    const produto = await criarProduto()
    const venda = await request(app).post('/api/vendas').set('Authorization', `Bearer ${tokenCaixa}`)
      .send({ itens: [{ produtoId: produto._id, quantidade: 1 }], formaPagamento: 'dinheiro' })
    const res = await request(app).put(`/api/vendas/${venda.body.venda._id}/cancelar`).set('Authorization', `Bearer ${tokenCaixa}`)
      .send({ motivo: 'Tentativa' })
    expect(res.status).toBe(403)
  })

  it('retorna 404 para venda inexistente', async () => {
    const { token } = await criarUsuarioComToken({ perfil: 'admin' })
    const res = await request(app).put('/api/vendas/64b000000000000000000000/cancelar')
      .set('Authorization', `Bearer ${token}`).send({ motivo: 'x' })
    expect(res.status).toBe(404)
  })
})

describe('GET /api/vendas/hoje', () => {
  it('retorna vendas do dia', async () => {
    const { user, token } = await criarUsuarioComToken({ perfil: 'caixa' })
    await abrirCaixa(user._id)
    const produto = await criarProduto()
    await request(app).post('/api/vendas').set('Authorization', `Bearer ${token}`)
      .send({ itens: [{ produtoId: produto._id, quantidade: 1 }], formaPagamento: 'pix' })
    const res = await request(app).get('/api/vendas/hoje').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.quantidade).toBeGreaterThan(0)
  })
})

describe('GET /api/vendas', () => {
  it('lista vendas com paginação', async () => {
    const { token } = await criarUsuarioComToken({ perfil: 'admin' })
    const res = await request(app).get('/api/vendas').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.vendas)).toBe(true)
  })
})
