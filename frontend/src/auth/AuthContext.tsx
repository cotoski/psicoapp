import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import {
  apiGet,
  apiPost,
  setAccessToken,
  setSessionExpiredHandler,
  type AuthUser,
} from '../api/client'

interface AuthState {
  user: AuthUser | null
  loading: boolean
  login: (email: string, senha: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setSessionExpiredHandler(() => setUser(null))
    // Sessão persiste via cookie de refresh: ao abrir a app, tenta renovar.
    apiPost<{ user: AuthUser; accessToken: string }>('/auth/refresh')
      .then((res) => {
        setAccessToken(res.accessToken)
        setUser(res.user)
      })
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [])

  const login = useCallback(async (email: string, senha: string) => {
    const res = await apiPost<{ user: AuthUser; accessToken: string }>('/auth/login', {
      email,
      senha,
    })
    setAccessToken(res.accessToken)
    setUser(res.user)
  }, [])

  const logout = useCallback(async () => {
    await apiPost('/auth/logout').catch(() => undefined)
    setAccessToken(null)
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
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
