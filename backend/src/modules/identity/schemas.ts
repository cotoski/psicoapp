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

export const updateMeSchema = z.object({
  nome: z.string().trim().min(2).max(255).optional(),
  crp: z.string().trim().max(20).nullish(),
  email: z.email().optional(),
})

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(8, 'Senha deve ter ao menos 8 caracteres').max(128),
})

export const forgotPasswordSchema = z.object({
  email: z.email(),
})

export const resetPasswordSchema = z.object({
  token: z.string().min(1).max(255),
  newPassword: z.string().min(8, 'Senha deve ter ao menos 8 caracteres').max(128),
})

export const totpEnableSchema = z.object({
  code: z.string().trim().min(6).max(10),
})

export const totpDisableSchema = z.object({
  password: z.string().min(1).max(128),
  code: z.string().trim().min(6).max(10),
})

// Na etapa 2 o "code" também aceita código de backup (mais longo)
export const login2faSchema = z.object({
  pendingToken: z.string().min(1).max(2048),
  code: z.string().trim().min(6).max(32),
})

export type RegisterInput = z.infer<typeof registerSchema>
export type LoginInput = z.infer<typeof loginSchema>
export type UpdateMeInput = z.infer<typeof updateMeSchema>
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>
export type TotpEnableInput = z.infer<typeof totpEnableSchema>
export type TotpDisableInput = z.infer<typeof totpDisableSchema>
export type Login2faInput = z.infer<typeof login2faSchema>
