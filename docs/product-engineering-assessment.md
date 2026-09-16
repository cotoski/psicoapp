# PsicoApp — Product Engineering Assessment (TASK-000)

**Data:** 2026-09-16
**Base:** commit `4a77945` (único commit) + alterações não commitadas no working tree
**Referência:** `PSICOAPP_DEVIN_PRODUCT_ENGINEERING_PLAN.md` §41

---

## 1. Current State

### 1.1 Inventário real do repositório

| Componente | Stack real | Estado |
|---|---|---|
| Backend | Node 18 + Express 4, `pg` (SQL crua), JWT, bcryptjs | 1 arquivo, 363 linhas (`backend/src/index.js`) |
| Frontend **real** | Vite + TypeScript **vanilla** (DOM direto) | `index.html` (572 linhas) + `src/main.tsx` (1684 linhas, 33 usos de `innerHTML`) |
| Frontend **órfão** | React 18 + TS (`src/App.tsx`, 264 linhas) | **Não é montado** — `index.html` carrega `main.tsx`. Código morto. |
| Banco | PostgreSQL 15 via `init.sql` | 4 tabelas: `users`, `patients`, `sessions`, `audit_logs` |
| Infra | docker-compose (db + backend + frontend) | Secrets commitados; Postgres exposto na 5432 |
| Protótipos HTML | 3 arquivos standalone | Referência de UX (agenda, tributário, full) |
| Docs | visão de produto, plano de engenharia, SPEC Fator R | Plano completo; spec com mismatch de stack |
| Testes | **nenhum** | — |
| CI/CD | **nenhum** | Sem `.github/`, sem pipeline |
| Tooling | sem `.gitignore`, sem lockfiles, sem `.env.example`, sem README, sem lint | Builds não reproduzíveis (`npm install` sem lock) |

### 1.2 APIs existentes

```
POST /auth/login            GET  /auth/me
GET|POST /patients          GET|PUT|DELETE /patients/:id
POST /patients/:id/renovar
GET|POST /sessions          PUT|DELETE /sessions/:id
GET  /notas/pendentes       POST /notas
GET  /dashboard
```

Autenticação: JWT sem expiração. Autorização: apenas `user_id` implícito — **não há tenant nem RBAC**.

### 1.3 Funcionalidades implementadas (protótipo funcional)

- Login, CRUD de pacientes, CRUD de sessões
- Geração de sessões recorrentes (semanal/quinzenal/mensal) até `data_reajuste`
- Ciclo de reajuste por paciente (`meses_ciclo`, `data_reajuste`, `/renovar`)
- Faturamento agrupado ("notas") por paciente/mês
- Dashboard com KPIs básicos
- Calculadora tributária (PF/Simples/Presumido) no frontend vanilla
- Gestão de laudos parcial (UI)

---

## 2. Achados críticos de segurança (corrigir antes de qualquer outra coisa)

Estes são bugs exploráveis hoje, com o protótipo rodando:

| # | Severidade | Achado | Local |
|---|---|---|---|
| S1 | **Crítica** | **SQL Injection** em `POST /notas`: `session_ids.join(',')` interpolado em `IN (${ids})` | `backend/src/index.js` ~L325 |
| S2 | **Crítica** | **IDOR em sessões**: `PUT/DELETE /sessions/:id` não verificam dono; `POST /sessions` aceita `patient_id` de outro usuário → um psicólogo lê/altera/apaga sessões de pacientes de outro | `index.js` L259–280 |
| S3 | **Alta** | `JWT_SECRET` com fallback `'prototype-secret'` no código **e** commitado no `docker-compose.yml` | `index.js` L12, `docker-compose.yml` L23 |
| S4 | **Alta** | Credenciais de banco `psico:psico123` commitadas (compose + fallback em `db.js`) | `docker-compose.yml`, `db.js` L7 |
| S5 | **Alta** | Usuário demo `demo@psicoapp.local`/`123456` criado automaticamente a cada boot, com reset de senha — backdoor permanente | `index.js` L27–39 |
| S6 | **Alta** | **JWT sem expiração** (`jwt.sign` sem `expiresIn`), sem revogação, sem refresh | `index.js` L154 |
| S7 | **Alta** | **Stored XSS**: 33 escritas `innerHTML` em `main.tsx` renderizando dados de pacientes; combinado com token em `localStorage` = roubo de sessão | `frontend/src/main.tsx` |
| S8 | Média | CORS aberto (`cors()` sem config), sem rate limiting, sem helmet/security headers, sem validação de entrada | `index.js` L9–10 |
| S9 | Média | bcrypt com custo 8 (baixo); sem proteção contra brute force no login | `index.js` L30, L148–156 |
| S10 | Média | Handlers async sem tratamento de erro — Express 4 não captura; exceção = request pendurado | todo `index.js` |
| S11 | Média | Dados clínicos (`anamnese`, `notas`) em texto puro; visão exige criptografia em repouso | `init.sql` |
| S12 | Média | `DELETE /patients/:id` apaga sessões **antes** de verificar posse; hard delete sem soft-delete nem trilha | `index.js` L245–249 |
| S13 | Baixa | Postgres exposto na porta 5432 do host; frontend servido via `vite dev` em container (não é build de produção) | `docker-compose.yml`, `frontend/Dockerfile` |

