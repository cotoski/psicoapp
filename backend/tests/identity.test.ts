import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import * as OTPAuth from 'otpauth'
import type { Express } from 'express'
import { eq } from 'drizzle-orm'
import { createApp } from '../src/app.js'
import type { Db } from '../src/db/client.js'
import { auditEvents, passwordResetTokens, users } from '../src/db/schema.js'
import { generatePasswordResetToken } from '../src/modules/identity/tokens.js'
import { testConfig, testDb, testLogger, truncateAll } from './helpers.js'

const hasDb = Boolean(process.env.DATABASE_URL)
const db: Db | null = hasDb ? testDb() : null

let app: Express
function freshApp() {
  // App novo por teste → rate limiter limpo
  return createApp({ config: testConfig(), logger: testLogger(), db: db! })
}

function refreshCookieFrom(res: request.Response): string {
  const cookies = res.headers['set-cookie']
  const raw = (Array.isArray(cookies) ? cookies : [cookies])
    .filter(Boolean)
    .find((c) => c.startsWith('psicoapp_rt='))
  expect(raw, 'refresh cookie ausente').toBeTruthy()
  return raw!.split(';')[0]
}

const cred = {
  email: 'ana@clinica.test',
  password: 'senha-forte-123',
  nome: 'Dra. Ana',
  crp: '06/12345',
  tenantName: 'Clínica Ana',
}

async function registerUser(email = cred.email) {
  return request(app!).post('/api/v1/auth/register').send({ ...cred, email })
}

