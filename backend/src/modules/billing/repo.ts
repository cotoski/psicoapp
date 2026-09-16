import { and, count, eq, inArray, isNull, ne, sql } from 'drizzle-orm'
import type { DbLike } from '../../db/client.js'
import { appointments, patients } from '../../db/schema.js'

export class BillingRepo {
  constructor(private db: DbLike) {}

  // Sessões pendentes do mês corrente (spec B4): não faturadas, não canceladas.
  async pendingThisMonth(tenantId: string) {
    return this.db
      .select({
        patientId: patients.id,
        nome: patients.nome,
        tipoFaturamento: patients.tipoFaturamento,
        qtdSessoesNota: patients.qtdSessoesNota,
        sessionId: appointments.id,
        startsAt: appointments.startsAt,
        status: appointments.status,
        valor: appointments.valor,
        faturada: appointments.faturada,
      })
      .from(patients)
      .innerJoin(appointments, eq(appointments.patientId, patients.id))
      .where(
        and(
          eq(patients.tenantId, tenantId),
          eq(appointments.faturada, false),
          ne(appointments.status, 'cancelled'),
          isNull(appointments.deletedAt),
          sql`${appointments.startsAt} >= date_trunc('month', current_date)`,
          sql`${appointments.startsAt} < date_trunc('month', current_date) + interval '1 month'`,
        ),
      )
      .orderBy(patients.nome, appointments.startsAt)
  }

  // Marca faturada=true — IN tipado (sem interpolação; legado tinha SQLi).
  // Só linhas do tenant, ainda não faturadas, não deletadas.
  async markInvoiced(tenantId: string, ids: string[]) {
    return this.db
      .update(appointments)
      .set({ faturada: true })
      .where(
        and(
          eq(appointments.tenantId, tenantId),
          inArray(appointments.id, ids),
          eq(appointments.faturada, false),
          isNull(appointments.deletedAt),
        ),
      )
      .returning({ id: appointments.id })
  }

  // Lista as sessões faturadas com contato do paciente (retorno do invoice).
  async invoicedSessions(tenantId: string, ids: string[]) {
    if (ids.length === 0) return []
    return this.db
      .select({
        id: appointments.id,
        startsAt: appointments.startsAt,
        valor: appointments.valor,
        status: appointments.status,
        pacienteNome: patients.nome,
        pacienteEmail: patients.email,
        pacienteTelefone: patients.telefone,
      })
      .from(appointments)
      .innerJoin(patients, eq(appointments.patientId, patients.id))
      .where(
        and(eq(appointments.tenantId, tenantId), inArray(appointments.id, ids)),
      )
      .orderBy(appointments.startsAt)
  }

  // Resumo mensal (spec B4/B5): faturado, pendente, por status.
  async monthlySummary(tenantId: string, month: string) {
    const monthStart = `${month}-01`
    const [row] = await this.db
      .select({
        total: count(),
        realizadas: sql<number>`count(*) filter (where ${appointments.status} = 'completed')`,
        canceladas: sql<number>`count(*) filter (where ${appointments.status} = 'cancelled')`,
        noShows: sql<number>`count(*) filter (where ${appointments.status} = 'no_show')`,
        faturado: sql<string>`coalesce(sum(${appointments.valor}) filter (where ${appointments.faturada}), 0)`,
        pendenteFaturamento: sql<string>`coalesce(sum(${appointments.valor}) filter (where not ${appointments.faturada} and ${appointments.status} <> 'cancelled'), 0)`,
      })
      .from(appointments)
      .where(
        and(
          eq(appointments.tenantId, tenantId),
          isNull(appointments.deletedAt),
          sql`${appointments.startsAt} >= ${monthStart}::date`,
          sql`${appointments.startsAt} < (${monthStart}::date + interval '1 month')`,
        ),
      )
    return row
  }

  async dashboard(tenantId: string) {
    const [p, s, f] = await Promise.all([
      this.db
        .select({ total: count() })
        .from(patients)
        .where(
          and(
            eq(patients.tenantId, tenantId),
            isNull(patients.deletedAt),
            isNull(patients.archivedAt),
          ),
        ),
      this.db
        .select({
          total: count(),
          realizadas: sql<number>`count(*) filter (where ${appointments.status} = 'completed')`,
        })
        .from(appointments)
        .where(
          and(eq(appointments.tenantId, tenantId), isNull(appointments.deletedAt)),
        ),
      this.db
        .select({
          faturamento: sql<string>`coalesce(sum(${appointments.valor}), 0)`,
        })
        .from(appointments)
        .where(
          and(
            eq(appointments.tenantId, tenantId),
            isNull(appointments.deletedAt),
            eq(appointments.status, 'completed'),
          ),
        ),
    ])
    return { p: p[0], s: s[0], f: f[0] }
  }
}
