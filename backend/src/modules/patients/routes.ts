import { Router } from 'express'
import type { Db } from '../../db/client.js'
import type { Config } from '../../config.js'
import { requirePermission, type Role } from '../../shared/middleware/tenancy.js'
import { PatientsService } from './service.js'
import {
  createPatientSchema,
  listPatientsSchema,
  updatePatientSchema,
} from './schemas.js'

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

function paramId(v: string | string[]): string {
  return Array.isArray(v) ? v[0] : v
}

function actor(req: {
  tenantId?: string
  auth?: { userId: string; role: string }
  ip?: string
  id: string
}) {
  return {
    tenantId: req.tenantId!,
    userId: req.auth!.userId,
    role: req.auth!.role as Role,
    ip: req.ip,
    requestId: req.id,
  }
}

export function patientsRouter({ db, config }: { db: Db; config: Config }): Router {
  const router = Router()
  const service = new PatientsService(db, config)

  router.get(
    '/',
    requirePermission(db, 'patients:read'),
    async (req, res) => {
      const q = listPatientsSchema.parse(req.query)
      res.json(await service.list(actor(req), q))
    },
  )

  router.post(
    '/',
    requirePermission(db, 'patients:create'),
    async (req, res) => {
      const input = createPatientSchema.parse(req.body)
      res.status(201).json(await service.create(actor(req), input))
    },
  )

  router.get(
    '/:id',
    requirePermission(db, 'patients:read'),
    async (req, res) => {
      if (!UUID_RE.test(paramId(req.params.id))) {
        return res
          .status(404)
          .json({ error: { code: 'PATIENT_NOT_FOUND', message: 'Paciente não encontrado', requestId: req.id } })
      }
      res.json(await service.getById(actor(req), paramId(req.params.id)))
    },
  )

  router.put(
    '/:id',
    requirePermission(db, 'patients:update'),
    async (req, res) => {
      const input = updatePatientSchema.parse(req.body)
      res.json(await service.update(actor(req), paramId(req.params.id), input))
    },
  )

  router.post(
    '/:id/archive',
    requirePermission(db, 'patients:archive'),
    async (req, res) => {
      res.json(await service.setArchived(actor(req), paramId(req.params.id), true))
    },
  )

  router.post(
    '/:id/unarchive',
    requirePermission(db, 'patients:archive'),
    async (req, res) => {
      res.json(await service.setArchived(actor(req), paramId(req.params.id), false))
    },
  )

  router.delete(
    '/:id',
    requirePermission(db, 'patients:archive'),
    async (req, res) => {
      await service.softDelete(actor(req), paramId(req.params.id))
      res.status(204).end()
    },
  )

  return router
}
