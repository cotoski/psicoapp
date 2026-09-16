import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import type { Express } from 'express'
import { createApp } from '../src/app.js'
import type { Db } from '../src/db/client.js'
import { sessionRecords } from '../src/db/schema.js'
import { eq } from 'drizzle-orm'
import { testConfig, testDb, testLogger, truncateAll, registerUserAs } from './helpers.js'

// Gate 1 — Clinical Safety: cobertura automatizada do OWASP top-5
// (broken access control, injection, XSS, security misconfiguration,
// rate limiting) + garantias técnicas da retenção CFP (≥5 anos).

const hasDb = Boolean(process.env.DATABASE_URL)
let app: Express
let db: Db | undefined

const SECRET = 'x'.repeat(48)

function b64url(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString('base64url')
}

describe.skipIf(!hasDb)('security — OWASP top-5 (integração)', () => {
  beforeAll(async () => {
    db = testDb()
    app = createApp({ config: testConfig(), logger: testLogger(), db })
  })

  beforeEach(async () => {
    await truncateAll(db!)
  })

  describe('A01 — broken access control', () => {
    it('sem Authorization → 401', async () => {
      const res = await request(app).get('/api/v1/patients')
      expect(res.status).toBe(401)
    })

    it('Bearer com lixo → 401', async () => {
      const res = await request(app)
        .get('/api/v1/patients')
        .set('Authorization', 'Bearer nao-e-um-jwt')
      expect(res.status).toBe(401)
    })

    it('JWT alg=none forjado → 401', async () => {
      const forged =
        b64url({ alg: 'none', typ: 'JWT' }) +
        '.' +
        b64url({ sub: 'x', tid: 'x', role: 'OWNER', iss: 'psicoapp', aud: 'psicoapp-api' }) +
        '.'
      const res = await request(app)
        .get('/api/v1/patients')
        .set('Authorization', `Bearer ${forged}`)
      expect(res.status).toBe(401)
    })

    it('JWT assinado com secret errado → 401', async () => {
      const forged = jwt.sign(
        { sub: 'x', tid: 'x', role: 'OWNER' },
        'wrong-secret-wrong-secret-wrong-0000',
        { issuer: 'psicoapp', audience: 'psicoapp-api' },
      )
      const res = await request(app)
        .get('/api/v1/patients')
        .set('Authorization', `Bearer ${forged}`)
      expect(res.status).toBe(401)
    })

    it('JWT válido mas issuer errado → 401', async () => {
      const forged = jwt.sign({ sub: 'x', tid: 'x', role: 'OWNER' }, SECRET, {
        issuer: 'evil',
        audience: 'psicoapp-api',
      })
      const res = await request(app)
        .get('/api/v1/patients')
        .set('Authorization', `Bearer ${forged}`)
      expect(res.status).toBe(401)
    })

    it('IDOR: prontuário de outro tenant → 404', async () => {
      const a = await registerUserAs(app, 'sec-a@x.test')
      const b = await registerUserAs(app, 'sec-b@x.test')
      const authB = { Authorization: `Bearer ${b.token}` }

      const p = await request(app)
        .post('/api/v1/patients')
        .set(authB)
        .send({ nome: 'Paciente B' })
      const appt = await request(app)
        .post('/api/v1/appointments')
        .set(authB)
        .send({ patientId: p.body.id, startsAt: '2099-01-10T10:00:00' })
      await request(app)
        .put(`/api/v1/appointments/${appt.body.id}/record`)
        .set(authB)
        .send({ content: 'sigiloso' })

      const res = await request(app)
        .get(`/api/v1/appointments/${appt.body.id}/record`)
        .set('Authorization', `Bearer ${a.token}`)
      expect(res.status).toBe(404)
    })
  })

  describe('A03 — injection', () => {
    it('SQLi no nome do paciente é armazenado como texto, não executado', async () => {
      const a = await registerUserAs(app, 'sqli@x.test')
      const auth = { Authorization: `Bearer ${a.token}` }
      const payload = `'); DROP TABLE patients;--`

      const create = await request(app)
        .post('/api/v1/patients')
        .set(auth)
        .send({ nome: payload })
      expect(create.status).toBe(201)
      expect(create.body.nome).toBe(payload)

      // tabela continua existindo e a busca parametrizada não quebra
      const list = await request(app)
        .get(`/api/v1/patients?query=${encodeURIComponent("' OR '1'='1")}`)
        .set(auth)
      expect(list.status).toBe(200)
      expect(Array.isArray(list.body.data)).toBe(true)
    })
  })

  describe('A03 — XSS', () => {
    it('payload <script> é persistido verbatim e servido como JSON', async () => {
      const a = await registerUserAs(app, 'xss@x.test')
      const auth = { Authorization: `Bearer ${a.token}` }
      const payload = '<script>alert(1)</script>'

      const create = await request(app)
        .post('/api/v1/patients')
        .set(auth)
        .send({ nome: payload })
      expect(create.status).toBe(201)
      expect(create.body.nome).toBe(payload)
      // API nunca renderiza HTML — o escape é responsabilidade do React
      expect(create.headers['content-type']).toContain('application/json')
    })
  })

  describe('A05 — security misconfiguration', () => {
    it('headers do helmet presentes; x-powered-by ausente', async () => {
      const res = await request(app).get('/health')
      expect(res.headers['x-frame-options']).toBe('SAMEORIGIN')
      expect(res.headers['x-content-type-options']).toBe('nosniff')
      expect(res.headers['content-security-policy']).toBeTruthy()
      expect(res.headers['x-powered-by']).toBeUndefined()
    })

    it('CORS rejeita origem não listada', async () => {
      const res = await request(app)
        .get('/health')
        .set('Origin', 'https://evil.example.com')
      expect(res.headers['access-control-allow-origin']).toBeUndefined()
    })
  })

  describe('A07 — auth failures / rate limit', () => {
    it('11ª tentativa de login → 429 com Retry-After', async () => {
      for (let i = 0; i < 10; i++) {
        const res = await request(app)
          .post('/api/v1/auth/login')
          .send({ email: 'ninguem@x.test', password: 'senha-errada-123' })
        expect(res.status).toBe(401)
      }
      const blocked = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'ninguem@x.test', password: 'senha-errada-123' })
      expect(blocked.status).toBe(429)
      expect(blocked.headers['retry-after']).toBeTruthy()
      expect(blocked.body.error.code).toBe('RATE_LIMITED')
    })
  })

  describe('retenção CFP — prontuários nunca são purgados', () => {
    async function seedRecord() {
      const a = await registerUserAs(app, 'cfp@x.test')
      const auth = { Authorization: `Bearer ${a.token}` }
      const p = await request(app)
        .post('/api/v1/patients')
        .set(auth)
        .send({ nome: 'Paciente Retenção' })
      const appt = await request(app)
        .post('/api/v1/appointments')
        .set(auth)
        .send({ patientId: p.body.id, startsAt: '2099-02-10T10:00:00' })
      await request(app)
        .put(`/api/v1/appointments/${appt.body.id}/record`)
        .set(auth)
        .send({ content: 'evolução clínica' })
      return { auth, patientId: p.body.id as string, appointmentId: appt.body.id as string }
    }

    async function recordRows(appointmentId: string) {
      return db!.select().from(sessionRecords).where(eq(sessionRecords.appointmentId, appointmentId))
    }

    it('DELETE /appointments/:id é soft — registro clínico permanece no banco', async () => {
      const { auth, appointmentId } = await seedRecord()
      const del = await request(app)
        .delete(`/api/v1/appointments/${appointmentId}`)
        .set(auth)
      expect(del.status).toBe(204)
      const rows = await recordRows(appointmentId)
      expect(rows).toHaveLength(1)
      expect(rows[0].deletedAt).toBeNull()
    })

    it('DELETE /patients/:id é soft — prontuários do paciente permanecem', async () => {
      const { auth, patientId, appointmentId } = await seedRecord()
      const del = await request(app)
        .delete(`/api/v1/patients/${patientId}`)
        .set(auth)
      expect(del.status).toBe(204)
      expect(await recordRows(appointmentId)).toHaveLength(1)
    })

    it('FK bloqueia hard-delete de agendamento com prontuário', async () => {
      const { appointmentId } = await seedRecord()
      await expect(
        db!.execute(`DELETE FROM appointments WHERE id = '${appointmentId}'`),
      ).rejects.toThrow()
      expect(await recordRows(appointmentId)).toHaveLength(1)
    })

    it('não existe endpoint de delete para /record', async () => {
      const { auth, appointmentId } = await seedRecord()
      const del = await request(app)
        .delete(`/api/v1/appointments/${appointmentId}/record`)
        .set(auth)
      expect([404, 405]).toContain(del.status)
      expect(await recordRows(appointmentId)).toHaveLength(1)
    })
  })
})
