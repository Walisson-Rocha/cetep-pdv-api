const mongoose = require('mongoose')

const contaPagarSchema = new mongoose.Schema({
  descricao: { type: String, required: true, trim: true },
  valor: { type: Number, required: true, min: 0.01 },
  categoria: {
    type: String,
    enum: ['fornecedor', 'aluguel', 'energia', 'agua', 'funcionario', 'imposto', 'servico', 'outros'],
    default: 'outros'
  },
  vencimento: { type: Date, required: true },
  paga: { type: Boolean, default: false },
  pagaEm: { type: Date },
  valorPago: { type: Number },
  observacao: { type: String, trim: true },
  fornecedor: { type: mongoose.Schema.Types.ObjectId, ref: 'Fornecedor' },
  parcelas: { type: Number, default: 1, min: 1 },
  parcelaAtual: { type: Number, default: 1 },
  grupoId: { type: String },
  registradaPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true })

contaPagarSchema.index({ vencimento: 1, paga: 1 })
contaPagarSchema.index({ grupoId: 1 })

module.exports = mongoose.model('ContaPagar', contaPagarSchema)
