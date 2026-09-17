import bcrypt from 'bcryptjs'
import { randomBytes } from 'node:crypto'
import * as OTPAuth from 'otpauth'
import QRCode from 'qrcode'
import type { Db } from '../../db/client.js'
import type { Config } from '../../config.js'
import { AppError } from '../../shared/errors.js'
import type { Logger } from '../../shared/logger.js'
import type { Mailer } from '../../shared/mailer.js'
import { decryptField, encryptField } from '../../shared/crypto/fieldEncrypt.js'
import { recordAudit } from '../audit/service.js'
import { IdentityRepo } from './repo.js'
import {
  generatePasswordResetToken,
  generateRefreshToken,
  hashRefreshToken,
  signAccessToken,
  signPending2faToken,
  verifyPending2faToken,
} from './tokens.js'
import type {
  ChangePasswordInput,
  ForgotPasswordInput,
  Login2faInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
  TotpDisableInput,
  TotpEnableInput,
  UpdateMeInput,
} from './schemas.js'

export interface RequestContext {
  ip?: string
  userAgent?: string
  requestId?: string
}

export interface AuthResult {
  user: {
    id: string
    email: string
    nome: string
    crp: string | null
    role: string
    totpEnabled: boolean
  }
  accessToken: string
  refreshToken: string
}

// Login com 2FA ativo: senha ok, mas falta o segundo fator.
export interface TwoFactorChallenge {
  requires2fa: true
  pendingToken: string
}

export type LoginResult = AuthResult | TwoFactorChallenge

const BCRYPT_COST = 12

// Códigos de backup: 8 códigos "XXXXX-XXXXX" (uso único, só hash no banco).
function generateBackupCodes(n = 8): string[] {
  return Array.from({ length: n }, () => {
    const raw = randomBytes(5).toString('hex').toUpperCase()
    return `${raw.slice(0, 5)}-${raw.slice(5)}`
  })
}

function normalizeBackupCode(code: string): string {
  return code.replace(/[^0-9a-zA-Z]/g, '').toUpperCase()
}

export class IdentityService {
  private repo: IdentityRepo
  private static AVATAR_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp'])

  constructor(
    private db: Db,
    private config: Config,
    private mailer?: Mailer,
    private logger?: Logger,
  ) {
    this.repo = new IdentityRepo(db)
  }

  async register(input: RegisterInput, ctx: RequestContext): Promise<AuthResult> {
    const [existing] = await this.repo.findUserByEmail(input.email)
    if (existing) {
      // Não revelar se o e-mail existe — resposta genérica
      throw new AppError(409, 'EMAIL_IN_USE', 'Não foi possível concluir o cadastro')
    }
    const passwordHash = bcrypt.hashSync(input.password, BCRYPT_COST)
    const { tenant, user } = await this.repo.createTenantWithUser({
      tenantName: input.tenantName,
      email: input.email,
      passwordHash,
      nome: input.nome,
      crp: input.crp,
    })
    await recordAudit(this.db, {
      tenantId: tenant.id,
      actorUserId: user.id,
      action: 'USER_REGISTERED',
      resourceType: 'user',
      resourceId: user.id,
      result: 'success',
      ...ctx,
    })
    return this.issueTokens(user, ctx)
  }

  async login(input: LoginInput, ctx: RequestContext): Promise<LoginResult> {
    const [user] = await this.repo.findUserByEmail(input.email)
    const ok =
      user && bcrypt.compareSync(input.password, user.passwordHash)
    if (!ok) {
      await recordAudit(this.db, {
        tenantId: user?.tenantId ?? null,
        actorUserId: user?.id ?? null,
        action: 'LOGIN_FAILURE',
        resourceType: 'user',
        resourceId: user?.id,
        result: 'denied',
        ...ctx,
      })
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Credenciais inválidas')
    }
    // 2FA ativo → senha correta emite só um desafio curto, não os tokens.
    if (user.totpEnabled && user.totpSecret) {
      await recordAudit(this.db, {
        tenantId: user.tenantId,
        actorUserId: user.id,
        action: 'LOGIN_2FA_CHALLENGED',
        resourceType: 'user',
        resourceId: user.id,
        result: 'success',
        ...ctx,
      })
      return { requires2fa: true, pendingToken: signPending2faToken(user.id, this.config) }
    }
    await recordAudit(this.db, {
      tenantId: user.tenantId,
      actorUserId: user.id,
      action: 'LOGIN_SUCCESS',
      resourceType: 'user',
      resourceId: user.id,
      result: 'success',
      ...ctx,
    })
    return this.issueTokens(user, ctx)
  }

