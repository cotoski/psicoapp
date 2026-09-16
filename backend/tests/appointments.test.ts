import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import request from 'supertest'
import type { Express } from 'express'
import { eq } from 'drizzle-orm'
import { createApp } from '../src/app.js'
import type { Db } from '../src/db/client.js'
import { appointments, sessionRecords } from '../src/db/schema.js'
import {
  generateOccurrences,
  todayISO,
  addMonths,
  toISODate,
} from '../src/modules/appointments/recurrence.js'
import { testConfig, testDb, testLogger, truncateAll, registerUserAs } from './helpers.js'

const hasDb = Boolean(process.env.DATABASE_URL)
let app: Express
let db: Db | undefined

const DIAS = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado']

const schedulePatient = {
  nome: 'Paciente Agenda',
  valor: 150,
  diasSemana: ['segunda', 'quarta'],
  horario: '09:00',
  frequenciaRecorrencia: 'semanal',
  mesesCiclo: 2,
}

async function createPatient(auth: Record<string, string>, body = schedulePatient) {
  const res = await request(app).post('/api/v1/patients').set(auth).send(body)
  expect(res.status).toBe(201)
  return res.body as { id: string; dataReajuste: string }
}

describe('recurrence (unitário — spec B1)', () => {
  const hoje = todayISO()
  const fim = addMonths(hoje, 2)

  it('semanal: mesmo dia-da-semana, passos de 7 dias, fim inclusivo', () => {
    const dow = DIAS[(new Date().getDay() + 2) % 7] // dia daqui a 2 dias
    const occ = generateOccurrences({
      diasSemana: [dow],
      horario: '10:30',
      frequencia: 'semanal',
      inicio: hoje,
      fim,
    })
    expect(occ.length).toBeGreaterThanOrEqual(8)
    const target = DIAS.indexOf(dow)
    for (let i = 0; i < occ.length; i++) {
      expect(occ[i].getDay()).toBe(target)
      expect(occ[i].getHours()).toBe(10)
      expect(occ[i].getMinutes()).toBe(30)
      if (i > 0) {
        expect((occ[i].getTime() - occ[i - 1].getTime()) / 86400000).toBe(7)
      }
      expect(toISODate(occ[i]) <= fim).toBe(true)
    }
  })

  it('quinzenal: passos de 14 dias', () => {
    const dow = DIAS[(new Date().getDay() + 1) % 7]
    const occ = generateOccurrences({
      diasSemana: [dow],
      horario: '08:00',
      frequencia: 'quinzenal',
      inicio: hoje,
      fim,
    })
    for (let i = 1; i < occ.length; i++) {
      expect((occ[i].getTime() - occ[i - 1].getTime()) / 86400000).toBe(14)
    }
  })

  it('mensal: primeira ocorrência do dia-da-semana em cada mês seguinte', () => {
    const occ = generateOccurrences({
      diasSemana: ['segunda'],
      horario: '08:00',
      frequencia: 'mensal',
      inicio: hoje,
      fim: addMonths(hoje, 4),
    })
    expect(occ.length).toBeGreaterThanOrEqual(3)
    for (const d of occ) expect(d.getDay()).toBe(1)
    // após a 1ª, cada uma é a 1ª segunda do mês (dia 1-7)
    for (let i = 1; i < occ.length; i++) {
      expect(occ[i].getDate()).toBeLessThanOrEqual(7)
      expect(occ[i].getMonth()).not.toBe(occ[i - 1].getMonth())
    }
  })

  it('origem = max(hoje, inicio): início no passado não gera retroativo', () => {
    const occ = generateOccurrences({
      diasSemana: [DIAS[new Date().getDay()]],
      horario: '09:00',
      frequencia: 'semanal',
      inicio: '2020-01-01',
      fim,
    })
    for (const d of occ) expect(toISODate(d) >= hoje).toBe(true)
  })

  it('múltiplos dias geram conjunto ordenado; sem horário/dias → vazio', () => {
    const dow1 = DIAS[new Date().getDay()]
    const dow2 = DIAS[(new Date().getDay() + 3) % 7]
    const occ = generateOccurrences({
      diasSemana: [dow2, dow1],
      horario: '19:00',
      frequencia: 'semanal',
      inicio: hoje,
      fim,
    })
    const sorted = [...occ].sort((a, b) => a.getTime() - b.getTime())
    expect(occ).toEqual(sorted)
    expect(
      generateOccurrences({ diasSemana: ['segunda'], horario: '', frequencia: 'semanal', inicio: hoje, fim }),
    ).toEqual([])
    expect(
      generateOccurrences({ diasSemana: [], horario: '09:00', frequencia: 'semanal', inicio: hoje, fim }),
    ).toEqual([])
  })

  it('inicio > fim → vazio', () => {
    expect(
      generateOccurrences({
        diasSemana: ['segunda'],
        horario: '09:00',
        frequencia: 'semanal',
        inicio: addMonths(hoje, 3),
        fim: hoje,
      }),
    ).toEqual([])
  })
})

