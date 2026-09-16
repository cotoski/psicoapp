# PsicoApp — Rebuild Plan (ordem exata de implementação)

**Status:** aprovado — substitui a abordagem "patch + refatoração incremental" por rebuild estruturado.
**Premissas:** mesmo stack (Node + Postgres + React + Vite), monólito modular, sem microsserviços, sem tecnologia sem necessidade medida.
**Referências:** `docs/product-engineering-assessment.md` (gaps), `PSICOAPP_DEVIN_PRODUCT_ENGINEERING_PLAN.md` (gates), `psicologia_app_visao.md` (produto), `SPEC_FATOR_R.md` (feature), protótipos HTML (referência visual e comportamental).

---

## 0. Decisões arquiteturais (com defaults recomendados)

| # | Decisão | Recomendação | Motivo |
|---|---|---|---|
| D1 | Frontend | **React 18 + TS + Vite** (consolidar; `main.tsx` vanilla vira referência) | Visão §3, SPEC_FATOR_R, elimina XSS por `innerHTML` |
| D2 | Backend | **Node 20 + Express 5 + TypeScript** | Async errors nativos no Express 5; mesma família do protótipo |
| D3 | Migrations/DB | **Drizzle ORM + drizzle-kit** | Tipado, leve, SQL-first; alternativa: node-pg-migrate + pg crua |
| D4 | Validação | **zod** (schemas compartilháveis c/ frontend) | Contrato único API↔formulários |
| D5 | Auth | **Access JWT 15min + refresh token httpOnly cookie (rotação + revogação em DB)** | localStorage+JWT sem expiração é o problema atual; cookie httpOnly elimina roubo por XSS |
| D6 | Tenant | **`tenants` table; 1 usuário : 1 tenant hoje; schema pronto p/ organizações** | Barato agora, caro depois; UX não muda |
| D7 | Criptografia clínica | **AES-256-GCM app-level** para `anamnese` e conteúdo de prontuário; chave via env/Secrets Manager | LGPD; nome/CPF ficam em claro (busca) — RDS cobre disco; documentar trade-off |
| D8 | Logs | **pino** (JSON), request-id em todo log | Padrão Node, barato |
| D9 | Senha | bcrypt custo 12 (ou argon2id) | OWASP; bcryptjs já conhecido |
| D10 | Legacy | **mover para `legacy/`** (compose continua rodando o protótipo p/ referência); `git tag archive/prototype` | Protótipo segue executável sem confundir estrutura nova |
| D11 | CSS | **tokens CSS (`var(--*)`) do protótipo HTML** + CSS por componente | Convenção já exigida pela SPEC_FATOR_R |
| D12 | Agenda × Prontuário | **`appointments` (agenda) separado de `session_records` (prontuário criptografado, auditado)** | Retenção CFP (5 anos) aplica-se ao prontuário, não à agenda |

Regra: se uma decisão aqui for contestada, contestar **antes** da TASK-003 (schema). Depois disso, mudança vira ADR.

---

## 1. Preservação — spec de comportamento (antes de deletar/portar)

TASK-000 produz `docs/behavior-spec.md` extraindo do código legado (sem copiar implementação):

1. **Recorrência** (`gerarSessoesRecorrentes`): semanal=+7d, quinzenal=+14d, mensal=mesmo dia-da-semana do mês seguinte; gera de `max(hoje, início)` até `data_reajuste`; idempotente via `UNIQUE(patient_id, data_hora)`; duração 50min; status `agendada`.
2. **Edição de paciente**: ao mudar dias/horário, apaga sessões futuras `agendada` **não faturadas e sem notas** e regenera — preserva sessões já trabalhadas.
3. **Ciclo de reajuste**: `data_reajuste` default = hoje + `meses_ciclo` (default 6); `/renovar` = data_anterior + meses_ciclo e gera o próximo ciclo.
4. **Notas/faturamento**: agrupa sessões `faturada=false`, `status<>cancelada`, mês corrente; `pronto` = `imediato` ou `pendente >= qtd_sessoes_nota`; faturar marca `faturada=true`.
5. **qtd_sessoes_nota derivada**: mensal=1, quinzenal=2, semanal=4×dias.
6. **Tributário**: tabela de alíquotas do `main.tsx` (ISS por município, PF/Simples/Presumido) + regras Fator R da SPEC.

