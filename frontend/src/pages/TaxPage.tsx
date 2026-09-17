import { useEffect, useState, type FormEvent } from 'react'
import { apiGet, apiPost, apiPut, ApiError } from '../api/client'
import { FatorRCalculator } from '../components/tributary/FatorRCalculator'
import { Alert } from '../components/ui/Alert'
import { Button } from '../components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { Input, Select } from '../components/ui/Input'
import { Loading } from '../components/ui/LoadingState'
import { PageHeader } from '../components/ui/PageHeader'
import { Table, type Column } from '../components/ui/Table'
import { fmtMoney } from '../utils/format'

type Regime = 'pf' | 'simples' | 'presumido'

interface TaxConfig {
  regime: Regime | null
  municipio: string | null
  faturamentoAnual: number | null
  folhaPagamentoAnual: number | null
  prolaboreAnual: number | null
}

interface RegimeResult {
  iss?: number
  irpf?: number
  inss?: number
  das?: number
  irpj?: number
  piscofins?: number
  total: number
}

type SimulateResponse = Partial<Record<Regime, RegimeResult>>

const REGIME_LABEL: Record<Regime, string> = {
  pf: 'Pessoa Física',
  simples: 'Simples Nacional',
  presumido: 'Lucro Presumido',
}

const MUNICIPIOS = [
  { value: 'sp', label: 'São Paulo (ISS 2%)' },
  { value: 'rj', label: 'Rio de Janeiro (ISS 3%)' },
  { value: 'mg', label: 'Minas Gerais (ISS 2,5%)' },
  { value: 'ba', label: 'Bahia (ISS 5%)' },
]

interface SimRow {
  id: string
  regime: string
  linhas: [string, number][]
  total: number
}

