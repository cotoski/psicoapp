import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import request from 'supertest'
import type { Express } from 'express'
import { eq } from 'drizzle-orm'
import { createApp } from '../src/app.js'
import type { Db } from '../src/db/client.js'
import { users } from '../src/db/schema.js'
import {
  calcularFatorR,
  simularAjusteParaAnexoIII,
  calcularImpostos,
} from '../src/modules/tax/taxCalculations.js'
import { testConfig, testDb, testLogger, truncateAll, registerUserAs } from './helpers.js'

const hasDb = Boolean(process.env.DATABASE_URL)
let app: Express
let db: Db | undefined

// SPEC_FATOR_R §7 — os 6 testes obrigatórios
describe('taxCalculations (SPEC §7)', () => {
  it('1. Fator R = exatamente 28% → Anexo III', () => {
    const r = calcularFatorR({ faturamentoAnual: 100_000, folhaPagamentoAnual: 28_000 })
    expect(r.anexo).toBe('III')
    expect(r.atingiuLimiar).toBe(true)
    expect(r.aliquotaEfetivaEstimada).toBeCloseTo(0.06)
  })

  it('2. Fator R = 27,9% → Anexo V', () => {
    const r = calcularFatorR({ faturamentoAnual: 100_000, folhaPagamentoAnual: 27_900 })
    expect(r.fatorR).toBeCloseTo(0.279)
    expect(r.anexo).toBe('V')
    expect(r.aliquotaEfetivaEstimada).toBeCloseTo(0.155)
  })

  it('3. faturamento 0 ou negativo → erro', () => {
    expect(() => calcularFatorR({ faturamentoAnual: 0, folhaPagamentoAnual: 1 })).toThrow()
    expect(() => calcularFatorR({ faturamentoAnual: -5, folhaPagamentoAnual: 1 })).toThrow()
  })

  it('4. já no Anexo III → adicional necessário = 0', () => {
    const s = simularAjusteParaAnexoIII(100_000, 30_000)
    expect(s.prolaboreAdicionalNecessario).toBe(0)
  })

  it('5. fat 96.000 + folha 18.000 → necessário 26.880, adicional 8.880', () => {
    const s = simularAjusteParaAnexoIII(96_000, 18_000)
    expect(s.prolaboreAnualNecessario).toBe(26_880)
    expect(s.prolaboreAdicionalNecessario).toBe(8_880)
    expect(s.economiaAnualEstimada).toBeCloseTo(96_000 * (0.155 - 0.06))
  })

  it('6. Math.ceil não deixa sugestão abaixo do limiar', () => {
    // 0.28 * faturamento não-inteiro: ex. 95_555 * 0.28 = 26_755.4 → ceil 26_756
    const fat = 95_555
    const s = simularAjusteParaAnexoIII(fat, 0)
    expect(s.prolaboreAnualNecessario / fat).toBeGreaterThanOrEqual(0.28)
  })
})

describe('calcularImpostos (spec B6)', () => {
  it('ISS por município + componentes por regime', () => {
    const r = calcularImpostos(100, 'rj')
    expect(r.pf.iss).toBeCloseTo(3) // rj 3%
    expect(r.pf.total).toBeCloseTo(100 * (0.03 + 0.15 + 0.1))
    expect(r.simples.total).toBeCloseTo(100 * (0.03 + 0.07))
    expect(r.presumido.total).toBeCloseTo(100 * (0.03 + 0.072 + 0.0965 + 0.15))
  })
  it('município desconhecido → ISS default 2%', () => {
    expect(calcularImpostos(100, 'xx').pf.iss).toBeCloseTo(2)
  })
})

describe.skipIf(!hasDb)('tax (integração)', () => {
  beforeAll(async () => {
    db = testDb()
    app = createApp({ config: testConfig(), logger: testLogger(), db })
  })

  beforeEach(async () => {
    await truncateAll(db!)
  })

  it('config: GET vazio → PUT persiste por tenant → GET retorna', async () => {
    const a = await registerUserAs(app, 'a@x.test')
    const auth = { Authorization: `Bearer ${a.token}` }

    const empty = await request(app).get('/api/v1/tax/config').set(auth)
    expect(empty.status).toBe(200)
    expect(empty.body.regime).toBeNull()

    const put = await request(app)
      .put('/api/v1/tax/config')
      .set(auth)
      .send({
        regime: 'simples',
        municipio: 'sp',
        faturamentoAnual: 96_000,
        folhaPagamentoAnual: 18_000,
      })
    expect(put.status).toBe(200)
    expect(put.body.regime).toBe('simples')
    expect(put.body.faturamentoAnual).toBe(96_000)

    const get = await request(app).get('/api/v1/tax/config').set(auth)
    expect(get.body.municipio).toBe('sp')
  })

  it('fator-r: cálculo sob demanda com simulação de ajuste', async () => {
    const a = await registerUserAs(app, 'a@x.test')
    const auth = { Authorization: `Bearer ${a.token}` }
    const res = await request(app)
      .post('/api/v1/tax/fator-r')
      .set(auth)
      .send({ faturamentoAnual: 96_000, folhaPagamentoAnual: 18_000 })
    expect(res.status).toBe(200)
    expect(res.body.anexo).toBe('V')
    expect(res.body.atingiuLimiar).toBe(false)
    expect(res.body.simulacao.prolaboreAnualNecessario).toBe(26_880)

    const ok = await request(app)
      .post('/api/v1/tax/fator-r')
      .set(auth)
      .send({ faturamentoAnual: 96_000, folhaPagamentoAnual: 30_000 })
    expect(ok.body.anexo).toBe('III')
    expect(ok.body.simulacao).toBeNull()

    // faturamento 0 → 400 (não 500)
    const bad = await request(app)
      .post('/api/v1/tax/fator-r')
      .set(auth)
      .send({ faturamentoAnual: 0 })
    expect(bad.status).toBe(400)
  })

  it('simulate: três regimes ou um só; isolamento de config entre tenants', async () => {
    const a = await registerUserAs(app, 'a@x.test')
    const b = await registerUserAs(app, 'b@x.test')
    const authA = { Authorization: `Bearer ${a.token}` }
    const authB = { Authorization: `Bearer ${b.token}` }

    await request(app)
      .put('/api/v1/tax/config')
      .set(authA)
      .send({ regime: 'simples', municipio: 'ba' })
    const getB = await request(app).get('/api/v1/tax/config').set(authB)
    expect(getB.body.regime).toBeNull() // config de A não vaza

    const all = await request(app)
      .post('/api/v1/tax/simulate')
      .set(authA)
      .send({ valor: 200, municipio: 'ba' })
    expect(all.body.pf.total).toBeCloseTo(200 * (0.05 + 0.15 + 0.1))
    const one = await request(app)
      .post('/api/v1/tax/simulate')
      .set(authA)
      .send({ valor: 200, municipio: 'ba', regime: 'simples' })
    expect(one.body.simples).toBeTruthy()
    expect(one.body.pf).toBeUndefined()
  })

  it('RBAC: ASSISTANT não acessa tax (sem tax:read)', async () => {
    const a = await registerUserAs(app, 'a@x.test')
    await db!.update(users).set({ role: 'ASSISTANT' }).where(eq(users.id, a.userId))
    const auth = { Authorization: `Bearer ${a.token}` }
    expect((await request(app).get('/api/v1/tax/config').set(auth)).status).toBe(403)
    expect(
      (await request(app)
        .post('/api/v1/tax/fator-r')
        .set(auth)
        .send({ faturamentoAnual: 1 })).status,
    ).toBe(403)
  })
})
