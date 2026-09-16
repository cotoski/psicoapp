import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import request from 'supertest'
import type { Express } from 'express'
import { and, eq } from 'drizzle-orm'
import { createApp } from '../src/app.js'
import type { Db } from '../src/db/client.js'
import { auditEvents, sessionRecords, users } from '../src/db/schema.js'
import { decryptField } from '../src/shared/crypto/fieldEncrypt.js'
import { testConfig, testDb, testLogger, truncateAll, registerUserAs } from './helpers.js'

const hasDb = Boolean(process.env.DATABASE_URL)
let app: Express
let db: Db | undefined

const clinicalPayload = {
  content: 'Paciente relatou melhora do quadro ansioso; trabalhamos reestruturação cognitiva.',
  estadoEmocional: 6,
  temas: ['ansiedade', 'trabalho'],
  tarefas: 'Diário de pensamentos automáticos',
}

async function setup(auth: Record<string, string>) {
  const p = await request(app)
    .post('/api/v1/patients')
    .set(auth)
    .send({ nome: 'Paciente Prontuário' })
  const appt = await request(app)
    .post('/api/v1/appointments')
    .set(auth)
    .send({ patientId: p.body.id, startsAt: '2099-03-10T14:00:00' })
  return { patientId: p.body.id as string, appointmentId: appt.body.id as string }
}

