import { loadConfig, type Config } from '../src/config.js'
import { buildLogger } from '../src/shared/logger.js'

export function testConfig(overrides: NodeJS.ProcessEnv = {}): Config {
  return loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: 'postgres://test:test@localhost:5432/psicoapp_test',
    JWT_SECRET: 'x'.repeat(48),
    FIELD_ENCRYPTION_KEY: 'y'.repeat(48),
    LOG_LEVEL: 'silent',
    ...overrides,
  })
}

export function testLogger() {
  return buildLogger(testConfig())
}
