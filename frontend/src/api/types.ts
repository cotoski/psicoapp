export type WeekDay =
  | 'domingo' | 'segunda' | 'terca' | 'quarta' | 'quinta' | 'sexta' | 'sabado'

export type Frequencia = 'semanal' | 'quinzenal' | 'mensal'

export type AppointmentStatus =
  | 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'rescheduled' | 'no_show'

export interface Patient {
  id: string
  nome: string
  cpf: string | null
  telefone: string | null
  email: string | null
  dataNascimento: string | null
  anamnese: string | null
  valor: number
  tipoFaturamento: 'imediato' | 'pacote'
  qtdSessoesNota: number
  diasSemana: WeekDay[] | null
  horario: string | null
  frequenciaRecorrencia: Frequencia
  dataReajuste: string | null
  mesesCiclo: number
  salaReuniao: string | null
  archivedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface Appointment {
  id: string
  patientId: string
  patientNome?: string
  salaReuniao: string | null
  startsAt: string
  duracao: number
  status: AppointmentStatus
  valor: number
  pagoEm: string | null
  faturada: boolean
  createdAt: string
}

export interface Page<T> {
  data: T[]
  page: number
  limit: number
  total: number
}

export const WEEK_DAYS: { value: WeekDay; label: string }[] = [
  { value: 'segunda', label: 'Seg' },
  { value: 'terca', label: 'Ter' },
  { value: 'quarta', label: 'Qua' },
  { value: 'quinta', label: 'Qui' },
  { value: 'sexta', label: 'Sex' },
  { value: 'sabado', label: 'Sáb' },
  { value: 'domingo', label: 'Dom' },
]

export const STATUS_LABEL: Record<
  AppointmentStatus,
  { label: string; tone: 'success' | 'warning' | 'danger' | 'accent' }
> = {
  scheduled: { label: 'Agendada', tone: 'accent' },
  confirmed: { label: 'Confirmada', tone: 'accent' },
  completed: { label: 'Realizada', tone: 'success' },
  cancelled: { label: 'Cancelada', tone: 'danger' },
  rescheduled: { label: 'Remarcada', tone: 'warning' },
  no_show: { label: 'Falta', tone: 'warning' },
}
