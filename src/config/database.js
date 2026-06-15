const mongoose = require('mongoose')

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI)
    console.log(`✅ MongoDB conectado: ${conn.connection.host}`)
  } catch (error) {
    console.error(`❌ Erro MongoDB: ${error.message}`)
    throw error
  }
}

module.exports = connectDB