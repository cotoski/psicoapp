import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CalendarClock, CalendarX2, Pencil } from 'lucide-react'
import { apiGet, apiPost, ApiError } from '../api/client'
import { MeetingLink } from '../components/MeetingLink'
import { STATUS_LABEL, type Appointment, type Page, type Patient } from '../api/types'
import { Alert } from '../components/ui/Alert'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { DetailGrid } from '../components/ui/DetailGrid'
import { Empty, Loading } from '../components/ui/LoadingState'
import { PageHeader } from '../components/ui/PageHeader'
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

  if (loading) return <Loading />
  if (!patient) return <Alert>{error ?? 'Paciente não encontrado.'}</Alert>

  const dias = patient.diasSemana?.join(', ') || '—'

  return (
    <div>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            {patient.nome}
            <Badge tone={patient.archivedAt ? 'warning' : 'success'}>
              {patient.archivedAt ? 'Arquivado' : 'Ativo'}
            </Badge>
          </span>
        }
      >
        <Button variant="secondary" size="sm" asChild>
          <Link to={`/pacientes/${patient.id}/editar`}>
            <Pencil />
            Editar
          </Link>
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={busy}
          onClick={() => action(() => apiPost(`/patients/${patient.id}/renovar`))}
        >
          <CalendarClock />
          Renovar ciclo
        </Button>
        {patient.archivedAt ? (
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => action(() => apiPost(`/patients/${patient.id}/unarchive`))}
          >
            Desarquivar
          </Button>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => action(() => apiPost(`/patients/${patient.id}/archive`))}
          >
            <CalendarX2 />
            Arquivar
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={() => navigate('/pacientes')}>
          <ArrowLeft />
          Voltar
        </Button>
      </PageHeader>

      {error && <Alert className="mb-4">{error}</Alert>}

      <Card className="mb-4">
        <CardContent className="pt-6">
          <DetailGrid
            items={[
              { label: 'CPF', value: patient.cpf ?? '—' },
              { label: 'Telefone', value: patient.telefone ?? '—' },
              { label: 'E-mail', value: patient.email ?? '—' },
              {
                label: 'Nascimento',
                value: patient.dataNascimento ? fmtDate(patient.dataNascimento) : '—',
              },
              { label: 'Valor/sessão', value: fmtMoney(patient.valor) },
              {
                label: 'Faturamento',
                value: `${patient.tipoFaturamento} (${patient.qtdSessoesNota}/nota)`,
              },
              { label: 'Dias', value: dias },
              { label: 'Horário', value: patient.horario?.slice(0, 5) ?? '—' },
              { label: 'Frequência', value: patient.frequenciaRecorrencia },
              {
                label: 'Reajuste',
                value: patient.dataReajuste ? fmtDate(patient.dataReajuste) : '—',
              },
              { label: 'Ciclo', value: `${patient.mesesCiclo} meses` },
              { label: 'Sala/link', value: <MeetingLink sala={patient.salaReuniao} /> },
              { label: 'Cadastro', value: fmtDateTime(patient.createdAt) },
            ]}
          />
        </CardContent>
      </Card>

      {patient.anamnese && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>Anamnese</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm">{patient.anamnese}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Histórico de sessões</CardTitle>
          {sessions.length > 0 && <Badge tone="accent">{sessions.length}</Badge>}
        </CardHeader>
        <CardContent>
          {sessions.length === 0 ? (
            <Empty icon={<CalendarX2 />}>Nenhuma sessão registrada.</Empty>
          ) : (
            <div className="-m-2 divide-y">
              {sessions.map((s) => (
                <div
                  key={s.id}
                  onClick={() => navigate(`/agenda/${s.id}`)}
                  className="flex cursor-pointer items-center gap-4 rounded-lg p-3 transition-colors hover:bg-muted/50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{fmtDateTime(s.startsAt)}</div>
                    <div className="text-xs text-muted-foreground">
                      {s.duracao} min · {fmtMoney(s.valor)}
                      {s.faturada ? ' · faturada' : ''}
                    </div>
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
