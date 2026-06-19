jest.mock('../src/config/database')
jest.mock('../src/models/User')
jest.mock('../src/models/Log')
jest.mock('../src/middleware/auth.middleware', () => ({
  protect: (req, _res, next) => {
    req.user = { _id: { toString: () => '507f1f77bcf86cd799439011' }, nome: 'Admin', perfil: 'admin' }
    next()
  },
  authorize: () => (_req, _res, next) => next(),
}))

const request = require('supertest')
const express = require('express')
const User = require('../src/models/User')
const Log = require('../src/models/Log')

const app = express()
app.use(express.json())
app.use('/api/usuarios', require('../src/routes/user.routes'))

beforeEach(() => jest.clearAllMocks())

// ─── GET /api/usuarios ────────────────────────────────────────────────────────
describe('GET /api/usuarios', () => {
  test('200 retorna lista de usuários', async () => {
    const usuarios = [
      { _id: 'u1', nome: 'Admin', perfil: 'admin' },
      { _id: 'u2', nome: 'Caixa', perfil: 'caixa' },
    ]
    User.find.mockReturnValue({ sort: jest.fn().mockResolvedValue(usuarios) })
    const res = await request(app).get('/api/usuarios?all=true')
    expect(res.status).toBe(200)
    expect(res.body.usuarios).toHaveLength(2)
  })
})

// ─── POST /api/usuarios ───────────────────────────────────────────────────────
describe('POST /api/usuarios', () => {
  test('201 cria usuário com perfil caixa por padrão', async () => {
    const usuario = { _id: 'u1', nome: 'Novo User', email: 'novo@test.com', perfil: 'caixa' }
    User.create.mockResolvedValue(usuario)
    Log.create.mockResolvedValue({})
    const res = await request(app).post('/api/usuarios').send({
      nome: 'Novo User', email: 'novo@test.com', senha: 'senha123', telefone: '11999999999',
    })
    expect(res.status).toBe(201)
    expect(res.body.usuario.perfil).toBe('caixa')
    expect(Log.create).toHaveBeenCalledWith(expect.objectContaining({ acao: 'usuario_criado' }))
  })

  test('201 cria colaborador com perfil colaborador', async () => {
    const usuario = { _id: 'u2', nome: 'Fernanda', email: 'f@test.com', perfil: 'colaborador' }
    User.create.mockResolvedValue(usuario)
    Log.create.mockResolvedValue({})
    const res = await request(app).post('/api/usuarios').send({
      nome: 'Fernanda', email: 'f@test.com', senha: 'senha123', perfil: 'colaborador', telefone: '11999999999',
    })
    expect(res.status).toBe(201)
    expect(res.body.usuario.perfil).toBe('colaborador')
  })

  test('400 quando campos obrigatórios estão ausentes', async () => {
    const res = await request(app).post('/api/usuarios').send({ email: 'test@test.com' })
    expect(res.status).toBe(400)
    expect(res.body.mensagem).toMatch(/nome.*email.*senha|obrigatório/i)
  })

  test('400 quando senha tem menos de 6 caracteres', async () => {
    const res = await request(app).post('/api/usuarios').send({
      nome: 'Teste', email: 'test@test.com', senha: '123', telefone: '11999999999',
    })
    expect(res.status).toBe(400)
    expect(res.body.mensagem).toMatch(/6 caracteres/i)
  })

  test('400 quando perfil é inválido', async () => {
    const res = await request(app).post('/api/usuarios').send({
      nome: 'Teste', email: 'test@test.com', senha: 'senha123', perfil: 'deus', telefone: '11999999999',
    })
    expect(res.status).toBe(400)
    expect(res.body.mensagem).toMatch(/perfil inválido/i)
  })

  test('400 quando email já está cadastrado', async () => {
    const err = new Error(); err.code = 11000
    User.create.mockRejectedValue(err)
    const res = await request(app).post('/api/usuarios').send({
      nome: 'Teste', email: 'existente@test.com', senha: 'senha123', telefone: '11999999999',
    })
    expect(res.status).toBe(400)
    expect(res.body.mensagem).toMatch(/e-?mail já cadastrado/i)
  })
})

// ─── DELETE /api/usuarios/:id ─────────────────────────────────────────────────
describe('DELETE /api/usuarios/:id', () => {
  test('400 quando tenta desativar a própria conta', async () => {
    const res = await request(app).delete('/api/usuarios/507f1f77bcf86cd799439011')
    expect(res.status).toBe(400)
    expect(res.body.mensagem).toMatch(/própria conta/i)
  })

  test('200 soft delete de outro usuário', async () => {
    User.findByIdAndUpdate = jest.fn().mockResolvedValue({ _id: '507f1f77bcf86cd799439012', ativo: false, nome: 'Outro' })
    Log.create.mockResolvedValue({})
    const res = await request(app).delete('/api/usuarios/507f1f77bcf86cd799439012')
    expect(res.status).toBe(200)
    expect(User.findByIdAndUpdate).toHaveBeenCalledWith('507f1f77bcf86cd799439012', { ativo: false }, expect.any(Object))
  })

  test('404 quando usuário não existe', async () => {
    User.findByIdAndUpdate = jest.fn().mockResolvedValue(null)
    const res = await request(app).delete('/api/usuarios/507f1f77bcf86cd799439013')
    expect(res.status).toBe(404)
  })

  test('400 quando id não é um ObjectId válido', async () => {
    const res = await request(app).delete('/api/usuarios/inexistente')
    expect(res.status).toBe(400)
  })
})

// ─── PUT /api/usuarios/:id ────────────────────────────────────────────────────
describe('PUT /api/usuarios/:id', () => {
  test('200 atualiza dados do usuário', async () => {
    const atualizado = { _id: '507f1f77bcf86cd799439012', nome: 'Carlos Novo', perfil: 'gerente' }
    User.findByIdAndUpdate = jest.fn().mockResolvedValue(atualizado)
    const res = await request(app).put('/api/usuarios/507f1f77bcf86cd799439012').send({ nome: 'Carlos Novo', perfil: 'gerente' })
    expect(res.status).toBe(200)
    expect(res.body.usuario.nome).toBe('Carlos Novo')
  })

  test('400 quando perfil inválido na atualização', async () => {
    const res = await request(app).put('/api/usuarios/507f1f77bcf86cd799439012').send({ perfil: 'super_admin' })
    expect(res.status).toBe(400)
  })

  test('404 quando usuário não encontrado', async () => {
    User.findByIdAndUpdate = jest.fn().mockResolvedValue(null)
    const res = await request(app).put('/api/usuarios/507f1f77bcf86cd799439013').send({ nome: 'X' })
    expect(res.status).toBe(404)
  })

  test('400 quando id não é um ObjectId válido', async () => {
    const res = await request(app).put('/api/usuarios/inexistente').send({ nome: 'X' })
    expect(res.status).toBe(400)
  })
})
