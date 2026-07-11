const mongoose = require('mongoose')

const caixaSchema = new mongoose.Schema({
  abertoEm: { type: Date, default: Date.now },
  fechadoEm: { type: Date, default: null },
  abertoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  fechadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  saldoInicial: { type: Number, required: true, default: 0 },
  saldoFinal: { type: Number, default: null },
  saldoContado: { type: Number, default: null },
  diferenca: { type: Number, default: null },
  sangrias: [{
    valor: Number,
    motivo: String,
    registradoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    em: { type: Date, default: Date.now }
  }],
  status: { type: String, enum: ['aberto', 'fechado'], default: 'aberto' },
  totalVendas: { type: Number, default: 0 },
  totalTransacoes: { type: Number, default: 0 },
  totalDinheiro: { type: Number, default: 0 },
  totalPix: { type: Number, default: 0 },
  totalDebito: { type: Number, default: 0 },
  totalCredito: { type: Number, default: 0 },
  totalFiado: { type: Number, default: 0 },
  totalMisto: { type: Number, default: 0 },
  totalBoleto: { type: Number, default: 0 },
  totalColaborador: { type: Number, default: 0 }
}, { timestamps: true })

caixaSchema.index({ status: 1 })
caixaSchema.index({ createdAt: -1 })

module.exports = mongoose.model('Caixa', caixaSchema)