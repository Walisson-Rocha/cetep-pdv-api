const request = require('supertest')
const app = require('../server')
const { waitForConnection, clearDB, closeDB } = require('./helpers/db')
const { criarUsuario, criarUsuarioComToken } = require('./helpers/auth')

beforeAll(async () => { await waitForConnection() })
afterEach(async () => { await clearDB() })
afterAll(async () => { await closeDB() })

describe('POST /api/auth/login', () => {
  it('faz login com credenciais válidas', async () => {
    await criarUsuario({ email: 'login@exemplo.com', senha: 'senha123' })
    const res = await request(app).post('/api/auth/login').send({ email: 'login@exemplo.com', senha: 'senha123' })
    expect(res.status).toBe(200)
    expect(res.body.token).toBeDefined()
    expect(res.body.refreshToken).toBeDefined()
    expect(res.body.usuario.email).toBe('login@exemplo.com')
  })

  it('rejeita senha incorreta', async () => {
    await criarUsuario({ email: 'errado@exemplo.com', senha: 'senha123' })
    const res = await request(app).post('/api/auth/login').send({ email: 'errado@exemplo.com', senha: 'senhaerrada' })
    expect(res.status).toBe(401)
  })

  it('rejeita usuário inexistente', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'naoexiste@exemplo.com', senha: 'senha123' })
    expect(res.status).toBe(401)
  })

  it('rejeita usuário inativo', async () => {
    await criarUsuario({ email: 'inativo@exemplo.com', senha: 'senha123', ativo: false })
    const res = await request(app).post('/api/auth/login').send({ email: 'inativo@exemplo.com', senha: 'senha123' })
    expect(res.status).toBe(401)
  })

  it('exige email e senha', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'semsenha@exemplo.com' })
    expect(res.status).toBe(400)
  })
})

describe('GET /api/auth/me', () => {
  it('retorna dados do usuário autenticado', async () => {
    const { user, token } = await criarUsuarioComToken({ email: 'me@exemplo.com' })
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.usuario.email).toBe(user.email)
  })

  it('rejeita requisição sem token', async () => {
    const res = await request(app).get('/api/auth/me')
    expect(res.status).toBe(401)
  })

  it('rejeita token inválido', async () => {
    const res = await request(app).get('/api/auth/me').set('Authorization', 'Bearer token-invalido')
    expect(res.status).toBe(401)
  })
})

describe('POST /api/auth/refresh', () => {
  it('gera novo token de acesso a partir de refresh token válido', async () => {
    await criarUsuario({ email: 'refresh@exemplo.com', senha: 'senha123' })
    const login = await request(app).post('/api/auth/login').send({ email: 'refresh@exemplo.com', senha: 'senha123' })
    const res = await request(app).post('/api/auth/refresh').send({ refreshToken: login.body.refreshToken })
    expect(res.status).toBe(200)
    expect(res.body.token).toBeDefined()
  })

  it('rejeita refresh token ausente', async () => {
    const res = await request(app).post('/api/auth/refresh').send({})
    expect(res.status).toBe(401)
  })

  it('rejeita refresh token inválido', async () => {
    const res = await request(app).post('/api/auth/refresh').send({ refreshToken: 'invalido' })
    expect(res.status).toBe(401)
  })
})

describe('PUT /api/auth/senha', () => {
  it('altera a senha com a senha atual correta', async () => {
    const { user, token } = await criarUsuarioComToken({ email: 'mudasenha@exemplo.com', senha: 'senhaatual' })
    const res = await request(app).put('/api/auth/senha').set('Authorization', `Bearer ${token}`)
      .send({ senhaAtual: 'senhaatual', novaSenha: 'senhanova' })
    expect(res.status).toBe(200)
    const login = await request(app).post('/api/auth/login').send({ email: user.email, senha: 'senhanova' })
    expect(login.status).toBe(200)
  })

  it('rejeita senha atual incorreta', async () => {
    const { token } = await criarUsuarioComToken({ email: 'mudasenha2@exemplo.com', senha: 'senhaatual' })
    const res = await request(app).put('/api/auth/senha').set('Authorization', `Bearer ${token}`)
      .send({ senhaAtual: 'errada', novaSenha: 'senhanova' })
    expect(res.status).toBe(400)
  })

  it('rejeita nova senha curta', async () => {
    const { token } = await criarUsuarioComToken({ email: 'mudasenha3@exemplo.com', senha: 'senhaatual' })
    const res = await request(app).put('/api/auth/senha').set('Authorization', `Bearer ${token}`)
      .send({ senhaAtual: 'senhaatual', novaSenha: '123' })
    expect(res.status).toBe(400)
  })
})

describe('POST /api/auth/logout', () => {
  it('registra logout para usuário autenticado', async () => {
    const { token } = await criarUsuarioComToken({ email: 'logout@exemplo.com' })
    const res = await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
  })
})
