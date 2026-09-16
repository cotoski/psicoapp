import client from 'prom-client'

export const register = new client.Registry()
client.collectDefaultMetrics({ register })

export const httpDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duração das requisições HTTP',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
  registers: [register],
})

export const http5xx = new client.Counter({
  name: 'http_5xx_total',
  help: 'Respostas 5xx',
  labelNames: ['route'],
  registers: [register],
})

export const authFailures = new client.Counter({
  name: 'auth_failures_total',
  help: 'Falhas de autenticação (401, credenciais inválidas, token expirado)',
  labelNames: ['code'],
  registers: [register],
})

export const permissionDenied = new client.Counter({
  name: 'permission_denied_total',
  help: 'Negações de autorização (403, tenant mismatch, RBAC)',
  labelNames: ['code'],
  registers: [register],
})
