require('dotenv').config()
const express = require('express')
const cors = require('cors')
const morgan = require('morgan')
const rateLimit = require('express-rate-limit')
const connectDB = require('./config/database')

const app = express()

connectDB()

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

app.use(cors({
  origin: (origin, callback) => {
    // Permite ausência de origin (ex: curl, apps mobile) e IPs da rede local
    if (!origin) return callback(null, true)
    if (allowedOrigins.includes(origin)) return callback(null, true)
    // Permite qualquer origem 192.168.x.x em desenvolvimento
    if (process.env.NODE_ENV !== 'production' && /^http:\/\/192\.168\.\d+\.\d+(:\d+)?$/.test(origin)) {
      return callback(null, true)
    }
    callback(new Error('Origem não permitida pelo CORS'))
  },
  credentials: true,
}))

app.use(express.json({ limit: '8mb' }))
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'))
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
    console.error('Erro no backup:', error)
    res.status(500).json({ mensagem: 'Erro ao gerar backup' })
  }
})

app.use((req, res) => {
  res.status(404).json({ mensagem: 'Rota não encontrada' })
})

// Handler global de erros (nunca expõe detalhes internos em produção)
app.use((err, req, res, next) => {
  console.error(err.stack)
  const status = err.status || 500
  const mensagem = process.env.NODE_ENV === 'production'
    ? (status < 500 ? err.message : 'Erro interno do servidor')
    : err.message || 'Erro interno'
  res.status(status).json({ mensagem })
})

const PORT = process.env.PORT || 5000
app.listen(PORT, () => {
  console.log(`Cetep PDV API rodando na porta ${PORT}`)
})
