const nfceService = require('../nfce.service')
const logger = require('../../config/logger')

async function emitir(venda, config) {
  const token = config.nfce?.focusApiToken
  if (!token) throw new Error('Token Focus NFe não configurado. Vá em Configurações → Fiscal.')

  // Referência única por venda (ObjectId MongoDB = 24 chars, único)
  const referencia = String(venda._id)

  logger.info(`NFC-e emitindo via Focus NFe — ref=${referencia} ambiente=${config.nfce?.ambiente || 'homologacao'}`)

  let data
  try {
    data = await nfceService.emitir(venda, config, referencia)
  } catch (err) {
    // Loga corpo completo da resposta para diagnóstico
    if (err.response) {
      logger.error(`Focus NFe HTTP ${err.response.status} — body: ${JSON.stringify(err.response.data)}`)
    }
    const apiMsg = err.response?.data?.erros?.[0]?.mensagem
      || err.response?.data?.mensagem_sefaz
      || err.response?.data?.mensagem
      || err.response?.data?.status
      || err.message
    throw new Error(`Focus NFe: ${apiMsg}`)
  }

  const autorizado = data.status === 'autorizado'

  // Monta URL completa do DANFE (Focus NFe retorna só o caminho)
  const baseUrl = (config.nfce?.ambiente === 'producao')
    ? 'https://api.focusnfe.com.br'
    : 'https://homologacao.focusnfe.com.br'
  const urlDanfe = data.caminho_danfe ? baseUrl + data.caminho_danfe : ''

  return {
    autorizado,
    cStat:       autorizado ? '100' : (data.codigo_situacao || data.cStat || ''),
    xMotivo:     data.mensagem_sefaz || data.erros?.[0]?.mensagem || data.status || '',
    chaveAcesso: data.chave_nfe || '',
    nProt:       data.numero_protocolo || '',
    numero:      data.numero || 0,
    urlDanfe,
  }
}

module.exports = { emitir }
