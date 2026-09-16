import dotenv from 'dotenv'

dotenv.config({ path: ['.env', '../.env'] })

import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { loadConfig } from '../config.js'
import { createPool } from './client.js'

async function main() {
  const config = loadConfig()
  const pool = createPool(config.DATABASE_URL)
  try {
    await migrate(drizzle(pool), { migrationsFolder: './src/db/migrations' })
    console.log('migrations applied')
  } finally {
    await pool.end()
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
