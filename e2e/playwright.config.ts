import { defineConfig } from '@playwright/test'

// E2E roda contra o ambiente dev já levantado:
//   frontend  :5173 (ou BASE_URL) → proxy /api → backend :3001
// Sobe tudo com docker compose / containers de dev antes de `npm test`.
export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  retries: 0,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3100',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
})
