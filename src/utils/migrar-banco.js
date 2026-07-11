/**
 * Migra dados do banco antigo para o novo.
 * Uso: node src/utils/migrar-banco.js
 */
require('dotenv').config()
const mongoose = require('mongoose')

const URI_ANTIGO = 'mongodb+srv://fernando:Fernas112002.@cluster0.37dpqsu.mongodb.net/cetep-pdv?appName=Cluster0'
const URI_NOVO   = process.env.MONGO_URI // lê do .env

const COLECOES = [
  'categorias',
  'produtos',
  'clientes',
  'fornecedores',
  'configuracaos',
  'users',
  'caixas',
  'vendas',
  'movimentoestoques',
  'despesas',
  'retiradas',
  'logs',
  'contapagars',
  'lotes',
  'historicoprecos',
  'anotacaos',
  'quitacaofolhas',
  'counters',
]

async function migrar() {
  console.log('🔌 Conectando aos dois bancos...')

  const connAntigo = await mongoose.createConnection(URI_ANTIGO).asPromise()
  const connNovo   = await mongoose.createConnection(URI_NOVO).asPromise()

  console.log('✅ Bancos conectados\n')

  let totalMigrado = 0

  for (const colecao of COLECOES) {
    try {
      const docs = await connAntigo.collection(colecao).find({}).toArray()
      if (docs.length === 0) {
        console.log(`⏭️  ${colecao}: vazia, pulando`)
        continue
      }

      // Remove os documentos antigos do novo banco (evita duplicatas)
      await connNovo.collection(colecao).deleteMany({})

      // Insere todos os documentos
      await connNovo.collection(colecao).insertMany(docs, { ordered: false })

      console.log(`✅ ${colecao}: ${docs.length} documento(s) migrado(s)`)
      totalMigrado += docs.length
    } catch (err) {
      if (err.code === 26) {
        console.log(`⏭️  ${colecao}: não existe no banco antigo, pulando`)
      } else {
        console.log(`⚠️  ${colecao}: erro — ${err.message}`)
      }
    }
  }

  console.log(`\n✅ Migração concluída! ${totalMigrado} documentos no total.`)
  console.log('🔑 Usuários migrados com senhas originais — use as mesmas credenciais de antes.')

  await connAntigo.close()
  await connNovo.close()
  process.exit(0)
}

migrar().catch(err => { console.error('❌', err.message); process.exit(1) })
