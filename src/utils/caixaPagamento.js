const CAMPO_FORMA = {
  dinheiro: 'totalDinheiro', pix: 'totalPix', debito: 'totalDebito',
  credito: 'totalCredito', fiado: 'totalFiado', misto: 'totalMisto',
  boleto: 'totalBoleto', colaborador: 'totalColaborador',
}

// Monta o $inc dos totais do caixa por forma de pagamento. Pagamento misto não entra inteiro
// no balde "totalMisto" — cada parcela (formasPagamento[].valor, que soma exatamente o total)
// incrementa o total do método real (dinheiro em totalDinheiro, pix em totalPix etc), senão a
// conferência do caixa por forma de pagamento nunca bate com o que foi realmente recebido.
function incrementosPorForma(formaPagamento, formasPagamento, total, sinal = 1) {
  const inc = {}
  if (formaPagamento === 'misto' && formasPagamento?.length) {
    for (const fp of formasPagamento) {
      const campo = CAMPO_FORMA[fp.metodo] || 'totalMisto'
      inc[campo] = (inc[campo] || 0) + sinal * (fp.valor || 0)
    }
  } else {
    const campo = CAMPO_FORMA[formaPagamento] || 'totalMisto'
    inc[campo] = (inc[campo] || 0) + sinal * total
  }
  return inc
}

module.exports = { CAMPO_FORMA, incrementosPorForma }
