import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiGet, apiPost, apiPut, ApiError } from '../api/client'
import {
  STATUS_LABEL,
  type Appointment,
  type AppointmentStatus,
  type Page,
  type Patient,
} from '../api/types'
import { Button } from '../components/ui/Button'
import { Input, Select } from '../components/ui/Input'
import { Modal } from '../components/ui/Modal'
import { fmtMoney, fmtTime } from '../utils/format'

type View = 'month' | 'week' | 'day'

const HOURS = Array.from({ length: 11 }, (_, i) => i + 8) // 8h–18h
const MONTH_FMT = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' })
const DAY_FMT = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short' })
const FULL_FMT = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full' })

const TONE_CLASS: Record<string, string> = {
  success: 'cal-bg-success',
  warning: 'cal-bg-warning',
  danger: 'cal-bg-danger',
  accent: 'cal-bg-accent',
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

  function chipClass(a: Appointment) {
    return `cal-chip ${TONE_CLASS[STATUS_LABEL[a.status].tone]}`
  }

  function chipText(a: Appointment) {
    return `${fmtTime(a.startsAt)} ${(a.patientNome ?? '—').split(' ')[0]}`
  }

  return (
    <div>
      <h1 className="section-title">Agenda</h1>

      <div className="view-toggle">
        {(['month', 'week', 'day'] as const).map((v) => (
          <Button
            key={v}
            variant={view === v ? 'primary' : 'secondary'}
            small
            onClick={() => setView(v)}
          >
            {{ month: 'Mês', week: 'Semana', day: 'Dia' }[v]}
          </Button>
        ))}
        <div style={{ flex: 1 }} />
        <Button small onClick={() => setCreating(true)}>Nova sessão</Button>
      </div>

      <div className="cal-nav">
        <Button variant="secondary" small onClick={() => shift(-1)}>←</Button>
        <span className="cal-title">{title}</span>
        <Button variant="secondary" small onClick={() => shift(1)}>→</Button>
        <Button variant="secondary" small onClick={() => setCursor(new Date())}>Hoje</Button>
      </div>

      {error && <div className="alert-error">{error}</div>}
      {loading && <div className="loading-state">Carregando…</div>}

      {!loading && view === 'month' && (
        <div className="cal-month">
          {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((d) => (
            <div key={d} className="cal-month-header">{d}</div>
          ))}
          {Array.from({ length: 42 }, (_, i) => {
            const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
            const day = addDays(startOfWeek(first), i)
            const key = iso(day)
            const list = byDay.get(key) ?? []
            const outside = day.getMonth() !== cursor.getMonth()
            return (
              <div
                key={key}
                className={`cal-cell${key === iso(new Date()) ? ' today' : ''}${outside ? ' outside' : ''}`}
                onClick={() => {
                  setCursor(day)
                  setView('day')
                }}
              >
                <div className="cal-cell-num">{day.getDate()}</div>
                {list.slice(0, 2).map((a) => (
                  <div
                    key={a.id}
                    className={chipClass(a)}
                    onClick={(e) => {
                      e.stopPropagation()
                      setSelected(a)
                    }}
                  >
                    {chipText(a)}
                  </div>
                ))}
                {list.length > 2 && <div className="cal-chip-more">+{list.length - 2}</div>}
              </div>
            )
          })}
        </div>
      )}

      {!loading && view === 'week' && (
        <div className="cal-week">
          <div />
          {Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(cursor), i)).map((d) => (
            <div key={iso(d)} className="cal-month-header">
              {d.getDate()}
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                {DAY_FMT.format(d).split(' ')[1]}
              </div>
            </div>
          ))}
          {HOURS.map((hr) => (
            <HourRow
              key={hr}
              hr={hr}
              days={Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(cursor), i))}
              byDay={byDay}
              chipClass={chipClass}
              chipText={chipText}
              onSelect={setSelected}
            />
          ))}
        </div>
      )}

      {!loading && view === 'day' && (
        <div className="cal-day">
          {HOURS.map((hr) => {
            const list = (byDay.get(iso(cursor)) ?? []).filter(
              (a) => new Date(a.startsAt).getHours() === hr,
            )
            return (
              <DayRow
                key={hr}
                hr={hr}
                list={list}
                onSelect={setSelected}
              />
            )
          })}
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
      <div className="cal-hour-label">{hr}:00</div>
      {days.map((d) => {
        const match = (byDay.get(iso(d)) ?? []).filter(
          (a) => new Date(a.startsAt).getHours() === hr,
        )
        return (
          <div key={iso(d)} className="cal-slot">
            {match.map((a) => (
              <div
                key={a.id}
                className={chipClass(a)}
                title={a.patientNome}
                onClick={() => onSelect(a)}
              >
                {chipText(a)}
              </div>
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
    <>
      <div className="cal-hour-label">{hr}:00</div>
      <div className="cal-slot" style={{ minHeight: 48, padding: 4 }}>
        {list.map((a) => (
          <div
            key={a.id}
            className={`cal-event ${TONE_CLASS[STATUS_LABEL[a.status].tone]}`}
            onClick={() => onSelect(a)}
          >
            <div className="cal-event-title">{a.patientNome ?? '—'}</div>
            <div className="cal-event-sub">
              {fmtTime(a.startsAt)} – {STATUS_LABEL[a.status].label} · {a.duracao}min
            </div>
          </div>
        ))}
      </div>
    </>
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
      {error && <div className="alert-error">{error}</div>}
      <dl className="detail-grid" style={{ marginBottom: '1rem' }}>
        <div><dt>Data/hora</dt><dd>{new Date(appt.startsAt).toLocaleString('pt-BR')}</dd></div>
        <div><dt>Duração</dt><dd>{appt.duracao} min</dd></div>
        <div><dt>Valor</dt><dd>{fmtMoney(appt.valor)}</dd></div>
        <div><dt>Status</dt><dd>{STATUS_LABEL[appt.status].label}</dd></div>
        <div><dt>Faturada</dt><dd>{appt.faturada ? 'Sim' : 'Não'}</dd></div>
        <div><dt>Sala</dt><dd>{appt.salaReuniao ?? '—'}</dd></div>
      </dl>

      {allowed.length > 0 && (
        <div className="button-group">
          {allowed.filter((s) => ACTION_LABEL[s]).map((s) => (
            <Button
              key={s}
              small
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
          <Button small type="submit" variant="secondary" disabled={busy || !newStart}>
            Remarcar
          </Button>
        </form>
      )}

      <div className="button-group" style={{ marginTop: '1rem' }}>
        <Button small variant="secondary" onClick={() => navigate(`/agenda/${appt.id}`)}>
          Abrir atendimento
        </Button>
      </div>
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
      {error && <div className="alert-error">{error}</div>}
      <form onSubmit={onSubmit}>
        <Select
          label="Paciente"
          name="patientId"
          value={patientId}
          onChange={(e) => setPatientId(e.target.value)}
          options={patients.map((p) => ({ value: p.id, label: p.nome }))}
        />
        <Input label="Data" name="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        <Input label="Hora" name="time" type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
        <Input label="Duração (min)" name="duracao" type="number" min={10} max={240} value={duracao} onChange={(e) => setDuracao(e.target.value)} />
        <div className="button-group">
          <Button type="submit" disabled={busy || !patientId}>
            {busy ? 'Criando…' : 'Criar sessão'}
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
        </div>
      </form>
    </Modal>
  )
}
