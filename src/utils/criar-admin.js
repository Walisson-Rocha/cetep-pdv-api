/**
 * Cria um usuário admin no banco sem apagar nada.
 * Uso: node src/utils/criar-admin.js
 */
require('dotenv').config()
const mongoose = require('mongoose')
const bcrypt = require('bcryptjs')
const User = require('../models/User')

const NOME  = 'Administrador'
const EMAIL = 'admin@pdv.com'
const SENHA = 'admin123'

async function main() {
  await mongoose.connect(process.env.MONGO_URI)
  console.log('✅ MongoDB conectado')

  const existe = await User.findOne({ email: EMAIL })
  if (existe) {
    console.log(`⚠️  Usuário ${EMAIL} já existe — nada foi alterado.`)
    process.exit(0)
  }

  const hash = await bcrypt.hash(SENHA, 12)
  await User.create({ nome: NOME, email: EMAIL, senha: hash, perfil: 'admin', ativo: true })

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('🔑 Admin criado com sucesso!')
  console.log(`   Email: ${EMAIL}`)
  console.log(`   Senha: ${SENHA}`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('⚠️  Troque a senha após o primeiro login!')
  process.exit(0)
}

main().catch(err => { console.error('❌', err.message); process.exit(1) })
