// BRT = UTC-3 (Brasil aboliu horário de verão em 2019). O servidor roda em UTC,
// então qualquer "hoje"/"início do dia" calculado com Date + setHours (hora local
// do processo) vira meia-noite UTC, não meia-noite de Brasília — 3h de diferença
// que já causou relatório/caixa/dashboard não baterem entre si mais de uma vez.
const BRT_OFFSET_MS = -3 * 60 * 60 * 1000

function agoraBRT() {
  return new Date(Date.now() + BRT_OFFSET_MS)
}

function getIntervaloHoje() {
  const brt = agoraBRT()
  const y = brt.getUTCFullYear(), m = brt.getUTCMonth(), d = brt.getUTCDate()
  return {
    inicio: new Date(Date.UTC(y, m, d, 3, 0, 0, 0)),
    fim:    new Date(Date.UTC(y, m, d + 1, 2, 59, 59, 999)),
  }
}

function getIntervaloOntem() {
  const brt = agoraBRT()
  const y = brt.getUTCFullYear(), m = brt.getUTCMonth(), d = brt.getUTCDate()
  return {
    inicio: new Date(Date.UTC(y, m, d - 1, 3, 0, 0, 0)),
    fim:    new Date(Date.UTC(y, m, d, 2, 59, 59, 999)),
  }
}

function getIntervaloMes() {
  const brt = agoraBRT()
  const y = brt.getUTCFullYear(), m = brt.getUTCMonth()
  return {
    inicio: new Date(Date.UTC(y, m, 1, 3, 0, 0, 0)),
    fim:    new Date(Date.UTC(y, m + 1, 1, 2, 59, 59, 999)),
  }
}

// Normaliza uma data "fim" (query param) pro fim-do-dia em BRT, SEM usar
// setHours (que muta na hora local do processo — UTC no servidor — e desfaz
// qualquer offset -03:00 que o valor já trouxesse). Se `fim` já é uma
// data-hora completa (ex: enviada como YYYY-MM-DDTHH:mm:ss-03:00 pelo
// frontend), usa exatamente o instante recebido. Se for só uma data
// (YYYY-MM-DD), completa com 23:59:59 do fuso de Brasília.
function fimDoDiaBRT(fim) {
  if (!fim) return null
  const somenteData = /^\d{4}-\d{2}-\d{2}$/.test(fim)
  return somenteData ? new Date(`${fim}T23:59:59.999-03:00`) : new Date(fim)
}

// Mesma ideia pro início: completa com 00:00:00 de Brasília quando só vem a data.
function inicioDoDiaBRT(inicio) {
  if (!inicio) return null
  const somenteData = /^\d{4}-\d{2}-\d{2}$/.test(inicio)
  return somenteData ? new Date(`${inicio}T00:00:00.000-03:00`) : new Date(inicio)
}

// Dia de calendário (YYYY-MM-DD) em horário de Brasília pra uma data qualquer —
// usar `.toISOString().split('T')[0]` direto agrupa uma venda das 22h de BRT
// (01h UTC do dia seguinte) no dia errado num gráfico "por dia".
function diaBRT(data) {
  const brt = new Date(new Date(data).getTime() + BRT_OFFSET_MS)
  const y = brt.getUTCFullYear(), m = String(brt.getUTCMonth() + 1).padStart(2, '0'), d = String(brt.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

module.exports = { BRT_OFFSET_MS, agoraBRT, getIntervaloHoje, getIntervaloOntem, getIntervaloMes, fimDoDiaBRT, inicioDoDiaBRT, diaBRT }
