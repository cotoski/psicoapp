import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Loader2, MapPin } from 'lucide-react'
import { apiGet, apiPut, ApiError } from '../api/client'
import { Alert } from '../components/ui/Alert'
import { Button } from '../components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { Input } from '../components/ui/Input'
import { Loading } from '../components/ui/LoadingState'
import { PageHeader } from '../components/ui/PageHeader'

interface Company {
  name: string
  cnpj: string | null
  inscricaoMunicipal: string | null
  logradouro: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  cep: string | null
  cidade: string | null
  uf: string | null
  telefone: string | null
  emailContato: string | null
  companyComplete: boolean
}

interface CepResult {
  cep: string
  logradouro: string | null
  complemento: string | null
  bairro: string | null
  cidade: string | null
  uf: string | null
}

type CompanyForm = Record<keyof Omit<Company, 'companyComplete'>, string>

const EMPTY: CompanyForm = {
  name: '',
  cnpj: '',
  inscricaoMunicipal: '',
  logradouro: '',
  numero: '',
  complemento: '',
  bairro: '',
  cep: '',
  cidade: '',
  uf: '',
  telefone: '',
  emailContato: '',
}

// Aceita CNPJ ou CPF e aplica a máscara conforme a quantidade de dígitos.
function maskDoc(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 14)
  if (d.length <= 11) {
    return d
      .replace(/^(\d{3})(\d)/, '$1.$2')
      .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d)/, '.$1-$2')
  }
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2')
}

function maskCep(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 8)
  return d.replace(/^(\d{5})(\d)/, '$1-$2')
}

