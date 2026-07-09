// Gerador do XML da NFC-e (Modelo 65, versão 4.00)
// Baseado no Manual de Orientação do Contribuinte - SEFAZ

const { gerarChave } = require('./chave')

const FORMA_PGTO = {
  dinheiro: '01', credito: '03', debito: '04',
  pix: '17', boleto: '15', fiado: '99', colaborador: '99', misto: '99',
}

const UNIDADE_MAP = { un: 'UN', kg: 'KG', g: 'G', l: 'L', ml: 'ML', cx: 'CX', pct: 'PCT' }

function fmt2(n)  { return Number(n).toFixed(2) }
function fmt4(n)  { return Number(n).toFixed(4) }
function fmt10(n) { return Number(n).toFixed(10) }
function limpa(s) { return String(s || '').replace(/\D/g, '') }
function esc(s)   { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;') }

function formatDataHora(d) {
  const dt = d instanceof Date ? d : new Date(d)
  const offset = '-03:00'
  const pad = n => String(n).padStart(2, '0')
  return `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}${offset}`
}

function buildItem(item, idx, config) {
  const p     = item.produto || {}
  const ncm   = (p.ncm || '00000000').replace(/\D/g,'').padEnd(8,'0').slice(0,8)
  const cfop  = p.cfop  || '5102'
  const csosn = p.csosn || '400'
  const orig  = p.origemProduto ?? 0
  const un    = UNIDADE_MAP[p.unidade] || 'UN'
  const qty   = Number(item.quantidade)
  const vUnit = Number(item.precoUnitario)
  const vBruto = Number(fmt2(qty * vUnit))

  // ICMS Simples Nacional — CSOSN 400 (não tributado)
  let icmsXml = ''
  if (['102','400','500','900'].includes(csosn)) {
    icmsXml = `<ICMSSN400><orig>${orig}</orig><CSOSN>${csosn}</CSOSN></ICMSSN400>`
  } else {
    // Regime normal — ICMS tributado (simplificado)
    icmsXml = `<ICMS00><orig>${orig}</orig><CST>00</CST><modBC>3</modBC><vBC>${fmt2(vBruto)}</vBC><pICMS>12.00</pICMS><vICMS>${fmt2(vBruto*0.12)}</vICMS></ICMS00>`
  }

  return `<det nItem="${idx+1}">
  <prod>
    <cProd>${esc(limpa(p.codigoBarras || String(p._id).slice(-8)))}</cProd>
    <cEAN>SEM GTIN</cEAN>
    <xProd>${esc(item.nomeProduto.slice(0,120))}</xProd>
    <NCM>${ncm}</NCM>
    <CFOP>${cfop}</CFOP>
    <uCom>${un}</uCom>
    <qCom>${fmt4(qty)}</qCom>
    <vUnCom>${fmt10(vUnit)}</vUnCom>
    <vProd>${fmt2(vBruto)}</vProd>
    <cEANTrib>SEM GTIN</cEANTrib>
    <uTrib>${un}</uTrib>
    <qTrib>${fmt4(qty)}</qTrib>
    <vUnTrib>${fmt10(vUnit)}</vUnTrib>
    <indTot>1</indTot>
  </prod>
  <imposto>
    <ICMS>${icmsXml}</ICMS>
    <PIS><PISAliq><CST>07</CST><vBC>${fmt2(0)}</vBC><pPIS>${fmt4(0)}</pPIS><vPIS>${fmt2(0)}</vPIS></PISAliq></PIS>
    <COFINS><COFINSAliq><CST>07</CST><vBC>${fmt2(0)}</vBC><pCOFINS>${fmt4(0)}</pCOFINS><vCOFINS>${fmt2(0)}</vCOFINS></COFINSAliq></COFINS>
  </imposto>
</det>`
}

function buildFormasPgto(venda) {
  const total = fmt2(venda.total)
  if (venda.formaPagamento === 'misto' && venda.formasPagamento?.length) {
    return venda.formasPagamento
      .filter(f => f.valor > 0)
      .map(f => `<detPag><tPag>${FORMA_PGTO[f.metodo]||'99'}</tPag><vPag>${fmt2(f.valor)}</vPag></detPag>`)
      .join('\n') + `\n<vTroco>${fmt2(0)}</vTroco>`
  }
  const troco = venda.formaPagamento === 'dinheiro' && venda.troco > 0 ? venda.troco : 0
  const recebido = Number(venda.total) + Number(troco)
  return `<detPag><tPag>${FORMA_PGTO[venda.formaPagamento]||'99'}</tPag><vPag>${fmt2(recebido)}</vPag></detPag>\n<vTroco>${fmt2(troco)}</vTroco>`
}

function buildXml(venda, config, numero) {
  const emit = config
  const cnpj = limpa(emit.cnpj || emit.cnpjNFe || '')
  const ie   = limpa(emit.nfce?.inscricaoEstadual || '').slice(0,14)
  const uf   = emit.nfce?.uf || 'SP'
  const crt  = emit.crt || '1' // 1=Simples, 3=Normal
  const serie = String(emit.serieNFCe || '1').padStart(3, '0')

  const agora = new Date()
  const { chave, cNF } = gerarChave({ uf, cnpj, serie, numero, dataEmissao: agora })
  const Id = `NFe${chave}`

  const vProd   = venda.itens.reduce((s, i) => s + i.quantidade * i.precoUnitario, 0)
  const vDesc   = venda.desconto || 0
  const vNF     = venda.total

  const itensXml = venda.itens.map((item, idx) => buildItem(item, idx, config)).join('\n')
  const pgtoXml  = buildFormasPgto(venda)

  // Endereço do emitente (obrigatório)
  const end = emit.nfce?.endereco || {}

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<NFe xmlns="http://www.portalfiscal.inf.br/nfe">
  <infNFe Id="${Id}" versao="4.00">
    <ide>
      <cUF>${String(require('./chave').UF_CODE[uf]||35)}</cUF>
      <cNF>${cNF}</cNF>
      <natOp>Venda ao consumidor</natOp>
      <mod>65</mod>
      <serie>${serie}</serie>
      <nNF>${String(numero).padStart(9,'0')}</nNF>
      <dhEmi>${formatDataHora(agora)}</dhEmi>
      <tpNF>1</tpNF>
      <idDest>1</idDest>
      <cMunFG>${end.codigoMunicipio || '3550308'}</cMunFG>
      <tpImp>4</tpImp>
      <tpEmis>1</tpEmis>
      <cDV>${chave.slice(-1)}</cDV>
      <tpAmb>${emit.nfce?.ambiente === 'producao' ? '1' : '2'}</tpAmb>
      <finNFe>1</finNFe>
      <indFinal>1</indFinal>
      <indPres>1</indPres>
      <procEmi>0</procEmi>
      <verProc>1.0.0</verProc>
    </ide>
    <emit>
      <CNPJ>${cnpj}</CNPJ>
      <xNome>${esc(emit.nomeLoja || 'Empresa').slice(0,60)}</xNome>
      <enderEmit>
        <xLgr>${esc(end.logradouro || 'Rua').slice(0,60)}</xLgr>
        <nro>${esc(end.numero || 'S/N').slice(0,60)}</nro>
        <xBairro>${esc(end.bairro || 'Centro').slice(0,60)}</xBairro>
        <cMun>${end.codigoMunicipio || '3550308'}</cMun>
        <xMun>${esc(end.municipio || 'São Paulo').slice(0,60)}</xMun>
        <UF>${uf}</UF>
        <CEP>${limpa(end.cep || '01001000').padStart(8,'0').slice(0,8)}</CEP>
        <cPais>1058</cPais>
        <xPais>Brasil</xPais>
        ${emit.telefone ? `<fone>${limpa(emit.telefone).slice(0,11)}</fone>` : ''}
      </enderEmit>
      <IE>${ie}</IE>
      <CRT>${crt}</CRT>
    </emit>
    ${itensXml}
    <total>
      <ICMSTot>
        <vBC>${fmt2(0)}</vBC>
        <vICMS>${fmt2(0)}</vICMS>
        <vICMSDeson>${fmt2(0)}</vICMSDeson>
        <vFCPUFDest>${fmt2(0)}</vFCPUFDest>
        <vICMSUFDest>${fmt2(0)}</vICMSUFDest>
        <vICMSUFRemet>${fmt2(0)}</vICMSUFRemet>
        <vFCP>${fmt2(0)}</vFCP>
        <vBCST>${fmt2(0)}</vBCST>
        <vST>${fmt2(0)}</vST>
        <vFCPST>${fmt2(0)}</vFCPST>
        <vFCPSTRet>${fmt2(0)}</vFCPSTRet>
        <vProd>${fmt2(vProd)}</vProd>
        <vFrete>${fmt2(0)}</vFrete>
        <vSeg>${fmt2(0)}</vSeg>
        <vDesc>${fmt2(vDesc)}</vDesc>
        <vII>${fmt2(0)}</vII>
        <vIPI>${fmt2(0)}</vIPI>
        <vIPIDevol>${fmt2(0)}</vIPIDevol>
        <vPIS>${fmt2(0)}</vPIS>
        <vCOFINS>${fmt2(0)}</vCOFINS>
        <vOutro>${fmt2(0)}</vOutro>
        <vNF>${fmt2(vNF)}</vNF>
      </ICMSTot>
    </total>
    <transp>
      <modFrete>9</modFrete>
    </transp>
    <pag>
      ${pgtoXml}
    </pag>
    <infAdic>
      <infCpl>${esc((venda.observacao || '').slice(0,500))}</infCpl>
    </infAdic>
  </infNFe>
</NFe>`

  return { xml, chave, cNF }
}

module.exports = { buildXml }
