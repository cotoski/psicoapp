import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Loader2, MailCheck } from 'lucide-react'
import { apiPost } from '../api/client'
import { AuthShell } from '../components/AuthShell'
import { Alert } from '../components/ui/Alert'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'

export function RecuperarSenhaPage() {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await apiPost('/auth/forgot-password', { email })
      setSent(true)
    } catch {
      setError('Não foi possível enviar agora. Tente novamente em instantes.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell title="Recuperar senha" subtitle="Enviaremos um link para redefinir sua senha.">
      {sent ? (
        <div className="space-y-4">
          <Alert tone="success" className="flex items-start gap-2">
            <MailCheck className="mt-0.5 size-4 shrink-0" />
            <span>
              Se <strong>{email}</strong> estiver cadastrado, você receberá as instruções em
              alguns minutos. Verifique também a caixa de spam.
            </span>
          </Alert>
          <Button asChild variant="secondary" className="w-full">
            <Link to="/login">Voltar ao login</Link>
          </Button>
        </div>
      ) : (
        <form onSubmit={(e) => void onSubmit(e)}>
          {error && (
            <Alert tone="danger" className="mb-4">
              {error}
            </Alert>
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
          <Button type="submit" disabled={busy} className="w-full">
            {busy && <Loader2 className="animate-spin" />}
            Enviar link de recuperação
          </Button>
          <div className="mt-4 text-center">
            <Link
              to="/login"
              className="text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-primary hover:underline"
            >
              Voltar ao login
            </Link>
          </div>
        </form>
      )}
    </AuthShell>
  )
}
