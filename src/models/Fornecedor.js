const mongoose = require('mongoose')

const fornecedorSchema = new mongoose.Schema({
  nome: { type: String, required: true, trim: true },
  cnpj: { type: String, trim: true },
  telefone: { type: String, trim: true },
  email: { type: String, lowercase: true, trim: true },
  contato: { type: String, trim: true },
  ativo: { type: Boolean, default: true }
}, { timestamps: true })

module.exports = mongoose.model('Fornecedor', fornecedorSchema)