import './index.css'

type Session = {
  id: number
  patient_id: number
  paciente_nome: string
  data_hora: string
  duracao: number
  status: string
  valor: number
  pago_em: string | null
  notas: string
  faturada?: boolean
  sala_reuniao?: string
}

type Patient = {
  id: number
  nome: string
  cpf?: string
  telefone?: string
  email?: string
  data_nascimento?: string
  anamnese?: string
  valor?: number
  tipo_faturamento?: string
  qtd_sessoes_nota?: number
  dia_semana?: string
  dias_semana?: string[]
  frequencia_recorrencia?: string
  horario?: string
  qtd_repeticoes?: number
  data_reajuste?: string
  meses_ciclo?: number
  sala_reuniao?: string
}

type Dashboard = {
  pacientes: number
  sessoesTotal: number
  sessoesRealizadas: number
  faturamento: number
}

type LoginRes = { token: string; user: { nome: string } }

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) || '/api'

let token = ''
let sessions: Session[] = []
let patients: Patient[] = []
let dashboard: Dashboard | null = null
let editingPatientId: number | null = null
let detailPatientId: number | null = null
let notasPendentes: any[] = []
let activeNotasTab = 'geral'
let detalhadoPatientFilter: number | '' = ''
let agendaYear = new Date().getFullYear()
let agendaMonth = new Date().getMonth()
let agendaSelected: string | null = new Date().toISOString().slice(0, 10)
let agendaView: 'month' | 'week' | 'day' = 'month'

async function api<T = any>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(opts.headers || {}),
    },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`${path} -> ${res.status}: ${text}`)
  }
  return res.json() as Promise<T>
}

function fmtMoney(n: number): string {
  return `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

function monthName(m: number): string {
  return ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][m]
}

function fmtDateBR(iso: string): string {
  const d = new Date(iso)
  return `${d.getDate().toString().padStart(2, '0')}/${monthName(d.getMonth())}`
}

function fmtDateReajuste(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('pt-BR')
}

function fmtTime(iso: string): string {
  const d = new Date(iso)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

function fmtTimeRange(iso: string, duracao = 50): string {
  const start = new Date(iso)
  const end = new Date(start.getTime() + duracao * 60000)
  const sh = start.getHours().toString().padStart(2, '0')
  const sm = start.getMinutes().toString().padStart(2, '0')
  const eh = end.getHours().toString().padStart(2, '0')
  const em = end.getMinutes().toString().padStart(2, '0')
  return `${sh}:${sm} - ${eh}:${em}`
}

function toLocalInput(d: string | Date): string {
  const date = new Date(d)
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const h = String(date.getHours()).padStart(2, '0')
  const min = String(date.getMinutes()).padStart(2, '0')
  return `${y}-${m}-${day}T${h}:${min}`
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function setText(id: string, text: string) {
  const el = document.getElementById(id)
  if (el) el.textContent = text
}

function setHtml(id: string, html: string) {
  const el = document.getElementById(id)
  if (el) el.innerHTML = html
}

function isMonth(d: Date, year: number, month: number): boolean {
  return d.getFullYear() === year && d.getMonth() === month
}

function isFutureOrToday(s: Session): boolean {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const d = new Date(s.data_hora)
  return d >= today
}

function sessionCard(s: Session, showDay = false): string {
  const d = new Date(s.data_hora)
  const dayLabel = showDay ? `${fmtDateBR(s.data_hora)} · ` : ''
  const today = new Date()
  const isToday = sameDay(d, today)
  const dayText = isToday ? 'Hoje · ' : dayLabel
  const status = s.status.toLowerCase()
  let badgeClass = 'badge-accent'
  let badgeText = s.status
  if (['realizada', 'confirmada'].includes(status)) {
    badgeClass = 'badge-success'
    badgeText = 'Confirmada'
  } else if (['agendada', 'pendente'].includes(status)) {
    badgeClass = 'badge-warning'
    badgeText = 'Pendente'
  } else if (['cancelada', 'faltou'].includes(status)) {
    badgeClass = 'badge-danger'
    badgeText = 'Cancelada'
  }
  return `
    <div class="session-card" data-id="${s.id}">
      <div class="session-time">${dayText}${fmtTimeRange(s.data_hora, s.duracao)}</div>
      <div class="session-patient">${s.paciente_nome}</div>
      <span class="badge ${badgeClass}">${badgeText}</span>
    </div>
  `
}

function renderDashboard() {
  if (!dashboard) return
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()
  const monthSessions = sessions.filter(s => isMonth(new Date(s.data_hora), year, month))
  const realizedMonth = monthSessions.filter(s => s.status === 'realizada')
  const faturamento = realizedMonth.reduce((sum, s) => sum + s.valor, 0)
  const recebido = monthSessions.filter(s => s.pago_em).reduce((sum, s) => sum + s.valor, 0)
  const pendingCount = realizedMonth.filter(s => !s.pago_em).length

  setText('dash-metric-0', String(monthSessions.length))
  setText('dash-metric-1', fmtMoney(faturamento))
  setText('dash-metric-2', String(pendingCount))
  const presenca = dashboard.sessoesTotal ? Math.round((dashboard.sessoesRealizadas / dashboard.sessoesTotal) * 100) : 0
  setText('dash-metric-3', `${presenca}%`)

  const upcoming = sessions
    .filter(s => ['agendada', 'confirmada', 'realizada'].includes(s.status))
    .filter(isFutureOrToday)
    .sort((a, b) => new Date(a.data_hora).getTime() - new Date(b.data_hora).getTime())
    .slice(0, 3)

  if (upcoming.length === 0) {
    setHtml('dashboard-sessions-list', '<h3 style="margin-bottom: 1rem; font-size: 15px; font-weight: 500;">📅 Próximas sessões</h3><div class="empty-state">Nenhuma sessão futura encontrada.</div>')
  } else {
    setHtml('dashboard-sessions-list', '<h3 style="margin-bottom: 1rem; font-size: 15px; font-weight: 500;">📅 Próximas sessões</h3>' + upcoming.map(s => sessionCard(s, true)).join(''))
  }
}

function renderPatients() {
  const container = document.getElementById('patients-list')
  if (!container) return

  const select = document.getElementById('patient-select') as HTMLSelectElement | null
  if (select) {
    select.innerHTML = patients.map(p => `<option value="${p.id}">${p.nome}</option>`).join('')
  }

  const build = (list: Patient[]) => {
    if (list.length === 0) {
      container.innerHTML = '<div class="empty-state">Nenhum paciente encontrado.</div>'
      return
    }
    container.innerHTML = list
  .map(p => {
      const pSess = sessions.filter(s => s.patient_id === p.id)
      const last = pSess
        .filter(s => new Date(s.data_hora) <= new Date())
        .sort((a, b) => new Date(b.data_hora).getTime() - new Date(a.data_hora).getTime())[0]
      const total = pSess.length
      const lastText = last ? fmtDateBR(last.data_hora) : '-'
      const totalValor = pSess.filter(s => s.pago_em).reduce((sum, s) => sum + s.valor, 0)
      const pendingValor = pSess.filter(s => s.status === 'realizada' && !s.pago_em).reduce((sum, s) => sum + s.valor, 0)
      const rightText = pendingValor > 0 ? `${fmtMoney(pendingValor)} pendente` : fmtMoney(totalValor)
      const rightColor = pendingValor > 0 ? 'color: var(--text-danger);' : 'color: var(--text-secondary);'
      const reajusteText = p.data_reajuste ? `Reajuste: ${fmtDateReajuste(p.data_reajuste)}` : 'Sem reajuste'
      return `
        <div class="patient-row" data-id="${p.id}">
          <div class="patient-info">
            <h4>${p.nome}</h4>
            <p>Sessões: ${total} | Última: ${lastText} | ${reajusteText}</p>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 12px; ${rightColor} margin-bottom: 4px;">${rightText}</div>
            <div style="display: flex; gap: 6px; justify-content: flex-end;">
              <button class="btn btn-secondary btn-small edit-patient" data-id="${p.id}">Editar</button>
              <button class="btn btn-small delete-patient" data-id="${p.id}" style="background: var(--bg-danger); color: var(--text-danger); border: 0.5px solid var(--border);">Excluir</button>
            </div>
          </div>
        </div>
      `
    }).join('')
  }

  const search = document.getElementById('patient-search') as HTMLInputElement | null
  const term = search?.value.toLowerCase() || ''
  build(term ? patients.filter(p => p.nome.toLowerCase().includes(term)) : patients)

  search?.addEventListener('input', () => {
    const t = search.value.toLowerCase()
    build(t ? patients.filter(p => p.nome.toLowerCase().includes(t)) : patients)
  })
}

function agendaStatusStyle(status: string) {
  const s = status.toLowerCase()
  if (s === 'realizada') return { color: 'var(--text-success)', bg: 'var(--bg-success)', border: 'var(--text-success)', label: 'Realizada' }
  if (['agendada', 'confirmada', 'remarcada', 'faltou'].includes(s)) return { color: 'var(--text-warning)', bg: 'var(--bg-warning)', border: 'var(--text-warning)', label: 'Pendente' }
  return { color: 'var(--text-muted)', bg: 'var(--surface-0)', border: 'var(--border)', label: 'Cancelada' }
}

function firstName(name: string) {
  return name.split(' ')[0]
}

function daySessions(iso: string) {
  const d = new Date(iso + 'T00:00:00')
  return sessions
    .filter(s => sameDay(new Date(s.data_hora), d))
    .sort((a, b) => new Date(a.data_hora).getTime() - new Date(b.data_hora).getTime())
}

function fmtHour(iso: string) {
  const d = new Date(iso)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

function setAgendaTitle(text: string) {
  document.querySelectorAll('#agenda-title').forEach(el => {
    el.textContent = text
  })
}

function setViewContainers(view: 'month' | 'week' | 'day') {
  const month = document.getElementById('view-month')
  const week = document.getElementById('view-week')
  const day = document.getElementById('view-day')
  if (month) month.style.display = view === 'month' ? 'block' : 'none'
  if (week) week.style.display = view === 'week' ? 'block' : 'none'
  if (day) day.style.display = view === 'day' ? 'block' : 'none'

  document.querySelectorAll('.btn[data-view]').forEach(btn => {
    btn.classList.remove('active')
    if (btn.getAttribute('data-view') === view) btn.classList.add('active')
  })
}

function buildMonth() {
  const grid = document.getElementById('month-grid')
  if (!grid) return
  grid.innerHTML = ''

  const mName = monthName(agendaMonth)
  setAgendaTitle(`${mName.charAt(0).toUpperCase() + mName.slice(1)} ${agendaYear}`)

  const firstOfMonth = new Date(agendaYear, agendaMonth, 1)
  const start = new Date(firstOfMonth)
  start.setDate(firstOfMonth.getDate() - firstOfMonth.getDay())
  const current = new Date(start)

  for (let i = 0; i < 42; i++) {
    const y = current.getFullYear()
    const m = current.getMonth()
    const date = current.getDate()
    const iso = `${y}-${String(m + 1).padStart(2, '0')}-${String(date).padStart(2, '0')}`
    const inMonth = m === agendaMonth
    const isSelected = agendaSelected === iso

    const cell = document.createElement('div')
    cell.className = 'agenda-day'
    cell.setAttribute('data-date', iso)
    cell.style.cssText = `border:0.5px solid var(--border);border-radius:6px;min-height:72px;padding:4px;font-size:11px;cursor:pointer;background:${isSelected ? 'var(--bg-accent)' : 'var(--surface-1)'};color:${isSelected ? 'var(--text-accent)' : inMonth ? 'var(--text-primary)' : 'var(--text-muted)'};border-color:${isSelected ? 'var(--border-accent)' : 'var(--border)'};`

    const list = daySessions(iso)
    let html = `<div style="font-weight:500;margin-bottom:2px">${date}</div>`
    list.slice(0, 2).forEach(s => {
      const st = agendaStatusStyle(s.status)
      html += `<div class="agenda-session-card" data-id="${s.id}" style="background:${st.bg};color:${st.color};border-radius:3px;padding:1px 3px;margin-bottom:2px;font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${fmtHour(s.data_hora)} ${firstName(s.paciente_nome)}</div>`
    })
    if (list.length > 2) html += `<div style="font-size:10px;color:var(--text-muted)">+${list.length - 2}</div>`

    cell.innerHTML = html
    grid.appendChild(cell)
    current.setDate(current.getDate() + 1)
  }
}

