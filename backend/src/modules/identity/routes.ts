import { Router, raw } from 'express'
import rateLimit from 'express-rate-limit'
import type { Db } from '../../db/client.js'
import type { Config } from '../../config.js'
import type { Logger } from '../../shared/logger.js'
import { AppError } from '../../shared/errors.js'
import { Mailer } from '../../shared/mailer.js'
import { requireAuth } from '../../shared/middleware/auth.js'
import {
  changePasswordSchema,
  forgotPasswordSchema,
  login2faSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  totpDisableSchema,
  totpEnableSchema,
  updateMeSchema,
} from './schemas.js'
import { IdentityService, type RequestContext } from './service.js'

const REFRESH_COOKIE = 'psicoapp_rt'

function ctx(req: { ip?: string; id: string; headers: Record<string, unknown> }): RequestContext {
  return {
    ip: req.ip,
    userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined,
    requestId: req.id,
  }
}

export function identityRouter({
  db,
  config,
  logger,
}: {
  db: Db
  config: Config
  logger: Logger
}): Router {
  const router = Router()
  const service = new IdentityService(db, config, new Mailer(config, logger), logger)
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
  const passwordResetLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
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
    // 2FA ativo → não emite tokens nem cookie; o cliente completa a etapa 2.
    if ('requires2fa' in result) {
      res.json(result)
      return
    }
    setRefreshCookie(res, result.refreshToken)
    res.json({ user: result.user, accessToken: result.accessToken })
  })

  // Etapa 2 do login com 2FA — aceita código TOTP ou código de backup.
  router.post('/login/2fa', loginLimiter, async (req, res) => {
    const input = login2faSchema.parse(req.body)
    const result = await service.login2fa(input, ctx(req))
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

  router.patch('/me', auth, async (req, res) => {
    const input = updateMeSchema.parse(req.body)
    res.json(await service.updateMe(req.auth!.userId, input, ctx(req)))
  })

  router.post('/change-password', auth, async (req, res) => {
    const input = changePasswordSchema.parse(req.body)
    const result = await service.changePassword(req.auth!.userId, input, ctx(req))
    setRefreshCookie(res, result.refreshToken)
    res.json({ user: result.user, accessToken: result.accessToken })
  })

  // Foto de perfil — corpo é a imagem binária (não multipart), máx. 2 MB.
  const avatarBody = raw({ type: 'image/*', limit: '2mb' })
  router.put('/me/avatar', auth, avatarBody, async (req, res) => {
    const buf = req.body as Buffer
    if (!Buffer.isBuffer(buf) || buf.length === 0) {
      throw new AppError(400, 'INVALID_AVATAR', 'Envie a imagem no corpo da requisição')
    }
    await service.setAvatar(req.auth!.userId, buf, req.headers['content-type'] ?? '', ctx(req))
    res.status(204).end()
  })

  router.get('/me/avatar', auth, async (req, res) => {
    const { data, mime } = await service.getAvatar(req.auth!.userId)
    res.set('Cache-Control', 'private, max-age=60').type(mime).send(data)
  })

  router.delete('/me/avatar', auth, async (req, res) => {
    await service.clearAvatar(req.auth!.userId, ctx(req))
    res.status(204).end()
  })

  // Reset de senha — resposta genérica (não revela se o e-mail existe).
  router.post('/forgot-password', passwordResetLimiter, async (req, res) => {
    const input = forgotPasswordSchema.parse(req.body)
    await service.forgotPassword(input, ctx(req))
    res.json({ message: 'Se o e-mail estiver cadastrado, enviaremos instruções para redefinir a senha.' })
  })

  router.post('/reset-password', passwordResetLimiter, async (req, res) => {
    const input = resetPasswordSchema.parse(req.body)
    await service.resetPassword(input, ctx(req))
    res.json({ message: 'Senha redefinida com sucesso.' })
  })

  // --- Verificação em duas etapas (TOTP) ---
  router.post('/2fa/setup', auth, async (req, res) => {
    res.json(await service.setup2fa(req.auth!.userId))
  })

  router.post('/2fa/enable', auth, async (req, res) => {
    const input = totpEnableSchema.parse(req.body)
    res.json(await service.enable2fa(req.auth!.userId, input, ctx(req)))
  })

  router.post('/2fa/disable', auth, async (req, res) => {
    const input = totpDisableSchema.parse(req.body)
    await service.disable2fa(req.auth!.userId, input, ctx(req))
    res.status(204).end()
  })

  return router
}
