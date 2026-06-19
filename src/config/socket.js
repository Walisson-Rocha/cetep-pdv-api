const { Server } = require('socket.io')
const jwt = require('jsonwebtoken')
const logger = require('./logger')

let io = null

const init = (httpServer, corsOptions) => {
  io = new Server(httpServer, { cors: corsOptions })

  // Exige um token JWT válido na conexão — evita que clientes anônimos escutem eventos do negócio
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token
      if (!token) return next(new Error('Token ausente'))
      jwt.verify(token, process.env.JWT_SECRET)
      next()
    } catch {
      next(new Error('Token inválido'))
    }
  })

  io.on('connection', (socket) => {
    logger.debug(`Socket conectado: ${socket.id}`)
    socket.on('disconnect', () => logger.debug(`Socket desconectado: ${socket.id}`))
  })

  return io
}

// Emite um evento para todos os clientes conectados; no-op seguro se o socket ainda não foi iniciado (ex: testes)
const emit = (evento, payload) => {
  if (!io) return
  io.emit(evento, payload)
}

module.exports = { init, emit }
