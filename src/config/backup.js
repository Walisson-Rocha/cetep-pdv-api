const fs = require('fs/promises')
const path = require('path')
const cron = require('node-cron')
const logger = require('./logger')

const BACKUP_DIR = process.env.BACKUP_DIR || path.join(__dirname, '..', '..', 'backups')
const RETENCAO_DIAS = 14

const gerarBackup = async () => {
  const Produto = require('../models/Produto')
  const Cliente = require('../models/Cliente')
  const Venda = require('../models/Venda')
  const Caixa = require('../models/Caixa')
  const Categoria = require('../models/Categoria')
  const Despesa = require('../models/Despesa')
  const Fornecedor = require('../models/Fornecedor')

  const [produtos, clientes, vendas, caixas, categorias, despesas, fornecedores] = await Promise.all([
    Produto.find({ ativo: true }).populate('categoria', 'nome'),
    Cliente.find(),
    Venda.find({ cancelada: false }).sort({ createdAt: -1 }).limit(2000),
    Caixa.find({ status: 'fechado' }).sort({ fechadoEm: -1 }).limit(200),
    Categoria.find(),
    Despesa.find(),
    Fornecedor.find(),
  ])

  const geradoEm = new Date().toISOString()
  const conteudo = JSON.stringify({ geradoEm, produtos, clientes, vendas, caixas, categorias, despesas, fornecedores })

  await fs.mkdir(BACKUP_DIR, { recursive: true })
  const arquivo = path.join(BACKUP_DIR, `backup_${geradoEm.split('T')[0]}.json`)
  await fs.writeFile(arquivo, conteudo)
  return arquivo
}

const limparBackupsAntigos = async () => {
  await fs.mkdir(BACKUP_DIR, { recursive: true })
  const arquivos = await fs.readdir(BACKUP_DIR)
  const limite = Date.now() - RETENCAO_DIAS * 24 * 60 * 60 * 1000
  for (const nome of arquivos) {
    if (!nome.startsWith('backup_')) continue
    const caminho = path.join(BACKUP_DIR, nome)
    const stat = await fs.stat(caminho)
    if (stat.mtimeMs < limite) await fs.unlink(caminho)
  }
}

// Roda todo dia às 3h da manhã (horário do servidor)
const iniciar = () => {
  cron.schedule('0 3 * * *', async () => {
    try {
      const arquivo = await gerarBackup()
      await limparBackupsAntigos()
      logger.info(`Backup automático gerado: ${arquivo}`)
    } catch (error) {
      logger.error('Erro no backup automático:', error)
    }
  })
  logger.info('Rotina de backup automático agendada (diariamente às 03:00).')
}

module.exports = { iniciar, gerarBackup, limparBackupsAntigos }
