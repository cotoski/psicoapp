import type { RequestHandler } from 'express'
import { httpDuration, http5xx } from '../metrics.js'

// Mede duração por rota normalizada (path params → :id) e conta 5xx.
export const metricsMiddleware: RequestHandler = (req, res, next) => {
  const start = process.hrtime.bigint()
  res.on('finish', () => {
    const route =
      (req.route?.path as string | undefined) &&
      `${req.baseUrl}${req.route.path}`
    const labels = {
      method: req.method,
      route: route || 'unmatched',
      status: String(res.statusCode),
    }
    const seconds = Number(process.hrtime.bigint() - start) / 1e9
    httpDuration.observe(labels, seconds)
    if (res.statusCode >= 500) http5xx.inc({ route: labels.route })
  })
  next()
}
