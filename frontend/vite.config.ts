import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    // Bind mounts do Docker Desktop no Windows nem sempre propagam eventos de
    // arquivo — polling garante o HMR funcionar dentro do container.
    watch: { usePolling: true },
    // Permite acesso do container Playwright via host.docker.internal (dev only).
    allowedHosts: ['host.docker.internal'],
    proxy: {
      // Dev: mesmo origin para o cookie de refresh (SameSite=strict) funcionar.
      '/api': {
        target: process.env.VITE_API_PROXY ?? 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
