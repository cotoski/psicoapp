import pg from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'

// Cria o banco de teste (psicoapp_test) e aplica migrations.
// Roda apenas quando DATABASE_URL está disponível — testes de DB
// usam describe.skipIf sem a variável.
export default async function setup() {
  const baseUrl = process.env.DATABASE_URL
  if (!baseUrl) return

  const admin = new pg.Client({ connectionString: baseUrl })
  await admin.connect()
  try {
    const { rows } = await admin.query(
      "SELECT 1 FROM pg_database WHERE datname = 'psicoapp_test'",
    )
    if (rows.length === 0) {
      await admin.query('CREATE DATABASE psicoapp_test')
    }
  } finally {
    await admin.end()
  }

  const pool = new pg.Pool({ connectionString: testDbUrl() })
  try {
    await migrate(drizzle(pool), { migrationsFolder: './src/db/migrations' })
  } finally {
    await pool.end()
  }
}

export function testDbUrl(): string {
  return (process.env.DATABASE_URL ?? '').replace(/\/[^/]+$/, '/psicoapp_test')
}
