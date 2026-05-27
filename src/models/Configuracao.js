const mongoose = require('mongoose')

const configuracaoSchema = new mongoose.Schema({
  nomeLoja:   { type: String, default: 'Cetep PDV' },
  cnpj:       { type: String, default: '' },
  endereco:   { type: String, default: '' },
  telefone:   { type: String, default: '' },
  whatsapp:   { type: String, default: '' },
  chavePix:   { type: String, default: '' },
  metaMensal: { type: Number, default: 0, min: 0 },
  notificacoes: {
    estoqueBaixo: { type: Boolean, default: true },
    vencimento:   { type: Boolean, default: true },
    fiadoVencido: { type: Boolean, default: true },
  }
}, { timestamps: true })

module.exports = mongoose.model('Configuracao', configuracaoSchema)
