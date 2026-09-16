import { z } from 'zod'

const uuid = z.uuid()
const isoDateTime = z
  .string()
  .refine((s) => !isNaN(new Date(s).getTime()), 'Data/hora inválida')

export const appointmentStatusEnum = z.enum([
  'scheduled',
  'confirmed',
  'completed',
  'cancelled',
  'rescheduled',
  'no_show',
])

export const listAppointmentsSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  patientId: uuid.optional(),
  status: appointmentStatusEnum.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(200),
})

export const createAppointmentSchema = z.object({
  patientId: uuid,
  startsAt: isoDateTime,
  duracao: z.coerce.number().int().min(10).max(480).default(50),
  status: appointmentStatusEnum.default('scheduled'),
  valor: z.coerce.number().min(0).max(99_999_999.99).optional(),
  pagoEm: isoDateTime.optional(),
})

export const updateAppointmentSchema = z.object({
  startsAt: isoDateTime.optional(),
  duracao: z.coerce.number().int().min(10).max(480).optional(),
  status: appointmentStatusEnum.optional(),
  valor: z.coerce.number().min(0).max(99_999_999.99).optional(),
  pagoEm: isoDateTime.nullable().optional(),
})

export type ListAppointmentsQuery = z.infer<typeof listAppointmentsSchema>
export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>
export type UpdateAppointmentInput = z.infer<typeof updateAppointmentSchema>
export type AppointmentStatus = z.infer<typeof appointmentStatusEnum>
