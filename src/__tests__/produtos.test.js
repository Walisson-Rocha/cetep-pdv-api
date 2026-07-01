const request = require('supertest')
const app = require('../server')
const Categoria = require('../models/Categoria')
const Fornecedor = require('../models/Fornecedor')
const { waitForConnection, clearDB, closeDB } = require('./helpers/db')
const { criarUsuarioComToken } = require('./helpers/auth')

beforeAll(async () => { await waitForConnection() })
afterEach(async () => { await clearDB() })
afterAll(async () => { await closeDB() })

const criarFixtures = async () => {
  const categoria = await Categoria.create({ nome: `Categoria ${Date.now()}-${Math.random()}`, cor: '#000', icone: '📦' })
  const fornecedor = await Fornecedor.create({ nome: `Fornecedor ${Date.now()}-${Math.random()}` })
  return { categoria, fornecedor }
}

describe('POST /api/produtos', () => {
  it('cria produto com dados válidos (admin)', async () => {
    const { token } = await criarUsuarioComToken({ perfil: 'admin' })
    const { categoria, fornecedor } = await criarFixtures()
    const res = await request(app).post('/api/produtos').set('Authorization', `Bearer ${token}`)
      .send({ nome: 'Produto Teste', categoria: categoria._id, fornecedor: fornecedor._id, precoVenda: 10.5, estoque: 20 })
    expect(res.status).toBe(201)
    expect(res.body.produto.nome).toBe('Produto Teste')
  })

  it('rejeita produto sem nome', async () => {
    const { token } = await criarUsuarioComToken({ perfil: 'admin' })
    const { categoria, fornecedor } = await criarFixtures()
    const res = await request(app).post('/api/produtos').set('Authorization', `Bearer ${token}`)
      .send({ categoria: categoria._id, fornecedor: fornecedor._id, precoVenda: 10 })
    expect(res.status).toBe(400)
  })

  it('rejeita produto com categoria inválida', async () => {
    const { token } = await criarUsuarioComToken({ perfil: 'admin' })
    const res = await request(app).post('/api/produtos').set('Authorization', `Bearer ${token}`)
      .send({ nome: 'Produto X', categoria: 'id-invalido', precoVenda: 10 })
    expect(res.status).toBe(400)
  })

  it('rejeita preço de venda negativo', async () => {
    const { token } = await criarUsuarioComToken({ perfil: 'admin' })
    const { categoria, fornecedor } = await criarFixtures()
    const res = await request(app).post('/api/produtos').set('Authorization', `Bearer ${token}`)
      .send({ nome: 'Produto Y', categoria: categoria._id, fornecedor: fornecedor._id, precoVenda: -5 })
    expect(res.status).toBe(400)
  })

  it('rejeita criação por perfil sem permissão (caixa)', async () => {
    const { token } = await criarUsuarioComToken({ perfil: 'caixa' })
    const { categoria, fornecedor } = await criarFixtures()
    const res = await request(app).post('/api/produtos').set('Authorization', `Bearer ${token}`)
      .send({ nome: 'Produto Z', categoria: categoria._id, fornecedor: fornecedor._id, precoVenda: 10 })
    expect(res.status).toBe(403)
  })

  it('rejeita código de barras duplicado', async () => {
    const { token } = await criarUsuarioComToken({ perfil: 'admin' })
    const { categoria, fornecedor } = await criarFixtures()
    await request(app).post('/api/produtos').set('Authorization', `Bearer ${token}`)
      .send({ nome: 'Produto A', categoria: categoria._id, fornecedor: fornecedor._id, precoVenda: 10, codigoBarras: '12345678' })
    const res = await request(app).post('/api/produtos').set('Authorization', `Bearer ${token}`)
      .send({ nome: 'Produto B', categoria: categoria._id, fornecedor: fornecedor._id, precoVenda: 12, codigoBarras: '12345678' })
    expect(res.status).toBe(400)
  })
})