function buildWeek() {
  const grid = document.getElementById('week-grid')
  if (!grid || !agendaSelected) return
  grid.innerHTML = ''

  const selected = new Date(agendaSelected + 'T00:00:00')
  const start = new Date(selected)
  start.setDate(selected.getDate() - selected.getDay())
  const end = new Date(start)
  end.setDate(start.getDate() + 6)

  setAgendaTitle(`${start.getDate().toString().padStart(2, '0')} ${monthName(start.getMonth())} – ${end.getDate().toString().padStart(2, '0')} ${monthName(end.getMonth())}`)

  const days: { iso: string; label: string; date: number }[] = []
  const dayLabels = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
  grid.appendChild(document.createElement('div'))
  for (let i = 0; i < 7; i++) {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const h = document.createElement('div')
    h.style.cssText = 'text-align:center;font-size:11px;color:var(--text-secondary);padding:4px;border-bottom:0.5px solid var(--border)'
    h.innerHTML = `${d.getDate()}<div style="font-size:10px;color:var(--text-muted)">${dayLabels[d.getDay()]}</div>`
    grid.appendChild(h)
    days.push({ iso, label: dayLabels[d.getDay()], date: d.getDate() })
  }

  const hours = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]
  hours.forEach(hr => {
    const label = document.createElement('div')
    label.style.cssText = 'font-size:10px;color:var(--text-muted);padding:8px 4px 0 0;text-align:right'
    label.textContent = `${hr}:00`
    grid.appendChild(label)

    days.forEach(dd => {
      const cell = document.createElement('div')
      cell.style.cssText = 'border-top:0.5px solid var(--border);min-height:40px;position:relative;padding:1px'
      const list = daySessions(dd.iso)
      const match = list.find(s => new Date(s.data_hora).getHours() === hr)
      if (match) {
        const st = agendaStatusStyle(match.status)
        cell.innerHTML = `<div class="agenda-session-card" data-id="${match.id}" style="background:${st.bg};color:${st.color};border-radius:4px;padding:2px 4px;font-size:10px;line-height:1.3;cursor:pointer" title="${match.paciente_nome}">${fmtHour(match.data_hora)}<br>${firstName(match.paciente_nome)}</div>`
      }
      grid.appendChild(cell)
    })
  })
}

function buildDay() {
  const grid = document.getElementById('day-grid')
  if (!grid || !agendaSelected) return
  grid.innerHTML = ''

  const d = new Date(agendaSelected + 'T00:00:00')
  const dayName = d.toLocaleDateString('pt-BR', { weekday: 'long' })
  setAgendaTitle(`${dayName.charAt(0).toUpperCase() + dayName.slice(1)}, ${d.getDate().toString().padStart(2, '0')} ${monthName(d.getMonth())} ${d.getFullYear()}`)

  const hours = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]
  const list = daySessions(agendaSelected)

  hours.forEach(hr => {
    const label = document.createElement('div')
    label.style.cssText = 'font-size:11px;color:var(--text-muted);padding:10px 8px 0 0;text-align:right'
    label.textContent = `${hr}:00`
    grid.appendChild(label)

    const cell = document.createElement('div')
    cell.style.cssText = 'border-top:0.5px solid var(--border);min-height:48px;padding:4px'
    const match = list.find(s => new Date(s.data_hora).getHours() === hr)
    if (match) {
      const st = agendaStatusStyle(match.status)
      cell.innerHTML = `
        <div class="agenda-session-card" data-id="${match.id}" style="background:${st.bg};border-left:3px solid ${st.border};border-radius:0 6px 6px 0;padding:6px 10px;cursor:pointer">
          <div style="font-size:13px;font-weight:500;color:var(--text-primary)">${match.paciente_nome}</div>
          <div style="font-size:11px;color:${st.color}">${fmtHour(match.data_hora)} · ${st.label} · ${match.duracao}min</div>
        </div>`
    }
    grid.appendChild(cell)
  })
}

function renderAgenda() {
  renderAgendaView()
}

function renderAgendaView() {
  setViewContainers(agendaView)
  if (agendaView === 'month') buildMonth()
  else if (agendaView === 'week') buildWeek()
  else buildDay()
}

