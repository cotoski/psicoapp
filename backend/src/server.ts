import dotenv from 'dotenv'

dotenv.config({ path: ['.env', '../.env'] })

import { loadConfig } from './config.js'
import { buildLogger } from './shared/logger.js'
import { createApp } from './app.js'
import { createPool } from './db/client.js'

async function main() {
  const config = loadConfig()
  const logger = buildLogger(config)
  const pool = createPool(config.DATABASE_URL)

  const app = createApp({
    config,
    logger,
    readinessChecks: [
      { name: 'database', check: async () => void (await pool.query('SELECT 1')) },
    ],
  })

  const server = app.listen(config.PORT, () => {
    logger.info({ port: config.PORT, env: config.NODE_ENV }, 'psicoapp-api listening')
  })

  const shutdown = (signal: string) => {
    logger.info({ signal }, 'shutting down')
    server.close(async () => {
      await pool.end()
      process.exit(0)
    })
    setTimeout(() => process.exit(1), 10_000).unref()
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
}

main().catch((err: unknown) => {
  // Falha rápida: config inválida ou porta indisponível impede o boot.
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
