import { useCallback, useEffect, useState } from 'react'
import { Banknote, Printer, Receipt } from 'lucide-react'
import { apiGet, apiPost, ApiError } from '../api/client'
import { NotaDocCard, type NotaDoc } from '../components/billing/NotaDoc'
import { Alert } from '../components/ui/Alert'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle, MetricCard } from '../components/ui/Card'
import { fieldClass } from '../components/ui/Input'
import { Empty, Loading } from '../components/ui/LoadingState'
import { PageHeader } from '../components/ui/PageHeader'
import { cn } from '../lib/utils'
import { fmtDateTime, fmtMoney } from '../utils/format'

interface PendingSession {
  id: string
  startsAt: string
  status: string
  valor: number
  faturada: boolean
}

interface PendingGroup {
  id: string
  nome: string
  tipoFaturamento: string
  qtdSessoesNota: number
  sessoes: PendingSession[]
  pendente: number
  valorTotal: number
  pronto: boolean
}

interface Summary {
  total: number
  realizadas: number
  canceladas: number
  noShows: number
  faturado: number
  pendenteFaturamento: number
}

interface InvoiceResult {
  total: number
  sessoes: {
    id: string
    startsAt: string
    valor: number
    pacienteNome: string
    pacienteEmail: string | null
    pacienteTelefone: string | null
  }[]
  notas: NotaDoc[]
}

interface InvoicedResult {
  month: string
  total: number
  notas: NotaDoc[]
}

function currentMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const checkboxClass = 'size-4 shrink-0 accent-[oklch(0.51_0.09_175)]'

export function FinancePage() {
  const [groups, setGroups] = useState<PendingGroup[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [month, setMonth] = useState(currentMonth())
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [invoice, setInvoice] = useState<InvoiceResult | null>(null)
  const [invoiced, setInvoiced] = useState<InvoicedResult | null>(null)
  const [openNota, setOpenNota] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    Promise.all([
      apiGet<PendingGroup[]>('/billing/pending'),
      apiGet<Summary>(`/finance/summary?month=${month}`),
      apiGet<InvoicedResult>(`/billing/invoiced?month=${month}`),
    ])
      .then(([g, s, i]) => {
        setGroups(g)
        setSummary(s)
        setInvoiced(i)
        setSelected(new Set())
        setInvoice(null)
        setOpenNota(null)
      })
      .catch(() => setError('Não foi possível carregar o financeiro.'))
      .finally(() => setLoading(false))
  }, [month])

  useEffect(load, [load])

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleGroup(g: PendingGroup) {
    const ids = g.sessoes.map((s) => s.id)
    const all = ids.every((id) => selected.has(id))
    setSelected((s) => {
      const next = new Set(s)
      for (const id of ids) {
        if (all) next.delete(id)
        else next.add(id)
      }
      return next
    })
  }

  const selectedTotal = groups
    .flatMap((g) => g.sessoes)
    .filter((s) => selected.has(s.id))
    .reduce((sum, s) => sum + s.valor, 0)

  async function faturar() {
    if (selected.size === 0) return
    setBusy(true)
    setError(null)
    try {
      setInvoice(
        await apiPost<InvoiceResult>('/billing/invoice', {
          appointmentIds: [...selected],
        }),
      )
      load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Faturamento falhou.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <PageHeader title="Financeiro">
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className={cn(fieldClass, 'h-9 w-auto')}
        />
      </PageHeader>

      {error && <Alert className="mb-4">{error}</Alert>}

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Resumo mensal</CardTitle>
        </CardHeader>
        <CardContent>
          {summary && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
              <MetricCard label="Sessões no mês" value={summary.total} />
              <MetricCard label="Realizadas" value={summary.realizadas} />
              <MetricCard label="Canceladas" value={summary.canceladas} />
              <MetricCard label="Faltas" value={summary.noShows} />
              <MetricCard label="Faturado" value={fmtMoney(summary.faturado)} />
              <MetricCard label="A faturar" value={fmtMoney(summary.pendenteFaturamento)} />
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardHeader className="flex-row items-center justify-between gap-3">
          <CardTitle>Pendências do mês corrente</CardTitle>
          <Button size="sm" disabled={busy || selected.size === 0} onClick={faturar}>
            <Banknote />
            {busy ? 'Faturando…' : `Faturar ${selected.size} — ${fmtMoney(selectedTotal)}`}
          </Button>
        </CardHeader>
        <CardContent>
          {loading && <Loading />}
          {!loading && groups.length === 0 && (
            <Empty icon={<Receipt />}>Nenhuma sessão pendente de faturamento este mês.</Empty>
          )}

          <div className="divide-y">
            {groups.map((g) => {
              const all = g.sessoes.every((s) => selected.has(s.id))
              return (
                <div key={g.id} data-testid="pending-group" className="py-4 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-2.5 text-sm font-medium">
                      <input
                        type="checkbox"
                        checked={all}
                        onChange={() => toggleGroup(g)}
                        className={checkboxClass}
                      />
                      {g.nome}
                    </label>
                    <Badge tone={g.pronto ? 'success' : 'warning'}>
                      {g.pronto ? 'Pronto p/ nota' : `${g.pendente}/${g.qtdSessoesNota} sessões`}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {g.tipoFaturamento} · {fmtMoney(g.valorTotal)}
                    </span>
                  </div>
                  <div className="mt-2 space-y-1 pl-7">
                    {g.sessoes.map((s) => (
                      <label
                        key={s.id}
                        className="flex items-center gap-2.5 py-0.5 text-sm text-muted-foreground"
                      >
                        <input
                          type="checkbox"
                          checked={selected.has(s.id)}
                          onChange={() => toggle(s.id)}
                          className={checkboxClass}
                        />
                        {fmtDateTime(s.startsAt)} · {fmtMoney(s.valor)}
                      </label>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {invoice && (
        <Card className="mb-4">
          <CardHeader className="flex-row items-center justify-between gap-3">
            <CardTitle>Notas geradas — {fmtMoney(invoice.total)}</CardTitle>
            <Button size="sm" variant="secondary" onClick={() => window.print()}>
              <Printer />
              Imprimir
            </Button>
          </CardHeader>
          <CardContent>
            <p className="mb-4 text-sm text-muted-foreground">
              Documento interno (prévia no estilo NFS-e) — a emissão fiscal real
              exige integração com a prefeitura.
            </p>
            {(invoice.notas ?? []).length === 0 && (
              <Empty icon={<Receipt />}>
                Nenhuma sessão nova foi faturada (já estavam faturadas).
              </Empty>
            )}
            <div className="space-y-4">
              {(invoice.notas ?? []).map((n, i) => (
                <NotaDocCard key={i} nota={n} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {invoiced && invoiced.notas.length > 0 && (
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-3">
            <CardTitle>
              Faturadas em {invoiced.month} — {fmtMoney(invoiced.total)}
            </CardTitle>
            <Button size="sm" variant="secondary" onClick={() => window.print()}>
              <Printer />
              Imprimir
            </Button>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {invoiced.notas.map((n, i) => (
                <div key={i} className="py-4 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-sm font-medium">{n.tomador.nome}</span>
                    <Badge tone="success">Faturada</Badge>
                    <span className="text-xs text-muted-foreground">
                      {n.itens.length} sessão(ões) · {fmtMoney(n.valorBruto)}
                    </span>
                    <div className="flex-1" />
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setOpenNota(openNota === i ? null : i)}
                    >
                      {openNota === i ? 'Ocultar nota' : 'Ver nota'}
                    </Button>
                  </div>
                  {openNota === i && (
                    <div className="mt-4">
                      <NotaDocCard nota={n} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
