import { Router } from 'express'
import type { Db } from '../../db/client.js'
import { requirePermission } from '../../shared/middleware/tenancy.js'
import { AppointmentsService } from './service.js'
import {
  createAppointmentSchema,
  listAppointmentsSchema,
  updateAppointmentSchema,
} from './schemas.js'

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

function paramId(v: string | string[]): string {
  return Array.isArray(v) ? v[0] : v
}

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

export function appointmentsRouter({ db }: { db: Db }): Router {
  const router = Router()
  const service = new AppointmentsService(db)

  router.get('/', requirePermission(db, 'appointments:read'), async (req, res) => {
    const q = listAppointmentsSchema.parse(req.query)
    res.json(await service.list(actor(req), q))
  })

  router.post('/', requirePermission(db, 'appointments:create'), async (req, res) => {
    const input = createAppointmentSchema.parse(req.body)
    res.status(201).json(await service.create(actor(req), input))
  })

  router.get('/:id', requirePermission(db, 'appointments:read'), async (req, res) => {
    const id = paramId(req.params.id)
    if (!UUID_RE.test(id)) {
      return res.status(404).json({
        error: {
          code: 'APPOINTMENT_NOT_FOUND',
          message: 'Agendamento não encontrado',
          requestId: req.id,
        },
      })
    }
    res.json(await service.getById(actor(req), id))
  })

  router.put('/:id', requirePermission(db, 'appointments:update'), async (req, res) => {
    const input = updateAppointmentSchema.parse(req.body)
    res.json(await service.update(actor(req), paramId(req.params.id), input))
  })

  router.delete(
    '/:id',
    requirePermission(db, 'appointments:cancel'),
    async (req, res) => {
      await service.softDelete(actor(req), paramId(req.params.id))
      res.status(204).end()
    },
  )

  return router
}
