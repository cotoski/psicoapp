import type { Db } from '../../db/client.js'
import type { Config } from '../../config.js'
import { AppError } from '../../shared/errors.js'
import { encryptField, decryptField } from '../../shared/crypto/fieldEncrypt.js'
import { recordAudit } from '../audit/service.js'
import { permissionsForRole, type Role } from '../../shared/middleware/tenancy.js'
import { PatientsRepo, type PatientRow } from './repo.js'
import type {
  CreatePatientInput,
  ListPatientsQuery,
  UpdatePatientInput,
} from './schemas.js'

interface ActorCtx {
  tenantId: string
  userId: string
  role: Role
  ip?: string
  requestId?: string
}

function addMonths(iso: string, months: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() + months)
  return d.toISOString().slice(0, 10)
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

// Legacy (behavior-spec): qtd_sessoes_nota deriva de frequência × dias.
function deriveQtdSessoesNota(input: CreatePatientInput): number {
  if (input.qtdSessoesNota) return input.qtdSessoesNota
  const dias = input.diasSemana?.length ?? 0
  if (dias === 0) return 1
  if (input.frequenciaRecorrencia === 'mensal') return 1
  if (input.frequenciaRecorrencia === 'quinzenal') return 2
  return 4 * dias
}

export class PatientsService {
  private repo: PatientsRepo

  constructor(
    private db: Db,
    private config: Config,
  ) {
    this.repo = new PatientsRepo(db)
  }

  // Anamnese é conteúdo clínico: só sai para quem tem records:read.
  private serialize(row: PatientRow, role: Role) {
    const canSeeClinical = permissionsForRole(role).has('records:read')
    return {
      id: row.id,
      nome: row.nome,
      cpf: row.cpf,
      telefone: row.telefone,
      email: row.email,
      dataNascimento: row.dataNascimento,
      anamnese:
        canSeeClinical && row.anamneseEnc
          ? decryptField(row.anamneseEnc, this.config.FIELD_ENCRYPTION_KEY)
          : null,
      valor: Number(row.valor),
      tipoFaturamento: row.tipoFaturamento,
      qtdSessoesNota: row.qtdSessoesNota,
      diasSemana: row.diasSemana,
      horario: row.horario,
      frequenciaRecorrencia: row.frequenciaRecorrencia,
      dataReajuste: row.dataReajuste,
      mesesCiclo: row.mesesCiclo,
      salaReuniao: row.salaReuniao,
      archivedAt: row.archivedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }
  }

  async list(actor: ActorCtx, q: ListPatientsQuery) {
    const { rows, total } = await this.repo.list(actor.tenantId, q)
    return {
      data: rows.map((r) => this.serialize(r, actor.role)),
      page: q.page,
      limit: q.limit,
      total,
    }
  }

  async getById(actor: ActorCtx, id: string) {
    const row = await this.repo.findById(actor.tenantId, id)
    if (!row) throw new AppError(404, 'PATIENT_NOT_FOUND', 'Paciente não encontrado')
    return this.serialize(row, actor.role)
  }

  async create(actor: ActorCtx, input: CreatePatientInput) {
    const dataReajuste =
      input.dataReajuste ?? addMonths(todayISO(), input.mesesCiclo)
    const row = await this.repo.create(actor.tenantId, {
      nome: input.nome,
      cpf: input.cpf ?? null,
      telefone: input.telefone ?? null,
      email: input.email ?? null,
      dataNascimento: input.dataNascimento ?? null,
      anamneseEnc: input.anamnese
        ? encryptField(input.anamnese, this.config.FIELD_ENCRYPTION_KEY)
        : null,
      valor: String(input.valor),
      tipoFaturamento: input.tipoFaturamento,
      qtdSessoesNota: deriveQtdSessoesNota(input),
      diasSemana: input.diasSemana ?? null,
      horario: input.horario ?? null,
      frequenciaRecorrencia: input.frequenciaRecorrencia,
      dataReajuste,
      mesesCiclo: input.mesesCiclo,
      salaReuniao: input.salaReuniao ?? null,
    })
    await recordAudit(this.db, {
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: 'PATIENT_CREATED',
      resourceType: 'patient',
      resourceId: row.id,
      result: 'success',
      ip: actor.ip,
      requestId: actor.requestId,
    })
    return this.serialize(row, actor.role)
  }

  async update(actor: ActorCtx, id: string, input: UpdatePatientInput) {
    const existing = await this.repo.findById(actor.tenantId, id)
    if (!existing)
      throw new AppError(404, 'PATIENT_NOT_FOUND', 'Paciente não encontrado')

    const values: Parameters<PatientsRepo['update']>[2] = {}
    if (input.nome !== undefined) values.nome = input.nome
    if (input.cpf !== undefined) values.cpf = input.cpf
    if (input.telefone !== undefined) values.telefone = input.telefone
    if (input.email !== undefined) values.email = input.email
    if (input.dataNascimento !== undefined)
      values.dataNascimento = input.dataNascimento
    if (input.anamnese !== undefined)
      values.anamneseEnc = encryptField(input.anamnese, this.config.FIELD_ENCRYPTION_KEY)
    if (input.valor !== undefined) values.valor = String(input.valor)
    if (input.tipoFaturamento !== undefined)
      values.tipoFaturamento = input.tipoFaturamento
    if (input.qtdSessoesNota !== undefined)
      values.qtdSessoesNota = input.qtdSessoesNota
    if (input.diasSemana !== undefined) values.diasSemana = input.diasSemana
    if (input.horario !== undefined) values.horario = input.horario
    if (input.frequenciaRecorrencia !== undefined)
      values.frequenciaRecorrencia = input.frequenciaRecorrencia
    if (input.dataReajuste !== undefined)
      values.dataReajuste = input.dataReajuste
    if (input.mesesCiclo !== undefined) values.mesesCiclo = input.mesesCiclo
    if (input.salaReuniao !== undefined) values.salaReuniao = input.salaReuniao

    const row = await this.repo.update(actor.tenantId, id, values)
    await recordAudit(this.db, {
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: 'PATIENT_UPDATED',
      resourceType: 'patient',
      resourceId: id,
      result: 'success',
      ip: actor.ip,
      requestId: actor.requestId,
    })
    return this.serialize(row!, actor.role)
  }

  async setArchived(actor: ActorCtx, id: string, archived: boolean) {
    const existing = await this.repo.findById(actor.tenantId, id)
    if (!existing)
      throw new AppError(404, 'PATIENT_NOT_FOUND', 'Paciente não encontrado')
    const row = await this.repo.update(actor.tenantId, id, {
      archivedAt: archived ? new Date() : null,
    })
    await recordAudit(this.db, {
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: archived ? 'PATIENT_ARCHIVED' : 'PATIENT_UNARCHIVED',
      resourceType: 'patient',
      resourceId: id,
      result: 'success',
      ip: actor.ip,
      requestId: actor.requestId,
    })
    return this.serialize(row!, actor.role)
  }

  async softDelete(actor: ActorCtx, id: string) {
    const existing = await this.repo.findById(actor.tenantId, id)
    if (!existing)
      throw new AppError(404, 'PATIENT_NOT_FOUND', 'Paciente não encontrado')
    await this.repo.update(actor.tenantId, id, { deletedAt: new Date() })
    await recordAudit(this.db, {
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: 'PATIENT_DELETED',
      resourceType: 'patient',
      resourceId: id,
      result: 'success',
      ip: actor.ip,
      requestId: actor.requestId,
    })
  }
}
