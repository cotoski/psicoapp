import type { Db } from '../../db/client.js'
import { sessionRecords } from '../../db/schema.js'
import type { Config } from '../../config.js'
import { AppError } from '../../shared/errors.js'
import { encryptField, decryptField } from '../../shared/crypto/fieldEncrypt.js'
import { recordAudit } from '../audit/service.js'
import { RecordsRepo, type SessionRecordRow } from './repo.js'
import type { UpsertRecordInput } from './schemas.js'

interface ActorCtx {
  tenantId: string
  userId: string
  ip?: string
  requestId?: string
}

export class RecordsService {
  private repo: RecordsRepo

  constructor(
    private db: Db,
    private config: Config,
  ) {
    this.repo = new RecordsRepo(db)
  }

  private serialize(row: SessionRecordRow) {
    return {
      id: row.id,
      appointmentId: row.appointmentId,
      patientId: row.patientId,
      content: row.contentEnc
        ? decryptField(row.contentEnc, this.config.FIELD_ENCRYPTION_KEY)
        : null,
      estadoEmocional: row.estadoEmocional,
      temas: row.temas,
      tarefas: row.tarefas,
      legalHold: row.legalHold,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }
  }

  // Leitura auditada (plano §12): SESSION_VIEWED sem conteúdo clínico.
  async getByAppointment(actor: ActorCtx, appointmentId: string) {
    const appt = await this.repo.findAppointment(actor.tenantId, appointmentId)
    if (!appt)
      throw new AppError(404, 'APPOINTMENT_NOT_FOUND', 'Agendamento não encontrado')
    const row = await this.repo.findByAppointment(actor.tenantId, appointmentId)
    await recordAudit(this.db, {
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: 'SESSION_VIEWED',
      resourceType: 'session_record',
      resourceId: row?.id ?? null,
      result: row ? 'success' : 'denied',
      ip: actor.ip,
      requestId: actor.requestId,
    })
    if (!row) return null
    return this.serialize(row)
  }

  async upsert(actor: ActorCtx, appointmentId: string, input: UpsertRecordInput) {
    const appt = await this.repo.findAppointment(actor.tenantId, appointmentId)
    if (!appt)
      throw new AppError(404, 'APPOINTMENT_NOT_FOUND', 'Agendamento não encontrado')

    const existing = await this.repo.findByAppointment(actor.tenantId, appointmentId)
    // legal_hold protege retenção: uma vez marcado, não pode ser desmarcado
    // (destrava só via processo fora do app — decisão de compliance).
    if (existing?.legalHold && input.legalHold === false) {
      throw new AppError(
        409,
        'LEGAL_HOLD',
        'Registro sob retenção legal — legal_hold não pode ser removido',
      )
    }

    const values: Partial<typeof sessionRecords.$inferInsert> = {}
    if (input.content !== undefined)
      values.contentEnc = encryptField(input.content, this.config.FIELD_ENCRYPTION_KEY)
    if (input.estadoEmocional !== undefined)
      values.estadoEmocional = input.estadoEmocional
    if (input.temas !== undefined) values.temas = input.temas
    if (input.tarefas !== undefined) values.tarefas = input.tarefas
    if (input.legalHold !== undefined) values.legalHold = input.legalHold

    const row = await this.repo.upsert(
      actor.tenantId,
      appointmentId,
      appt.patientId,
      values,
    )
    await recordAudit(this.db, {
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: existing ? 'SESSION_UPDATED' : 'SESSION_CREATED',
      resourceType: 'session_record',
      resourceId: row.id,
      result: 'success',
      ip: actor.ip,
      requestId: actor.requestId,
    })
    return this.serialize(row)
  }
}
