import { describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { testConfig, testDb, testLogger } from './helpers.js'

const app = createApp({ config: testConfig(), logger: testLogger(), db: testDb() })

describe('health checks', () => {
  it('GET /health/live retorna 200', async () => {
    const res = await request(app).get('/health/live')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ status: 'ok' })
  })

  it('GET /health/ready retorna 200 sem dependências registradas', async () => {
    const res = await request(app).get('/health/ready')
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ready')
  })

  it('GET /health/ready retorna 503 quando dependência falha', async () => {
    const failing = createApp({
      config: testConfig(),
      logger: testLogger(),
      db: testDb(),
      readinessChecks: [
        {
          name: 'database',
          check: async () => {
            throw new Error('down')
          },
        },
      ],
    })
    const res = await request(failing).get('/health/ready')
    expect(res.status).toBe(503)
    expect(res.body).toEqual({ status: 'not_ready', checks: { database: 'fail' } })
  })
})

describe('convenções de API', () => {
  it('rota desconhecida retorna erro no formato padrão', async () => {
    const res = await request(app).get('/nao-existe')
    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('NOT_FOUND')
    expect(res.body.error.requestId).toBeTruthy()
    expect(res.body).not.toHaveProperty('stack')
  })

  it('rota de API desconhecida sem auth → 401 (default-deny, não revela rotas)', async () => {
    const res = await request(app).get('/api/v1/nao-existe')
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('UNAUTHORIZED')
  })

  it('gera x-request-id e ecoa o header quando fornecido', async () => {
    const res = await request(app).get('/health/live')
    expect(res.headers['x-request-id']).toBeTruthy()

    const custom = await request(app)
      .get('/health/live')
      .set('x-request-id', 'req-teste-123')
    expect(custom.headers['x-request-id']).toBe('req-teste-123')
  })

  it('rejeita JSON malformado com INVALID_JSON', async () => {
    const res = await request(app)
      .post('/api/v1/qualquer')
      .set('Content-Type', 'application/json')
      .send('{invalido')
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('INVALID_JSON')
  })

  it('security headers presentes (helmet)', async () => {
    const res = await request(app).get('/health/live')
    expect(res.headers['x-content-type-options']).toBe('nosniff')
    expect(res.headers['x-powered-by']).toBeUndefined()
  })
})
