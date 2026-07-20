const logger = require('../config/logger')
const express = require('express')
const router = express.Router()
const { protect, authorize } = require('../middleware/auth.middleware')
const Configuracao = require('../models/Configuracao')
const socket = require('../config/socket')

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

router.put('/', authorize('admin', 'gerente'), async (req, res) => {
  try {
    if (req.body.limitesDesconto && req.user.perfil !== 'admin') {
      return res.status(403).json({ mensagem: 'Apenas administradores podem definir limites de desconto' })
    }
    const {
      nomeLoja, razaoSocial, cnpj, ie, email, crt,
      logradouro, numero, bairro, cidade, uf, cep, complemento, endereco,
      telefone, whatsapp, chavePix, metaMensal,
      notificacoes, estoqueNegativo, emitirNFCe, emitirNFe,
      limitesDesconto,
      nfce,
    } = req.body
    // Monta o $set sem substituir subdocumentos inteiros (preserva certificado)
    const setFields = {
      nomeLoja, razaoSocial, cnpj, ie, email, crt,
      logradouro, numero, bairro, cidade, uf, cep, complemento, endereco,
      telefone, whatsapp, chavePix, metaMensal,
      notificacoes, estoqueNegativo, emitirNFCe, emitirNFe,
    }
    if (limitesDesconto) setFields.limitesDesconto = limitesDesconto
    // Usa campos dotted para nfce — não sobrescreve certificadoBase64/Senha
    if (nfce) {
      const flatten = (obj, prefix) => {
        for (const [k, v] of Object.entries(obj)) {
          if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
            flatten(v, `${prefix}.${k}`)
          } else if (v !== undefined) {
            setFields[`${prefix}.${k}`] = v
          }
        }
      }
      flatten(nfce, 'nfce')
    }
    const config = await Configuracao.findOneAndUpdate(
      {},
      { $set: setFields },
      { new: true, upsert: true, runValidators: true }
    )
    if (limitesDesconto) {
      socket.emit('configuracoes:atualizada', { limitesDesconto: config.limitesDesconto })
    }
    res.json({ config, mensagem: 'Configurações salvas com sucesso!' })
  } catch (error) {
    logger.error('Erro ao salvar configurações:', error)
    res.status(500).json({ mensagem: 'Erro ao salvar configurações' })
  }
})

module.exports = router
