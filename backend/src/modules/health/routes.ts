import { Router } from 'express'

export interface ReadinessCheck {
  name: string
  check: () => Promise<void>
}

// /health/live: processo vivo. /health/ready: dependências críticas.
// Nunca expõe informação sensível (plano §14).
export function healthRouter(readinessChecks: ReadinessCheck[] = []): Router {
  const router = Router()

  router.get('/live', (_req, res) => {
    res.json({ status: 'ok' })
  })

  router.get('/ready', async (_req, res) => {
    const checks: Record<string, 'ok' | 'fail'> = {}
    let ok = true
    for (const c of readinessChecks) {
      try {
        await c.check()
        checks[c.name] = 'ok'
      } catch {
        checks[c.name] = 'fail'
        ok = false
      }
    }
    res.status(ok ? 200 : 503).json({ status: ok ? 'ready' : 'not_ready', checks })
  })

  return router
}
