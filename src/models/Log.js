const mongoose = require('mongoose')

const logSchema = new mongoose.Schema({
  usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  nomeUsuario: { type: String },
  acao: {
    type: String,
    enum: [
      'login', 'logout',
      'venda_realizada', 'venda_cancelada',
      'estoque_entrada', 'estoque_saida', 'estoque_ajuste',
      'produto_criado', 'produto_editado', 'preco_alterado',
      'caixa_aberto', 'caixa_fechado', 'sangria',
      'cliente_criado', 'cliente_editado',
      'despesa_criada', 'usuario_criado', 'usuario_editado', 'usuario_desativado', 'usuario_excluido_permanente',
      'retirada_criada', 'permissoes_atualizadas'
    ],
    required: true
  },
  detalhes: { type: String },
  referencia: { type: mongoose.Schema.Types.ObjectId },
  ip: { type: String }
}, { timestamps: true })

logSchema.index({ createdAt: -1 })
logSchema.index({ usuario: 1, createdAt: -1 })

module.exports = mongoose.model('Log', logSchema)