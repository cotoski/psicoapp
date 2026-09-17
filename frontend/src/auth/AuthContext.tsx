import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  apiBlob,
  apiGet,
  apiPost,
  refreshSession,
  setAccessToken,
  setSessionExpiredHandler,
  type AuthUser,
  type LoginResponse,
} from '../api/client'

export interface RegisterData {
  nome: string
  email: string
  password: string
  crp?: string
  tenantName: string
}

interface AuthState {
  user: AuthUser | null
  loading: boolean
  avatarUrl: string | null
  /** Retorna o pendingToken quando a conta exige o segundo fator. */
  login: (email: string, senha: string) => Promise<string | null>
  register: (dados: RegisterData) => Promise<void>
  verify2fa: (pendingToken: string, code: string) => Promise<void>
  logout: () => Promise<void>
  updateUser: (user: AuthUser) => void
  refreshAvatar: () => void
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [avatarTick, setAvatarTick] = useState(0)
  const avatarRef = useRef<string | null>(null)

  useEffect(() => {
    setSessionExpiredHandler(() => setUser(null))
    // Sessão persiste via cookie de refresh: ao abrir a app, tenta renovar.
    // refreshSession é deduplicado — StrictMode monta o effect 2× sem que o
    // segundo refresh dispare a detecção de reuso no backend.
    refreshSession()
      .then((res) => setUser(res?.user ?? null))
      .finally(() => setLoading(false))
  }, [])

  // Foto de perfil via fetch autenticado → objectURL (o <img> comum não
  // enviaria o Bearer token).
  useEffect(() => {
    if (!user) {
      setAvatarUrl(null)
      return
    }
    let cancelled = false
    apiBlob('/auth/me/avatar')
      .then((blob) => {
        if (cancelled) return
        const url = URL.createObjectURL(blob)
        if (avatarRef.current) URL.revokeObjectURL(avatarRef.current)
        avatarRef.current = url
        setAvatarUrl(url)
      })
      .catch(() => {
        if (!cancelled) setAvatarUrl(null)
      })
    return () => {
      cancelled = true
    }
  }, [user?.id, avatarTick])

  const login = useCallback(async (email: string, senha: string): Promise<string | null> => {
    const res = await apiPost<LoginResponse>('/auth/login', {
      email,
      password: senha,
    })
    if ('requires2fa' in res) return res.pendingToken
    setAccessToken(res.accessToken)
    setUser(res.user)
    return null
  }, [])

  const register = useCallback(async (dados: RegisterData) => {
    const res = await apiPost<{ user: AuthUser; accessToken: string }>('/auth/register', dados)
    setAccessToken(res.accessToken)
    setUser(res.user)
  }, [])

  const verify2fa = useCallback(async (pendingToken: string, code: string) => {
    const res = await apiPost<{ user: AuthUser; accessToken: string }>('/auth/login/2fa', {
      pendingToken,
      code,
    })
    setAccessToken(res.accessToken)
    setUser(res.user)
  }, [])

  const logout = useCallback(async () => {
    await apiPost('/auth/logout').catch(() => undefined)
    setAccessToken(null)
    setUser(null)
  }, [])

  const updateUser = useCallback((u: AuthUser) => setUser(u), [])
  const refreshAvatar = useCallback(() => setAvatarTick((t) => t + 1), [])

  return (
    <AuthContext.Provider
      value={{ user, loading, avatarUrl, login, register, verify2fa, logout, updateUser, refreshAvatar }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve ser usado dentro de <AuthProvider>')
  return ctx
}

export async function fetchMe(): Promise<AuthUser> {
  return apiGet<AuthUser>('/auth/me')
}
