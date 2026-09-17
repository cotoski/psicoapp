import { useRef, useState } from 'react'
import { Camera, Copy, Loader2, ShieldCheck, Trash2 } from 'lucide-react'
import {
  apiDelete,
  apiPatch,
  apiPost,
  apiUpload,
  setAccessToken,
  type AuthUser,
} from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { Alert } from '../components/ui/Alert'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../components/ui/Card'
import { Input } from '../components/ui/Input'
import { Modal } from '../components/ui/Modal'
import { PageHeader } from '../components/ui/PageHeader'

const MAX_AVATAR_BYTES = 2 * 1024 * 1024
const AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp']

const ROLE_LABEL: Record<AuthUser['role'], string> = {
  OWNER: 'Proprietário',
  ADMIN: 'Administrador',
  PSYCHOLOGIST: 'Psicólogo(a)',
  ASSISTANT: 'Assistente',
}

function initials(nome: string | undefined) {
  return (nome ?? '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase()
}

function PhotoCard() {
  const { user, avatarUrl, refreshAvatar } = useAuth()
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function onPick(file: File | undefined) {
    if (!file) return
    setError('')
    if (!AVATAR_TYPES.includes(file.type)) {
      setError('Formato inválido — use JPEG, PNG ou WebP.')
      return
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setError('Imagem muito grande — máximo de 2 MB.')
      return
    }
    setBusy(true)
    try {
      await apiUpload('/auth/me/avatar', file)
      refreshAvatar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao enviar a foto')
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function onRemove() {
    setBusy(true)
    setError('')
    try {
      await apiDelete('/auth/me/avatar')
      refreshAvatar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao remover a foto')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Foto de perfil</CardTitle>
        <CardDescription>JPEG, PNG ou WebP — até 2 MB.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-5">
          <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-full bg-accent text-xl font-semibold text-accent-foreground">
            {avatarUrl ? (
              <img src={avatarUrl} alt="Foto de perfil" className="h-full w-full object-cover" />
            ) : (
              initials(user?.nome)
            )}
          </div>
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={busy}
                onClick={() => fileRef.current?.click()}
              >
                {busy ? <Loader2 className="animate-spin" /> : <Camera />}
                Alterar foto
              </Button>
              {avatarUrl && (
                <Button variant="ghost" size="sm" disabled={busy} onClick={() => void onRemove()}>
                  <Trash2 />
                  Remover
                </Button>
              )}
            </div>
            {error && <Alert tone="danger">{error}</Alert>}
          </div>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept={AVATAR_TYPES.join(',')}
          className="hidden"
          onChange={(e) => void onPick(e.target.files?.[0])}
        />
      </CardContent>
    </Card>
  )
}

function InfoCard() {
  const { user, updateUser } = useAuth()
  const [form, setForm] = useState({
    nome: user?.nome ?? '',
    crp: user?.crp ?? '',
    email: user?.email ?? '',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    setSaved(false)
    try {
      const updated = await apiPatch<AuthUser>('/auth/me', {
        nome: form.nome,
        crp: form.crp || null,
        email: form.email,
      })
      updateUser(updated)
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle>Informações</CardTitle>
          {user && <Badge>{ROLE_LABEL[user.role]}</Badge>}
        </div>
        <CardDescription>Dados usados na sua conta e nos documentos emitidos.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => void onSubmit(e)}>
          <Input
            label="Nome completo"
            name="nome"
            value={form.nome}
            onChange={(e) => setForm({ ...form, nome: e.target.value })}
            required
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="CRP"
              name="crp"
              placeholder="06/12345"
              value={form.crp}
              onChange={(e) => setForm({ ...form, crp: e.target.value })}
            />
            <Input
              label="E-mail"
              name="email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
          </div>
          {error && <Alert tone="danger" className="mb-3">{error}</Alert>}
          {saved && <Alert tone="success" className="mb-3">Informações salvas.</Alert>}
          <Button type="submit" disabled={busy}>
            {busy && <Loader2 className="animate-spin" />}
            Salvar alterações
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

function SecurityCard() {
  const [form, setForm] = useState({ atual: '', nova: '', confirma: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSaved(false)
    if (form.nova !== form.confirma) {
      setError('A confirmação não confere com a nova senha.')
      return
    }
    setBusy(true)
    try {
      const res = await apiPost<{ accessToken: string }>('/auth/change-password', {
        currentPassword: form.atual,
        newPassword: form.nova,
      })
      setAccessToken(res.accessToken)
      setForm({ atual: '', nova: '', confirma: '' })
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao alterar a senha')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Segurança</CardTitle>
        <CardDescription>
          Ao trocar a senha, as outras sessões são encerradas.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => void onSubmit(e)}>
          <Input
            label="Senha atual"
            name="atual"
            type="password"
            autoComplete="current-password"
            value={form.atual}
            onChange={(e) => setForm({ ...form, atual: e.target.value })}
            required
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Nova senha"
              name="nova"
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={form.nova}
              onChange={(e) => setForm({ ...form, nova: e.target.value })}
              required
            />
            <Input
              label="Confirmar nova senha"
              name="confirma"
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={form.confirma}
              onChange={(e) => setForm({ ...form, confirma: e.target.value })}
              required
            />
          </div>
          {error && <Alert tone="danger" className="mb-3">{error}</Alert>}
          {saved && (
            <Alert tone="success" className="mb-3">
              Senha alterada com sucesso.
            </Alert>
          )}
          <Button type="submit" disabled={busy}>
            {busy && <Loader2 className="animate-spin" />}
            Alterar senha
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

interface TotpSetup {
  secret: string
  qrCode: string
}

function TwoFactorCard() {
  const { user, updateUser } = useAuth()
  const enabled = user?.totpEnabled ?? false
  const [setup, setSetup] = useState<TotpSetup | null>(null)
  const [codes, setCodes] = useState<string[] | null>(null)
  const [disabling, setDisabling] = useState(false)
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  async function onStartSetup() {
    setBusy(true)
    setError('')
    try {
      setSetup(await apiPost<TotpSetup>('/auth/2fa/setup'))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao iniciar configuração')
    } finally {
      setBusy(false)
    }
  }

  async function onEnable(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const res = await apiPost<{ backupCodes: string[] }>('/auth/2fa/enable', { code })
      setCodes(res.backupCodes)
      if (user) updateUser({ ...user, totpEnabled: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Código inválido')
    } finally {
      setBusy(false)
    }
  }

  async function onDisable(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await apiPost('/auth/2fa/disable', { password, code })
      if (user) updateUser({ ...user, totpEnabled: false })
      setDisabling(false)
      setPassword('')
      setCode('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao desativar')
    } finally {
      setBusy(false)
    }
  }

  function closeSetup() {
    setSetup(null)
    setCodes(null)
    setCode('')
    setError('')
    setCopied(false)
  }

  async function copyCodes() {
    if (!codes) return
    await navigator.clipboard.writeText(codes.join('\n')).catch(() => undefined)
    setCopied(true)
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle>Verificação em duas etapas</CardTitle>
          <Badge tone={enabled ? 'success' : 'warning'}>
            {enabled ? 'Ativa' : 'Desativada'}
          </Badge>
        </div>
        <CardDescription>
          Um código do app autenticador (Google Authenticator, 1Password…) será exigido a cada
          login.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {enabled ? (
          <Button variant="secondary" onClick={() => setDisabling(true)}>
            Desativar
          </Button>
        ) : (
          <>
            {error && !setup && (
              <Alert tone="danger" className="mb-3">
                {error}
              </Alert>
            )}
            <Button variant="secondary" disabled={busy} onClick={() => void onStartSetup()}>
              {busy ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
              Ativar verificação em duas etapas
            </Button>
          </>
        )}
      </CardContent>

      {/* Setup: QR + chave manual + confirmação por código */}
      <Modal open={setup !== null && codes === null} title="Ativar verificação em duas etapas" onClose={closeSetup}>
        {setup && (
          <form onSubmit={(e) => void onEnable(e)} className="space-y-4">
            <div className="flex flex-col items-center gap-3 rounded-lg border bg-muted/40 p-4">
              <img src={setup.qrCode} alt="QR code para o app autenticador" className="h-44 w-44 rounded-md bg-white p-1" />
              <div className="w-full text-center">
                <div className="text-xs text-muted-foreground">Ou digite a chave manualmente:</div>
                <code className="mt-1 block break-all rounded bg-muted px-2 py-1 text-xs">
                  {setup.secret}
                </code>
              </div>
            </div>
            {error && <Alert tone="danger">{error}</Alert>}
            <Input
              label="Código do app (6 dígitos)"
              name="totp-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={closeSetup}>
                Cancelar
              </Button>
              <Button type="submit" disabled={busy}>
                {busy && <Loader2 className="animate-spin" />}
                Confirmar e ativar
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Códigos de backup — exibidos uma única vez */}
      <Modal open={codes !== null} title="Códigos de recuperação" onClose={closeSetup}>
        {codes && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Guarde estes códigos em um lugar seguro. Cada um pode ser usado <strong>uma
              única vez</strong> se você perder o acesso ao app autenticador. Eles não serão
              exibidos novamente.
            </p>
            <div className="grid grid-cols-2 gap-2 rounded-lg border bg-muted/40 p-4 font-mono text-sm">
              {codes.map((c) => (
                <div key={c} className="rounded bg-card px-2 py-1 text-center">
                  {c}
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => void copyCodes()}>
                <Copy />
                {copied ? 'Copiado!' : 'Copiar códigos'}
              </Button>
              <Button onClick={closeSetup}>Entendi, guardei</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Desativação exige senha + código atual */}
      <Modal
        open={disabling}
        title="Desativar verificação em duas etapas"
        onClose={() => {
          setDisabling(false)
          setPassword('')
          setCode('')
          setError('')
        }}
      >
        <form onSubmit={(e) => void onDisable(e)} className="space-y-4">
          {error && <Alert tone="danger">{error}</Alert>}
          <Input
            label="Senha"
            name="disable-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <Input
            label="Código do app (6 dígitos)"
            name="disable-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="000000"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setDisabling(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="destructive" disabled={busy}>
              {busy && <Loader2 className="animate-spin" />}
              Desativar
            </Button>
          </div>
        </form>
      </Modal>
    </Card>
  )
}

export function ContaPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader title="Minha conta" subtitle="Gerencie seu perfil e a segurança da conta" />
      <PhotoCard />
      <InfoCard />
      <SecurityCard />
      <TwoFactorCard />
    </div>
  )
}
