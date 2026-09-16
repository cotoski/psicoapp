import { randomUUID } from 'node:crypto'
import type { RequestHandler } from 'express'

declare module 'express-serve-static-core' {
  interface Request {
    id: string
  }
}

export const requestId: RequestHandler = (req, res, next) => {
  const incoming = req.get('x-request-id')
  req.id =
    typeof incoming === 'string' && incoming.length > 0 && incoming.length <= 128
      ? incoming
      : randomUUID()
  res.setHeader('x-request-id', req.id)
  next()
}
