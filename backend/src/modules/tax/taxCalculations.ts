// Funções puras — SPEC_FATOR_R §4 + calculadora por sessão (spec B6).
// Estimativa simplificada: primeira faixa do Simples Nacional (RBT12 até
// R$ 180k). Estrutura em array de faixas para expansão futura (tabela
// progressiva completa) — ver nota §4 da SPEC.

export interface FatorRInput {
  faturamentoAnual: number
  folhaPagamentoAnual: number // inclui pró-labore
}

export interface FatorRResult {
  fatorR: number
  anexo: 'III' | 'V'
  aliquotaEfetivaEstimada: number
  atingiuLimiar: boolean
}

const LIMIAR_FATOR_R = 0.28

// Faixas nominais — só a 1ª implementada; expandir para tabela completa.
const FAIXAS_ANEXO_III = [{ ate: 180_000, aliquota: 0.06 }] as const
const FAIXAS_ANEXO_V = [{ ate: 180_000, aliquota: 0.155 }] as const

function aliquotaFaixa1(faixas: readonly { aliquota: number }[]): number {
  return faixas[0].aliquota
}

export function calcularFatorR(input: FatorRInput): FatorRResult {
  if (input.faturamentoAnual <= 0) {
    throw new Error('Faturamento anual deve ser maior que zero')
  }
  const fatorR = input.folhaPagamentoAnual / input.faturamentoAnual
  const atingiuLimiar = fatorR >= LIMIAR_FATOR_R
  const anexo = atingiuLimiar ? 'III' : 'V'
  const aliquotaEfetivaEstimada = atingiuLimiar
    ? aliquotaFaixa1(FAIXAS_ANEXO_III)
    : aliquotaFaixa1(FAIXAS_ANEXO_V)
  return { fatorR, anexo, aliquotaEfetivaEstimada, atingiuLimiar }
}

export interface SimulacaoAjuste {
  prolaboreAnualNecessario: number
  prolaboreAdicionalNecessario: number
  economiaAnualEstimada: number
}

export function simularAjusteParaAnexoIII(
  faturamentoAnual: number,
  folhaPagamentoAtual: number,
): SimulacaoAjuste {
  // Aritmética inteira: faturamento*0.28 produz float sujo (26880.000…004)
  // que Math.ceil inflaria em +1. ×28÷100 mantém o valor exato.
  const prolaboreAnualNecessario = Math.ceil((faturamentoAnual * 28) / 100)
  const prolaboreAdicionalNecessario = Math.max(
    0,
    prolaboreAnualNecessario - folhaPagamentoAtual,
  )
  const impostoAnexoV = faturamentoAnual * aliquotaFaixa1(FAIXAS_ANEXO_V)
  const impostoAnexoIII = faturamentoAnual * aliquotaFaixa1(FAIXAS_ANEXO_III)
  const economiaAnualEstimada = Math.max(0, impostoAnexoV - impostoAnexoIII)
  return {
    prolaboreAnualNecessario,
    prolaboreAdicionalNecessario,
    economiaAnualEstimada,
  }
}

// --- Calculadora por sessão (legado main.tsx, spec B6) ---

export const TAX_ISS_RATES: Record<string, number> = {
  sp: 0.02,
  rj: 0.03,
  mg: 0.025,
  ba: 0.05,
}
const ISS_DEFAULT = 0.02

export type Regime = 'pf' | 'simples' | 'presumido'

export interface ImpostosPorRegime {
  pf: { iss: number; irpf: number; inss: number; total: number }
  simples: { iss: number; das: number; total: number }
  presumido: { iss: number; irpj: number; piscofins: number; inss: number; total: number }
}

export function calcularImpostos(valor: number, municipio: string): ImpostosPorRegime {
  const iss = TAX_ISS_RATES[municipio] ?? ISS_DEFAULT
  return {
    pf: {
      iss: valor * iss,
      irpf: valor * 0.15,
      inss: valor * 0.1,
      total: valor * (iss + 0.15 + 0.1),
    },
    simples: {
      iss: valor * iss,
      das: valor * 0.07,
      total: valor * (iss + 0.07),
    },
    presumido: {
      iss: valor * iss,
      irpj: valor * 0.072,
      piscofins: valor * 0.0965,
      inss: valor * 0.15,
      total: valor * (iss + 0.072 + 0.0965 + 0.15),
    },
  }
}
