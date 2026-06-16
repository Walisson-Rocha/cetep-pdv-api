const express = require('express')
const router = express.Router()
const Fornecedor = require('../models/Fornecedor')
const { protect, authorize } = require('../middleware/auth.middleware')

router.use(protect)

const CAMPOS_ENDERECO = ['cep', 'logradouro', 'numero', 'bairro', 'cidade', 'estado']

function validar(body) {
  const { nome, telefone, whatsapp } = body
  const erros = []

  if (!nome?.trim()) erros.push('Nome é obrigatório')

  if (!telefone?.trim() && !whatsapp?.trim())
    erros.push('Informe ao menos Telefone 1 ou WhatsApp')

  // Se qualquer campo de endereço foi enviado, todos os obrigatórios devem estar preenchidos
  const temAlgumEndereco = CAMPOS_ENDERECO.some(c => body[c]?.trim())
  if (temAlgumEndereco) {
    CAMPOS_ENDERECO.forEach(campo => {
      if (!body[campo]?.trim())
        erros.push(`Campo de endereço obrigatório: ${campo}`)
    })
  }

  return erros
}

function extrairCampos(body) {
  return {
    nome:        body.nome,
    cnpj:        body.cnpj,
    telefone:    body.telefone,
    whatsapp:    body.whatsapp,
    email:       body.email,
    contato:     body.contato,
    segmento:    body.segmento,
    cep:         body.cep,
    logradouro:  body.logradouro,
    numero:      body.numero,
    complemento: body.complemento,
    bairro:      body.bairro,
    cidade:      body.cidade,
    estado:      body.estado,
    observacao:  body.observacao,
  }
}

router.get('/', async (req, res) => {
  try {
    const fornecedores = await Fornecedor.find({ ativo: true }).sort({ nome: 1 })
    res.json({ fornecedores })
  } catch (error) {
    console.error('Erro ao buscar fornecedores:', error)
    res.status(500).json({ mensagem: 'Erro ao buscar fornecedores' })
  }
})

router.post('/', authorize('admin', 'gerente'), async (req, res) => {
  try {
    const erros = validar(req.body)
    if (erros.length) return res.status(400).json({ mensagem: erros[0], erros })

    const f = await Fornecedor.create(extrairCampos(req.body))
    res.status(201).json({ fornecedor: f })
  } catch (error) {
    console.error('Erro ao criar fornecedor:', error)
    res.status(500).json({ mensagem: 'Erro ao criar fornecedor' })
  }
})

router.put('/:id', authorize('admin', 'gerente'), async (req, res) => {
  try {
    if (req.body.ativo === false) {
      // Desativação rápida — não revalida campos
      const f = await Fornecedor.findByIdAndUpdate(req.params.id, { ativo: false }, { new: true })
      if (!f) return res.status(404).json({ mensagem: 'Fornecedor não encontrado' })
      return res.json({ fornecedor: f })
    }

    const erros = validar(req.body)
    if (erros.length) return res.status(400).json({ mensagem: erros[0], erros })

    const f = await Fornecedor.findByIdAndUpdate(
      req.params.id,
      { ...extrairCampos(req.body), ativo: req.body.ativo ?? true },
      { new: true, runValidators: true }
    )
    if (!f) return res.status(404).json({ mensagem: 'Fornecedor não encontrado' })
    res.json({ fornecedor: f })
  } catch (error) {
    console.error('Erro ao atualizar fornecedor:', error)
    res.status(500).json({ mensagem: 'Erro ao atualizar fornecedor' })
  }
})

module.exports = router
