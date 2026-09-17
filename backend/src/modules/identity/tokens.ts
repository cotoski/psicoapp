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

// Token de reset opaco — vai por e-mail; no banco fica só o hash.
export function generatePasswordResetToken(ttlMinutes = 30) {
  const token = randomBytes(32).toString('base64url')
  return {
    token,
    tokenHash: hashRefreshToken(token),
    expiresAt: new Date(Date.now() + ttlMinutes * 60_000),
  }
}

// Desafio 2FA: JWT curto com scope restrito — serve só para completar o
// login na etapa do código TOTP, nunca como access token.
export function signPending2faToken(userId: string, config: Config): string {
  return jwt.sign({ sub: userId, scope: 'pre-2fa' }, config.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '5m',
    issuer: 'psicoapp',
    audience: 'psicoapp-api',
  })
}

export function verifyPending2faToken(token: string, config: Config): string | null {
  try {
    const payload = jwt.verify(token, config.JWT_SECRET, {
      algorithms: ['HS256'],
      issuer: 'psicoapp',
      audience: 'psicoapp-api',
    }) as { sub: string; scope?: string }
    return payload.scope === 'pre-2fa' ? payload.sub : null
  } catch {
    return null
  }
}
