import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import request from 'supertest'
import type { Express } from 'express'
import { eq } from 'drizzle-orm'
import { createApp } from '../src/app.js'
import type { Db } from '../src/db/client.js'
import { users } from '../src/db/schema.js'
import { groupPending } from '../src/modules/billing/billing.js'
import { testConfig, testDb, testLogger, truncateAll, registerUserAs } from './helpers.js'

const hasDb = Boolean(process.env.DATABASE_URL)
let app: Express
let db: Db | undefined

// 15º dia do mês corrente — sempre dentro do intervalo do pending
function thisMonth(day: number, time = '10:00'): string {
  const n = new Date()
  const m = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`
  return `${m}-${String(day).padStart(2, '0')}T${time}:00`
}
const monthParam = () => thisMonth(1).slice(0, 7)

async function mkPatient(auth: Record<string, string>, body: object) {
  const r = await request(app).post('/api/v1/patients').set(auth).send(body)
  expect(r.status).toBe(201)
  return r.body.id as string
}
async function mkAppt(auth: Record<string, string>, patientId: string, body: object) {
  const r = await request(app)
    .post('/api/v1/appointments')
    .set(auth)
    .send({ patientId, ...body })
  expect(r.status).toBe(201)
  return r.body.id as string
}

describe('billing.groupPending (unitário — spec B4)', () => {
  it('agrupa por paciente; pronto = imediato OU pendente >= qtd_sessoes_nota', () => {
    const groups = groupPending([
      {
        patientId: 'p1', nome: 'Ana', tipoFaturamento: 'imediato', qtdSessoesNota: 1,
        session: { id: 's1', startsAt: 'x', status: 'completed', valor: 200, faturada: false },
      },
      {
        patientId: 'p2', nome: 'Bia', tipoFaturamento: 'pacote', qtdSessoesNota: 4,
        session: { id: 's2', startsAt: 'x', status: 'completed', valor: 100, faturada: false },
      },
      {
        patientId: 'p2', nome: 'Bia', tipoFaturamento: 'pacote', qtdSessoesNota: 4,
        session: { id: 's3', startsAt: 'y', status: 'completed', valor: 100, faturada: false },
      },
      {
        patientId: 'p3', nome: 'Cid', tipoFaturamento: 'pacote', qtdSessoesNota: 2,
        session: { id: 's4', startsAt: 'z', status: 'completed', valor: 80, faturada: false },
      },
      {
        patientId: 'p3', nome: 'Cid', tipoFaturamento: 'pacote', qtdSessoesNota: 2,
        session: { id: 's5', startsAt: 'w', status: 'completed', valor: 80, faturada: false },
      },
    ])
    const byId = Object.fromEntries(groups.map((g) => [g.id, g]))
    expect(byId.p1.pronto).toBe(true) // imediato sempre pronto
    expect(byId.p2.pronto).toBe(false) // 2 < 4
    expect(byId.p2.pendente).toBe(2)
    expect(byId.p2.valorTotal).toBe(200)
    expect(byId.p3.pronto).toBe(true) // 2 >= 2
  })
})

describe.skipIf(!hasDb)('billing + finance (integração)', () => {
  beforeAll(async () => {
    db = testDb()
    app = createApp({ config: testConfig(), logger: testLogger(), db })
  })

  beforeEach(async () => {
    await truncateAll(db!)
  })

  it('pending: só mês corrente, não faturadas, não canceladas, agrupado', async () => {
    const a = await registerUserAs(app, 'a@x.test')
    const auth = { Authorization: `Bearer ${a.token}` }
    const pacote = await mkPatient(auth, {
      nome: 'Pacote', valor: 100, tipoFaturamento: 'pacote', qtdSessoesNota: 4,
    })
    const imediato = await mkPatient(auth, {
      nome: 'Imediato', valor: 250, tipoFaturamento: 'imediato',
    })
    await mkAppt(auth, pacote, { startsAt: thisMonth(10) })
    const cancel = await mkAppt(auth, pacote, { startsAt: thisMonth(12) })
    await mkAppt(auth, imediato, { startsAt: thisMonth(15) })
    // fora do mês corrente — não pode aparecer
    await mkAppt(auth, pacote, { startsAt: '2099-12-10T10:00:00' })
    // cancelada — não conta
    await request(app)
      .put(`/api/v1/appointments/${cancel}`)
      .set(auth)
      .send({ status: 'cancelled' })

    const res = await request(app).get('/api/v1/billing/pending').set(auth)
    expect(res.status).toBe(200)
    const byNome = Object.fromEntries(
      res.body.map((g: { nome: string }) => [g.nome, g]),
    )
    expect(byNome['Pacote'].pendente).toBe(1) // cancelada e fora-do-mês fora
    expect(byNome['Pacote'].pronto).toBe(false) // 1 < 4
    expect(byNome['Imediato'].pendente).toBe(1)
    expect(byNome['Imediato'].pronto).toBe(true) // imediato sempre pronto
  })

  it('invoice: marca faturada, retorna total + contato; ids alheios ignorados', async () => {
    const a = await registerUserAs(app, 'a@x.test')
    const b = await registerUserAs(app, 'b@x.test')
    const authA = { Authorization: `Bearer ${a.token}` }
    const authB = { Authorization: `Bearer ${b.token}` }

    const pa = await mkPatient(authA, { nome: 'PacA', valor: 100, email: 'pa@x.test' })
    const pb = await mkPatient(authB, { nome: 'PacB', valor: 500 })
    const s1 = await mkAppt(authA, pa, { startsAt: thisMonth(10) })
    const s2 = await mkAppt(authA, pa, { startsAt: thisMonth(11) })
    const sB = await mkAppt(authB, pb, { startsAt: thisMonth(10) })

    const res = await request(app)
      .post('/api/v1/billing/invoice')
      .set(authA)
      .send({ appointmentIds: [s1, s2, sB] }) // sB é de B — deve ser ignorado
    expect(res.status).toBe(200)
    expect(res.body.total).toBe(200) // 2×100, sem os 500 de B
    expect(res.body.sessoes.length).toBe(2)
    expect(res.body.sessoes[0].pacienteNome).toBe('PacA')
    expect(res.body.sessoes[0].pacienteEmail).toBe('pa@x.test')

    // sB continua não faturada no tenant B
    const checkB = await request(app)
      .get(`/api/v1/appointments/${sB}`)
      .set(authB)
    expect(checkB.body.faturada).toBe(false)

    // re-invoice dos mesmos ids → nada marcado
    const again = await request(app)
      .post('/api/v1/billing/invoice')
      .set(authA)
      .send({ appointmentIds: [s1, s2] })
    expect(again.body.total).toBe(0)
    expect(again.body.sessoes.length).toBe(0)
  })

  it('invoice rejeita payload malicioso (SQLi do legado corrigido)', async () => {
    const a = await registerUserAs(app, 'a@x.test')
    const auth = { Authorization: `Bearer ${a.token}` }
    const res = await request(app)
      .post('/api/v1/billing/invoice')
      .set(auth)
      .send({ appointmentIds: ["1'); DROP TABLE sessions;--", 'not-a-uuid'] })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
    // payload vazio também
    expect(
      (await request(app)
        .post('/api/v1/billing/invoice')
        .set(auth)
        .send({ appointmentIds: [] })).status,
    ).toBe(400)
  })

  it('finance/summary por mês + dashboard KPIs', async () => {
    const a = await registerUserAs(app, 'a@x.test')
    const auth = { Authorization: `Bearer ${a.token}` }
    const p = await mkPatient(auth, { nome: 'Fin', valor: 200 })
    const s1 = await mkAppt(auth, p, { startsAt: thisMonth(5) })
    await mkAppt(auth, p, { startsAt: thisMonth(6) })
    const cancel = await mkAppt(auth, p, { startsAt: thisMonth(7) })
    await request(app)
      .put(`/api/v1/appointments/${s1}`)
      .set(auth)
      .send({ status: 'completed' })
    await request(app)
      .put(`/api/v1/appointments/${cancel}`)
      .set(auth)
      .send({ status: 'cancelled' })
    await request(app)
      .post('/api/v1/billing/invoice')
      .set(auth)
      .send({ appointmentIds: [s1] })

    const sum = await request(app)
      .get(`/api/v1/finance/summary?month=${monthParam()}`)
      .set(auth)
    expect(sum.status).toBe(200)
    expect(sum.body.sessoes).toBe(3)
    expect(sum.body.realizadas).toBe(1)
    expect(sum.body.canceladas).toBe(1)
    expect(sum.body.faturado).toBe(200)
    expect(sum.body.pendenteFaturamento).toBe(200) // s2 scheduled não faturada

    const dash = await request(app).get('/api/v1/dashboard').set(auth)
    expect(dash.body.pacientes).toBe(1)
    expect(dash.body.sessoesTotal).toBe(3)
    expect(dash.body.sessoesRealizadas).toBe(1)
    expect(dash.body.faturamento).toBe(200)
  })

  it('IDOR e RBAC: pending/summary isolados; ASSISTANT não fatura', async () => {
    const a = await registerUserAs(app, 'a@x.test')
    const b = await registerUserAs(app, 'b@x.test')
    const authA = { Authorization: `Bearer ${a.token}` }
    const authB = { Authorization: `Bearer ${b.token}` }
    const pa = await mkPatient(authA, { nome: 'Só A', valor: 100 })
    const sa = await mkAppt(authA, pa, { startsAt: thisMonth(10) })

    const pendB = await request(app).get('/api/v1/billing/pending').set(authB)
    expect(pendB.body).toEqual([])

    // ASSISTANT tem billing:read mas não billing:create
    await db!.update(users).set({ role: 'ASSISTANT' }).where(eq(users.id, b.userId))
    expect((await request(app).get('/api/v1/billing/pending').set(authB)).status).toBe(200)
    const inv = await request(app)
      .post('/api/v1/billing/invoice')
      .set(authB)
      .send({ appointmentIds: [sa] })
    expect(inv.status).toBe(403)
  })
})
