const mongoose = require('mongoose')

const comissaoPagaSchema = new mongoose.Schema({
  vendedor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  periodoInicio: { type: Date, required: true },
  periodoFim: { type: Date, required: true },
  totalVendas: { type: Number, required: true },
  percentualComissao: { type: Number, required: true },
  valorComissao: { type: Number, required: true },
  observacao: { type: String, trim: true },
  registradoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true })

comissaoPagaSchema.index({ vendedor: 1, createdAt: -1 })

module.exports = mongoose.model('ComissaoPaga', comissaoPagaSchema)
