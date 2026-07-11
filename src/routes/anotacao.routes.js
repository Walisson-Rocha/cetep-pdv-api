const express = require('express')
const router = express.Router()
const Anotacao = require('../models/Anotacao')
const { protect } = require('../middleware/auth.middleware')

router.use(protect)

router.get('/', async (req, res) => {
  try {
    const doc = await Anotacao.findById('global')
    res.json({ texto: doc?.texto || '' })
  } catch {
    res.status(500).json({ mensagem: 'Erro ao carregar anotações' })
  }
})

router.put('/', async (req, res) => {
  try {
    const texto = String(req.body.texto ?? '').slice(0, 50000)
    const doc = await Anotacao.findByIdAndUpdate(
      'global',
      { texto, atualizadoPor: req.user.nome },
      { upsert: true, new: true }
    )
    res.json({ texto: doc.texto })
  } catch {
    res.status(500).json({ mensagem: 'Erro ao salvar anotações' })
  }
})

module.exports = router
