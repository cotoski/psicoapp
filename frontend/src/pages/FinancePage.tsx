import { useCallback, useEffect, useState } from 'react'
import { apiGet, apiPost, ApiError } from '../api/client'
import { NotaDocCard, type NotaDoc } from '../components/billing/NotaDoc'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card, MetricCard } from '../components/ui/Card'
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
      <h1 className="section-title">Financeiro</h1>
      {error && <div className="alert-error">{error}</div>}

      <Card>
        <div className="toolbar">
          <h2 className="section-subtitle" style={{ margin: 0 }}>Resumo mensal</h2>
          <div style={{ flex: 1 }} />
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </div>
        {summary && (
          <div className="metrics-grid" style={{ marginBottom: 0 }}>
            <MetricCard label="Sessões no mês" value={summary.total} />
            <MetricCard label="Realizadas" value={summary.realizadas} />
            <MetricCard label="Canceladas" value={summary.canceladas} />
            <MetricCard label="Faltas" value={summary.noShows} />
            <MetricCard label="Faturado" value={fmtMoney(summary.faturado)} />
            <MetricCard label="A faturar" value={fmtMoney(summary.pendenteFaturamento)} />
          </div>
        )}
      </Card>

      <Card>
        <div className="toolbar">
          <h2 className="section-subtitle" style={{ margin: 0 }}>Pendências do mês corrente</h2>
          <div style={{ flex: 1 }} />
          <Button small disabled={busy || selected.size === 0} onClick={faturar}>
            {busy ? 'Faturando…' : `Faturar ${selected.size} selecionada(s) — ${fmtMoney(selectedTotal)}`}
          </Button>
        </div>

        {loading && <div className="loading-state">Carregando…</div>}
        {!loading && groups.length === 0 && (
          <p className="empty-state">Nenhuma sessão pendente de faturamento este mês.</p>
        )}

        {groups.map((g) => {
          const all = g.sessoes.every((s) => selected.has(s.id))
          return (
            <div key={g.id} style={{ borderTop: '0.5px solid var(--border)', paddingTop: '0.75rem', marginTop: '0.75rem' }}>
              <div className="toolbar" style={{ marginBottom: 4 }}>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, fontWeight: 500 }}>
                  <input type="checkbox" checked={all} onChange={() => toggleGroup(g)} />
                  {g.nome}
                </label>
                <Badge tone={g.pronto ? 'success' : 'warning'}>
                  {g.pronto ? 'Pronto p/ nota' : `${g.pendente}/${g.qtdSessoesNota} sessões`}
                </Badge>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  {g.tipoFaturamento} · {fmtMoney(g.valorTotal)}
                </span>
              </div>
              {g.sessoes.map((s) => (
                <label
                  key={s.id}
                  style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, padding: '4px 0 4px 24px', color: 'var(--text-secondary)' }}
                >
                  <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} />
                  {fmtDateTime(s.startsAt)} · {fmtMoney(s.valor)}
                </label>
              ))}
            </div>
          )
        })}
      </Card>

      {invoice && (
        <Card>
          <div className="toolbar">
            <h2 className="section-subtitle" style={{ margin: 0 }}>
              Notas geradas — {fmtMoney(invoice.total)}
            </h2>
            <div style={{ flex: 1 }} />
            <Button small variant="secondary" onClick={() => window.print()}>
              Imprimir
            </Button>
          </div>
          <p className="section-subtitle">
            Documento interno (prévia no estilo NFS-e) — a emissão fiscal real
            exige integração com a prefeitura.
          </p>
          {(invoice.notas ?? []).length === 0 && (
            <p className="empty-state">
              Nenhuma sessão nova foi faturada (já estavam faturadas).
            </p>
          )}
          {(invoice.notas ?? []).map((n, i) => (
            <NotaDocCard key={i} nota={n} />
          ))}
        </Card>
      )}

      {invoiced && invoiced.notas.length > 0 && (
        <Card>
          <div className="toolbar">
            <h2 className="section-subtitle" style={{ margin: 0 }}>
              Faturadas em {invoiced.month} — {fmtMoney(invoiced.total)}
            </h2>
            <div style={{ flex: 1 }} />
            <Button small variant="secondary" onClick={() => window.print()}>
              Imprimir
            </Button>
          </div>
          {invoiced.notas.map((n, i) => (
            <div
              key={i}
              style={{
                borderTop: '0.5px solid var(--border)',
                paddingTop: '0.5rem',
                marginTop: '0.5rem',
              }}
            >
              <div className="toolbar" style={{ marginBottom: 0 }}>
                <span style={{ fontSize: 14, fontWeight: 500 }}>{n.tomador.nome}</span>
                <Badge tone="success">Faturada</Badge>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  {n.itens.length} sessão(ões) · {fmtMoney(n.valorBruto)}
                </span>
                <div style={{ flex: 1 }} />
                <Button
                  small
                  variant="secondary"
                  onClick={() => setOpenNota(openNota === i ? null : i)}
                >
                  {openNota === i ? 'Ocultar nota' : 'Ver nota'}
                </Button>
              </div>
              {openNota === i && <NotaDocCard nota={n} />}
            </div>
          ))}
        </Card>
      )}
    </div>
  )
}
