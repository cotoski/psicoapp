import { z } from 'zod'

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use formato YYYY-MM-DD')
const timeString = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Use formato HH:MM')

const cpf = z
  .string()
  .regex(/^\d{3}\.\d{3}\.\d{3}-\d{2}$/, 'CPF no formato 000.000.000-00')
  .max(14)

export const weekDay = z.enum([
  'domingo',
  'segunda',
  'terca',
  'quarta',
  'quinta',
  'sexta',
  'sabado',
])

export const createPatientSchema = z.object({
  nome: z.string().trim().min(2).max(255),
  cpf: cpf.optional(),
  telefone: z.string().trim().max(50).optional(),
  email: z.email().max(255).optional(),
  dataNascimento: dateString.optional(),
  // Conteúdo clínico — criptografado em repouso, nunca em logs/audit
  anamnese: z.string().max(50_000).optional(),
  valor: z.coerce.number().min(0).max(99_999_999.99).default(0),
  tipoFaturamento: z.enum(['imediato', 'pacote']).default('imediato'),
  qtdSessoesNota: z.coerce.number().int().min(1).max(200).optional(),
  diasSemana: z.array(weekDay).max(7).optional(),
  horario: timeString.optional(),
  frequenciaRecorrencia: z
    .enum(['semanal', 'quinzenal', 'mensal'])
    .default('semanal'),
  dataReajuste: dateString.optional(),
  mesesCiclo: z.coerce.number().int().min(1).max(36).default(6),
  salaReuniao: z.string().trim().max(255).optional(),
})

export const updatePatientSchema = createPatientSchema.partial()

export const listPatientsSchema = z.object({
  query: z.string().trim().max(255).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['active', 'archived', 'all']).default('active'),
})

export type CreatePatientInput = z.infer<typeof createPatientSchema>
export type UpdatePatientInput = z.infer<typeof updatePatientSchema>
export type ListPatientsQuery = z.infer<typeof listPatientsSchema>
