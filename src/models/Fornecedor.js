const mongoose = require('mongoose')

const fornecedorSchema = new mongoose.Schema({
  nome:        { type: String, required: true, trim: true },
  cnpj:        { type: String, trim: true },
  telefone:    { type: String, trim: true },
  whatsapp:    { type: String, trim: true },
  email:       { type: String, lowercase: true, trim: true },
  contato:     { type: String, trim: true },
  segmento:    { type: String, trim: true },
  // Endereço (opcional; quando enviado, campos obrigatórios são validados na rota)
  cep:         { type: String, trim: true },
  logradouro:  { type: String, trim: true },
  numero:      { type: String, trim: true },
  complemento: { type: String, trim: true },
  bairro:      { type: String, trim: true },
  cidade:      { type: String, trim: true },
  estado:      { type: String, trim: true },
  // Observação livre
  observacao:  { type: String, trim: true },
  ativo:       { type: Boolean, default: true }
}, { timestamps: true })

module.exports = mongoose.model('Fornecedor', fornecedorSchema)
