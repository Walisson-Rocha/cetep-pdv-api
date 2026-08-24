const mongoose = require('mongoose')
require('./Venda') // garante que o model compartilhado 'Counter' já foi registrado
const Counter = mongoose.model('Counter')

const itemTrocaSchema = new mongoose.Schema({
  produto: { type: mongoose.Schema.Types.ObjectId, ref: 'Produto', required: true },
  nomeProduto: { type: String, required: true },
  quantidade: { type: Number, required: true, min: 0.001 },
  precoUnitario: { type: Number, required: true },
  subtotal: { type: Number, required: true },
  // Só preenchido em itensDevolvidos quando a troca está vinculada a uma venda de origem —
  // aponta pro índice do item dentro de venda.itens, usado pra travar troca duplicada do
  // mesmo item e pra puxar o preço realmente cobrado (não o preço de catálogo atual).
  itemIndex: { type: Number, default: null },
}, { _id: false })

const trocaSchema = new mongoose.Schema({
  numero: { type: Number, unique: true },
  vendaOrigem: { type: mongoose.Schema.Types.ObjectId, ref: 'Venda', default: null },
  itensDevolvidos: [itemTrocaSchema],
  itensNovos: [itemTrocaSchema],
  valorDevolvido: { type: Number, required: true },
  valorNovo: { type: Number, required: true },
  diferenca: { type: Number, required: true }, // valorNovo - valorDevolvido. Positivo = cliente paga, negativo = loja devolve.
  formaPagamentoDiferenca: { type: String, default: null }, // só quando diferenca > 0
  caixa: { type: mongoose.Schema.Types.ObjectId, ref: 'Caixa', required: true },
  vendedor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  registradaPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  observacao: { type: String, default: '' },
}, { timestamps: true })

trocaSchema.index({ createdAt: -1 })
trocaSchema.index({ caixa: 1, createdAt: -1 })
trocaSchema.index({ vendaOrigem: 1 })

trocaSchema.pre('save', async function (next) {
  if (this.isNew) {
    const counter = await Counter.findByIdAndUpdate(
      'trocaNumero',
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    )
    this.numero = counter.seq
  }
  next()
})

module.exports = mongoose.model('Troca', trocaSchema)