function setupAgendaView() {
  document.getElementById('agenda-prev')?.addEventListener('click', () => {
    if (agendaView === 'month') {
      agendaMonth--
      if (agendaMonth < 0) { agendaMonth = 11; agendaYear-- }
    } else if (agendaView === 'week' && agendaSelected) {
      const d = new Date(agendaSelected + 'T00:00:00')
      d.setDate(d.getDate() - 7)
      agendaSelected = d.toISOString().slice(0, 10)
      agendaYear = d.getFullYear()
      agendaMonth = d.getMonth()
    } else if (agendaView === 'day' && agendaSelected) {
      const d = new Date(agendaSelected + 'T00:00:00')
      d.setDate(d.getDate() - 1)
      agendaSelected = d.toISOString().slice(0, 10)
      agendaYear = d.getFullYear()
      agendaMonth = d.getMonth()
    }
    renderAgendaView()
  })

  document.getElementById('agenda-next')?.addEventListener('click', () => {
    if (agendaView === 'month') {
      agendaMonth++
      if (agendaMonth > 11) { agendaMonth = 0; agendaYear++ }
    } else if (agendaView === 'week' && agendaSelected) {
      const d = new Date(agendaSelected + 'T00:00:00')
      d.setDate(d.getDate() + 7)
      agendaSelected = d.toISOString().slice(0, 10)
      agendaYear = d.getFullYear()
      agendaMonth = d.getMonth()
    } else if (agendaView === 'day' && agendaSelected) {
      const d = new Date(agendaSelected + 'T00:00:00')
      d.setDate(d.getDate() + 1)
      agendaSelected = d.toISOString().slice(0, 10)
      agendaYear = d.getFullYear()
      agendaMonth = d.getMonth()
    }
    renderAgendaView()
  })

  document.querySelectorAll('#agenda-view-month, #agenda-view-week, #agenda-view-day').forEach(btn => {
    btn.addEventListener('click', () => {
      const v = btn.getAttribute('data-view')
      if (v === 'month' || v === 'week' || v === 'day') {
        agendaView = v
        renderAgendaView()
      }
    })
  })

  document.getElementById('agenda')?.addEventListener('click', (e) => {
    const target = e.target as HTMLElement
    const card = target.closest('.agenda-session-card') as HTMLElement | null
    if (card) {
      e.stopPropagation()
      const id = Number(card.getAttribute('data-id'))
      if (id) openSessionOptions(id)
      return
    }
    const day = target.closest('.agenda-day') as HTMLElement | null
    if (day) {
      const date = day.getAttribute('data-date')
      if (date) {
        agendaSelected = date
        agendaView = 'day'
        renderAgendaView()
      }
    }
  })
}

function getFinancePeriod(): { start: string; end: string; label: string } {
  const startInput = document.getElementById('finance-start') as HTMLInputElement | null
  const endInput = document.getElementById('finance-end') as HTMLInputElement | null
  const monthInput = document.getElementById('finance-month') as HTMLInputElement | null
  if (startInput?.value && endInput?.value) {
    return { start: startInput.value, end: endInput.value, label: `${fmtDateBR(`${startInput.value}T00:00:00`)} - ${fmtDateBR(`${endInput.value}T00:00:00`)}` }
  }
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth() + 1
  const firstDay = new Date(y, now.getMonth(), 1)
  const lastDay = new Date(y, m, 0)
  const start = `${y}-${String(m).padStart(2, '0')}-${String(firstDay.getDate()).padStart(2, '0')}`
  const end = `${y}-${String(m).padStart(2, '0')}-${String(lastDay.getDate()).padStart(2, '0')}`
  return { start, end, label: `${monthName(now.getMonth())} ${y}` }
}

function renderFinanceiro() {
  const { start, end, label } = getFinancePeriod()
  const startDate = new Date(`${start}T00:00:00`)
  const endDate = new Date(`${end}T23:59:59`)
  const patientFilter = (document.getElementById('finance-patient') as HTMLSelectElement | null)?.value || ''
  const monthSessions = sessions
    .filter(s => {
      const d = new Date(s.data_hora)
      const inPeriod = d.getTime() >= startDate.getTime() && d.getTime() <= endDate.getTime()
      const byPatient = patientFilter ? s.patient_id === Number(patientFilter) : true
      return inPeriod && byPatient
    })
    .sort((a, b) => new Date(b.data_hora).getTime() - new Date(a.data_hora).getTime())

  const aReceber = monthSessions.filter(s => s.status !== 'cancelada').reduce((sum, s) => sum + s.valor, 0)
  const recebido = monthSessions.filter(s => s.pago_em).reduce((sum, s) => sum + s.valor, 0)
  const pendente = aReceber - recebido

  setText('finance-metric-0', fmtMoney(aReceber))
  setText('finance-metric-1', fmtMoney(recebido))
  setText('finance-metric-2', fmtMoney(pendente))

  const labelEl = document.getElementById('finance-label-0')
  if (labelEl) labelEl.textContent = `A receber (${label})`

  const tbody = document.getElementById('financeiro-tbody')
  if (tbody) {
    if (monthSessions.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" class="empty-state">Sem sessões neste período.</td></tr>'
    } else {
      tbody.innerHTML = monthSessions.map(s => {
        const isRealizada = s.status === 'realizada'
        const isPaid = Boolean(s.pago_em)
        const statusClass = isPaid ? 'status-paid' : 'status-pending'
        const statusText = isPaid ? 'Pago' : (isRealizada ? 'Pendente' : s.status)
        return `
          <tr>
            <td>${fmtDateBR(s.data_hora)}</td>
            <td>${s.paciente_nome}</td>
            <td style="text-align: right;">${fmtMoney(s.valor)}</td>
            <td style="text-align: center;"><span class="${statusClass}">${statusText}</span></td>
          </tr>
        `
      }).join('')
    }
  }
}

function setupFinanceiro() {
  const monthInput = document.getElementById('finance-month') as HTMLInputElement | null
  const startInput = document.getElementById('finance-start') as HTMLInputElement | null
  const endInput = document.getElementById('finance-end') as HTMLInputElement | null
  const patientSelect = document.getElementById('finance-patient') as HTMLSelectElement | null
  const search = document.getElementById('finance-search')
  const today = document.getElementById('finance-today')

  function setMonthDates() {
    if (!monthInput?.value || !startInput || !endInput) return
    const [y, m] = monthInput.value.split('-').map(Number)
    const first = new Date(y, m - 1, 1)
    const last = new Date(y, m, 0)
    startInput.value = `${y}-${String(m).padStart(2, '0')}-${String(first.getDate()).padStart(2, '0')}`
    endInput.value = `${y}-${String(m).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`
  }

  function setCurrentMonth() {
    if (!monthInput || !startInput || !endInput) return
    const now = new Date()
    const y = now.getFullYear()
    const m = now.getMonth() + 1
    monthInput.value = `${y}-${String(m).padStart(2, '0')}`
    setMonthDates()
  }

  monthInput?.addEventListener('change', () => {
    setMonthDates()
    renderFinanceiro()
  })

  search?.addEventListener('click', () => {
    renderFinanceiro()
  })

  today?.addEventListener('click', () => {
    setCurrentMonth()
    renderFinanceiro()
  })

  if (patientSelect) {
    patientSelect.onchange = () => renderFinanceiro()
    const current = patientSelect.value
    patientSelect.innerHTML = '<option value="">Todos</option>'
    patients.forEach(p => {
      const o = document.createElement('option')
      o.value = String(p.id)
      o.textContent = p.nome
      patientSelect.appendChild(o)
    })
    patientSelect.value = patients.some(p => String(p.id) === current) ? current : ''
  }

  setCurrentMonth()
}

const TAX_ISS_RATES: Record<string, number> = { sp: 0.02, rj: 0.03, mg: 0.025, ba: 0.05 }

function calcularImpostos(valor: number, municipio: string) {
  const iss = TAX_ISS_RATES[municipio] || 0.02
  return {
    pf: { iss: valor * iss, irpf: valor * 0.15, inss: valor * 0.10, total: valor * (iss + 0.15 + 0.10) },
    simples: { iss: valor * iss, das: valor * 0.07, total: valor * (iss + 0.07) },
    presumido: { iss: valor * iss, irpj: valor * 0.072, piscofins: valor * 0.0965, inss: valor * 0.15, total: valor * (iss + 0.072 + 0.0965 + 0.15) },
  }
}

