const { parsePfx } = require('./cert-parser')
const { SignedXml } = require('xml-crypto')

function assinarXml(xml, pfxBase64, senha) {
  const { privateKeyPem, certificatePem } = parsePfx(pfxBase64, senha)

  // Extrai a chave (Id) do infNFe
  const match = xml.match(/Id="(NFe[^"]+)"/)
  if (!match) throw new Error('Id do infNFe não encontrado no XML')
  const refId = match[1]

  const sig = new SignedXml({ privateKey: privateKeyPem })

  sig.addReference({
    xpath: `//*[@Id='${refId}']`,
    digestAlgorithm: 'http://www.w3.org/2000/09/xmldsig#sha1',
    transforms: [
      'http://www.w3.org/2000/09/xmldsig#enveloped-signature',
      'http://www.w3.org/2001/10/xml-exc-c14n#',
    ],
  })

  sig.signatureAlgorithm = 'http://www.w3.org/2000/09/xmldsig#rsa-sha1'
  sig.canonicalizationAlgorithm = 'http://www.w3.org/2001/10/xml-exc-c14n#'

  // Adiciona o certificado ao KeyInfo
  const certLimpo = certificatePem
    .replace('-----BEGIN CERTIFICATE-----', '')
    .replace('-----END CERTIFICATE-----', '')
    .replace(/\r?\n/g, '')

  sig.keyInfoProvider = {
    getKeyInfo: () => `<X509Data><X509Certificate>${certLimpo}</X509Certificate></X509Data>`,
    getKey: () => Buffer.from(privateKeyPem),
  }

  sig.computeSignature(xml, {
    location: {
      reference: "/*[local-name()='NFe']/*[local-name()='infNFe']",
      action: 'after',
    },
  })

  return sig.getSignedXml()
}

module.exports = { assinarXml }
