import request from 'supertest'
import jwt from 'jsonwebtoken'
import { loadConfig, type Config } from '../src/config.js'
import { buildLogger } from '../src/shared/logger.js'
import { createDb, type Db } from '../src/db/client.js'
import { testDbUrl } from './globalSetup.js'

export function testConfig(overrides: NodeJS.ProcessEnv = {}): Config {
  return loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: 'postgres://test:test@localhost:5432/psicoapp_test',
    JWT_SECRET: 'x'.repeat(48),
    FIELD_ENCRYPTION_KEY: 'y'.repeat(48),
    LOG_LEVEL: 'silent',
    ...overrides,
  })
}

export function testLogger() {
  return buildLogger(testConfig())
}

// Pool lazy: criar sem servidor de banco não conecta (seguro em testes sem DB)
export function testDb(): Db {
  return createDb(testDbUrl())
}

export async function truncateAll(db: Db) {
  await db.execute(
    'TRUNCATE audit_events, session_records, appointments, patients, tax_config, refresh_tokens, password_reset_tokens, users, tenants CASCADE',
  )
}

export interface TestPrincipal {
  token: string
  userId: string
  tenantId: string
  email: string
}

// Registra um tenant+usuário e retorna credenciais de teste.
// Dois pricipais = dois tenants isolados (asTenantA / asTenantB).
export async function registerUserAs(
  app: import('express').Express,
  email: string,
): Promise<TestPrincipal> {
  const res = await request(app)
    .post('/api/v1/auth/register')
    .send({
      email,
      password: 'senha-forte-123',
      nome: 'Teste',
      tenantName: `Tenant ${email}`,
    })
  if (res.status !== 201) throw new Error(`register falhou: ${JSON.stringify(res.body)}`)
  const payload = jwt.decode(res.body.accessToken) as { sub: string; tid: string }
  return { token: res.body.accessToken, userId: payload.sub, tenantId: payload.tid, email }
}
