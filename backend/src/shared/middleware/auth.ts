import jwt from 'jsonwebtoken'
import type { RequestHandler } from 'express'
import type { Config } from '../../config.js'
import { AppError } from '../errors.js'

export interface AuthContext {
  userId: string
  tenantId: string
  role: 'OWNER' | 'ADMIN' | 'PSYCHOLOGIST' | 'ASSISTANT'
}

declare module 'express-serve-static-core' {
  interface Request {
    auth?: AuthContext
  }
}

export function requireAuth(config: Config): RequestHandler {
  return (req, _res, next) => {
    const header = req.headers.authorization
    if (!header?.startsWith('Bearer ')) {
      return next(new AppError(401, 'UNAUTHORIZED', 'Token ausente'))
    }
    try {
      const payload = jwt.verify(header.slice(7), config.JWT_SECRET, {
        algorithms: ['HS256'],
        issuer: 'psicoapp',
        audience: 'psicoapp-api',
      }) as { sub: string; tid: string; role: AuthContext['role'] }
      req.auth = { userId: payload.sub, tenantId: payload.tid, role: payload.role }
      next()
    } catch (err) {
      const expired = err instanceof jwt.TokenExpiredError
      next(
        new AppError(
          401,
          expired ? 'TOKEN_EXPIRED' : 'UNAUTHORIZED',
          expired ? 'Token expirado' : 'Token inválido',
        ),
      )
    }
  }
}
