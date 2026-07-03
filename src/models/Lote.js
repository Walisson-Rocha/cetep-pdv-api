const mongoose = require('mongoose')

const loteSchema = new mongoose.Schema({
  produto:          { type: mongoose.Schema.Types.ObjectId, ref: 'Produto', required: true },
  loteNumero:       { type: String, default: '', trim: true },
  dataValidade:     { type: Date, required: true },
  quantidadeInicial:{ type: Number, required: true, min: 0 },
  quantidade:       { type: Number, required: true, min: 0 },
  precoCusto:       { type: Number, default: 0 },
  fornecedor:       { type: String, default: '' },
  notaFiscal:       { type: String, default: '' },
  ativo:            { type: Boolean, default: true },
}, { timestamps: true })

loteSchema.index({ produto: 1, dataValidade: 1 })
loteSchema.index({ dataValidade: 1 })
loteSchema.index({ produto: 1, ativo: 1 })

module.exports = mongoose.model('Lote', loteSchema)
