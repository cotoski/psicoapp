import { Router } from 'express'
import type { Db } from '../../db/client.js'
import { requirePermission } from '../../shared/middleware/tenancy.js'
import { TaxService } from './service.js'
import { fatorRSchema, simulateSchema, taxConfigSchema } from './schemas.js'

function actor(req: {
  tenantId?: string
  auth?: { userId: string }
  ip?: string
  id: string
}) {
  return {
    tenantId: req.tenantId!,
    userId: req.auth!.userId,
    ip: req.ip,
    requestId: req.id,
  }
}

export function taxRouter({ db }: { db: Db }): Router {
  const router = Router()
  const service = new TaxService(db)

  router.get('/config', requirePermission(db, 'tax:read'), async (req, res) => {
    res.json(await service.getConfig(actor(req)))
  })

  router.put('/config', requirePermission(db, 'tax:update'), async (req, res) => {
    const input = taxConfigSchema.parse(req.body)
    res.json(await service.putConfig(actor(req), input))
  })

  router.post('/fator-r', requirePermission(db, 'tax:read'), async (req, res) => {
    const input = fatorRSchema.parse(req.body)
    res.json(await service.fatorR(actor(req), input))
  })

  router.post('/simulate', requirePermission(db, 'tax:read'), async (req, res) => {
    const input = simulateSchema.parse(req.body)
    res.json(await service.simulate(actor(req), input))
  })

  return router
}
