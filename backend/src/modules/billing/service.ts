import type { Db } from '../../db/client.js'
import { recordAudit } from '../audit/service.js'
import { groupPending } from './billing.js'
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
    await recordAudit(this.db, {
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: 'INVOICE_CREATED',
      resourceType: 'billing',
      result: 'success',
      ip: actor.ip,
      requestId: actor.requestId,
    })
    return { total, sessoes }
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
    const { p, s, f } = await this.repo.dashboard(actor.tenantId)
    return {
      pacientes: Number(p.total),
      sessoesTotal: Number(s.total),
      sessoesRealizadas: Number(s.realizadas),
      faturamento: Number(f.faturamento),
    }
  }
}
