const mongoose = require('mongoose')

const configuracaoSchema = new mongoose.Schema({
  nomeLoja:   { type: String, default: 'Cetep PDV' },
  cnpj:       { type: String, default: '' },
  endereco:   { type: String, default: '' },
  telefone:   { type: String, default: '' },
  whatsapp:   { type: String, default: '' },
  chavePix:   { type: String, default: '' },
  metaMensal: { type: Number, default: 0, min: 0 },
  estoqueNegativo: { type: Boolean, default: false },
  emitirNFCe:      { type: Boolean, default: false },
  emitirNFe:       { type: Boolean, default: false },
  notificacoes: {
    estoqueBaixo: { type: Boolean, default: true },
    vencimento:   { type: Boolean, default: true },
    fiadoVencido: { type: Boolean, default: true },
  },
  fidelidade: {
    ativo:         { type: Boolean, default: false },
    pontosPorReal: { type: Number, default: 1 },
    valorPorPonto: { type: Number, default: 0.01 },
    minimoResgate: { type: Number, default: 100 },
  },
  comissao: {
    ativa: { type: Boolean, default: false },
  }
}, { timestamps: true })

module.exports = mongoose.model('Configuracao', configuracaoSchema)
