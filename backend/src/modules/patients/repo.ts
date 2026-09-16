import { and, count, eq, ilike, isNull, isNotNull } from 'drizzle-orm'
import type { Db } from '../../db/client.js'
import { patients } from '../../db/schema.js'
import type { ListPatientsQuery } from './schemas.js'

export type PatientRow = typeof patients.$inferSelect

// Toda query recebe tenantId explicitamente — nunca confiar em id da URL.
export class PatientsRepo {
  constructor(private db: Db) {}

  async list(tenantId: string, q: ListPatientsQuery) {
    const filters = [
      eq(patients.tenantId, tenantId),
      isNull(patients.deletedAt),
      q.status === 'active'
        ? isNull(patients.archivedAt)
        : q.status === 'archived'
          ? isNotNull(patients.archivedAt)
          : undefined,
      q.query ? ilike(patients.nome, `%${q.query}%`) : undefined,
    ].filter((f) => f !== undefined)

    const where = and(...filters)
    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select()
        .from(patients)
        .where(where)
        .orderBy(patients.nome)
        .limit(q.limit)
        .offset((q.page - 1) * q.limit),
      this.db.select({ total: count() }).from(patients).where(where),
    ])
    return { rows, total }
  }

  async findById(tenantId: string, id: string): Promise<PatientRow | undefined> {
    const [row] = await this.db
      .select()
      .from(patients)
      .where(
        and(
          eq(patients.id, id),
          eq(patients.tenantId, tenantId),
          isNull(patients.deletedAt),
        ),
      )
      .limit(1)
    return row
  }

  async create(tenantId: string, values: Omit<typeof patients.$inferInsert, 'tenantId'>) {
    const [row] = await this.db
      .insert(patients)
      .values({ ...values, tenantId })
      .returning()
    return row
  }

  async update(tenantId: string, id: string, values: Partial<typeof patients.$inferInsert>) {
    const [row] = await this.db
      .update(patients)
      .set(values)
      .where(
        and(
          eq(patients.id, id),
          eq(patients.tenantId, tenantId),
          isNull(patients.deletedAt),
        ),
      )
      .returning()
    return row
  }
}
