const mongoose = require('mongoose')
const bcrypt = require('bcryptjs')

const userSchema = new mongoose.Schema({
  nome:             { type: String, required: true, trim: true },
  email:            { type: String, required: true, unique: true, lowercase: true, trim: true },
  senha:            { type: String, required: true, minlength: 6, select: false },
  perfil:           { type: String, enum: ['admin', 'gerente', 'caixa', 'estoquista', 'colaborador'], default: 'caixa' },
  comissao:         { type: Number, default: 0 },
  telefone:         { type: String, trim: true },
  whatsapp:         { type: String, trim: true },
  cep:              { type: String, trim: true },
  logradouro:       { type: String, trim: true },
  numero:           { type: String, trim: true },
  complemento:      { type: String, trim: true },
  bairro:           { type: String, trim: true },
  cidade:           { type: String, trim: true },
  estado:           { type: String, trim: true },
  observacao:       { type: String, trim: true },
  dataAdmissao:     { type: Date },
  dataDesligamento: { type: Date },
  ativo:            { type: Boolean, default: true },
  ultimoAcesso:     { type: Date },
  tokenVersion:     { type: Number, default: 0 },
  acessosExtra:     { type: [String], default: [] },
}, { timestamps: true })

userSchema.pre('save', async function (next) {
  if (!this.isModified('senha')) return next()
  this.senha = await bcrypt.hash(this.senha, 12)
  next()
})

userSchema.methods.compararSenha = async function (senhaDigitada) {
  return await bcrypt.compare(senhaDigitada, this.senha)
}

module.exports = mongoose.model('User', userSchema)