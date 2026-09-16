import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  DATABASE_URL: z
    .string()
    .regex(/^postgres(ql)?:\/\//, 'DATABASE_URL deve ser uma URL postgres://'),
  // Segredos sem fallback: a aplicação não sobe sem valores explícitos.
  JWT_SECRET: z.string().min(32, 'JWT_SECRET deve ter ao menos 32 caracteres'),
  // AES-256-GCM (campos clínicos) — parse de base64/hex refinado na T-008
  FIELD_ENCRYPTION_KEY: z
    .string()
    .min(32, 'FIELD_ENCRYPTION_KEY deve ter ao menos 32 caracteres'),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
})

export type Config = z.infer<typeof envSchema> & { corsOrigins: string[] }

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = envSchema.safeParse(env)
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n')
    throw new Error(`Configuração de ambiente inválida:\n${issues}`)
  }
  const corsOrigins = result.data.CORS_ORIGIN.split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return { ...result.data, corsOrigins }
}
