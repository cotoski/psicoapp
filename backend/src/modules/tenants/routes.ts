import { Router } from 'express'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import type { Db } from '../../db/client.js'
import { tenants } from '../../db/schema.js'
import { AppError } from '../../shared/errors.js'
import { requirePermission } from '../../shared/middleware/tenancy.js'
import { recordAudit } from '../audit/service.js'

// CNPJ (00.000.000/0000-00) ou CPF (000.000.000-00) — PF emite nota com CPF.
const docRegex = /^(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\d{3}\.\d{3}\.\d{3}-\d{2})$/

const companySchema = z.object({
  name: z.string().min(2).max(200).optional(),
  cnpj: z.string().regex(docRegex, 'Use CNPJ 00.000.000/0000-00 ou CPF 000.000.000-00').nullish(),
  inscricaoMunicipal: z.string().max(30).nullish(),
  logradouro: z.string().max(300).nullish(),
  numero: z.string().max(20).nullish(),
  complemento: z.string().max(100).nullish(),
  bairro: z.string().max(100).nullish(),
  cep: z.string().regex(/^\d{5}-\d{3}$/, 'CEP no formato 00000-000').nullish(),
  cidade: z.string().max(100).nullish(),
  uf: z
    .string()
    .regex(/^[A-Z]{2}$/, 'UF com 2 letras maiúsculas')
    .nullish(),
  telefone: z.string().max(50).nullish(),
  emailContato: z.string().email().max(255).nullish(),
})

const COMPANY_FIELDS = [
  'name',
  'cnpj',
  'inscricaoMunicipal',
  'logradouro',
  'numero',
  'complemento',
  'bairro',
  'cep',
  'cidade',
  'uf',
  'telefone',
  'emailContato',
] as const

export function tenantsRouter({ db }: { db: Db }): Router {
  const router = Router()

  router.get('/me', async (req, res) => {
    const [tenant] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.id, req.tenantId!))
      .limit(1)
    if (!tenant) throw new AppError(404, 'TENANT_NOT_FOUND', 'Tenant não encontrado')
    res.json(tenant)
  })

  router.put(
    '/me',
    requirePermission(db, 'tenant:update'),
    async (req, res) => {
      const input = companySchema.parse(req.body)
      const sets: Record<string, unknown> = {}
      for (const f of COMPANY_FIELDS) {
        if (f in input) sets[f] = (input as Record<string, unknown>)[f] ?? null
      }
      const [tenant] = await db
        .update(tenants)
        .set(sets)
        .where(eq(tenants.id, req.tenantId!))
        .returning()
      if (!tenant) throw new AppError(404, 'TENANT_NOT_FOUND', 'Tenant não encontrado')
      await recordAudit(db, {
        tenantId: req.tenantId,
        actorUserId: req.auth!.userId,
        action: 'TENANT_UPDATED',
        resourceType: 'tenant',
        resourceId: req.tenantId,
        result: 'success',
        ip: req.ip,
        requestId: req.id,
      })
      res.json(tenant)
    },
  )

  return router
}
