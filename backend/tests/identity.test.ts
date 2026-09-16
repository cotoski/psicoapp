import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import type { Express } from 'express'
import { eq } from 'drizzle-orm'
import { createApp } from '../src/app.js'
import type { Db } from '../src/db/client.js'
import { auditEvents } from '../src/db/schema.js'
import { testConfig, testDb, testLogger, truncateAll } from './helpers.js'

const hasDb = Boolean(process.env.DATABASE_URL)
const db: Db | null = hasDb ? testDb() : null

let app: Express
function freshApp() {
  // App novo por teste → rate limiter limpo
  return createApp({ config: testConfig(), logger: testLogger(), db: db! })
}

function refreshCookieFrom(res: request.Response): string {
  const cookies = res.headers['set-cookie']
  const raw = (Array.isArray(cookies) ? cookies : [cookies])
    .filter(Boolean)
    .find((c) => c.startsWith('psicoapp_rt='))
  expect(raw, 'refresh cookie ausente').toBeTruthy()
  return raw!.split(';')[0]
}

const cred = {
  email: 'ana@clinica.test',
  password: 'senha-forte-123',
  nome: 'Dra. Ana',
  crp: '06/12345',
  tenantName: 'Clínica Ana',
}

async function registerUser(email = cred.email) {
  return request(app!).post('/api/v1/auth/register').send({ ...cred, email })
}

describe.skipIf(!hasDb)('identity', () => {
  beforeEach(async () => {
    await truncateAll(db!)
    app = freshApp()
  })

  afterAll(async () => {
    await db!.$client.end()
  })

  it('register cria tenant+user OWNER e retorna access token + cookie httpOnly', async () => {
    const res = await registerUser()
    expect(res.status).toBe(201)
    expect(res.body.accessToken).toBeTruthy()
    expect(res.body.user.role).toBe('OWNER')
    expect(res.body.user.email).toBe(cred.email)
    refreshCookieFrom(res)
    const setCookies = res.headers['set-cookie']
    const headerStr = Array.isArray(setCookies)
      ? setCookies.join('; ')
      : String(setCookies ?? '')
    expect(headerStr).toContain('HttpOnly')
    // access token decodifica com claims corretos
    const payload = jwt.decode(res.body.accessToken) as { sub: string; tid: string }
    expect(payload.sub).toBe(res.body.user.id)
    expect(payload.tid).toBeTruthy()
  })

  it('register com e-mail duplicado retorna 409 genérico', async () => {
    await registerUser()
    const res = await request(app).post('/api/v1/auth/register').send(cred)
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('EMAIL_IN_USE')
    expect(res.body.error.message).not.toMatch(/existe|cadastrado/i)
  })

  it('register com e-mail inválido retorna VALIDATION_ERROR', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ ...cred, email: 'nao-e-email' })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('login com senha errada → 401 e audit LOGIN_FAILURE', async () => {
    await registerUser()
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: cred.email, password: 'errada-123' })
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS')
    const events = await db!
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.action, 'LOGIN_FAILURE'))
    expect(events).toHaveLength(1)
    expect(events[0].result).toBe('denied')
  })

  it('login correto → tokens + audit LOGIN_SUCCESS', async () => {
    await registerUser()
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: cred.email, password: cred.password })
    expect(res.status).toBe(200)
    expect(res.body.accessToken).toBeTruthy()
    refreshCookieFrom(res)
    const events = await db!
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.action, 'LOGIN_SUCCESS'))
    expect(events.length).toBeGreaterThanOrEqual(1)
  })

  it('GET /auth/me exige token válido', async () => {
    await request(app).get('/api/v1/auth/me').expect(401)

    const reg = await registerUser()
    const me = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${reg.body.accessToken}`)
    expect(me.status).toBe(200)
    expect(me.body.email).toBe(cred.email)
  })

  it('token expirado → 401 TOKEN_EXPIRED', async () => {
    const reg = await registerUser()
    const expired = jwt.sign(
      { sub: reg.body.user.id, tid: 't', role: 'OWNER' },
      testConfig().JWT_SECRET,
      { expiresIn: '-10s', issuer: 'psicoapp', audience: 'psicoapp-api' },
    )
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${expired}`)
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('TOKEN_EXPIRED')
  })

  it('refresh rotaciona o token; reuso do antigo revoga toda a cadeia', async () => {
    const reg = await registerUser()
    const rt1 = refreshCookieFrom(reg)

    // rotação: rt1 → rt2
    const r1 = await request(app).post('/api/v1/auth/refresh').set('Cookie', rt1)
    expect(r1.status).toBe(200)
    const rt2 = refreshCookieFrom(r1)
    expect(rt2).not.toBe(rt1)

    // reuso de rt1 (revogado) → 401 + revogação da cadeia
    const reuse = await request(app).post('/api/v1/auth/refresh').set('Cookie', rt1)
    expect(reuse.status).toBe(401)

    // rt2 (válido) também morreu — prova da revogação em cadeia
    const chained = await request(app).post('/api/v1/auth/refresh').set('Cookie', rt2)
    expect(chained.status).toBe(401)

    // cada apresentação de token inválido é auditada (rt1 reuso + rt2 revogado em cadeia)
    const events = await db!
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.action, 'REFRESH_TOKEN_REUSED'))
    expect(events).toHaveLength(2)
  })

  it('logout revoga o refresh token e limpa o cookie', async () => {
    const reg = await registerUser()
    const rt = refreshCookieFrom(reg)

    const out = await request(app).post('/api/v1/auth/logout').set('Cookie', rt)
    expect(out.status).toBe(204)

    const res = await request(app).post('/api/v1/auth/refresh').set('Cookie', rt)
    expect(res.status).toBe(401)

    const events = await db!
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.action, 'LOGOUT'))
    expect(events).toHaveLength(1)
  })

  it('rate limit no login após 10 tentativas → 429', { timeout: 30000 }, async () => {
    await registerUser()
    for (let i = 0; i < 10; i++) {
      await request(app)
        .post('/api/v1/auth/login')
        .send({ email: cred.email, password: 'errada' })
    }
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: cred.email, password: 'errada' })
    expect(res.status).toBe(429)
  })
})
