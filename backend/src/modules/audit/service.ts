import type { Db } from '../../db/client.js'
import { auditEvents } from '../../db/schema.js'

export interface AuditEntry {
  tenantId?: string | null
  actorUserId?: string | null
  action: string
  resourceType?: string
  resourceId?: string
  ip?: string
  requestId?: string
  result?: 'success' | 'denied' | 'error'
}

// Audit trail de negócio — NUNCA registrar conteúdo clínico (plano §12).
export async function recordAudit(db: Db, entry: AuditEntry): Promise<void> {
  await db.insert(auditEvents).values({
    tenantId: entry.tenantId ?? null,
    actorUserId: entry.actorUserId ?? null,
    action: entry.action,
    resourceType: entry.resourceType,
    resourceId: entry.resourceId,
    ip: entry.ip,
    requestId: entry.requestId,
    result: entry.result,
  })
}
