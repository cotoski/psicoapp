import { and, eq, isNull } from 'drizzle-orm'
import type { Db } from '../../db/client.js'
import {
  backupCodes,
  passwordResetTokens,
  refreshTokens,
  tenants,
  users,
} from '../../db/schema.js'

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

  updateUser(id: string, data: { nome?: string; crp?: string | null; email?: string }) {
    return this.db.update(users).set(data).where(eq(users.id, id)).returning()
  }

  updatePassword(userId: string, passwordHash: string) {
    return this.db.update(users).set({ passwordHash }).where(eq(users.id, userId))
  }

  setAvatar(userId: string, avatar: Buffer, avatarMime: string) {
    return this.db.update(users).set({ avatar, avatarMime }).where(eq(users.id, userId))
  }

  clearAvatar(userId: string) {
    return this.db
      .update(users)
      .set({ avatar: null, avatarMime: null })
      .where(eq(users.id, userId))
  }

  findAvatarByUserId(userId: string) {
    return this.db
      .select({ avatar: users.avatar, avatarMime: users.avatarMime })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
  }

  insertPasswordResetToken(input: { userId: string; tokenHash: string; expiresAt: Date }) {
    return this.db.insert(passwordResetTokens).values(input).returning()
  }

  findPasswordResetTokenByHash(tokenHash: string) {
    return this.db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.tokenHash, tokenHash))
      .limit(1)
  }

  markPasswordResetTokenUsed(id: string) {
    return this.db
      .update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(and(eq(passwordResetTokens.id, id), isNull(passwordResetTokens.usedAt)))
  }

  // Invalida tokens anteriores ao pedir um novo (evita múltiplos links válidos).
  invalidateUserResetTokens(userId: string) {
    return this.db
      .update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(
        and(eq(passwordResetTokens.userId, userId), isNull(passwordResetTokens.usedAt)),
      )
  }

  setTotpSecret(userId: string, totpSecret: string) {
    return this.db
      .update(users)
      .set({ totpSecret, totpEnabled: false })
      .where(eq(users.id, userId))
  }

  setTotpEnabled(userId: string, enabled: boolean) {
    return this.db.update(users).set({ totpEnabled: enabled }).where(eq(users.id, userId))
  }

  clearTotp(userId: string) {
    return this.db
      .update(users)
      .set({ totpSecret: null, totpEnabled: false })
      .where(eq(users.id, userId))
  }

  // Substitui todos os códigos de backup do usuário (regeneração = novo conjunto)
  replaceBackupCodes(userId: string, hashes: string[]) {
    return this.db.transaction(async (tx) => {
      await tx.delete(backupCodes).where(eq(backupCodes.userId, userId))
      if (hashes.length > 0) {
        await tx
          .insert(backupCodes)
          .values(hashes.map((codeHash) => ({ userId, codeHash })))
      }
    })
  }

  findUnusedBackupCode(userId: string, codeHash: string) {
    return this.db
      .select()
      .from(backupCodes)
      .where(
        and(
          eq(backupCodes.userId, userId),
          eq(backupCodes.codeHash, codeHash),
          isNull(backupCodes.usedAt),
        ),
      )
      .limit(1)
  }

  markBackupCodeUsed(id: string) {
    return this.db
      .update(backupCodes)
      .set({ usedAt: new Date() })
      .where(and(eq(backupCodes.id, id), isNull(backupCodes.usedAt)))
  }

  deleteBackupCodes(userId: string) {
    return this.db.delete(backupCodes).where(eq(backupCodes.userId, userId))
  }
}
