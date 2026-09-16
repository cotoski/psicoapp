import { pino } from 'pino'
import type { Config } from '../config.js'

export function buildLogger(config: Pick<Config, 'LOG_LEVEL' | 'NODE_ENV'>) {
  return pino({
    level: config.LOG_LEVEL,
    base: { service: 'psicoapp-api', environment: config.NODE_ENV },
    // Nunca logar credenciais (plano §13)
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'res.headers["set-cookie"]',
        '*.password',
        '*.token',
        '*.secret',
      ],
      remove: true,
    },
    ...(config.NODE_ENV === 'development'
      ? { transport: { target: 'pino-pretty' } }
      : {}),
  })
}

export type Logger = ReturnType<typeof buildLogger>