**Regra resultante:** nenhum dado real de paciente pode entrar neste sistema até S1–S7 estarem corrigidos e testados.

---

## 3. Mismatch de stack (decisão arquitetural pendente)

Existem **duas implementações de frontend** e a spec mais recente assume uma terceira:

- Real: vanilla TS (`main.tsx`), sem componentes, sem roteamento, com `innerHTML`.
- Órfão: React (`App.tsx`), não referenciado.
- `SPEC_FATOR_R.md` pressupõe `src/pages/TributaryCalculator.tsx`, `src/components/tributary/`, `utils/taxCalculations.ts` e tabela `tax_config` — **nada disso existe**. A spec foi escrita contra uma estrutura React que o repo não tem.

**Recomendação:** consolidar em **React** (alinhado à visão §3, à SPEC_FATOR_R e elimina a classe inteira de XSS por `innerHTML` via escaping). O port é ~1700 linhas de lógica DOM — viável dentro do MVP 0/1. Alternativa: manter vanilla e introduzir sanitização (DOMPurify) + CSP — mais barato agora, mais caro depois.

---

## 4. Gap Analysis — Current vs Target (plano §4–§18)

| Domínio | Target (plano) | Atual | Gap |
|---|---|---|---|
| Arquitetura | Modular monolith por domínio | Arquivo único | Total |
| Multi-tenancy | `tenant_id` + isolamento em 3 níveis | `user_id` implícito, sem testes | Total |
| RBAC | OWNER/ADMIN/PSYCHOLOGIST/ASSISTANT | Inexistente | Total |
| Auth | JWT+expiração+refresh+2FA-ready+rate limit | JWT sem expiração | Alto |
| Secrets | `.env.example` + secret manager | Secrets no git | Total |
| DB | Migrations versionadas | `init.sql` apenas | Total |
| Validação | Schema validation em todo endpoint | Nenhuma | Total |
| Criptografia | Estratégia em repouso p/ dados clínicos | Texto puro | Total |
| Audit | Eventos estruturados sem conteúdo clínico | 1 evento ("listou pacientes") | Alto |
| Observabilidade | Logs JSON + métricas + traces + health | `console.log` | Total |
| Performance | p95 <500ms, paginação | Sem paginação em nenhuma lista | Alto |
| Escalabilidade | Stateless, multi-instância | Stateless ok (JWT), mas S2 impede multi-tenant real | Parcial |
| CI/CD | Pipeline com gates | Inexistente | Total |
| FinOps | Tags, budget alerts, custo/tenant | Nada | Total |
| Docs | `docs/` completo + ADRs | Só visão/plano/spec | Parcial |

---

## 5. Riscos

### Arquitetura
- **A1** Dual frontend não resolvido vai corromper toda spec futura (já aconteceu com Fator R).
- **A2** Modelo de tenant: decidir agora se `tenant` = usuário individual ou organização. Introduzir tabela `tenants` agora custa pouco; migrar depois custa caro.
- **A3** Recorrência de sessões gera rows até `data_reajuste` em loop síncrono na request — não escala e não tem transação.

### Segurança
- **S1–S13** acima. O sistema hoje não pode receber dado real sob hipótese nenhuma.

### Produto / Compliance
- **P1 — Conflito LGPD × CFP:** a visão propõe "direito ao esquecimento com purge após 90 dias". **Prontuário psicológico tem retenção mínima obrigatória de 5 anos (Resoluções CFP 01/2009 e 06/2019).** A exclusão deve aplicar-se a dados cadastrais, nunca ao prontuário dentro do prazo legal — implementar *legal hold* e retenção diferenciada por classe de dado. Validar com jurídico.
- **P2** Sigilo profissional: suporte/admin não pode ver conteúdo clínico (plano já prevê — manter como invariante testável).
- **P3** Funcionalidade tributária é estimativa — disclaimers obrigatórios já previstos na SPEC; manter.
- **P4** Sem backup/restore configurado — dados clínicos sem proteção de continuidade.

