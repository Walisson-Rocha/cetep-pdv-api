const mongoose = require('mongoose')

const produtoSchema = new mongoose.Schema({
  nome: { type: String, required: true, trim: true },
  codigoBarras: { type: String, unique: true, sparse: true, trim: true },
  codigosBarras: [{ type: String, trim: true }],
  categoria: { type: mongoose.Schema.Types.ObjectId, ref: 'Categoria', required: true },
  precoVenda: { type: Number, required: true, min: 0 },
  precoAtacado: { type: Number, default: 0, min: 0 },
  quantidadeAtacado: { type: Number, default: 6, min: 1 },
  precoCusto: { type: Number, default: 0, min: 0 },
  imagem: { type: String, trim: true },
  estoque: { type: Number, default: 0, min: 0 },
  estoqueMinimo: { type: Number, default: 5 },
  estoqueMaximo: { type: Number, default: 100 },
  unidade: { type: String, enum: ['un', 'kg', 'g', 'l', 'ml', 'cx', 'pct'], default: 'un' },
  validade: { type: Date, default: null },
  validade2: { type: Date, default: null },
  validade3: { type: Date, default: null },
  fornecedor: { type: mongoose.Schema.Types.ObjectId, ref: 'Fornecedor' },
  descricao: { type: String, trim: true },
  promocao: {
    ativa: { type: Boolean, default: false },
    desconto: { type: Number, default: 0, min: 0, max: 100 },
    dataInicio: { type: Date, default: null },
    dataFim: { type: Date, default: null },
  },
  ativo: { type: Boolean, default: true },
  tipo: { type: String, enum: ['simples', 'combo'], default: 'simples' },
  componentes: [{
    produto: { type: mongoose.Schema.Types.ObjectId, ref: 'Produto' },
    nomeProduto: { type: String, trim: true },
    quantidade: { type: Number, default: 1, min: 0.01 },
  }],
  precosParcelamento: [{
    rotulo: { type: String, required: true, trim: true },
    valor: { type: Number, required: true, min: 0 },
  }],
  // Dados fiscais para NFC-e
  ncm:            { type: String, default: '', trim: true },
  cfop:           { type: String, default: '5102', trim: true },
  csosn:          { type: String, default: '400', trim: true },
  origemProduto:  { type: Number, default: 0 },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
})

produtoSchema.virtual('margem').get(function () {
  if (!this.precoCusto || this.precoCusto === 0) return 0
  return Math.round(((this.precoVenda - this.precoCusto) / this.precoVenda) * 100)
})

produtoSchema.virtual('statusEstoque').get(function () {
  if (this.estoque === 0) return 'zerado'
  if (this.estoque <= this.estoqueMinimo) return 'baixo'
  if (this.validade && new Date(this.validade) <= new Date(Date.now() + 5 * 24 * 60 * 60 * 1000)) return 'vencendo'
  return 'normal'
})

produtoSchema.index({ nome: 'text', codigoBarras: 1 })
produtoSchema.index({ ativo: 1, nome: 1 })
produtoSchema.index({ ativo: 1, categoria: 1, nome: 1 })
produtoSchema.index({ codigosBarras: 1 })

module.exports = mongoose.model('Produto', produtoSchema)