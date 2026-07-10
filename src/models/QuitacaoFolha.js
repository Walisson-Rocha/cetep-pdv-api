const mongoose = require('mongoose')

const quitacaoFolhaSchema = new mongoose.Schema({
  colaborador: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  mes: { type: Number, required: true }, // YYYYMM ex: 202607
  total: { type: Number, required: true },
  observacao: { type: String, trim: true, default: '' },
  registradaPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true })

quitacaoFolhaSchema.index({ colaborador: 1, mes: 1 }, { unique: true })

module.exports = mongoose.model('QuitacaoFolha', quitacaoFolhaSchema)
