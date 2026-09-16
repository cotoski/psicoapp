// Documento de faturamento (prévia de nota/recibo) — funções puras.
// Modelado na NFS-e do exemplo (docs: NFS-e Presidente Prudente), mas é
// documento INTERNO — emissão fiscal real exige integração municipal.
import { calcularImpostos, type Regime } from '../tax/taxCalculations.js'

const POR_EXTENSO = [
  '', 'UM', 'DOIS', 'TRÊS', 'QUATRO', 'CINCO', 'SEIS', 'SETE', 'OITO', 'NOVE',
  'DEZ', 'ONZE', 'DOZE', 'TREZE', 'CATORZE', 'QUINZE', 'DEZESSEIS',
  'DEZESSETE', 'DEZOITO', 'DEZENOVE', 'VINTE',
] as const

export function quantidadePorExtenso(n: number): string {
  return POR_EXTENSO[n] ?? String(n)
}

export interface NotaSession {
  id: string
  startsAt: string
  valor: number
}

export interface NotaInput {
  prestador: {
    nome: string
    responsavel?: string | null
    crp?: string | null
    cnpj?: string | null
    inscricaoMunicipal?: string | null
    endereco?: string | null
    email?: string | null
    telefone?: string | null
  }
  tomador: { nome: string; cpf: string | null; email: string | null; telefone: string | null }
  sessoes: NotaSession[]
  regime: Regime | null
  municipio: string | null
  competencia: string // YYYY-MM
  emitidaEm: Date
}

export interface TributoLinha {
  label: string
  valor: number
}

export interface NotaDocumento {
  prestador: NotaInput['prestador']
  tomador: NotaInput['tomador']
  competencia: string
  emitidaEm: string
  itens: { descricao: string; data: string; quantidade: number; valorUnitario: number; valorTotal: number }[]
  discriminacao: string
  valorBruto: number
  tributos: { regime: string | null; municipio: string | null; issAliquota: number; linhas: TributoLinha[]; total: number } | null
  valorLiquido: number
}

function ddmm(iso: string): string {
  const d = new Date(iso)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}`
}

function intReais(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(2).replace('.', ',')
}

// Discriminação no estilo da NFS-e exemplo:
// "SERVIÇOS PRESTADOS REFERENTES A DOIS (2) ATENDIMENTOS PSICOLÓGICOS NO
//  VALOR DE 290 REAIS CADA SESSÃO NAS SEGUINTES DATAS: 07/08 E 21/08.
//  TOTAL: 580 REAIS."
export function buildDiscriminacao(sessoes: NotaSession[]): string {
  const n = sessoes.length
  const datas = sessoes.map((s) => ddmm(s.startsAt)).join(' E ')
  const total = sessoes.reduce((s, x) => s + x.valor, 0)
  const valores = [...new Set(sessoes.map((s) => s.valor))]

  const detalhe =
    valores.length === 1
      ? `NO VALOR DE ${intReais(valores[0])} REAIS CADA SESSÃO`
      : `NOS VALORES DE ${sessoes.map((s) => `${ddmm(s.startsAt)}: ${intReais(s.valor)} REAIS`).join('; ')}`

  return (
    `SERVIÇOS PRESTADOS REFERENTES A ${quantidadePorExtenso(n)} (${n}) ` +
    `ATENDIMENTO${n > 1 ? 'S' : ''} PSICOLÓGICO${n > 1 ? 'S' : ''} ` +
    `${detalhe} NAS SEGUINTES DATAS: ${datas}. TOTAL: ${intReais(total)} REAIS.`
  )
}

const TRIBUTO_LABELS: Record<string, string> = {
  iss: 'ISS',
  irpf: 'IRPF',
  inss: 'INSS',
  das: 'DAS (Simples Nacional)',
  irpj: 'IRPJ',
  piscofins: 'PIS/COFINS',
}

export function buildNota(input: NotaInput): NotaDocumento {
  const valorBruto = input.sessoes.reduce((s, x) => s + x.valor, 0)

  let tributos: NotaDocumento['tributos'] = null
  if (input.regime) {
    const imp = calcularImpostos(valorBruto, input.municipio ?? 'sp')
    const porRegime = imp[input.regime]
    const issAliquota =
      valorBruto > 0 ? (porRegime.iss ?? 0) / valorBruto : 0
    const linhas = Object.entries(porRegime)
      .filter(([k]) => k !== 'total')
      .map(([k, v]) => ({ label: TRIBUTO_LABELS[k] ?? k.toUpperCase(), valor: v }))
      .filter((l) => l.valor > 0)
    tributos = {
      regime: input.regime,
      municipio: input.municipio,
      issAliquota,
      linhas,
      total: porRegime.total,
    }
  }

  return {
    prestador: input.prestador,
    tomador: input.tomador,
    competencia: input.competencia,
    emitidaEm: input.emitidaEm.toISOString(),
    itens: input.sessoes.map((s) => ({
      descricao: 'Atendimento psicológico',
      data: ddmm(s.startsAt),
      quantidade: 1,
      valorUnitario: s.valor,
      valorTotal: s.valor,
    })),
    discriminacao: buildDiscriminacao(input.sessoes),
    valorBruto,
    tributos,
    valorLiquido: valorBruto - (tributos?.total ?? 0),
  }
}
