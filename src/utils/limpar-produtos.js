require('dotenv').config()
const mongoose = require('mongoose')
const Produto = require('../models/Produto')

async function limpar() {
  await mongoose.connect(process.env.MONGO_URI)
  const resultado = await Produto.deleteMany({})
  console.log(`✅ ${resultado.deletedCount} produto(s) removido(s)`)
  await mongoose.disconnect()
}

limpar().catch(e => { console.error(e); process.exit(1) })
