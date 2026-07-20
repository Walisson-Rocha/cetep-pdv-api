const mongoose = require('mongoose')

const itemTrocaSchema = new mongoose.Schema({
  produto: { type: mongoose.Schema.Types.ObjectId, ref: 'Produto', required: true },
  nomeProduto: { type: String, required: true },
  quantidade: { type: Number, required: true, min: 0.001 },
  precoUnitario: { type: Number, required: true },
  subtotal: { type: Number, required: true }
}, { _id: false })

const trocaSchema = new mongoose.Schema({
  vendaOrigem: { type: mongoose.Schema.Types.ObjectId, ref: 'Venda', required: true },
  itemIndex: { type: Number, required: true },
  itemOrigem: { type: itemTrocaSchema, required: true },
  itemNovo: { type: itemTrocaSchema, required: true },
  valorAntigo: { type: Number, required: true },
  valorNovo: { type: Number, required: true },
  diferenca: { type: Number, required: true },
  formaPagamentoDiferenca: {
    type: String,
    enum: ['dinheiro', 'pix', 'debito', 'credito', 'fiado', 'boleto', 'colaborador', 'misto', null],
    default: null
  },
  formasPagamentoDiferenca: [{
    metodo: { type: String },
    valor: { type: Number }
  }],
  cliente: { type: mongoose.Schema.Types.ObjectId, ref: 'Cliente', default: null },
  colaborador: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  caixa: { type: mongoose.Schema.Types.ObjectId, ref: 'Caixa', required: true },
  responsavel: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  motivo: { type: String, default: '' }
}, { timestamps: true })

trocaSchema.index({ vendaOrigem: 1 })
trocaSchema.index({ createdAt: -1 })

module.exports = mongoose.model('Troca', trocaSchema)
