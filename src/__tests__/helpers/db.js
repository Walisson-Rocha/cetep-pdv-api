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
  await mongoose.connection.dropDatabase()
  await mongoose.connection.close()
}

module.exports = { waitForConnection, clearDB, closeDB }
