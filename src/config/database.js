const mongoose = require('mongoose')
const logger = require('./logger')

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI)
    logger.info(`MongoDB conectado: ${conn.connection.host}`)
  } catch (error) {
    logger.error(`Erro MongoDB: ${error.message}`)
    throw error
  }
}

module.exports = connectDB