import express, { type Express } from 'express'
import helmet from 'helmet'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import { pinoHttp } from 'pino-http'
import type { Config } from './config.js'
import type { Logger } from './shared/logger.js'
import type { Db } from './db/client.js'
import { requestId } from './shared/middleware/requestId.js'
import { errorHandler, notFound } from './shared/errors.js'
import { healthRouter, type ReadinessCheck } from './modules/health/routes.js'
import { identityRouter } from './modules/identity/routes.js'

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

  app.use('/health', healthRouter(readinessChecks))

  const api = express.Router()
  api.use('/auth', identityRouter({ db, config }))
  app.use('/api/v1', api)

  app.use(notFound)
  app.use(errorHandler)

  return app
}
