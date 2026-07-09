const mongoose = require('mongoose')

const configuracaoSchema = new mongoose.Schema({
  nomeLoja:   { type: String, default: 'Cetep PDV' },
  cnpj:       { type: String, default: '' },
  endereco:   { type: String, default: '' },
  telefone:   { type: String, default: '' },
  whatsapp:   { type: String, default: '' },
  chavePix:   { type: String, default: '' },
  metaMensal: { type: Number, default: 0, min: 0 },
  estoqueNegativo: { type: Boolean, default: false },
  emitirNFCe:      { type: Boolean, default: false },
  emitirNFe:       { type: Boolean, default: false },
  notificacoes: {
    estoqueBaixo: { type: Boolean, default: true },
    vencimento:   { type: Boolean, default: true },
    fiadoVencido: { type: Boolean, default: true },
  },
  fidelidade: {
    ativo:         { type: Boolean, default: false },
    pontosPorReal: { type: Number, default: 1 },
    valorPorPonto: { type: Number, default: 0.01 },
    minimoResgate: { type: Number, default: 100 },
  },
  comissao: {
    ativa: { type: Boolean, default: false },
  },
  nfce: {
    ambiente:          { type: String, enum: ['homologacao', 'producao'], default: 'homologacao' },
    uf:                { type: String, default: 'SP' },
    inscricaoEstadual: { type: String, default: '' },
    csc:               { type: String, default: '' },
    idTokenCsc:        { type: String, default: '' },
    certificadoBase64: { type: String, default: '' },  // .pfx em base64
    certificadoSenha:  { type: String, default: '' },
    certificadoInfo:   { type: String, default: '' },  // nome/validade (informativo)
    focusApiToken:     { type: String, default: '' },
    serie:             { type: String, default: '001' },
    endereco: {
      logradouro:      { type: String, default: '' },
      numero:          { type: String, default: '' },
      bairro:          { type: String, default: '' },
      municipio:       { type: String, default: '' },
      codigoMunicipio: { type: String, default: '' },
      cep:             { type: String, default: '' },
    },
  },
}, { timestamps: true })

module.exports = mongoose.model('Configuracao', configuracaoSchema)