export function TaxPage() {
  const [config, setConfig] = useState<TaxConfig | null>(null)
  const [cfgForm, setCfgForm] = useState({
    regime: '',
    municipio: 'sp',
    faturamentoAnual: '',
    folhaPagamentoAnual: '',
    prolaboreAnual: '',
  })
  const [cfgSaved, setCfgSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [simValor, setSimValor] = useState('')
  const [simMunicipio, setSimMunicipio] = useState('sp')
  const [simRegime, setSimRegime] = useState('')
  const [simRows, setSimRows] = useState<SimRow[]>([])
  const [simBusy, setSimBusy] = useState(false)

  useEffect(() => {
    apiGet<TaxConfig>('/tax/config')
      .then((c) => {
        setConfig(c)
        setCfgForm({
          regime: c.regime ?? '',
          municipio: c.municipio ?? 'sp',
          faturamentoAnual: c.faturamentoAnual != null ? String(c.faturamentoAnual) : '',
          folhaPagamentoAnual: c.folhaPagamentoAnual != null ? String(c.folhaPagamentoAnual) : '',
          prolaboreAnual: c.prolaboreAnual != null ? String(c.prolaboreAnual) : '',
        })
      })
      .catch(() => setError('Não foi possível carregar a configuração tributária.'))
      .finally(() => setLoading(false))
  }, [])

  async function saveConfig(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setCfgSaved(false)
    const body: Record<string, unknown> = {}
    if (cfgForm.regime) body.regime = cfgForm.regime
    if (cfgForm.municipio) body.municipio = cfgForm.municipio
    const num = (v: string) => (v.trim() ? Number(v) : undefined)
    if (num(cfgForm.faturamentoAnual) !== undefined) body.faturamentoAnual = num(cfgForm.faturamentoAnual)
    if (num(cfgForm.folhaPagamentoAnual) !== undefined) body.folhaPagamentoAnual = num(cfgForm.folhaPagamentoAnual)
    if (num(cfgForm.prolaboreAnual) !== undefined) body.prolaboreAnual = num(cfgForm.prolaboreAnual)
    try {
      setConfig(await apiPut<TaxConfig>('/tax/config', body))
      setCfgSaved(true)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível salvar.')
    }
  }

  async function simulate(e: FormEvent) {
    e.preventDefault()
    setSimBusy(true)
    setError(null)
    try {
      const res = await apiPost<SimulateResponse>('/tax/simulate', {
        valor: Number(simValor),
        municipio: simMunicipio,
        ...(simRegime ? { regime: simRegime } : {}),
      })
      setSimRows(
        (Object.entries(res) as [Regime, RegimeResult][]).map(([regime, r]) => ({
          id: regime,
          regime: REGIME_LABEL[regime],
          linhas: Object.entries(r).filter(([k]) => k !== 'total') as [string, number][],
          total: r.total,
        })),
      )
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Simulação falhou.')
    } finally {
      setSimBusy(false)
    }
  }

  const columns: Column<SimRow>[] = [
    { header: 'Regime', render: (r) => r.regime },
    {
      header: 'Componentes',
      render: (r) => r.linhas.map(([k, v]) => `${k.toUpperCase()} ${fmtMoney(v)}`).join(' · '),
    },
    { header: 'Total por sessão', render: (r) => fmtMoney(r.total) },
  ]

  if (loading) return <Loading />

  return (
    <div className="max-w-3xl">
      <PageHeader title="Tributos" />
      {error && <Alert className="mb-4">{error}</Alert>}
      {cfgSaved && <Alert tone="success" className="mb-4">Configuração salva.</Alert>}

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Configuração do consultório</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={saveConfig}>
              <div className="grid gap-x-4 sm:grid-cols-2">
                <Select
                  label="Regime tributário"
                  name="regime"
                  value={cfgForm.regime}
                  onChange={(e) => setCfgForm((f) => ({ ...f, regime: e.target.value }))}
                  options={[
                    { value: '', label: '—' },
                    { value: 'pf', label: 'Pessoa Física' },
                    { value: 'simples', label: 'Simples Nacional' },
                    { value: 'presumido', label: 'Lucro Presumido' },
                  ]}
                />
                <Select
                  label="Município (ISS)"
                  name="municipio"
                  value={cfgForm.municipio}
                  onChange={(e) => setCfgForm((f) => ({ ...f, municipio: e.target.value }))}
                  options={MUNICIPIOS}
                />
              </div>
              <Input
                label="Faturamento anual (R$)"
                name="fat"
                type="number" min={0} step="0.01"
                value={cfgForm.faturamentoAnual}
                onChange={(e) => setCfgForm((f) => ({ ...f, faturamentoAnual: e.target.value }))}
              />
              <div className="grid gap-x-4 sm:grid-cols-2">
                <Input
                  label="Folha de pagamento anual (R$)"
                  name="folha"
                  type="number" min={0} step="0.01"
                  value={cfgForm.folhaPagamentoAnual}
                  onChange={(e) => setCfgForm((f) => ({ ...f, folhaPagamentoAnual: e.target.value }))}
                />
                <Input
                  label="Pró-labore anual (R$)"
                  name="prolabore"
                  type="number" min={0} step="0.01"
                  value={cfgForm.prolaboreAnual}
                  onChange={(e) => setCfgForm((f) => ({ ...f, prolaboreAnual: e.target.value }))}
                />
              </div>
              <Button type="submit" size="sm">Salvar configuração</Button>
            </form>
          </CardContent>
        </Card>

        <FatorRCalculator
          defaultFaturamento={config?.faturamentoAnual}
          defaultFolha={config?.folhaPagamentoAnual}
        />

        <Card>
          <CardHeader>
            <CardTitle>Simulador por sessão</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={simulate}>
              <div className="grid gap-x-4 sm:grid-cols-3">
                <Input
                  label="Valor da sessão (R$)"
                  name="valor"
                  type="number" min={0} step="0.01"
                  value={simValor}
                  onChange={(e) => setSimValor(e.target.value)}
                  required
                />
                <Select
                  label="Município (ISS)"
                  name="simMunicipio"
                  value={simMunicipio}
                  onChange={(e) => setSimMunicipio(e.target.value)}
                  options={MUNICIPIOS}
                />
                <Select
                  label="Regime (vazio = todos)"
                  name="simRegime"
                  value={simRegime}
                  onChange={(e) => setSimRegime(e.target.value)}
                  options={[
                    { value: '', label: 'Todos' },
                    { value: 'pf', label: 'Pessoa Física' },
                    { value: 'simples', label: 'Simples Nacional' },
                    { value: 'presumido', label: 'Lucro Presumido' },
                  ]}
                />
              </div>
              <Button type="submit" size="sm" disabled={simBusy}>
                {simBusy ? 'Simulando…' : 'Simular'}
              </Button>
            </form>
            {simRows.length > 0 && (
              <div className="mt-5">
                <Table columns={columns} rows={simRows} />
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
