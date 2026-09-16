import { and, eq, isNull } from 'drizzle-orm'
import type { Db } from '../../db/client.js'
import { refreshTokens, tenants, users } from '../../db/schema.js'

export class IdentityRepo {
  constructor(private db: Db) {}

  findUserByEmail(email: string) {
    return this.db.select().from(users).where(eq(users.email, email)).limit(1)
  }

  findUserById(id: string) {
    return this.db.select().from(users).where(eq(users.id, id)).limit(1)
  }

  createTenantWithUser(input: {
    tenantName: string
    email: string
    passwordHash: string
    nome: string
    crp?: string
  }) {
    return this.db.transaction(async (tx) => {
      const [tenant] = await tx
        .insert(tenants)
        .values({ name: input.tenantName })
        .returning()
      const [user] = await tx
        .insert(users)
        .values({
          tenantId: tenant.id,
          email: input.email,
          passwordHash: input.passwordHash,
          nome: input.nome,
          crp: input.crp,
          role: 'OWNER',
        })
        .returning()
      return { tenant, user }
    })
  }

  insertRefreshToken(input: {
    userId: string
    tokenHash: string
    expiresAt: Date
    ip?: string
    userAgent?: string
  }) {
    return this.db
      .insert(refreshTokens)
      .values({
        userId: input.userId,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
        ip: input.ip,
        userAgent: input.userAgent,
      })
      .returning()
  }

  findRefreshTokenByHash(tokenHash: string) {
    return this.db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, tokenHash))
      .limit(1)
  }

  revokeRefreshToken(id: string) {
    return this.db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.id, id), isNull(refreshTokens.revokedAt)))
  }

  // Detecção de reuso: revoga toda a cadeia do usuário.
  revokeAllUserTokens(userId: string) {
    return this.db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)))
  }
}
