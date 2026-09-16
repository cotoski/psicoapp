import { z } from 'zod'

const money = z.coerce.number().min(0).max(999_999_999.99)

export const taxConfigSchema = z.object({
  regime: z.enum(['pf', 'simples', 'presumido']).optional(),
  municipio: z.string().trim().min(2).max(10).optional(),
  faturamentoAnual: money.optional(),
  folhaPagamentoAnual: money.optional(),
  prolaboreAnual: money.optional(),
})

export const fatorRSchema = z.object({
  faturamentoAnual: money.refine((v) => v > 0, 'Faturamento deve ser maior que zero'),
  folhaPagamentoAnual: money.default(0),
})

export const simulateSchema = z.object({
  valor: money.refine((v) => v > 0, 'Valor deve ser maior que zero'),
  municipio: z.string().trim().min(2).max(10).default('sp'),
  regime: z.enum(['pf', 'simples', 'presumido']).optional(),
})

export type TaxConfigInput = z.infer<typeof taxConfigSchema>
export type FatorRInputSchema = z.infer<typeof fatorRSchema>
export type SimulateInput = z.infer<typeof simulateSchema>
