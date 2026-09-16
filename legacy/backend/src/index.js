require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('./db');

const app = express();
app.use(cors());
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'prototype-secret';

async function waitForDb(retries = 30) {
  for (let i = 0; i < retries; i++) {
    try {
      await query('SELECT 1');
      return;
    } catch {
      console.log('Aguardando banco de dados...');
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  throw new Error('Banco de dados indisponível');
}

async function ensureDemoUser() {
  const { rows } = await query('SELECT id FROM users WHERE email = $1', ['demo@psicoapp.local']);
  if (rows.length === 0) {
    const hash = bcrypt.hashSync('123456', 8);
    await query(
      'INSERT INTO users (email, password_hash, nome, crp) VALUES ($1, $2, $3, $4)',
      ['demo@psicoapp.local', hash, 'Dra. Ana Demo', '06/12345']
    );
  } else {
    const hash = bcrypt.hashSync('123456', 8);
    await query('UPDATE users SET password_hash = $1 WHERE email = $2', [hash, 'demo@psicoapp.local']);
  }
}

function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: 'Token ausente' });
  const token = header.replace('Bearer ', '');
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido' });
  }
}

const DIAS = { domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6 };

function diaToNumero(dia) {
  return DIAS[(dia || '').toLowerCase()] ?? -1;
}

function toISODate(d) {
  if (!d) return null;
  if (typeof d === 'string') return d.slice(0, 10);
  if (d instanceof Date) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  return null;
}

function todayISO() {
  return toISODate(new Date());
}

