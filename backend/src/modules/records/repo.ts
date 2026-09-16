import { and, eq, isNull } from 'drizzle-orm'
import type { DbLike } from '../../db/client.js'
import { appointments, sessionRecords } from '../../db/schema.js'

export type SessionRecordRow = typeof sessionRecords.$inferSelect

export class RecordsRepo {
  constructor(private db: DbLike) {}

  async findByAppointment(tenantId: string, appointmentId: string) {
    const [row] = await this.db
      .select()
      .from(sessionRecords)
      .where(
        and(
          eq(sessionRecords.appointmentId, appointmentId),
          eq(sessionRecords.tenantId, tenantId),
          isNull(sessionRecords.deletedAt),
        ),
      )
      .limit(1)
    return row
  }

  async findAppointment(tenantId: string, appointmentId: string) {
    const [row] = await this.db
      .select()
      .from(appointments)
      .where(
        and(
          eq(appointments.id, appointmentId),
          eq(appointments.tenantId, tenantId),
          isNull(appointments.deletedAt),
        ),
      )
      .limit(1)
    return row
  }

  async upsert(
    tenantId: string,
    appointmentId: string,
    patientId: string,
    values: Partial<typeof sessionRecords.$inferInsert>,
  ) {
    const [row] = await this.db
      .insert(sessionRecords)
      .values({ ...values, tenantId, appointmentId, patientId })
      .onConflictDoUpdate({
        target: sessionRecords.appointmentId,
        set: values,
      })
      .returning()
    return row
  }
}
