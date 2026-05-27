const mongoose = require('mongoose')

const categoriaSchema = new mongoose.Schema({
  nome: { type: String, required: true, trim: true, unique: true },
  cor: { type: String, default: '#16A97B' },
  icone: { type: String, default: '📦' },
  ativo: { type: Boolean, default: true }
}, { timestamps: true })

module.exports = mongoose.model('Categoria', categoriaSchema)