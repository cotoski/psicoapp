import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { apiGet, apiPost, apiPut, ApiError } from '../api/client'
import { WEEK_DAYS, type Frequencia, type Patient, type WeekDay } from '../api/types'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input, Select, Textarea } from '../components/ui/Input'
import { maskCpf } from '../utils/format'

interface FormState {
  nome: string
  cpf: string
  telefone: string
  email: string
  dataNascimento: string
  anamnese: string
  valor: string
  tipoFaturamento: 'imediato' | 'pacote'
  qtdSessoesNota: string
  diasSemana: WeekDay[]
  horario: string
  frequenciaRecorrencia: Frequencia
  dataReajuste: string
  mesesCiclo: string
  salaReuniao: string
}

const EMPTY: FormState = {
  nome: '',
  cpf: '',
  telefone: '',
  email: '',
  dataNascimento: '',
  anamnese: '',
  valor: '',
  tipoFaturamento: 'imediato',
  qtdSessoesNota: '',
  diasSemana: [],
  horario: '',
  frequenciaRecorrencia: 'semanal',
  dataReajuste: '',
  mesesCiclo: '6',
  salaReuniao: '',
}

function toForm(p: Patient): FormState {
  return {
    nome: p.nome,
    cpf: p.cpf ?? '',
    telefone: p.telefone ?? '',
    email: p.email ?? '',
    dataNascimento: p.dataNascimento ?? '',
    anamnese: p.anamnese ?? '',
    valor: String(p.valor),
    tipoFaturamento: p.tipoFaturamento,
    qtdSessoesNota: String(p.qtdSessoesNota),
    diasSemana: p.diasSemana ?? [],
    horario: p.horario?.slice(0, 5) ?? '',
    frequenciaRecorrencia: p.frequenciaRecorrencia,
    dataReajuste: p.dataReajuste ?? '',
    mesesCiclo: String(p.mesesCiclo),
    salaReuniao: p.salaReuniao ?? '',
  }
}

