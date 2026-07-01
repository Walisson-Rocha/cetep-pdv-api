require('dotenv').config()
const mongoose = require('mongoose')
const Fornecedor = require('../models/Fornecedor')
const Categoria = require('../models/Categoria')

async function listar() {
  await mongoose.connect(process.env.MONGO_URI)
  const fornecedores = await Fornecedor.find({ ativo: true }).select('_id nome')
  const categorias = await Categoria.find().select('_id nome icone')
  console.log('FORNECEDORES:', JSON.stringify(fornecedores, null, 2))
  console.log('CATEGORIAS:', JSON.stringify(categorias, null, 2))
  await mongoose.disconnect()
}

listar().catch(e => { console.error(e); process.exit(1) })
