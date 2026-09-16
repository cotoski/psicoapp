import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import request from 'supertest'
import type { Express } from 'express'
import { eq } from 'drizzle-orm'
import { createApp } from '../src/app.js'
import type { Db } from '../src/db/client.js'
import { auditEvents, patients, users } from '../src/db/schema.js'
import { encryptField, decryptField } from '../src/shared/crypto/fieldEncrypt.js'
import { testConfig, testDb, testLogger, truncateAll, registerUserAs } from './helpers.js'

const hasDb = Boolean(process.env.DATABASE_URL)
let app: Express
let db: Db | undefined

const validPatient = {
  nome: 'Maria Silva',
  cpf: '123.456.789-00',
  telefone: '11999998888',
  email: 'maria@x.test',
  dataNascimento: '1990-05-10',
  anamnese: 'Relato inicial de ansiedade generalizada',
  valor: 200,
  tipoFaturamento: 'pacote',
  diasSemana: ['segunda', 'quarta'],
  horario: '14:30',
  frequenciaRecorrencia: 'semanal',
  mesesCiclo: 6,
  salaReuniao: 'Sala 2',
}

describe.skipIf(!hasDb)('patients (integração)', () => {
  beforeAll(async () => {
    db = testDb()
    app = createApp({ config: testConfig(), logger: testLogger(), db })
  })

  beforeEach(async () => {
    await truncateAll(db!)
  })

  it('CRUD completo com defaults do legado (qtd sessões, data_reajuste)', async () => {
    const a = await registerUserAs(app, 'a@x.test')
    const auth = { Authorization: `Bearer ${a.token}` }

    const created = await request(app).post('/api/v1/patients').set(auth).send(validPatient)
    expect(created.status).toBe(201)
    const p = created.body
    // semanal + 2 dias = 4*2 = 8 sessões por nota (regra do legado)
    expect(p.qtdSessoesNota).toBe(8)
    expect(p.dataReajuste).toBeTruthy() // hoje + 6 meses
    expect(p.valor).toBe(200)
    expect(p.anamnese).toBe(validPatient.anamnese) // OWNER vê clínico

    const got = await request(app).get(`/api/v1/patients/${p.id}`).set(auth)
    expect(got.status).toBe(200)
    expect(got.body.nome).toBe('Maria Silva')

    const updated = await request(app)
      .put(`/api/v1/patients/${p.id}`)
      .set(auth)
      .send({ valor: 250, telefone: '11888887777' })
    expect(updated.status).toBe(200)
    expect(updated.body.valor).toBe(250)
    expect(updated.body.nome).toBe('Maria Silva') // campos não enviados preservados

    const del = await request(app).delete(`/api/v1/patients/${p.id}`).set(auth)
    expect(del.status).toBe(204)
    const gone = await request(app).get(`/api/v1/patients/${p.id}`).set(auth)
    expect(gone.status).toBe(404)
  })

  it('anamnese é ciphertext no banco, nunca texto puro', async () => {
    const a = await registerUserAs(app, 'a@x.test')
    const res = await request(app)
      .post('/api/v1/patients')
      .set('Authorization', `Bearer ${a.token}`)
      .send(validPatient)
    const [row] = await db!.select().from(patients).where(eq(patients.id, res.body.id))
    expect(Buffer.isBuffer(row.anamneseEnc)).toBe(true)
    expect(row.anamneseEnc!.includes(Buffer.from('ansiedade'))).toBe(false)
    expect(decryptField(row.anamneseEnc!, testConfig().FIELD_ENCRYPTION_KEY))
      .toBe(validPatient.anamnese)
  })

  it('IDOR: tenant B não lê/atualiza/arquiva/deleta paciente de A', async () => {
    const a = await registerUserAs(app, 'a@x.test')
    const b = await registerUserAs(app, 'b@x.test')
    const authA = { Authorization: `Bearer ${a.token}` }
    const authB = { Authorization: `Bearer ${b.token}` }

    const created = await request(app).post('/api/v1/patients').set(authA).send(validPatient)
    const id = created.body.id

    for (const [method, path, body] of [
      ['get', `/api/v1/patients/${id}`, undefined],
      ['put', `/api/v1/patients/${id}`, { valor: 1 }],
      ['post', `/api/v1/patients/${id}/archive`, {}],
      ['delete', `/api/v1/patients/${id}`, undefined],
    ] as const) {
      const r = await request(app)[method](path).set(authB).send(body as object)
      expect(r.status).toBe(404)
    }
    const list = await request(app).get('/api/v1/patients').set(authB)
    expect(list.body.total).toBe(0)
  })

  it('listagem paginada + busca por nome + filtro archived', async () => {
    const a = await registerUserAs(app, 'a@x.test')
    const auth = { Authorization: `Bearer ${a.token}` }
    for (const nome of ['Ana', 'Beatriz', 'Carla', 'Daniel', 'Eduarda']) {
      await request(app).post('/api/v1/patients').set(auth).send({ nome })
    }
    const p1 = await request(app).get('/api/v1/patients?limit=2&page=1').set(auth)
    expect(p1.body.data.length).toBe(2)
    expect(p1.body.total).toBe(5)
    const p3 = await request(app).get('/api/v1/patients?limit=2&page=3').set(auth)
    expect(p3.body.data.length).toBe(1)

    const busca = await request(app).get('/api/v1/patients?query=beat').set(auth)
    expect(busca.body.data.map((x: { nome: string }) => x.nome)).toEqual(['Beatriz'])

    // arquivar sai do filtro active
    const id = p1.body.data[0].id
    await request(app).post(`/api/v1/patients/${id}/archive`).set(auth)
    const active = await request(app).get('/api/v1/patients').set(auth)
    expect(active.body.total).toBe(4)
    const archived = await request(app).get('/api/v1/patients?status=archived').set(auth)
    expect(archived.body.total).toBe(1)
    // unarchive volta ao active
    await request(app).post(`/api/v1/patients/${id}/unarchive`).set(auth)
    const back = await request(app).get('/api/v1/patients').set(auth)
    expect(back.body.total).toBe(5)
  })

  it('validação: nome curto, CPF inválido, status enum inválido → 400', async () => {
    const a = await registerUserAs(app, 'a@x.test')
    const auth = { Authorization: `Bearer ${a.token}` }
    for (const bad of [
      { nome: 'X' },
      { nome: 'Ok', cpf: '12345' },
      { nome: 'Ok', valor: -10 },
      { nome: 'Ok', tipoFaturamento: 'avulso' },
      { nome: 'Ok', diasSemana: ['monday'] },
    ]) {
      const r = await request(app).post('/api/v1/patients').set(auth).send(bad)
      expect(r.status).toBe(400)
      expect(r.body.error.code).toBe('VALIDATION_ERROR')
    }
    const badId = await request(app).get('/api/v1/patients/nao-e-uuid').set(auth)
    expect(badId.status).toBe(404)
  })

  it('RBAC: ASSISTANT cria/lê paciente mas anamnese vem null', async () => {
    const a = await registerUserAs(app, 'a@x.test')
    // rebaixa o próprio usuário para ASSISTANT no banco
    await db!.update(users).set({ role: 'ASSISTANT' }).where(eq(users.id, a.userId))
    const auth = { Authorization: `Bearer ${a.token}` }

    const created = await request(app).post('/api/v1/patients').set(auth).send(validPatient)
    expect(created.status).toBe(201)
    expect(created.body.anamnese).toBeNull() // clínico oculto

    const got = await request(app).get(`/api/v1/patients/${created.body.id}`).set(auth)
    expect(got.body.anamnese).toBeNull()

    // archive exige patients:archive — ASSISTANT não tem
    const arc = await request(app)
      .post(`/api/v1/patients/${created.body.id}/archive`)
      .set(auth)
    expect(arc.status).toBe(403)
  })

  it('auditoria: PATIENT_CREATED/UPDATED/ARCHIVED/DELETED emitidos', async () => {
    const a = await registerUserAs(app, 'a@x.test')
    const auth = { Authorization: `Bearer ${a.token}` }
    const created = await request(app).post('/api/v1/patients').set(auth).send({ nome: 'Teste Audit' })
    const id = created.body.id
    await request(app).put(`/api/v1/patients/${id}`).set(auth).send({ valor: 99 })
    await request(app).post(`/api/v1/patients/${id}/archive`).set(auth)
    await request(app).delete(`/api/v1/patients/${id}`).set(auth)

    const evts = await db!
      .select({ action: auditEvents.action })
      .from(auditEvents)
      .where(eq(auditEvents.resourceId, id))
    const actions = evts.map((e) => e.action)
    for (const expected of [
      'PATIENT_CREATED',
      'PATIENT_UPDATED',
      'PATIENT_ARCHIVED',
      'PATIENT_DELETED',
    ]) {
      expect(actions).toContain(expected)
    }
  })

  it('rotas exigem auth', async () => {
    const r = await request(app).get('/api/v1/patients')
    expect(r.status).toBe(401)
  })
})

describe('fieldEncrypt (unitário)', () => {
  const key = 'x'.repeat(48)
  it('roundtrip + iv aleatório', () => {
    const a = encryptField('sigilo clínico', key)
    const b = encryptField('sigilo clínico', key)
    expect(a.equals(b)).toBe(false) // ivs diferentes
    expect(decryptField(a, key)).toBe('sigilo clínico')
    expect(decryptField(b, key)).toBe('sigilo clínico')
  })
  it('chave errada falha (auth tag)', () => {
    const enc = encryptField('segredo', key)
    expect(() => decryptField(enc, 'y'.repeat(48))).toThrow()
  })
  it('blob adulterado falha', () => {
    const enc = encryptField('segredo', key)
    enc[enc.length - 1] ^= 0xff
    expect(() => decryptField(enc, key)).toThrow()
  })
})
