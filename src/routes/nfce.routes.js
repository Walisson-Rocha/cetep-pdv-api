const express  = require('express')
const router   = express.Router()
const multer   = require('multer')
const forge    = require('node-forge')
const { protect, authorize } = require('../middleware/auth.middleware')
const nfceService  = require('../services/nfce')
const Venda        = require('../models/Venda')
const Configuracao = require('../models/Configuracao')
const logger       = require('../config/logger')

router.use(protect)

// Upload em memória — o .pfx nunca é salvo em disco
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } })

// ── Upload do certificado A1 ─────────────────────────────────────────────────
router.post('/certificado', authorize('admin'), upload.single('certificado'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ mensagem: 'Nenhum arquivo enviado' })
    const { senha } = req.body
    if (!senha) return res.status(400).json({ mensagem: 'Senha do certificado obrigatória' })

    const pfxBuffer = req.file.buffer
    const pfxBase64 = pfxBuffer.toString('base64')

    // Valida e extrai informações do certificado
    let info = ''
    try {
      const pfxAsn1 = forge.asn1.fromDer(pfxBuffer.toString('binary'))
      const pfx     = forge.pkcs12.pkcs12FromAsn1(pfxAsn1, false, senha)
      for (const bag of pfx.safeContents) {
        for (const sb of bag.safeBags) {
          if (sb.type === forge.pki.oids.certBag && sb.cert) {
            const cert   = sb.cert
            const cn     = cert.subject.getField('CN')?.value || ''
            const valido = cert.validity.notAfter
            info = `${cn} | Válido até: ${new Date(valido).toLocaleDateString('pt-BR')}`
          }
        }
      }
    } catch {
      return res.status(400).json({ mensagem: 'Certificado inválido ou senha incorreta' })
    }

    await Configuracao.findOneAndUpdate(
      {},
      { $set: { 'nfce.certificadoBase64': pfxBase64, 'nfce.certificadoSenha': senha, 'nfce.certificadoInfo': info } },
      { upsert: true }
    )

    res.json({ mensagem: 'Certificado carregado com sucesso!', info })
  } catch (error) {
    logger.error('Erro ao carregar certificado:', error)
    res.status(500).json({ mensagem: 'Erro ao processar certificado' })
  }
})

// ── Emite NFC-e para uma venda ───────────────────────────────────────────────
router.post('/emitir/:vendaId', authorize('admin', 'gerente', 'caixa'), async (req, res) => {
  try {
    const venda = await Venda.findById(req.params.vendaId)
      .populate('itens.produto', 'ncm cfop csosn origemProduto codigoBarras unidade')
      .populate('cliente', 'nome cpf')

    if (!venda)          return res.status(404).json({ mensagem: 'Venda não encontrada' })
    if (venda.cancelada) return res.status(400).json({ mensagem: 'Venda cancelada não pode ter NFC-e emitida' })
    if (venda.nfce?.status === 'autorizado') {
      return res.status(400).json({ mensagem: 'NFC-e já autorizada', nfce: venda.nfce })
    }

    const config = await Configuracao.findOne()
    if (!config) return res.status(500).json({ mensagem: 'Configurações não encontradas' })

    // Valida NCM de todos os itens antes de enviar à SEFAZ
    const semNcm = venda.itens.filter(item => {
      const ncmRaw = (item.produto?.ncm || '').replace(/\D/g, '')
      return !ncmRaw || ncmRaw === '00000000' || ncmRaw.length !== 8
    })
    if (semNcm.length > 0) {
      const nomes = semNcm.map(i => `"${i.nomeProduto}"`).join(', ')
      return res.status(400).json({
        mensagem: `Produto(s) sem NCM válido: ${nomes}. Cadastre o NCM de 8 dígitos em Estoque → Editar produto antes de emitir NFC-e.`
      })
    }

    // Usa o _id da venda como referência única para o Focus NFe
    const referencia = `pdv-${venda._id.toString()}`

    // Marca como processando e armazena referência
    venda.nfce = { status: 'processando', emitidaEm: new Date(), referencia }
    await venda.save()

    let resultado
    try {
      resultado = await nfceService.emitir(venda, config, referencia)
    } catch (err) {
      venda.nfce.status = 'erro'
      venda.nfce.erroMensagem = err.message
      await venda.save()
      logger.error(`Erro NFC-e: ${err.message}`)
      return res.status(422).json({ mensagem: err.message || 'Erro ao emitir NFC-e' })
    }

    venda.nfce.status       = resultado.autorizado ? 'autorizado' : 'erro'
    venda.nfce.chaveAcesso  = resultado.chaveAcesso
    venda.nfce.numero       = resultado.numero
    venda.nfce.urlDanfe     = resultado.urlDanfe || undefined
    venda.nfce.erroMensagem = resultado.autorizado ? undefined : resultado.xMotivo
    await venda.save()

    if (!resultado.autorizado) {
      return res.status(422).json({ mensagem: `SEFAZ: ${resultado.xMotivo} (${resultado.cStat})` })
    }

    res.json({
      mensagem:    'NFC-e autorizada pela SEFAZ!',
      chaveAcesso: resultado.chaveAcesso,
      numero:      resultado.numero,
      xMotivo:     resultado.xMotivo,
      urlDanfe:    resultado.urlDanfe || '',
      nfce:        venda.nfce,
    })
  } catch (error) {
    logger.error('Erro ao emitir NFC-e:', error)
    res.status(500).json({ mensagem: 'Erro interno ao emitir NFC-e' })
  }
})

