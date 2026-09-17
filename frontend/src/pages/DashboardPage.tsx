import { useEffect, useState } from 'react'
import { Banknote, CalendarCheck, CalendarDays, CheckCircle2, Users } from 'lucide-react'
import { apiGet } from '../api/client'
import { Card, CardContent, CardHeader, CardTitle, MetricCard } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { useAuth } from '../auth/AuthContext'
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

const DATE_FMT = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full' })

function todayISO(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function DashboardPage() {
  const { user } = useAuth()
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

  const firstName = user?.nome.split(' ')[0] ?? ''
  const dateLabel = DATE_FMT.format(new Date())

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-64 animate-pulse rounded-md bg-muted" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl border bg-card" />
          ))}
        </div>
        <div className="h-64 animate-pulse rounded-xl border bg-card" />
      </div>
    )
  }
  if (error) {
    return (
      <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Olá, {firstName}</h1>
        <p className="mt-0.5 text-sm capitalize text-muted-foreground">{dateLabel}</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard label="Pacientes ativos" value={dash?.pacientes ?? 0} icon={<Users />} />
        <MetricCard label="Sessões totais" value={dash?.sessoesTotal ?? 0} icon={<CalendarDays />} />
        <MetricCard
          label="Sessões realizadas"
          value={dash?.sessoesRealizadas ?? 0}
          icon={<CheckCircle2 />}
        />
        <MetricCard
          label="Faturamento"
          value={fmtMoney(dash?.faturamento ?? 0)}
          icon={<Banknote />}
        />
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Sessões de hoje</CardTitle>
          {today.length > 0 && <Badge tone="accent">{today.length}</Badge>}
        </CardHeader>
        <CardContent>
          {today.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <CalendarCheck className="size-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">Nenhuma sessão agendada para hoje.</p>
            </div>
          ) : (
            <div className="-m-2 divide-y">
              {today.map((s) => (
                <div key={s.id} className="flex items-center gap-4 rounded-lg p-3 transition-colors hover:bg-muted/50">
                  <div className="w-16 shrink-0 rounded-lg bg-accent px-2 py-1.5 text-center">
                    <div className="text-sm font-semibold tabular-nums text-accent-foreground">
                      {fmtTime(s.startsAt)}
                    </div>
                    <div className="text-[11px] text-accent-foreground/70">{s.duracao} min</div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{s.patientNome ?? '—'}</div>
                    {s.salaReuniao && (
                      <div className="truncate text-xs text-muted-foreground">{s.salaReuniao}</div>
                    )}
                  </div>
                  <Badge tone={STATUS_LABEL[s.status].tone}>{STATUS_LABEL[s.status].label}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
