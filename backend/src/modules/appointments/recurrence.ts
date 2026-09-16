// Port fiel de gerarSessoesRecorrentes (behavior-spec B1).
// Datas tratadas como locais, como no legado. Fuso fixo fica para decisão de produto.
const DIAS: Record<string, number> = {
  domingo: 0,
  segunda: 1,
  terca: 2,
  quarta: 3,
  quinta: 4,
  sexta: 5,
  sabado: 6,
}

export type RecurrenceFreq = 'semanal' | 'quinzenal' | 'mensal'

export function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function todayISO(): string {
  return toISODate(new Date())
}

export function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const nd = new Date(y, m - 1 + months, d)
  return toISODate(nd)
}

export interface OccurrenceOpts {
  diasSemana: string[]
  horario: string // 'HH:MM'
  frequencia: RecurrenceFreq
  inicio: string // 'YYYY-MM-DD' — origem real é max(hoje, inicio)
  fim: string // 'YYYY-MM-DD' inclusive
}

// Retorna Date[] ordenado; cada data às horario:00 local.
export function generateOccurrences(o: OccurrenceOpts): Date[] {
  const [h, m] = (o.horario || '').split(':').map(Number)
  if (isNaN(h) || isNaN(m) || !o.diasSemana?.length) return []

  const hoje = todayISO()
  const start = o.inicio < hoje ? hoje : o.inicio
  if (start > o.fim) return []

  const out: Date[] = []
  for (const dia of o.diasSemana) {
    const target = DIAS[dia.toLowerCase()] ?? -1
    if (target < 0) continue

    let d = new Date(`${start}T00:00:00`)
    const daysToAdd = (target - d.getDay() + 7) % 7
    d.setDate(d.getDate() + daysToAdd)

    while (toISODate(d) < start) {
      d.setDate(d.getDate() + 7)
    }

    while (toISODate(d) <= o.fim) {
      out.push(new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m, 0))
      if (o.frequencia === 'mensal') {
        // primeira ocorrência do mesmo dia-da-semana no mês seguinte
        d = new Date(d.getFullYear(), d.getMonth() + 1, 1)
        const add = (target - d.getDay() + 7) % 7
        d.setDate(d.getDate() + add)
      } else if (o.frequencia === 'quinzenal') {
        d.setDate(d.getDate() + 14)
      } else {
        d.setDate(d.getDate() + 7)
      }
    }
  }
  return out.sort((a, b) => a.getTime() - b.getTime())
}
