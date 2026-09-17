import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { apiPost } from '../api/client'
import { AuthShell } from '../components/AuthShell'
import { Alert } from '../components/ui/Alert'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'

export function RedefinirSenhaPage() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const [form, setForm] = useState({ nova: '', confirma: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (form.nova !== form.confirma) {
      setError('A confirmação não confere com a nova senha.')
      return
    }
    setBusy(true)
    try {
      await apiPost('/auth/reset-password', { token, newPassword: form.nova })
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível redefinir a senha.')
    } finally {
      setBusy(false)
    }
  }

  if (!token) {
    return (
      <AuthShell title="Link inválido" subtitle="O link de redefinição está incompleto.">
        <Alert tone="danger" className="mb-4">
          Abra o link enviado por e-mail novamente ou solicite um novo.
        </Alert>
        <Button asChild variant="secondary" className="w-full">
          <Link to="/recuperar-senha">Solicitar novo link</Link>
        </Button>
      </AuthShell>
    )
  }

  return (
    <AuthShell title="Redefinir senha" subtitle="Escolha uma nova senha para a sua conta.">
      {done ? (
        <div className="space-y-4">
          <Alert tone="success" className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
            <span>Senha redefinida com sucesso. Você já pode entrar com a nova senha.</span>
          </Alert>
          <Button asChild className="w-full">
            <Link to="/login">Ir para o login</Link>
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
            label="Nova senha"
            name="nova"
            type="password"
            minLength={8}
            value={form.nova}
            onChange={(e) => setForm({ ...form, nova: e.target.value })}
            required
            autoComplete="new-password"
            autoFocus
          />
          <Input
            label="Confirmar nova senha"
            name="confirma"
            type="password"
            minLength={8}
            value={form.confirma}
            onChange={(e) => setForm({ ...form, confirma: e.target.value })}
            required
            autoComplete="new-password"
          />
          <Button type="submit" disabled={busy} className="w-full">
            {busy && <Loader2 className="animate-spin" />}
            Redefinir senha
          </Button>
        </form>
      )}
    </AuthShell>
  )
}