Cada item vira **teste de especificação** no código novo (recurrence e billing têm suíte própria).

---

## 2. Estrutura alvo

```
psicoapp/
├── legacy/                    # protótipo arquivado (referência executável)
├── docs/                      # assessment, planos, ADRs, behavior-spec
├── backend/
│   ├── src/
│   │   ├── server.ts          # bootstrap apenas
│   │   ├── app.ts             # express app, middlewares, rotas
│   │   ├── config.ts          # env validado com zod (falha rápido)
│   │   ├── db/                # drizzle client + schema.ts
│   │   │   └── migrations/
│   │   ├── modules/
│   │   │   ├── identity/      # routes.ts, service.ts, repo.ts, *.test.ts
│   │   │   ├── tenants/
│   │   │   ├── patients/
│   │   │   ├── appointments/  # inclui recurrence.ts (função pura)
│   │   │   ├── records/       # prontuário (criptografado)
│   │   │   ├── financial/     # inclui billing.ts (função pura)
│   │   │   ├── tax/           # inclui taxCalculations.ts (função pura)
│   │   │   └── audit/
│   │   └── shared/
│   │       ├── middleware/    # auth, tenant, errors, requestId, rateLimit
│   │       ├── crypto/        # fieldEncrypt.ts (AES-256-GCM)
│   │       └── errors.ts      # AppError + formato {error:{code,message,requestId}}
│   ├── tests/                 # helpers: createTenant, createUser, authHeader
│   └── package.json
├── frontend/
│   └── src/
│       ├── api/client.ts      # fetch wrapper: refresh automático, erro padrão
│       ├── auth/AuthContext.tsx
│       ├── pages/             # Login, Dashboard, Patients, Agenda,
│       │                      # Session, Finance, Tax
│       ├── components/
│       │   ├── ui/            # Card, Button, Input, Badge, Table, Modal
│       │   └── tributary/FatorRCalculator.tsx
│       ├── styles/tokens.css  # vars do protótipo
│       └── utils/             # fmtMoney (Intl BRL), dates
├── .github/workflows/ci.yml
├── .env.example
├── .gitignore
├── docker-compose.yml         # DEV apenas: db + mailhog
└── README.md
```

---

## 3. Modelo de dados v1

```sql
tenants         (id uuid pk, name text, created_at)
users           (id uuid pk, tenant_id fk, email citext unique,
                 password_hash, nome, crp, role default 'OWNER',
                 totp_secret null, created_at, updated_at)
refresh_tokens  (id uuid pk, user_id fk, token_hash, expires_at,
                 revoked_at null, created_at, ip, user_agent)

patients        (id uuid pk, tenant_id fk, nome text, cpf, telefone, email,
                 data_nascimento date, anamnese_enc bytea,   -- AES-256-GCM
                 valor numeric(10,2), tipo_faturamento, qtd_sessoes_nota,
                 dias_semana text[], horario time, frequencia_recorrencia,
                 data_reajuste date, meses_ciclo int, sala_reuniao,
                 archived_at null, deleted_at null, created_at, updated_at)
                 index (tenant_id, nome), (tenant_id, data_reajuste)

appointments    (id uuid pk, tenant_id fk, patient_id fk,
                 starts_at timestamptz, duracao int default 50,
                 status check in ('scheduled','completed','cancelled',
                                  'rescheduled','no_show'),
                 valor numeric(10,2), pago_em timestamptz, faturada bool,
                 deleted_at null, created_at)
                 unique (patient_id, starts_at)  -- idempotência recorrência
                 index (tenant_id, starts_at)

session_records (id uuid pk, tenant_id fk, appointment_id fk unique,
                 patient_id fk, content_enc bytea,          -- AES-256-GCM
                 estado_emocional int, temas text[], tarefas text,
                 legal_hold bool default false,
                 created_at, updated_at, deleted_at null)

tax_config      (tenant_id pk fk, regime, municipio,
                 faturamento_anual, folha_pagamento_anual,
                 prolabore_anual numeric(12,2), updated_at)

audit_events    (id uuid pk, tenant_id, actor_user_id, action,
                 resource_type, resource_id, ip, request_id,
                 result, created_at)
                 -- NUNCA conteúdo clínico aqui
```

