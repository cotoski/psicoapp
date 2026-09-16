import bcrypt from 'bcryptjs'
import type { Db } from '../../db/client.js'
import type { Config } from '../../config.js'
import { AppError } from '../../shared/errors.js'
import { recordAudit } from '../audit/service.js'
import { IdentityRepo } from './repo.js'
import { generateRefreshToken, hashRefreshToken, signAccessToken } from './tokens.js'
import type { LoginInput, RegisterInput } from './schemas.js'

export interface RequestContext {
  ip?: string
  userAgent?: string
  requestId?: string
}

export interface AuthResult {
  user: { id: string; email: string; nome: string; crp: string | null; role: string }
  accessToken: string
  refreshToken: string
}

const BCRYPT_COST = 12

export class IdentityService {
  private repo: IdentityRepo

  constructor(
    private db: Db,
    private config: Config,
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

  async login(input: LoginInput, ctx: RequestContext): Promise<AuthResult> {
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
      tenantId: user.tenantId,
    }
  }

  private async issueTokens(
    user: { id: string; tenantId: string; role: 'OWNER' | 'ADMIN' | 'PSYCHOLOGIST' | 'ASSISTANT'; email: string; nome: string; crp: string | null },
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
      },
      accessToken,
      refreshToken: rt.token,
    }
  }
}
