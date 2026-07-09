// Gera a chave de acesso de 44 dígitos da NFC-e
// cUF(2) + AAMM(4) + CNPJ(14) + mod(2) + serie(3) + nNF(9) + tpEmis(1) + cNF(8) + cDV(1)

const UF_CODE = {
  RO: 11, AC: 12, AM: 13, RR: 14, PA: 15, AP: 16, TO: 17,
  MA: 21, PI: 22, CE: 23, RN: 24, PB: 25, PE: 26, AL: 27, SE: 28, BA: 29,
  MG: 31, ES: 32, RJ: 33, SP: 35,
  PR: 41, SC: 42, RS: 43,
  MS: 50, MT: 51, GO: 52, DF: 53,
}

function digitoVerificador(chave43) {
  const pesos = [2, 3, 4, 5, 6, 7, 8, 9]
  let soma = 0
  let pos = 0
  for (let i = chave43.length - 1; i >= 0; i--) {
    soma += parseInt(chave43[i]) * pesos[pos % 8]
    pos++
  }
  const resto = soma % 11
  return resto < 2 ? 0 : 11 - resto
}

function gerarCNF() {
  return String(Math.floor(Math.random() * 99999999)).padStart(8, '0')
}

function gerarChave({ uf, cnpj, serie, numero, tpEmis = 1, cNF, dataEmissao }) {
  const cuf = String(UF_CODE[uf] || 35).padStart(2, '0')
  const data = dataEmissao || new Date()
  const aamm = String(data.getFullYear()).slice(2) + String(data.getMonth() + 1).padStart(2, '0')
  const cnpjLimpo = cnpj.replace(/\D/g, '').padStart(14, '0')
  const mod = '65' // NFC-e
  const serieStr = String(serie).padStart(3, '0')
  const nNF = String(numero).padStart(9, '0')
  const tp = String(tpEmis)
  const cnfStr = cNF || gerarCNF()

  const chave43 = `${cuf}${aamm}${cnpjLimpo}${mod}${serieStr}${nNF}${tp}${cnfStr}`
  const dv = digitoVerificador(chave43)
  return { chave: `${chave43}${dv}`, cNF: cnfStr }
}

module.exports = { gerarChave, UF_CODE }
