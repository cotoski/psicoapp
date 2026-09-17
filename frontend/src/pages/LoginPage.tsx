import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Brain, Loader2, ShieldCheck } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { ApiError } from '../api/client'
import { Input } from '../components/ui/Input'
import { Button } from '../components/ui/Button'

export function LoginPage() {
  const { login, verify2fa } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [pending, setPending] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const pendingToken = await login(email, senha)
      if (pendingToken) {
        setPending(pendingToken)
      } else {
        navigate('/', { replace: true })
      }
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

  async function onSubmit2fa(e: FormEvent) {
    e.preventDefault()
    if (!pending) return
    setError(null)
    setBusy(true)
    try {
      await verify2fa(pending, code)
      navigate('/', { replace: true })
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 401
          ? 'Código inválido ou expirado.'
          : 'Não foi possível verificar. Tente novamente.',
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
          {pending ? (
            <>
              <div className="mb-1 flex items-center gap-2">
                <ShieldCheck className="size-4 text-primary" />
                <h2 className="text-base font-semibold">Verificação em duas etapas</h2>
              </div>
              <p className="mb-5 mt-1 text-sm text-muted-foreground">
                Abra seu app autenticador e digite o código de 6 dígitos — ou um código de
                backup.
              </p>
              <form onSubmit={(e) => void onSubmit2fa(e)}>
                {error && (
                  <div className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {error}
                  </div>
                )}
                <Input
                  label="Código"
                  name="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="000000"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  required
                  autoFocus
                />
                <Button type="submit" disabled={busy} className="w-full">
                  {busy && <Loader2 className="animate-spin" />}
                  {busy ? 'Verificando…' : 'Verificar'}
                </Button>
                <div className="mt-4 text-center">
                  <button
                    type="button"
                    onClick={() => {
                      setPending(null)
                      setCode('')
                      setError(null)
                    }}
                    className="text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-primary hover:underline"
                  >
                    Voltar
                  </button>
                </div>
              </form>
            </>
          ) : (
            <>
              <h2 className="text-base font-semibold">Bem-vindo de volta</h2>
              <p className="mb-5 mt-1 text-sm text-muted-foreground">
                Entre com suas credenciais para continuar.
              </p>
              <form onSubmit={(e) => void onSubmit(e)}>
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
                <div className="mb-4 -mt-3 text-right">
                  <Link
                    to="/recuperar-senha"
                    className="text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-primary hover:underline"
                  >
                    Esqueci a senha
                  </Link>
                </div>
                <Button type="submit" disabled={busy} className="w-full">
                  {busy && <Loader2 className="animate-spin" />}
                  {busy ? 'Entrando…' : 'Entrar'}
                </Button>
              </form>
            </>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Acesso restrito a profissionais do consultório.
        </p>
      </div>
    </div>
  )
}
