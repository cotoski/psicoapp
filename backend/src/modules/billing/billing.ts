// Port puro de GET /notas/pendentes (behavior-spec B4).
// Agrupa sessões pendentes do mês por paciente e calcula 'pronto'.

export interface PendingSession {
  id: string
  startsAt: string
  status: string
  valor: number
  faturada: boolean
}

export interface PendingGroup {
  id: string // patientId
  nome: string
  tipoFaturamento: string
  qtdSessoesNota: number
  sessoes: PendingSession[]
  pendente: number
  valorTotal: number
  // pronto = imediato OU pendente >= qtd_sessoes_nota (spec B4)
  pronto: boolean
}

interface FlatRow {
  patientId: string
  nome: string
  tipoFaturamento: string
  qtdSessoesNota: number
  session: PendingSession
}

export function groupPending(rows: FlatRow[]): PendingGroup[] {
  const grouped = new Map<string, PendingGroup>()
  for (const r of rows) {
    let g = grouped.get(r.patientId)
    if (!g) {
      g = {
        id: r.patientId,
        nome: r.nome,
        tipoFaturamento: r.tipoFaturamento,
        qtdSessoesNota: r.qtdSessoesNota,
        sessoes: [],
        pendente: 0,
        valorTotal: 0,
        pronto: false,
      }
      grouped.set(r.patientId, g)
    }
    g.sessoes.push(r.session)
  }
  for (const g of grouped.values()) {
    g.pendente = g.sessoes.length
    g.valorTotal = g.sessoes.reduce((sum, s) => sum + (s.valor || 0), 0)
    g.pronto = g.tipoFaturamento === 'imediato' || g.pendente >= g.qtdSessoesNota
  }
  return [...grouped.values()]
}
