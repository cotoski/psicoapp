import pg from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import * as schema from './schema.js'

export function createPool(connectionString: string): pg.Pool {
  return new pg.Pool({ connectionString })
}

export function createDb(connectionString: string) {
  return drizzle(createPool(connectionString), { schema })
}

export type Db = ReturnType<typeof createDb>
// Subconjunto estrutural que Db e transações (tx) compartilham — repos aceitam ambos.
export type DbLike = Pick<Db, 'select' | 'insert' | 'update' | 'delete' | 'execute'>
export { schema }
