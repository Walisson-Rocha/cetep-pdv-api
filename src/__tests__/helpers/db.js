const mongoose = require('mongoose')

const waitForConnection = () => new Promise((resolve, reject) => {
  if (mongoose.connection.readyState === 1) return resolve()
  mongoose.connection.once('connected', resolve)
  mongoose.connection.once('error', reject)
})

const clearDB = async () => {
  const { collections } = mongoose.connection
  for (const key of Object.keys(collections)) {
    await collections[key].deleteMany({})
  }
}

const closeDB = async () => {
  const dbName = mongoose.connection.db?.databaseName ?? ''
  if (!dbName.includes('test')) {
    throw new Error(`closeDB recusou dropar banco "${dbName}" — URI de teste deve conter "test" no nome do banco.`)
  }
  await mongoose.connection.dropDatabase()
  // Não fecha a conexão — suítes subsequentes reutilizam a mesma conexão.
  // O processo é encerrado pelo Jest via --forceExit ao final de tudo.
}

module.exports = { waitForConnection, clearDB, closeDB }
