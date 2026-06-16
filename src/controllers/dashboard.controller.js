const Produto = require('../models/Produto')
const Venda = require('../models/Venda')
const Caixa = require('../models/Caixa')
const Cliente = require('../models/Cliente')
const Despesa = require('../models/Despesa')
const Configuracao = require('../models/Configuracao')

// BRT = UTC-3 (Brasil aboliu horário de verão em 2019)
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

const resumo = async (req, res) => {
  try {
    const { inicio: inicioHoje, fim: fimHoje }     = getIntervaloHoje()
    const { inicio: inicioOntem, fim: fimOntem }   = getIntervaloOntem()
    const { inicio: inicioMes,  fim: fimMes }      = getIntervaloMes()

    const brt7diasAtras = new Date(Date.UTC(
      agoraBRT().getUTCFullYear(), agoraBRT().getUTCMonth(), agoraBRT().getUTCDate() - 6, 3, 0, 0, 0
    ))

    const agora = new Date()

    const [vendasHoje, vendasOntem, vendasMes, vendas7dias, caixaAberto, clientesComFiado, despesasHoje, config, produtosAgg, rankingAgg] =
      await Promise.all([
        Venda.find({ createdAt: { $gte: inicioHoje,  $lte: fimHoje  }, cancelada: false }),
        Venda.find({ createdAt: { $gte: inicioOntem, $lte: fimOntem }, cancelada: false }),
        Venda.find({ createdAt: { $gte: inicioMes,   $lte: fimMes   }, cancelada: false }),
        Venda.find({ createdAt: { $gte: brt7diasAtras }, cancelada: false }),
        Caixa.findOne({ status: 'aberto' }).populate('abertoPor', 'nome'),
        Cliente.find({ saldoFiado: { $gt: 0 } }),
        Despesa.find({ createdAt: { $gte: inicioHoje, $lte: fimHoje } }),
        Configuracao.findOne(),
        // Aggregation: conta zerados/baixos/vencendo sem carregar todos os docs
        Produto.aggregate([
          { $match: { ativo: true } },
          { $addFields: {
            diasVenc: { $cond: {
              if: { $and: [{ $ne: ['$validade', null] }, { $gt: ['$validade', new Date(0)] }] },
              then: { $divide: [{ $subtract: ['$validade', agora] }, 86400000] },
              else: null
            }}
          }},
          { $group: {
            _id: null,
            total: { $sum: 1 },
            zerados: { $sum: { $cond: [{ $eq: ['$estoque', 0] }, 1, 0] } },
            baixos:  { $sum: { $cond: [{ $and: [{ $gt: ['$estoque', 0] }, { $lte: ['$estoque', '$estoqueMinimo'] }] }, 1, 0] } },
            vencendo: { $sum: { $cond: [{ $and: [
              { $ne: ['$diasVenc', null] }, { $lte: ['$diasVenc', 5] }, { $gte: ['$diasVenc', 0] }
            ] }, 1, 0] } },
            produtosVencendo: { $push: { $cond: [
              { $and: [{ $ne: ['$diasVenc', null] }, { $lte: ['$diasVenc', 5] }, { $gte: ['$diasVenc', 0] }] },
              { nome: '$nome', dias: { $ceil: '$diasVenc' }, validade: '$validade' },
              '$$REMOVE'
            ] }}
          }}
        ]),
        // Aggregation: ranking de produtos sem processar em JS
        Venda.aggregate([
          { $match: { createdAt: { $gte: inicioHoje, $lte: fimHoje }, cancelada: false } },
          { $unwind: '$itens' },
          { $group: {
            _id: '$itens.produto',
            nome: { $first: '$itens.nomeProduto' },
            quantidade: { $sum: '$itens.quantidade' },
            total: { $sum: '$itens.subtotal' }
          }},
          { $sort: { quantidade: -1 } },
          { $limit: 5 },
          { $project: { _id: 0, nome: 1, quantidade: 1, total: 1 } }
        ])
      ])

    const stats = produtosAgg[0] || { total: 0, zerados: 0, baixos: 0, vencendo: 0, produtosVencendo: [] }

    const totalVendasHoje = vendasHoje.reduce((acc, v) => acc + v.total, 0)
    const totalVendasMes  = vendasMes.reduce((acc, v) => acc + v.total, 0)
    const ticketMedio = vendasHoje.length > 0 ? totalVendasHoje / vendasHoje.length : 0
    const totalOntem = vendasOntem.reduce((acc, v) => acc + v.total, 0)
    const variacaoVendas = totalOntem > 0
      ? Math.round(((totalVendasHoje - totalOntem) / totalOntem) * 100)
      : 0

    const porForma = vendasHoje.reduce((acc, v) => {
      acc[v.formaPagamento] = (acc[v.formaPagamento] || 0) + v.total
      return acc
    }, {})

    const totalFiado = clientesComFiado.reduce((acc, c) => acc + c.saldoFiado, 0)
    const totalDespesasHoje = despesasHoje.reduce((acc, d) => acc + d.valor, 0)

    // Gráfico: últimas 8 horas em horário BRT
    const ultimas8h = []
    const brtAgora = agoraBRT()
    const horaAtualBRT = brtAgora.getUTCHours()

    for (let i = 7; i >= 0; i--) {
      const horaBRT = (horaAtualBRT - i + 24) % 24
      let horaUTCInicio = horaBRT + 3
      let diaOffset = 0
      if (horaUTCInicio >= 24) { horaUTCInicio -= 24; diaOffset = 1 }

      const horaInicio = new Date(Date.UTC(
        brtAgora.getUTCFullYear(), brtAgora.getUTCMonth(),
        brtAgora.getUTCDate() - (horaAtualBRT - i < 0 ? 1 : 0) + diaOffset,
        horaUTCInicio, 0, 0, 0
      ))
      const horaFim = new Date(horaInicio.getTime() + 59 * 60 * 1000 + 59 * 1000 + 999)

      const vendasHora = vendasHoje.filter(v => {
        const d = new Date(v.createdAt)
        return d >= horaInicio && d <= horaFim
      })
      ultimas8h.push({
        hora: `${String(horaBRT).padStart(2,'0')}h`,
        total: vendasHora.reduce((acc, v) => acc + v.total, 0),
        quantidade: vendasHora.length
      })
    }

    // Gráfico: últimos 7 dias em BRT
    const DIAS_PT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
    const brtRef = agoraBRT()
    const grafico7dias = []
    for (let i = 6; i >= 0; i--) {
      const y = brtRef.getUTCFullYear(), m = brtRef.getUTCMonth(), d = brtRef.getUTCDate()
      const inicioDia = new Date(Date.UTC(y, m, d - i, 3, 0, 0, 0))
      const fimDia    = new Date(Date.UTC(y, m, d - i + 1, 2, 59, 59, 999))
      const vendasDia = vendas7dias.filter(v => {
        const vd = new Date(v.createdAt)
        return vd >= inicioDia && vd <= fimDia
      })
      const labelDate = new Date(inicioDia.getTime() + 3 * 60 * 60 * 1000)
      grafico7dias.push({
        dia: i === 0 ? 'Hoje' : DIAS_PT[labelDate.getUTCDay()],
        total: parseFloat(vendasDia.reduce((acc, v) => acc + v.total, 0).toFixed(2)),
        quantidade: vendasDia.length,
      })
    }

    const metaMensal = config?.metaMensal || 0
    const progressoMeta = metaMensal > 0 ? Math.min(100, Math.round((totalVendasMes / metaMensal) * 100)) : 0

    res.json({
      vendas: {
        totalHoje: totalVendasHoje,
        totalMes: totalVendasMes,
        quantidade: vendasHoje.length,
        ticketMedio,
        variacaoVsOntem: variacaoVendas,
        porFormaPagamento: porForma,
        grafico: ultimas8h,
        grafico7dias,
      },
      estoque: {
        zerados: stats.zerados,
        baixos: stats.baixos,
        vencendo: stats.vencendo,
        totalProdutos: stats.total,
        produtosVencendo: stats.produtosVencendo || [],
      },
      caixa: caixaAberto ? {
        aberto: true,
        abertoEm: caixaAberto.abertoEm,
        abertoPor: caixaAberto.abertoPor?.nome,
        saldoInicial: caixaAberto.saldoInicial,
        totalVendas: caixaAberto.totalVendas
      } : { aberto: false },
      financeiro: {
        lucroEstimadoHoje: totalVendasHoje - totalDespesasHoje,
        despesasHoje: totalDespesasHoje,
        fiadoPendente: totalFiado,
        clientesComFiado: clientesComFiado.length
      },
      rankingProdutos: rankingAgg,
      meta: { mensal: metaMensal, totalMes: totalVendasMes, progresso: progressoMeta }
    })
  } catch (error) {
    console.error('Erro no dashboard:', error)
    res.status(500).json({ mensagem: 'Erro ao carregar dashboard' })
  }
}

module.exports = { resumo }