### Dívida técnica
- Sem testes, sem lockfiles, sem `.gitignore`, sem lint, sem README, `App.tsx` morto, `docker-compose` com `version:` obsoleto e volumes de dev em containers, `ensureDemoUser` em produção.

---

## 6. Priorização (revisão do plano existente)

O plano §39 (P0–P3) está correto na essência. Ajustes recomendados:

**P0-emergencial (antes de MVP 0):** S1 (SQLi), S2 (IDOR), S3–S5 (secrets/demo user), S6 (JWT expiração). São ~2 dias de correção cirúrgica, não refatoração.

**P0:** restante do MVP 0 conforme plano, + decisão de stack frontend + `tenants`.

**P1:** tudo conforme plano.

**Atenção — o MVP 0 do plano está grande demais como bloco único.** Sugestão de fatiamento abaixo.

---

## 7. Recommended Sequence — MVPs e Gates refinados

### MVP -1 — Emergency Security Patch (novo, ~dias)
Corrigir S1–S6 no código atual, sem redesign: parametrizar `POST /notas`, adicionar `WHERE user_id` em sessões via join com patients, remover fallbacks de secret, exigir `JWT_SECRET`/`DATABASE_URL` via env, `expiresIn: '8h'`, flag `DEMO_SEED=false` em produção, `.env.example`, `.gitignore`, lockfiles.
**Gate -1:** exploit manual de S1/S2 falha; app não sobe sem secrets.

### MVP 0 — Foundation
1. **0a. Higiene:** `.gitignore`, lockfiles, `npm ci`, lint+typecheck, README, remover `App.tsx` morto **ou** decidir port React (decisão A1 — recomendo React).
2. **0b. Estrutura backend:** módulos por domínio, error handler, validação (zod), helmet, CORS restrito, rate limit login.
3. **0c. Dados:** migrations (node-pg-migrate ou drizzle-kit), `tenants` + `tenant_id` nas tabelas, constraints, soft delete, índices por tenant.
4. **0d. Plataforma:** logs JSON (pino), `/health/live|ready`, request-id, testes (vitest + supertest) incl. **teste de isolamento de tenant**, CI (GitHub Actions: lint→typecheck→test→build→secret scan→dep scan).

**Gate MVP 0** (plano §21 + adições): build reproduzível · CI verde · zero secrets no git · migrations · health checks · teste tenant A/B passa · ADRs 0001–0003 · threat model inicial.

### MVP 1 — Core Product (ciclo do atendimento)
Pacientes (CRUD+arquivar+busca+paginação) → Agenda/Agendamento (status machine) → Sessão (evolução, notas protegidas+audit) → Financeiro básico → **módulo tributário + Fator R** (SPEC existente, reescrita p/ stack real) → port React completo das telas do `main.tsx`.

**Gate 1 — Clinical Safety** (plano §23): + pentest básico/manual dos 5 itens OWASP top + restore test real + retenção CFP implementada (P1).

### MVP 2 — Consultório
Recorrência robusta (job, não request), documentos via object storage + pre-signed URL, relatórios, recibos PDF, 2FA ativável, backup automatizado, LGPD artifacts (política, TCLE, exportação de dados, legal hold).

**Gate 2 — Production Readiness** (plano §25): + SLO, alertas, runbook, load test, DR, custo/tenant medido. **Abre piloto com 3–5 psicólogos.**

### MVP 3+ — Scale/Platform/AI
Conforme plano §26–§28. Nada antes de evidência.

### Infra alvo pragmática (revisão de §34)
Piloto: 1 container (ECS Fargate ou até Lightsail/Fly.io) + RDS Postgres pequeno + S3 + Secrets Manager + CloudWatch + Budgets. **Estimativa piloto: US$ 30–80/mês.** EKS explicitamente fora. Decidir compute só com dados do piloto.

---

## 8. Decisões que precisam do dono do produto

1. **Stack frontend:** consolidar React (recomendado) vs manter vanilla + sanitização.
2. **Tenant:** psicólogo individual apenas, ou organizações/clínicas desde o modelo?
3. **Deploy alvo:** AWS conforme plano, ou plataforma mais simples no piloto?
4. **Conformidade:** quem valida LGPD/CFP (jurídico/DPO) antes do piloto com dados reais?

---

## 9. Próxima ação

Aprovado este assessment → **TASK-001: MVP -1 (emergency patch)** → MVP 0 sequencial conforme §7.
