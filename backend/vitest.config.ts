import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globalSetup: ['./tests/globalSetup.ts'],
    // Arquivos de integração compartilham psicoapp_test e fazem TRUNCATE —
    // rodar em paralelo causaria corrida entre arquivos.
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
    },
  },
})
