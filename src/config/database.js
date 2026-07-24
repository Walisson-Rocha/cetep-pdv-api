const mongoose = require('mongoose')
const logger = require('./logger')

// Em ambiente serverless (Vercel), o módulo pode ser recarregado a cada invocação
// fria. Sem cachear a conexão numa referência global, cada uma abre uma conexão
// nova com o Atlas; elas se acumulam até estourar o limite do cluster, e uma nova
// tentativa de conexão fica pendurada (sem erro, sem timeout) — travando a
// requisição indefinidamente. Cachear em `global` garante reuso entre invocações
// "quentes" da mesma instância, e o timeout abaixo garante que, se a conexão
// realmente não puder ser aberta, o erro aparece rápido em vez de travar.
let cache = global._mongooseConn
if (!cache) cache = global._mongooseConn = { conn: null, promise: null }

const connectDB = async () => {
  if (cache.conn) return cache.conn

  if (!cache.promise) {
    cache.promise = mongoose
      .connect(process.env.MONGO_URI, {
        serverSelectionTimeoutMS: 10000,
        maxPoolSize: 10,
      })
      .then((conn) => {
        logger.info(`MongoDB conectado: ${conn.connection.host}`)
        return conn
      })
      .catch((error) => {
        cache.promise = null
        logger.error(`Erro MongoDB: ${error.message}`)
        throw error
      })
  }

  cache.conn = await cache.promise
  return cache.conn
}

module.exports = connectDB