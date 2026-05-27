const mongoose = require('mongoose')

const clienteSchema = new mongoose.Schema({
  nome: { type: String, required: true, trim: true },
  tipo: { type: String, enum: ['PF', 'PJ'], default: 'PF' },
  cpf: { type: String, trim: true, sparse: true },
  cnpj: { type: String, trim: true, sparse: true },
  dataNascimento: { type: Date },
  telefone: { type: String, trim: true },
  whatsapp: { type: String, trim: true },
  email: { type: String, lowercase: true, trim: true },
  endereco: { type: String, trim: true },
  limiteCredito: { type: Number, default: 0 },
  saldoFiado: { type: Number, default: 0 },
  ativo: { type: Boolean, default: true },
  observacoes: { type: String }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
})

clienteSchema.virtual('statusFiado').get(function () {
  if (this.saldoFiado === 0) return 'regular'
  if (this.saldoFiado >= this.limiteCredito) return 'acima_limite'
  if (this.saldoFiado >= this.limiteCredito * 0.8) return 'proximo_limite'
  return 'ativo'
})

module.exports = mongoose.model('Cliente', clienteSchema)