export function PatientFormPage() {
  const { id } = useParams()
  const editing = Boolean(id)
  const navigate = useNavigate()
  const [form, setForm] = useState<FormState>(EMPTY)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(editing)

  useEffect(() => {
    if (!editing) return
    apiGet<Patient>(`/patients/${id}`)
      .then((p) => setForm(toForm(p)))
      .catch(() => setError('Paciente não encontrado.'))
      .finally(() => setLoading(false))
  }, [editing, id])

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function toggleDay(d: WeekDay) {
    set(
      'diasSemana',
      form.diasSemana.includes(d)
        ? form.diasSemana.filter((x) => x !== d)
        : [...form.diasSemana, d],
    )
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)

    const body: Record<string, unknown> = {
      nome: form.nome.trim(),
      valor: form.valor ? Number(form.valor) : 0,
      tipoFaturamento: form.tipoFaturamento,
      frequenciaRecorrencia: form.frequenciaRecorrencia,
      mesesCiclo: form.mesesCiclo ? Number(form.mesesCiclo) : 6,
    }
    const opt = (v: string) => (v.trim() ? v.trim() : undefined)
    if (opt(form.cpf)) body.cpf = form.cpf
    if (opt(form.telefone)) body.telefone = form.telefone
    if (opt(form.email)) body.email = form.email
    if (opt(form.dataNascimento)) body.dataNascimento = form.dataNascimento
    if (opt(form.anamnese)) body.anamnese = form.anamnese
    if (opt(form.qtdSessoesNota)) body.qtdSessoesNota = Number(form.qtdSessoesNota)
    if (form.diasSemana.length) body.diasSemana = form.diasSemana
    if (opt(form.horario)) body.horario = form.horario
    if (opt(form.dataReajuste)) body.dataReajuste = form.dataReajuste
    if (opt(form.salaReuniao)) body.salaReuniao = form.salaReuniao

    try {
      if (editing) {
        await apiPut<Patient>(`/patients/${id}`, body)
        navigate(`/pacientes/${id}`)
      } else {
        const created = await apiPost<Patient>('/patients', body)
        navigate(`/pacientes/${created.id}`)
      }
    } catch (err) {
      if (err instanceof ApiError && err.code === 'VALIDATION_ERROR') {
        const fields = err.details?.map((d) => `${d.path}: ${d.message}`).join(' · ')
        setError(`Dados inválidos${fields ? ` — ${fields}` : ''}`)
      } else {
        setError('Não foi possível salvar. Tente novamente.')
      }
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <div className="loading-state">Carregando…</div>

  const geraAgenda = form.diasSemana.length > 0 && Boolean(form.horario)
  const agendaIncompleta =
    !geraAgenda && (form.diasSemana.length > 0 || Boolean(form.horario))

  return (
    <div style={{ maxWidth: 640 }}>
      <h1 className="section-title">{editing ? 'Editar paciente' : 'Novo paciente'}</h1>
      {error && <div className="alert-error">{error}</div>}

      <form onSubmit={onSubmit}>
        <Card>
          <h2 className="section-subtitle">Dados básicos</h2>
          <Input label="Nome *" name="nome" value={form.nome} onChange={(e) => set('nome', e.target.value)} required />
          <Input label="CPF" name="cpf" placeholder="000.000.000-00" inputMode="numeric" maxLength={14} value={form.cpf} onChange={(e) => set('cpf', maskCpf(e.target.value))} />
          <Input label="Telefone" name="telefone" value={form.telefone} onChange={(e) => set('telefone', e.target.value)} />
          <Input label="E-mail" name="email" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
          <Input label="Data de nascimento" name="dataNascimento" type="date" value={form.dataNascimento} onChange={(e) => set('dataNascimento', e.target.value)} />
          <Textarea label="Anamnese" name="anamnese" value={form.anamnese} onChange={(e) => set('anamnese', e.target.value)} />
        </Card>

        <Card>
          <h2 className="section-subtitle">Agenda recorrente</h2>
          <div className="form-group">
            <label>Dias da semana</label>
            <div>
              {WEEK_DAYS.map((d) => (
                <button
                  key={d.value}
                  type="button"
                  className={`pill${form.diasSemana.includes(d.value) ? ' active' : ''}`}
                  onClick={() => toggleDay(d.value)}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>
          <Input label="Horário" name="horario" type="time" value={form.horario} onChange={(e) => set('horario', e.target.value)} />
          <Select
            label="Frequência"
            name="frequencia"
            value={form.frequenciaRecorrencia}
            onChange={(e) => set('frequenciaRecorrencia', e.target.value as Frequencia)}
            options={[
              { value: 'semanal', label: 'Semanal' },
              { value: 'quinzenal', label: 'Quinzenal' },
              { value: 'mensal', label: 'Mensal' },
            ]}
          />
          <Input label="Ciclo de reajuste (meses)" name="mesesCiclo" type="number" min={1} max={36} value={form.mesesCiclo} onChange={(e) => set('mesesCiclo', e.target.value)} />
          <Input label="Data do próximo reajuste" name="dataReajuste" type="date" value={form.dataReajuste} onChange={(e) => set('dataReajuste', e.target.value)} />
          <Input label="Sala / link de reunião" name="salaReuniao" value={form.salaReuniao} onChange={(e) => set('salaReuniao', e.target.value)} />
          {agendaIncompleta && (
            <p className="alert-error">
              Para gerar os agendamentos automaticamente, selecione os dias da
              semana <strong>e</strong> o horário.
            </p>
          )}
          {!editing && geraAgenda && (
            <p className="section-subtitle">
              Ao salvar, a agenda será gerada até a data de reajuste.
            </p>
          )}
          {editing && geraAgenda && (
            <p className="section-subtitle">
              Alterar dias/horário/frequência regenera as sessões futuras ainda não realizadas.
            </p>
          )}
        </Card>

        <Card>
          <h2 className="section-subtitle">Faturamento</h2>
          <Input label="Valor por sessão (R$)" name="valor" type="number" min={0} step="0.01" value={form.valor} onChange={(e) => set('valor', e.target.value)} />
          <Select
            label="Tipo de faturamento"
            name="tipoFaturamento"
            value={form.tipoFaturamento}
            onChange={(e) => set('tipoFaturamento', e.target.value as 'imediato' | 'pacote')}
            options={[
              { value: 'imediato', label: 'Imediato (por sessão)' },
              { value: 'pacote', label: 'Pacote (nota agrupada)' },
            ]}
          />
          <Input label="Sessões por nota (vazio = automático)" name="qtdSessoesNota" type="number" min={1} max={200} value={form.qtdSessoesNota} onChange={(e) => set('qtdSessoesNota', e.target.value)} />
        </Card>

        <div className="button-group">
          <Button type="submit" disabled={busy}>
            {busy ? 'Salvando…' : editing ? 'Salvar alterações' : 'Criar paciente'}
          </Button>
          <Button type="button" variant="secondary" onClick={() => navigate(-1)}>
            Cancelar
          </Button>
        </div>
      </form>
    </div>
  )
}
