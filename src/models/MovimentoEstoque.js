const mongoose = require('mongoose')

const movimentoEstoqueSchema = new mongoose.Schema({
  produto: { type: mongoose.Schema.Types.ObjectId, ref: 'Produto', required: true },
  tipo: { type: String, enum: ['entrada', 'saida', 'ajuste', 'inventario'], required: true },
  quantidade: { type: Number, required: true },
  estoqueAnterior: { type: Number, required: true },
  estoqueAtual: { type: Number, required: true },
  motivo: { type: String },
  destino: { type: String, trim: true },
  valorUnitario: { type: Number, default: null },
  valorTotal: { type: Number, default: null },
  venda: { type: mongoose.Schema.Types.ObjectId, ref: 'Venda', default: null },
  responsavel: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true })

module.exports = mongoose.model('MovimentoEstoque', movimentoEstoqueSchema)