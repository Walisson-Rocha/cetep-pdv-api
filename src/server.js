require('dotenv').config()
const http = require('http')
const express = require('express')
const cors = require('cors')
const morgan = require('morgan')
const helmet = require('helmet')
const rateLimit = require('express-rate-limit')
const connectDB = require('./config/database')
const logger = require('./config/logger')
const socket = require('./config/socket')

if (!process.env.JWT_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    logger.error('JWT_SECRET não definido. Encerrando — esta variável é obrigatória em produção.')
    process.exit(1)
  }
  logger.warn('JWT_SECRET não definido — usando valor temporário apenas para desenvolvimento.')
  process.env.JWT_SECRET = 'dev-only-insecure-secret'
}

const app = express()

app.set('trust proxy', 1)

connectDB()

app.use(helmet())

// Rate limiting global
const limiterGeral = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  message: { mensagem: 'Muitas requisições. Tente novamente em 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
})

// Rate limiting específico para login (proteção contra brute force)
const limiterLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { mensagem: 'Muitas tentativas de login. Tente novamente em 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
})

const allowedOrigins = [
  'http://localhost:3000',
  ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : []),
]

const corsOriginCheck = (origin, callback) => {
  // Permite ausência de origin (ex: curl, apps mobile) e IPs da rede local
  if (!origin) return callback(null, true)
  if (allowedOrigins.includes(origin)) return callback(null, true)
  // Permite qualquer origem 192.168.x.x em desenvolvimento
  if (process.env.NODE_ENV !== 'production' && /^http:\/\/192\.168\.\d+\.\d+(:\d+)?$/.test(origin)) {
    return callback(null, true)
  }
  callback(new Error('Origem não permitida pelo CORS'))
}

app.use(cors({ origin: corsOriginCheck, credentials: true }))

app.use(express.json({ limit: '8mb' }))
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev', {
  stream: { write: (msg) => logger.http(msg.trim()) },
}))
app.use(limiterGeral)

app.use('/api/auth/login', limiterLogin)

app.use('/api/auth',         require('./routes/auth.routes'))
app.use('/api/usuarios',     require('./routes/user.routes'))
app.use('/api/produtos',     require('./routes/produto.routes'))
app.use('/api/categorias',   require('./routes/categoria.routes'))
app.use('/api/clientes',     require('./routes/cliente.routes'))
app.use('/api/vendas',       require('./routes/venda.routes'))
app.use('/api/estoque',      require('./routes/estoque.routes'))
app.use('/api/financeiro',   require('./routes/financeiro.routes'))
app.use('/api/caixa',        require('./routes/caixa.routes'))
app.use('/api/dashboard',    require('./routes/dashboard.routes'))
app.use('/api/fornecedores', require('./routes/fornecedor.routes'))
app.use('/api/relatorios',   require('./routes/relatorio.routes'))
app.use('/api/configuracoes', require('./routes/configuracoes.routes'))
app.use('/api/retiradas',    require('./routes/retirada.routes'))
app.use('/api/logs',         require('./routes/log.routes'))

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', sistema: 'Cetep PDV API', versao: '1.0.0' })
})

app.get('/api/backup', require('./middleware/auth.middleware').protect, async (req, res) => {
  try {
    const [Produto, Cliente, Venda, Caixa, Categoria] = [
      require('./models/Produto'), require('./models/Cliente'),
      require('./models/Venda'), require('./models/Caixa'), require('./models/Categoria'),
    ]
    const [produtos, clientes, vendas, caixas, categorias] = await Promise.all([
      Produto.find({ ativo: true }).populate('categoria', 'nome'),
      Cliente.find(),
      Venda.find({ cancelada: false }).sort({ createdAt: -1 }).limit(500),
      Caixa.find({ status: 'fechado' }).sort({ fechadoEm: -1 }).limit(100),
      Categoria.find(),
    ])
    const agora = new Date().toISOString()
    res.setHeader('Content-Disposition', `attachment; filename="backup_${agora.split('T')[0]}.json"`)
    res.setHeader('Content-Type', 'application/json')
    res.json({ geradoEm: agora, produtos, clientes, vendas, caixas, categorias })
  } catch (error) {
    logger.error('Erro no backup:', error)
    res.status(500).json({ mensagem: 'Erro ao gerar backup' })
  }
})

app.use((req, res) => {
  res.status(404).json({ mensagem: 'Rota não encontrada' })
})

// Handler global de erros (nunca expõe detalhes internos em produção)
app.use((err, req, res, _next) => {
  logger.error(err.stack || err.message)
  const status = err.status || 500
  const mensagem = process.env.NODE_ENV === 'production'
    ? (status < 500 ? err.message : 'Erro interno do servidor')
    : err.message || 'Erro interno'
  res.status(status).json({ mensagem })
})

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Rejection:', reason)
})

process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err)
  process.exit(1)
})

if (require.main === module) {
  const PORT = process.env.PORT || 5000
  const httpServer = http.createServer(app)
  socket.init(httpServer, { origin: corsOriginCheck, credentials: true })
  httpServer.listen(PORT, () => {
    logger.info(`Cetep PDV API rodando na porta ${PORT}`)
  })
  require('./config/backup').iniciar()

  const shutdown = (signal) => {
    logger.info(`${signal} recebido — encerrando servidor...`)
    httpServer.close(async () => {
      const mongoose = require('mongoose')
      await mongoose.connection.close()
      logger.info('Servidor e conexão MongoDB encerrados.')
      process.exit(0)
    })
    setTimeout(() => process.exit(1), 10000).unref()
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
}

module.exports = app