function renderTax() {
  const valorInput = document.getElementById('tax-valor') as HTMLInputElement | null
  const municipioInput = document.getElementById('tax-municipio') as HTMLSelectElement | null
  const valor = parseFloat(valorInput?.value || '0') || 0
  const municipio = municipioInput?.value || 'sp'
  const active = document.querySelector('.tax-regime.active') as HTMLElement | null
  const regime = (active?.dataset.regime as 'pf' | 'simples' | 'presumido') || 'pf'
  const impostos = calcularImpostos(valor, municipio)
  const resultado = impostos[regime]
  const liquido = valor - resultado.total
  const taxa = valor > 0 ? ((resultado.total / valor) * 100).toFixed(1) : '0.0'

  const result = document.getElementById('tax-result')
  if (result) {
    result.innerHTML = `
      <div class="metric-card" style="margin-bottom: 0.5rem;">
        <div class="metric-label">Valor bruto</div>
        <div class="metric-value">${fmtMoney(valor)}</div>
      </div>
      <div class="metric-card" style="margin-bottom: 0.5rem;">
        <div class="metric-label">Total impostos (${taxa}%)</div>
        <div class="metric-value" style="color: var(--text-danger);">- ${fmtMoney(resultado.total)}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Valor líquido</div>
        <div class="metric-value" style="color: var(--text-success);">${fmtMoney(liquido)}</div>
      </div>
    `
  }

  const breakdown = document.getElementById('tax-breakdown')
  if (breakdown) {
    let html = ''
    if (regime === 'pf') {
      html = `
        <div class="metric-card"><div class="metric-label">ISS</div><div class="metric-value">- ${fmtMoney(resultado.iss)}</div></div>
        <div class="metric-card"><div class="metric-label">Carnê-Leão</div><div class="metric-value">- ${fmtMoney(resultado.irpf)}</div></div>
        <div class="metric-card"><div class="metric-label">INSS</div><div class="metric-value">- ${fmtMoney(resultado.inss)}</div></div>
      `
    } else if (regime === 'simples') {
      html = `
        <div class="metric-card"><div class="metric-label">DAS Simples</div><div class="metric-value">- ${fmtMoney(resultado.das)}</div></div>
        <div class="metric-card"><div class="metric-label">ISS</div><div class="metric-value">- ${fmtMoney(resultado.iss)}</div></div>
      `
    } else {
      html = `
        <div class="metric-card"><div class="metric-label">ISS</div><div class="metric-value">- ${fmtMoney(resultado.iss)}</div></div>
        <div class="metric-card"><div class="metric-label">IRPJ + CSLL</div><div class="metric-value">- ${fmtMoney(resultado.irpj)}</div></div>
        <div class="metric-card"><div class="metric-label">PIS + COFINS</div><div class="metric-value">- ${fmtMoney(resultado.piscofins)}</div></div>
      `
    }
    breakdown.innerHTML = html
  }

  const update = (id: string, r: { total: number }) => {
    const tax = valor > 0 ? ((r.total / valor) * 100).toFixed(1) : '0.0'
    const el = document.getElementById(id)
    if (el) el.textContent = tax + '%'
    const liquidoEl = document.getElementById(id.replace('-tax', '-liquido'))
    if (liquidoEl) liquidoEl.textContent = fmtMoney(valor - r.total)
  }

  update('tax-pf-tax', impostos.pf)
  update('tax-simples-tax', impostos.simples)
  update('tax-presumido-tax', impostos.presumido)
}

function setupTaxCalculator() {
  document.querySelectorAll('.tax-regime').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tax-regime').forEach(b => {
        b.classList.remove('active')
        ;(b as HTMLElement).style.background = ''
        ;(b as HTMLElement).style.color = ''
        ;(b as HTMLElement).style.borderColor = ''
      })
      btn.classList.add('active')
      const el = btn as HTMLElement
      el.style.background = 'var(--bg-accent)'
      el.style.color = 'var(--text-accent)'
      el.style.borderColor = 'var(--border-accent)'
      renderTax()
    })
  })

  const valor = document.getElementById('tax-valor')
  const municipio = document.getElementById('tax-municipio')
  valor?.addEventListener('input', renderTax)
  municipio?.addEventListener('change', renderTax)

  renderTax()
}

const LIMIAR_FATOR_R = 0.28
const ALIQUOTA_ANEXO_III_FAIXA1 = 0.06
const ALIQUOTA_ANEXO_V_FAIXA1 = 0.155

type FatorRInput = { faturamentoAnual: number; folhaPagamentoAnual: number }
type FatorRResult = { fatorR: number; anexo: 'III' | 'V'; aliquotaEfetivaEstimada: number; atingiuLimiar: boolean }
type SimulacaoAjuste = { prolaboreAnualNecessario: number; prolaboreAdicionalNecessario: number; economiaAnualEstimada: number }

function calcularFatorR(input: FatorRInput): FatorRResult {
  if (input.faturamentoAnual <= 0) {
    throw new Error('Faturamento anual deve ser maior que zero')
  }
  const fatorR = input.folhaPagamentoAnual / input.faturamentoAnual
  const atingiuLimiar = fatorR >= LIMIAR_FATOR_R
  const anexo = atingiuLimiar ? 'III' : 'V'
  const aliquotaEfetivaEstimada = atingiuLimiar ? ALIQUOTA_ANEXO_III_FAIXA1 : ALIQUOTA_ANEXO_V_FAIXA1
  return { fatorR, anexo, aliquotaEfetivaEstimada, atingiuLimiar }
}

function simularAjusteParaAnexoIII(faturamentoAnual: number, folhaPagamentoAtual: number): SimulacaoAjuste {
  const prolaboreAnualNecessario = Math.ceil(faturamentoAnual * LIMIAR_FATOR_R)
  const prolaboreAdicionalNecessario = Math.max(0, prolaboreAnualNecessario - folhaPagamentoAtual)
  const impostoAnexoV = faturamentoAnual * ALIQUOTA_ANEXO_V_FAIXA1
  const impostoAnexoIII = faturamentoAnual * ALIQUOTA_ANEXO_III_FAIXA1
  const economiaAnualEstimada = Math.max(0, impostoAnexoV - impostoAnexoIII)
  return { prolaboreAnualNecessario, prolaboreAdicionalNecessario, economiaAnualEstimada }
}

function renderFatorR() {
  const faturamentoInput = document.getElementById('faturamento-anual') as HTMLInputElement | null
  const folhaInput = document.getElementById('folha-anual') as HTMLInputElement | null
  const faturamento = parseFloat(faturamentoInput?.value || '0') || 0
  const folha = parseFloat(folhaInput?.value || '0') || 0

  const result = document.getElementById('fator-r-result')
  const simulacao = document.getElementById('fator-r-simulacao')
  if (!result) return

  if (faturamento <= 0) {
    result.innerHTML = '<div class="metric-card" style="background: var(--bg-warning);"><div class="metric-value" style="color: var(--text-warning); font-size: 14px;">Informe o faturamento anual.</div></div>'
    if (simulacao) simulacao.innerHTML = ''
    return
  }

  let res: FatorRResult
  try {
    res = calcularFatorR({ faturamentoAnual: faturamento, folhaPagamentoAnual: folha })
  } catch (e: any) {
    result.innerHTML = `<div class="metric-card" style="background: var(--bg-warning);"><div class="metric-value" style="color: var(--text-warning); font-size: 14px;">${e.message}</div></div>`
    if (simulacao) simulacao.innerHTML = ''
    return
  }

  const pct = (res.fatorR * 100).toFixed(1)
  const proximo = res.fatorR >= 0.25 && res.fatorR < LIMIAR_FATOR_R
  const status = res.atingiuLimiar ? 'success' : 'warning'
  const icon = res.atingiuLimiar ? '✅' : '⚠️'
  const msg = res.atingiuLimiar
    ? 'Fator R atingiu o limiar de 28%'
    : (proximo ? 'Muito perto do limiar — pequeno ajuste resolve' : 'Abaixo do limiar de 28%')

  result.innerHTML = `
    <div class="metric-card" style="background: var(--bg-${status});">
      <div class="metric-label">${icon} Fator R</div>
      <div class="metric-value" style="color: var(--text-${status});">${pct}%</div>
      <div style="font-size: 13px; color: var(--text-secondary); margin-top: 4px;">Anexo ${res.anexo} — alíquota estimada ~${(res.aliquotaEfetivaEstimada * 100).toFixed(1)}%</div>
      <div style="font-size: 12px; color: var(--text-${status}); margin-top: 4px;">${msg}</div>
    </div>
  `

  if (simulacao) {
    if (res.atingiuLimiar) {
      simulacao.innerHTML = ''
    } else {
      const ajuste = simularAjusteParaAnexoIII(faturamento, folha)
      simulacao.innerHTML = `
        <div class="info-box" style="font-size: 13px; background: var(--bg-accent); border-left: 4px solid var(--fill-accent); padding: 12px; border-radius: var(--radius);">
          <strong>💡 Para cair no Anexo III (mais barato):</strong><br>
          Aumente folha/pró-labore anual para <strong>${fmtMoney(ajuste.prolaboreAnualNecessario)}</strong><br>
          (adicional de <strong>${fmtMoney(ajuste.prolaboreAdicionalNecessario)}</strong>/ano, ou ~${fmtMoney(ajuste.prolaboreAdicionalNecessario / 12)}/mês)<br>
          Economia estimada: <strong>${fmtMoney(ajuste.economiaAnualEstimada)}/ano</strong>
        </div>
      `
    }
  }
}

function setupFatorR() {
  const faturamento = document.getElementById('faturamento-anual')
  const folha = document.getElementById('folha-anual')
  faturamento?.addEventListener('input', renderFatorR)
  folha?.addEventListener('input', renderFatorR)
  renderFatorR()
}

function navigateTo(page: string) {
  document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'))
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'))
  const nav = document.querySelector(`.nav-item[data-page="${page}"]`)
  nav?.classList.add('active')
  const p = document.getElementById(page)
  p?.classList.add('active')

  const isLogin = page === 'login'
  const sidebar = document.querySelector('.sidebar') as HTMLElement | null
  const header = document.querySelector('.header') as HTMLElement | null
  const content = document.querySelector('.content') as HTMLElement | null
  if (sidebar) sidebar.style.display = isLogin ? 'none' : ''
  if (header) header.style.display = isLogin ? 'none' : ''
  if (content) content.style.padding = isLogin ? '0' : ''

  const pageTitle: Record<string, string> = {
    login: 'Login',
    dashboard: 'Dashboard',
    agenda: 'Meu calendário',
    sessao: 'Registrar nova sessão',
    pacientes: 'Meus pacientes',
    financeiro: 'Controle Financeiro',
    notas: 'Geração de nota',
    laudos: 'Geração de Laudos',
    config: 'Configurações',
  }
  setText('page-title', pageTitle[page] || page)
}

