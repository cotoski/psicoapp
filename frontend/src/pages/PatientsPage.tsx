import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronDown, Plus, Search, Users } from 'lucide-react'
import { apiGet } from '../api/client'
import type { Page, Patient } from '../api/types'
import { Alert } from '../components/ui/Alert'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { fieldClass } from '../components/ui/Input'
import { Empty, SkeletonRows } from '../components/ui/LoadingState'
import { PageHeader } from '../components/ui/PageHeader'
import { cn } from '../lib/utils'
import { fmtMoney } from '../utils/format'

type StatusFilter = 'active' | 'archived' | 'all'

function initials(nome: string) {
  return nome
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase()
}

export function PatientsPage() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<StatusFilter>('active')
  const [page, setPage] = useState(1)
  const [result, setResult] = useState<Page<Patient> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams({
      page: String(page),
      limit: '20',
      status,
    })
    if (query.trim()) params.set('query', query.trim())
    const t = setTimeout(() => {
      apiGet<Page<Patient>>(`/patients?${params}`)
        .then(setResult)
        .catch(() => setError('Não foi possível carregar os pacientes.'))
        .finally(() => setLoading(false))
    }, 300) // debounce da busca
    return () => clearTimeout(t)
  }, [query, status, page])

  const totalPages = result ? Math.max(1, Math.ceil(result.total / result.limit)) : 1

  return (
    <div>
      <PageHeader title="Pacientes">
        <Button asChild>
          <Link to="/pacientes/novo">
            <Plus />
            Novo paciente
          </Link>
        </Button>
      </PageHeader>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            placeholder="Buscar por nome…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setPage(1)
            }}
            className={cn(fieldClass, 'h-9 pl-9')}
          />
        </div>
        <div className="relative">
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as StatusFilter)
              setPage(1)
            }}
            className={cn(fieldClass, 'h-9 w-auto appearance-none pr-8')}
          >
            <option value="active">Ativos</option>
            <option value="archived">Arquivados</option>
            <option value="all">Todos</option>
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        </div>
      </div>

      {error && <Alert className="mb-4">{error}</Alert>}
      {loading && <SkeletonRows rows={4} />}

      {!loading && result && result.data.length === 0 && (
        <Empty icon={<Users />}>Nenhum paciente encontrado.</Empty>
      )}

      <div className="space-y-2">
        {!loading &&
          result?.data.map((p) => (
            <div
              key={p.id}
              onClick={() => navigate(`/pacientes/${p.id}`)}
              className="flex cursor-pointer items-center gap-4 rounded-xl border bg-card p-4 transition-all hover:border-accent-foreground/20 hover:shadow-sm"
            >
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
                {initials(p.nome)}
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="truncate text-sm font-medium">{p.nome}</h4>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {p.telefone ?? 'sem telefone'} · {fmtMoney(p.valor)}/sessão
                  {p.diasSemana?.length
                    ? ` · ${p.diasSemana.length}x ${p.frequenciaRecorrencia}`
                    : ''}
                </p>
              </div>
              <Badge tone={p.archivedAt ? 'warning' : 'success'}>
                {p.archivedAt ? 'Arquivado' : 'Ativo'}
              </Badge>
            </div>
          ))}
      </div>

      {result && totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-3 text-sm text-muted-foreground">
          <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            ← Anterior
          </Button>
          <span>
            {page} / {totalPages} ({result.total})
          </span>
          <Button
            variant="secondary"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
          >
            Próxima →
          </Button>
        </div>
      )}
    </div>
  )
}
