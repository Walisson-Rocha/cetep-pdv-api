const mongoose = require('mongoose')

// Documento singleton — sempre upsert no id fixo 'global'
const anotacaoSchema = new mongoose.Schema({
  _id: { type: String, default: 'global' },
  texto: { type: String, default: '' },
  atualizadoPor: { type: String, default: '' },
}, { timestamps: true })

module.exports = mongoose.model('Anotacao', anotacaoSchema)