function setupNavigation() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      const page = item.getAttribute('data-page')
      if (page) navigateTo(page)
    })
  })
}

function setupSessaoForm() {
  const dt = document.getElementById('session-datetime') as HTMLInputElement | null
  if (dt) dt.value = toLocalInput(new Date())

  const updateSessionValor = () => {
    const select = document.getElementById('patient-select') as HTMLSelectElement | null
    const input = document.getElementById('session-valor') as HTMLInputElement | null
    const p = patients.find(x => String(x.id) === select?.value)
    if (input && p) input.value = String(p.valor ?? '')
  }
  document.getElementById('patient-select')?.addEventListener('change', updateSessionValor)
  updateSessionValor()

  document.querySelectorAll('.emotion-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.emotion-btn').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
    })
  })

  document.querySelectorAll('.payment-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.payment-btn').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
    })
  })

  const topicInput = document.getElementById('new-topic') as HTMLInputElement | null
  const topicArea = document.getElementById('topics-area')
  topicInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && topicInput.value.trim()) {
      e.preventDefault()
      const span = document.createElement('span')
      span.className = 'pill'
      span.textContent = topicInput.value.trim()
      span.addEventListener('click', () => span.classList.toggle('active'))
      topicArea?.appendChild(span)
      topicInput.value = ''
    }
  })

  document.querySelectorAll('#topics-area .pill').forEach(pill => {
    pill.addEventListener('click', () => pill.classList.toggle('active'))
  })

  document.getElementById('save-session-btn')?.addEventListener('click', async () => {
    const patientId = (document.getElementById('patient-select') as HTMLSelectElement | null)?.value
    const dataHora = (document.getElementById('session-datetime') as HTMLInputElement | null)?.value
    const notas = (document.getElementById('session-notes') as HTMLTextAreaElement | null)?.value || ''
    const valor = parseFloat((document.getElementById('session-valor') as HTMLInputElement | null)?.value || '0') || 0
    const payment = document.querySelector('.payment-btn.active')?.getAttribute('data-payment')
    const pagoEm = payment === 'pago' ? new Date().toISOString() : null
    const status = payment === 'cancelada' ? 'cancelada' : 'agendada'
    if (!patientId || !dataHora) {
      alert('Selecione o paciente e a data/hora.')
      return
    }
    const body = {
      patient_id: Number(patientId),
      data_hora: new Date(dataHora).toISOString(),
      duracao: 50,
      status,
      valor,
      notas,
      pago_em: pagoEm,
    }
    try {
      await api('/sessions', { method: 'POST', body: JSON.stringify(body) })
      alert('Sessão registrada com sucesso.')
      sessions = await api<Session[]>('/sessions')
      renderAll()
    } catch (e: any) {
      alert('Erro ao salvar sessão: ' + e.message)
    }
  })
}

function sessionBadgeClass(status: string) {
  const s = status.toLowerCase()
  if (['realizada', 'confirmada'].includes(s)) return 'badge-success'
  if (['agendada', 'pendente', 'remarcada'].includes(s)) return 'badge-warning'
  if (['cancelada', 'faltou'].includes(s)) return 'badge-danger'
  return 'badge-accent'
}

function openPatientDetail(patientId: number) {
  detailPatientId = patientId
  const overlay = document.getElementById('patient-detail-modal-overlay')
  const p = patients.find(x => x.id === patientId)
  if (!p) return
  setText('detail-patient-name', p.nome)
  setText('detail-reajuste', p.data_reajuste ? fmtDateReajuste(p.data_reajuste) : 'Não definido')
  const renovarBtn = document.getElementById('renovar-ciclo-btn')
  if (renovarBtn) renovarBtn.setAttribute('data-id', String(p.id))

  const pSessions = sessions
    .filter(s => s.patient_id === p.id)
    .sort((a, b) => new Date(b.data_hora).getTime() - new Date(a.data_hora).getTime())

  const container = document.getElementById('detail-sessions-list')
  if (!container) return

  if (pSessions.length === 0) {
    container.innerHTML = '<div class="empty-state">Nenhuma sessão encontrada.</div>'
    overlay?.classList.add('show')
    return
  }

  const groups: Record<string, Session[]> = {}
  pSessions.forEach(s => {
    const d = new Date(s.data_hora)
    const k = `${d.getFullYear()}-${d.getMonth()}`
    if (!groups[k]) groups[k] = []
    groups[k].push(s)
  })

  const months = Object.keys(groups).sort().reverse()
  const label = (k: string) => {
    const [y, m] = k.split('-').map(Number)
    const n = monthName(m)
    return n.charAt(0).toUpperCase() + n.slice(1) + ' ' + y
  }

  container.innerHTML = months.map(k => {
    const items = groups[k].map(s => `
      <div style="background: var(--surface-1); border: 0.5px solid var(--border); border-radius: var(--radius); padding: 0.75rem; margin-bottom: 0.5rem; display: flex; justify-content: space-between; align-items: center; gap: 12px;">
        <div>
          <div style="font-size: 12px; color: var(--text-secondary); font-weight: 500;">${fmtDateBR(s.data_hora)} · ${fmtTimeRange(s.data_hora, s.duracao)}</div>
          <div style="font-size: 14px; font-weight: 500; margin: 4px 0 0;">${fmtMoney(s.valor)}</div>
          <span class="badge ${sessionBadgeClass(s.status)}">${s.status}</span>
        </div>
        <div style="display: flex; gap: 6px;">
          <button class="btn btn-secondary btn-small edit-session" data-id="${s.id}">Editar</button>
          <button class="btn btn-small delete-session" data-id="${s.id}" style="background: var(--bg-danger); color: var(--text-danger); border: 0.5px solid var(--border);">Excluir</button>
        </div>
      </div>
    `).join('')
    return `<div style="margin-bottom: 1rem;"><div style="font-weight: 500; margin-bottom: 0.5rem; font-size: 14px;">${label(k)}</div>${items}</div>`
  }).join('')

  overlay?.classList.add('show')
}

function openSessionOptions(sessionId: number) {
  const s = sessions.find(x => x.id === sessionId)
  if (!s) return
  const overlay = document.getElementById('session-options-modal-overlay')
  const set = (id: string, value: string) => {
    const el = document.getElementById(id) as HTMLInputElement | null
    if (el) el.value = value
  }
  setText('session-options-title', s.paciente_nome)
  setText('session-options-subtitle', `${fmtDateBR(s.data_hora)} · ${fmtTime(s.data_hora)}`)
  set('session-options-session-id', String(s.id))
  set('session-options-patient-id', String(s.patient_id))
  const sala = document.getElementById('session-options-sala') as HTMLAnchorElement | null
  if (sala) {
    if (s.sala_reuniao) {
      sala.href = s.sala_reuniao
      sala.style.display = 'block'
    } else {
      sala.style.display = 'none'
    }
  }
  overlay?.classList.add('show')
}

function openSessionEdit(sessionId: number) {
  const s = sessions.find(x => x.id === sessionId)
  if (!s) return
  const overlay = document.getElementById('session-edit-modal-overlay')
  const set = (id: string, value: string) => {
    const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null
    if (el) el.value = value
  }
  set('edit-session-id', String(s.id))
  setText('edit-session-title', `Editar sessão - ${s.paciente_nome}`)
  set('edit-session-paciente', s.paciente_nome)
  const pacienteBtn = document.getElementById('edit-session-paciente-btn')
  if (pacienteBtn) pacienteBtn.setAttribute('data-patient-id', String(s.patient_id))
  set('edit-session-datetime', toLocalInput(s.data_hora))
  set('edit-session-valor', String(s.valor))
  set('edit-session-status', s.status)
  set('edit-session-pago-em', s.pago_em ? s.pago_em.split('T')[0] : '')
  set('edit-session-notas', s.notas || '')
  overlay?.classList.add('show')
}

function setupSessionOptions() {
  const overlay = document.getElementById('session-options-modal-overlay')
  const close = document.getElementById('close-session-options')
  const editar = document.getElementById('session-options-editar')
  const registrar = document.getElementById('session-options-registrar')

  close?.addEventListener('click', () => overlay?.classList.remove('show'))
  overlay?.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.classList.remove('show')
  })

  editar?.addEventListener('click', () => {
    const patientId = document.getElementById('session-options-patient-id') as HTMLInputElement | null
    overlay?.classList.remove('show')
    if (patientId?.value) openPatientModal(Number(patientId.value))
  })

  registrar?.addEventListener('click', () => {
    const sessionId = document.getElementById('session-options-session-id') as HTMLInputElement | null
    overlay?.classList.remove('show')
    if (sessionId?.value) openSessionEdit(Number(sessionId.value))
  })
}

