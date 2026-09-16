// Massa de teste para validação manual (tenant demo@psicoapp.dev).
// Uso: node scripts/seed-massa.mjs [baseUrl] [email] [senha]
// Ou via docker:
//   docker run --rm -v <repo>:/repo -w /repo --add-host host.docker.internal:host-gateway \
//     node:20-alpine node scripts/seed-massa.mjs http://host.docker.internal:3100

const BASE = process.argv[2] ?? 'http://localhost:3100'
const EMAIL = process.argv[3] ?? 'demo@psicoapp.dev'
const SENHA = process.argv[4] ?? 'senha-forte-123'
const API = `${BASE}/api/v1`

let token = null

async function req(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = res.status === 204 ? null : await res.json().catch(() => null)
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${JSON.stringify(data)}`)
  return data
}

// Data deste mês (ou próximo se já passou) para um weekday específico.
// weekday: 0=dom … 6=sáb
function nextDate(weekday, hour = '10:00', weekOffset = 0) {
  const d = new Date()
  d.setDate(d.getDate() + ((weekday - d.getDay() + 7) % 7) + weekOffset * 7)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${hour}:00`
}
function pastDate(weekday, hour = '10:00', weeksAgo = 1) {
  const d = new Date()
  d.setDate(d.getDate() - ((d.getDay() - weekday + 7) % 7 || 7) - (weeksAgo - 1) * 7)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${hour}:00`
}
const in6m = () => {
  const d = new Date()
  d.setMonth(d.getMonth() + 6)
  return d.toISOString().slice(0, 10)
}

const login = await req('/auth/login', { method: 'POST', body: { email: EMAIL, password: SENHA } })
token = login.accessToken
console.log(`✓ login ${EMAIL}`)

await req('/tax/config', {
  method: 'PUT',
  body: { regime: 'simples', municipio: 'sp', faturamentoAnual: 96000, folhaPagamentoAnual: 18000, prolaboreAnual: 18000 },
})
console.log('✓ tax_config: simples / sp')

const pacientes = [
  {
    nome: 'Ana Beatriz Souza', cpf: '123.456.789-09', telefone: '11987654001',
    email: 'ana.souza@email.com', dataNascimento: '1990-04-12', valor: 250,
    tipoFaturamento: 'imediato', diasSemana: ['segunda', 'quarta'], horario: '09:00',
    frequenciaRecorrencia: 'semanal', mesesCiclo: 6, dataReajuste: in6m(),
    anamnese: 'Quadro ansioso; em acompanhamento há 8 meses.',
  },
  {
    nome: 'Bruno Lima Ferreira', telefone: '11987654002',
    email: 'bruno.lima@email.com', valor: 280,
    tipoFaturamento: 'pacote', qtdSessoesNota: 4, diasSemana: ['terca'], horario: '14:00',
    frequenciaRecorrencia: 'quinzenal', mesesCiclo: 6, dataReajuste: in6m(),
  },
  {
    nome: 'Carla Mendes Rocha', cpf: '987.654.321-00', telefone: '11987654003',
    valor: 300, tipoFaturamento: 'pacote', qtdSessoesNota: 2,
    diasSemana: ['sexta'], horario: '16:00',
    frequenciaRecorrencia: 'semanal', mesesCiclo: 12, dataReajuste: in6m(),
  },
  {
    nome: 'Diego Ferreira Alves', telefone: '11987654004',
    email: 'diego.alves@email.com', valor: 200, tipoFaturamento: 'imediato',
    diasSemana: ['quinta'], horario: '19:00',
    frequenciaRecorrencia: 'semanal', mesesCiclo: 6, dataReajuste: in6m(),
  },
  {
    // sem agenda recorrente — paciente avulso
    nome: 'Marcos Paulo Ramos', valor: 220, tipoFaturamento: 'imediato',
  },
]

const ids = {}
for (const p of pacientes) {
  const created = await req('/patients', { method: 'POST', body: p })
  ids[p.nome] = created.id
  console.log(`✓ paciente: ${p.nome} (${created.id.slice(0, 8)})`)
}

// --- Sessões manuais no passado (este mês) para cenário realista ---
async function appt(patientId, startsAt, valor, status) {
  const a = await req('/appointments', { method: 'POST', body: { patientId, startsAt, valor } })
  if (status) {
    await req(`/appointments/${a.id}`, { method: 'PUT', body: { status } })
  }
  return a.id
}

// Ana (seg=1): 2 realizadas com prontuário, 1 confirmada futura.
// A futura reusa um slot da agenda gerada (criar manual colidiria com a
// UNIQUE patient_id+starts_at → 409).
const ana = ids['Ana Beatriz Souza']
const a1 = await appt(ana, pastDate(1, '10:00', 1), 250, 'completed')
const a2 = await appt(ana, pastDate(1, '10:00', 2), 250, 'completed')
const anaFuture = (await req(`/appointments?patientId=${ana}&from=${new Date().toISOString().slice(0, 10)}`)).data
await req(`/appointments/${anaFuture[0].id}`, { method: 'PUT', body: { status: 'confirmed' } })
console.log('✓ Ana: 2 realizadas + 1 confirmada (slot gerado)')

// Bruno (ter=2): 1 realizada, 1 falta — horário 15:00 para não colidir
// com slots gerados caso a data caia depois de hoje.
const bruno = ids['Bruno Lima Ferreira']
await appt(bruno, pastDate(2, '15:00', 1), 280, 'completed')
await appt(bruno, pastDate(2, '15:00', 2), 280, 'no_show')
console.log('✓ Bruno: 1 realizada + 1 falta')

// Carla (sex=5): 2 realizadas (prontas p/ nota — pacote qtd 2)
const carla = ids['Carla Mendes Rocha']
const c1 = await appt(carla, pastDate(5, '17:00', 1), 300, 'completed')
const c2 = await appt(carla, pastDate(5, '17:00', 2), 300, 'completed')
console.log('✓ Carla: 2 realizadas')

// Diego (qui=4): 1 realizada, 1 cancelada
const diego = ids['Diego Ferreira Alves']
await appt(diego, pastDate(4, '20:00', 1), 200, 'completed')
await appt(diego, pastDate(4, '20:00', 2), 200, 'cancelled')
console.log('✓ Diego: 1 realizada + 1 cancelada')

// Marcos: 1 avulsa agendada
await appt(ids['Marcos Paulo Ramos'], nextDate(3, '11:00'), 220)
console.log('✓ Marcos: 1 avulsa')

// --- Prontuários nas realizadas ---
await req(`/appointments/${a1}/record`, {
  method: 'PUT',
  body: {
    content: 'Paciente relatou redução dos sintomas ansiosos. Trabalhamos reestruturação cognitiva e exposição gradual.',
    estadoEmocional: 6,
    temas: ['ansiedade', 'trabalho'],
    tarefas: 'Diário de pensamentos automáticos',
  },
})
await req(`/appointments/${a2}/record`, {
  method: 'PUT',
  body: {
    content: 'Revisão do diário. Insight sobre gatilhos no ambiente de trabalho. Próxima sessão: treino de respiração.',
    estadoEmocional: 7,
    temas: ['ansiedade', 'insight'],
  },
})
await req(`/appointments/${c1}/record`, {
  method: 'PUT',
  body: {
    content: 'Sessão de acolhimento inicial. Queixa principal: luto recente.',
    estadoEmocional: 3,
    temas: ['luto'],
    legalHold: false,
  },
})
console.log('✓ 3 prontuários preenchidos')

// --- Fatura a Ana (imediato — sempre pronto) ---
const pend = await req('/billing/pending')
const anaGroup = pend.find((g) => g.nome === 'Ana Beatriz Souza')
if (anaGroup) {
  const inv = await req('/billing/invoice', {
    method: 'POST',
    body: { appointmentIds: anaGroup.sessoes.map((s) => s.id) },
  })
  console.log(`✓ faturado Ana: R$ ${inv.total} (${inv.notas?.length ?? 0} nota(s))`)
}

console.log('\nMassa pronta. Valide em http://localhost:3100 — login:', EMAIL)
