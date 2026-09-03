CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  nome VARCHAR(255) NOT NULL,
  crp VARCHAR(20),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS patients (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  nome VARCHAR(255) NOT NULL,
  cpf VARCHAR(20),
  telefone VARCHAR(50),
  email VARCHAR(255),
  data_nascimento DATE,
  anamnese TEXT,
  valor NUMERIC(10,2) DEFAULT 0,
  tipo_faturamento VARCHAR(20) DEFAULT 'imediato',
  qtd_sessoes_nota INTEGER DEFAULT 1,
  dia_semana VARCHAR(20),
  horario TIME,
  qtd_repeticoes INTEGER DEFAULT 0,
  data_reajuste DATE,
  meses_ciclo INTEGER DEFAULT 6,
  sala_reuniao TEXT,
  dias_semana TEXT[],
  frequencia_recorrencia VARCHAR(20) DEFAULT 'semanal',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER REFERENCES patients(id),
  data_hora TIMESTAMP NOT NULL,
  duracao INTEGER DEFAULT 50,
  status VARCHAR(50) DEFAULT 'agendada',
  valor NUMERIC(10,2) DEFAULT 0,
  pago_em TIMESTAMP,
  faturada BOOLEAN DEFAULT FALSE,
  notas TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_patient_datahora ON sessions(patient_id, data_hora);

CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  patient_id INTEGER,
  acao VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO users (email, password_hash, nome, crp)
VALUES ('demo@psicoapp.local', '$2b$10$hashed.demo.password.not.used', 'Dra. Ana Demo', '06/12345')
ON CONFLICT (email) DO NOTHING;