function setupSessionEdit() {
  const overlay = document.getElementById('session-edit-modal-overlay')
  const close = document.getElementById('close-session-edit')
  const save = document.getElementById('edit-session-save')
  const del = document.getElementById('edit-session-delete')
  const paciente = document.getElementById('edit-session-paciente-btn')

  close?.addEventListener('click', () => overlay?.classList.remove('show'))
  overlay?.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.classList.remove('show')
  })

  save?.addEventListener('click', async () => {
    const id = Number((document.getElementById('edit-session-id') as HTMLInputElement | null)?.value)
    const dataHora = (document.getElementById('edit-session-datetime') as HTMLInputElement | null)?.value
    const valor = parseFloat((document.getElementById('edit-session-valor') as HTMLInputElement | null)?.value || '0') || 0
    const status = (document.getElementById('edit-session-status') as HTMLSelectElement | null)?.value
    const pago_em = (document.getElementById('edit-session-pago-em') as HTMLInputElement | null)?.value || null
    const notas = (document.getElementById('edit-session-notas') as HTMLTextAreaElement | null)?.value || ''
    if (!dataHora || !status) {
      alert('Preencha data/hora e status.')
      return
    }
    const body = {
      data_hora: new Date(dataHora).toISOString(),
      duracao: 50,
      status,
      valor,
      notas,
      pago_em,
    }
    try {
      await api(`/sessions/${id}`, { method: 'PUT', body: JSON.stringify(body) })
      alert('Sessão atualizada.')
      const s = await api<Session[]>('/sessions')
      sessions = s.map(x => ({ ...x, valor: Number(x.valor || 0) }))
      renderAll()
      if (detailPatientId) openPatientDetail(detailPatientId)
      overlay?.classList.remove('show')
    } catch (e: any) {
      alert('Erro ao atualizar sessão: ' + e.message)
    }
  })

  del?.addEventListener('click', async () => {
    const id = Number((document.getElementById('edit-session-id') as HTMLInputElement | null)?.value)
    if (!confirm('Excluir esta sessão?')) return
    try {
      await api(`/sessions/${id}`, { method: 'DELETE' })
      sessions = sessions.filter(s => s.id !== id)
      renderAll()
      if (detailPatientId) openPatientDetail(detailPatientId)
      overlay?.classList.remove('show')
    } catch (e: any) {
      alert('Erro ao excluir sessão: ' + e.message)
    }
  })

  paciente?.addEventListener('click', () => {
    const id = paciente.getAttribute('data-patient-id')
    if (id) {
      overlay?.classList.remove('show')
      openPatientModal(Number(id))
    }
  })
}

function setupPatientDetail() {
  const overlay = document.getElementById('patient-detail-modal-overlay')
  const close = document.getElementById('close-patient-detail')
  const list = document.getElementById('detail-sessions-list')

  close?.addEventListener('click', () => overlay?.classList.remove('show'))
  overlay?.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.classList.remove('show')
  })

  list?.addEventListener('click', (e) => {
    const target = e.target as HTMLElement
    const id = Number(target.getAttribute('data-id'))
    if (target.classList.contains('edit-session')) openSessionEdit(id)
    if (target.classList.contains('delete-session')) {
      if (!confirm('Excluir esta sessão?')) return
      deleteSession(id)
    }
  })

  const renovar = document.getElementById('renovar-ciclo-btn')
  renovar?.addEventListener('click', () => {
    const id = Number(renovar.getAttribute('data-id'))
    if (id) renovarCiclo(id)
  })
}

async function deleteSession(id: number) {
  try {
    await api(`/sessions/${id}`, { method: 'DELETE' })
    sessions = sessions.filter(s => s.id !== id)
    renderAll()
    if (detailPatientId) openPatientDetail(detailPatientId)
  } catch (e: any) {
    alert('Erro ao excluir sessão: ' + e.message)
  }
}

function setupPacienteForm() {
  const overlay = document.getElementById('patient-modal-overlay')
  const close = document.getElementById('close-patient-modal')
  const save = document.getElementById('save-patient-btn')
  const open = document.getElementById('new-patient-btn')
  const list = document.getElementById('patients-list')

  list?.addEventListener('click', (e) => {
    const target = e.target as HTMLElement
    const row = target.closest('.patient-row')
    const idAttr = row?.getAttribute('data-id')
    const id = idAttr ? Number(idAttr) : 0
    if (target.classList.contains('edit-patient')) openPatientModal(id)
    else if (target.classList.contains('delete-patient')) deletePatient(id)
    else if (row) openPatientDetail(id)
  })

  open?.addEventListener('click', () => openPatientModal(null))
  close?.addEventListener('click', () => overlay?.classList.remove('show'))
  overlay?.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.classList.remove('show')
  })

  save?.addEventListener('click', async () => {
    const nome = (document.getElementById('patient-nome') as HTMLInputElement | null)?.value.trim()
    if (!nome) {
      alert('Nome é obrigatório.')
      return
    }
    const cpf = (document.getElementById('patient-cpf') as HTMLInputElement | null)?.value || ''
    const telefone = (document.getElementById('patient-telefone') as HTMLInputElement | null)?.value || ''
    const email = (document.getElementById('patient-email') as HTMLInputElement | null)?.value || ''
    const data_nascimento = (document.getElementById('patient-nascimento') as HTMLInputElement | null)?.value || null
    const anamnese = (document.getElementById('patient-anamnese') as HTMLTextAreaElement | null)?.value || ''
    const valor = parseFloat((document.getElementById('patient-valor') as HTMLInputElement | null)?.value || '0') || 0
    const tipo_faturamento = (document.getElementById('patient-tipo') as HTMLSelectElement | null)?.value || 'imediato'
    const diasSelect = document.getElementById('patient-dias') as HTMLSelectElement | null
    const dias_semana = diasSelect ? Array.from(diasSelect.selectedOptions).map(o => o.value) : []
    const frequencia_recorrencia = (document.getElementById('patient-frequencia') as HTMLSelectElement | null)?.value || 'semanal'
    const horario = (document.getElementById('patient-horario') as HTMLInputElement | null)?.value || null
    const data_reajuste = (document.getElementById('patient-reajuste') as HTMLInputElement | null)?.value || null
    const meses = Number((document.getElementById('patient-meses') as HTMLInputElement | null)?.value || 6)
    const meses_ciclo = isNaN(meses) || meses < 1 ? 6 : meses
    const sala_reuniao = (document.getElementById('patient-sala') as HTMLInputElement | null)?.value || null
    const body = { nome, cpf, telefone, email, data_nascimento, anamnese, valor, tipo_faturamento, dias_semana, frequencia_recorrencia, horario, data_reajuste, meses_ciclo, sala_reuniao }
    const path = editingPatientId ? `/patients/${editingPatientId}` : '/patients'
    const method = editingPatientId ? 'PUT' : 'POST'
    try {
      await api(path, { method, body: JSON.stringify(body) })
      alert(editingPatientId ? 'Paciente atualizado com sucesso.' : 'Paciente adicionado com sucesso.')
      editingPatientId = null
      const [p, s, d] = await Promise.all([api<Patient[]>('/patients'), api<Session[]>('/sessions'), api<Dashboard>('/dashboard')])
      patients = p.map(x => ({ ...x, valor: Number(x.valor || 0), meses_ciclo: Number(x.meses_ciclo || 6) }))
      sessions = s.map(x => ({ ...x, valor: Number(x.valor || 0) }))
      dashboard = d
      renderAll()
      const clear = (id: string) => {
        const el = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | null
        if (el) el.value = ''
      }
      clear('patient-nome')
      clear('patient-cpf')
      clear('patient-telefone')
      clear('patient-email')
      clear('patient-nascimento')
      clear('patient-anamnese')
      clear('patient-valor')
      clear('patient-tipo')
      if (diasSelect) Array.from(diasSelect.options).forEach(o => o.selected = false)
      const frequenciaInput = document.getElementById('patient-frequencia') as HTMLSelectElement | null
      if (frequenciaInput) frequenciaInput.value = 'semanal'
      clear('patient-horario')
      clear('patient-reajuste')
      const mesesInput = document.getElementById('patient-meses') as HTMLInputElement | null
      if (mesesInput) mesesInput.value = '6'
      clear('patient-sala')
      overlay?.classList.remove('show')
    } catch (e: any) {
      alert('Erro ao salvar paciente: ' + e.message)
    }
  })
}

