require('dotenv').config()
const mongoose = require('mongoose')
const Produto = require('../models/Produto')

const F = {
  alimentos:     '6a2f50111c9e2e83d5ad4dbe',
  tech:          '6a2f50111c9e2e83d5ad4dbf',
  distribuidora: '6a2f50111c9e2e83d5ad4dbb',
  papelaria:     '6a2f50111c9e2e83d5ad4dbc',
  textil:        '6a2f50111c9e2e83d5ad4dbd',
}

const C = {
  brinquedos:    '6a2d41959267f266dc98bd77',
  variedades:    '6a2d41959267f266dc98bd7a',
  ferramentas:   '6a2d41959267f266dc98bd7b',
  informatica:   '6a2d41959267f266dc98bd7d',
  uniforme:      '6a2d41959267f266dc98bd7e',
  espacoMulher:  '6a2d41959267f266dc98bd7f',
  alimentos:     '6a2d41959267f266dc98bd81',
  bebidas:       '6a2d41959267f266dc98bd82',
  papelaria:     '6a2d41959267f266dc98bd72',
  embalagens:    '6a2d41959267f266dc98bd7c',
  utilidades:    '6a2d41959267f266dc98bd78',
  armarinho:     '6a2d41959267f266dc98bd79',
  roupa:         '6a2d41959267f266dc98bd80',
  escritorio:    '6a2d41959267f266dc98bd73',
  saude:         '6a2d41959267f266dc98bd74',
  lanchonete:    '6a2d41959267f266dc98bd75',
  bomboniere:    '6a2d41959267f266dc98bd76',
}

const validade = (meses) => {
  const d = new Date()
  d.setMonth(d.getMonth() + meses)
  return d
}

