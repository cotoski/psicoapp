import { useEffect, useState, type FormEvent } from 'react'
import { apiGet, apiPut, ApiError } from '../api/client'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Input } from '../components/ui/Input'

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
}

type CompanyForm = Record<keyof Company, string>

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

  if (loading) return <div className="loading-state">Carregando…</div>

  return (
    <div>
      <h1 className="section-title">Empresa</h1>
      <p className="section-subtitle">
        Dados do prestador exibidos na nota de serviços gerada no Financeiro.
      </p>
      {error && <div className="alert-error">{error}</div>}
      {saved && <div className="alert-success">Dados salvos.</div>}

      <form onSubmit={submit}>
        <Card>
          <h2 className="section-subtitle">Identificação</h2>
          <div className="form-grid">
            <Input
              label="Razão social / Nome do consultório"
              name="name"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              required
            />
            <Input
              label="CNPJ ou CPF"
              name="cnpj"
              value={form.cnpj}
              onChange={(e) => set('cnpj', maskDoc(e.target.value))}
              placeholder="00.000.000/0000-00"
              inputMode="numeric"
              maxLength={18}
            />
            <Input
              label="Inscrição municipal"
              name="inscricaoMunicipal"
              value={form.inscricaoMunicipal}
              onChange={(e) => set('inscricaoMunicipal', e.target.value)}
            />
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
        </Card>

        <Card>
          <h2 className="section-subtitle">Endereço</h2>
          <div className="form-grid">
            <Input
              label="Logradouro"
              name="logradouro"
              value={form.logradouro}
              onChange={(e) => set('logradouro', e.target.value)}
            />
            <Input
              label="Número"
              name="numero"
              value={form.numero}
              onChange={(e) => set('numero', e.target.value)}
            />
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
            />
            <Input
              label="Cidade"
              name="cidade"
              value={form.cidade}
              onChange={(e) => set('cidade', e.target.value)}
            />
            <Input
              label="UF"
              name="uf"
              value={form.uf}
              onChange={(e) => set('uf', e.target.value.toUpperCase().slice(0, 2))}
              maxLength={2}
              placeholder="SP"
            />
            <Input
              label="CEP"
              name="cep"
              value={form.cep}
              onChange={(e) => set('cep', maskCep(e.target.value))}
              placeholder="00000-000"
              inputMode="numeric"
              maxLength={9}
            />
          </div>
          <div className="toolbar" style={{ marginTop: '1rem' }}>
            <div style={{ flex: 1 }} />
            <Button type="submit" disabled={busy}>
              {busy ? 'Salvando…' : 'Salvar'}
            </Button>
          </div>
        </Card>
      </form>
    </div>
  )
}
