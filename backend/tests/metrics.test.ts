import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import type { Express } from 'express'
import { createApp } from '../src/app.js'
import { testConfig, testDb, testLogger } from './helpers.js'

const hasDb = Boolean(process.env.DATABASE_URL)

describe.skipIf(!hasDb)('metrics (integração)', () => {
  let app: Express
  beforeAll(() => {
    app = createApp({ config: testConfig(), logger: testLogger(), db: testDb() })
  })

  it('GET /metrics expõe formato Prometheus com métricas da app', async () => {
    // gera tráfego: 401 (auth failure) + health ok + 404
    await request(app).get('/api/v1/patients')
    await request(app).get('/health/live')
    await request(app).get('/api/v1/nao-existe')

    const res = await request(app).get('/metrics')
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toContain('text/plain')
    const body = res.text
    expect(body).toContain('http_request_duration_seconds')
    expect(body).toContain('auth_failures_total')
    expect(body).toContain('permission_denied_total')
    // counter de auth realmente incrementou
    expect(body).toMatch(/auth_failures_total\{code="UNAUTHORIZED"\} [1-9]/)
    // métricas default do node (processo, GC etc.)
    expect(body).toContain('process_cpu')
  })

  it('labels de rota usam path normalizado (sem vazamento de ids)', async () => {
    const res = await request(app).get('/metrics')
    // rotas devem aparecer como /api/v1/patients, nunca com UUID
    expect(res.text).not.toMatch(/route="[^"]*[0-9a-f]{8}-[0-9a-f]{4}/)
  })
})