function addMonths(iso, months) {
  const [y, m, d] = iso.split('-').map(Number);
  const nd = new Date(y, m - 1 + months, d);
  const yy = nd.getFullYear();
  const mm = String(nd.getMonth() + 1).padStart(2, '0');
  const dd = String(nd.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function formatPatient(p) {
  if (!p) return p;
  if (p.data_reajuste && typeof p.data_reajuste !== 'string') {
    p.data_reajuste = toISODate(p.data_reajuste);
  }
  if (p.data_nascimento && typeof p.data_nascimento !== 'string') {
    p.data_nascimento = toISODate(p.data_nascimento);
  }
  if (p.horario && typeof p.horario === 'string' && p.horario.length > 5) {
    p.horario = p.horario.slice(0, 5);
  }
  return p;
}

async function gerarSessoesRecorrentes(patient, dataInicio, dataFim) {
  if (!patient.horario || !dataInicio || !dataFim) return;
  const [h, m] = patient.horario.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return;

  const dias = (patient.dias_semana && patient.dias_semana.length > 0)
    ? patient.dias_semana
    : (patient.dia_semana ? [patient.dia_semana] : []);
  if (dias.length === 0) return;

  const freq = (patient.frequencia_recorrencia || 'semanal').toLowerCase();

  const hoje = todayISO();
  const start = dataInicio < hoje ? hoje : dataInicio;
  if (start > dataFim) return;

  for (const dia of dias) {
    const target = diaToNumero(dia);
    if (target < 0) continue;

    let d = new Date(`${start}T00:00:00`);
    let daysToAdd = (target - d.getDay() + 7) % 7;
    d.setDate(d.getDate() + daysToAdd);

    while (toISODate(d) < start) {
      d.setDate(d.getDate() + 7);
    }

    while (toISODate(d) <= dataFim) {
      const dataHora = `${toISODate(d)}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
      await query(
        `INSERT INTO sessions (patient_id, data_hora, duracao, status, valor, faturada, notas)
         VALUES ($1, $2, 50, 'agendada', $3, false, '')
         ON CONFLICT (patient_id, data_hora) DO NOTHING`,
        [patient.id, dataHora, patient.valor || 0]
      );

      if (freq === 'mensal') {
        d = new Date(d.getFullYear(), d.getMonth() + 1, 1);
        const add = (target - d.getDay() + 7) % 7;
        d.setDate(d.getDate() + add);
      } else if (freq === 'quinzenal') {
        d.setDate(d.getDate() + 14);
      } else {
        d.setDate(d.getDate() + 7);
      }
    }
  }
}

app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const { rows } = await query('SELECT * FROM users WHERE email = $1', [email]);
  if (rows.length === 0) return res.status(401).json({ error: 'Credenciais inválidas' });
  const user = rows[0];
  if (!bcrypt.compareSync(password, user.password_hash)) return res.status(401).json({ error: 'Credenciais inválidas' });
  const token = jwt.sign({ id: user.id, email: user.email, nome: user.nome }, JWT_SECRET);
  res.json({ token, user: { id: user.id, email: user.email, nome: user.nome, crp: user.crp } });
});

app.get('/auth/me', auth, async (req, res) => {
  const { rows } = await query('SELECT id, email, nome, crp FROM users WHERE id = $1', [req.user.id]);
  res.json(rows[0]);
});

app.get('/patients', auth, async (req, res) => {
  const { rows } = await query('SELECT * FROM patients WHERE user_id = $1 ORDER BY nome', [req.user.id]);
  await query('INSERT INTO audit_logs (user_id, acao) VALUES ($1, $2)', [req.user.id, 'listou pacientes']);
  res.json(rows.map(formatPatient));
});

app.post('/patients', auth, async (req, res) => {
  const { nome, cpf, telefone, email, data_nascimento, anamnese, valor, tipo_faturamento, qtd_sessoes_nota, dia_semana, horario, qtd_repeticoes, data_reajuste, meses_ciclo, sala_reuniao, dias_semana, frequencia_recorrencia } = req.body;
  const meses = Number(meses_ciclo) || 6;
  const reajuste = data_reajuste ? data_reajuste : addMonths(todayISO(), meses);
  const ds = Array.isArray(dias_semana) ? dias_semana : (dias_semana ? [dias_semana] : []);
  const freq = (frequencia_recorrencia || 'semanal').toLowerCase();
  let qtd = 1;
  if (ds.length > 0) {
    if (freq === 'mensal') qtd = 1;
    else if (freq === 'quinzenal') qtd = 2;
    else if (freq === 'semanal') qtd = 4 * ds.length;
  }
  const { rows } = await query(
    'INSERT INTO patients (user_id, nome, cpf, telefone, email, data_nascimento, anamnese, valor, tipo_faturamento, qtd_sessoes_nota, dia_semana, horario, qtd_repeticoes, data_reajuste, meses_ciclo, sala_reuniao, dias_semana, frequencia_recorrencia) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18) RETURNING *',
    [req.user.id, nome, cpf, telefone, email, data_nascimento || null, anamnese, valor || 0, tipo_faturamento || 'imediato', qtd, dia_semana || null, horario || null, Number(qtd_repeticoes) || 0, reajuste, meses, sala_reuniao || null, ds, freq]
  );
  const patient = rows[0];
  if (ds.length > 0 && patient.horario && patient.data_reajuste) {
    await gerarSessoesRecorrentes(patient, todayISO(), patient.data_reajuste);
  }
  res.status(201).json(formatPatient(patient));
});

app.get('/patients/:id', auth, async (req, res) => {
  const { rows } = await query('SELECT * FROM patients WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
  if (rows.length === 0) return res.status(404).json({ error: 'Paciente não encontrado' });
  res.json(formatPatient(rows[0]));
});

app.put('/patients/:id', auth, async (req, res) => {
  const { nome, cpf, telefone, email, data_nascimento, anamnese, valor, tipo_faturamento, qtd_sessoes_nota, dia_semana, horario, qtd_repeticoes, data_reajuste, meses_ciclo, sala_reuniao, dias_semana, frequencia_recorrencia } = req.body;
  const meses = Number(meses_ciclo) || 6;
  const reajuste = data_reajuste ? data_reajuste : addMonths(todayISO(), meses);
  const ds = Array.isArray(dias_semana) ? dias_semana : (dias_semana ? [dias_semana] : []);
  const freq = (frequencia_recorrencia || 'semanal').toLowerCase();
  let qtd = 1;
  if (ds.length > 0) {
    if (freq === 'mensal') qtd = 1;
    else if (freq === 'quinzenal') qtd = 2;
    else if (freq === 'semanal') qtd = 4 * ds.length;
  }
  const { rows } = await query(
    'UPDATE patients SET nome=$1, cpf=$2, telefone=$3, email=$4, data_nascimento=$5, anamnese=$6, valor=$7, tipo_faturamento=$8, qtd_sessoes_nota=$9, dia_semana=$10, horario=$11, qtd_repeticoes=$12, data_reajuste=$13, meses_ciclo=$14, sala_reuniao=$15, dias_semana=$16, frequencia_recorrencia=$17 WHERE id=$18 AND user_id=$19 RETURNING *',
    [nome, cpf, telefone, email, data_nascimento || null, anamnese, valor || 0, tipo_faturamento || 'imediato', qtd, dia_semana || null, horario || null, Number(qtd_repeticoes) || 0, reajuste, meses, sala_reuniao || null, ds, freq, req.params.id, req.user.id]
  );
  const patient = rows[0];
  if (ds.length > 0 && patient.horario && patient.data_reajuste) {
    await query(
      `DELETE FROM sessions
       WHERE patient_id = $1 AND status = 'agendada' AND faturada = false AND notas = '' AND data_hora::date >= $2::date`,
      [req.params.id, todayISO()]
    );
    await gerarSessoesRecorrentes(patient, todayISO(), patient.data_reajuste);
  }
  res.json(formatPatient(patient));
});

app.post('/patients/:id/renovar', auth, async (req, res) => {
  const { rows } = await query('SELECT * FROM patients WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
  if (rows.length === 0) return res.status(404).json({ error: 'Paciente não encontrado' });
  const patient = formatPatient(rows[0]);
  const meses = Number(patient.meses_ciclo) || 6;
  const dataAnterior = patient.data_reajuste || todayISO();
  const novaData = addMonths(dataAnterior, meses);
  const { rows: updated } = await query(
    'UPDATE patients SET data_reajuste = $1 WHERE id = $2 AND user_id = $3 RETURNING *',
    [novaData, req.params.id, req.user.id]
  );
  const updatedPatient = formatPatient(updated[0]);
  const dias = (updatedPatient.dias_semana && updatedPatient.dias_semana.length > 0) ? updatedPatient.dias_semana : (updatedPatient.dia_semana ? [updatedPatient.dia_semana] : []);
  if (dias.length > 0 && updatedPatient.horario) {
    await gerarSessoesRecorrentes(updatedPatient, dataAnterior, novaData);
  }
  res.json(updatedPatient);
});

app.delete('/patients/:id', auth, async (req, res) => {
  await query('DELETE FROM sessions WHERE patient_id = $1', [req.params.id]);
  const { rows } = await query('DELETE FROM patients WHERE id = $1 AND user_id = $2 RETURNING *', [req.params.id, req.user.id]);
  res.json(formatPatient(rows[0]));
});

app.get('/sessions', auth, async (req, res) => {
  const { rows } = await query(
    'SELECT s.*, p.nome as paciente_nome, p.sala_reuniao FROM sessions s JOIN patients p ON p.id = s.patient_id WHERE p.user_id = $1 ORDER BY s.data_hora',
    [req.user.id]
  );
  res.json(rows);
});

app.post('/sessions', auth, async (req, res) => {
  const { patient_id, data_hora, duracao, status, valor, notas } = req.body;
  const { rows } = await query(
    'INSERT INTO sessions (patient_id, data_hora, duracao, status, valor, notas) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
    [patient_id, data_hora, duracao || 50, status || 'agendada', valor || 0, notas]
  );
  res.status(201).json(rows[0]);
});

app.put('/sessions/:id', auth, async (req, res) => {
  const { data_hora, duracao, status, valor, notas, pago_em } = req.body;
  const { rows } = await query(
    'UPDATE sessions SET data_hora=$1, duracao=$2, status=$3, valor=$4, notas=$5, pago_em=$6 WHERE id=$7 RETURNING *',
    [data_hora, duracao, status, valor, notas, pago_em || null, req.params.id]
  );
  res.json(rows[0]);
});

app.delete('/sessions/:id', auth, async (req, res) => {
  const { rows } = await query('DELETE FROM sessions WHERE id = $1 RETURNING *', [req.params.id]);
  res.json(rows[0]);
});

app.get('/notas/pendentes', auth, async (req, res) => {
  const { rows } = await query(
    `SELECT p.id, p.nome, p.tipo_faturamento, p.qtd_sessoes_nota,
            s.id as session_id, s.data_hora, s.status, s.valor, s.faturada
     FROM patients p
     JOIN sessions s ON s.patient_id = p.id
     WHERE p.user_id = $1
       AND s.faturada = false
       AND s.status <> 'cancelada'
       AND s.data_hora >= date_trunc('month', current_date)
       AND s.data_hora < date_trunc('month', current_date) + interval '1 month'
     ORDER BY p.nome, s.data_hora`,
    [req.user.id]
  );

  const grouped = {};
  rows.forEach(r => {
    if (!grouped[r.id]) {
      grouped[r.id] = { id: r.id, nome: r.nome, tipo_faturamento: r.tipo_faturamento, qtd_sessoes_nota: r.qtd_sessoes_nota, sessoes: [] };
    }
    grouped[r.id].sessoes.push({
      id: r.session_id,
      data_hora: r.data_hora,
      status: r.status,
      valor: r.valor,
      faturada: r.faturada
    });
  });

  Object.values(grouped).forEach((g) => {
    g.pendente = g.sessoes.length;
    g.valor_total = g.sessoes.reduce((sum, s) => sum + parseFloat(s.valor || 0), 0);
    g.pronto = g.tipo_faturamento === 'imediato' || g.pendente >= g.qtd_sessoes_nota;
  });

  res.json(Object.values(grouped));
});

app.post('/notas', auth, async (req, res) => {
  const { session_ids } = req.body;
  if (!Array.isArray(session_ids) || session_ids.length === 0) {
    return res.status(400).json({ error: 'Informe as sessões da nota' });
  }
  const ids = session_ids.join(',');
  await query(
    `UPDATE sessions SET faturada = true WHERE id IN (${ids}) AND faturada = false AND patient_id IN (SELECT id FROM patients WHERE user_id = $1)`,
    [req.user.id]
  );
  const { rows } = await query(
    `SELECT s.id, s.data_hora, s.valor, s.status, p.nome as paciente_nome, p.email, p.telefone
     FROM sessions s JOIN patients p ON p.id = s.patient_id
     WHERE s.id = ANY($1::int[]) AND p.user_id = $2`,
    [session_ids, req.user.id]
  );
  res.json({ total: rows.reduce((sum, r) => sum + parseFloat(r.valor || 0), 0), sessoes: rows });
});

app.get('/dashboard', auth, async (req, res) => {
  const userId = req.user.id;
  const [patients, sessions, finance] = await Promise.all([
    query('SELECT COUNT(*) as total FROM patients WHERE user_id = $1', [userId]),
    query("SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE s.status = 'realizada') as realizadas FROM sessions s JOIN patients p ON p.id = s.patient_id WHERE p.user_id = $1", [userId]),
    query("SELECT COALESCE(SUM(s.valor),0) as faturamento FROM sessions s JOIN patients p ON p.id = s.patient_id WHERE p.user_id = $1 AND s.status = 'realizada'", [userId])
  ]);
  res.json({
    pacientes: parseInt(patients.rows[0].total, 10),
    sessoesTotal: parseInt(sessions.rows[0].total, 10),
    sessoesRealizadas: parseInt(sessions.rows[0].realizadas, 10),
    faturamento: parseFloat(finance.rows[0].faturamento)
  });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, async () => {
  try {
    await waitForDb();
    await ensureDemoUser();
    console.log(`Backend pronto na porta ${PORT}`);
  } catch (err) {
    console.error('Erro ao preparar usuário demo:', err);
  }
});