  // Rotação: o token usado é revogado e um novo é emitido.
  // Reuso de token revogado/expirado revoga toda a cadeia do usuário.
  async refresh(refreshToken: string | undefined, ctx: RequestContext) {
    if (!refreshToken) {
      throw new AppError(401, 'UNAUTHORIZED', 'Refresh token ausente')
    }
    const [stored] = await this.repo.findRefreshTokenByHash(hashRefreshToken(refreshToken))
    if (!stored) {
      throw new AppError(401, 'UNAUTHORIZED', 'Refresh token inválido')
    }
    const invalid = stored.revokedAt !== null || stored.expiresAt < new Date()
    if (invalid) {
      await this.repo.revokeAllUserTokens(stored.userId)
      await recordAudit(this.db, {
        actorUserId: stored.userId,
        action: 'REFRESH_TOKEN_REUSED',
        resourceType: 'refresh_token',
        resourceId: stored.id,
        result: 'denied',
        ...ctx,
      })
      throw new AppError(401, 'UNAUTHORIZED', 'Refresh token inválido')
    }
    await this.repo.revokeRefreshToken(stored.id)
    const [user] = await this.repo.findUserById(stored.userId)
    if (!user) {
      throw new AppError(401, 'UNAUTHORIZED', 'Usuário não encontrado')
    }
    return this.issueTokens(user, ctx)
  }

  async logout(refreshToken: string | undefined, ctx: RequestContext) {
    if (!refreshToken) return
    const [stored] = await this.repo.findRefreshTokenByHash(hashRefreshToken(refreshToken))
    if (!stored) return
    await this.repo.revokeRefreshToken(stored.id)
    await recordAudit(this.db, {
      actorUserId: stored.userId,
      action: 'LOGOUT',
      resourceType: 'refresh_token',
      resourceId: stored.id,
      result: 'success',
      ...ctx,
    })
  }

