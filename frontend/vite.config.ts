import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      // Dev: mesmo origin para o cookie de refresh (SameSite=strict) funcionar.
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
    },
  },
})
