import { createHash, randomBytes } from 'node:crypto'
import jwt from 'jsonwebtoken'
import type { Config } from '../../config.js'
import type { AuthContext } from '../../shared/middleware/auth.js'

export function signAccessToken(user: AuthContext, config: Config): string {
  return jwt.sign(
    { sub: user.userId, tid: user.tenantId, role: user.role },
    config.JWT_SECRET,
    {
      algorithm: 'HS256',
      expiresIn: config.ACCESS_TOKEN_TTL_SECONDS,
      issuer: 'psicoapp',
      audience: 'psicoapp-api',
    },
  )
}

// Refresh token é opaco: aleatório, nunca JWT. No banco vai só o hash.
export function generateRefreshToken(ttlDays: number) {
  const token = randomBytes(48).toString('base64url')
  return {
    token,
    tokenHash: hashRefreshToken(token),
    expiresAt: new Date(Date.now() + ttlDays * 86_400_000),
  }
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}