// ── Status da NFC-e ──────────────────────────────────────────────────────────
router.get('/status/:vendaId', authorize('admin', 'gerente', 'caixa'), async (req, res) => {
  try {
    const venda = await Venda.findById(req.params.vendaId).select('nfce')
    if (!venda) return res.status(404).json({ mensagem: 'Venda não encontrada' })
    res.json({ nfce: venda.nfce })
  } catch (error) {
    res.status(500).json({ mensagem: 'Erro ao buscar status' })
  }
})

// ── Cancelar NFC-e ──────────────────────────────────────────────────────────
router.delete('/cancelar/:vendaId', authorize('admin', 'gerente'), async (req, res) => {
  try {
    const venda = await Venda.findById(req.params.vendaId)
    if (!venda) return res.status(404).json({ mensagem: 'Venda não encontrada' })
    if (!venda.nfce?.referencia) return res.status(400).json({ mensagem: 'NFC-e sem referência registrada — não pode ser cancelada por aqui' })
    if (venda.nfce.status !== 'autorizado') return res.status(400).json({ mensagem: 'Somente NFC-e autorizada pode ser cancelada' })

    const config = await Configuracao.findOne()
    const justificativa = req.body.justificativa || 'Cancelamento solicitado pelo operador'
    if (justificativa.length < 15) return res.status(400).json({ mensagem: 'Justificativa deve ter pelo menos 15 caracteres' })

    try {
      await nfceService.cancelar(venda.nfce.referencia, justificativa, config)
    } catch (err) {
      return res.status(422).json({ mensagem: `Erro ao cancelar na SEFAZ: ${err.message}` })
    }

    venda.nfce.status = 'cancelado'
    await venda.save()
    res.json({ mensagem: 'NFC-e cancelada com sucesso' })
  } catch (error) {
    logger.error('Erro ao cancelar NFC-e:', error)
    res.status(500).json({ mensagem: 'Erro ao cancelar NFC-e' })
  }
})

// ── Listar NFC-e emitidas ────────────────────────────────────────────────────
router.get('/lista', authorize('admin', 'gerente'), async (req, res) => {
  try {
    const { page = 1, limit = 20, status, inicio, fim } = req.query
    const filtro = { 'nfce.status': { $exists: true } }
    if (status) filtro['nfce.status'] = status
    if (inicio || fim) {
      filtro.createdAt = {}
      if (inicio) filtro.createdAt.$gte = new Date(inicio)
      if (fim) filtro.createdAt.$lte = new Date(fim)
    }
    const [vendas, total] = await Promise.all([
      Venda.find(filtro)
        .select('numero total createdAt nfce formaPagamento vendedor cpfConsumidor')
        .populate('vendedor', 'nome')
        .sort({ createdAt: -1 })
        .skip((Number(page) - 1) * Number(limit))
        .limit(Number(limit)),
      Venda.countDocuments(filtro),
    ])
    const counts = await Venda.aggregate([
      { $match: filtro },
      { $group: { _id: '$nfce.status', total: { $sum: 1 } } },
    ])
    const totaisAgg = await Venda.aggregate([
      { $match: { ...filtro, 'nfce.status': 'autorizado' } },
      { $group: { _id: null, totalValor: { $sum: '$total' } } },
    ])
    const totalValorAutorizado = totaisAgg[0]?.totalValor || 0
    res.json({ vendas, total, paginas: Math.ceil(total / Number(limit)), counts, totalValorAutorizado })
  } catch (error) {
    logger.error('Erro ao listar NFC-e:', error)
    res.status(500).json({ mensagem: 'Erro ao listar NFC-e' })
  }
})

// ── Info do certificado atual ────────────────────────────────────────────────
router.get('/certificado/info', authorize('admin'), async (req, res) => {
  try {
    const config = await Configuracao.findOne().select('nfce.certificadoInfo nfce.ambiente nfce.uf')
    res.json({
      info:      config?.nfce?.certificadoInfo || '',
      carregado: !!config?.nfce?.certificadoInfo,
      ambiente:  config?.nfce?.ambiente || 'homologacao',
      uf:        config?.nfce?.uf || 'SP',
    })
  } catch (error) {
    res.status(500).json({ mensagem: 'Erro' })
  }
})

module.exports = router
