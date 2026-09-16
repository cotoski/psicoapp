import { useEffect, useState, type FormEvent, type KeyboardEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { apiGet, apiPut, ApiError } from '../api/client'
import { STATUS_LABEL, type Appointment } from '../api/types'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Input, Textarea } from '../components/ui/Input'
import { fmtDateTime, fmtMoney } from '../utils/format'

interface SessionRecord {
  id: string
  appointmentId: string
  patientId: string
  content: string | null
  estadoEmocional: number | null
  temas: string[] | null
  tarefas: string | null
  legalHold: boolean
  createdAt: string
  updatedAt: string
}

export function SessionRecordPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [appt, setAppt] = useState<Appointment | null>(null)
  const [record, setRecord] = useState<SessionRecord | null>(null)
  const [content, setContent] = useState('')
  const [estado, setEstado] = useState('')
  const [temas, setTemas] = useState<string[]>([])
  const [temaInput, setTemaInput] = useState('')
  const [tarefas, setTarefas] = useState('')
  const [legalHold, setLegalHold] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!id) return
    // Prontuário inexistente é 404 (RECORD_NOT_FOUND) — não é erro de página.
    const fetchRecord = apiGet<SessionRecord>(`/appointments/${id}/record`).catch(
      (err) => {
        if (err instanceof ApiError && err.code === 'RECORD_NOT_FOUND') return null
        throw err
      },
    )
    Promise.all([apiGet<Appointment>(`/appointments/${id}`), fetchRecord])
      .then(([a, r]) => {
        setAppt(a)
        setRecord(r)
        if (r) {
          setContent(r.content ?? '')
          setEstado(r.estadoEmocional ? String(r.estadoEmocional) : '')
          setTemas(r.temas ?? [])
          setTarefas(r.tarefas ?? '')
          setLegalHold(r.legalHold)
        }
      })
      .catch((err) =>
        setError(
          err instanceof ApiError && err.status === 403
            ? 'Sem permissão para acessar prontuário.'
            : 'Atendimento não encontrado.',
        ),
      )
      .finally(() => setLoading(false))
  }, [id])

  function addTema() {
    const t = temaInput.trim()
    if (t && !temas.includes(t)) setTemas([...temas, t])
    setTemaInput('')
  }

  function onTemaKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addTema()
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      const body: Record<string, unknown> = { content, temas, tarefas }
      if (estado) body.estadoEmocional = Number(estado)
      if (legalHold && !record?.legalHold) body.legalHold = true
      setRecord(await apiPut<SessionRecord>(`/appointments/${id}/record`, body))
      setSaved(true)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível salvar.')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <div className="loading-state">Carregando…</div>
  if (!appt) return <div className="alert-error">{error ?? 'Atendimento não encontrado.'}</div>

  const locked = record?.legalHold === true

  return (
    <div style={{ maxWidth: 720 }}>
      <div className="toolbar">
        <Button variant="secondary" small onClick={() => navigate(-1)}>← Voltar</Button>
        <h1 className="section-title" style={{ margin: 0 }}>{appt.patientNome ?? 'Atendimento'}</h1>
        <Badge tone={STATUS_LABEL[appt.status].tone}>{STATUS_LABEL[appt.status].label}</Badge>
      </div>

      <Card>
        <dl className="detail-grid">
          <div><dt>Data/hora</dt><dd>{fmtDateTime(appt.startsAt)}</dd></div>
          <div><dt>Duração</dt><dd>{appt.duracao} min</dd></div>
          <div><dt>Valor</dt><dd>{fmtMoney(appt.valor)}</dd></div>
          <div><dt>Sala/link</dt><dd>{appt.salaReuniao ?? '—'}</dd></div>
        </dl>
      </Card>

      {error && <div className="alert-error">{error}</div>}
      {saved && <div className="alert-error" style={{ background: 'var(--bg-success)', color: 'var(--text-success)' }}>Prontuário salvo.</div>}

      <form onSubmit={onSubmit}>
        <Card>
          <h2 className="section-subtitle">Evolução da sessão</h2>
          <Textarea
            label="Registro clínico"
            name="content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            style={{ minHeight: 160 }}
          />
          <div className="form-group">
            <label>Temas abordados (Enter para adicionar)</label>
            <div>
              {temas.map((t) => (
                <span key={t} className="pill active">
                  {t}
                  <button
                    type="button"
                    aria-label={`Remover ${t}`}
                    style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', marginLeft: 6 }}
                    onClick={() => setTemas(temas.filter((x) => x !== t))}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <input
              value={temaInput}
              onChange={(e) => setTemaInput(e.target.value)}
              onKeyDown={onTemaKey}
              onBlur={addTema}
              placeholder="Ex.: ansiedade, trabalho…"
            />
          </div>
          <Textarea
            label="Tarefas / encaminhamentos"
            name="tarefas"
            value={tarefas}
            onChange={(e) => setTarefas(e.target.value)}
          />
          <Input
            label="Estado emocional (1–10)"
            name="estado"
            type="number"
            min={1}
            max={10}
            value={estado}
            onChange={(e) => setEstado(e.target.value)}
          />
        </Card>

        <Card>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}>
            <input
              type="checkbox"
              checked={legalHold}
              disabled={locked}
              onChange={(e) => setLegalHold(e.target.checked)}
            />
            Retenção legal (legal hold)
          </label>
          <p className="section-subtitle" style={{ marginTop: 8 }}>
            {locked
              ? 'Este registro está sob retenção legal — não pode ser desmarcado.'
              : 'Marca o registro para retenção (CFP/LGPD). Uma vez marcado, não pode ser desfeito.'}
          </p>
        </Card>

        <div className="button-group">
          <Button type="submit" disabled={busy}>
            {busy ? 'Salvando…' : 'Salvar prontuário'}
          </Button>
        </div>
      </form>
    </div>
  )
}
