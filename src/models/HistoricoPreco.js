const mongoose = require('mongoose')

const historicoPrecoSchema = new mongoose.Schema({
  produto: { type: mongoose.Schema.Types.ObjectId, ref: 'Produto', required: true, index: true },
  nomeProduto: { type: String, required: true },
  precoVendaAnterior: { type: Number },
  precoVendaNovo: { type: Number },
  precoCustoAnterior: { type: Number },
  precoCustoNovo: { type: Number },
  usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
  nomeUsuario: { type: String },
}, { timestamps: true })

module.exports = mongoose.model('HistoricoPreco', historicoPrecoSchema)
