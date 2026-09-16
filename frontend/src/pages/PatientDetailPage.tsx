import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { apiGet, apiPost, ApiError } from '../api/client'
import { STATUS_LABEL, type Appointment, type Page, type Patient } from '../api/types'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { fmtDate, fmtDateTime, fmtMoney } from '../utils/format'

export function PatientDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [patient, setPatient] = useState<Patient | null>(null)
  const [sessions, setSessions] = useState<Appointment[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    if (!id) return
    Promise.all([
      apiGet<Patient>(`/patients/${id}`),
      apiGet<Page<Appointment>>(`/appointments?patientId=${id}&limit=50`),
    ])
      .then(([p, a]) => {
        setPatient(p)
        setSessions(a.data)
      })
      .catch(() => setError('Paciente não encontrado.'))
      .finally(() => setLoading(false))
  }, [id])

  useEffect(load, [load])

  async function action(fn: () => Promise<unknown>) {
    setError(null)
    setBusy(true)
    try {
      await fn()
      load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ação falhou.')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <div className="loading-state">Carregando…</div>
  if (!patient) return <div className="alert-error">{error ?? 'Paciente não encontrado.'}</div>

  const dias = patient.diasSemana?.join(', ') || '—'

  return (
    <div>
      <h1 className="section-title">{patient.nome}</h1>
      {error && <div className="alert-error">{error}</div>}

      <div className="toolbar">
        <Link to={`/pacientes/${patient.id}/editar`}>
          <Button variant="secondary" small>Editar</Button>
        </Link>
        <Button
          variant="secondary"
          small
          disabled={busy}
          onClick={() => action(() => apiPost(`/patients/${patient.id}/renovar`))}
        >
          Renovar ciclo
        </Button>
        {patient.archivedAt ? (
          <Button
            variant="secondary"
            small
            disabled={busy}
            onClick={() => action(() => apiPost(`/patients/${patient.id}/unarchive`))}
          >
            Desarquivar
          </Button>
        ) : (
          <Button
            variant="secondary"
            small
            disabled={busy}
            onClick={() => action(() => apiPost(`/patients/${patient.id}/archive`))}
          >
            Arquivar
          </Button>
        )}
        <Button variant="secondary" small onClick={() => navigate('/pacientes')}>
          ← Voltar
        </Button>
      </div>

      <Card>
        <dl className="detail-grid">
          <div><dt>CPF</dt><dd>{patient.cpf ?? '—'}</dd></div>
          <div><dt>Telefone</dt><dd>{patient.telefone ?? '—'}</dd></div>
          <div><dt>E-mail</dt><dd>{patient.email ?? '—'}</dd></div>
          <div><dt>Nascimento</dt><dd>{patient.dataNascimento ? fmtDate(patient.dataNascimento) : '—'}</dd></div>
          <div><dt>Valor/sessão</dt><dd>{fmtMoney(patient.valor)}</dd></div>
          <div><dt>Faturamento</dt><dd>{patient.tipoFaturamento} ({patient.qtdSessoesNota}/nota)</dd></div>
          <div><dt>Dias</dt><dd>{dias}</dd></div>
          <div><dt>Horário</dt><dd>{patient.horario?.slice(0, 5) ?? '—'}</dd></div>
          <div><dt>Frequência</dt><dd>{patient.frequenciaRecorrencia}</dd></div>
          <div><dt>Reajuste</dt><dd>{patient.dataReajuste ? fmtDate(patient.dataReajuste) : '—'}</dd></div>
          <div><dt>Ciclo</dt><dd>{patient.mesesCiclo} meses</dd></div>
          <div><dt>Sala/link</dt><dd>{patient.salaReuniao ?? '—'}</dd></div>
          <div><dt>Status</dt><dd>{patient.archivedAt ? 'Arquivado' : 'Ativo'}</dd></div>
          <div><dt>Cadastro</dt><dd>{fmtDateTime(patient.createdAt)}</dd></div>
        </dl>
      </Card>

      {patient.anamnese && (
        <Card>
          <h2 className="section-subtitle">Anamnese</h2>
          <p style={{ fontSize: 14, whiteSpace: 'pre-wrap' }}>{patient.anamnese}</p>
        </Card>
      )}

      <Card>
        <h2 className="section-subtitle">Histórico de sessões</h2>
        {sessions.length === 0 ? (
          <p className="empty-state">Nenhuma sessão registrada.</p>
        ) : (
          sessions.map((s) => (
            <div key={s.id} className="session-card" onClick={() => navigate(`/agenda/${s.id}`)}>
              <div className="session-time">
                {fmtDateTime(s.startsAt)} · {s.duracao} min · {fmtMoney(s.valor)}
                {s.faturada ? ' · faturada' : ''}
              </div>
              <Badge tone={STATUS_LABEL[s.status].tone}>{STATUS_LABEL[s.status].label}</Badge>
            </div>
          ))
        )}
      </Card>
    </div>
  )
}
