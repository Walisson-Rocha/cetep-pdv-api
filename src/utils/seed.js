require('dotenv').config()
const mongoose = require('mongoose')
const bcrypt = require('bcryptjs')

const User = require('../models/User')
const Produto = require('../models/Produto')
const Categoria = require('../models/Categoria')
const Cliente = require('../models/Cliente')
const Fornecedor = require('../models/Fornecedor')
const Configuracao = require('../models/Configuracao')
const Caixa = require('../models/Caixa')
const Venda = require('../models/Venda')
const MovimentoEstoque = require('../models/MovimentoEstoque')
const Despesa = require('../models/Despesa')
const Retirada = require('../models/Retirada')
const Log = require('../models/Log')

const oid = () => new mongoose.Types.ObjectId()
const pick = arr => arr[Math.floor(Math.random() * arr.length)]
const dt = (day, h = 9, m = 0) => new Date(2026, 5, day, h, m, 0) // junho 2026

const seed = async () => {
  await mongoose.connect(process.env.MONGO_URI)
  console.log('🔌 MongoDB conectado')

  const cols = [User, Produto, Categoria, Cliente, Fornecedor, Configuracao, Caixa, Venda, MovimentoEstoque, Despesa, Retirada, Log]
  await Promise.all(cols.map(M => M.collection.drop().catch(() => {})))
  await mongoose.connection.collection('counters').drop().catch(() => {})
  console.log('🧹 Banco limpo')

  // ── USUÁRIOS ──────────────────────────────────────────────────────────────
  const hash = await bcrypt.hash('123456', 12)
  const [uAdmin, uGerente, uCaixa, uEstoque, uColab] = [oid(), oid(), oid(), oid(), oid()]

  await User.collection.insertMany([
    { _id: uAdmin,   nome: 'Evandro Soares',  email: 'admin@soares.com',    senha: hash, perfil: 'admin',       ativo: true, ultimoAcesso: dt(13,8),  createdAt: dt(1,8), updatedAt: dt(13,8) },
    { _id: uGerente, nome: 'Carlos Souza',    email: 'carlos@soares.com',   senha: hash, perfil: 'gerente',     ativo: true, ultimoAcesso: dt(13,8),  createdAt: dt(1,8), updatedAt: dt(13,8) },
    { _id: uCaixa,   nome: 'Ana Paula',       email: 'ana@soares.com',      senha: hash, perfil: 'caixa',       ativo: true, ultimoAcesso: dt(13,8),  createdAt: dt(1,8), updatedAt: dt(13,8) },
    { _id: uEstoque, nome: 'Marcos Silva',    email: 'marcos@soares.com',   senha: hash, perfil: 'estoquista',  ativo: true, ultimoAcesso: dt(12,17), createdAt: dt(1,8), updatedAt: dt(12,17) },
    { _id: uColab,   nome: 'Fernanda Costa',  email: 'fernanda@soares.com', senha: hash, perfil: 'colaborador', ativo: true, ultimoAcesso: dt(13,9),  createdAt: dt(1,8), updatedAt: dt(13,9) },
  ])
  console.log('👥 5 usuários criados')

  // ── CATEGORIAS ────────────────────────────────────────────────────────────
  const [catPap, catEsc, catSau, catLan, catBom, catBri, catLar, catArm,
         catVar, catFer, catEmb, catInf, catUni, catMul, catRou, catAli, catBeb] =
    Array.from({ length: 17 }, () => oid())

  await Categoria.collection.insertMany([
    { _id: catPap, nome: 'Papelaria',                 cor: '#7C3AED', icone: '📒', ativo: true, createdAt: dt(1), updatedAt: dt(1) },
    { _id: catEsc, nome: 'Escritório',                cor: '#6B7280', icone: '🗂️', ativo: true, createdAt: dt(1), updatedAt: dt(1) },
    { _id: catSau, nome: 'Saúde',                     cor: '#EF4444', icone: '❤️', ativo: true, createdAt: dt(1), updatedAt: dt(1) },
    { _id: catLan, nome: 'Lanchonete',                cor: '#F59E0B', icone: '🍔', ativo: true, createdAt: dt(1), updatedAt: dt(1) },
    { _id: catBom, nome: 'Bomboniere',                cor: '#EC4899', icone: '🍬', ativo: true, createdAt: dt(1), updatedAt: dt(1) },
    { _id: catBri, nome: 'Brinquedos',                cor: '#8B5CF6', icone: '🧸', ativo: true, createdAt: dt(1), updatedAt: dt(1) },
    { _id: catLar, nome: 'Utilidades do Lar',         cor: '#059669', icone: '🏠', ativo: true, createdAt: dt(1), updatedAt: dt(1) },
    { _id: catArm, nome: 'Armarinho',                 cor: '#D97706', icone: '🧵', ativo: true, createdAt: dt(1), updatedAt: dt(1) },
    { _id: catVar, nome: 'Variedades',                cor: '#3B82F6', icone: '🛍️', ativo: true, createdAt: dt(1), updatedAt: dt(1) },
    { _id: catFer, nome: 'Ferramentas',               cor: '#374151', icone: '🔧', ativo: true, createdAt: dt(1), updatedAt: dt(1) },
    { _id: catEmb, nome: 'Embalagens',                cor: '#92400E', icone: '📦', ativo: true, createdAt: dt(1), updatedAt: dt(1) },
    { _id: catInf, nome: 'Informática e Eletrônicos', cor: '#1D4ED8', icone: '💻', ativo: true, createdAt: dt(1), updatedAt: dt(1) },
    { _id: catUni, nome: 'Uniforme',                  cor: '#1F2937', icone: '👔', ativo: true, createdAt: dt(1), updatedAt: dt(1) },
    { _id: catMul, nome: 'Espaço Mulher',             cor: '#DB2777', icone: '👗', ativo: true, createdAt: dt(1), updatedAt: dt(1) },
    { _id: catRou, nome: 'Roupa',                     cor: '#7C3AED', icone: '👕', ativo: true, createdAt: dt(1), updatedAt: dt(1) },
    { _id: catAli, nome: 'Alimentos',                 cor: '#16A97B', icone: '🌾', ativo: true, createdAt: dt(1), updatedAt: dt(1) },
    { _id: catBeb, nome: 'Bebidas',                   cor: '#2563EB', icone: '💧', ativo: true, createdAt: dt(1), updatedAt: dt(1) },
  ])
  console.log('📂 17 categorias criadas')

  // ── FORNECEDORES ──────────────────────────────────────────────────────────
  await Fornecedor.collection.insertMany([
    {
      _id: oid(), nome: 'Distribuidora Central', cnpj: '12.345.678/0001-90',
      telefone: '(61) 3333-1111', whatsapp: '(61) 98111-1111',
      email: 'vendas@distcentral.com', contato: 'Roberto Lima',
      cep: '70070-010', logradouro: 'SCS Quadra 2', numero: '12', complemento: 'Bloco C, Sala 301',
      bairro: 'Asa Sul', cidade: 'Brasília', estado: 'DF',
      observacao: 'Principal fornecedor de mercearia e secos. Pedido mínimo R$ 500. Entrega às terças e quintas.',
      ativo: true, createdAt: dt(1), updatedAt: dt(1),
    },
    {
      _id: oid(), nome: 'Papelaria Atacado BR', cnpj: '98.765.432/0001-00',
      telefone: '(61) 3333-2222', whatsapp: '(61) 98222-2222',
      email: 'contato@papelatacado.com', contato: 'Sandra Moura',
      cep: '72015-900', logradouro: 'QNN 38', numero: '5', complemento: 'Loja 2',
      bairro: 'Ceilândia Norte', cidade: 'Brasília', estado: 'DF',
      observacao: 'Fornece embalagens, sacolas e material de escritório. Prazo de entrega 2 dias úteis.',
      ativo: true, createdAt: dt(1), updatedAt: dt(1),
    },
    {
      _id: oid(), nome: 'Têxtil Soares Ltda', cnpj: '11.222.333/0001-44',
      telefone: '(61) 3333-3333', whatsapp: '(61) 98333-3333',
      email: 'comercial@textilsoares.com', contato: 'Paulo Soares',
      cep: '72220-260', logradouro: 'QNM 12', numero: '8', complemento: '',
      bairro: 'Ceilândia Sul', cidade: 'Brasília', estado: 'DF',
      observacao: 'Uniforme e tecidos para uso interno. Negociação direta com Paulo. Pagamento 30 dias.',
      ativo: true, createdAt: dt(1), updatedAt: dt(1),
    },
    {
      _id: oid(), nome: 'Alimentos & Cia', cnpj: '55.666.777/0001-88',
      telefone: '(61) 3444-5555', whatsapp: '(61) 98444-5555',
      email: 'pedidos@alimentoecia.com', contato: 'Claudia Torres',
      cep: '71503-507', logradouro: 'Av. Hélio Prates', numero: '1420', complemento: 'Galpão 3',
      bairro: 'Taguatinga Norte', cidade: 'Brasília', estado: 'DF',
      observacao: 'Fornecedor de frios, laticínios e alimentos perecíveis. Entrega diária até 8h. Exige pedido até 18h do dia anterior.',
      ativo: true, createdAt: dt(2), updatedAt: dt(2),
    },
    {
      _id: oid(), nome: 'TechSupply Brasil', cnpj: '77.888.999/0001-22',
      telefone: '(61) 3555-6666', whatsapp: '(61) 98555-6666',
      email: 'vendas@techsupply.com', contato: 'Rafael Nunes',
      cep: '70714-900', logradouro: 'SAAN Quadra 1', numero: '200', complemento: 'Bloco A',
      bairro: 'Setor de Armazenagem e Abastecimento Norte', cidade: 'Brasília', estado: 'DF',
      observacao: 'Equipamentos de informática, impressoras e suprimentos. Garantia de 12 meses. Suporte pelo WhatsApp.',
      ativo: true, createdAt: dt(2), updatedAt: dt(2),
    },
  ])
  console.log('🚚 5 fornecedores criados')

  // ── CONFIGURAÇÃO ──────────────────────────────────────────────────────────
  await Configuracao.collection.insertOne({
    _id: oid(), nomeLoja: 'Soares PDV', cnpj: '12.345.678/0001-90',
    endereco: 'Rua das Palmeiras, 456 — Ceilândia, DF', telefone: '(61) 3333-0000',
    whatsapp: '(61) 99999-0000', chavePix: 'evandro@soares.com', metaMensal: 25000,
    notificacoes: { estoqueBaixo: true, vencimento: true, fiadoVencido: true },
    createdAt: dt(1), updatedAt: dt(1),
  })
  console.log('⚙️  Configuração criada')

  // ── CLIENTES ──────────────────────────────────────────────────────────────
  const [cl1,cl2,cl3,cl4,cl5,cl6,cl7,cl8,cl9,cl10,cl11,cl12,cl13,cl14,cl15] =
    Array.from({ length: 15 }, () => oid())

  await Cliente.collection.insertMany([
    { _id: cl1,  nome: 'João Carlos Silva',      tipo:'PF', cpf:'123.456.789-00', telefone:'(61) 99999-1234', email:'joao@email.com',           limiteCredito:300,   saldoFiado:147.50, ativo:true, createdAt:dt(1), updatedAt:dt(10) },
    { _id: cl2,  nome: 'Maria Oliveira Santos',  tipo:'PF', cpf:'987.654.321-00', telefone:'(61) 98888-5678', email:'maria@email.com',          limiteCredito:200,   saldoFiado:0,      ativo:true, createdAt:dt(1), updatedAt:dt(1)  },
    { _id: cl3,  nome: 'Papelaria do João Ltda', tipo:'PJ', cnpj:'12.345.678/0001-90', telefone:'(61) 3333-9999', email:'compras@papeljoao.com', limiteCredito:2000,  saldoFiado:0,      ativo:true, createdAt:dt(1), updatedAt:dt(1)  },
    { _id: cl4,  nome: 'Pedro Rocha Ferreira',   tipo:'PF', cpf:'456.789.012-33', telefone:'(61) 95555-7890',                                   limiteCredito:150,   saldoFiado:89.90,  ativo:true, createdAt:dt(2), updatedAt:dt(9)  },
    { _id: cl5,  nome: 'Ana Lúcia Mendes',       tipo:'PF', cpf:'321.654.987-11', telefone:'(61) 97777-2345', email:'analucia@email.com',       limiteCredito:200,   saldoFiado:0,      ativo:true, createdAt:dt(2), updatedAt:dt(2)  },
    { _id: cl6,  nome: 'Escola Municipal Estrela',tipo:'PJ', cnpj:'55.444.333/0001-22', telefone:'(61) 3222-4444', email:'compras@escolaestrela.edu.br', limiteCredito:5000, saldoFiado:0, ativo:true, createdAt:dt(2), updatedAt:dt(2) },
    { _id: cl7,  nome: 'Ricardo Alves Costa',    tipo:'PF', cpf:'789.012.345-66', telefone:'(61) 94444-3456',                                   limiteCredito:100,   saldoFiado:0,      ativo:true, createdAt:dt(3), updatedAt:dt(3)  },
    { _id: cl8,  nome: 'Juliana Borges Lima',    tipo:'PF', cpf:'654.321.098-77', telefone:'(61) 93333-4567', email:'juliana@email.com',        limiteCredito:200,   saldoFiado:58.00,  ativo:true, createdAt:dt(3), updatedAt:dt(11) },
    { _id: cl9,  nome: 'Supermercado Boa Compra',tipo:'PJ', cnpj:'88.777.666/0001-55', telefone:'(61) 3555-8888', email:'estoque@boacompra.com.br', limiteCredito:10000, saldoFiado:0,   ativo:true, createdAt:dt(3), updatedAt:dt(3)  },
    { _id: cl10, nome: 'Fernanda Alves Ramos',   tipo:'PF', cpf:'111.222.333-44', telefone:'(61) 92222-5678',                                   limiteCredito:150,   saldoFiado:0,      ativo:true, createdAt:dt(4), updatedAt:dt(4)  },
    { _id: cl11, nome: 'Marcos Pereira Neto',    tipo:'PF', cpf:'444.555.666-77', telefone:'(61) 91111-6789', email:'marcosnet@email.com',      limiteCredito:200,   saldoFiado:45.00,  ativo:true, createdAt:dt(4), updatedAt:dt(12) },
    { _id: cl12, nome: 'Creche Raio de Sol',     tipo:'PJ', cnpj:'33.222.111/0001-44', telefone:'(61) 3111-2222', email:'admin@creche.com',     limiteCredito:3000,  saldoFiado:0,      ativo:true, createdAt:dt(4), updatedAt:dt(4)  },
    { _id: cl13, nome: 'Sônia Carvalho',         tipo:'PF', cpf:'222.333.444-55', telefone:'(61) 96666-7890',                                   limiteCredito:100,   saldoFiado:0,      ativo:true, createdAt:dt(5), updatedAt:dt(5)  },
    { _id: cl14, nome: 'Lucas Vieira Teixeira',  tipo:'PF', cpf:'333.444.555-66', telefone:'(61) 95555-8901',                                   limiteCredito:200,   saldoFiado:0,      ativo:true, createdAt:dt(5), updatedAt:dt(5)  },
    { _id: cl15, nome: 'Cláudia Nascimento',     tipo:'PF', cpf:'777.888.999-00', telefone:'(61) 94444-9012', email:'claudia@email.com',        limiteCredito:150,   saldoFiado:30.00,  ativo:true, createdAt:dt(6), updatedAt:dt(13) },
  ])
  console.log('👥 15 clientes criados')

  // ── PRODUTOS (41, todas as 17 categorias) ─────────────────────────────────
  const [p1,p2,p3,p4,p5,p6,p7,p8,p9,p10,p11,p12,p13,p14,p15,p16,p17,p18,p19,p20,
         p21,p22,p23,p24,p25,p26,p27,p28,p29,p30,p31,p32,p33,p34,p35,p36,p37,p38,p39,p40,p41] =
    Array.from({ length: 41 }, () => oid())

  const base = { estoqueMaximo: 100, validade: null, descricao: '', ativo: true, createdAt: dt(1), updatedAt: new Date() }
  await Produto.collection.insertMany([
    // Papelaria
    { _id:p1,  nome:'Caderno 200 folhas',       codigoBarras:'7891234000001', categoria:catPap, precoVenda:18.90, precoAtacado:15.00, quantidadeAtacado:10, precoCusto:10.00, estoque:35, estoqueMinimo:10, unidade:'un',  ...base },
    { _id:p2,  nome:'Caneta azul (cx 50un)',     codigoBarras:'7891234000002', categoria:catPap, precoVenda:12.50, precoAtacado:10.00, quantidadeAtacado:5,  precoCusto:6.00,  estoque:62, estoqueMinimo:15, unidade:'cx',  ...base },
    { _id:p3,  nome:'Borracha branca',           codigoBarras:'7891234000003', categoria:catPap, precoVenda:2.50,  precoCusto:1.00,                                             estoque:4,  estoqueMinimo:10, unidade:'un',  ...base },
    { _id:p4,  nome:'Lápis preto (cx 12un)',     codigoBarras:'7891234000004', categoria:catPap, precoVenda:7.90,  precoAtacado:6.50,  quantidadeAtacado:5,  precoCusto:4.00,  estoque:28, estoqueMinimo:12, unidade:'cx',  ...base },
    // Escritório
    { _id:p5,  nome:'Pasta A4 AZ',              codigoBarras:'7891234000010', categoria:catEsc, precoVenda:24.90, precoCusto:14.00,                                             estoque:18, estoqueMinimo:8,  unidade:'un',  ...base },
    { _id:p6,  nome:'Post-it 76x76mm',          codigoBarras:'7891234000011', categoria:catEsc, precoVenda:8.90,  precoCusto:4.50,                                              estoque:30, estoqueMinimo:10, unidade:'un',  ...base },
    { _id:p7,  nome:'Grampeador 26/6',          codigoBarras:'7891234000012', categoria:catEsc, precoVenda:19.90, precoCusto:10.00,                                             estoque:12, estoqueMinimo:5,  unidade:'un',  ...base },
    // Saúde
    { _id:p8,  nome:'Paracetamol 750mg (cx12)', codigoBarras:'7892500000001', categoria:catSau, precoVenda:6.90,  precoCusto:3.50,                                              estoque:38, estoqueMinimo:15, unidade:'cx',  ...base },
    { _id:p9,  nome:'Álcool em gel 500ml',      codigoBarras:'7892500000002', categoria:catSau, precoVenda:9.90,  precoCusto:5.00,                                              estoque:22, estoqueMinimo:10, unidade:'un',  ...base },
    { _id:p10, nome:'Máscara cirúrgica (cx50)', codigoBarras:'7892500000003', categoria:catSau, precoVenda:15.90, precoCusto:8.00,                                              estoque:0,  estoqueMinimo:10, unidade:'cx',  ...base },
    // Lanchonete
    { _id:p11, nome:'Lanche Naturale',          codigoBarras:'7892500000010', categoria:catLan, precoVenda:5.00,  precoCusto:2.50,                                              estoque:18, estoqueMinimo:10, unidade:'un',  ...base },
    { _id:p12, nome:'Suco Integrale 200ml',     codigoBarras:'7892500000011', categoria:catLan, precoVenda:4.50,  precoAtacado:3.80, quantidadeAtacado:6,   precoCusto:2.20,  estoque:32, estoqueMinimo:12, unidade:'un',  ...base },
    { _id:p13, nome:'Biscoito Cream Cracker',   codigoBarras:'7892500000012', categoria:catLan, precoVenda:3.90,  precoCusto:2.00,                                              estoque:25, estoqueMinimo:10, unidade:'un',  ...base },
    // Bomboniere
    { _id:p14, nome:'Bala Chiclete 100g',       codigoBarras:'7892500000020', categoria:catBom, precoVenda:3.50,  precoCusto:1.80,                                              estoque:55, estoqueMinimo:20, unidade:'un',  ...base },
    { _id:p15, nome:'Chocolate ao Leite 90g',   codigoBarras:'7892500000021', categoria:catBom, precoVenda:5.90,  precoCusto:3.00,                                              estoque:40, estoqueMinimo:15, unidade:'un',  ...base },
    { _id:p16, nome:'Pirulito 10g',             codigoBarras:'7892500000022', categoria:catBom, precoVenda:0.99,  precoCusto:0.40,                                              estoque:120,estoqueMinimo:50, unidade:'un',  ...base },
    // Brinquedos
    { _id:p17, nome:'Carrinho de Fricção',      codigoBarras:'7891111000001', categoria:catBri, precoVenda:12.90, precoCusto:6.00,                                              estoque:15, estoqueMinimo:5,  unidade:'un',  ...base },
    { _id:p18, nome:'Boneca Baby Doll',         codigoBarras:'7891111000002', categoria:catBri, precoVenda:29.90, precoCusto:15.00,                                             estoque:8,  estoqueMinimo:5,  unidade:'un',  ...base },
    // Utilidades do Lar
    { _id:p19, nome:'Esponja de Cozinha (3un)', codigoBarras:'7891222000001', categoria:catLar, precoVenda:4.90,  precoAtacado:4.00, quantidadeAtacado:6,   precoCusto:2.00,  estoque:48, estoqueMinimo:15, unidade:'pct', ...base },
    { _id:p20, nome:'Detergente 500ml',         codigoBarras:'7891222000002', categoria:catLar, precoVenda:3.50,  precoAtacado:2.80, quantidadeAtacado:12,  precoCusto:1.50,  estoque:72, estoqueMinimo:20, unidade:'un',  ...base },
    { _id:p21, nome:'Vassoura de Cerdas',       codigoBarras:'7891222000003', categoria:catLar, precoVenda:14.90, precoCusto:7.00,                                              estoque:10, estoqueMinimo:5,  unidade:'un',  ...base },
    // Armarinho
    { _id:p22, nome:'Linha de costura 10 cores',codigoBarras:'7891333000001', categoria:catArm, precoVenda:8.90,  precoCusto:4.00,                                              estoque:20, estoqueMinimo:8,  unidade:'pct', ...base },
    { _id:p23, nome:'Elástico largo 5m',        codigoBarras:'7891333000002', categoria:catArm, precoVenda:3.90,  precoCusto:1.50,                                              estoque:35, estoqueMinimo:10, unidade:'un',  ...base },
    // Variedades
    { _id:p24, nome:'Isqueiro comum',           codigoBarras:'7891444000001', categoria:catVar, precoVenda:2.50,  precoAtacado:2.00, quantidadeAtacado:10,  precoCusto:1.00,  estoque:60, estoqueMinimo:20, unidade:'un',  ...base },
    { _id:p25, nome:'Saco de lixo 50L (10un)',  codigoBarras:'7891444000002', categoria:catVar, precoVenda:5.90,  precoCusto:3.00,                                              estoque:42, estoqueMinimo:15, unidade:'pct', ...base },
    // Ferramentas
    { _id:p26, nome:'Chave de fenda Phillips',  codigoBarras:'7891555000001', categoria:catFer, precoVenda:8.90,  precoCusto:4.00,                                              estoque:14, estoqueMinimo:5,  unidade:'un',  ...base },
    { _id:p27, nome:'Fita isolante 19mm',       codigoBarras:'7891555000002', categoria:catFer, precoVenda:5.90,  precoAtacado:4.50, quantidadeAtacado:5,   precoCusto:2.50,  estoque:28, estoqueMinimo:10, unidade:'un',  ...base },
    // Embalagens
    { _id:p28, nome:'Saco plástico 30x40 100un',codigoBarras:'7891666000001', categoria:catEmb, precoVenda:9.90,  precoAtacado:8.00, quantidadeAtacado:5,   precoCusto:5.00,  estoque:33, estoqueMinimo:10, unidade:'pct', ...base },
    { _id:p29, nome:'Caixa papelão (10un)',     codigoBarras:'7891666000002', categoria:catEmb, precoVenda:18.90, precoCusto:10.00,                                             estoque:2,  estoqueMinimo:5,  unidade:'pct', ...base },
    // Informática
    { _id:p30, nome:'Cabo USB-C 1m',            codigoBarras:'7891777000001', categoria:catInf, precoVenda:19.90, precoCusto:9.00,                                              estoque:22, estoqueMinimo:8,  unidade:'un',  ...base },
    { _id:p31, nome:'Mouse USB sem fio',         codigoBarras:'7891777000002', categoria:catInf, precoVenda:49.90, precoCusto:25.00,                                             estoque:9,  estoqueMinimo:5,  unidade:'un',  ...base },
    // Uniforme
    { _id:p32, nome:'Camiseta polo tamanho P',   codigoBarras:'7891888000001', categoria:catUni, precoVenda:39.90, precoCusto:20.00,                                             estoque:12, estoqueMinimo:5,  unidade:'un',  ...base },
    { _id:p33, nome:'Camiseta polo tamanho M',   codigoBarras:'7891888000002', categoria:catUni, precoVenda:39.90, precoCusto:20.00,                                             estoque:8,  estoqueMinimo:5,  unidade:'un',  ...base },
    // Espaço Mulher
    { _id:p34, nome:'Absorvente noturno (8un)', codigoBarras:'7891999000001', categoria:catMul, precoVenda:7.90,  precoCusto:4.00,                                              estoque:45, estoqueMinimo:15, unidade:'pct', ...base },
    { _id:p35, nome:'Hidratante corporal 200ml',codigoBarras:'7891999000002', categoria:catMul, precoVenda:12.90, precoCusto:6.00,                                              estoque:18, estoqueMinimo:8,  unidade:'un',  ...base },
    // Roupa
    { _id:p36, nome:'Meia masculina (3 pares)', codigoBarras:'7892000000001', categoria:catRou, precoVenda:12.90, precoAtacado:10.00, quantidadeAtacado:3,  precoCusto:6.00,  estoque:24, estoqueMinimo:10, unidade:'pct', ...base },
    { _id:p37, nome:'Cueca boxer M',            codigoBarras:'7892000000002', categoria:catRou, precoVenda:14.90, precoCusto:7.00,                                              estoque:16, estoqueMinimo:8,  unidade:'un',  ...base },
    // Alimentos
    { _id:p38, nome:'Arroz 5kg',               codigoBarras:'7890123000001', categoria:catAli, precoVenda:28.90, precoAtacado:25.00, quantidadeAtacado:5,  precoCusto:18.00, estoque:22, estoqueMinimo:10, unidade:'kg',  ...base },
    { _id:p39, nome:'Feijão carioca 1kg',      codigoBarras:'7890123000002', categoria:catAli, precoVenda:8.90,  precoAtacado:7.50,  quantidadeAtacado:5,  precoCusto:5.50,  estoque:35, estoqueMinimo:12, unidade:'kg',  ...base },
    // Bebidas
    { _id:p40, nome:'Água mineral 500ml',       codigoBarras:'7897654000001', categoria:catBeb, precoVenda:3.00,  precoAtacado:2.20,  quantidadeAtacado:12, precoCusto:1.20,  estoque:96, estoqueMinimo:24, unidade:'un',  ...base },
    { _id:p41, nome:'Refrigerante 2L',          codigoBarras:'7897654000002', categoria:catBeb, precoVenda:8.50,  precoCusto:4.50,                                              estoque:34, estoqueMinimo:12, unidade:'un',  ...base },
  ])
  console.log('🛍️  41 produtos criados')

  // ── CAIXAS ────────────────────────────────────────────────────────────────
  const cxIds = Array.from({ length: 12 }, () => oid())
  const cxAberto = oid()

  // ── VENDAS ────────────────────────────────────────────────────────────────
  const itensPool = [
    { produto:p1,  nome:'Caderno 200 folhas',       preco:18.90 },
    { produto:p2,  nome:'Caneta azul (cx 50un)',     preco:12.50 },
    { produto:p4,  nome:'Lápis preto (cx 12un)',     preco:7.90  },
    { produto:p6,  nome:'Post-it 76x76mm',           preco:8.90  },
    { produto:p8,  nome:'Paracetamol 750mg (cx12)',  preco:6.90  },
    { produto:p11, nome:'Lanche Naturale',           preco:5.00  },
    { produto:p12, nome:'Suco Integrale 200ml',      preco:4.50  },
    { produto:p13, nome:'Biscoito Cream Cracker',    preco:3.90  },
    { produto:p14, nome:'Bala Chiclete 100g',        preco:3.50  },
    { produto:p15, nome:'Chocolate ao Leite 90g',    preco:5.90  },
    { produto:p16, nome:'Pirulito 10g',              preco:0.99  },
    { produto:p19, nome:'Esponja de Cozinha (3un)',  preco:4.90  },
    { produto:p20, nome:'Detergente 500ml',          preco:3.50  },
    { produto:p24, nome:'Isqueiro comum',            preco:2.50  },
    { produto:p25, nome:'Saco de lixo 50L (10un)',   preco:5.90  },
    { produto:p34, nome:'Absorvente noturno (8un)',  preco:7.90  },
    { produto:p36, nome:'Meia masculina (3 pares)',  preco:12.90 },
    { produto:p38, nome:'Arroz 5kg',                 preco:28.90 },
    { produto:p39, nome:'Feijão carioca 1kg',        preco:8.90  },
    { produto:p40, nome:'Água mineral 500ml',        preco:3.00  },
    { produto:p41, nome:'Refrigerante 2L',           preco:8.50  },
  ]

  const formas = ['dinheiro','dinheiro','dinheiro','pix','pix','debito','credito','fiado']
  const clientesFiado = [cl1,cl4,cl8,cl11,cl15]
  const clientesGerais = [cl1,cl2,cl3,cl5,cl7,cl9,null,null,null]

  let seq = 0
  const vendasDocs = []

  const mkVenda = (day, h, caixaId, vendedor, forma, clienteId, colaboradorId) => {
    const nItens = Math.floor(Math.random() * 3) + 1
    const itens = []
    const used = new Set()
    for (let i = 0; i < nItens; i++) {
      let x; do { x = pick(itensPool) } while (used.has(x.produto.toString()))
      used.add(x.produto.toString())
      const qtd = Math.floor(Math.random() * 3) + 1
      const sub = Math.round(x.preco * qtd * 100) / 100
      itens.push({ produto:x.produto, nomeProduto:x.nome, quantidade:qtd, precoUnitario:x.preco, desconto:0, subtotal:sub })
    }
    const subtotal = Math.round(itens.reduce((s,i) => s+i.subtotal, 0)*100)/100
    const total = subtotal
    const troco = forma==='dinheiro' ? Math.round((Math.ceil(total/10)*10 - total)*100)/100 : 0
    const d = new Date(2026,5,day,h,Math.floor(Math.random()*55)+2,0)
    seq++
    return { _id:oid(), numero:seq, itens, subtotal, desconto:0, total, formaPagamento:forma, troco, cliente:clienteId||null, colaborador:colaboradorId||null, caixa:caixaId, vendedor, cancelada:false, createdAt:d, updatedAt:d }
  }

  const totais = {}
  const addTotais = (cxId, v) => {
    const k = cxId.toString()
    if (!totais[k]) totais[k] = { total:0, transacoes:0 }
    totais[k].total += v.total
    totais[k].transacoes++
  }

  // Dias 1-12: caixas fechados, 6-8 vendas/dia
  for (let d = 0; d < 12; d++) {
    const day = d+1
    const cxId = cxIds[d]
    const nv = Math.floor(Math.random()*3)+6
    for (let v = 0; v < nv; v++) {
      const h = Math.floor(Math.random()*7)+9
      const forma = pick(formas)
      const clienteId = forma==='fiado' ? pick(clientesFiado) : pick(clientesGerais)
      const venda = mkVenda(day, h, cxId, d%2===0?uCaixa:uAdmin, forma, clienteId, null)
      vendasDocs.push(venda)
      addTotais(cxId, venda)
    }
  }

  // Dia 13 (hoje): caixa aberto, 4 vendas normais
  for (let v = 0; v < 4; v++) {
    const forma = pick(['dinheiro','dinheiro','pix','debito'])
    const venda = mkVenda(13, 9+v, cxAberto, uCaixa, forma, pick(clientesGerais), null)
    vendasDocs.push(venda)
    addTotais(cxAberto, venda)
  }

  // Venda colaborador hoje
  const vendaColab = {
    _id:oid(), numero:++seq,
    itens:[
      { produto:p13, nomeProduto:'Biscoito Cream Cracker', quantidade:2, precoUnitario:3.90, desconto:0, subtotal:7.80 },
      { produto:p12, nomeProduto:'Suco Integrale 200ml',   quantidade:3, precoUnitario:4.50, desconto:0, subtotal:13.50 },
    ],
    subtotal:21.30, desconto:0, total:21.30, formaPagamento:'colaborador', troco:0,
    cliente:null, colaborador:uColab, caixa:cxAberto, vendedor:uCaixa, cancelada:false,
    createdAt:dt(13,10,30), updatedAt:dt(13,10,30),
  }
  vendasDocs.push(vendaColab)
  addTotais(cxAberto, vendaColab)

  // Venda cancelada (dia 11)
  const vendaCancelada = {
    _id:oid(), numero:++seq,
    itens:[{ produto:p1, nomeProduto:'Caderno 200 folhas', quantidade:2, precoUnitario:18.90, desconto:0, subtotal:37.80 }],
    subtotal:37.80, desconto:0, total:37.80, formaPagamento:'dinheiro', troco:2.20,
    cliente:null, colaborador:null, caixa:cxIds[10], vendedor:uCaixa,
    cancelada:true, motivoCancelamento:'Produto trocado pelo cliente', canceladaPor:uAdmin, canceladaEm:dt(11,15),
    createdAt:dt(11,14,30), updatedAt:dt(11,15),
  }
  vendasDocs.push(vendaCancelada)

  await Venda.collection.insertMany(vendasDocs)
  await mongoose.connection.collection('counters').insertOne({ _id:'vendaNumero', seq })
  console.log(`🛒 ${vendasDocs.length} vendas criadas (${seq} numeradas)`)

  // ── CAIXAS docs ───────────────────────────────────────────────────────────
  const caixasDocs = []
  for (let d = 0; d < 12; d++) {
    const day = d+1
    const cxId = cxIds[d]
    const t = totais[cxId.toString()] || { total:0, transacoes:0 }
    const sI = 100, sang = d%4===3 ? 50 : 0
    const sF = Math.round((sI + t.total - sang)*100)/100
    const sC = Math.round((sF + (d%2===0?3:-5))*100)/100
    const fecharPor = d%3===0 ? uAdmin : uGerente
    caixasDocs.push({
      _id:cxId, abertoEm:dt(day,8), fechadoEm:dt(day,18),
      abertoPor:uCaixa, fechadoPor:fecharPor,
      saldoInicial:sI, saldoFinal:sF, saldoContado:sC, diferenca:Math.round((sC-sF)*100)/100,
      sangrias: sang>0 ? [{ valor:sang, motivo:'Retirada para troco', registradoPor:uAdmin, em:dt(day,14) }] : [],
      status:'fechado', totalVendas:Math.round(t.total*100)/100, totalTransacoes:t.transacoes,
      createdAt:dt(day,8), updatedAt:dt(day,18),
    })
  }
  const tHoje = totais[cxAberto.toString()] || { total:0, transacoes:0 }
  caixasDocs.push({
    _id:cxAberto, abertoEm:dt(13,8), fechadoEm:null,
    abertoPor:uCaixa, fechadoPor:null,
    saldoInicial:150, saldoFinal:null, saldoContado:null, diferenca:null,
    sangrias:[], status:'aberto',
    totalVendas:Math.round(tHoje.total*100)/100, totalTransacoes:tHoje.transacoes,
    createdAt:dt(13,8), updatedAt:new Date(),
  })
  await Caixa.collection.insertMany(caixasDocs)
  console.log(`🗃️  ${caixasDocs.length} caixas criados (12 fechados + 1 aberto)`)

  // ── MOVIMENTOS DE ESTOQUE ─────────────────────────────────────────────────
  const movDocs = []
  for (const v of vendasDocs) {
    if (v.cancelada) continue
    for (const item of v.itens) {
      movDocs.push({
        _id:oid(), produto:item.produto, tipo:'saida', quantidade:item.quantidade,
        estoqueAnterior:50, estoqueAtual:50-item.quantidade,
        motivo:`Venda #${v.numero}`, venda:v._id, responsavel:v.vendedor,
        createdAt:v.createdAt, updatedAt:v.createdAt,
      })
    }
  }
  // Entradas manuais
  const entradas = [
    { prod:p1,  qty:50, motivo:'Compra Papelaria Atacado BR — NF 001',  day:2 },
    { prod:p40, qty:96, motivo:'Compra Distribuidora Central — NF 002', day:3 },
    { prod:p8,  qty:30, motivo:'Compra Distribuidora Central — NF 003', day:5 },
    { prod:p20, qty:60, motivo:'Compra Distribuidora Central — NF 004', day:7 },
    { prod:p38, qty:20, motivo:'Reposição — NF 005',                    day:10 },
    { prod:p14, qty:50, motivo:'Compra Alimentos & Cia — NF 006',       day:11 },
    { prod:p39, qty:30, motivo:'Compra Alimentos & Cia — NF 007',       day:12 },
  ]
  for (const e of entradas) {
    movDocs.push({ _id:oid(), produto:e.prod, tipo:'entrada', quantidade:e.qty, estoqueAnterior:10, estoqueAtual:10+e.qty, motivo:e.motivo, venda:null, responsavel:uEstoque, createdAt:dt(e.day,9), updatedAt:dt(e.day,9) })
  }
  movDocs.push({ _id:oid(), produto:p3,  tipo:'ajuste',    quantidade:-2,  estoqueAnterior:6,  estoqueAtual:4,  motivo:'Inventário — divergência (produto danificado)',       venda:null, responsavel:uEstoque, createdAt:dt(8,11),  updatedAt:dt(8,11)  })
  movDocs.push({ _id:oid(), produto:p10, tipo:'inventario', quantidade:-15, estoqueAnterior:15, estoqueAtual:0,  motivo:'Inventário — lote vencido descartado (val 2026-05)', venda:null, responsavel:uAdmin,   createdAt:dt(6,15),  updatedAt:dt(6,15)  })
  movDocs.push({ _id:oid(), produto:p29, tipo:'entrada',    quantidade:10,  estoqueAnterior:0,  estoqueAtual:10, motivo:'Compra emergencial — NF 008',                        venda:null, responsavel:uEstoque, createdAt:dt(12,14), updatedAt:dt(12,14) })

  await MovimentoEstoque.collection.insertMany(movDocs)
  console.log(`📊 ${movDocs.length} movimentos de estoque criados`)

  // ── DESPESAS ──────────────────────────────────────────────────────────────
  const despDocs = [
    { _id:oid(), descricao:'Aluguel junho',                          valor:3500.00, categoria:'aluguel',    vencimento:new Date(2026,5,5),  paga:true,  pagaEm:dt(5,10),  registradaPor:uAdmin,   createdAt:dt(1,9),  updatedAt:dt(5,10)  },
    { _id:oid(), descricao:'Energia elétrica maio',                  valor:487.30,  categoria:'energia',    vencimento:new Date(2026,5,8),  paga:true,  pagaEm:dt(8,9),   registradaPor:uAdmin,   createdAt:dt(2,9),  updatedAt:dt(8,9)   },
    { _id:oid(), descricao:'Água e esgoto maio',                     valor:134.60,  categoria:'agua',       vencimento:new Date(2026,5,10), paga:true,  pagaEm:dt(10,9),  registradaPor:uGerente, createdAt:dt(2,10), updatedAt:dt(10,9)  },
    { _id:oid(), descricao:'NF Distribuidora Central (papelaria)',   valor:1250.00, categoria:'fornecedor', vencimento:new Date(2026,5,15), paga:false, pagaEm:null,      registradaPor:uAdmin,   createdAt:dt(3,9),  updatedAt:dt(3,9)   },
    { _id:oid(), descricao:'Salário Ana Paula — junho',              valor:1800.00, categoria:'funcionario',vencimento:new Date(2026,5,5),  paga:true,  pagaEm:dt(5,11),  registradaPor:uAdmin,   createdAt:dt(3,10), updatedAt:dt(5,11)  },
    { _id:oid(), descricao:'Salário Marcos Silva — junho',           valor:1600.00, categoria:'funcionario',vencimento:new Date(2026,5,5),  paga:true,  pagaEm:dt(5,11),  registradaPor:uAdmin,   createdAt:dt(3,10), updatedAt:dt(5,11)  },
    { _id:oid(), descricao:'Material de limpeza',                    valor:89.50,   categoria:'limpeza',    vencimento:null,                paga:true,  pagaEm:dt(4,10),  registradaPor:uGerente, createdAt:dt(4,9),  updatedAt:dt(4,10)  },
    { _id:oid(), descricao:'Frete — Papelaria Atacado BR',           valor:120.00,  categoria:'frete',      vencimento:null,                paga:true,  pagaEm:dt(6,9),   registradaPor:uGerente, createdAt:dt(5,14), updatedAt:dt(6,9)   },
    { _id:oid(), descricao:'NF TechSupply Brasil (informática)',     valor:650.00,  categoria:'fornecedor', vencimento:new Date(2026,5,20), paga:false, pagaEm:null,      registradaPor:uAdmin,   createdAt:dt(7,9),  updatedAt:dt(7,9)   },
    { _id:oid(), descricao:'Internet fibra ótica',                   valor:99.90,   categoria:'outros',     vencimento:new Date(2026,5,12), paga:true,  pagaEm:dt(12,9),  registradaPor:uAdmin,   createdAt:dt(8,9),  updatedAt:dt(12,9)  },
    { _id:oid(), descricao:'Manutenção sistema PDV',                 valor:200.00,  categoria:'outros',     vencimento:null,                paga:true,  pagaEm:dt(9,14),  registradaPor:uAdmin,   createdAt:dt(9,9),  updatedAt:dt(9,14)  },
    { _id:oid(), descricao:'NF Alimentos & Cia (reposição)',         valor:890.00,  categoria:'fornecedor', vencimento:new Date(2026,5,25), paga:false, pagaEm:null,      registradaPor:uGerente, createdAt:dt(10,9), updatedAt:dt(10,9)  },
    { _id:oid(), descricao:'Embalagens plásticas (reposição)',       valor:45.00,   categoria:'outros',     vencimento:null,                paga:true,  pagaEm:dt(11,10), registradaPor:uGerente, createdAt:dt(11,9), updatedAt:dt(11,10) },
    { _id:oid(), descricao:'Energia elétrica junho (estimativa)',    valor:510.00,  categoria:'energia',    vencimento:new Date(2026,6,8),  paga:false, pagaEm:null,      registradaPor:uAdmin,   createdAt:dt(12,9), updatedAt:dt(12,9)  },
    { _id:oid(), descricao:'Aluguel julho (adiantado)',              valor:3500.00, categoria:'aluguel',    vencimento:new Date(2026,6,5),  paga:false, pagaEm:null,      registradaPor:uAdmin,   createdAt:dt(13,9), updatedAt:dt(13,9)  },
  ]
  await Despesa.collection.insertMany(despDocs)
  console.log(`💸 ${despDocs.length} despesas criadas`)

  // ── RETIRADAS ─────────────────────────────────────────────────────────────
  const retDocs = [
    // vinculada à venda colaborador de hoje
    { _id:oid(), colaborador:uColab, itens:vendaColab.itens, total:vendaColab.total, mes:202606, observacao:`Venda #${vendaColab.numero} — PDV`, registradaPor:uCaixa, vendaOrigem:vendaColab._id, createdAt:dt(13,10,30), updatedAt:dt(13,10,30) },
    // retiradas manuais maio
    { _id:oid(), colaborador:uColab, itens:[{ produto:p13, nomeProduto:'Biscoito Cream Cracker', quantidade:3, precoUnitario:3.90, subtotal:11.70 }],                                                                                      total:11.70, mes:202605, observacao:'Semana 4',    registradaPor:uAdmin,   vendaOrigem:null, createdAt:new Date(2026,4,25,12), updatedAt:new Date(2026,4,25,12) },
    { _id:oid(), colaborador:uColab, itens:[{ produto:p12, nomeProduto:'Suco Integrale 200ml', quantidade:5, precoUnitario:4.50, subtotal:22.50 }, { produto:p16, nomeProduto:'Pirulito 10g', quantidade:10, precoUnitario:0.99, subtotal:9.90 }], total:32.40, mes:202605, observacao:'',            registradaPor:uAdmin,   vendaOrigem:null, createdAt:new Date(2026,4,28,14), updatedAt:new Date(2026,4,28,14) },
    // retiradas manuais junho
    { _id:oid(), colaborador:uColab, itens:[{ produto:p15, nomeProduto:'Chocolate ao Leite 90g', quantidade:2, precoUnitario:5.90, subtotal:11.80 }],                                                                                      total:11.80, mes:202606, observacao:'Aniversário', registradaPor:uGerente, vendaOrigem:null, createdAt:dt(5,13),  updatedAt:dt(5,13)  },
    { _id:oid(), colaborador:uColab, itens:[{ produto:p40, nomeProduto:'Água mineral 500ml', quantidade:6, precoUnitario:3.00, subtotal:18.00 }, { produto:p11, nomeProduto:'Lanche Naturale', quantidade:2, precoUnitario:5.00, subtotal:10.00 }],  total:28.00, mes:202606, observacao:'',            registradaPor:uGerente, vendaOrigem:null, createdAt:dt(9,12),  updatedAt:dt(9,12)  },
  ]
  await Retirada.collection.insertMany(retDocs)
  console.log(`📋 ${retDocs.length} retiradas criadas`)

  // ── LOGS ──────────────────────────────────────────────────────────────────
  const logDocs = []
  const log = (usuario, nomeUsuario, acao, detalhes, ref, data, ip) =>
    logDocs.push({ _id:oid(), usuario, nomeUsuario, acao, detalhes, referencia:ref||undefined, ip:ip||undefined, createdAt:data, updatedAt:data })

  // Login / logout por dia
  for (let d = 1; d <= 13; d++) {
    log(uAdmin, 'Evandro Soares', 'login',  'Login realizado', null, dt(d,8,0),  '192.168.1.1')
    log(uCaixa, 'Ana Paula',      'login',  'Login realizado', null, dt(d,8,15), '192.168.1.2')
    if (d <= 12) {
      log(uAdmin, 'Evandro Soares', 'logout', 'Logout realizado', null, dt(d,18,30), '192.168.1.1')
      log(uCaixa, 'Ana Paula',      'logout', 'Logout realizado', null, dt(d,18,10), '192.168.1.2')
    }
  }

  // Abertura/fechamento de caixa
  for (let d = 0; d < 12; d++) {
    const day = d+1
    log(uCaixa,                       'Ana Paula',      'caixa_aberto',  'Caixa aberto com saldo inicial de R$100',  cxIds[d], dt(day,8,5),  '192.168.1.2')
    log(d%3===0?uAdmin:uGerente, d%3===0?'Evandro Soares':'Carlos Souza', 'caixa_fechado', `Caixa fechado. Vendas: R$${Math.round(totais[cxIds[d].toString()]?.total||0)}`, cxIds[d], dt(day,18,5), '192.168.1.1')
  }
  log(uCaixa, 'Ana Paula', 'caixa_aberto', 'Caixa aberto com saldo inicial de R$150', cxAberto, dt(13,8,5), '192.168.1.2')

  // Sangria (dia 4)
  log(uAdmin, 'Evandro Soares', 'sangria', 'Sangria R$50 — Retirada para troco', cxIds[3], dt(4,14), '192.168.1.1')

  // Vendas
  for (const v of vendasDocs) {
    if (v.cancelada) {
      log(uAdmin, 'Evandro Soares', 'venda_cancelada', `Venda #${v.numero} cancelada. Motivo: ${v.motivoCancelamento}`, v._id, v.canceladaEm)
    } else {
      const isAna = v.vendedor.toString()===uCaixa.toString()
      log(v.vendedor, isAna?'Ana Paula':'Evandro Soares', 'venda_realizada', `Venda #${v.numero} — R$${v.total.toFixed(2)} (${v.formaPagamento})`, v._id, v.createdAt)
    }
  }

  // Estoque entradas
  for (const e of entradas) {
    log(uEstoque, 'Marcos Silva', 'estoque_entrada', `${e.motivo}: +${e.qty} un`, e.prod, dt(e.day,9))
  }
  log(uEstoque, 'Marcos Silva', 'estoque_ajuste',  'Inventário — divergência: Borracha branca -2un',          p3,  dt(8,11))
  log(uAdmin,   'Evandro Soares','estoque_ajuste',  'Inventário — lote vencido descartado: Máscara cx50 -15un', p10, dt(6,15))

  // Produtos
  log(uEstoque, 'Marcos Silva',   'produto_criado',  'Produto criado: Mouse USB sem fio',                      p31, dt(1,9))
  log(uEstoque, 'Marcos Silva',   'produto_criado',  'Produto criado: Cabo USB-C 1m',                          p30, dt(1,9))
  log(uAdmin,   'Evandro Soares', 'preco_alterado',  'Caderno 200 folhas: R$16.90 → R$18.90',                  p1,  dt(3,10))
  log(uAdmin,   'Evandro Soares', 'preco_alterado',  'Reajuste em massa +5% em 41 produto(s)',                  null,dt(1,9,30))
  log(uEstoque, 'Marcos Silva',   'produto_editado', 'Produto editado: Borracha branca (estoque mínimo ajustado)', p3, dt(8,11))

  // Clientes
  log(uAdmin,   'Evandro Soares', 'cliente_criado',  'Cliente: João Carlos Silva',        cl1, dt(1,9))
  log(uAdmin,   'Evandro Soares', 'cliente_criado',  'Cliente: Papelaria do João Ltda',   cl3, dt(1,9))
  log(uGerente, 'Carlos Souza',   'cliente_criado',  'Cliente: Escola Municipal Estrela', cl6, dt(2,10))
  log(uAdmin,   'Evandro Soares', 'cliente_editado', 'João Carlos Silva — limite ajustado para R$300', cl1, dt(5,11))

  // Despesas
  log(uAdmin,   'Evandro Soares', 'despesa_criada', 'Aluguel junho — R$3500.00',                     despDocs[0]._id, dt(1,9))
  log(uAdmin,   'Evandro Soares', 'despesa_criada', 'Energia elétrica maio — R$487.30',              despDocs[1]._id, dt(2,9))
  log(uGerente, 'Carlos Souza',   'despesa_criada', 'NF Distribuidora Central — R$1250.00',          despDocs[3]._id, dt(3,9))
  log(uAdmin,   'Evandro Soares', 'despesa_criada', 'Salário Ana Paula — R$1800.00',                 despDocs[4]._id, dt(3,10))
  log(uGerente, 'Carlos Souza',   'despesa_criada', 'NF Alimentos & Cia — R$890.00',                despDocs[11]._id, dt(10,9))

  // Usuário criado / retirada
  log(uAdmin, 'Evandro Soares', 'usuario_criado',  'Usuário: Fernanda Costa (colaborador)', uColab,         dt(1,8,30))
  log(uAdmin, 'Evandro Soares', 'usuario_criado',  'Usuário: Ana Paula (caixa)',             uCaixa,         dt(1,8,32))
  log(uCaixa, 'Ana Paula',      'retirada_criada', `Retirada de Fernanda Costa — R$21.30`,  retDocs[0]._id, dt(13,10,30))

  await Log.collection.insertMany(logDocs)
  console.log(`📋 ${logDocs.length} logs criados`)

  // ── RESUMO ────────────────────────────────────────────────────────────────
  console.log('\n✅ Seed concluído!')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('🔑 Credenciais (todos com senha: 123456)')
  console.log('   admin@soares.com    → Admin (Evandro Soares)')
  console.log('   carlos@soares.com   → Gerente')
  console.log('   ana@soares.com      → Caixa')
  console.log('   marcos@soares.com   → Estoquista')
  console.log('   fernanda@soares.com → Colaborador')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('📦 41 produtos | 17 categorias | 15 clientes')
  console.log('🛒 vendas June 1–13 | 12 caixas fechados + 1 aberto')
  console.log('💸 15 despesas (aluguel, energia, fornecedores...)')
  console.log('📋 5 retiradas Fernanda Costa (mai/jun)')

  process.exit(0)
}

seed().catch(err => { console.error('❌', err.message); process.exit(1) })