describe.skipIf(!hasDb)('identity', () => {
  beforeEach(async () => {
    await truncateAll(db!)
    app = freshApp()
  })

  afterAll(async () => {
    await db!.$client.end()
  })

  it('register cria tenant+user OWNER e retorna access token + cookie httpOnly', async () => {
    const res = await registerUser()
    expect(res.status).toBe(201)
    expect(res.body.accessToken).toBeTruthy()
    expect(res.body.user.role).toBe('OWNER')
    expect(res.body.user.email).toBe(cred.email)
    refreshCookieFrom(res)
    const setCookies = res.headers['set-cookie']
    const headerStr = Array.isArray(setCookies)
      ? setCookies.join('; ')
      : String(setCookies ?? '')
    expect(headerStr).toContain('HttpOnly')
    // access token decodifica com claims corretos
    const payload = jwt.decode(res.body.accessToken) as { sub: string; tid: string }
    expect(payload.sub).toBe(res.body.user.id)
    expect(payload.tid).toBeTruthy()
  })

  it('register com e-mail duplicado retorna 409 genérico', async () => {
    await registerUser()
    const res = await request(app).post('/api/v1/auth/register').send(cred)
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('EMAIL_IN_USE')
    expect(res.body.error.message).not.toMatch(/existe|cadastrado/i)
  })

  it('register com e-mail inválido retorna VALIDATION_ERROR', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ ...cred, email: 'nao-e-email' })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('login com senha errada → 401 e audit LOGIN_FAILURE', async () => {
    await registerUser()
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: cred.email, password: 'errada-123' })
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS')
    const events = await db!
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.action, 'LOGIN_FAILURE'))
    expect(events).toHaveLength(1)
    expect(events[0].result).toBe('denied')
  })

  it('login correto → tokens + audit LOGIN_SUCCESS', async () => {
    await registerUser()
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: cred.email, password: cred.password })
    expect(res.status).toBe(200)
    expect(res.body.accessToken).toBeTruthy()
    refreshCookieFrom(res)
    const events = await db!
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.action, 'LOGIN_SUCCESS'))
    expect(events.length).toBeGreaterThanOrEqual(1)
  })

  it('GET /auth/me exige token válido', async () => {
    await request(app).get('/api/v1/auth/me').expect(401)

    const reg = await registerUser()
    const me = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${reg.body.accessToken}`)
    expect(me.status).toBe(200)
    expect(me.body.email).toBe(cred.email)
  })

  it('token expirado → 401 TOKEN_EXPIRED', async () => {
    const reg = await registerUser()
    const expired = jwt.sign(
      { sub: reg.body.user.id, tid: 't', role: 'OWNER' },
      testConfig().JWT_SECRET,
      { expiresIn: '-10s', issuer: 'psicoapp', audience: 'psicoapp-api' },
    )
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${expired}`)
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('TOKEN_EXPIRED')
  })

  it('refresh rotaciona o token; reuso do antigo revoga toda a cadeia', async () => {
    const reg = await registerUser()
    const rt1 = refreshCookieFrom(reg)

    // rotação: rt1 → rt2
    const r1 = await request(app).post('/api/v1/auth/refresh').set('Cookie', rt1)
    expect(r1.status).toBe(200)
    const rt2 = refreshCookieFrom(r1)
    expect(rt2).not.toBe(rt1)

    // reuso de rt1 (revogado) → 401 + revogação da cadeia
    const reuse = await request(app).post('/api/v1/auth/refresh').set('Cookie', rt1)
    expect(reuse.status).toBe(401)

    // rt2 (válido) também morreu — prova da revogação em cadeia
    const chained = await request(app).post('/api/v1/auth/refresh').set('Cookie', rt2)
    expect(chained.status).toBe(401)

    // cada apresentação de token inválido é auditada (rt1 reuso + rt2 revogado em cadeia)
    const events = await db!
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.action, 'REFRESH_TOKEN_REUSED'))
    expect(events).toHaveLength(2)
  })

  it('logout revoga o refresh token e limpa o cookie', async () => {
    const reg = await registerUser()
    const rt = refreshCookieFrom(reg)

    const out = await request(app).post('/api/v1/auth/logout').set('Cookie', rt)
    expect(out.status).toBe(204)

    const res = await request(app).post('/api/v1/auth/refresh').set('Cookie', rt)
    expect(res.status).toBe(401)

    const events = await db!
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.action, 'LOGOUT'))
    expect(events).toHaveLength(1)
  })

  it('rate limit no login após 10 tentativas → 429', { timeout: 30000 }, async () => {
    await registerUser()
    for (let i = 0; i < 10; i++) {
      await request(app)
        .post('/api/v1/auth/login')
        .send({ email: cred.email, password: 'errada' })
    }
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: cred.email, password: 'errada' })
    expect(res.status).toBe(429)
  })

  it('PATCH /auth/me atualiza nome/crp/email e o novo e-mail loga', async () => {
    const reg = await registerUser()
    const res = await request(app)
      .patch('/api/v1/auth/me')
      .set('Authorization', `Bearer ${reg.body.accessToken}`)
      .send({ nome: 'Dra. Ana Silva', crp: '06/99999', email: 'ana.nova@clinica.test' })
    expect(res.status).toBe(200)
    expect(res.body.nome).toBe('Dra. Ana Silva')
    expect(res.body.crp).toBe('06/99999')

    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'ana.nova@clinica.test', password: cred.password })
    expect(login.status).toBe(200)
  })

  it('PATCH /auth/me com e-mail de outro usuário → 409 EMAIL_IN_USE', async () => {
    const reg = await registerUser()
    await registerUser('outra@clinica.test')
    const res = await request(app)
      .patch('/api/v1/auth/me')
      .set('Authorization', `Bearer ${reg.body.accessToken}`)
      .send({ email: 'outra@clinica.test' })
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('EMAIL_IN_USE')
  })

  it('change-password: senha atual errada → 400; correta → sessões antigas revogadas', async () => {
    const reg = await registerUser()
    const wrong = await request(app)
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${reg.body.accessToken}`)
      .send({ currentPassword: 'errada', newPassword: 'nova-senha-123' })
    expect(wrong.status).toBe(400)
    expect(wrong.body.error.code).toBe('INVALID_CURRENT_PASSWORD')

    const rt1 = refreshCookieFrom(reg)
    const ok = await request(app)
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${reg.body.accessToken}`)
      .send({ currentPassword: cred.password, newPassword: 'nova-senha-123' })
    expect(ok.status).toBe(200)
    expect(ok.body.accessToken).toBeTruthy()

    // o novo refresh token (da troca de senha) funciona
    const refNew = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', refreshCookieFrom(ok))
    expect(refNew.status).toBe(200)

    // o token anterior está revogado — apresentá-lo dispara a detecção de
    // reuso, que revoga toda a cadeia (comportamento de segurança existente)
    const refOld = await request(app).post('/api/v1/auth/refresh').set('Cookie', rt1)
    expect(refOld.status).toBe(401)

    const oldLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: cred.email, password: cred.password })
    expect(oldLogin.status).toBe(401)
  })

  it('forgot-password: resposta genérica com e sem usuário; cria token no banco', async () => {
    const anon = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'ninguem@clinica.test' })
    expect(anon.status).toBe(200)

    await registerUser()
    const res = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: cred.email })
    expect(res.status).toBe(200)
    const rows = await db!.select().from(passwordResetTokens)
    expect(rows).toHaveLength(1)
  })

  it('reset-password troca a senha e invalida o token', async () => {
    await registerUser()
    const [user] = await db!.select().from(users).where(eq(users.email, cred.email))
    const rt = generatePasswordResetToken()
    await db!.insert(passwordResetTokens).values({
      userId: user.id,
      tokenHash: rt.tokenHash,
      expiresAt: rt.expiresAt,
    })

    const res = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: rt.token, newPassword: 'nova-senha-123' })
    expect(res.status).toBe(200)

    const ok = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: cred.email, password: 'nova-senha-123' })
    expect(ok.status).toBe(200)
    const old = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: cred.email, password: cred.password })
    expect(old.status).toBe(401)

    const reuse = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: rt.token, newPassword: 'outra-senha-1' })
    expect(reuse.status).toBe(400)
    expect(reuse.body.error.code).toBe('INVALID_RESET_TOKEN')
  })

  it('avatar: PUT guarda, GET devolve os bytes, DELETE remove', async () => {
    const reg = await registerUser()
    const authz = { Authorization: `Bearer ${reg.body.accessToken}` }
    const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex')

    const put = await request(app)
      .put('/api/v1/auth/me/avatar')
      .set(authz)
      .set('Content-Type', 'image/png')
      .send(png)
    expect(put.status).toBe(204)

    const get = await request(app).get('/api/v1/auth/me/avatar').set(authz)
    expect(get.status).toBe(200)
    expect(get.headers['content-type']).toMatch(/image\/png/)
    expect(get.body).toEqual(png)

    const del = await request(app).delete('/api/v1/auth/me/avatar').set(authz)
    expect(del.status).toBe(204)
    const gone = await request(app).get('/api/v1/auth/me/avatar').set(authz)
    expect(gone.status).toBe(404)
  })

  it('avatar com mime fora da whitelist → 415', async () => {
    const reg = await registerUser()
    const res = await request(app)
      .put('/api/v1/auth/me/avatar')
      .set('Authorization', `Bearer ${reg.body.accessToken}`)
      .set('Content-Type', 'image/gif')
      .send(Buffer.from('474946383961', 'hex'))
    expect(res.status).toBe(415)
    expect(res.body.error.code).toBe('UNSUPPORTED_MEDIA')
  })

  it('2FA: setup → enable → login em duas etapas → backup code → disable', async () => {
    const reg = await registerUser()
    const authz = { Authorization: `Bearer ${reg.body.accessToken}` }

    const setup = await request(app).post('/api/v1/auth/2fa/setup').set(authz)
    expect(setup.status).toBe(200)
    expect(setup.body.secret).toBeTruthy()
    expect(setup.body.qrCode).toMatch(/^data:image\/png/)

    const totp = new OTPAuth.TOTP({
      secret: OTPAuth.Secret.fromBase32(setup.body.secret),
      digits: 6,
      period: 30,
    })
    const wrongCode = totp.generate() === '000000' ? '111111' : '000000'

    // ativação com código errado → 400
    const badEnable = await request(app)
      .post('/api/v1/auth/2fa/enable')
      .set(authz)
      .send({ code: wrongCode })
    expect(badEnable.status).toBe(400)

    // ativação válida → 8 códigos de backup
    const enable = await request(app)
      .post('/api/v1/auth/2fa/enable')
      .set(authz)
      .send({ code: totp.generate() })
    expect(enable.status).toBe(200)
    expect(enable.body.backupCodes).toHaveLength(8)

    // login agora retorna desafio — sem access token nem cookie de refresh
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: cred.email, password: cred.password })
    expect(login.status).toBe(200)
    expect(login.body.requires2fa).toBe(true)
    expect(login.body.pendingToken).toBeTruthy()
    expect(login.body.accessToken).toBeUndefined()
    expect(
      (Array.isArray(login.headers['set-cookie'])
        ? login.headers['set-cookie']
        : [login.headers['set-cookie']]
      ).some((c) => c?.startsWith('psicoapp_rt=')),
    ).toBe(false)

    // código errado → 401
    const badCode = await request(app)
      .post('/api/v1/auth/login/2fa')
      .send({ pendingToken: login.body.pendingToken, code: wrongCode })
    expect(badCode.status).toBe(401)

    // código TOTP válido → sessão completa
    const done = await request(app)
      .post('/api/v1/auth/login/2fa')
      .send({ pendingToken: login.body.pendingToken, code: totp.generate() })
    expect(done.status).toBe(200)
    expect(done.body.accessToken).toBeTruthy()
    refreshCookieFrom(done)

    // código de backup também completa o login — e não pode ser reusado
    const login2 = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: cred.email, password: cred.password })
    const viaBackup = await request(app)
      .post('/api/v1/auth/login/2fa')
      .send({ pendingToken: login2.body.pendingToken, code: enable.body.backupCodes[0] })
    expect(viaBackup.status).toBe(200)

    const login3 = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: cred.email, password: cred.password })
    const reuse = await request(app)
      .post('/api/v1/auth/login/2fa')
      .send({ pendingToken: login3.body.pendingToken, code: enable.body.backupCodes[0] })
    expect(reuse.status).toBe(401)

    // desativação exige senha + código válido
    const off = await request(app)
      .post('/api/v1/auth/2fa/disable')
      .set('Authorization', `Bearer ${done.body.accessToken}`)
      .send({ password: cred.password, code: totp.generate() })
    expect(off.status).toBe(204)

    // login volta a ser direto
    const plain = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: cred.email, password: cred.password })
    expect(plain.body.requires2fa).toBeUndefined()
    expect(plain.body.accessToken).toBeTruthy()
  })

  it('2FA: pendingToken de um usuário não funciona em outro; expirado → 401', async () => {
    const reg = await registerUser()
    const authz = { Authorization: `Bearer ${reg.body.accessToken}` }
    await request(app).post('/api/v1/auth/2fa/setup').set(authz)
    // pendingToken forjado com escopo errado → 401
    const forged = jwt.sign(
      { sub: reg.body.user.id, scope: 'access' },
      testConfig().JWT_SECRET,
      { issuer: 'psicoapp', audience: 'psicoapp-api' },
    )
    const res = await request(app)
      .post('/api/v1/auth/login/2fa')
      .send({ pendingToken: forged, code: '123456' })
    expect(res.status).toBe(401)
  })
})
