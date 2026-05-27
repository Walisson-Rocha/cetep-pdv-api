const mongoose = require('mongoose')
const bcrypt = require('bcryptjs')

const userSchema = new mongoose.Schema({
  nome: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  senha: { type: String, required: true, minlength: 6, select: false },
  perfil: { type: String, enum: ['admin', 'gerente', 'caixa', 'estoquista', 'colaborador'], default: 'caixa' },
  ativo: { type: Boolean, default: true },
  ultimoAcesso: { type: Date }
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