import { useState, type FormEvent } from 'react'
import { apiPost, ApiError } from '../../api/client'
import { Alert } from '../ui/Alert'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Card, CardContent, CardHeader, CardTitle, MetricCard } from '../ui/Card'
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
      <CardHeader>
        <CardTitle>Calculadora Fator R</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit}>
          <div className="grid gap-x-4 sm:grid-cols-2">
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
          </div>
          <Button type="submit" size="sm" disabled={busy}>
            {busy ? 'Calculando…' : 'Calcular'}
          </Button>
        </form>

        {error && <Alert className="mt-4">{error}</Alert>}

        {result && (
          <div className="mt-5">
            <div className="grid grid-cols-3 gap-4">
              <MetricCard label="Fator R" value={`${(result.fatorR * 100).toFixed(2)}%`} />
              <MetricCard
                label="Anexo"
                value={
                  <Badge tone={result.atingiuLimiar ? 'success' : 'warning'}>
                    Anexo {result.anexo}
                  </Badge>
                }
              />
              <MetricCard
                label="Alíquota estimada"
                value={`${(result.aliquotaEfetivaEstimada * 100).toFixed(1)}%`}
              />
            </div>
            {result.atingiuLimiar ? (
              <p className="mt-4 text-sm text-muted-foreground">
                Fator R ≥ 28% — tributação pelo Anexo III (mais favorável).
              </p>
            ) : (
              result.simulacao && (
                <Alert tone="warning" className="mt-4">
                  Para atingir o Anexo III: pró-labore anual de{' '}
                  <strong>{fmtMoney(result.simulacao.prolaboreAnualNecessario)}</strong>
                  {result.simulacao.prolaboreAdicionalNecessario > 0 && (
                    <> (+{fmtMoney(result.simulacao.prolaboreAdicionalNecessario)} ao ano)</>
                  )}
                  . Economia estimada:{' '}
                  <strong>{fmtMoney(result.simulacao.economiaAnualEstimada)}/ano</strong>.
                </Alert>
              )
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