Notas:
- `deleted_at` em tudo que é clínico (soft delete); `legal_hold` impede purge antes dos 5 anos CFP.
- Todo `SELECT` passa por repo que injeta `tenant_id` — validado por teste.
- Sem `init.sql` como fonte de verdade: `drizzle-kit migrate` é o mecanismo.

---

## 4. API v1 (contrato mínimo)

```
POST /api/v1/auth/register          POST /api/v1/auth/login
POST /api/v1/auth/refresh           POST /api/v1/auth/logout
GET  /api/v1/auth/me

GET  /api/v1/patients?query=&page=&limit=     (paginado, busca por nome)
POST /api/v1/patients
GET|PUT /api/v1/patients/:id
POST /api/v1/patients/:id/archive
POST /api/v1/patients/:id/renovar             (ciclo de reajuste)

GET  /api/v1/appointments?from=&to=&patient_id=
POST /api/v1/appointments
PUT  /api/v1/appointments/:id                 (transições de status válidas)
DELETE /api/v1/appointments/:id

GET|PUT /api/v1/appointments/:id/record       (prontuário; audit SESSION_VIEWED)

GET  /api/v1/billing/pending                  (port de /notas/pendentes)
POST /api/v1/billing/invoice                  (marca faturada; retorna total)
GET  /api/v1/finance/summary?month=

GET|PUT /api/v1/tax/config
POST /api/v1/tax/fator-r                      (cálculo sob demanda)

GET  /api/v1/dashboard
GET  /health/live  /health/ready  /metrics
```

Erros sempre `{ "error": { "code", "message", "requestId" } }`. Nunca stack trace.

---

## 5. Ordem de implementação — tasks

Cada task termina com: testes verdes + lint + commit. Ordem é **sequencial**; não pular.

### Fase A — Fundação (MVP 0)

| Task | Entrega | Critério de saída |
|---|---|---|
| **T-001** Hygiene + legacy | `.gitignore`, `.env.example`, lockfiles, README, `legacy/` movido, `git tag archive/prototype`, compose dev (só db + mailhog) | `git ls-files` sem secrets; protótipo roda de `legacy/` |
| **T-002** Backend skeleton | Express5+TS, config via zod (falha sem env), pino, request-id, helmet, CORS allowlist, error handler, `/health/live` `/health/ready` | Sobe sem `.env`? **Falha** (correto). Com env: health 200 |
| **T-003** Schema + migrations | Drizzle, tabelas §3, migration 0001, seed dev | `migrate` em banco limpo; constraints testadas |
| **T-004** Identity | register/login/refresh/logout/me; bcrypt12; JWT 15min; refresh httpOnly com rotação+revogação; rate limit login (5/15min IP); audit LOGIN_* | Teste: brute-force → 429; refresh reusado → revoga cadeia |
| **T-005** Tenancy + authz | middleware `requireAuth`+`tenantContext`; role `OWNER`; helper de teste `asTenantA/B` | Teste canônico: A lê A ✅, A lê B ❌ em todo repo |
| **T-006** Patients | CRUD+arquivar+busca+paginação; zod schemas; `anamnese_enc` via fieldEncrypt; audit PATIENT_*; soft delete | Testes: IDOR, validação, paginação, audit emitido |
| **T-007** Appointments + recurrence | `recurrence.ts` função pura portada da spec §1; CRUD; status machine; regeneração na edição (transação) | Suíte de recorrência cobre os 6 comportamentos da spec |
| **T-008** Session records | `session_records` criptografado; `SESSION_VIEWED` em audit; legal_hold | Conteúdo no banco é ciphertext; audit sem conteúdo |
| **T-009** Financial + billing | `billing.ts` puro (agrupamento/pronto), endpoints, resumo mensal | Paridade com comportamento legado (spec §1.4) |
| **T-010** Tax + Fator R | `taxCalculations.ts` + testes da SPEC §7; `tax_config` persistida | 6 testes da SPEC passam |
| **T-011** CI | GitHub Actions: install→lint→typecheck→test→build→gitleaks→npm audit→semgrep | Pipeline verde; PR bloqueado em falha |
| **T-012** Observability baseline | `/metrics` (prom-client): http_duration, 5xx, auth_failures, permission_denied; doc `observability.md` | Métricas visíveis após requests de teste |

