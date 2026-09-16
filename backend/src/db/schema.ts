import {
  pgTable,
  pgEnum,
  uuid,
  text,
  varchar,
  integer,
  numeric,
  boolean,
  timestamp,
  date,
  time,
  index,
  uniqueIndex,
  customType,
} from 'drizzle-orm/pg-core'

// bytea para campos clínicos criptografados (AES-256-GCM — T-008)
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => 'bytea',
})

// e-mail case-insensitive — requer CREATE EXTENSION citext (migration 0001)
const citext = customType<{ data: string; driverData: string }>({
  dataType: () => 'citext',
})

export const userRole = pgEnum('user_role', [
  'OWNER',
  'ADMIN',
  'PSYCHOLOGIST',
  'ASSISTANT',
])

export const appointmentStatus = pgEnum('appointment_status', [
  'scheduled',
  'confirmed',
  'completed',
  'cancelled',
  'rescheduled',
  'no_show',
])

export const billingType = pgEnum('billing_type', ['imediato', 'pacote'])

export const recurrenceFreq = pgEnum('recurrence_freq', [
  'semanal',
  'quinzenal',
  'mensal',
])

export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id),
  email: citext('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  nome: text('nome').notNull(),
  crp: varchar('crp', { length: 20 }),
  role: userRole('role').notNull().default('OWNER'),
  totpSecret: text('totp_secret'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
})

export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    ip: text('ip'),
    userAgent: text('user_agent'),
  },
  (t) => [index('idx_refresh_tokens_user').on(t.userId)],
)

export const patients = pgTable(
  'patients',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    nome: text('nome').notNull(),
    cpf: varchar('cpf', { length: 14 }),
    telefone: varchar('telefone', { length: 50 }),
    email: varchar('email', { length: 255 }),
    dataNascimento: date('data_nascimento', { mode: 'string' }),
    // AES-256-GCM — conteúdo clínico nunca em texto puro (T-008)
    anamneseEnc: bytea('anamnese_enc'),
    valor: numeric('valor', { precision: 10, scale: 2 }).notNull().default('0'),
    tipoFaturamento: billingType('tipo_faturamento').notNull().default('imediato'),
    qtdSessoesNota: integer('qtd_sessoes_nota').notNull().default(1),
    diasSemana: text('dias_semana').array(),
    horario: time('horario'),
    frequenciaRecorrencia: recurrenceFreq('frequencia_recorrencia')
      .notNull()
      .default('semanal'),
    dataReajuste: date('data_reajuste', { mode: 'string' }),
    mesesCiclo: integer('meses_ciclo').notNull().default(6),
    salaReuniao: text('sala_reuniao'),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index('idx_patients_tenant_nome').on(t.tenantId, t.nome),
    index('idx_patients_tenant_reajuste').on(t.tenantId, t.dataReajuste),
  ],
)

export const appointments = pgTable(
  'appointments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    patientId: uuid('patient_id')
      .notNull()
      .references(() => patients.id),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    duracao: integer('duracao').notNull().default(50),
    status: appointmentStatus('status').notNull().default('scheduled'),
    valor: numeric('valor', { precision: 10, scale: 2 }).notNull().default('0'),
    pagoEm: timestamp('pago_em', { withTimezone: true }),
    faturada: boolean('faturada').notNull().default(false),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    // Idempotência da recorrência (behavior-spec B1)
    uniqueIndex('uq_appointments_patient_starts_at').on(t.patientId, t.startsAt),
    index('idx_appointments_tenant_starts_at').on(t.tenantId, t.startsAt),
  ],
)

// Prontuário — separado da agenda (retenção CFP ≥5 anos, acesso auditado)
export const sessionRecords = pgTable(
  'session_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    appointmentId: uuid('appointment_id')
      .notNull()
      .unique()
      .references(() => appointments.id),
    patientId: uuid('patient_id')
      .notNull()
      .references(() => patients.id),
    contentEnc: bytea('content_enc'),
    estadoEmocional: integer('estado_emocional'),
    temas: text('temas').array(),
    tarefas: text('tarefas'),
    legalHold: boolean('legal_hold').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [index('idx_session_records_tenant').on(t.tenantId, t.patientId)],
)

export const taxConfig = pgTable('tax_config', {
  tenantId: uuid('tenant_id')
    .primaryKey()
    .references(() => tenants.id),
  regime: varchar('regime', { length: 20 }),
  municipio: varchar('municipio', { length: 10 }),
  faturamentoAnual: numeric('faturamento_anual', { precision: 12, scale: 2 }),
  folhaPagamentoAnual: numeric('folha_pagamento_anual', { precision: 12, scale: 2 }),
  prolaboreAnual: numeric('prolabore_anual', { precision: 12, scale: 2 }),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
})

// Audit trail — NUNCA conteúdo clínico (plano §12)
export const auditEvents = pgTable(
  'audit_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id),
    actorUserId: uuid('actor_user_id').references(() => users.id),
    action: varchar('action', { length: 100 }).notNull(),
    resourceType: varchar('resource_type', { length: 50 }),
    resourceId: uuid('resource_id'),
    ip: text('ip'),
    requestId: varchar('request_id', { length: 128 }),
    result: varchar('result', { length: 20 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('idx_audit_tenant_created').on(t.tenantId, t.createdAt)],
)
