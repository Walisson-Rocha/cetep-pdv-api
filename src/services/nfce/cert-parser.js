// Extrai corretamente chave + certificado de um .pfx com cadeia de CAs
const forge = require('node-forge')

function parsePfx(pfxBase64, senha) {
  const pfxDer  = forge.util.decode64(pfxBase64)
  const pfxAsn1 = forge.asn1.fromDer(pfxDer)
  const pfx     = forge.pkcs12.pkcs12FromAsn1(pfxAsn1, false, senha)

  let privateKey = null
  const certs = []

  for (const safeContent of pfx.safeContents) {
    for (const bag of safeContent.safeBags) {
      if (bag.type === forge.pki.oids.pkcs8ShroudedKeyBag && bag.key) {
        privateKey = bag.key
      } else if (bag.type === forge.pki.oids.keyBag && bag.key) {
        privateKey = bag.key
      } else if (bag.type === forge.pki.oids.certBag && bag.cert) {
        certs.push(bag.cert)
      }
    }
  }

  if (!privateKey) throw new Error('Chave privada não encontrada no .pfx')
  if (certs.length === 0) throw new Error('Nenhum certificado encontrado no .pfx')

  // Encontra o certificado cujo módulo RSA (n) bate com a chave privada
  const cert = certs.find(c => {
    try { return c.publicKey.n.equals(privateKey.n) } catch { return false }
  }) || certs.find(c => {
    // Fallback: primeiro certificado que não é CA
    const bc = c.getExtension('basicConstraints')
    return !bc || !bc.cA
  }) || certs[0]

  return {
    privateKeyPem:  forge.pki.privateKeyToPem(privateKey),
    certificatePem: forge.pki.certificateToPem(cert),
  }
}

module.exports = { parsePfx }
