import type { Db, DbLike } from '../../db/client.js'
import { AppError } from '../../shared/errors.js'
import { recordAudit } from '../audit/service.js'
import type { PatientRow } from '../patients/repo.js'
import { AppointmentsRepo, type AppointmentRow } from './repo.js'
import { generateOccurrences, todayISO, addMonths } from './recurrence.js'
import type {
  AppointmentStatus,
  CreateAppointmentInput,
  ListAppointmentsQuery,
  UpdateAppointmentInput,
} from './schemas.js'

interface ActorCtx {
  tenantId: string
  userId: string
  ip?: string
  requestId?: string
}

// Máquina de status (spec B7). completed/cancelled/no_show são terminais.
const TRANSITIONS: Record<AppointmentStatus, readonly AppointmentStatus[]> = {
  scheduled: ['confirmed', 'completed', 'cancelled', 'rescheduled', 'no_show'],
  confirmed: ['completed', 'cancelled', 'rescheduled', 'no_show'],
  rescheduled: ['confirmed', 'completed', 'cancelled', 'no_show'],
  completed: [],
  cancelled: [],
  no_show: [],
}

function serialize(row: AppointmentRow, extra?: { patientNome?: string; patientSala?: string | null }) {
  return {
    id: row.id,
    patientId: row.patientId,
    patientNome: extra?.patientNome,
    salaReuniao: extra?.patientSala ?? null,
    startsAt: row.startsAt instanceof Date ? row.startsAt.toISOString() : row.startsAt,
    duracao: row.duracao,
    status: row.status,
    valor: Number(row.valor),
    pagoEm: row.pagoEm,
    faturada: row.faturada,
    createdAt: row.createdAt,
  }
}

export class AppointmentsService {
  private repo: AppointmentsRepo

  constructor(private db: Db) {
    this.repo = new AppointmentsRepo(db)
  }

  async list(actor: ActorCtx, q: ListAppointmentsQuery) {
    const { rows, total } = await this.repo.list(actor.tenantId, q)
    return {
      data: rows.map((r) =>
        serialize(r.appointment, { patientNome: r.patientNome, patientSala: r.patientSala }),
      ),
      page: q.page,
      limit: q.limit,
      total,
    }
  }

  async getById(actor: ActorCtx, id: string) {
    const row = await this.repo.findById(actor.tenantId, id)
    if (!row) throw new AppError(404, 'APPOINTMENT_NOT_FOUND', 'Agendamento não encontrado')
    return serialize(row)
  }

  async create(actor: ActorCtx, input: CreateAppointmentInput) {
    const patient = await this.repo.findPatient(actor.tenantId, input.patientId)
    if (!patient)
      throw new AppError(404, 'PATIENT_NOT_FOUND', 'Paciente não encontrado')
    const row = await this.repo.create({
      tenantId: actor.tenantId,
      patientId: input.patientId,
      startsAt: new Date(input.startsAt),
      duracao: input.duracao,
      status: input.status,
      valor: String(input.valor ?? patient.valor),
      pagoEm: input.pagoEm ? new Date(input.pagoEm) : null,
    })
    await recordAudit(this.db, {
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: 'APPOINTMENT_CREATED',
      resourceType: 'appointment',
      resourceId: row.id,
      result: 'success',
      ip: actor.ip,
      requestId: actor.requestId,
    })
    return serialize(row)
  }

  async update(actor: ActorCtx, id: string, input: UpdateAppointmentInput) {
    const existing = await this.repo.findById(actor.tenantId, id)
    if (!existing)
      throw new AppError(404, 'APPOINTMENT_NOT_FOUND', 'Agendamento não encontrado')

    if (input.status && input.status !== existing.status) {
      const allowed = TRANSITIONS[existing.status]
      if (!allowed.includes(input.status)) {
        throw new AppError(
          409,
          'INVALID_STATUS_TRANSITION',
          `Transição ${existing.status} → ${input.status} não permitida`,
        )
      }
    }

    const values: Partial<typeof existing> = {}
    if (input.startsAt !== undefined) values.startsAt = new Date(input.startsAt)
    if (input.duracao !== undefined) values.duracao = input.duracao
    if (input.status !== undefined) values.status = input.status
    if (input.valor !== undefined) values.valor = String(input.valor)
    if (input.pagoEm !== undefined)
      values.pagoEm = input.pagoEm === null ? null : new Date(input.pagoEm)

    const row = await this.repo.update(actor.tenantId, id, values)
    await recordAudit(this.db, {
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: 'APPOINTMENT_UPDATED',
      resourceType: 'appointment',
      resourceId: id,
      result: 'success',
      ip: actor.ip,
      requestId: actor.requestId,
    })
    return serialize(row!)
  }

  async softDelete(actor: ActorCtx, id: string) {
    const existing = await this.repo.findById(actor.tenantId, id)
    if (!existing)
      throw new AppError(404, 'APPOINTMENT_NOT_FOUND', 'Agendamento não encontrado')
    await this.repo.update(actor.tenantId, id, { deletedAt: new Date() })
    await recordAudit(this.db, {
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: 'APPOINTMENT_DELETED',
      resourceType: 'appointment',
      resourceId: id,
      result: 'success',
      ip: actor.ip,
      requestId: actor.requestId,
    })
  }

  // Geração idempotente a partir do cadastro do paciente (spec B1).
  // Usável dentro de transação — repo aceita tx.
  async generateForPatient(
    tx: DbLike,
    tenantId: string,
    patient: PatientRow,
    inicio: string,
    fim: string,
  ): Promise<number> {
    const repo = new AppointmentsRepo(tx)
    const occurrences = generateOccurrences({
      diasSemana: patient.diasSemana ?? [],
      horario: patient.horario ?? '',
      frequencia: patient.frequenciaRecorrencia,
      inicio,
      fim,
    })
    return repo.insertOccurrences(
      occurrences.map((startsAt) => ({
        tenantId,
        patientId: patient.id,
        startsAt,
        duracao: 50,
        status: 'scheduled' as const,
        valor: patient.valor,
        faturada: false,
      })),
    )
  }

  // Renovação de ciclo (spec B2): data_reajuste += meses_ciclo e
  // gera agendamentos em [anterior, nova]. Retorna a nova data.
  async renewCycle(
    tenantId: string,
    patient: PatientRow,
  ): Promise<{ anterior: string; nova: string; gerados: number }> {
    const anterior = patient.dataReajuste || todayISO()
    const nova = addMonths(anterior, patient.mesesCiclo || 6)
    let gerados = 0
    if (patient.diasSemana?.length && patient.horario) {
      gerados = await this.generateForPatient(
        this.db,
        tenantId,
        { ...patient, dataReajuste: nova },
        anterior,
        nova,
      )
    }
    return { anterior, nova, gerados }
  }

  // Regeneração na edição (spec B1.1), em transação:
  // apaga futuros regeneráveis e recria o ciclo até data_reajuste.
  async regenerateForPatient(
    tenantId: string,
    patient: PatientRow,
  ): Promise<{ removidos: number; gerados: number }> {
    if (!patient.diasSemana?.length || !patient.horario || !patient.dataReajuste) {
      return { removidos: 0, gerados: 0 }
    }
    return this.db.transaction(async (tx) => {
      const repo = new AppointmentsRepo(tx)
      const removidos = await repo.deleteRegenerable(
        tenantId,
        patient.id,
        new Date(`${todayISO()}T00:00:00`),
      )
      const gerados = await this.generateForPatient(
        tx,
        tenantId,
        patient,
        todayISO(),
        patient.dataReajuste!,
      )
      return { removidos, gerados }
    })
  }
}
