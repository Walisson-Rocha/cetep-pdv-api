const mongoose = require('mongoose')

const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 }
})
const Counter = mongoose.model('Counter', counterSchema)

const itemVendaSchema = new mongoose.Schema({
  produto: { type: mongoose.Schema.Types.ObjectId, ref: 'Produto', required: true },
  nomeProduto: { type: String, required: true },
  quantidade: { type: Number, required: true, min: 0.001 },
  precoUnitario: { type: Number, required: true },
  desconto: { type: Number, default: 0 },
  subtotal: { type: Number, required: true }
}, { _id: false })

const vendaSchema = new mongoose.Schema({
  numero: { type: Number, unique: true },
  itens: [itemVendaSchema],
  subtotal: { type: Number, required: true },
  desconto: { type: Number, default: 0 },
  total: { type: Number, required: true },
  formaPagamento: {
    type: String,
    enum: ['dinheiro', 'pix', 'debito', 'credito', 'fiado', 'boleto', 'colaborador', 'misto'],
    required: true
  },
  formasPagamento: [{
    metodo: { type: String },
    valor: { type: Number }
  }],
  troco: { type: Number, default: 0 },
  cliente: { type: mongoose.Schema.Types.ObjectId, ref: 'Cliente', default: null },
  colaborador: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  caixa: { type: mongoose.Schema.Types.ObjectId, ref: 'Caixa', required: true },
  vendedor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  cancelada: { type: Boolean, default: false },
  motivoCancelamento: { type: String },
  canceladaPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  canceladaEm: { type: Date }
}, { timestamps: true })

vendaSchema.index({ createdAt: -1 })
vendaSchema.index({ cancelada: 1, createdAt: -1 })

// Número de venda gerado atomicamente — sem race condition
vendaSchema.pre('save', async function (next) {
  if (this.isNew) {
    const counter = await Counter.findByIdAndUpdate(
      'vendaNumero',
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    )
    this.numero = counter.seq
  }
  next()
})

module.exports = mongoose.model('Venda', vendaSchema)
