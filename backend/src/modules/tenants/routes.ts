import { Router } from 'express'
import { eq } from 'drizzle-orm'
import type { Db } from '../../db/client.js'
import { tenants } from '../../db/schema.js'
import { AppError } from '../../shared/errors.js'

export function tenantsRouter({ db }: { db: Db }): Router {
  const router = Router()

  router.get('/me', async (req, res) => {
    const [tenant] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.id, req.tenantId!))
      .limit(1)
    if (!tenant) throw new AppError(404, 'TENANT_NOT_FOUND', 'Tenant não encontrado')
    res.json({ id: tenant.id, name: tenant.name })
  })

  return router
}