describe.skipIf(!hasDb)('appointments (integração)', () => {
  beforeAll(async () => {
    db = testDb()
    app = createApp({ config: testConfig(), logger: testLogger(), db })
  })

  beforeEach(async () => {
    await truncateAll(db!)
  })

  it('criar paciente com agenda gera o ciclo (spec B1) — idempotente', async () => {
    const a = await registerUserAs(app, 'a@x.test')
    const auth = { Authorization: `Bearer ${a.token}` }
    const p = await createPatient(auth)

    const list = await request(app)
      .get(`/api/v1/appointments?patientId=${p.id}`)
      .set(auth)
    expect(list.body.total).toBeGreaterThanOrEqual(15) // ~17 em 2 meses
    const first = list.body.data[0]
    expect(first.duracao).toBe(50)
    expect(first.status).toBe('scheduled')
    expect(first.valor).toBe(150)
    expect(first.faturada).toBe(false)
    expect(first.patientNome).toBe('Paciente Agenda')
    // todos dentro de [hoje, dataReajuste]
    for (const appt of list.body.data) {
      expect(appt.startsAt.slice(0, 10) <= p.dataReajuste).toBe(true)
      expect(appt.startsAt.slice(0, 10) >= todayISO()).toBe(true)
    }
    const total1 = list.body.total

    // Regeneração com mesmos parâmetros não duplica (UNIQUE patient+starts_at)
    await request(app)
      .put(`/api/v1/patients/${p.id}`)
      .set(auth)
      .send({ diasSemana: ['segunda', 'quarta'], horario: '09:00' })
    const list2 = await request(app)
      .get(`/api/v1/appointments?patientId=${p.id}`)
      .set(auth)
    expect(list2.body.total).toBe(total1)
  })

  it('regeneração na edição preserva completado e com prontuário (spec B1.1)', async () => {
    const a = await registerUserAs(app, 'a@x.test')
    const auth = { Authorization: `Bearer ${a.token}` }
    const p = await createPatient(auth)
    const list = await request(app)
      .get(`/api/v1/appointments?patientId=${p.id}`)
      .set(auth)

    const completed = list.body.data[list.body.data.length - 1]
    await request(app)
      .put(`/api/v1/appointments/${completed.id}`)
      .set(auth)
      .send({ status: 'completed' })

    const withRecord = list.body.data[list.body.data.length - 2]
    await db!.insert(sessionRecords).values({
      tenantId: a.tenantId,
      appointmentId: withRecord.id,
      patientId: p.id,
    })

    const totalBefore = list.body.total
    // muda o horário → regenera futuros scheduled
    await request(app)
      .put(`/api/v1/patients/${p.id}`)
      .set(auth)
      .send({ horario: '15:00' })

    const after = await request(app)
      .get(`/api/v1/appointments?patientId=${p.id}&limit=500`)
      .set(auth)
    const byId = new Map<string, { startsAt: string; status: string }>(
      after.body.data.map((x: { id: string; startsAt: string; status: string }) => [x.id, x]),
    )

    // completado preservado com horário antigo
    expect(byId.get(completed.id)).toBeTruthy()
    expect(byId.get(completed.id)!.startsAt.slice(11, 16)).toBe('09:00')
    // com prontuário preservado
    expect(byId.get(withRecord.id)).toBeTruthy()
    expect(byId.get(withRecord.id)!.startsAt.slice(11, 16)).toBe('09:00')
    // os demais scheduled futuros passaram a 15:00
    // (exceto os preservados: completado e com prontuário, que eram scheduled)
    const preserved = new Set([completed.id, withRecord.id])
    const scheduled = after.body.data.filter(
      (x: { id: string; status: string }) =>
        x.status === 'scheduled' && !preserved.has(x.id),
    )
    expect(scheduled.length).toBeGreaterThan(0)
    for (const s of scheduled) {
      expect(s.startsAt.slice(11, 16)).toBe('15:00')
    }
    expect(after.body.total).toBeGreaterThanOrEqual(totalBefore)
  })

  it('renovar: data_reajuste += meses_ciclo e gera [anterior, nova] (spec B2)', async () => {
    const a = await registerUserAs(app, 'a@x.test')
    const auth = { Authorization: `Bearer ${a.token}` }
    const p = await createPatient(auth)
    const before = await request(app)
      .get(`/api/v1/appointments?patientId=${p.id}&limit=500`)
      .set(auth)

    const res = await request(app).post(`/api/v1/patients/${p.id}/renovar`).set(auth)
    expect(res.status).toBe(200)
    expect(res.body.dataReajuste).toBe(addMonths(p.dataReajuste, 2))

    const after = await request(app)
      .get(`/api/v1/appointments?patientId=${p.id}&limit=500`)
      .set(auth)
    expect(after.body.total).toBeGreaterThan(before.body.total)
    const last = after.body.data[after.body.data.length - 1]
    expect(last.startsAt.slice(0, 10) <= res.body.dataReajuste).toBe(true)
    expect(last.startsAt.slice(0, 10) > p.dataReajuste).toBe(true)
  })

  it('máquina de status: transições válidas e inválidas', async () => {
    const a = await registerUserAs(app, 'a@x.test')
    const auth = { Authorization: `Bearer ${a.token}` }
    const p = await createPatient(auth)
    const list = await request(app)
      .get(`/api/v1/appointments?patientId=${p.id}`)
      .set(auth)
    const [a1, a2] = list.body.data

    // scheduled → confirmed → completed
    expect(
      (await request(app).put(`/api/v1/appointments/${a1.id}`).set(auth).send({ status: 'confirmed' })).status,
    ).toBe(200)
    expect(
      (await request(app).put(`/api/v1/appointments/${a1.id}`).set(auth).send({ status: 'completed' })).status,
    ).toBe(200)
    // completed é terminal
    const bad = await request(app)
      .put(`/api/v1/appointments/${a1.id}`)
      .set(auth)
      .send({ status: 'scheduled' })
    expect(bad.status).toBe(409)
    expect(bad.body.error.code).toBe('INVALID_STATUS_TRANSITION')
    // scheduled → no_show ok; no_show terminal
    expect(
      (await request(app).put(`/api/v1/appointments/${a2.id}`).set(auth).send({ status: 'no_show' })).status,
    ).toBe(200)
    expect(
      (await request(app).put(`/api/v1/appointments/${a2.id}`).set(auth).send({ status: 'confirmed' })).status,
    ).toBe(409)
  })

  it('CRUD manual + IDOR cross-tenant', async () => {
    const a = await registerUserAs(app, 'a@x.test')
    const b = await registerUserAs(app, 'b@x.test')
    const authA = { Authorization: `Bearer ${a.token}` }
    const authB = { Authorization: `Bearer ${b.token}` }
    const p = await createPatient(authA)

    const created = await request(app)
      .post('/api/v1/appointments')
      .set(authA)
      .send({ patientId: p.id, startsAt: '2099-01-05T10:00:00' })
    expect(created.status).toBe(201)
    expect(created.body.valor).toBe(150) // default = valor do paciente

    const id = created.body.id
    expect((await request(app).get(`/api/v1/appointments/${id}`).set(authB)).status).toBe(404)
    expect(
      (await request(app).put(`/api/v1/appointments/${id}`).set(authB).send({ status: 'cancelled' })).status,
    ).toBe(404)
    expect((await request(app).delete(`/api/v1/appointments/${id}`).set(authB)).status).toBe(404)

    // patientId de outro tenant no create → 404
    expect(
      (await request(app)
        .post('/api/v1/appointments')
        .set(authB)
        .send({ patientId: p.id, startsAt: '2099-01-06T10:00:00' })).status,
    ).toBe(404)

    // delete próprio → soft delete
    expect((await request(app).delete(`/api/v1/appointments/${id}`).set(authA)).status).toBe(204)
    expect((await request(app).get(`/api/v1/appointments/${id}`).set(authA)).status).toBe(404)
    const [row] = await db!.select().from(appointments).where(eq(appointments.id, id))
    expect(row.deletedAt).toBeTruthy()
  })

  it('filtros from/to/status na listagem', async () => {
    const a = await registerUserAs(app, 'a@x.test')
    const auth = { Authorization: `Bearer ${a.token}` }
    const p = await createPatient(auth)
    const list = await request(app)
      .get(`/api/v1/appointments?patientId=${p.id}&limit=500`)
      .set(auth)
    const mid = list.body.data[3]
    const from = mid.startsAt.slice(0, 10)
    const filtered = await request(app)
      .get(`/api/v1/appointments?from=${from}&to=${from}`)
      .set(auth)
    expect(filtered.body.data.length).toBeGreaterThanOrEqual(1)
    for (const x of filtered.body.data) {
      expect(x.startsAt.slice(0, 10)).toBe(from)
    }
    await request(app)
      .put(`/api/v1/appointments/${mid.id}`)
      .set(auth)
      .send({ status: 'cancelled' })
    const cancelled = await request(app)
      .get('/api/v1/appointments?status=cancelled')
      .set(auth)
    expect(cancelled.body.data.every((x: { status: string }) => x.status === 'cancelled')).toBe(true)
  })
})
