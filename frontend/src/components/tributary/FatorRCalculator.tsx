import { useState, type FormEvent } from 'react'
import { apiPost, ApiError } from '../../api/client'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { Input } from '../ui/Input'
import { fmtMoney } from '../../utils/format'

interface FatorRResponse {
  fatorR: number
  anexo: 'III' | 'V'
  aliquotaEfetivaEstimada: number
  atingiuLimiar: boolean
  simulacao: {
    prolaboreAnualNecessario: number
    prolaboreAdicionalNecessario: number
    economiaAnualEstimada: number
  } | null
}

export function FatorRCalculator({
  defaultFaturamento,
  defaultFolha,
}: {
  defaultFaturamento?: number | null
  defaultFolha?: number | null
}) {
  const [faturamento, setFaturamento] = useState(
    defaultFaturamento != null ? String(defaultFaturamento) : '',
  )
  const [folha, setFolha] = useState(
    defaultFolha != null ? String(defaultFolha) : '',
  )
  const [result, setResult] = useState<FatorRResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      setResult(
        await apiPost<FatorRResponse>('/tax/fator-r', {
          faturamentoAnual: Number(faturamento),
          folhaPagamentoAnual: Number(folha) || 0,
        }),
      )
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Cálculo falhou.')
      setResult(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <h2 className="section-subtitle">Calculadora Fator R</h2>
      <form onSubmit={onSubmit}>
        <Input
          label="Faturamento anual (R$)"
          name="faturamento"
          type="number"
          min={0}
          step="0.01"
          value={faturamento}
          onChange={(e) => setFaturamento(e.target.value)}
          required
        />
        <Input
          label="Folha de pagamento anual — inclui pró-labore (R$)"
          name="folha"
          type="number"
          min={0}
          step="0.01"
          value={folha}
          onChange={(e) => setFolha(e.target.value)}
        />
        <Button type="submit" small disabled={busy}>
          {busy ? 'Calculando…' : 'Calcular'}
        </Button>
      </form>

      {error && <div className="alert-error" style={{ marginTop: 8 }}>{error}</div>}

      {result && (
        <div style={{ marginTop: '1rem' }}>
          <div className="metrics-grid">
            <div className="metric-card">
              <div className="metric-label">Fator R</div>
              <div className="metric-value">{(result.fatorR * 100).toFixed(2)}%</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Anexo</div>
              <div className="metric-value">
                <Badge tone={result.atingiuLimiar ? 'success' : 'warning'}>
                  Anexo {result.anexo}
                </Badge>
              </div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Alíquota estimada</div>
              <div className="metric-value">
                {(result.aliquotaEfetivaEstimada * 100).toFixed(1)}%
              </div>
            </div>
          </div>
          {result.atingiuLimiar ? (
            <p className="section-subtitle">
              Fator R ≥ 28% — tributação pelo Anexo III (mais favorável).
            </p>
          ) : (
            result.simulacao && (
              <div className="alert-error" style={{ background: 'var(--bg-warning)', color: 'var(--text-warning)' }}>
                Para atingir o Anexo III: pró-labore anual de{' '}
                <strong>{fmtMoney(result.simulacao.prolaboreAnualNecessario)}</strong>
                {result.simulacao.prolaboreAdicionalNecessario > 0 && (
                  <>
                    {' '}(+{fmtMoney(result.simulacao.prolaboreAdicionalNecessario)} ao ano)
                  </>
                )}
                . Economia estimada:{' '}
                <strong>{fmtMoney(result.simulacao.economiaAnualEstimada)}/ano</strong>.
              </div>
            )
          )}
        </div>
      )}
    </Card>
  )
}
