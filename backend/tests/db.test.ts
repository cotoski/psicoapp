import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { createDb, type Db } from '../src/db/client.js'
import { appointments, patients, sessionRecords, tenants, users } from '../src/db/schema.js'
import { testDbUrl } from './globalSetup.js'

const hasDb = Boolean(process.env.DATABASE_URL)
const db: Db | null = hasDb ? createDb(testDbUrl()) : null

// drizzle embrulha o erro do pg em `cause`; o SQLSTATE fica em .code
// 23505 = unique_violation · 23503 = foreign_key_violation · 22P02 = invalid input (enum)
function pgErrorCode(err: unknown): string | undefined {
  const e = err as { code?: string; cause?: { code?: string } }
  return e?.cause?.code ?? e?.code
}

async function expectPgError(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toSatisfy((err) => pgErrorCode(err) === code)
}

async function createTenant(name = 'T') {
  const [t] = await db!.insert(tenants).values({ name }).returning()
  return t
}

describe.skipIf(!hasDb)('schema v1', () => {
  beforeEach(async () => {
    await db!.execute(
      'TRUNCATE audit_events, session_records, appointments, patients, tax_config, refresh_tokens, users, tenants CASCADE',
    )
  })

  afterAll(async () => {
    await db!.$client.end()
  })

  it('aplicou as tabelas do modelo v1', async () => {
    const { rows } = await db!.execute<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' ORDER BY table_name`,
    )
    const names = rows.map((r) => r.table_name)
    for (const t of [
      'tenants',
      'users',
      'refresh_tokens',
      'patients',
      'appointments',
      'session_records',
      'tax_config',
      'audit_events',
    ]) {
      expect(names).toContain(t)
    }
  })

  it('patient exige tenant existente (FK)', async () => {
    await expectPgError(
      db!.insert(patients).values({
        tenantId: crypto.randomUUID(),
        nome: 'Órfão',
      }),
      '23503',
    )
  })

  it('email é único e case-insensitive (citext)', async () => {
    const tenant = await createTenant()
    const base = {
      tenantId: tenant.id,
      passwordHash: 'x',
      nome: 'U',
    }
    await db!.insert(users).values({ ...base, email: 'Demo@Psico.Local' })
    await expectPgError(
      db!.insert(users).values({ ...base, email: 'demo@psico.local' }),
      '23505',
    )
  })

  it('recorrência é idempotente: UNIQUE(patient_id, starts_at)', async () => {
    const tenant = await createTenant()
    const [patient] = await db!
      .insert(patients)
      .values({ tenantId: tenant.id, nome: 'P' })
      .returning()
    const appt = {
      tenantId: tenant.id,
      patientId: patient.id,
      startsAt: new Date('2026-09-21T14:00:00Z'),
    }
    await db!.insert(appointments).values(appt)
    await expectPgError(db!.insert(appointments).values(appt), '23505')
    // ON CONFLICT DO NOTHING não duplica nem falha
    const inserted = await db!
      .insert(appointments)
      .values(appt)
      .onConflictDoNothing()
      .returning()
    expect(inserted).toHaveLength(0)
    const all = await db!
      .select()
      .from(appointments)
      .where(eq(appointments.patientId, patient.id))
    expect(all).toHaveLength(1)
  })

  it('session_record vincula 1:1 ao appointment e guarda ciphertext', async () => {
    const tenant = await createTenant()
    const [patient] = await db!
      .insert(patients)
      .values({ tenantId: tenant.id, nome: 'P' })
      .returning()
    const [appt] = await db!
      .insert(appointments)
      .values({ tenantId: tenant.id, patientId: patient.id, startsAt: new Date() })
      .returning()
    const ciphertext = Buffer.from('iv:tag:ciphertext', 'utf8')
    await db!.insert(sessionRecords).values({
      tenantId: tenant.id,
      appointmentId: appt.id,
      patientId: patient.id,
      contentEnc: ciphertext,
    })
    await expectPgError(
      db!.insert(sessionRecords).values({
        tenantId: tenant.id,
        appointmentId: appt.id,
        patientId: patient.id,
      }),
      '23505',
    )
    const [rec] = await db!.select().from(sessionRecords)
    expect(rec.contentEnc).toBeInstanceOf(Buffer)
  })

  it('status inválido de appointment é rejeitado pelo enum', async () => {
    const tenant = await createTenant()
    const [patient] = await db!
      .insert(patients)
      .values({ tenantId: tenant.id, nome: 'P' })
      .returning()
    await expect(
      db!.execute(
        `INSERT INTO appointments (tenant_id, patient_id, starts_at, status)
         VALUES ('${tenant.id}', '${patient.id}', now(), 'bogus')`,
      ),
    ).rejects.toThrow()
  })
})
