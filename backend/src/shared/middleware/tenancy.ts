import { eq } from 'drizzle-orm'
import type { RequestHandler } from 'express'
import type { Db } from '../../db/client.js'
import { users } from '../../db/schema.js'
import { AppError } from '../errors.js'
import { recordAudit } from '../../modules/audit/service.js'

export type Role = 'OWNER' | 'ADMIN' | 'PSYCHOLOGIST' | 'ASSISTANT'

export const PERMISSIONS = [
  'patients:read',
  'patients:create',
  'patients:update',
  'patients:archive',
  'appointments:read',
  'appointments:create',
  'appointments:update',
  'appointments:cancel',
  'records:read',
  'records:update',
  'billing:read',
  'billing:create',
  'financial:read',
  'tax:read',
  'tax:update',
  'documents:read',
  'documents:create',
  'documents:download',
  'dashboard:read',
  'users:manage',
  'tenant:update',
] as const

export type Permission = (typeof PERMISSIONS)[number]

const ALL = new Set<Permission>(PERMISSIONS)

// Plano §6: suporte/administrativo NUNCA acessa conteúdo clínico (records:*).
// Anamnese também é clínica — filtrada no service de patients (T-006).
const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  OWNER: ALL,
  ADMIN: new Set([...ALL].filter((p) => !p.startsWith('records:'))),
  PSYCHOLOGIST: new Set([...ALL].filter((p) => p !== 'users:manage')),
  ASSISTANT: new Set([
    'patients:read',
    'patients:create',
    'patients:update',
    'appointments:read',
    'appointments:create',
    'appointments:update',
    'appointments:cancel',
    'billing:read',
    'financial:read',
    'dashboard:read',
  ]),
}

export function permissionsForRole(role: Role): ReadonlySet<Permission> {
  return ROLE_PERMISSIONS[role]
}

declare module 'express-serve-static-core' {
  interface Request {
    tenantId?: string
  }
}

// Não confia só no JWT: recarrega o usuário, confere o tenant do token
// contra o banco e refresca a role (mudança de papel vale imediatamente).
export function tenantContext(db: Db): RequestHandler {
  return async (req, _res, next) => {
    try {
      if (!req.auth) {
        return next(new AppError(401, 'UNAUTHORIZED', 'Autenticação obrigatória'))
      }
      const [user] = await db
        .select({ tenantId: users.tenantId, role: users.role })
        .from(users)
        .where(eq(users.id, req.auth.userId))
        .limit(1)
      if (!user) {
        return next(new AppError(401, 'UNAUTHORIZED', 'Usuário não encontrado'))
      }
      if (user.tenantId !== req.auth.tenantId) {
        await recordAudit(db, {
          tenantId: req.auth.tenantId,
          actorUserId: req.auth.userId,
          action: 'PERMISSION_DENIED',
          resourceType: 'tenant',
          result: 'denied',
          ip: req.ip,
          requestId: req.id,
        })
        return next(new AppError(403, 'TENANT_MISMATCH', 'Acesso negado'))
      }
      req.auth.role = user.role
      req.tenantId = user.tenantId
      next()
    } catch (err) {
      next(err)
    }
  }
}

export function requirePermission(db: Db, ...perms: Permission[]): RequestHandler {
  return async (req, _res, next) => {
    try {
      const role = req.auth?.role
      const granted = role ? perms.every((p) => ROLE_PERMISSIONS[role].has(p)) : false
      if (!granted) {
        // Auditoria nunca pode impedir a negação — falha vira log, não 500.
        try {
          await recordAudit(db, {
            tenantId: req.tenantId,
            actorUserId: req.auth?.userId,
            action: 'PERMISSION_DENIED',
            resourceType: 'permission',
            result: 'denied',
            ip: req.ip,
            requestId: req.id,
          })
        } catch (auditErr) {
          req.log?.error({ err: auditErr }, 'failed to write PERMISSION_DENIED audit')
        }
        return next(new AppError(403, 'FORBIDDEN', 'Permissão insuficiente'))
      }
      next()
    } catch (err) {
      next(err)
    }
  }
}