describe('GET /api/produtos', () => {
  it('lista produtos paginados', async () => {
    const { token } = await criarUsuarioComToken({ perfil: 'admin' })
    const { categoria, fornecedor } = await criarFixtures()
    await request(app).post('/api/produtos').set('Authorization', `Bearer ${token}`)
      .send({ nome: 'Listado 1', categoria: categoria._id, fornecedor: fornecedor._id, precoVenda: 5 })
    const res = await request(app).get('/api/produtos').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.produtos.length).toBeGreaterThan(0)
  })

  it('busca produto por código de barras', async () => {
    const { token } = await criarUsuarioComToken({ perfil: 'admin' })
    const { categoria, fornecedor } = await criarFixtures()
    await request(app).post('/api/produtos').set('Authorization', `Bearer ${token}`)
      .send({ nome: 'Com Codigo', categoria: categoria._id, fornecedor: fornecedor._id, precoVenda: 5, codigoBarras: '999888' })
    const res = await request(app).get('/api/produtos/barcode/999888').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.produto.nome).toBe('Com Codigo')
  })

  it('retorna 404 para código de barras inexistente', async () => {
    const { token } = await criarUsuarioComToken({ perfil: 'admin' })
    const res = await request(app).get('/api/produtos/barcode/000000').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(404)
  })

  it('rejeita requisição sem autenticação', async () => {
    const res = await request(app).get('/api/produtos')
    expect(res.status).toBe(401)
  })
})

describe('PUT /api/produtos/:id', () => {
  it('atualiza produto existente', async () => {
    const { token } = await criarUsuarioComToken({ perfil: 'admin' })
    const { categoria, fornecedor } = await criarFixtures()
    const criado = await request(app).post('/api/produtos').set('Authorization', `Bearer ${token}`)
      .send({ nome: 'Original', categoria: categoria._id, fornecedor: fornecedor._id, precoVenda: 10 })
    const res = await request(app).put(`/api/produtos/${criado.body.produto._id}`).set('Authorization', `Bearer ${token}`)
      .send({ precoVenda: 15 })
    expect(res.status).toBe(200)
    expect(res.body.produto.precoVenda).toBe(15)
  })

  it('rejeita id inválido', async () => {
    const { token } = await criarUsuarioComToken({ perfil: 'admin' })
    const res = await request(app).put('/api/produtos/id-invalido').set('Authorization', `Bearer ${token}`)
      .send({ precoVenda: 15 })
    expect(res.status).toBe(400)
  })
})

describe('DELETE /api/produtos/:id', () => {
  it('desativa produto (soft delete)', async () => {
    const { token } = await criarUsuarioComToken({ perfil: 'admin' })
    const { categoria, fornecedor } = await criarFixtures()
    const criado = await request(app).post('/api/produtos').set('Authorization', `Bearer ${token}`)
      .send({ nome: 'Para Remover', categoria: categoria._id, fornecedor: fornecedor._id, precoVenda: 10 })
    const res = await request(app).delete(`/api/produtos/${criado.body.produto._id}`).set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
  })

  it('rejeita exclusão por perfil sem permissão', async () => {
    const { token: tokenAdmin } = await criarUsuarioComToken({ perfil: 'admin' })
    const { token: tokenGerente } = await criarUsuarioComToken({ perfil: 'gerente' })
    const { categoria, fornecedor } = await criarFixtures()
    const criado = await request(app).post('/api/produtos').set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ nome: 'Protegido', categoria: categoria._id, fornecedor: fornecedor._id, precoVenda: 10 })
    const res = await request(app).delete(`/api/produtos/${criado.body.produto._id}`).set('Authorization', `Bearer ${tokenGerente}`)
    expect(res.status).toBe(403)
  })
})

describe('GET /api/produtos/alertas', () => {
  it('retorna alertas de estoque', async () => {
    const { token } = await criarUsuarioComToken({ perfil: 'admin' })
    const { categoria, fornecedor } = await criarFixtures()
    await request(app).post('/api/produtos').set('Authorization', `Bearer ${token}`)
      .send({ nome: 'Zerado', categoria: categoria._id, fornecedor: fornecedor._id, precoVenda: 10, estoque: 0 })
    const res = await request(app).get('/api/produtos/alertas').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.zerados.length).toBeGreaterThan(0)
  })
})

describe('PUT /api/produtos/reajuste', () => {
  it('reajusta preços em massa', async () => {
    const { token } = await criarUsuarioComToken({ perfil: 'admin' })
    const { categoria, fornecedor } = await criarFixtures()
    await request(app).post('/api/produtos').set('Authorization', `Bearer ${token}`)
      .send({ nome: 'Reajustável', categoria: categoria._id, fornecedor: fornecedor._id, precoVenda: 100 })
    const res = await request(app).put('/api/produtos/reajuste').set('Authorization', `Bearer ${token}`)
      .send({ percentual: 10 })
    expect(res.status).toBe(200)
    expect(res.body.atualizados).toBeGreaterThan(0)
  })

  it('rejeita percentual ausente', async () => {
    const { token } = await criarUsuarioComToken({ perfil: 'admin' })
    const res = await request(app).put('/api/produtos/reajuste').set('Authorization', `Bearer ${token}`).send({})
    expect(res.status).toBe(400)
  })
})
