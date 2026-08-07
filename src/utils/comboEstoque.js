// Estoque disponível de um combo/kit = quantas unidades dá pra montar agora
// com o estoque real dos componentes (o componente mais escasso é o gargalo).
function calcularEstoqueCombo(componentes) {
  if (!Array.isArray(componentes) || componentes.length === 0) return 0
  let disponivel = Infinity
  for (const c of componentes) {
    const estoqueComponente = c.produto?.estoque
    if (estoqueComponente == null || !c.quantidade || c.quantidade <= 0) return 0
    disponivel = Math.min(disponivel, Math.floor(estoqueComponente / c.quantidade))
  }
  return Math.max(0, disponivel)
}

module.exports = { calcularEstoqueCombo }
