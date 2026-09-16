import { eq } from 'drizzle-orm'
import type { Db } from '../../db/client.js'
import { taxConfig } from '../../db/schema.js'
import { recordAudit } from '../audit/service.js'
import {
  calcularFatorR,
  calcularImpostos,
  simularAjusteParaAnexoIII,
  type Regime,
} from './taxCalculations.js'
import type { FatorRInputSchema, SimulateInput, TaxConfigInput } from './schemas.js'

interface ActorCtx {
  tenantId: string
  userId: string
  ip?: string
  requestId?: string
}

export class TaxService {
  constructor(private db: Db) {}

  private async findConfig(tenantId: string) {
    const [row] = await this.db
      .select()
      .from(taxConfig)
      .where(eq(taxConfig.tenantId, tenantId))
      .limit(1)
    return row
  }

  async getConfig(actor: ActorCtx) {
    const row = await this.findConfig(actor.tenantId)
    return {
      regime: row?.regime ?? null,
      municipio: row?.municipio ?? null,
      faturamentoAnual: row?.faturamentoAnual ? Number(row.faturamentoAnual) : null,
      folhaPagamentoAnual: row?.folhaPagamentoAnual
        ? Number(row.folhaPagamentoAnual)
        : null,
      prolaboreAnual: row?.prolaboreAnual ? Number(row.prolaboreAnual) : null,
    }
  }

  async putConfig(actor: ActorCtx, input: TaxConfigInput) {
    const existing = await this.findConfig(actor.tenantId)
    const values = {
      regime: input.regime,
      municipio: input.municipio,
      faturamentoAnual:
        input.faturamentoAnual !== undefined ? String(input.faturamentoAnual) : undefined,
      folhaPagamentoAnual:
        input.folhaPagamentoAnual !== undefined
          ? String(input.folhaPagamentoAnual)
          : undefined,
      prolaboreAnual:
        input.prolaboreAnual !== undefined ? String(input.prolaboreAnual) : undefined,
    }
    if (existing) {
      await this.db
        .update(taxConfig)
        .set(values)
        .where(eq(taxConfig.tenantId, actor.tenantId))
    } else {
      await this.db.insert(taxConfig).values({ tenantId: actor.tenantId, ...values })
    }
    await recordAudit(this.db, {
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: 'TAX_CONFIG_UPDATED',
      resourceType: 'tax_config',
      result: 'success',
      ip: actor.ip,
      requestId: actor.requestId,
    })
    return this.getConfig(actor)
  }

  async fatorR(actor: ActorCtx, input: FatorRInputSchema) {
    const result = calcularFatorR({
      faturamentoAnual: input.faturamentoAnual,
      folhaPagamentoAnual: input.folhaPagamentoAnual,
    })
    const simulacao = result.atingiuLimiar
      ? null
      : simularAjusteParaAnexoIII(
          input.faturamentoAnual,
          input.folhaPagamentoAnual,
        )
    await recordAudit(this.db, {
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: 'TAX_FATOR_R_CALCULATED',
      resourceType: 'tax_config',
      result: 'success',
      ip: actor.ip,
      requestId: actor.requestId,
    })
    return { ...result, simulacao }
  }

  async simulate(actor: ActorCtx, input: SimulateInput) {
    const impostos = calcularImpostos(input.valor, input.municipio)
    // sem regime informado → retorna os três; com regime → só ele
    if (!input.regime) return impostos
    return { [input.regime]: impostos[input.regime as Regime] }
  }
}