describe.skipIf(!hasDb)('session records (integração)', () => {
  beforeAll(async () => {
    db = testDb()
    app = createApp({ config: testConfig(), logger: testLogger(), db })
  })

  beforeEach(async () => {
    await truncateAll(db!)
  })

  it('PUT cria prontuário; conteúdo é ciphertext no banco; GET descriptografa', async () => {
    const a = await registerUserAs(app, 'a@x.test')
    const auth = { Authorization: `Bearer ${a.token}` }
    const { appointmentId } = await setup(auth)

    const put = await request(app)
      .put(`/api/v1/appointments/${appointmentId}/record`)
      .set(auth)
      .send(clinicalPayload)
    expect(put.status).toBe(200)
    expect(put.body.content).toBe(clinicalPayload.content)

    const [row] = await db!
      .select()
      .from(sessionRecords)
      .where(eq(sessionRecords.appointmentId, appointmentId))
    expect(Buffer.isBuffer(row.contentEnc)).toBe(true)
    expect(row.contentEnc!.includes(Buffer.from('ansioso'))).toBe(false)
    expect(decryptField(row.contentEnc!, testConfig().FIELD_ENCRYPTION_KEY))
      .toBe(clinicalPayload.content)

    const get = await request(app)
      .get(`/api/v1/appointments/${appointmentId}/record`)
      .set(auth)
    expect(get.status).toBe(200)
    expect(get.body.content).toBe(clinicalPayload.content)
    expect(get.body.temas).toEqual(['ansiedade', 'trabalho'])
  })

  it('upsert 1:1 — segundo PUT atualiza o mesmo registro', async () => {
    const a = await registerUserAs(app, 'a@x.test')
    const auth = { Authorization: `Bearer ${a.token}` }
    const { appointmentId } = await setup(auth)
    await request(app)
      .put(`/api/v1/appointments/${appointmentId}/record`)
      .set(auth)
      .send(clinicalPayload)
    const second = await request(app)
      .put(`/api/v1/appointments/${appointmentId}/record`)
      .set(auth)
      .send({ tarefas: 'Nova tarefa' })
    expect(second.status).toBe(200)
    const rows = await db!
      .select()
      .from(sessionRecords)
      .where(eq(sessionRecords.appointmentId, appointmentId))
    expect(rows.length).toBe(1)
    expect(second.body.content).toBe(clinicalPayload.content) // preservado
    expect(second.body.tarefas).toBe('Nova tarefa')
  })

  it('audit: SESSION_VIEWED registrado sem conteúdo clínico', async () => {
    const a = await registerUserAs(app, 'a@x.test')
    const auth = { Authorization: `Bearer ${a.token}` }
    const { appointmentId } = await setup(auth)
    await request(app)
      .put(`/api/v1/appointments/${appointmentId}/record`)
      .set(auth)
      .send(clinicalPayload)
    await request(app)
      .get(`/api/v1/appointments/${appointmentId}/record`)
      .set(auth)

    const evts = await db!
      .select()
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.action, 'SESSION_VIEWED'),
          eq(auditEvents.tenantId, a.tenantId),
        ),
      )
    expect(evts.length).toBe(1)
    const serialized = JSON.stringify(evts[0])
    expect(serialized).not.toContain('ansioso')
    expect(serialized).not.toContain('cognitiva')
  })

  it('IDOR: tenant B não lê nem escreve prontuário de A', async () => {
    const a = await registerUserAs(app, 'a@x.test')
    const b = await registerUserAs(app, 'b@x.test')
    const authA = { Authorization: `Bearer ${a.token}` }
    const authB = { Authorization: `Bearer ${b.token}` }
    const { appointmentId } = await setup(authA)
    await request(app)
      .put(`/api/v1/appointments/${appointmentId}/record`)
      .set(authA)
      .send(clinicalPayload)

    expect(
      (await request(app)
        .get(`/api/v1/appointments/${appointmentId}/record`)
        .set(authB)).status,
    ).toBe(404)
    expect(
      (await request(app)
        .put(`/api/v1/appointments/${appointmentId}/record`)
        .set(authB)
        .send({ content: 'invasão' })).status,
    ).toBe(404)
  })

  it('RBAC: ASSISTANT e ADMIN não acessam prontuário (records:*)', async () => {
    const a = await registerUserAs(app, 'a@x.test')
    const auth = { Authorization: `Bearer ${a.token}` }
    const { appointmentId } = await setup(auth)
    await request(app)
      .put(`/api/v1/appointments/${appointmentId}/record`)
      .set(auth)
      .send(clinicalPayload)

    for (const role of ['ASSISTANT', 'ADMIN'] as const) {
      await db!.update(users).set({ role }).where(eq(users.id, a.userId))
      expect(
        (await request(app)
          .get(`/api/v1/appointments/${appointmentId}/record`)
          .set(auth)).status,
      ).toBe(403)
      expect(
        (await request(app)
          .put(`/api/v1/appointments/${appointmentId}/record`)
          .set(auth)
          .send({ content: 'x' })).status,
      ).toBe(403)
    }
  })

  it('legal_hold: marcado não pode ser desmarcado', async () => {
    const a = await registerUserAs(app, 'a@x.test')
    const auth = { Authorization: `Bearer ${a.token}` }
    const { appointmentId } = await setup(auth)
    await request(app)
      .put(`/api/v1/appointments/${appointmentId}/record`)
      .set(auth)
      .send({ ...clinicalPayload, legalHold: true })

    const res = await request(app)
      .put(`/api/v1/appointments/${appointmentId}/record`)
      .set(auth)
      .send({ legalHold: false })
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('LEGAL_HOLD')

    // mas conteúdo ainda pode ser corrigido (legal hold ≠ freeze de edição)
    const upd = await request(app)
      .put(`/api/v1/appointments/${appointmentId}/record`)
      .set(auth)
      .send({ tarefas: 'Correção permitida' })
    expect(upd.status).toBe(200)
    expect(upd.body.legalHold).toBe(true)
  })

  it('prontuário inexistente → 404; agendamento inexistente → 404', async () => {
    const a = await registerUserAs(app, 'a@x.test')
    const auth = { Authorization: `Bearer ${a.token}` }
    const { appointmentId } = await setup(auth)
    expect(
      (await request(app)
        .get(`/api/v1/appointments/${appointmentId}/record`)
        .set(auth)).status,
    ).toBe(404)
    const fake = '00000000-0000-0000-0000-000000000000'
    expect(
      (await request(app)
        .get(`/api/v1/appointments/${fake}/record`)
        .set(auth)).status,
    ).toBe(404)
  })

  it('validação: estadoEmocional fora de 1-10 → 400', async () => {
    const a = await registerUserAs(app, 'a@x.test')
    const auth = { Authorization: `Bearer ${a.token}` }
    const { appointmentId } = await setup(auth)
    const res = await request(app)
      .put(`/api/v1/appointments/${appointmentId}/record`)
      .set(auth)
      .send({ estadoEmocional: 15 })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })
})
