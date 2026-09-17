import { useEffect, useState, type FormEvent, type KeyboardEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ShieldAlert, Video, X } from 'lucide-react'
import { apiGet, apiPut, ApiError } from '../api/client'
import { STATUS_LABEL, type Appointment } from '../api/types'
import { meetingUrl, MeetingLink } from '../components/MeetingLink'
import { Alert } from '../components/ui/Alert'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { DetailGrid } from '../components/ui/DetailGrid'
import { fieldClass, Input, Textarea } from '../components/ui/Input'
import { Loading } from '../components/ui/LoadingState'
import { cn } from '../lib/utils'
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
    const fetchRecord = apiGet<SessionRecord>(`/appointments/${id}/record`).catch((err) => {
      if (err instanceof ApiError && err.code === 'RECORD_NOT_FOUND') return null
      throw err
    })
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

  if (loading) return <Loading />
  if (!appt) return <Alert>{error ?? 'Atendimento não encontrado.'}</Alert>

  const locked = record?.legalHold === true

  return (
    <div className="max-w-3xl">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft />
          Voltar
        </Button>
        <h1 className="text-xl font-semibold tracking-tight">{appt.patientNome ?? 'Atendimento'}</h1>
        <Badge tone={STATUS_LABEL[appt.status].tone}>{STATUS_LABEL[appt.status].label}</Badge>
        {meetingUrl(appt.salaReuniao) && (
          <Button size="sm" asChild>
            <a href={meetingUrl(appt.salaReuniao)!} target="_blank" rel="noopener noreferrer">
              <Video />
              Entrar na sala
            </a>
          </Button>
        )}
      </div>

      <Card className="mb-4">
        <CardContent className="pt-6">
          <DetailGrid
            items={[
              { label: 'Data/hora', value: fmtDateTime(appt.startsAt) },
              { label: 'Duração', value: `${appt.duracao} min` },
              { label: 'Valor', value: fmtMoney(appt.valor) },
              { label: 'Sala/link', value: <MeetingLink sala={appt.salaReuniao} /> },
            ]}
          />
        </CardContent>
      </Card>

      {error && <Alert className="mb-4">{error}</Alert>}
      {saved && <Alert tone="success" className="mb-4">Prontuário salvo.</Alert>}

      <form onSubmit={onSubmit} className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Evolução da sessão</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              label="Registro clínico"
              name="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="min-h-40"
            />
            <div className="mb-5">
              <span className="mb-1.5 block text-sm font-medium">
                Temas abordados (Enter para adicionar)
              </span>
              {temas.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {temas.map((t) => (
                    <span
                      key={t}
                      className="inline-flex items-center gap-1 rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground"
                    >
                      {t}
                      <button
                        type="button"
                        aria-label={`Remover ${t}`}
                        onClick={() => setTemas(temas.filter((x) => x !== t))}
                        className="rounded-full p-0.5 transition-colors hover:bg-accent-foreground/10"
                      >
                        <X className="size-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <input
                value={temaInput}
                onChange={(e) => setTemaInput(e.target.value)}
                onKeyDown={onTemaKey}
                onBlur={addTema}
                placeholder="Ex.: ansiedade, trabalho…"
                className={cn(fieldClass, 'h-9')}
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
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <label className="flex items-center gap-2.5 text-sm font-medium">
              <input
                type="checkbox"
                checked={legalHold}
                disabled={locked}
                onChange={(e) => setLegalHold(e.target.checked)}
                className="size-4 accent-[oklch(0.51_0.09_175)]"
              />
              Retenção legal (legal hold)
              {locked && <ShieldAlert className="size-4 text-warning-foreground" />}
            </label>
            <p className="mt-2 text-sm text-muted-foreground">
              {locked
                ? 'Este registro está sob retenção legal — não pode ser desmarcado.'
                : 'Marca o registro para retenção (CFP/LGPD). Uma vez marcado, não pode ser desfeito.'}
            </p>
          </CardContent>
        </Card>

        <div>
          <Button type="submit" disabled={busy}>
            {busy ? 'Salvando…' : 'Salvar prontuário'}
          </Button>
        </div>
      </form>
    </div>
  )
}