function openPatientModal(patientId: number | null) {
  const overlay = document.getElementById('patient-modal-overlay')
  const title = document.getElementById('patient-modal-title')
  const set = (id: string, value: string) => {
    const el = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | null
    if (el) el.value = value
  }

  editingPatientId = patientId
  if (patientId) {
    const p = patients.find(x => x.id === patientId)
    if (!p) return
    setText('patient-modal-title', 'Editar paciente')
    set('patient-nome', p.nome)
    set('patient-cpf', p.cpf || '')
    set('patient-telefone', p.telefone || '')
    set('patient-email', p.email || '')
    set('patient-nascimento', p.data_nascimento ? p.data_nascimento.split('T')[0] : '')
    set('patient-anamnese', p.anamnese || '')
    set('patient-valor', String(p.valor ?? ''))
    set('patient-tipo', p.tipo_faturamento || 'imediato')
    const diasSelect = document.getElementById('patient-dias') as HTMLSelectElement | null
    if (diasSelect) {
      Array.from(diasSelect.options).forEach(o => {
        o.selected = p.dias_semana ? p.dias_semana.includes(o.value) : false
      })
    }
    const frequenciaInput = document.getElementById('patient-frequencia') as HTMLSelectElement | null
    if (frequenciaInput) frequenciaInput.value = p.frequencia_recorrencia || 'semanal'
    set('patient-horario', p.horario ? p.horario.slice(0, 5) : '')
    set('patient-reajuste', p.data_reajuste || '')
    set('patient-meses', String(p.meses_ciclo ?? 6))
    set('patient-sala', p.sala_reuniao || '')
  } else {
    setText('patient-modal-title', 'Novo paciente')
    set('patient-nome', '')
    set('patient-cpf', '')
    set('patient-telefone', '')
    set('patient-email', '')
    set('patient-nascimento', '')
    set('patient-anamnese', '')
    set('patient-valor', '')
    set('patient-tipo', 'imediato')
    const diasSelectNew = document.getElementById('patient-dias') as HTMLSelectElement | null
    if (diasSelectNew) Array.from(diasSelectNew.options).forEach(o => o.selected = false)
    const frequenciaInputNew = document.getElementById('patient-frequencia') as HTMLSelectElement | null
    if (frequenciaInputNew) frequenciaInputNew.value = 'semanal'
    set('patient-horario', '')
    set('patient-reajuste', '')
    set('patient-meses', '6')
    set('patient-sala', '')
  }
  overlay?.classList.add('show')
}

async function renovarCiclo(patientId: number) {
  if (!confirm('Deseja renovar o ciclo deste paciente?')) return
  try {
    await api(`/patients/${patientId}/renovar`, { method: 'POST' })
    const [p, s] = await Promise.all([api<Patient[]>('/patients'), api<Session[]>('/sessions')])
    patients = p.map(x => ({ ...x, valor: Number(x.valor || 0), meses_ciclo: Number(x.meses_ciclo || 6) }))
    sessions = s.map(x => ({ ...x, valor: Number(x.valor || 0) }))
    renderAll()
    if (detailPatientId === patientId) openPatientDetail(patientId)
    alert('Ciclo renovado com sucesso.')
  } catch (e: any) {
    alert('Erro ao renovar ciclo: ' + e.message)
  }
}

async function deletePatient(id: number) {
  if (!confirm('Excluir paciente e suas sessões?')) return
  try {
    await api(`/patients/${id}`, { method: 'DELETE' })
    patients = patients.filter(p => p.id !== id)
    sessions = sessions.filter(s => s.patient_id !== id)
    renderPatients()
    renderDashboard()
    renderAgenda()
    renderFinanceiro()
    setupSessaoForm()
    alert('Paciente excluído.')
  } catch (e: any) {
    alert('Erro ao excluir paciente: ' + e.message)
  }
}

function renderAll() {
  renderDashboard()
  renderPatients()
  renderAgenda()
  renderFinanceiro()
  renderNotas()
  setupSessaoForm()
}

function renderNotas() {
  document.querySelectorAll('.notas-section').forEach(s => s.classList.remove('active'))
  document.getElementById(`notas-${activeNotasTab}`)?.classList.add('active')

  if (activeNotasTab === 'geral') renderNotasGeral()
  else if (activeNotasTab === 'detalhado') renderNotasDetalhado()
  else renderNotasGeradas()
}

function renderNotasGeral() {
  const container = document.getElementById('notas-geral')
  if (!container) return
  api<any[]>('/notas/pendentes')
    .then(data => {
      notasPendentes = data
      if (data.length === 0) {
        container.innerHTML = `<div class='empty-state'>Nenhum paciente com sessões pendentes de faturamento.</div>`
        return
      }
      const totalPacientes = data.length
      const totalSessoes = data.reduce((sum: number, p: any) => sum + (p.sessoes?.length || 0), 0)
      const totalValor = data.reduce((sum: number, p: any) => sum + (p.valor_total || 0), 0)

      const html = `
        <div class='metrics-grid' style='margin-bottom: 1rem;'>
          <div class='metric-card'><div class='metric-label'>Pacientes pendentes</div><div class='metric-value'>${totalPacientes}</div></div>
          <div class='metric-card'><div class='metric-label'>Sessões pendentes</div><div class='metric-value'>${totalSessoes}</div></div>
          <div class='metric-card'><div class='metric-label'>Total pendente</div><div class='metric-value'>${fmtMoney(totalValor)}</div></div>
        </div>
        ${data.map((p: any) => {
          const qtd = p.qtd_sessoes_nota || 1
          const tipo = p.tipo_faturamento === 'pacote' ? `Pacote (${qtd} sessões)` : 'Imediato (1 sessão)'
          const pendenteCount = p.sessoes?.length || 0
          return `
            <div class='card' style='margin-bottom: 0.75rem;'>
              <div style='display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap;'>
                <div>
                  <div style='font-weight: 500; font-size: 15px;'>${p.nome}</div>
                  <div style='font-size: 12px; color: var(--text-secondary);'>${tipo} · ${pendenteCount} sessão(ões) pendente(s) · Total: ${fmtMoney(p.valor_total || 0)}</div>
                </div>
                <button class='btn btn-small ver-detalhes' data-patient-id='${p.id}' style='background: var(--bg-accent); color: var(--text-accent); border-color: var(--border-accent);'>Ver detalhes</button>
              </div>
            </div>
          `
        }).join('')}
      `
      container.innerHTML = html
    })
    .catch(e => {
      container.innerHTML = `<div class='empty-state'>Erro ao carregar notas: ${e.message}</div>`
    })
}

function renderNotasDetalhado() {
  const container = document.getElementById('notas-detalhado')
  if (!container) return
  api<any[]>('/notas/pendentes')
    .then(data => {
      notasPendentes = data
      if (data.length === 0) {
        container.innerHTML = `<div class='empty-state'>Nenhuma sessão pendente de faturamento.</div>`
        return
      }
      const options = data.map((p: any) => `<option value='${p.id}'>${p.nome}</option>`).join('')
      const html = `
        <div style='display: flex; gap: 8px; align-items: end; margin-bottom: 1rem; flex-wrap: wrap;'>
          <div class='form-group' style='flex: 1; min-width: 180px; margin: 0;'>
            <label style='font-size: 11px; color: var(--text-secondary);'>Paciente</label>
            <select id='notas-patient-filter' style='width: 100%;'>
              <option value=''>Todos os pacientes</option>
              ${options}
            </select>
          </div>
          <button class='btn gerar-notas' style='background: var(--fill-accent); color: var(--on-accent); border: 0; margin-bottom: 2px;'>Gerar notas selecionadas</button>
        </div>
        ${data.filter((p: any) => !detalhadoPatientFilter || String(p.id) === String(detalhadoPatientFilter)).map((p: any) => {
          const qtd = p.qtd_sessoes_nota || 1
          const tipo = p.tipo_faturamento === 'pacote' ? `Pacote (${qtd} sessões)` : 'Imediato (1 sessão)'
          const pendenteCount = p.sessoes?.length || 0
          const total = p.sessoes?.reduce((sum: number, s: any) => sum + Number(s.valor || 0), 0) || 0
          return `
            <div class='card notas-patient-card' data-patient-id='${p.id}' style='margin-bottom: 0.75rem;'>
              <div style='display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 0.75rem;'>
                <div>
                  <div style='font-weight: 500; font-size: 15px;'>${p.nome}</div>
                  <div style='font-size: 12px; color: var(--text-secondary);'>${tipo} · Pendentes: ${pendenteCount} · Total: ${fmtMoney(total)}</div>
                </div>
                <label style='font-size: 12px; display: flex; align-items: center; gap: 6px; cursor: pointer;'>
                  <input type='checkbox' class='select-patient' data-patient-id='${p.id}'>
                  Selecionar todas
                </label>
              </div>
              <div style='display: grid; gap: 8px;'>
                ${(p.sessoes || []).map((s: any) => `
                  <label style='display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 8px 0; border-bottom: 0.5px solid var(--border); cursor: pointer;'>
                    <div style='display: flex; align-items: center; gap: 10px;'>
                      <input type='checkbox' class='nota-check' data-id='${s.id}' data-patient-id='${p.id}'>
                      <span style='font-size: 13px;'>${fmtDateBR(s.data_hora)} · ${fmtTime(s.data_hora)}</span>
                    </div>
                    <span style='font-size: 13px; font-weight: 500;'>${fmtMoney(Number(s.valor || 0))}</span>
                  </label>
                `).join('')}
              </div>
            </div>
          `
        }).join('')}
      `
      container.innerHTML = html
      const filter = document.getElementById('notas-patient-filter') as HTMLSelectElement | null
      if (filter) {
        filter.value = String(detalhadoPatientFilter)
        filter.addEventListener('change', () => {
          detalhadoPatientFilter = filter.value ? Number(filter.value) : ''
          renderNotasDetalhado()
        })
      }
    })
    .catch(e => {
      container.innerHTML = `<div class='empty-state'>Erro ao carregar notas: ${e.message}</div>`
    })
}

