/**
 * Cliente HTTP da API.
 *
 * - Token de acesso fica APENAS em memória (nunca localStorage — ver assessment S7).
 * - Refresh via cookie httpOnly SameSite=strict enviado automaticamente.
 * - Em 401, tenta um único refresh e repete a requisição.
 */
const BASE = '/api/v1'

export interface FieldIssue {
  path: string
  message: string
}

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
    public requestId?: string,
    public details?: FieldIssue[],
  ) {
    super(message)
  }
}

export interface AuthUser {
  id: string
  email: string
  nome: string
  crp: string | null
  role: 'OWNER' | 'ADMIN' | 'PSYCHOLOGIST' | 'ASSISTANT'
  totpEnabled: boolean
  tenantId: string
}

// Resposta do login: sessão completa ou desafio do segundo fator.
export type LoginResponse =
  | { user: AuthUser; accessToken: string }
  | { requires2fa: true; pendingToken: string }

let accessToken: string | null = null
let onSessionExpired: (() => void) | null = null
let refreshing: Promise<RefreshResult | null> | null = null

export function setAccessToken(token: string | null) {
  accessToken = token
}

export function setSessionExpiredHandler(fn: () => void) {
  onSessionExpired = fn
}

interface RefreshResult {
  user: AuthUser
  accessToken: string
}

/**
 * Refresh deduplicado: chamadas concorrentes (ex.: StrictMode montando o
 * effect 2×, ou várias requests 401 simultâneas) compartilham a mesma
 * promessa — sem isso, dois refreshes com o mesmo cookie disparam a
 * detecção de reuso do backend e revogam a cadeia inteira.
 */
export function refreshSession(): Promise<RefreshResult | null> {
  refreshing ??= fetch(`${BASE}/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
  })
    .then(async (res) => {
      if (!res.ok) return null
      const data = (await res.json()) as RefreshResult
      accessToken = data.accessToken
      return data
    })
    .catch(() => null)
    .finally(() => {
      refreshing = null
    })
  return refreshing
}

async function tryRefresh(): Promise<boolean> {
  return (await refreshSession()) !== null
}

async function rawRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.body instanceof Blob) {
    headers.set('Content-Type', init.body.type || 'application/octet-stream')
  } else if (init.body != null) {
    headers.set('Content-Type', 'application/json')
  }
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`)

  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers,
    credentials: 'include',
  })

  if (res.status === 204) return undefined as T

  const body = (await res.json().catch(() => null)) as {
    error?: {
      code?: string
      message?: string
      requestId?: string
      details?: FieldIssue[]
    }
  } | null

  if (!res.ok) {
    throw new ApiError(
      body?.error?.code ?? 'UNKNOWN',
      body?.error?.message ?? `Erro ${res.status}`,
      res.status,
      body?.error?.requestId,
      body?.error?.details,
    )
  }
  return body as T
}

export async function api<T>(path: string, init: RequestInit = {}, _retried = false): Promise<T> {
  try {
    return await rawRequest<T>(path, init)
  } catch (err) {
    if (err instanceof ApiError && err.status === 401 && !_retried && !path.startsWith('/auth/')) {
      if (await tryRefresh()) return api<T>(path, init, true)
      accessToken = null
      onSessionExpired?.()
    }
    throw err
  }
}

export const apiGet = <T>(path: string) => api<T>(path)
export const apiPost = <T>(path: string, body?: unknown) =>
  api<T>(path, { method: 'POST', body: body == null ? undefined : JSON.stringify(body) })
export const apiPut = <T>(path: string, body: unknown) =>
  api<T>(path, { method: 'PUT', body: JSON.stringify(body) })
export const apiPatch = <T>(path: string, body: unknown) =>
  api<T>(path, { method: 'PATCH', body: JSON.stringify(body) })
export const apiDelete = <T>(path: string) => api<T>(path, { method: 'DELETE' })
// Upload binário (ex.: foto de perfil) — Content-Type vem do próprio Blob.
export const apiUpload = <T>(path: string, blob: Blob) =>
  api<T>(path, { method: 'PUT', body: blob })

/**
 * GET de conteúdo binário (ex.: avatar) com a mesma política de retry em 401.
 */
export async function apiBlob(path: string, _retried = false): Promise<Blob> {
  const headers = new Headers()
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`)
  const res = await fetch(`${BASE}${path}`, { headers, credentials: 'include' })

  if (res.status === 401 && !_retried) {
    if (await tryRefresh()) return apiBlob(path, true)
    accessToken = null
    onSessionExpired?.()
  }
  if (!res.ok) {
    throw new ApiError(
      res.status === 404 ? 'NOT_FOUND' : 'UNKNOWN',
      `Erro ${res.status}`,
      res.status,
    )
  }
  return res.blob()
}
