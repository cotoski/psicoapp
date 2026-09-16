import type { ErrorRequestHandler, RequestHandler } from 'express'
import { ZodError } from 'zod'
import { authFailures, permissionDenied } from './metrics.js'

const AUTH_CODES = new Set(['UNAUTHORIZED', 'INVALID_CREDENTIALS', 'TOKEN_EXPIRED'])
const DENIED_CODES = new Set(['FORBIDDEN', 'TENANT_MISMATCH'])

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export const notFound: RequestHandler = (_req, _res, next) => {
  next(new AppError(404, 'NOT_FOUND', 'Recurso não encontrado'))
}

interface BodyParserError extends Error {
  type?: string
}

// Formato padrão (plano §31): { error: { code, message, requestId } }
// Nunca retorna stack trace ao cliente.
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const requestId = req.id

  if (err instanceof AppError) {
    if (AUTH_CODES.has(err.code)) authFailures.inc({ code: err.code })
    if (DENIED_CODES.has(err.code)) permissionDenied.inc({ code: err.code })
    if (err.statusCode >= 500) {
      req.log?.error({ err }, 'app error')
    } else {
      req.log?.warn({ err: { code: err.code, status: err.statusCode } }, 'request rejected')
    }
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        requestId,
        ...(err.details !== undefined ? { details: err.details } : {}),
      },
    })
    return
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Dados inválidos',
        requestId,
        details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
    })
    return
  }

  const bodyErr = err as BodyParserError
  if (bodyErr.type === 'entity.parse.failed') {
    res.status(400).json({
      error: { code: 'INVALID_JSON', message: 'JSON malformado', requestId },
    })
    return
  }
  if (bodyErr.type === 'entity.too.large') {
    res.status(413).json({
      error: { code: 'PAYLOAD_TOO_LARGE', message: 'Payload excede o limite', requestId },
    })
    return
  }

  req.log?.error({ err }, 'unhandled error')
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Erro interno', requestId },
  })
}
