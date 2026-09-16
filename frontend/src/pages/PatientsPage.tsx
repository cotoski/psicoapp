import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { apiGet } from '../api/client'
import type { Page, Patient } from '../api/types'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { fmtMoney } from '../utils/format'

type StatusFilter = 'active' | 'archived' | 'all'

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
      <h1 className="section-title">Pacientes</h1>

      <div className="toolbar">
        <input
          type="search"
          placeholder="Buscar por nome…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setPage(1)
          }}
        />
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as StatusFilter)
            setPage(1)
          }}
        >
          <option value="active">Ativos</option>
          <option value="archived">Arquivados</option>
          <option value="all">Todos</option>
        </select>
        <Link to="/pacientes/novo">
          <Button>Novo paciente</Button>
        </Link>
      </div>

      {error && <div className="alert-error">{error}</div>}
      {loading && <div className="loading-state">Carregando…</div>}

      {!loading && result && result.data.length === 0 && (
        <p className="empty-state">Nenhum paciente encontrado.</p>
      )}

      {!loading &&
        result?.data.map((p) => (
          <div
            key={p.id}
            className="patient-row"
            onClick={() => navigate(`/pacientes/${p.id}`)}
          >
            <div className="patient-info">
              <h4>{p.nome}</h4>
              <p>
                {p.telefone ?? 'sem telefone'} · {fmtMoney(p.valor)}/sessão
                {p.diasSemana?.length ? ` · ${p.diasSemana.length}x ${p.frequenciaRecorrencia}` : ''}
              </p>
            </div>
            <Badge tone={p.archivedAt ? 'warning' : 'success'}>
              {p.archivedAt ? 'Arquivado' : 'Ativo'}
            </Badge>
          </div>
        ))}

      {result && totalPages > 1 && (
        <div className="pager">
          <Button variant="secondary" small disabled={page <= 1} onClick={() => setPage(page - 1)}>
            ← Anterior
          </Button>
          <span>
            {page} / {totalPages} ({result.total})
          </span>
          <Button
            variant="secondary"
            small
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
