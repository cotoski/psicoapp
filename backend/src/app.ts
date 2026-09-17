import express, { type Express } from 'express'
import helmet from 'helmet'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import { pinoHttp } from 'pino-http'
import type { Config } from './config.js'
import type { Logger } from './shared/logger.js'
import type { Db } from './db/client.js'
import { requestId } from './shared/middleware/requestId.js'
import { metricsMiddleware } from './shared/middleware/metrics.js'
import { register } from './shared/metrics.js'
import { errorHandler, notFound } from './shared/errors.js'
import { healthRouter, type ReadinessCheck } from './modules/health/routes.js'
import { identityRouter } from './modules/identity/routes.js'
import { tenantsRouter } from './modules/tenants/routes.js'
import { patientsRouter } from './modules/patients/routes.js'
import { appointmentsRouter } from './modules/appointments/routes.js'
import { recordsRouter } from './modules/records/routes.js'
import {
  billingRouter,
  financeRouter,
  dashboardRouter,
} from './modules/billing/routes.js'
import { taxRouter } from './modules/tax/routes.js'
import { requireAuth } from './shared/middleware/auth.js'
import { tenantContext } from './shared/middleware/tenancy.js'

export interface AppDeps {
  config: Config
  logger: Logger
  db: Db
  readinessChecks?: ReadinessCheck[]
}

export function createApp({ config, logger, db, readinessChecks = [] }: AppDeps): Express {
  const app = express()

  app.disable('x-powered-by')
  app.set('trust proxy', 1)

  app.use(requestId)
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req as express.Request).id,
      customProps: (req) => ({ request_id: (req as express.Request).id }),
      autoLogging: {
        ignore: (req) => req.url?.startsWith('/health') ?? false,
      },
    }),
  )
  app.use(helmet())
  app.use(cors({ origin: config.corsOrigins, credentials: true }))
  app.use(express.json({ limit: '100kb' }))
  app.use(cookieParser())
  app.use(metricsMiddleware)

  app.use('/health', healthRouter(readinessChecks))

  // Métricas Prometheus — exposto sem auth para scrape; em produção
  // restringir por rede/ingress (ver docs/observability.md).
  app.get('/metrics', async (_req, res) => {
    res.set('Content-Type', register.contentType)
    res.send(await register.metrics())
  })

  const api = express.Router()
  api.use('/auth', identityRouter({ db, config, logger }))

  // Default-deny: tudo abaixo exige auth + tenant válido no banco
  api.use(requireAuth(config), tenantContext(db))
  api.use('/tenants', tenantsRouter({ db }))
  api.use('/patients', patientsRouter({ db, config }))
  api.use('/appointments', appointmentsRouter({ db }))
  api.use('/appointments', recordsRouter({ db, config }))
  api.use('/billing', billingRouter({ db }))
  api.use('/finance', financeRouter({ db }))
  api.use('/dashboard', dashboardRouter({ db }))
  api.use('/tax', taxRouter({ db }))
  app.use('/api/v1', api)

  app.use(notFound)
  app.use(errorHandler)

  return app
}
