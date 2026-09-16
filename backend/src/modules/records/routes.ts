import { Router } from 'express'
import type { Db } from '../../db/client.js'
import type { Config } from '../../config.js'
import { requirePermission } from '../../shared/middleware/tenancy.js'
import { RecordsService } from './service.js'
import { upsertRecordSchema } from './schemas.js'

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

function paramId(v: string | string[]): string {
  return Array.isArray(v) ? v[0] : v
}

// Montado sob /appointments — o :id da rota é o appointmentId.
export function recordsRouter({ db, config }: { db: Db; config: Config }): Router {
  const router = Router({ mergeParams: true })
  const service = new RecordsService(db, config)

  router.get(
    '/:appointmentId/record',
    requirePermission(db, 'records:read'),
    async (req, res) => {
      const record = await service.getByAppointment(
        actor(req),
        paramId(req.params.appointmentId),
      )
      if (!record) {
        return res.status(404).json({
          error: {
            code: 'RECORD_NOT_FOUND',
            message: 'Prontuário não encontrado',
            requestId: req.id,
          },
        })
      }
      res.json(record)
    },
  )

  router.put(
    '/:appointmentId/record',
    requirePermission(db, 'records:read', 'records:update'),
    async (req, res) => {
      const input = upsertRecordSchema.parse(req.body)
      res.json(
        await service.upsert(actor(req), paramId(req.params.appointmentId), input),
      )
    },
  )

  return router
}
