import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import type { Db } from '../../db/client.js'
import type { Config } from '../../config.js'
import { requireAuth } from '../../shared/middleware/auth.js'
import { loginSchema, registerSchema } from './schemas.js'
import { IdentityService, type RequestContext } from './service.js'

const REFRESH_COOKIE = 'psicoapp_rt'

function ctx(req: { ip?: string; id: string; headers: Record<string, unknown> }): RequestContext {
  return {
    ip: req.ip,
    userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined,
    requestId: req.id,
  }
}

export function identityRouter({ db, config }: { db: Db; config: Config }): Router {
  const router = Router()
  const service = new IdentityService(db, config)
  const auth = requireAuth(config)

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: { code: 'RATE_LIMITED', message: 'Muitas tentativas. Tente mais tarde.' } },
  })
  const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: { code: 'RATE_LIMITED', message: 'Muitas tentativas. Tente mais tarde.' } },
  })
  const refreshLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: { code: 'RATE_LIMITED', message: 'Muitas tentativas. Tente mais tarde.' } },
  })

  const setRefreshCookie = (res: import('express').Response, token: string) => {
    res.cookie(REFRESH_COOKIE, token, {
      httpOnly: true,
      secure: config.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/api/v1/auth',
      maxAge: config.REFRESH_TOKEN_TTL_DAYS * 86_400_000,
    })
  }

  router.post('/register', registerLimiter, async (req, res) => {
    const input = registerSchema.parse(req.body)
    const result = await service.register(input, ctx(req))
    setRefreshCookie(res, result.refreshToken)
    res.status(201).json({ user: result.user, accessToken: result.accessToken })
  })

  router.post('/login', loginLimiter, async (req, res) => {
    const input = loginSchema.parse(req.body)
    const result = await service.login(input, ctx(req))
    setRefreshCookie(res, result.refreshToken)
    res.json({ user: result.user, accessToken: result.accessToken })
  })

  router.post('/refresh', refreshLimiter, async (req, res) => {
    const result = await service.refresh(req.cookies?.[REFRESH_COOKIE], ctx(req))
    setRefreshCookie(res, result.refreshToken)
    res.json({ user: result.user, accessToken: result.accessToken })
  })

  router.post('/logout', async (req, res) => {
    await service.logout(req.cookies?.[REFRESH_COOKIE], ctx(req))
    res.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' })
    res.status(204).end()
  })

  router.get('/me', auth, async (req, res) => {
    res.json(await service.me(req.auth!.userId))
  })

  return router
}
