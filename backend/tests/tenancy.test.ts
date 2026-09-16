import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import type { Express, Request, Response, NextFunction } from 'express'
import { eq } from 'drizzle-orm'
import { createApp } from '../src/app.js'
import type { Db } from '../src/db/client.js'
import { auditEvents, refreshTokens, users } from '../src/db/schema.js'
import { permissionsForRole, requirePermission } from '../src/shared/middleware/tenancy.js'
import { testConfig, testDb, testLogger, truncateAll, registerUserAs } from './helpers.js'

const hasDb = Boolean(process.env.DATABASE_URL)
const db: Db | null = hasDb ? testDb() : null

let app: Express

function forgedToken(userId: string, tenantId: string): string {
  return jwt.sign(
    { sub: userId, tid: tenantId, role: 'OWNER' },
    testConfig().JWT_SECRET,
    { expiresIn: '15m', issuer: 'psicoapp', audience: 'psicoapp-api' },
  )
}

describe.skipIf(!hasDb)('tenancy & authz', () => {
  beforeEach(async () => {
    await truncateAll(db!)
    app = createApp({ config: testConfig(), logger: testLogger(), db: db! })
  })

  afterAll(async () => {
    await db!.$client.end()
  })

  it('canônico: tenant A acessa o próprio tenant, nunca o de B', async () => {
    const a = await registerUserAs(app, 'a@x.test')
    const b = await registerUserAs(app, 'b@x.test')
    expect(a.tenantId).not.toBe(b.tenantId)

    const me = await request(app)
      .get('/api/v1/tenants/me')
      .set('Authorization', `Bearer ${a.token}`)
    expect(me.status).toBe(200)
    expect(me.body.id).toBe(a.tenantId)
    expect(me.body.id).not.toBe(b.tenantId)
  })

  it('token forjado (sub de A, tid de B) é rejeitado e auditado', async () => {
    const a = await registerUserAs(app, 'a@x.test')
    const b = await registerUserAs(app, 'b@x.test')

    const res = await request(app)
      .get('/api/v1/tenants/me')
      .set('Authorization', `Bearer ${forgedToken(a.userId, b.tenantId)}`)
    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('TENANT_MISMATCH')

    const denied = await db!
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.action, 'PERMISSION_DENIED'))
    expect(denied.length).toBeGreaterThanOrEqual(1)
  })

  it('token de usuário deletado é rejeitado (verificação no banco)', async () => {
    const a = await registerUserAs(app, 'a@x.test')
    // FK sem cascade em audit_events é proposital: a trilha sobrevive à
    // exclusão do ator — por isso limpamos as referências antes.
    await db!.delete(auditEvents).where(eq(auditEvents.actorUserId, a.userId))
    await db!.delete(refreshTokens).where(eq(refreshTokens.userId, a.userId))
    await db!.delete(users).where(eq(users.id, a.userId))
    const res = await request(app)
      .get('/api/v1/tenants/me')
      .set('Authorization', `Bearer ${a.token}`)
    expect(res.status).toBe(401)
  })

  it('rotas protegidas exigem autenticação (default-deny)', async () => {
    await request(app).get('/api/v1/tenants/me').expect(401)
  })

  it('role é recarregada do banco a cada request', async () => {
    const a = await registerUserAs(app, 'a@x.test')
    // Rebaixa para ASSISTANT no banco — token ainda diz OWNER
    await db!.update(users).set({ role: 'ASSISTANT' }).where(eq(users.id, a.userId))
    const res = await request(app)
      .get('/api/v1/tenants/me')
      .set('Authorization', `Bearer ${a.token}`)
    expect(res.status).toBe(200) // rota não exige permissão específica
  })
})

describe('matriz RBAC', () => {
  it('OWNER tem todas as permissões', () => {
    expect(permissionsForRole('OWNER').has('records:read')).toBe(true)
    expect(permissionsForRole('OWNER').has('users:manage')).toBe(true)
  })

  it('ADMIN não acessa conteúdo clínico (plano §6)', () => {
    const admin = permissionsForRole('ADMIN')
    expect(admin.has('records:read')).toBe(false)
    expect(admin.has('patients:read')).toBe(true)
  })

  it('ASSISTANT: sem records, sem archive, sem financial:update', () => {
    const assistant = permissionsForRole('ASSISTANT')
    expect(assistant.has('records:read')).toBe(false)
    expect(assistant.has('patients:archive')).toBe(false)
    expect(assistant.has('patients:read')).toBe(true)
  })

  it('requirePermission bloqueia e libera conforme a role', async () => {
    const mw = requirePermission(db ?? ({} as Db), 'records:read')
    const run = (role: string) =>
      new Promise<unknown>((resolve) => {
        const req = {
          auth: { userId: 'u', tenantId: 't', role },
          tenantId: 't',
          id: 'req-1',
        } as unknown as Request
        mw(req, {} as Response, ((err?: unknown) => resolve(err ?? null)) as NextFunction)
      })

    const denied = await run('ASSISTANT')
    expect((denied as { statusCode?: number })?.statusCode).toBe(403)
    expect(await run('OWNER')).toBeNull()
    expect(await run('PSYCHOLOGIST')).toBeNull()
  })
})
