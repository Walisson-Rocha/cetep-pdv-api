const mongoose = require('mongoose')

const despesaSchema = new mongoose.Schema({
  descricao: { type: String, required: true, trim: true },
  valor: { type: Number, required: true, min: 0 },
  categoria: {
    type: String,
    enum: ['aluguel', 'energia', 'agua', 'fornecedor', 'funcionario', 'limpeza', 'frete', 'outros'],
    default: 'outros'
  },
  vencimento: { type: Date },
  paga: { type: Boolean, default: false },
  pagaEm: { type: Date },
  registradaPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true })

module.exports = mongoose.model('Despesa', despesaSchema)