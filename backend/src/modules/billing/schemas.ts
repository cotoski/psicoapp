import { z } from 'zod'

export const invoiceSchema = z.object({
  appointmentIds: z.array(z.uuid()).min(1).max(500),
})

export const summarySchema = z.object({
  // YYYY-MM; default = mês corrente
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use formato YYYY-MM')
    .optional(),
})

export type InvoiceInput = z.infer<typeof invoiceSchema>
export type SummaryQuery = z.infer<typeof summarySchema>
