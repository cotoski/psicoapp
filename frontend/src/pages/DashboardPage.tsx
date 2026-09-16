import { useEffect, useState } from 'react'
import { apiGet } from '../api/client'
import { Card, MetricCard } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { fmtMoney, fmtTime } from '../utils/format'

interface Dashboard {
  pacientes: number
  sessoesTotal: number
  sessoesRealizadas: number
  faturamento: number
}

interface Appointment {
  id: string
  patientNome?: string
  salaReuniao: string | null
  startsAt: string
  duracao: number
  status: 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'rescheduled' | 'no_show'
  valor: number
}

const STATUS_LABEL: Record<Appointment['status'], { label: string; tone: 'success' | 'warning' | 'danger' | 'accent' }> = {
  scheduled: { label: 'Agendada', tone: 'accent' },
  confirmed: { label: 'Confirmada', tone: 'accent' },
  completed: { label: 'Realizada', tone: 'success' },
  cancelled: { label: 'Cancelada', tone: 'danger' },
  rescheduled: { label: 'Remarcada', tone: 'warning' },
  no_show: { label: 'Falta', tone: 'warning' },
}

function todayISO(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function DashboardPage() {
  const [dash, setDash] = useState<Dashboard | null>(null)
  const [today, setToday] = useState<Appointment[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const iso = todayISO()
    Promise.all([
      apiGet<Dashboard>('/dashboard'),
      apiGet<{ data: Appointment[] }>(`/appointments?from=${iso}&to=${iso}&limit=50`),
    ])
      .then(([d, a]) => {
        setDash(d)
        setToday(a.data)
      })
      .catch(() => setError('Não foi possível carregar o dashboard.'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="loading-state">Carregando…</div>
  if (error) return <div className="alert-error">{error}</div>

  return (
    <div>
      <h1 className="section-title">Dashboard</h1>
      <div className="metrics-grid">
        <MetricCard label="Pacientes ativos" value={dash?.pacientes ?? 0} />
        <MetricCard label="Sessões totais" value={dash?.sessoesTotal ?? 0} />
        <MetricCard label="Sessões realizadas" value={dash?.sessoesRealizadas ?? 0} />
        <MetricCard label="Faturamento" value={fmtMoney(dash?.faturamento ?? 0)} />
      </div>

      <Card>
        <h2 className="section-title">Sessões de hoje</h2>
        {today.length === 0 ? (
          <p className="empty-state">Nenhuma sessão agendada para hoje.</p>
        ) : (
          today.map((s) => (
            <div key={s.id} className="session-card">
              <div className="session-time">
                {fmtTime(s.startsAt)} · {s.duracao} min
                {s.salaReuniao ? ` · ${s.salaReuniao}` : ''}
              </div>
              <div className="session-patient">{s.patientNome ?? '—'}</div>
              <Badge tone={STATUS_LABEL[s.status].tone}>{STATUS_LABEL[s.status].label}</Badge>
            </div>
          ))
        )}
      </Card>
    </div>
  )
}
