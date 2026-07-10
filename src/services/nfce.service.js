const axios = require('axios')
const logger = require('../config/logger')

const BASE_URL = {
  homologacao: 'https://homologacao.focusnfe.com.br/v2',
  producao:    'https://api.focusnfe.com.br/v2',
}

const FORMA_PGTO = {
  dinheiro:    '01',
  credito:     '03',
  debito:      '04',
  pix:         '17',
  boleto:      '15',
  fiado:       '99',
  colaborador: '99',
  misto:       '99',
}

function focusClient(token, ambiente) {
  return axios.create({
    baseURL: BASE_URL[ambiente] || BASE_URL.homologacao,
    auth: { username: token, password: '' },
    timeout: 30_000,
    headers: { 'Content-Type': 'application/json' },
  })
}

function montarUnidade(unidade) {
  // 'g' → 'GR' conforme tabela SEFAZ (não 'G'); 'pct' → 'PCT'
  const map = { kg: 'KG', g: 'GR', l: 'LT', ml: 'ML', cx: 'CX', pct: 'PCT', un: 'UN' }
  return map[unidade] || 'UN'
}

function montarEAN(codigoBarras) {
  if (!codigoBarras) return 'SEM GTIN'
  const digits = String(codigoBarras).replace(/\D/g, '')
  // EAN válido: 8, 12 ou 13 dígitos
  if ([8, 12, 13].includes(digits.length)) return digits
  return 'SEM GTIN'
}

function montarItems(itens) {
  return itens.map((item, idx) => {
    const p = item.produto || {}
    // CSOSN 400 ("Não tributada") é inválido para venda de balcão — normaliza para 102
    const csosnRaw = (p.csosn || '102').trim()
    const csosn = csosnRaw === '400' ? '102' : csosnRaw
    const cfop  = (p.cfop  || '5102').trim()
    const ncm   = (p.ncm   || '00000000').replace(/\D/g, '').padEnd(8, '0').slice(0, 8)
    const subtotal = Number((item.precoUnitario * item.quantidade).toFixed(2))
    const ean = montarEAN(p.codigoBarras)

    return {
      numero_item:               idx + 1,
      codigo_produto:            String(p.codigoBarras || p._id).slice(-20),
      codigo_barras:             ean,
      descricao:                 item.nomeProduto,
      codigo_ncm:                ncm,
      cfop,
      unidade_comercial:         montarUnidade(p.unidade),
      quantidade_comercial:      item.quantidade,
      valor_unitario_comercial:  item.precoUnitario,
      valor_bruto:               subtotal,
      unidade_tributavel:        montarUnidade(p.unidade),
      quantidade_tributavel:     item.quantidade,
      valor_unitario_tributavel: item.precoUnitario,
      inclui_no_total:           1,
      icms_situacao_tributaria:  csosn,
      codigo_origem_produto:     p.origemProduto ?? 0,
    }
  })
}

function montarFormasPagamento(venda) {
  if (venda.formaPagamento === 'misto' && venda.formasPagamento?.length) {
    return venda.formasPagamento
      .filter(f => f.valor > 0)
      .map(f => ({
        forma_pagamento: FORMA_PGTO[f.metodo] || '99',
        valor_pagamento: Number(f.valor.toFixed(2)),
      }))
  }
  return [{
    forma_pagamento: FORMA_PGTO[venda.formaPagamento] || '99',
    valor_pagamento: Number(venda.total.toFixed(2)),
  }]
}

async function emitir(venda, config, referencia) {
  const token   = config.nfce?.focusApiToken
  const ambiente = config.nfce?.ambiente || 'homologacao'
  if (!token) throw new Error('Token Focus NFe não configurado em Configurações → Fiscal')

  const serie = config.nfce?.serie || '001'
  const agora = new Date()
  // Converte UTC → BRT (UTC-3) antes de formatar; sem isso a SEFAZ rejeita por horário futuro
  const brt = new Date(agora.getTime() - 3 * 60 * 60 * 1000)
  const dataEmissao = brt.toISOString().slice(0, 19) + '-03:00'

  const cnpj = (config.cnpj || '').replace(/\D/g, '')
  if (!cnpj) throw new Error('CNPJ do emitente não configurado em Configurações → Empresa')
  const razaoSocial = config.razaoSocial || config.nomeLoja || ''
  const email = config.email || ''

  const payload = {
    cnpj_emitente:      cnpj,
    ...(razaoSocial ? { nome_emitente: razaoSocial } : {}),
    ...(email        ? { email_emitente: email }      : {}),
    natureza_operacao:  'Venda ao consumidor',
    forma_pagamento:    0,
    modalidade_frete:   9,
    serie,
    data_emissao:       dataEmissao,
    tipo_documento:     1,
    finalidade_emissao: 1,
    presenca_comprador: 1,
    consumidor_final:   1,
    items:              montarItems(venda.itens),
    formas_pagamento:   montarFormasPagamento(venda),
  }

  // CPF do consumidor (campo avulso ou do cliente cadastrado)
  const cpfRaw = venda.cpfConsumidor || venda.cliente?.cpf || ''
  if (cpfRaw) {
    const cpfDigits = cpfRaw.replace(/\D/g, '')
    if (cpfDigits.length === 11) payload.cpf_destinatario = cpfDigits
  }

  logger.info(`NFC-e emissão ref=${referencia} ambiente=${ambiente}`)

  const client = focusClient(token, ambiente)
  const { data } = await client.post(`/nfce?ref=${referencia}&sincronos=true`, payload)
  return data
}

async function consultarStatus(referencia, config) {
  const token   = config.nfce?.focusApiToken
  const ambiente = config.nfce?.ambiente || 'homologacao'
  if (!token) throw new Error('Token Focus NFe não configurado')

  const client = focusClient(token, ambiente)
  const { data } = await client.get(`/nfce/${referencia}`)
  return data
}

async function cancelar(referencia, justificativa, config) {
  const token   = config.nfce?.focusApiToken
  const ambiente = config.nfce?.ambiente || 'homologacao'
  if (!token) throw new Error('Token Focus NFe não configurado')

  const client = focusClient(token, ambiente)
  const { data } = await client.delete(`/nfce/${referencia}`, {
    data: { justificativa: justificativa || 'Cancelamento solicitado pelo operador' },
  })
  return data
}

module.exports = { emitir, consultarStatus, cancelar }
