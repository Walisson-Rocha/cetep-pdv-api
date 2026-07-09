// Roda: node test-paths.js
// Testa múltiplos paths no SVRS NFC-e homologação com o certificado real
const https = require('https')
const mongoose = require('mongoose')
const { parsePfx } = require('./src/services/nfce/cert-parser')

const SOAP = `<?xml version="1.0" encoding="UTF-8"?><soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"><soap12:Body><nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NfceAutorizacao4">test</nfeDadosMsg></soap12:Body></soap12:Envelope>`

async function testPath(host, path, key, cert) {
  return new Promise(resolve => {
    const body = Buffer.from(SOAP, 'utf8')
    const req = https.request({
      hostname: host, port: 443, path, method: 'POST',
      headers: {
        'Content-Type': 'application/soap+xml; charset=utf-8',
        'Content-Length': body.length,
      },
      key, cert, rejectUnauthorized: false,
    }, res => {
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => resolve({ status: res.statusCode, body: data.substring(0, 200) }))
    })
    req.on('error', e => resolve({ status: 'ERR', body: e.message.substring(0, 80) }))
    req.setTimeout(8000, () => { req.destroy(); resolve({ status: 'TIMEOUT', body: '' }) })
    req.write(body); req.end()
  })
}

async function main() {
  require('dotenv').config()
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/cetep-pdv')
  const Configuracao = require('./src/models/Configuracao')
  const config = await Configuracao.findOne()
  if (!config?.nfce?.certificadoBase64) { console.log('Sem certificado!'); process.exit(1) }

  const { privateKeyPem: key, certificatePem: cert } = parsePfx(config.nfce.certificadoBase64, config.nfce.certificadoSenha)

  const HOSTS = [
    'nfce-homologacao.svrs.rs.gov.br',
    'nfce-homologacao.sefazrs.rs.gov.br',
  ]
  const paths = [
    '/ws/NfceAutorizacao4.asmx',
    '/ws/NfceAutorizacao/NfceAutorizacao4.asmx',
    '/WS/NfceAutorizacao4.asmx',
    '/ws/nfce/NfceAutorizacao4.asmx',
    '/nfce/services/NfceAutorizacao4',
    '/services/NfceAutorizacao4.asmx',
    '/ws/NfceStatusServico4.asmx',
  ]

  for (const HOST of HOSTS) {
    console.log(`\n=== ${HOST} ===`)
    for (const p of paths) {
      const r = await testPath(HOST, p, key, cert)
      console.log(`[${r.status}] ${p} — ${r.body.replace(/\s+/g, ' ').substring(0, 80)}`)
    }
  }

  for (const p of paths) {
    const r = await testPath(HOST, p, key, cert)
    console.log(`[${r.status}] ${p} — ${r.body.replace(/\s+/g, ' ').substring(0, 100)}`)
  }

  await mongoose.disconnect()
}

main().catch(console.error)
