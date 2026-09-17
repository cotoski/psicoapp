import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarDays, ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { apiGet, apiPost, apiPut, ApiError } from '../api/client'
import {
  STATUS_LABEL,
  type Appointment,
  type AppointmentStatus,
  type Page,
  type Patient,
} from '../api/types'
import { Alert } from '../components/ui/Alert'
import { Button } from '../components/ui/Button'
import { DetailGrid } from '../components/ui/DetailGrid'
import { Input, Select } from '../components/ui/Input'
import { Loading } from '../components/ui/LoadingState'
import { Modal } from '../components/ui/Modal'
import { PageHeader } from '../components/ui/PageHeader'
import { cn } from '../lib/utils'
import { fmtMoney, fmtTime } from '../utils/format'

type View = 'month' | 'week' | 'day'
type Tone = 'success' | 'warning' | 'danger' | 'accent'

const HOURS = Array.from({ length: 11 }, (_, i) => i + 8) // 8h–18h
const MONTH_FMT = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' })
const DAY_FMT = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short' })
const FULL_FMT = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full' })
const WEEKDAY_FMT = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' })

const TONE_BG: Record<Tone, string> = {
  accent: 'bg-accent text-accent-foreground',
  success: 'bg-success text-success-foreground',
  warning: 'bg-warning text-warning-foreground',
  danger: 'bg-destructive/10 text-destructive',
}

const TONE_BORDER: Record<Tone, string> = {
  accent: 'border-l-accent-foreground/60',
  success: 'border-l-success-foreground/60',
  warning: 'border-l-warning-foreground/60',
  danger: 'border-l-destructive',
}

function iso(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function addDays(d: Date, n: number): Date {
  const c = new Date(d)
  c.setDate(c.getDate() + n)
  return c
}

function startOfWeek(d: Date): Date {
  return addDays(d, -d.getDay()) // domingo primeiro, como no protótipo
}

function rangeOf(view: View, cursor: Date): { from: string; to: string } {
  if (view === 'day') return { from: iso(cursor), to: iso(cursor) }
  if (view === 'week') {
    const s = startOfWeek(cursor)
    return { from: iso(s), to: iso(addDays(s, 6)) }
  }
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
  const gridStart = startOfWeek(first)
  const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0)
  const gridEnd = addDays(last, 6 - last.getDay())
  return { from: iso(gridStart), to: iso(gridEnd) }
}

async function fetchAll(from: string, to: string): Promise<Appointment[]> {
  const out: Appointment[] = []
  let page = 1
  for (;;) {
    const res = await apiGet<Page<Appointment>>(
      `/appointments?from=${from}&to=${to}&limit=100&page=${page}`,
    )
    out.push(...res.data)
    if (out.length >= res.total || res.data.length === 0) return out
    page++
  }
}

// Transições válidas (espelha a máquina de status do backend)
const TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  scheduled: ['confirmed', 'completed', 'cancelled', 'rescheduled', 'no_show'],
  confirmed: ['completed', 'cancelled', 'rescheduled', 'no_show'],
  rescheduled: ['confirmed', 'completed', 'cancelled', 'no_show'],
  completed: [],
  cancelled: [],
  no_show: [],
}

const ACTION_LABEL: Partial<Record<AppointmentStatus, string>> = {
  confirmed: 'Confirmar',
  completed: 'Realizada',
  no_show: 'Falta',
  cancelled: 'Cancelar',
}

const VIEW_LABEL: Record<View, string> = { month: 'Mês', week: 'Semana', day: 'Dia' }

