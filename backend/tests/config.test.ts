import { describe, expect, it } from 'vitest'
import { loadConfig } from '../src/config.js'

const validEnv = {
  DATABASE_URL: 'postgres://u:p@localhost:5432/db',
  JWT_SECRET: 'x'.repeat(48),
  FIELD_ENCRYPTION_KEY: 'y'.repeat(48),
}

describe('loadConfig', () => {
  it('parseia env mínimo válido e aplica defaults', () => {
    const config = loadConfig(validEnv)
    expect(config.PORT).toBe(3001)
    expect(config.NODE_ENV).toBe('development')
    expect(config.corsOrigins).toEqual(['http://localhost:3000'])
  })

  it('falha sem DATABASE_URL', () => {
    const { DATABASE_URL: _omit, ...env } = validEnv
    expect(() => loadConfig(env)).toThrow(/DATABASE_URL/)
  })

  it('falha sem JWT_SECRET — segredo nunca tem fallback', () => {
    const { JWT_SECRET: _omit, ...env } = validEnv
    expect(() => loadConfig(env)).toThrow(/JWT_SECRET/)
  })

  it('rejeita JWT_SECRET curto', () => {
    expect(() => loadConfig({ ...validEnv, JWT_SECRET: 'curto' })).toThrow(/JWT_SECRET/)
  })

  it('parseia múltiplas origens de CORS', () => {
    const config = loadConfig({
      ...validEnv,
      CORS_ORIGIN: 'https://app.psicoapp.com, https://staging.psicoapp.com',
    })
    expect(config.corsOrigins).toEqual([
      'https://app.psicoapp.com',
      'https://staging.psicoapp.com',
    ])
  })
})
