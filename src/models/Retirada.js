const mongoose = require('mongoose')

const itemRetiradaSchema = new mongoose.Schema({
  produto: { type: mongoose.Schema.Types.ObjectId, ref: 'Produto', required: true },
  nomeProduto: { type: String, required: true },
  quantidade: { type: Number, required: true, min: 1 },
  precoUnitario: { type: Number, required: true },
  subtotal: { type: Number, required: true },
}, { _id: false })

const retiradaSchema = new mongoose.Schema({
  colaborador: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  itens: [itemRetiradaSchema],
  total: { type: Number, required: true },
  mes: { type: Number, required: true }, // YYYYMM — ex: 202605
  observacao: { type: String, trim: true },
  registradaPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  vendaOrigem: { type: mongoose.Schema.Types.ObjectId, ref: 'Venda', default: null },
}, { timestamps: true })

retiradaSchema.index({ colaborador: 1, mes: -1 })
retiradaSchema.index({ mes: -1 })

module.exports = mongoose.model('Retirada', retiradaSchema)