const produtos = [
  // --- Alimentos & Cia ---
  { nome: 'Arroz Branco 5kg', codigoBarras: '7891234100001', categoria: C.alimentos, fornecedor: F.alimentos, precoCusto: 18.50, precoVenda: 26.90, precoAtacado: 24.50, quantidadeAtacado: 5, estoque: 80, estoqueMinimo: 10, estoqueMaximo: 200, unidade: 'un', validade: validade(12), descricao: 'Arroz branco tipo 1, pacote 5kg' },
  { nome: 'Feijão Carioca 1kg', codigoBarras: '7891234100002', categoria: C.alimentos, fornecedor: F.alimentos, precoCusto: 7.20, precoVenda: 11.90, precoAtacado: 10.50, quantidadeAtacado: 6, estoque: 60, estoqueMinimo: 10, estoqueMaximo: 150, unidade: 'un', validade: validade(10), descricao: 'Feijão carioca tipo 1, pacote 1kg' },
  { nome: 'Óleo de Soja 900ml', codigoBarras: '7891234100003', categoria: C.alimentos, fornecedor: F.alimentos, precoCusto: 6.80, precoVenda: 10.50, precoAtacado: 9.20, quantidadeAtacado: 6, estoque: 50, estoqueMinimo: 8, estoqueMaximo: 100, unidade: 'un', validade: validade(8), descricao: 'Óleo de soja refinado 900ml' },
  { nome: 'Açúcar Cristal 1kg', codigoBarras: '7891234100004', categoria: C.alimentos, fornecedor: F.alimentos, precoCusto: 4.10, precoVenda: 6.90, precoAtacado: 5.90, quantidadeAtacado: 10, estoque: 70, estoqueMinimo: 10, estoqueMaximo: 150, unidade: 'un', validade: validade(18), descricao: 'Açúcar cristal especial 1kg' },
  { nome: 'Macarrão Espaguete 500g', codigoBarras: '7891234100005', categoria: C.alimentos, fornecedor: F.alimentos, precoCusto: 3.20, precoVenda: 5.50, precoAtacado: 4.80, quantidadeAtacado: 12, estoque: 90, estoqueMinimo: 15, estoqueMaximo: 200, unidade: 'un', validade: validade(14), descricao: 'Macarrão espaguete 500g' },
  { nome: 'Refrigerante Cola 2L', codigoBarras: '7891234100006', categoria: C.bebidas, fornecedor: F.alimentos, precoCusto: 5.50, precoVenda: 8.90, precoAtacado: 7.90, quantidadeAtacado: 6, estoque: 48, estoqueMinimo: 12, estoqueMaximo: 120, unidade: 'un', validade: validade(4), descricao: 'Refrigerante sabor cola garrafa 2L' },
  { nome: 'Suco de Laranja 1L', codigoBarras: '7891234100007', categoria: C.bebidas, fornecedor: F.alimentos, precoCusto: 4.80, precoVenda: 7.90, precoAtacado: 6.90, quantidadeAtacado: 6, estoque: 36, estoqueMinimo: 6, estoqueMaximo: 80, unidade: 'un', validade: validade(3), descricao: 'Suco de laranja integral 1L' },
  { nome: 'Chocolate ao Leite 100g', codigoBarras: '7891234100008', categoria: C.bomboniere, fornecedor: F.alimentos, precoCusto: 3.90, precoVenda: 6.50, precoAtacado: 5.80, quantidadeAtacado: 10, estoque: 55, estoqueMinimo: 10, estoqueMaximo: 100, unidade: 'un', validade: validade(6), descricao: 'Barra de chocolate ao leite 100g' },

  // --- TechSupply Brasil ---
  { nome: 'Mouse USB Óptico', codigoBarras: '7891234200001', categoria: C.informatica, fornecedor: F.tech, precoCusto: 18.00, precoVenda: 32.90, precoAtacado: 28.00, quantidadeAtacado: 5, estoque: 25, estoqueMinimo: 5, estoqueMaximo: 60, unidade: 'un', descricao: 'Mouse óptico USB 1000 DPI' },
  { nome: 'Teclado USB ABNT2', codigoBarras: '7891234200002', categoria: C.informatica, fornecedor: F.tech, precoCusto: 32.00, precoVenda: 59.90, precoAtacado: 52.00, quantidadeAtacado: 3, estoque: 15, estoqueMinimo: 3, estoqueMaximo: 40, unidade: 'un', descricao: 'Teclado USB padrão ABNT2 com fio' },
  { nome: 'Pen Drive 32GB', codigoBarras: '7891234200003', categoria: C.informatica, fornecedor: F.tech, precoCusto: 22.00, precoVenda: 39.90, precoAtacado: 34.00, quantidadeAtacado: 5, estoque: 30, estoqueMinimo: 5, estoqueMaximo: 80, unidade: 'un', descricao: 'Pen drive USB 3.0 32GB' },
  { nome: 'Cabo HDMI 1,5m', codigoBarras: '7891234200004', categoria: C.informatica, fornecedor: F.tech, precoCusto: 12.00, precoVenda: 24.90, precoAtacado: 20.00, quantidadeAtacado: 5, estoque: 20, estoqueMinimo: 5, estoqueMaximo: 50, unidade: 'un', descricao: 'Cabo HDMI 2.0 1,5 metros' },
  { nome: 'Carregador USB-C 20W', codigoBarras: '7891234200005', categoria: C.informatica, fornecedor: F.tech, precoCusto: 25.00, precoVenda: 49.90, precoAtacado: 42.00, quantidadeAtacado: 4, estoque: 18, estoqueMinimo: 4, estoqueMaximo: 50, unidade: 'un', descricao: 'Carregador USB-C 20W carga rápida' },

  // --- Distribuidora Central ---
  { nome: 'Copo Descartável 200ml (c/100)', codigoBarras: '7891234300001', categoria: C.embalagens, fornecedor: F.distribuidora, precoCusto: 4.50, precoVenda: 7.90, precoAtacado: 6.50, quantidadeAtacado: 10, estoque: 100, estoqueMinimo: 20, estoqueMaximo: 300, unidade: 'pct', descricao: 'Copo descartável branco 200ml pacote com 100 unidades' },
  { nome: 'Sacola Plástica 30x40 (c/100)', codigoBarras: '7891234300002', categoria: C.embalagens, fornecedor: F.distribuidora, precoCusto: 6.80, precoVenda: 11.90, precoAtacado: 10.00, quantidadeAtacado: 5, estoque: 60, estoqueMinimo: 10, estoqueMaximo: 150, unidade: 'pct', descricao: 'Sacola plástica 30x40cm pacote com 100 unidades' },
  { nome: 'Vassoura Pelo Sintético', codigoBarras: '7891234300003', categoria: C.utilidades, fornecedor: F.distribuidora, precoCusto: 8.50, precoVenda: 16.90, precoAtacado: 14.00, quantidadeAtacado: 5, estoque: 20, estoqueMinimo: 5, estoqueMaximo: 50, unidade: 'un', descricao: 'Vassoura de pelo sintético cabo longo' },
  { nome: 'Rodo 40cm Dupla Borracha', codigoBarras: '7891234300004', categoria: C.utilidades, fornecedor: F.distribuidora, precoCusto: 7.20, precoVenda: 14.90, precoAtacado: 12.00, quantidadeAtacado: 5, estoque: 18, estoqueMinimo: 4, estoqueMaximo: 40, unidade: 'un', descricao: 'Rodo 40cm dupla borracha com cabo' },
  { nome: 'Detergente Líquido 500ml', codigoBarras: '7891234300005', categoria: C.utilidades, fornecedor: F.distribuidora, precoCusto: 2.80, precoVenda: 5.50, precoAtacado: 4.50, quantidadeAtacado: 12, estoque: 60, estoqueMinimo: 10, estoqueMaximo: 120, unidade: 'un', validade: validade(24), descricao: 'Detergente líquido neutro 500ml' },

  // --- Papelaria Atacado BR ---
  { nome: 'Caderno 96 Folhas', codigoBarras: '7891234400001', categoria: C.papelaria, fornecedor: F.papelaria, precoCusto: 6.50, precoVenda: 12.90, precoAtacado: 10.50, quantidadeAtacado: 5, estoque: 40, estoqueMinimo: 8, estoqueMaximo: 100, unidade: 'un', descricao: 'Caderno universitário 96 folhas espiral' },
  { nome: 'Caneta Esferográfica Azul', codigoBarras: '7891234400002', categoria: C.papelaria, fornecedor: F.papelaria, precoCusto: 0.80, precoVenda: 2.50, precoAtacado: 1.90, quantidadeAtacado: 12, estoque: 120, estoqueMinimo: 20, estoqueMaximo: 300, unidade: 'un', descricao: 'Caneta esferográfica ponta média azul' },
  { nome: 'Lápis Preto Nº 2', codigoBarras: '7891234400003', categoria: C.papelaria, fornecedor: F.papelaria, precoCusto: 0.60, precoVenda: 1.90, precoAtacado: 1.40, quantidadeAtacado: 12, estoque: 100, estoqueMinimo: 20, estoqueMaximo: 250, unidade: 'un', descricao: 'Lápis preto HB nº 2 sextavado' },
  { nome: 'Borracha Branca', codigoBarras: '7891234400004', categoria: C.papelaria, fornecedor: F.papelaria, precoCusto: 0.50, precoVenda: 1.50, precoAtacado: 1.10, quantidadeAtacado: 12, estoque: 80, estoqueMinimo: 15, estoqueMaximo: 200, unidade: 'un', descricao: 'Borracha branca macia para lápis' },
  { nome: 'Resma Papel A4 500 fls', codigoBarras: '7891234400005', categoria: C.escritorio, fornecedor: F.papelaria, precoCusto: 22.00, precoVenda: 38.90, precoAtacado: 34.00, quantidadeAtacado: 3, estoque: 25, estoqueMinimo: 5, estoqueMaximo: 60, unidade: 'un', descricao: 'Resma papel sulfite A4 75g 500 folhas' },
  { nome: 'Grampeador de Mesa', codigoBarras: '7891234400006', categoria: C.escritorio, fornecedor: F.papelaria, precoCusto: 12.00, precoVenda: 24.90, precoAtacado: 20.00, quantidadeAtacado: 3, estoque: 12, estoqueMinimo: 3, estoqueMaximo: 30, unidade: 'un', descricao: 'Grampeador de mesa capacidade 25 folhas' },
  { nome: 'Post-it 76x76mm (c/100)', codigoBarras: '7891234400007', categoria: C.escritorio, fornecedor: F.papelaria, precoCusto: 5.50, precoVenda: 10.90, precoAtacado: 8.90, quantidadeAtacado: 5, estoque: 35, estoqueMinimo: 5, estoqueMaximo: 80, unidade: 'un', descricao: 'Bloco de notas adesivo 76x76mm 100 folhas' },

  // --- Têxtil Soares Ltda ---
  { nome: 'Camiseta Básica P', codigoBarras: '7891234500001', categoria: C.roupa, fornecedor: F.textil, precoCusto: 14.00, precoVenda: 29.90, precoAtacado: 24.00, quantidadeAtacado: 5, estoque: 30, estoqueMinimo: 5, estoqueMaximo: 80, unidade: 'un', descricao: 'Camiseta básica 100% algodão tamanho P' },
  { nome: 'Camiseta Básica M', codigoBarras: '7891234500002', categoria: C.roupa, fornecedor: F.textil, precoCusto: 14.00, precoVenda: 29.90, precoAtacado: 24.00, quantidadeAtacado: 5, estoque: 35, estoqueMinimo: 5, estoqueMaximo: 80, unidade: 'un', descricao: 'Camiseta básica 100% algodão tamanho M' },
  { nome: 'Camiseta Básica G', codigoBarras: '7891234500003', categoria: C.roupa, fornecedor: F.textil, precoCusto: 14.00, precoVenda: 29.90, precoAtacado: 24.00, quantidadeAtacado: 5, estoque: 28, estoqueMinimo: 5, estoqueMaximo: 80, unidade: 'un', descricao: 'Camiseta básica 100% algodão tamanho G' },
  { nome: 'Uniforme Escolar Calça', codigoBarras: '7891234500004', categoria: C.uniforme, fornecedor: F.textil, precoCusto: 28.00, precoVenda: 55.90, precoAtacado: 48.00, quantidadeAtacado: 3, estoque: 20, estoqueMinimo: 4, estoqueMaximo: 50, unidade: 'un', descricao: 'Calça uniforme escolar azul marinho' },
  { nome: 'Uniforme Escolar Blusa', codigoBarras: '7891234500005', categoria: C.uniforme, fornecedor: F.textil, precoCusto: 22.00, precoVenda: 44.90, precoAtacado: 38.00, quantidadeAtacado: 3, estoque: 22, estoqueMinimo: 4, estoqueMaximo: 50, unidade: 'un', descricao: 'Blusa uniforme escolar branca manga curta' },
  { nome: 'Linha de Costura 100m', codigoBarras: '7891234500006', categoria: C.armarinho, fornecedor: F.textil, precoCusto: 1.80, precoVenda: 3.90, precoAtacado: 3.00, quantidadeAtacado: 10, estoque: 60, estoqueMinimo: 10, estoqueMaximo: 150, unidade: 'un', descricao: 'Linha de costura poliéster 100m sortida' },
  { nome: 'Elástico 2cm (rolo 10m)', codigoBarras: '7891234500007', categoria: C.armarinho, fornecedor: F.textil, precoCusto: 6.00, precoVenda: 12.90, precoAtacado: 10.00, quantidadeAtacado: 5, estoque: 40, estoqueMinimo: 8, estoqueMaximo: 100, unidade: 'un', descricao: 'Elástico chato 2cm rolo com 10 metros' },
]

async function seed() {
  await mongoose.connect(process.env.MONGO_URI)
  const resultado = await Produto.insertMany(produtos)
  console.log(`✅ ${resultado.length} produto(s) inserido(s)`)
  await mongoose.disconnect()
}

seed().catch(e => { console.error(e); process.exit(1) })