export function EmpresaPage() {
  const [form, setForm] = useState<CompanyForm>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cepBusy, setCepBusy] = useState(false)
  const [cepError, setCepError] = useState<string | null>(null)
  const lastCep = useRef('')

  useEffect(() => {
    apiGet<Company>('/tenants/me')
      .then((t) => {
        setForm({
          name: t.name ?? '',
          cnpj: t.cnpj ?? '',
          inscricaoMunicipal: t.inscricaoMunicipal ?? '',
          logradouro: t.logradouro ?? '',
          numero: t.numero ?? '',
          complemento: t.complemento ?? '',
          bairro: t.bairro ?? '',
          cep: t.cep ?? '',
          cidade: t.cidade ?? '',
          uf: t.uf ?? '',
          telefone: t.telefone ?? '',
          emailContato: t.emailContato ?? '',
        })
      })
      .catch(() => setError('Não foi possível carregar os dados da empresa.'))
      .finally(() => setLoading(false))
  }, [])

  function set(field: keyof CompanyForm, value: string) {
    setSaved(false)
    setForm((f) => ({ ...f, [field]: value }))
  }

  // Consulta o CEP no backend (proxy ViaCEP) e preenche o endereço.
  // lastCep evita consulta duplicada ao digitar/sair do campo.
  async function lookupCep(raw: string) {
    const digits = raw.replace(/\D/g, '')
    if (digits.length !== 8 || digits === lastCep.current) return
    lastCep.current = digits
    setCepBusy(true)
    setCepError(null)
    try {
      const r = await apiGet<CepResult>(`/tenants/cep/${digits}`)
      setSaved(false)
      setForm((f) => ({
        ...f,
        cep: r.cep ?? f.cep,
        logradouro: r.logradouro ?? f.logradouro,
        bairro: r.bairro ?? f.bairro,
        cidade: r.cidade ?? f.cidade,
        uf: r.uf ?? f.uf,
        complemento: f.complemento || (r.complemento ?? ''),
      }))
    } catch (err) {
      lastCep.current = ''
      setCepError(
        err instanceof ApiError && err.status === 404
          ? 'CEP não encontrado.'
          : 'Não foi possível consultar o CEP. Preencha manualmente.',
      )
    } finally {
      setCepBusy(false)
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await apiPut('/tenants/me', {
        name: form.name,
        cnpj: form.cnpj || null,
        inscricaoMunicipal: form.inscricaoMunicipal || null,
        logradouro: form.logradouro || null,
        numero: form.numero || null,
        complemento: form.complemento || null,
        bairro: form.bairro || null,
        cep: form.cep || null,
        cidade: form.cidade || null,
        uf: form.uf || null,
        telefone: form.telefone || null,
        emailContato: form.emailContato || null,
      })
      setSaved(true)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao salvar.')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <Loading />

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Empresa"
        subtitle="Dados do prestador exibidos na nota de serviços gerada no Financeiro."
      />
      {error && <Alert className="mb-4">{error}</Alert>}
      {saved && <Alert tone="success" className="mb-4">Dados salvos.</Alert>}

      <form onSubmit={submit} className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Identificação</CardTitle>
          </CardHeader>
          <CardContent>
            <Input
              label="Razão social / Nome do consultório"
              name="name"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              required
            />
            <div className="grid gap-x-4 sm:grid-cols-2">
              <Input
                label="CNPJ ou CPF"
                name="cnpj"
                value={form.cnpj}
                onChange={(e) => set('cnpj', maskDoc(e.target.value))}
                placeholder="00.000.000/0000-00"
                inputMode="numeric"
                maxLength={18}
                required
              />
              <Input
                label="Inscrição municipal"
                name="inscricaoMunicipal"
                value={form.inscricaoMunicipal}
                onChange={(e) => set('inscricaoMunicipal', e.target.value)}
              />
            </div>
            <div className="grid gap-x-4 sm:grid-cols-2">
              <Input
                label="Telefone"
                name="telefone"
                value={form.telefone}
                onChange={(e) => set('telefone', e.target.value)}
              />
              <Input
                label="E-mail de contato"
                name="emailContato"
                type="email"
                value={form.emailContato}
                onChange={(e) => set('emailContato', e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Endereço</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-1 flex items-start gap-2 text-xs text-muted-foreground">
              <MapPin className="mt-0.5 size-3.5 shrink-0" />
              Digite o CEP — o endereço é preenchido automaticamente.
            </div>
            <div className="relative">
              <Input
                label="CEP"
                name="cep"
                value={form.cep}
                onChange={(e) => {
                  set('cep', maskCep(e.target.value))
                  void lookupCep(e.target.value)
                }}
                onBlur={(e) => void lookupCep(e.target.value)}
                placeholder="00000-000"
                inputMode="numeric"
                maxLength={9}
                required
                error={cepError ?? undefined}
              />
              {cepBusy && (
                <Loader2 className="pointer-events-none absolute right-3 top-[2.1rem] size-4 animate-spin text-muted-foreground" />
              )}
            </div>
            <div className="grid gap-x-4 sm:grid-cols-[1fr_8rem]">
              <Input
                label="Logradouro"
                name="logradouro"
                value={form.logradouro}
                onChange={(e) => set('logradouro', e.target.value)}
                required
              />
              <Input
                label="Número"
                name="numero"
                value={form.numero}
                onChange={(e) => set('numero', e.target.value)}
              />
            </div>
            <div className="grid gap-x-4 sm:grid-cols-2">
              <Input
                label="Complemento"
                name="complemento"
                value={form.complemento}
                onChange={(e) => set('complemento', e.target.value)}
              />
              <Input
                label="Bairro"
                name="bairro"
                value={form.bairro}
                onChange={(e) => set('bairro', e.target.value)}
                required
              />
            </div>
            <div className="grid gap-x-4 sm:grid-cols-[1fr_6rem]">
              <Input
                label="Cidade"
                name="cidade"
                value={form.cidade}
                onChange={(e) => set('cidade', e.target.value)}
                required
              />
              <Input
                label="UF"
                name="uf"
                value={form.uf}
                onChange={(e) => set('uf', e.target.value.toUpperCase().slice(0, 2))}
                maxLength={2}
                placeholder="SP"
                required
              />
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={busy || cepBusy}>
                {busy ? 'Salvando…' : 'Salvar'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  )
}
