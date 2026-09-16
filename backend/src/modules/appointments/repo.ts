import { and, asc, count, eq, gte, isNull, sql } from 'drizzle-orm'
import type { DbLike } from '../../db/client.js'
import { appointments, patients } from '../../db/schema.js'
import type { ListAppointmentsQuery } from './schemas.js'

export type AppointmentRow = typeof appointments.$inferSelect

export class AppointmentsRepo {
  constructor(private db: DbLike) {}

  async list(tenantId: string, q: ListAppointmentsQuery) {
    const filters = [
      eq(appointments.tenantId, tenantId),
      isNull(appointments.deletedAt),
      // from/to são datas (YYYY-MM-DD) — compara a parte de data, como o legado (data_hora::date)
      q.from ? sql`${appointments.startsAt}::date >= ${q.from}::date` : undefined,
      q.to ? sql`${appointments.startsAt}::date <= ${q.to}::date` : undefined,
      q.patientId ? eq(appointments.patientId, q.patientId) : undefined,
      q.status ? eq(appointments.status, q.status) : undefined,
    ].filter((f) => f !== undefined)
    const where = and(...filters)

    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select({
          appointment: appointments,
          patientNome: patients.nome,
          patientSala: patients.salaReuniao,
        })
        .from(appointments)
        .innerJoin(patients, eq(appointments.patientId, patients.id))
        .where(where)
        .orderBy(asc(appointments.startsAt))
        .limit(q.limit)
        .offset((q.page - 1) * q.limit),
      this.db.select({ total: count() }).from(appointments).where(where),
    ])
    return { rows, total }
  }

  async findById(tenantId: string, id: string): Promise<AppointmentRow | undefined> {
    const [row] = await this.db
      .select()
      .from(appointments)
      .where(
        and(
          eq(appointments.id, id),
          eq(appointments.tenantId, tenantId),
          isNull(appointments.deletedAt),
        ),
      )
      .limit(1)
    return row
  }

  async create(values: typeof appointments.$inferInsert) {
    const [row] = await this.db.insert(appointments).values(values).returning()
    return row
  }

  async update(tenantId: string, id: string, values: Partial<typeof appointments.$inferInsert>) {
    const [row] = await this.db
      .update(appointments)
      .set(values)
      .where(
        and(
          eq(appointments.id, id),
          eq(appointments.tenantId, tenantId),
          isNull(appointments.deletedAt),
        ),
      )
      .returning()
    return row
  }

  // Idempotente: UNIQUE(patient_id, starts_at) + conflito ignorado (spec B1)
  async insertOccurrences(values: (typeof appointments.$inferInsert)[]) {
    if (values.length === 0) return 0
    const rows = await this.db
      .insert(appointments)
      .values(values)
      .onConflictDoNothing({ target: [appointments.patientId, appointments.startsAt] })
      .returning({ id: appointments.id })
    return rows.length
  }

  // Regeneração (spec B1.1): só apaga futuros agendados, não faturados
  // e sem prontuário (equivalente ao notas='' do legado).
  async deleteRegenerable(tenantId: string, patientId: string, from: Date) {
    const rows = await this.db
      .delete(appointments)
      .where(
        and(
          eq(appointments.tenantId, tenantId),
          eq(appointments.patientId, patientId),
          eq(appointments.status, 'scheduled'),
          eq(appointments.faturada, false),
          gte(appointments.startsAt, from),
          sql`NOT EXISTS (
            SELECT 1 FROM session_records sr
            WHERE sr.appointment_id = ${appointments.id}
          )`,
        ),
      )
      .returning({ id: appointments.id })
    return rows.length
  }

  async findPatient(tenantId: string, patientId: string) {
    const [row] = await this.db
      .select()
      .from(patients)
      .where(
        and(
          eq(patients.id, patientId),
          eq(patients.tenantId, tenantId),
          isNull(patients.deletedAt),
        ),
      )
      .limit(1)
    return row
  }
}
