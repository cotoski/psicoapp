import { Router } from 'express'
import type { Db } from '../../db/client.js'
import { requirePermission } from '../../shared/middleware/tenancy.js'
import { BillingService } from './service.js'
import { invoiceSchema, summarySchema } from './schemas.js'

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

export function billingRouter({ db }: { db: Db }): Router {
  const router = Router()
  const service = new BillingService(db)

  router.get('/pending', requirePermission(db, 'billing:read'), async (req, res) => {
    res.json(await service.pending(actor(req)))
  })

  router.post('/invoice', requirePermission(db, 'billing:create'), async (req, res) => {
    const input = invoiceSchema.parse(req.body)
    res.json(await service.invoice(actor(req), input))
  })

  router.get('/invoiced', requirePermission(db, 'billing:read'), async (req, res) => {
    const q = summarySchema.parse(req.query)
    res.json(await service.invoiced(actor(req), q))
  })

  return router
}

export function financeRouter({ db }: { db: Db }): Router {
  const router = Router()
  const service = new BillingService(db)

  router.get(
    '/summary',
    requirePermission(db, 'financial:read'),
    async (req, res) => {
      const q = summarySchema.parse(req.query)
      res.json(await service.monthlySummary(actor(req), q))
    },
  )

  return router
}

export function dashboardRouter({ db }: { db: Db }): Router {
  const router = Router()
  const service = new BillingService(db)

  router.get('/', requirePermission(db, 'dashboard:read'), async (req, res) => {
    res.json(await service.dashboard(actor(req)))
  })

  return router
}
