import { and, count, eq, inArray, isNull, ne, sql } from 'drizzle-orm'
import type { DbLike } from '../../db/client.js'
import { appointments, patients, taxConfig, tenants, users } from '../../db/schema.js'

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
        patientId: patients.id,
        pacienteNome: patients.nome,
        pacienteCpf: patients.cpf,
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

  // Sessões faturadas em um mês (YYYY-MM) — alimenta a seção "faturadas".
  async invoicedInMonth(tenantId: string, month: string) {
    const monthStart = `${month}-01`
    return this.db
      .select({
        id: appointments.id,
        startsAt: appointments.startsAt,
        valor: appointments.valor,
        status: appointments.status,
        patientId: patients.id,
        pacienteNome: patients.nome,
        pacienteCpf: patients.cpf,
        pacienteEmail: patients.email,
        pacienteTelefone: patients.telefone,
      })
      .from(appointments)
      .innerJoin(patients, eq(appointments.patientId, patients.id))
      .where(
        and(
          eq(appointments.tenantId, tenantId),
          eq(appointments.faturada, true),
          isNull(appointments.deletedAt),
          sql`${appointments.startsAt} >= ${monthStart}::date`,
          sql`${appointments.startsAt} < (${monthStart}::date + interval '1 month')`,
        ),
      )
      .orderBy(patients.nome, appointments.startsAt)
  }

  // Dados do prestador para a nota: empresa do consultório + responsável (CRP).
  async prestadorInfo(tenantId: string, userId: string) {
    const [t] = await this.db
      .select()
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1)
    const [u] = await this.db
      .select({ nome: users.nome, crp: users.crp })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
    const endereco = t
      ? [
          [t.logradouro, t.numero].filter(Boolean).join(', '),
          t.complemento,
          t.bairro,
          [t.cidade, t.uf].filter(Boolean).join('/'),
          t.cep ? `CEP ${t.cep}` : null,
        ]
          .filter(Boolean)
          .join(' · ') || null
      : null
    return {
      nome: t?.name ?? '',
      responsavel: u?.nome ?? null,
      crp: u?.crp ?? null,
      cnpj: t?.cnpj ?? null,
      inscricaoMunicipal: t?.inscricaoMunicipal ?? null,
      endereco,
      email: t?.emailContato ?? null,
      telefone: t?.telefone ?? null,
    }
  }

  async taxConfig(tenantId: string) {
    const [row] = await this.db
      .select({ regime: taxConfig.regime, municipio: taxConfig.municipio })
      .from(taxConfig)
      .where(eq(taxConfig.tenantId, tenantId))
      .limit(1)
    return row
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
