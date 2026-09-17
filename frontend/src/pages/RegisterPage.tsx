import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { ApiError } from '../api/client'
import { AuthShell } from '../components/AuthShell'
import { Input } from '../components/ui/Input'
import { Button } from '../components/ui/Button'

export function RegisterPage() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({
    nome: '',
    crp: '',
    tenantName: '',
    email: '',
    senha: '',
    confirmar: '',
  })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function set(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }))
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (form.senha !== form.confirmar) {
      setError('As senhas não conferem.')
      return
    }
    setBusy(true)
    try {
      await register({
        nome: form.nome,
        email: form.email,
        password: form.senha,
        tenantName: form.tenantName,
        ...(form.crp.trim() ? { crp: form.crp.trim() } : {}),
      })
      navigate('/', { replace: true })
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 409
          ? 'Este e-mail já está cadastrado.'
          : 'Não foi possível criar a conta. Tente novamente.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell title="Criar sua conta" subtitle="Cadastre-se para gerenciar seu consultório.">
      <form onSubmit={(e) => void onSubmit(e)}>
        {error && (
          <div className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}
        <Input
          label="Nome completo"
          name="nome"
          value={form.nome}
          onChange={set('nome')}
          required
          autoComplete="name"
          autoFocus
        />
        <Input
          label="CRP (opcional)"
          name="crp"
          value={form.crp}
          onChange={set('crp')}
          placeholder="00/00000"
        />
        <Input
          label="Nome da clínica ou consultório"
          name="tenantName"
          value={form.tenantName}
          onChange={set('tenantName')}
          required
        />
        <Input
          label="E-mail"
          name="email"
          type="email"
          value={form.email}
          onChange={set('email')}
          required
          autoComplete="email"
        />
        <Input
          label="Senha (mín. 8 caracteres)"
          name="senha"
          type="password"
          value={form.senha}
          onChange={set('senha')}
          required
          minLength={8}
          autoComplete="new-password"
        />
        <Input
          label="Confirmar senha"
          name="confirmar"
          type="password"
          value={form.confirmar}
          onChange={set('confirmar')}
          required
          minLength={8}
          autoComplete="new-password"
        />
        <Button type="submit" disabled={busy} className="w-full">
          {busy && <Loader2 className="animate-spin" />}
          {busy ? 'Criando conta…' : 'Criar conta'}
        </Button>
        <div className="mt-4 text-center text-xs text-muted-foreground">
          Já tem conta?{' '}
          <Link
            to="/login"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Entrar
          </Link>
        </div>
      </form>
    </AuthShell>
  )
}