export function AgendaPage() {
  const [view, setView] = useState<View>('week')
  const [cursor, setCursor] = useState(() => new Date())
  const [events, setEvents] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Appointment | null>(null)
  const [creating, setCreating] = useState(false)

  const { from, to } = rangeOf(view, cursor)

  const load = useCallback(() => {
    setLoading(true)
    fetchAll(from, to)
      .then(setEvents)
      .catch(() => setError('Não foi possível carregar a agenda.'))
      .finally(() => setLoading(false))
  }, [from, to])

  useEffect(load, [load])

  const byDay = useMemo(() => {
    const m = new Map<string, Appointment[]>()
    for (const a of events) {
      const key = iso(new Date(a.startsAt))
      const list = m.get(key) ?? []
      list.push(a)
      m.set(key, list)
    }
    for (const list of m.values())
      list.sort((x, y) => x.startsAt.localeCompare(y.startsAt))
    return m
  }, [events])

  function shift(n: number) {
    setCursor((c) =>
      view === 'month'
        ? new Date(c.getFullYear(), c.getMonth() + n, 1)
        : addDays(c, view === 'week' ? 7 * n : n),
    )
  }

  const title =
    view === 'month'
      ? MONTH_FMT.format(cursor)
      : view === 'week'
        ? `${DAY_FMT.format(startOfWeek(cursor))} – ${DAY_FMT.format(addDays(startOfWeek(cursor), 6))}`
        : FULL_FMT.format(cursor)

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(cursor), i)),
    [cursor],
  )

  function chipClass(a: Appointment) {
    return cn(
      'block w-full cursor-pointer truncate rounded px-1.5 py-0.5 text-left text-[11px] font-medium leading-tight',
      TONE_BG[STATUS_LABEL[a.status].tone],
    )
  }

  function chipText(a: Appointment) {
    return `${fmtTime(a.startsAt)} ${(a.patientNome ?? '—').split(' ')[0]}`
  }

  return (
    <div>
      <PageHeader title="Agenda">
        <div className="flex items-center rounded-lg border bg-card p-0.5">
          {(['month', 'week', 'day'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors',
                view === v && 'bg-accent text-accent-foreground',
              )}
            >
              {VIEW_LABEL[v]}
            </button>
          ))}
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus />
          Nova sessão
        </Button>
      </PageHeader>

      <div className="mb-4 flex items-center gap-2">
        <Button variant="secondary" size="icon" className="h-8 w-8" onClick={() => shift(-1)} aria-label="Anterior">
          <ChevronLeft />
        </Button>
        <span className="min-w-44 flex-1 text-center text-sm font-medium capitalize">{title}</span>
        <Button variant="secondary" size="icon" className="h-8 w-8" onClick={() => shift(1)} aria-label="Próximo">
          <ChevronRight />
        </Button>
        <Button variant="secondary" size="sm" onClick={() => setCursor(new Date())}>
          Hoje
        </Button>
      </div>

      {error && <Alert className="mb-4">{error}</Alert>}
      {loading && <Loading />}

      {!loading && view === 'month' && (
        <div className="grid grid-cols-7 gap-1">
          {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((d) => (
            <div key={d} className="py-1 text-center text-xs font-medium text-muted-foreground">
              {d}
            </div>
          ))}
          {Array.from({ length: 42 }, (_, i) => {
            const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
            const day = addDays(startOfWeek(first), i)
            const key = iso(day)
            const list = byDay.get(key) ?? []
            const outside = day.getMonth() !== cursor.getMonth()
            const today = key === iso(new Date())
            return (
              <div
                key={key}
                onClick={() => {
                  setCursor(day)
                  setView('day')
                }}
                className={cn(
                  'min-h-20 cursor-pointer rounded-lg border bg-card p-1.5 text-xs transition-colors hover:border-accent-foreground/30',
                  today && 'border-primary bg-accent/40',
                  outside && 'opacity-40',
                )}
              >
                <div className={cn('mb-1 font-medium', today && 'text-primary')}>{day.getDate()}</div>
                <div className="space-y-0.5">
                  {list.slice(0, 2).map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      className={chipClass(a)}
                      onClick={(e) => {
                        e.stopPropagation()
                        setSelected(a)
                      }}
                    >
                      {chipText(a)}
                    </button>
                  ))}
                  {list.length > 2 && (
                    <div className="px-1 text-[10px] text-muted-foreground">+{list.length - 2}</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {!loading && view === 'week' && (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <div className="grid min-w-[640px] grid-cols-[3rem_repeat(7,minmax(0,1fr))]">
            <div className="border-b" />
            {weekDays.map((d) => {
              const today = iso(d) === iso(new Date())
              return (
                <div
                  key={iso(d)}
                  className={cn(
                    'border-b border-l py-2 text-center text-sm font-medium',
                    today && 'bg-accent/50 text-primary',
                  )}
                >
                  {d.getDate()}
                  <div className="text-[11px] font-normal capitalize text-muted-foreground">
                    {WEEKDAY_FMT.format(d).replace('.', '')}
                  </div>
                </div>
              )
            })}
            {HOURS.map((hr) => (
              <HourRow
                key={hr}
                hr={hr}
                days={weekDays}
                byDay={byDay}
                chipClass={chipClass}
                chipText={chipText}
                onSelect={setSelected}
              />
            ))}
          </div>
        </div>
      )}

      {!loading && view === 'day' && (
        <div className="rounded-xl border bg-card">
          {HOURS.map((hr) => {
            const list = (byDay.get(iso(cursor)) ?? []).filter(
              (a) => new Date(a.startsAt).getHours() === hr,
            )
            return <DayRow key={hr} hr={hr} list={list} onSelect={setSelected} />
          })}
          {(byDay.get(iso(cursor)) ?? []).length === 0 && (
            <div className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground">
              <CalendarDays className="size-4" />
              Nenhuma sessão neste dia.
            </div>
          )}
        </div>
      )}

      <SessionModal
        appt={selected}
        onClose={() => setSelected(null)}
        onChanged={() => {
          setSelected(null)
          load()
        }}
      />
      <NewSessionModal
        open={creating}
        defaultDate={cursor}
        onClose={() => setCreating(false)}
        onCreated={() => {
          setCreating(false)
          load()
        }}
      />
    </div>
  )
}

function HourRow({
  hr,
  days,
  byDay,
  chipClass,
  chipText,
  onSelect,
}: {
  hr: number
  days: Date[]
  byDay: Map<string, Appointment[]>
  chipClass: (a: Appointment) => string
  chipText: (a: Appointment) => string
  onSelect: (a: Appointment) => void
}) {
  return (
    <>
      <div className="border-t px-1 pt-1 text-right text-[11px] text-muted-foreground">{hr}:00</div>
      {days.map((d) => {
        const match = (byDay.get(iso(d)) ?? []).filter(
          (a) => new Date(a.startsAt).getHours() === hr,
        )
        return (
          <div key={iso(d)} className="min-h-10 space-y-0.5 border-l border-t p-0.5">
            {match.map((a) => (
              <button
                key={a.id}
                type="button"
                className={chipClass(a)}
                title={a.patientNome}
                onClick={() => onSelect(a)}
              >
                {chipText(a)}
              </button>
            ))}
          </div>
        )
      })}
    </>
  )
}

function DayRow({
  hr,
  list,
  onSelect,
}: {
  hr: number
  list: Appointment[]
  onSelect: (a: Appointment) => void
}) {
  return (
    <div className="grid grid-cols-[3rem_1fr]">
      <div className="border-t px-1 pt-2 text-right text-[11px] text-muted-foreground">{hr}:00</div>
      <div className="min-h-12 space-y-1.5 border-l border-t p-1.5">
        {list.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => onSelect(a)}
            className={cn(
              'block w-full cursor-pointer rounded-md border-l-4 px-3 py-2 text-left transition-shadow hover:shadow-sm',
              TONE_BG[STATUS_LABEL[a.status].tone],
              TONE_BORDER[STATUS_LABEL[a.status].tone],
            )}
          >
            <div className="text-sm font-medium text-foreground">{a.patientNome ?? '—'}</div>
            <div className="text-xs opacity-80">
              {fmtTime(a.startsAt)} – {STATUS_LABEL[a.status].label} · {a.duracao}min
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

function SessionModal({
  appt,
  onClose,
  onChanged,
}: {
  appt: Appointment | null
  onClose: () => void
  onChanged: () => void
}) {
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [newStart, setNewStart] = useState('')

  useEffect(() => {
    setError(null)
    setNewStart('')
  }, [appt])

  if (!appt) return null
  const allowed = TRANSITIONS[appt.status]

  async function act(body: Record<string, unknown>) {
    setBusy(true)
    setError(null)
    try {
      await apiPut(`/appointments/${appt!.id}`, body)
      onChanged()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ação falhou.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open title={appt.patientNome ?? 'Sessão'} onClose={onClose}>
      {error && <Alert className="mb-4">{error}</Alert>}
      <DetailGrid
        className="mb-5"
        items={[
          { label: 'Data/hora', value: new Date(appt.startsAt).toLocaleString('pt-BR') },
          { label: 'Duração', value: `${appt.duracao} min` },
          { label: 'Valor', value: fmtMoney(appt.valor) },
          { label: 'Status', value: STATUS_LABEL[appt.status].label },
          { label: 'Faturada', value: appt.faturada ? 'Sim' : 'Não' },
          { label: 'Sala', value: appt.salaReuniao ?? '—' },
        ]}
      />

      {allowed.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {allowed
            .filter((s) => ACTION_LABEL[s])
            .map((s) => (
              <Button
                key={s}
                size="sm"
                variant={s === 'cancelled' ? 'secondary' : 'primary'}
                disabled={busy}
                onClick={() => act({ status: s })}
              >
                {ACTION_LABEL[s]}
              </Button>
            ))}
        </div>
      )}

      {allowed.includes('rescheduled') && (
        <form
          className="mb-4"
          onSubmit={(e: FormEvent) => {
            e.preventDefault()
            if (newStart) act({ startsAt: new Date(newStart).toISOString(), status: 'rescheduled' })
          }}
        >
          <Input
            label="Remarcar para"
            name="newStart"
            type="datetime-local"
            value={newStart}
            onChange={(e) => setNewStart(e.target.value)}
            required
          />
          <Button size="sm" type="submit" variant="secondary" disabled={busy || !newStart}>
            Remarcar
          </Button>
        </form>
      )}

      <Button size="sm" variant="secondary" onClick={() => navigate(`/agenda/${appt.id}`)}>
        Abrir atendimento
      </Button>
    </Modal>
  )
}

function NewSessionModal({
  open,
  defaultDate,
  onClose,
  onCreated,
}: {
  open: boolean
  defaultDate: Date
  onClose: () => void
  onCreated: () => void
}) {
  const [patients, setPatients] = useState<Patient[]>([])
  const [patientId, setPatientId] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [duracao, setDuracao] = useState('50')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setError(null)
    setDate(iso(defaultDate))
    apiGet<Page<Patient>>('/patients?status=active&limit=100')
      .then((res) => {
        setPatients(res.data)
        if (res.data[0]) setPatientId((p) => p || res.data[0].id)
      })
      .catch(() => setError('Não foi possível carregar os pacientes.'))
  }, [open, defaultDate])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await apiPost('/appointments', {
        patientId,
        startsAt: new Date(`${date}T${time}`).toISOString(),
        duracao: Number(duracao) || 50,
      })
      onCreated()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível criar a sessão.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} title="Nova sessão" onClose={onClose}>
      {error && <Alert className="mb-4">{error}</Alert>}
      <form onSubmit={onSubmit}>
        <Select
          label="Paciente"
          name="patientId"
          value={patientId}
          onChange={(e) => setPatientId(e.target.value)}
          options={patients.map((p) => ({ value: p.id, label: p.nome }))}
        />
        <div className="grid grid-cols-2 gap-x-4">
          <Input label="Data" name="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          <Input label="Hora" name="time" type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
        </div>
        <Input label="Duração (min)" name="duracao" type="number" min={10} max={240} value={duracao} onChange={(e) => setDuracao(e.target.value)} />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={busy || !patientId}>
            {busy ? 'Criando…' : 'Criar sessão'}
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
        </div>
      </form>
    </Modal>
  )
}
