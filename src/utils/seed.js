require('dotenv').config()
const mongoose = require('mongoose')
const User = require('../models/User')
const Produto = require('../models/Produto')
const Categoria = require('../models/Categoria')
const Cliente = require('../models/Cliente')
const Fornecedor = require('../models/Fornecedor')

const seed = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI)
    console.log('🔌 MongoDB conectado')

    await Promise.all([
      User.deleteMany({}),
      Produto.deleteMany({}),
      Categoria.deleteMany({}),
      Cliente.deleteMany({}),
      Fornecedor.deleteMany({})
    ])
    console.log('🧹 Banco limpo')

    const usuarios = await User.create([
      { nome: 'Evandro Soares', email: 'admin@soares.com', senha: '123456', perfil: 'admin' },
      { nome: 'Ana Paula', email: 'ana@soares.com', senha: '123456', perfil: 'caixa' },
      { nome: 'Carlos Souza', email: 'carlos@soares.com', senha: '123456', perfil: 'gerente' },
      { nome: 'Marcos Silva', email: 'marcos@soares.com', senha: '123456', perfil: 'estoquista' },
      { nome: 'Fernanda Costa', email: 'fernanda@soares.com', senha: '123456', perfil: 'colaborador' },
    ])
    console.log(`👥 ${usuarios.length} usuários criados`)

    // 15 categorias solicitadas pelo cliente + Alimentos e Bebidas extras
    const categorias = await Categoria.create([
      { nome: 'Papelaria',                 cor: '#7C3AED', icone: '📒' },
      { nome: 'Escritório',                cor: '#6B7280', icone: '🗂️' },
      { nome: 'Saúde',                     cor: '#EF4444', icone: '❤️' },
      { nome: 'Lanchonete',                cor: '#F59E0B', icone: '🍔' },
      { nome: 'Bomboniere',                cor: '#EC4899', icone: '🍬' },
      { nome: 'Brinquedos',                cor: '#8B5CF6', icone: '🧸' },
      { nome: 'Utilidades do Lar',         cor: '#059669', icone: '🏠' },
      { nome: 'Armarinho',                 cor: '#D97706', icone: '🧵' },
      { nome: 'Variedades',                cor: '#3B82F6', icone: '🛍️' },
      { nome: 'Ferramentas',               cor: '#374151', icone: '🔧' },
      { nome: 'Embalagens',                cor: '#92400E', icone: '📦' },
      { nome: 'Informática e Eletrônicos', cor: '#1D4ED8', icone: '💻' },
      { nome: 'Uniforme',                  cor: '#1F2937', icone: '👔' },
      { nome: 'Espaço Mulher',             cor: '#DB2777', icone: '👗' },
      { nome: 'Roupa',                     cor: '#7C3AED', icone: '👕' },
      { nome: 'Alimentos',                 cor: '#16A97B', icone: '🌾' },
      { nome: 'Bebidas',                   cor: '#2563EB', icone: '💧' },
    ])
    console.log(`📦 ${categorias.length} categorias criadas`)

    const [papelaria, escritorio, saude, lanchonete, bomboniere, brinquedos, lar, armarinho, variedades, ferramentas, embalagens, info, uniforme, mulher, roupa, alimentos, bebidas] = categorias

    const fornecedores = await Fornecedor.create([
      { nome: 'Distribuidora Central',  telefone: '(61) 3333-1111', email: 'vendas@distcentral.com' },
      { nome: 'Papelaria Atacado BR',   telefone: '(61) 3333-2222', email: 'contato@papelatacado.com' },
      { nome: 'Têxtil Soares Ltda',     telefone: '(61) 3333-3333', email: 'comercial@textilsoares.com' },
    ])
    console.log(`🚚 ${fornecedores.length} fornecedores criados`)

    const produtos = await Produto.create([
      { nome: 'Caderno 200 folhas', codigoBarras: '7891234000001', categoria: papelaria._id, precoVenda: 18.90, precoAtacado: 15.00, quantidadeAtacado: 10, precoCusto: 10.00, estoque: 42, estoqueMinimo: 10 },
      { nome: 'Caneta azul (cx 50)', codigoBarras: '7891234000002', categoria: papelaria._id, precoVenda: 12.50, precoAtacado: 10.00, quantidadeAtacado: 5, precoCusto: 6.00, estoque: 80, estoqueMinimo: 15 },
      { nome: 'Borracha branca', codigoBarras: '7891234000003', categoria: papelaria._id, precoVenda: 2.50, precoCusto: 1.00, estoque: 6, estoqueMinimo: 10 },
      { nome: 'Pasta A4 AZ', codigoBarras: '7891234000010', categoria: escritorio._id, precoVenda: 24.90, precoCusto: 14.00, estoque: 22, estoqueMinimo: 8 },
      { nome: 'Post-it 76x76mm', codigoBarras: '7891234000011', categoria: escritorio._id, precoVenda: 8.90, precoCusto: 4.50, estoque: 35, estoqueMinimo: 10 },
      { nome: 'Arroz 5kg', codigoBarras: '7890123000001', categoria: alimentos._id, precoVenda: 28.90, precoAtacado: 25.00, quantidadeAtacado: 5, precoCusto: 18.00, estoque: 31, estoqueMinimo: 10 },
      { nome: 'Água mineral 500ml', codigoBarras: '7897654000001', categoria: bebidas._id, precoVenda: 3.00, precoAtacado: 2.20, quantidadeAtacado: 12, precoCusto: 1.20, estoque: 120, estoqueMinimo: 24 },
      { nome: 'Refrigerante 2L', codigoBarras: '7897654000002', categoria: bebidas._id, precoVenda: 8.50, precoCusto: 4.50, estoque: 34, estoqueMinimo: 12 },
      { nome: 'Paracetamol 750mg (cx)', codigoBarras: '7892500000001', categoria: saude._id, precoVenda: 6.90, precoCusto: 3.50, estoque: 40, estoqueMinimo: 15 },
      { nome: 'Lanche Naturale', codigoBarras: '7892500000010', categoria: lanchonete._id, precoVenda: 5.00, precoCusto: 2.50, estoque: 25, estoqueMinimo: 10 },
      { nome: 'Bala Chiclete 100g', codigoBarras: '7892500000020', categoria: bomboniere._id, precoVenda: 3.50, precoCusto: 1.80, estoque: 60, estoqueMinimo: 20 },
    ])
    console.log(`🛍️  ${produtos.length} produtos criados`)

    const clientes = await Cliente.create([
      { nome: 'João Silva',          tipo: 'PF', cpf: '123.456.789-00', telefone: '(61) 99999-1234', email: 'joao@email.com', limiteCredito: 200, saldoFiado: 120 },
      { nome: 'Maria Oliveira',      tipo: 'PF', cpf: '987.654.321-00', telefone: '(61) 98888-5678', limiteCredito: 200, saldoFiado: 0 },
      { nome: 'Papelaria do João',   tipo: 'PJ', cnpj: '12.345.678/0001-90', telefone: '(61) 3333-9999', email: 'compras@papeljoao.com', endereco: 'Rua das Flores, 123', limiteCredito: 1000, saldoFiado: 0 },
      { nome: 'Pedro Rocha',         tipo: 'PF', telefone: '(61) 95555-7890', limiteCredito: 100, saldoFiado: 80 },
    ])
    console.log(`👥 ${clientes.length} clientes criados`)

    console.log('\n✅ Seed concluído!')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('🔑 Credenciais de acesso:')
    console.log('   Admin:       admin@soares.com / 123456')
    console.log('   Gerente:     carlos@soares.com / 123456')
    console.log('   Caixa:       ana@soares.com / 123456')
    console.log('   Estoque:     marcos@soares.com / 123456')
    console.log('   Colaborador: fernanda@soares.com / 123456')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log(`📦 ${categorias.length} categorias cadastradas conforme contrato`)

    process.exit(0)
  } catch (error) {
    console.error('❌ Erro no seed:', error.message)
    process.exit(1)
  }
}

seed()
