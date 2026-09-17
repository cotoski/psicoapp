import dotenv from 'dotenv'

dotenv.config({ path: ['.env', '../.env'] })

import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { loadConfig } from '../config.js'
import { createPool } from './client.js'

// Em dev (tsx) este arquivo vive em src/db/; compilado vive em dist/db/ —
// resolve a pasta de .sql relativa ao módulo em ambos os casos.
const migrationsFolder = [
  fileURLToPath(new URL('./migrations', import.meta.url)),
  fileURLToPath(new URL('../../src/db/migrations', import.meta.url)),
].find((p) => fs.existsSync(p))

async function main() {
  const config = loadConfig()
  const pool = createPool(config.DATABASE_URL)
  try {
    await migrate(drizzle(pool), { migrationsFolder: migrationsFolder! })
    console.log('migrations applied')
  } finally {
    await pool.end()
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
