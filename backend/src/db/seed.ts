import dotenv from 'dotenv'

dotenv.config({ path: ['.env', '../.env'] })

import bcrypt from 'bcryptjs'
import { loadConfig } from '../config.js'
import { createDb } from './client.js'
import { tenants, users } from './schema.js'

// Seed explícito e apenas em desenvolvimento — nunca roda no boot
// nem em produção (divergência intencional do legado, behavior-spec B8).
async function main() {
  const config = loadConfig()
  if (config.NODE_ENV !== 'development') {
    throw new Error('seed permitido apenas com NODE_ENV=development')
  }
  const demoPassword = process.env.SEED_DEMO_PASSWORD
  if (!demoPassword) {
    throw new Error('SEED_DEMO_PASSWORD é obrigatório para seed')
  }

  const db = createDb(config.DATABASE_URL)

  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'Consultório Demo' })
    .returning()

  await db.insert(users).values({
    tenantId: tenant.id,
    email: 'demo@psicoapp.local',
    passwordHash: bcrypt.hashSync(demoPassword, 12),
    nome: 'Dra. Ana Demo',
    crp: '06/12345',
    role: 'OWNER',
  })

  console.log(`seed ok — tenant ${tenant.id}, usuário demo@psicoapp.local`)
  process.exit(0)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
