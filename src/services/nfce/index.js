const nfceService = require('../nfce.service')
const logger = require('../../config/logger')

// Focus NFe devolve o mesmo formato de campos tanto na emissão quanto na
// consulta de status (GET /nfce/:referencia) — normaliza os dois pro mesmo
// formato que venda.controller.js/nfce.routes.js já sabem gravar na venda.
function normalizarRespostaFocus(data, config) {
  const autorizado = data.status === 'autorizado'
  const baseUrl = (config.nfce?.ambiente === 'producao')
    ? 'https://api.focusnfe.com.br'
    : 'https://homologacao.focusnfe.com.br'
  const urlDanfe = data.caminho_danfe ? baseUrl + data.caminho_danfe : ''
  return {
    autorizado,
    status:      data.status || '',
    cStat:       autorizado ? '100' : (data.codigo_situacao || data.cStat || ''),
    xMotivo:     data.mensagem_sefaz || data.erros?.[0]?.mensagem || data.status || '',
    chaveAcesso: data.chave_nfe || '',
    nProt:       data.numero_protocolo || '',
    numero:      data.numero || 0,
    urlDanfe,
  }
}

async function emitir(venda, config, referencia) {
  const token = config.nfce?.focusApiToken
  if (!token) throw new Error('Token Focus NFe não configurado. Vá em Configurações → Fiscal.')

  // A referência usada aqui PRECISA ser a mesma que fica gravada em
  // venda.nfce.referencia — cancelar()/consultarStatus() reusam esse valor
  // depois, e a Focus NFe não reconhece uma referência diferente da que
  // recebeu na emissão original. Antes essa função ignorava o parâmetro e
  // calculava a sua própria referência (sem o prefixo "pdv-" que a rota
  // grava no banco), quebrando cancelamento e reconsulta de toda nota já
  // emitida sem ninguém perceber (só a emissão em si "funcionava").
  referencia = referencia || String(venda._id)

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
    throw new Error(`Focus NFe: ${apiMsg}`, { cause: err })
  }

  return normalizarRespostaFocus(data, config)
}

// Faltava esse wrapper exportado — venda.controller.js e nfce.routes.js chamam
// nfceService.cancelar(...), mas só "emitir" estava sendo re-exportado aqui.
// Cancelamento de NFC-e (manual ou automático ao cancelar a venda) quebrava com
// "nfceService.cancelar is not a function".
async function cancelar(referencia, justificativa, config) {
  try {
    return await nfceService.cancelar(referencia, justificativa, config)
  } catch (err) {
    if (err.response) {
      logger.error(`Focus NFe HTTP ${err.response.status} — body: ${JSON.stringify(err.response.data)}`)
    }
    const apiMsg = err.response?.data?.erros?.[0]?.mensagem
      || err.response?.data?.mensagem_sefaz
      || err.response?.data?.mensagem
      || err.response?.data?.status
      || err.message
    throw new Error(`Focus NFe: ${apiMsg}`, { cause: err })
  }
}

async function consultarStatus(referencia, config) {
  try {
    const data = await nfceService.consultarStatus(referencia, config)
    return normalizarRespostaFocus(data, config)
  } catch (err) {
    if (err.response) {
      logger.error(`Focus NFe HTTP ${err.response.status} — body: ${JSON.stringify(err.response.data)}`)
    }
    const apiMsg = err.response?.data?.erros?.[0]?.mensagem
      || err.response?.data?.mensagem_sefaz
      || err.response?.data?.mensagem
      || err.response?.data?.status
      || err.message
    throw new Error(`Focus NFe: ${apiMsg}`, { cause: err })
  }
}

module.exports = { emitir, cancelar, consultarStatus }