function renderNotasGeradas() {
  const container = document.getElementById('notas-geradas')
  if (!container) return
  const geradas = sessions.filter(s => s.faturada && s.status !== 'cancelada')
  if (geradas.length === 0) {
    container.innerHTML = `<div class='empty-state'>Nenhuma nota gerada ainda.</div>`
    return
  }
  const grouped = geradas.reduce((acc: any, s: any) => {
    const pid = s.patient_id
    if (!acc[pid]) acc[pid] = { nome: s.paciente_nome, sessoes: [], total: 0 }
    acc[pid].sessoes.push(s)
    acc[pid].total += Number(s.valor || 0)
    return acc
  }, {})
  const html = `
    <div class='metrics-grid' style='margin-bottom: 1rem;'>
      <div class='metric-card'><div class='metric-label'>Notas geradas</div><div class='metric-value'>${geradas.length}</div></div>
      <div class='metric-card'><div class='metric-label'>Total faturado</div><div class='metric-value'>${fmtMoney(geradas.reduce((sum: number, s: any) => sum + Number(s.valor || 0), 0))}</div></div>
    </div>
    ${Object.values(grouped).map((g: any) => `
      <div class='card' style='margin-bottom: 0.75rem;'>
        <div style='display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 0.75rem;'>
          <div>
            <div style='font-weight: 500; font-size: 15px;'>${g.nome}</div>
            <div style='font-size: 12px; color: var(--text-secondary);'>${g.sessoes.length} sessão(ões) faturada(s) · Total: ${fmtMoney(g.total)}</div>
          </div>
        </div>
        <div style='display: grid; gap: 8px;'>
          ${g.sessoes.map((s: any) => `
            <div style='display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 8px 0; border-bottom: 0.5px solid var(--border);'>
              <span style='font-size: 13px;'>${fmtDateBR(s.data_hora)} · ${fmtTime(s.data_hora)}</span>
              <span style='font-size: 13px; font-weight: 500;'>${fmtMoney(Number(s.valor || 0))}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `).join('')}
  `
  container.innerHTML = html
}

function setupNotas() {
  const overlay = document.getElementById('invoice-modal-overlay')
  const close = document.getElementById('close-invoice')
  const geral = document.getElementById('notas-geral')
  const detalhado = document.getElementById('notas-detalhado')
  const email = document.getElementById('invoice-email') as HTMLAnchorElement | null
  const whatsapp = document.getElementById('invoice-whatsapp') as HTMLAnchorElement | null

  close?.addEventListener('click', () => overlay?.classList.remove('show'))
  overlay?.addEventListener('click', (e) => {
    if (e.target === overlay) overlay?.classList.remove('show')
  })

  function changeNotasTab(tab: string) {
    activeNotasTab = tab
    document.querySelectorAll('.notas-tab').forEach(t => {
      t.classList.remove('active')
      const el = t as HTMLElement
      el.style.background = ''
      el.style.color = ''
      el.style.borderColor = ''
    })
    const active = document.querySelector(`.notas-tab[data-notas-tab="${tab}"]`)
    active?.classList.add('active')
    renderNotas()
  }

  document.querySelectorAll('.notas-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const t = tab.getAttribute('data-notas-tab')
      if (t) changeNotasTab(t)
    })
  })

  geral?.addEventListener('click', (e) => {
    const target = e.target as HTMLElement
    const btn = target.closest('.ver-detalhes') as HTMLElement | null
    if (!btn) return
    const pid = btn.getAttribute('data-patient-id')
    if (!pid) return
    detalhadoPatientFilter = Number(pid)
    changeNotasTab('detalhado')
  })

  detalhado?.addEventListener('change', (e) => {
    const target = e.target as HTMLElement
    if (!target.classList.contains('select-patient')) return
    const pid = target.getAttribute('data-patient-id')
    const checked = (target as HTMLInputElement).checked
    detalhado?.querySelectorAll<HTMLInputElement>(`.nota-check[data-patient-id="${pid}"]`).forEach(cb => {
      cb.checked = checked
    })
  })

  detalhado?.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement
    if (!target.classList.contains('gerar-notas')) return
    const checkboxes = detalhado.querySelectorAll<HTMLInputElement>('.nota-check:checked')
    const session_ids = Array.from(checkboxes).map(cb => Number(cb.getAttribute('data-id')))
    if (session_ids.length === 0) {
      alert('Selecione ao menos uma sessão para gerar nota.')
      return
    }
    try {
      const res = await api<{ total: number; sessoes: any[] }>('/notas', { method: 'POST', body: JSON.stringify({ session_ids }) })
      const novas = await api<Session[]>('/sessions')
      sessions = novas.map(x => ({ ...x, valor: Number(x.valor || 0) }))
      renderAll()
      renderNotas()
      setText('invoice-modal-title', 'Notas geradas')
      const itens = res.sessoes.map((s: any) => `
        <div style='display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 0.5px solid var(--border);'>
          <span>${s.paciente_nome || 'Paciente'} · ${fmtDateBR(s.data_hora)} · ${fmtTime(s.data_hora)}</span>
          <span>${fmtMoney(Number(s.valor || 0))}</span>
        </div>
      `).join('')
      setHtml('invoice-modal-body', `
        <div style='margin-bottom: 1rem; color: var(--text-secondary);'>Total: ${fmtMoney(res.total || 0)} · ${res.sessoes.length} sessão(ões)</div>
        ${itens}
      `)
      const linhas = [
        'Notas de serviço',
        '',
        ...res.sessoes.map((s: any) => `- ${s.paciente_nome || 'Paciente'} · ${fmtDateBR(s.data_hora)} · ${fmtTime(s.data_hora)}: ${fmtMoney(Number(s.valor || 0))}`),
        '',
        `Total: ${fmtMoney(res.total || 0)}`
      ]
      const texto = linhas.join(String.fromCharCode(10))
      if (email) email.href = `mailto:?subject=${encodeURIComponent('Notas de serviço')}&body=${encodeURIComponent(texto)}`
      if (whatsapp) whatsapp.href = `https://wa.me/?text=${encodeURIComponent(texto)}`
      overlay?.classList.add('show')
    } catch (err: any) {
      alert('Erro ao gerar nota: ' + err.message)
    }
  })

  changeNotasTab('geral')
}

async function loadApp() {
  try {
    const [d, p, s] = await Promise.all([
      api<Dashboard>('/dashboard'),
      api<Patient[]>('/patients'),
      api<Session[]>('/sessions'),
    ])
    dashboard = d
    patients = p.map(x => ({ ...x, valor: Number(x.valor || 0), meses_ciclo: Number(x.meses_ciclo || 6) }))
    sessions = s.map(x => ({ ...x, valor: Number(x.valor || 0) }))

    setupNavigation()
    renderAll()
    setupPacienteForm()
    setupSessionEdit()
    setupSessionOptions()
    setupPatientDetail()
    setupNotas()
    setupAgendaView()
    setupFinanceiro()
  } catch (e: any) {
    console.error(e)
    document.body.insertAdjacentHTML('afterbegin', `<div style="padding:1rem;color:#dc2626;background:#fee2e2;">Erro ao carregar: ${e.message}</div>`)
  }
}

function setupLogin() {
  const btn = document.getElementById('login-btn')
  const emailInput = document.getElementById('login-email') as HTMLInputElement | null
  const passInput = document.getElementById('login-password') as HTMLInputElement | null
  if (emailInput) emailInput.value = 'demo@psicoapp.local'
  if (passInput) passInput.value = '123456'

  btn?.addEventListener('click', async () => {
    const email = emailInput?.value.trim() || ''
    const password = passInput?.value || ''
    if (!email || !password) {
      alert('Informe e-mail e senha.')
      return
    }
    try {
      const login = await api<LoginRes>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      })
      token = login.token
      setText('user-name', login.user.nome)
      await loadApp()
      navigateTo('dashboard')
    } catch (e: any) {
      alert('Erro ao entrar: ' + e.message)
    }
  })
}

async function init() {
  setupLogin()
  navigateTo('login')
}

init()
