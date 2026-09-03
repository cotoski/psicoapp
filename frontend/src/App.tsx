import { useEffect, useState } from 'react'

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001'

type User = { id: number; nome: string; email: string; crp: string }
type Patient = { id: number; nome: string; cpf?: string; telefone?: string; email?: string; data_nascimento?: string; anamnese?: string; created_at?: string }
type Session = { id: number; patient_id: number; paciente_nome: string; data_hora: string; duracao: number; status: string; valor: number; pago_em?: string; notas?: string }

export default function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem('psico_token'))
  const [user, setUser] = useState<User | null>(null)
  const [view, setView] = useState('dashboard')
  const [patients, setPatients] = useState<Patient[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [dashboard, setDashboard] = useState<any>(null)

  useEffect(() => {
    if (!token) return
    fetch(`${API}/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(setUser)
      .catch(() => setToken(null))
  }, [token])

  useEffect(() => {
    if (!token || !user) return
    if (view === 'patients') loadPatients()
    if (view === 'sessions') loadSessions()
    if (view === 'dashboard') loadDashboard()
    if (view === 'finance') loadSessions()
  }, [view, token, user])

  async function loadPatients() {
    const r = await fetch(`${API}/patients`, { headers: { Authorization: `Bearer ${token}` } })
    setPatients(await r.json())
  }

  async function loadSessions() {
    const r = await fetch(`${API}/sessions`, { headers: { Authorization: `Bearer ${token}` } })
    setSessions(await r.json())
  }

  async function loadDashboard() {
    const r = await fetch(`${API}/dashboard`, { headers: { Authorization: `Bearer ${token}` } })
    setDashboard(await r.json())
  }

  async function login(e: React.FormEvent) {
    e.preventDefault()
    const fd = new FormData(e.target as HTMLFormElement)
    const r = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: fd.get('email'), password: fd.get('password') })
    })
    const data = await r.json()
    if (data.token) {
      localStorage.setItem('psico_token', data.token)
      setToken(data.token)
      setUser(data.user)
      setView('dashboard')
    } else {
      alert(data.error || 'Erro no login')
    }
  }

  function logout() {
    localStorage.removeItem('psico_token')
    setToken(null)
    setUser(null)
  }

  if (!token) {
    return (
      <div className="container login card">
        <h1>PsicoApp</h1>
        <form onSubmit={login}>
          <input name="email" defaultValue="demo@psicoapp.local" placeholder="E-mail" />
          <input name="password" type="password" defaultValue="123456" placeholder="Senha" />
          <button type="submit">Entrar</button>
        </form>
        <p style={{ color: '#64748b' }}>Use demo@psicoapp.local / 123456</p>
      </div>
    )
  }

  return (
    <div className="container">
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>PsicoApp</h1>
        <div>{user?.nome} <button className="secondary" onClick={logout}>Sair</button></div>
      </header>

      <nav>
        {['dashboard', 'patients', 'sessions', 'finance'].map(v => (
          <button key={v} className={view === v ? 'active' : ''} onClick={() => setView(v)}>
            {v === 'dashboard' && 'Dashboard'}
            {v === 'patients' && 'Pacientes'}
            {v === 'sessions' && 'Sessões'}
            {v === 'finance' && 'Financeiro'}
          </button>
        ))}
      </nav>

      {view === 'dashboard' && <Dashboard data={dashboard} onRefresh={loadDashboard} />}
      {view === 'patients' && <PatientsView patients={patients} onChange={loadPatients} token={token} />}
      {view === 'sessions' && <SessionsView sessions={sessions} patients={patients} token={token} onChange={loadSessions} />}
      {view === 'finance' && <FinanceView sessions={sessions} />}
    </div>
  )
}

function Dashboard({ data, onRefresh }: { data: any; onRefresh: () => void }) {
  useEffect(() => { onRefresh() }, [])
  if (!data) return <p>Carregando...</p>
  return (
    <div className="grid-4">
      <div className="card"><div>Pacientes</div><div className="kpi">{data.pacientes}</div></div>
      <div className="card"><div>Sessões</div><div className="kpi">{data.sessoesTotal}</div></div>
      <div className="card"><div>Realizadas</div><div className="kpi">{data.sessoesRealizadas}</div></div>
      <div className="card"><div>Faturamento</div><div className="kpi">R$ {data.faturamento.toFixed(2)}</div></div>
    </div>
  )
}

function PatientsView({ patients, onChange, token }: { patients: Patient[]; onChange: () => void; token: string | null }) {
  const [form, setForm] = useState<Partial<Patient>>({})
  const [editId, setEditId] = useState<number | null>(null)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    const url = editId ? `${API}/patients/${editId}` : `${API}/patients`
    const method = editId ? 'PUT' : 'POST'
    await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(form)
    })
    setForm({})
    setEditId(null)
    onChange()
  }

  function edit(p: Patient) {
    setForm(p)
    setEditId(p.id)
  }

  return (
    <div>
      <form onSubmit={save} className="card" style={{ display: 'grid', gap: '0.5rem' }}>
        <input value={form.nome || ''} onChange={e => setForm({ ...form, nome: e.target.value })} placeholder="Nome" required />
        <input value={form.cpf || ''} onChange={e => setForm({ ...form, cpf: e.target.value })} placeholder="CPF" />
        <input value={form.telefone || ''} onChange={e => setForm({ ...form, telefone: e.target.value })} placeholder="Telefone" />
        <input value={form.email || ''} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="E-mail" />
        <input type="date" value={form.data_nascimento?.split('T')[0] || ''} onChange={e => setForm({ ...form, data_nascimento: e.target.value })} />
        <textarea value={form.anamnese || ''} onChange={e => setForm({ ...form, anamnese: e.target.value })} placeholder="Anamnese" rows={4} />
        <div>
          <button type="submit">{editId ? 'Atualizar' : 'Adicionar'}</button>
          {editId && <button type="button" className="secondary" onClick={() => { setForm({}); setEditId(null) }} style={{ marginLeft: 8 }}>Cancelar</button>}
        </div>
      </form>
      <table className="table card">
        <thead><tr><th>Nome</th><th>Telefone</th><th>E-mail</th><th>Ações</th></tr></thead>
        <tbody>
          {patients.map(p => (
            <tr key={p.id}>
              <td>{p.nome}</td>
              <td>{p.telefone}</td>
              <td>{p.email}</td>
              <td><button className="secondary" onClick={() => edit(p)}>Editar</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SessionsView({ sessions, patients, token, onChange }: { sessions: Session[]; patients: Patient[]; token: string | null; onChange: () => void }) {
  const [form, setForm] = useState<Partial<Session>>({ data_hora: '', duracao: 50, status: 'agendada', valor: 0, notas: '' })
  const [editId, setEditId] = useState<number | null>(null)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    const url = editId ? `${API}/sessions/${editId}` : `${API}/sessions`
    const method = editId ? 'PUT' : 'POST'
    const body = { ...form, pago_em: form.status === 'realizada' && form.pago_em ? form.pago_em : null }
    await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body)
    })
    setForm({ data_hora: '', duracao: 50, status: 'agendada', valor: 0, notas: '', patient_id: undefined })
    setEditId(null)
    onChange()
  }

  function edit(s: Session) {
    setForm({ ...s, data_hora: s.data_hora.slice(0, 16) })
    setEditId(s.id)
  }

  async function remove(id: number) {
    if (!confirm('Excluir sessão?')) return
    await fetch(`${API}/sessions/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
    onChange()
  }

  return (
    <div>
      <form onSubmit={save} className="card" style={{ display: 'grid', gap: '0.5rem' }}>
        <select value={form.patient_id || ''} onChange={e => setForm({ ...form, patient_id: Number(e.target.value) })} required>
          <option value="">Selecione o paciente</option>
          {patients.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>
        <input type="datetime-local" value={form.data_hora || ''} onChange={e => setForm({ ...form, data_hora: e.target.value })} required />
        <input type="number" value={form.duracao || 50} onChange={e => setForm({ ...form, duracao: Number(e.target.value) })} placeholder="Duração (min)" />
        <select value={form.status || 'agendada'} onChange={e => setForm({ ...form, status: e.target.value })}>
          <option>agendada</option>
          <option>realizada</option>
          <option>cancelada</option>
          <option>remarcada</option>
        </select>
        <input type="number" step="0.01" value={form.valor || 0} onChange={e => setForm({ ...form, valor: Number(e.target.value) })} placeholder="Valor R$" />
        <input type="date" value={form.pago_em ? form.pago_em.split('T')[0] : ''} onChange={e => setForm({ ...form, pago_em: e.target.value })} placeholder="Pago em" />
        <textarea value={form.notas || ''} onChange={e => setForm({ ...form, notas: e.target.value })} placeholder="Notas da sessão" rows={3} />
        <div>
          <button type="submit">{editId ? 'Atualizar' : 'Agendar'}</button>
          {editId && <button type="button" className="secondary" onClick={() => { setForm({ data_hora: '', duracao: 50, status: 'agendada', valor: 0, notas: '' }); setEditId(null) }} style={{ marginLeft: 8 }}>Cancelar</button>}
        </div>
      </form>
      <table className="table card">
        <thead><tr><th>Paciente</th><th>Data/Hora</th><th>Status</th><th>Valor</th><th>Ações</th></tr></thead>
        <tbody>
          {sessions.map(s => (
            <tr key={s.id}>
              <td>{s.paciente_nome}</td>
              <td>{new Date(s.data_hora).toLocaleString('pt-BR')}</td>
              <td>{s.status}</td>
              <td>R$ {Number(s.valor).toFixed(2)}</td>
              <td>
                <button className="secondary" onClick={() => edit(s)}>Editar</button>
                <button className="danger" onClick={() => remove(s.id)} style={{ marginLeft: 8 }}>Excluir</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function FinanceView({ sessions }: { sessions: Session[] }) {
  const total = sessions.filter(s => s.status === 'realizada' && s.pago_em).reduce((a, s) => a + Number(s.valor), 0)
  const pendente = sessions.filter(s => s.status === 'realizada' && !s.pago_em).reduce((a, s) => a + Number(s.valor), 0)
  return (
    <div className="grid-4">
      <div className="card"><div>Recebido</div><div className="kpi">R$ {total.toFixed(2)}</div></div>
      <div className="card"><div>Pendente</div><div className="kpi">R$ {pendente.toFixed(2)}</div></div>
      <div className="card"><div>Total Realizadas</div><div className="kpi">{sessions.filter(s => s.status === 'realizada').length}</div></div>
    </div>
  )
}
