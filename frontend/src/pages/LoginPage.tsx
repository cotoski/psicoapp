import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Brain, Loader2 } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { ApiError } from '../api/client'
import { Input } from '../components/ui/Input'
import { Button } from '../components/ui/Button'

export function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await login(email, senha)
      navigate('/', { replace: true })
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 401
          ? 'E-mail ou senha inválidos.'
          : 'Não foi possível entrar. Tente novamente.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-accent/70 via-background to-secondary/70 p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-md">
            <Brain className="size-6" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">PsicoApp</h1>
          <p className="mt-1 text-sm text-muted-foreground">Gestão do seu consultório</p>
        </div>

        <div className="rounded-xl border bg-card p-6 shadow-md">
          <h2 className="text-base font-semibold">Bem-vindo de volta</h2>
          <p className="mb-5 mt-1 text-sm text-muted-foreground">
            Entre com suas credenciais para continuar.
          </p>
          <form onSubmit={onSubmit}>
            {error && (
              <div className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}
            <Input
              label="E-mail"
              name="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              autoFocus
            />
            <Input
              label="Senha"
              name="senha"
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              required
              autoComplete="current-password"
            />
            <Button type="submit" disabled={busy} className="w-full">
              {busy && <Loader2 className="animate-spin" />}
              {busy ? 'Entrando…' : 'Entrar'}
            </Button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Acesso restrito a profissionais do consultório.
        </p>
      </div>
    </div>
  )
}
