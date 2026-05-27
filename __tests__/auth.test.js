jest.mock('../src/config/database', () => jest.fn())
jest.mock('../src/models/Log', () => ({ create: jest.fn().mockResolvedValue({}) }))

const mockUser = {
  _id: 'usr123',
  nome: 'Admin Teste',
  email: 'admin@teste.com',
  perfil: 'admin',
  ativo: true,
  ultimoAcesso: null,
  compararSenha: jest.fn(),
  save: jest.fn().mockResolvedValue(true),
}

jest.mock('../src/models/User', () => ({
  findOne: jest.fn(),
  findById: jest.fn(),
}))

process.env.JWT_SECRET = 'segredo-teste-123'

const request = require('supertest')
const express = require('express')
const jwt = require('jsonwebtoken')
const User = require('../src/models/User')

const app = express()
app.use(express.json())
app.use('/api/auth', require('../src/routes/auth.routes'))

describe('POST /api/auth/login', () => {
  beforeEach(() => jest.clearAllMocks())

  test('400 sem email ou senha', async () => {
    const res = await request(app).post('/api/auth/login').send({})
    expect(res.status).toBe(400)
    expect(res.body.mensagem).toMatch(/obrigatórios/)
  })

  test('401 quando usuário não existe no banco', async () => {
    User.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(null) })
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'naoexiste@teste.com', senha: '123456' })
    expect(res.status).toBe(401)
    expect(res.body.mensagem).toBe('Credenciais inválidas')
  })

  test('401 quando senha está incorreta', async () => {
    const u = { ...mockUser, compararSenha: jest.fn().mockResolvedValue(false) }
    User.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(u) })
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@teste.com', senha: 'errada' })
    expect(res.status).toBe(401)
  })

  test('200 retorna token e refreshToken em login válido', async () => {
    const u = { ...mockUser, compararSenha: jest.fn().mockResolvedValue(true) }
    User.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(u) })
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@teste.com', senha: 'correta' })
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('token')
    expect(res.body).toHaveProperty('refreshToken')
    expect(res.body.usuario.email).toBe('admin@teste.com')
    expect(res.body.usuario.perfil).toBe('admin')
  })

  test('token gerado é um JWT válido', async () => {
    const u = { ...mockUser, compararSenha: jest.fn().mockResolvedValue(true) }
    User.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(u) })
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@teste.com', senha: 'correta' })
    const decoded = jwt.verify(res.body.token, process.env.JWT_SECRET)
    expect(decoded).toHaveProperty('id')
  })
})

describe('POST /api/auth/refresh', () => {
  beforeEach(() => jest.clearAllMocks())

  test('401 sem refreshToken no body', async () => {
    const res = await request(app).post('/api/auth/refresh').send({})
    expect(res.status).toBe(401)
    expect(res.body.mensagem).toMatch(/ausente/)
  })

  test('401 refreshToken com assinatura inválida', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: 'token.invalido.aqui' })
    expect(res.status).toBe(401)
  })

  test('200 retorna novo access token com refreshToken válido', async () => {
    const REFRESH_SECRET = process.env.JWT_SECRET + '_refresh'
    const refreshToken = jwt.sign({ id: 'usr123' }, REFRESH_SECRET, { expiresIn: '30d' })
    User.findById.mockResolvedValue({ ...mockUser })
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken })
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('token')
    const decoded = jwt.verify(res.body.token, process.env.JWT_SECRET)
    expect(decoded).toHaveProperty('id')
  })
})
