import type { Db } from '../../db/client.js'
import { recordAudit } from '../audit/service.js'
import { groupPending } from './billing.js'
import { buildNota, type NotaDocumento } from './invoiceDoc.js'
import type { Regime } from '../tax/taxCalculations.js'
import { BillingRepo } from './repo.js'
import type { InvoiceInput, SummaryQuery } from './schemas.js'

interface ActorCtx {
  tenantId: string
  userId: string
  ip?: string
  requestId?: string
}

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7)
}

export class BillingService {
  private repo: BillingRepo

  constructor(private db: Db) {
    this.repo = new BillingRepo(db)
  }

  async pending(actor: ActorCtx) {
    const rows = await this.repo.pendingThisMonth(actor.tenantId)
    return groupPending(
      rows.map((r) => ({
        patientId: r.patientId,
        nome: r.nome,
        tipoFaturamento: r.tipoFaturamento,
        qtdSessoesNota: r.qtdSessoesNota,
        session: {
          id: r.sessionId,
          startsAt:
            r.startsAt instanceof Date ? r.startsAt.toISOString() : String(r.startsAt),
          status: r.status,
          valor: Number(r.valor),
          faturada: r.faturada,
        },
      })),
    )
  }

  async invoice(actor: ActorCtx, input: InvoiceInput) {
    // Atualiza só IDs do tenant ainda não faturados; depois retorna o que foi
    // efetivamente marcado — IDs estranhos são ignorados silenciosamente.
    const marked = await this.repo.markInvoiced(actor.tenantId, input.appointmentIds)
    const ids = marked.map((m) => m.id)
    const sessoes = await this.repo.invoicedSessions(actor.tenantId, ids)
    const total = sessoes.reduce((sum, s) => sum + Number(s.valor || 0), 0)

    // Uma nota por paciente — documento interno (prévia no estilo NFS-e).
    const [prestador, tax] = await Promise.all([
      this.repo.prestadorInfo(actor.tenantId, actor.userId),
      this.repo.taxConfig(actor.tenantId),
    ])
    const competencia = currentMonth()
    const emitidaEm = new Date()
    const byPatient = new Map<string, typeof sessoes>()
    for (const s of sessoes) {
      const list = byPatient.get(s.patientId) ?? []
      list.push(s)
      byPatient.set(s.patientId, list)
    }
    const notas: NotaDocumento[] = [...byPatient.entries()].map(([, rows]) =>
      buildNota({
        prestador,
        tomador: {
          nome: rows[0].pacienteNome,
          cpf: rows[0].pacienteCpf,
          email: rows[0].pacienteEmail,
          telefone: rows[0].pacienteTelefone,
        },
        sessoes: rows.map((r) => ({
          id: r.id,
          startsAt:
            r.startsAt instanceof Date ? r.startsAt.toISOString() : String(r.startsAt),
          valor: Number(r.valor),
        })),
        regime: (tax?.regime as Regime | null) ?? null,
        municipio: tax?.municipio ?? null,
        competencia,
        emitidaEm,
      }),
    )

    await recordAudit(this.db, {
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: 'INVOICE_CREATED',
      resourceType: 'billing',
      result: 'success',
      ip: actor.ip,
      requestId: actor.requestId,
    })
    return { total, sessoes, notas }
  }

  // Sessões já faturadas no mês — reconstrói as notas por paciente
  // (mesmo documento gerado na emissão).
  async invoiced(actor: ActorCtx, q: SummaryQuery) {
    const month = q.month ?? currentMonth()
    const rows = await this.repo.invoicedInMonth(actor.tenantId, month)
    const [prestador, tax] = await Promise.all([
      this.repo.prestadorInfo(actor.tenantId, actor.userId),
      this.repo.taxConfig(actor.tenantId),
    ])
    const byPatient = new Map<string, typeof rows>()
    for (const r of rows) {
      const list = byPatient.get(r.patientId) ?? []
      list.push(r)
      byPatient.set(r.patientId, list)
    }
    const notas: NotaDocumento[] = [...byPatient.entries()].map(([, rs]) =>
      buildNota({
        prestador,
        tomador: {
          nome: rs[0].pacienteNome,
          cpf: rs[0].pacienteCpf,
          email: rs[0].pacienteEmail,
          telefone: rs[0].pacienteTelefone,
        },
        sessoes: rs.map((r) => ({
          id: r.id,
          startsAt:
            r.startsAt instanceof Date ? r.startsAt.toISOString() : String(r.startsAt),
          valor: Number(r.valor),
        })),
        regime: (tax?.regime as Regime | null) ?? null,
        municipio: tax?.municipio ?? null,
        competencia: month,
        emitidaEm: new Date(),
      }),
    )
    return {
      month,
      total: rows.reduce((s, r) => s + Number(r.valor || 0), 0),
      notas,
    }
  }

  async monthlySummary(actor: ActorCtx, q: SummaryQuery) {
    const month = q.month ?? currentMonth()
    const r = await this.repo.monthlySummary(actor.tenantId, month)
    return {
      month,
      sessoes: Number(r.total),
      realizadas: Number(r.realizadas),
      canceladas: Number(r.canceladas),
      noShows: Number(r.noShows),
      faturado: Number(r.faturado),
      pendenteFaturamento: Number(r.pendenteFaturamento),
    }
  }

  async dashboard(actor: ActorCtx) {
    const { p, s, f, reaj } = await this.repo.dashboard(actor.tenantId)
    return {
      pacientes: Number(p.total),
      sessoesTotal: Number(s.total),
      sessoesRealizadas: Number(s.realizadas),
      faturamento: Number(f.faturamento),
      // Pacientes ativos com data_reajuste vencida (precisam renovar o ciclo)
      reajustesPendentes: reaj.map((r) => ({
        id: r.id,
        nome: r.nome,
        dataReajuste: r.dataReajuste,
        valor: Number(r.valor),
      })),
    }
  }
}
