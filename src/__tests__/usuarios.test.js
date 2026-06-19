const request = require('supertest')
const app = require('../server')
const { waitForConnection, clearDB, closeDB } = require('./helpers/db')
const { criarUsuarioComToken } = require('./helpers/auth')

beforeAll(async () => { await waitForConnection() })
afterEach(async () => { await clearDB() })
afterAll(async () => { await closeDB() })

describe('POST /api/usuarios', () => {
  it('cria usuário com dados válidos (admin)', async () => {
    const { token } = await criarUsuarioComToken({ perfil: 'admin' })
    const res = await request(app).post('/api/usuarios').set('Authorization', `Bearer ${token}`)
      .send({ nome: 'Novo Usuário', email: 'novo@exemplo.com', senha: 'senha123', perfil: 'caixa', telefone: '11988887777' })
    expect(res.status).toBe(201)
    expect(res.body.usuario.email).toBe('novo@exemplo.com')
  })

  it('rejeita email inválido', async () => {
    const { token } = await criarUsuarioComToken({ perfil: 'admin' })
    const res = await request(app).post('/api/usuarios').set('Authorization', `Bearer ${token}`)
      .send({ nome: 'X', email: 'nao-e-email', senha: 'senha123', telefone: '11988887777' })
    expect(res.status).toBe(400)
  })

  it('rejeita senha curta', async () => {
    const { token } = await criarUsuarioComToken({ perfil: 'admin' })
    const res = await request(app).post('/api/usuarios').set('Authorization', `Bearer ${token}`)
      .send({ nome: 'X', email: 'curta@exemplo.com', senha: '123', telefone: '11988887777' })
    expect(res.status).toBe(400)
  })

  it('rejeita sem telefone nem whatsapp', async () => {
    const { token } = await criarUsuarioComToken({ perfil: 'admin' })
    const res = await request(app).post('/api/usuarios').set('Authorization', `Bearer ${token}`)
      .send({ nome: 'X', email: 'semcontato@exemplo.com', senha: 'senha123' })
    expect(res.status).toBe(400)
  })

  it('rejeita email duplicado', async () => {
    const { token } = await criarUsuarioComToken({ perfil: 'admin' })
    await request(app).post('/api/usuarios').set('Authorization', `Bearer ${token}`)
      .send({ nome: 'Primeiro', email: 'dup@exemplo.com', senha: 'senha123', telefone: '11988887777' })
    const res = await request(app).post('/api/usuarios').set('Authorization', `Bearer ${token}`)
      .send({ nome: 'Segundo', email: 'dup@exemplo.com', senha: 'senha123', telefone: '11988887777' })
    expect(res.status).toBe(400)
  })

  it('rejeita criação por não-admin', async () => {
    const { token } = await criarUsuarioComToken({ perfil: 'gerente' })
    const res = await request(app).post('/api/usuarios').set('Authorization', `Bearer ${token}`)
      .send({ nome: 'X', email: 'naoadmin@exemplo.com', senha: 'senha123', telefone: '11988887777' })
    expect(res.status).toBe(403)
  })
})

describe('GET /api/usuarios', () => {
  it('lista usuários paginados (admin)', async () => {
    const { token } = await criarUsuarioComToken({ perfil: 'admin' })
    const res = await request(app).get('/api/usuarios').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.usuarios)).toBe(true)
  })
})

describe('PUT /api/usuarios/:id', () => {
  it('atualiza usuário existente', async () => {
    const { token } = await criarUsuarioComToken({ perfil: 'admin' })
    const criado = await request(app).post('/api/usuarios').set('Authorization', `Bearer ${token}`)
      .send({ nome: 'Editável', email: 'editavel@exemplo.com', senha: 'senha123', telefone: '11988887777' })
    const res = await request(app).put(`/api/usuarios/${criado.body.usuario._id}`).set('Authorization', `Bearer ${token}`)
      .send({ nome: 'Editado' })
    expect(res.status).toBe(200)
    expect(res.body.usuario.nome).toBe('Editado')
  })

  it('rejeita id inválido', async () => {
    const { token } = await criarUsuarioComToken({ perfil: 'admin' })
    const res = await request(app).put('/api/usuarios/id-invalido').set('Authorization', `Bearer ${token}`)
      .send({ nome: 'X' })
    expect(res.status).toBe(400)
  })

  it('rejeita perfil inválido', async () => {
    const { token } = await criarUsuarioComToken({ perfil: 'admin' })
    const criado = await request(app).post('/api/usuarios').set('Authorization', `Bearer ${token}`)
      .send({ nome: 'Perfil', email: 'perfil@exemplo.com', senha: 'senha123', telefone: '11988887777' })
    const res = await request(app).put(`/api/usuarios/${criado.body.usuario._id}`).set('Authorization', `Bearer ${token}`)
      .send({ perfil: 'super-admin' })
    expect(res.status).toBe(400)
  })
})

describe('DELETE /api/usuarios/:id', () => {
  it('desativa usuário existente', async () => {
    const { token } = await criarUsuarioComToken({ perfil: 'admin' })
    const criado = await request(app).post('/api/usuarios').set('Authorization', `Bearer ${token}`)
      .send({ nome: 'Para Desativar', email: 'desativar@exemplo.com', senha: 'senha123', telefone: '11988887777' })
    const res = await request(app).delete(`/api/usuarios/${criado.body.usuario._id}`).set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
  })

  it('rejeita autodesativação', async () => {
    const { user, token } = await criarUsuarioComToken({ perfil: 'admin' })
    const res = await request(app).delete(`/api/usuarios/${user._id}`).set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(400)
  })
})
