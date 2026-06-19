const logger = require('../config/logger')
const express = require('express')
const router = express.Router()
const { protect, authorize } = require('../middleware/auth.middleware')
const Configuracao = require('../models/Configuracao')

router.use(protect)

router.get('/', async (req, res) => {
  try {
    let config = await Configuracao.findOne()
    if (!config) config = await Configuracao.create({})
    res.json(config)
  } catch (error) {
    logger.error('Erro ao buscar configurações:', error)
    res.status(500).json({ mensagem: 'Erro ao buscar configurações' })
  }
})

router.put('/', authorize('admin'), async (req, res) => {
  try {
    const { nomeLoja, cnpj, endereco, telefone, whatsapp, chavePix, metaMensal, notificacoes, estoqueNegativo, emitirNFCe, emitirNFe } = req.body
    const config = await Configuracao.findOneAndUpdate(
      {},
      { $set: { nomeLoja, cnpj, endereco, telefone, whatsapp, chavePix, metaMensal, notificacoes, estoqueNegativo, emitirNFCe, emitirNFe } },
      { new: true, upsert: true, runValidators: true }
    )
    res.json({ config, mensagem: 'Configurações salvas com sucesso!' })
  } catch (error) {
    logger.error('Erro ao salvar configurações:', error)
    res.status(500).json({ mensagem: 'Erro ao salvar configurações' })
  }
})

module.exports = router
