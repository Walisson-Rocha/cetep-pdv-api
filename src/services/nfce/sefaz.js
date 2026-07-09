const https = require('https')
const { parsePfx } = require('./cert-parser')

// Endpoints NFC-e por estado
// Fonte: Portal SEFAZ Nacional / Documentação NFC-e
// h = host homologação | phost = host produção | ph = path hom | pp = path prod
// Hosts confirmados por DNS + HTTP 403 (path existe, exige mTLS)
const SVRS_H    = 'nfce-homologacao.svrs.rs.gov.br'
const SVRS_P    = 'nfce.svrs.rs.gov.br'
const SVRS_PATH = '/ws/NfceAutorizacao/NfceAutorizacao4.asmx'

const ENDPOINTS = {
  // Autorização própria
  SP: { h: 'homologacao.nfce.fazenda.sp.gov.br', phost: 'nfce.fazenda.sp.gov.br',  ph: '/ws/NfceAutorizacao4.asmx',  pp: '/ws/NfceAutorizacao4.asmx' },
  MG: { h: 'hnfce.fazenda.mg.gov.br',            phost: 'nfce.fazenda.mg.gov.br',  ph: '/ws/NfceAutorizacao4.asmx',  pp: '/ws/NfceAutorizacao4.asmx' },
  PR: { h: 'homologacao.nfce.sefa.pr.gov.br',    phost: 'nfce.sefa.pr.gov.br',     ph: '/nfce/NfceAutorizacao4.asmx',pp: '/nfce/NfceAutorizacao4.asmx' },
  RS: { h: SVRS_H, phost: SVRS_P, ph: SVRS_PATH, pp: SVRS_PATH },
  // SVRS (Sefaz Virtual RS) — GO e demais estados delegados
  GO: { h: SVRS_H, phost: SVRS_P, ph: SVRS_PATH, pp: SVRS_PATH },
  AM: { h: SVRS_H, phost: SVRS_P, ph: SVRS_PATH, pp: SVRS_PATH },
  BA: { h: SVRS_H, phost: SVRS_P, ph: SVRS_PATH, pp: SVRS_PATH },
  CE: { h: SVRS_H, phost: SVRS_P, ph: SVRS_PATH, pp: SVRS_PATH },
  MA: { h: SVRS_H, phost: SVRS_P, ph: SVRS_PATH, pp: SVRS_PATH },
  MS: { h: SVRS_H, phost: SVRS_P, ph: SVRS_PATH, pp: SVRS_PATH },
  MT: { h: SVRS_H, phost: SVRS_P, ph: SVRS_PATH, pp: SVRS_PATH },
  PA: { h: SVRS_H, phost: SVRS_P, ph: SVRS_PATH, pp: SVRS_PATH },
  PE: { h: SVRS_H, phost: SVRS_P, ph: SVRS_PATH, pp: SVRS_PATH },
  PI: { h: SVRS_H, phost: SVRS_P, ph: SVRS_PATH, pp: SVRS_PATH },
  RN: { h: SVRS_H, phost: SVRS_P, ph: SVRS_PATH, pp: SVRS_PATH },
  SC: { h: SVRS_H, phost: SVRS_P, ph: SVRS_PATH, pp: SVRS_PATH },
  RJ: { h: SVRS_H, phost: SVRS_P, ph: SVRS_PATH, pp: SVRS_PATH },
  ES: { h: SVRS_H, phost: SVRS_P, ph: SVRS_PATH, pp: SVRS_PATH },
  AC: { h: SVRS_H, phost: SVRS_P, ph: SVRS_PATH, pp: SVRS_PATH },
  AL: { h: SVRS_H, phost: SVRS_P, ph: SVRS_PATH, pp: SVRS_PATH },
  AP: { h: SVRS_H, phost: SVRS_P, ph: SVRS_PATH, pp: SVRS_PATH },
  PB: { h: SVRS_H, phost: SVRS_P, ph: SVRS_PATH, pp: SVRS_PATH },
  RO: { h: SVRS_H, phost: SVRS_P, ph: SVRS_PATH, pp: SVRS_PATH },
  RR: { h: SVRS_H, phost: SVRS_P, ph: SVRS_PATH, pp: SVRS_PATH },
  SE: { h: SVRS_H, phost: SVRS_P, ph: SVRS_PATH, pp: SVRS_PATH },
  TO: { h: SVRS_H, phost: SVRS_P, ph: SVRS_PATH, pp: SVRS_PATH },
  DF: { h: SVRS_H, phost: SVRS_P, ph: SVRS_PATH, pp: SVRS_PATH },
}

function buildSoap(xmlNfce) {
  // Encapsula o XML da NFC-e dentro do envelope SOAP 1.2
  const xmlEscapado = xmlNfce
    .replace(/^<\?xml[^?>]*\?>\s*/i, '')  // remove declaração XML
  return `<?xml version="1.0" encoding="UTF-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:xsd="http://www.w3.org/2001/XMLSchema"
  xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NfceAutorizacao4">
      ${xmlEscapado}
    </nfeDadosMsg>
  </soap12:Body>
</soap12:Envelope>`
}

function enviarSefaz(xmlAssinado, pfxBase64, senha, uf, producao) {
  return new Promise((resolve, reject) => {
    const ep = ENDPOINTS[uf] || ENDPOINTS.SP
    const hostname = producao ? (ep.phost || ep.h) : ep.h
    const path     = producao ? ep.pp : ep.ph
    const soap     = buildSoap(xmlAssinado)
    const body     = Buffer.from(soap, 'utf8')

    const { privateKeyPem: key, certificatePem: cert } = parsePfx(pfxBase64, senha)

    const options = {
      hostname,
      port: 443,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/soap+xml; charset=utf-8; action="http://www.portalfiscal.inf.br/nfe/wsdl/NfceAutorizacao4/nfeDadosMsg"',
        'Content-Length': body.length,
      },
      key,
      cert,
      // Aceita certificados SEFAZ (alguns estados têm cadeias próprias)
      rejectUnauthorized: false,
    }

    const req = https.request(options, res => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        console.log('[SEFAZ-RAW] status:', res.statusCode)
        console.log('[SEFAZ-RAW] body:', data.substring(0, 2000))
        resolve(data)
      })
    })

    req.on('error', reject)
    req.setTimeout(30_000, () => { req.destroy(); reject(new Error('Timeout SEFAZ')) })
    req.write(body)
    req.end()
  })
}

function parseRetorno(xmlResposta) {
  // Extrai campos principais da resposta SEFAZ
  const get = (tag, xml) => {
    const m = xml.match(new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`))
    return m ? m[1].trim() : ''
  }
  const cStat      = get('cStat', xmlResposta)
  const xMotivo    = get('xMotivo', xmlResposta)
  const chNFe      = get('chNFe', xmlResposta)
  const nProt      = get('nProt', xmlResposta)
  const dhRecbto   = get('dhRecbto', xmlResposta)

  // 100 = autorizado, 150 = autorizado fora de prazo
  const autorizado = ['100', '150'].includes(cStat)

  return { cStat, xMotivo, chNFe, nProt, dhRecbto, autorizado }
}

module.exports = { enviarSefaz, parseRetorno }