  async me(userId: string) {
    const [user] = await this.repo.findUserById(userId)
    if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'Usuário não encontrado')
    return {
      id: user.id,
      email: user.email,
      nome: user.nome,
      crp: user.crp,
      role: user.role,
      totpEnabled: user.totpEnabled,
      tenantId: user.tenantId,
    }
  }

  async updateMe(userId: string, input: UpdateMeInput, ctx: RequestContext) {
    if (input.email) {
      const [existing] = await this.repo.findUserByEmail(input.email)
      if (existing && existing.id !== userId) {
        throw new AppError(409, 'EMAIL_IN_USE', 'E-mail já está em uso')
      }
    }
    const patch: { nome?: string; crp?: string | null; email?: string } = {}
    if (input.nome !== undefined) patch.nome = input.nome
    if (input.crp !== undefined) patch.crp = input.crp || null
    if (input.email !== undefined) patch.email = input.email
    const [user] = await this.repo.updateUser(userId, patch)
    if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'Usuário não encontrado')
    await recordAudit(this.db, {
      tenantId: user.tenantId,
      actorUserId: user.id,
      action: 'PROFILE_UPDATED',
      resourceType: 'user',
      resourceId: user.id,
      result: 'success',
      ...ctx,
    })
    return {
      id: user.id,
      email: user.email,
      nome: user.nome,
      crp: user.crp,
      role: user.role,
      totpEnabled: user.totpEnabled,
      tenantId: user.tenantId,
    }
  }

  // Troca de senha autenticada: revoga todas as sessões e emite novo par de
  // tokens para a sessão atual (outras abas/dispositivos precisam re-logar).
  async changePassword(
    userId: string,
    input: ChangePasswordInput,
    ctx: RequestContext,
  ): Promise<AuthResult> {
    const [user] = await this.repo.findUserById(userId)
    if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'Usuário não encontrado')
    if (!bcrypt.compareSync(input.currentPassword, user.passwordHash)) {
      throw new AppError(400, 'INVALID_CURRENT_PASSWORD', 'Senha atual incorreta')
    }
    await this.repo.updatePassword(userId, bcrypt.hashSync(input.newPassword, BCRYPT_COST))
    await this.repo.revokeAllUserTokens(userId)
    await recordAudit(this.db, {
      tenantId: user.tenantId,
      actorUserId: user.id,
      action: 'PASSWORD_CHANGED',
      resourceType: 'user',
      resourceId: user.id,
      result: 'success',
      ...ctx,
    })
    return this.issueTokens(user, ctx)
  }

  // Resposta sempre genérica — não revela se o e-mail existe.
  async forgotPassword(input: ForgotPasswordInput, ctx: RequestContext): Promise<void> {
    const [user] = await this.repo.findUserByEmail(input.email)
    if (!user) return
    await this.repo.invalidateUserResetTokens(user.id)
    const rt = generatePasswordResetToken()
    await this.repo.insertPasswordResetToken({
      userId: user.id,
      tokenHash: rt.tokenHash,
      expiresAt: rt.expiresAt,
    })
    const url = `${this.config.APP_URL}/redefinir-senha?token=${rt.token}`
    const sent = this.mailer
      ? await this.mailer.send({
          to: user.email,
          subject: 'Redefinição de senha — PsicoApp',
          text: [
            `Olá, ${user.nome}.`,
            '',
            'Recebemos um pedido para redefinir a senha da sua conta.',
            `Acesse o link abaixo (válido por 30 minutos):`,
            '',
            url,
            '',
            'Se não foi você, ignore este e-mail.',
          ].join('\n'),
          html: [
            `<p>Olá, ${user.nome}.</p>`,
            '<p>Recebemos um pedido para redefinir a senha da sua conta.</p>',
            `<p><a href="${url}">Clique aqui para redefinir sua senha</a> (válido por 30 minutos).</p>`,
            '<p>Se não foi você, ignore este e-mail.</p>',
          ].join(''),
        })
      : false
    // Fallback de dev: sem SMTP alcançável, o link vai para o log.
    if (!sent && this.config.NODE_ENV !== 'production') {
      this.logger?.info({ userId: user.id, resetUrl: url }, 'link de reset gerado')
    }
    await recordAudit(this.db, {
      tenantId: user.tenantId,
      actorUserId: user.id,
      action: 'PASSWORD_RESET_REQUESTED',
      resourceType: 'user',
      resourceId: user.id,
      result: 'success',
      ...ctx,
    })
  }

  async resetPassword(input: ResetPasswordInput, ctx: RequestContext): Promise<void> {
    const [stored] = await this.repo.findPasswordResetTokenByHash(
      hashRefreshToken(input.token),
    )
    const invalid = !stored || stored.usedAt !== null || stored.expiresAt < new Date()
    if (invalid) {
      throw new AppError(400, 'INVALID_RESET_TOKEN', 'Link inválido ou expirado')
    }
    await this.repo.markPasswordResetTokenUsed(stored.id)
    await this.repo.updatePassword(
      stored.userId,
      bcrypt.hashSync(input.newPassword, BCRYPT_COST),
    )
    await this.repo.revokeAllUserTokens(stored.userId)
    await recordAudit(this.db, {
      actorUserId: stored.userId,
      action: 'PASSWORD_RESET_COMPLETED',
      resourceType: 'user',
      resourceId: stored.userId,
      result: 'success',
      ...ctx,
    })
  }

  async setAvatar(userId: string, data: Buffer, mime: string, ctx: RequestContext) {
    if (!IdentityService.AVATAR_MIMES.has(mime)) {
      throw new AppError(415, 'UNSUPPORTED_MEDIA', 'Formato inválido — use JPEG, PNG ou WebP')
    }
    await this.repo.setAvatar(userId, data, mime)
    await recordAudit(this.db, {
      actorUserId: userId,
      action: 'AVATAR_UPDATED',
      resourceType: 'user',
      resourceId: userId,
      result: 'success',
      ...ctx,
    })
  }

  async getAvatar(userId: string): Promise<{ data: Buffer; mime: string }> {
    const [row] = await this.repo.findAvatarByUserId(userId)
    if (!row?.avatar || !row.avatarMime) {
      throw new AppError(404, 'NOT_FOUND', 'Sem foto de perfil')
    }
    return { data: row.avatar, mime: row.avatarMime }
  }

  async clearAvatar(userId: string, ctx: RequestContext) {
    await this.repo.clearAvatar(userId)
    await recordAudit(this.db, {
      actorUserId: userId,
      action: 'AVATAR_REMOVED',
      resourceType: 'user',
      resourceId: userId,
      result: 'success',
      ...ctx,
    })
  }

  // --- Verificação em duas etapas (TOTP) ---

  private encryptTotp(secret: string): string {
    return encryptField(secret, this.config.FIELD_ENCRYPTION_KEY).toString('base64')
  }

  private decryptTotp(enc: string): string {
    return decryptField(Buffer.from(enc, 'base64'), this.config.FIELD_ENCRYPTION_KEY)
  }

  private buildTotp(email: string, secret: OTPAuth.Secret) {
    return new OTPAuth.TOTP({
      issuer: 'PsicoApp',
      label: email,
      secret,
      digits: 6,
      period: 30,
    })
  }

  // Segredo fica "pendente" (totp_enabled=false) até a confirmação por código.
  async setup2fa(userId: string) {
    const [user] = await this.repo.findUserById(userId)
    if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'Usuário não encontrado')
    if (user.totpEnabled) {
      throw new AppError(409, 'TOTP_ALREADY_ENABLED', 'Verificação em duas etapas já está ativa')
    }
    const secret = new OTPAuth.Secret({ size: 20 })
    await this.repo.setTotpSecret(userId, this.encryptTotp(secret.base32))
    const otpauthUrl = this.buildTotp(user.email, secret).toString()
    const qrCode = await QRCode.toDataURL(otpauthUrl, { margin: 1, width: 192 })
    return { secret: secret.base32, otpauthUrl, qrCode }
  }

  async enable2fa(userId: string, input: TotpEnableInput, ctx: RequestContext) {
    const [user] = await this.repo.findUserById(userId)
    if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'Usuário não encontrado')
    if (!user.totpSecret) {
      throw new AppError(400, 'TOTP_NOT_CONFIGURED', 'Inicie a configuração primeiro')
    }
    if (user.totpEnabled) {
      throw new AppError(409, 'TOTP_ALREADY_ENABLED', 'Verificação em duas etapas já está ativa')
    }
    const secret = OTPAuth.Secret.fromBase32(this.decryptTotp(user.totpSecret))
    // window ±1 tolera drift de relógio (~30s) entre servidor e celular
    if (this.buildTotp(user.email, secret).validate({ token: input.code, window: 1 }) === null) {
      throw new AppError(400, 'INVALID_TOTP', 'Código inválido — confira o app autenticador')
    }
    await this.repo.setTotpEnabled(userId, true)
    const codes = generateBackupCodes()
    await this.repo.replaceBackupCodes(
      userId,
      codes.map((c) => hashRefreshToken(normalizeBackupCode(c))),
    )
    await recordAudit(this.db, {
      tenantId: user.tenantId,
      actorUserId: user.id,
      action: 'TOTP_ENABLED',
      resourceType: 'user',
      resourceId: user.id,
      result: 'success',
      ...ctx,
    })
    return { backupCodes: codes }
  }

  async disable2fa(userId: string, input: TotpDisableInput, ctx: RequestContext) {
    const [user] = await this.repo.findUserById(userId)
    if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'Usuário não encontrado')
    if (!user.totpEnabled || !user.totpSecret) {
      throw new AppError(400, 'TOTP_NOT_ENABLED', 'Verificação em duas etapas não está ativa')
    }
    if (!bcrypt.compareSync(input.password, user.passwordHash)) {
      throw new AppError(400, 'INVALID_CURRENT_PASSWORD', 'Senha incorreta')
    }
    const secret = OTPAuth.Secret.fromBase32(this.decryptTotp(user.totpSecret))
    if (this.buildTotp(user.email, secret).validate({ token: input.code, window: 1 }) === null) {
      throw new AppError(400, 'INVALID_TOTP', 'Código inválido — confira o app autenticador')
    }
    await this.repo.clearTotp(userId)
    await this.repo.deleteBackupCodes(userId)
    await recordAudit(this.db, {
      tenantId: user.tenantId,
      actorUserId: user.id,
      action: 'TOTP_DISABLED',
      resourceType: 'user',
      resourceId: user.id,
      result: 'success',
      ...ctx,
    })
  }

  // Etapa 2 do login: valida TOTP ou código de backup sobre o desafio pendente.
  async login2fa(input: Login2faInput, ctx: RequestContext): Promise<AuthResult> {
    const userId = verifyPending2faToken(input.pendingToken, this.config)
    if (!userId) {
      throw new AppError(401, 'UNAUTHORIZED', 'Sessão de verificação expirada — faça login novamente')
    }
    const [user] = await this.repo.findUserById(userId)
    if (!user?.totpEnabled || !user.totpSecret) {
      throw new AppError(401, 'UNAUTHORIZED', 'Verificação em duas etapas não está ativa')
    }
    const secret = OTPAuth.Secret.fromBase32(this.decryptTotp(user.totpSecret))
    let ok = this.buildTotp(user.email, secret).validate({ token: input.code, window: 1 }) !== null
    let usedBackup = false
    if (!ok) {
      const [bc] = await this.repo.findUnusedBackupCode(
        user.id,
        hashRefreshToken(normalizeBackupCode(input.code)),
      )
      if (bc) {
        await this.repo.markBackupCodeUsed(bc.id)
        ok = true
        usedBackup = true
      }
    }
    if (!ok) {
      await recordAudit(this.db, {
        tenantId: user.tenantId,
        actorUserId: user.id,
        action: 'LOGIN_2FA_FAILURE',
        resourceType: 'user',
        resourceId: user.id,
        result: 'denied',
        ...ctx,
      })
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Código inválido')
    }
    await recordAudit(this.db, {
      tenantId: user.tenantId,
      actorUserId: user.id,
      action: usedBackup ? 'BACKUP_CODE_USED' : 'LOGIN_SUCCESS',
      resourceType: 'user',
      resourceId: user.id,
      result: 'success',
      ...ctx,
    })
    return this.issueTokens(user, ctx)
  }

  private async issueTokens(
    user: { id: string; tenantId: string; role: 'OWNER' | 'ADMIN' | 'PSYCHOLOGIST' | 'ASSISTANT'; email: string; nome: string; crp: string | null; totpEnabled?: boolean },
    ctx: RequestContext,
  ): Promise<AuthResult> {
    const accessToken = signAccessToken(
      { userId: user.id, tenantId: user.tenantId, role: user.role },
      this.config,
    )
    const rt = generateRefreshToken(this.config.REFRESH_TOKEN_TTL_DAYS)
    await this.repo.insertRefreshToken({
      userId: user.id,
      tokenHash: rt.tokenHash,
      expiresAt: rt.expiresAt,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    })
    return {
      user: {
        id: user.id,
        email: user.email,
        nome: user.nome,
        crp: user.crp,
        role: user.role,
        totpEnabled: user.totpEnabled ?? false,
      },
      accessToken,
      refreshToken: rt.token,
    }
  }
}
