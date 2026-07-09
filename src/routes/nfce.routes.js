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

    // Marca como processando
    venda.nfce = { status: 'processando', emitidaEm: new Date() }
    await venda.save()

    let resultado
    try {
      resultado = await nfceService.emitir(venda, config)
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