**Gate MVP 0** = checklist §21 do plano-mãe + "teste tenant A/B em CI" + "app não sobe sem secrets".

### Fase B — Produto core (MVP 1)

| Task | Entrega |
|---|---|
| **T-013** Frontend foundation | Scaffold React+Vite, `tokens.css` do protótipo, `api/client.ts` c/ refresh, AuthContext, router, `ui/` kit |
| **T-014** Login + Dashboard | Páginas reais contra API |
| **T-015** Patients page | Lista paginada, busca, form completo (recorrência, reajuste), detalhe c/ histórico |
| **T-016** Agenda page | Mês/semana/dia (port do `agenda_mes_semana_dia.html`), criar/remarcar/cancelar |
| **T-017** Session record page | Abrir atendimento → evolução, temas, tarefas, estado emocional |
| **T-018** Finance page | Pendências, faturar, resumo mensal |
| **T-019** Tax page | `FatorRCalculator` + calculadora por sessão (SPEC adaptada à stack real — atualizar SPEC_FATOR_R §5/§11) |
| **T-020** E2E | Playwright: login→criar paciente→agendar→registrar→faturar |

**Gate 1 — Clinical Safety** = §23 do plano-mãe + teste manual OWASP top-5 + **restore test real** + retenção CFP implementada (nenhum purge de prontuário <5 anos) + SPEC_FATOR_R atualizada.

### Fase C — Piloto (MVP 2)

Documentos (S3 + pre-signed URL), recibos PDF, relatórios, 2FA, backup automatizado + restore, LGPD artifacts (política, TCLE, exportação, retenção), deploy staging→pilot na AWS (Fargate ou Lightsail + RDS + S3 + Secrets Manager + CloudWatch + Budgets ~US$30–80/mês).

**Gate 2 — Production Readiness** = §25 do plano-mãe. Saída: 3–5 psicólogos piloto.

### Fase D — Escala (MVP 3+)
Somente com evidência: filas (email/PDF), cache, portal do paciente, pagamentos. Conforme plano §26–§28.

---

## 6. O que NÃO portar do legado

- `App.tsx` órfão — deletar (substituído pelo frontend novo).
- `ensureDemoUser` — substituído por seed explícito só em dev (`NODE_ENV=development` + flag).
- Token em `localStorage`, credenciais demo na tela, `alert()`/`confirm()` de UX.
- `docker-compose` com secrets inline e Postgres exposto.
- Qualquer `innerHTML` — em React só via sanitização (e não haverá necessidade).

## 7. Riscos do rebuild e mitigação

| Risco | Mitigação |
|---|---|
| Perda silenciosa de comportamento | `docs/behavior-spec.md` + testes de especificação (T-001 antes de qualquer port) |
| Scope creep ("já que reescreve…") | Stack travada em §0; qualquer adição exige ADR |
| Rewrite sem fim | Gates por fase; protótipo legado continua utilizável até Gate 1 |
| Over-engineering | Proibido: filas, Redis, EKS, microsserviços antes de métrica que justifique |

## 8. Próxima ação

Confirmar D3/D6/D10 (ou aceitar defaults) → executar **T-001**.
