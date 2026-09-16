import { z } from 'zod'

export const registerSchema = z.object({
  email: z.email(),
  password: z.string().min(8, 'Senha deve ter ao menos 8 caracteres').max(128),
  nome: z.string().trim().min(2).max(255),
  crp: z.string().trim().max(20).optional(),
  tenantName: z.string().trim().min(2).max(255),
})

export const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1).max(128),
})

export type RegisterInput = z.infer<typeof registerSchema>
export type LoginInput = z.infer<typeof loginSchema>
