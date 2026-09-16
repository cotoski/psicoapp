# ADR 0001 — Greenfield rebuild (substituir "patch incremental")

**Status:** Aceito — 2026-09-16
**Contexto:** `docs/product-engineering-assessment.md` · `docs/rebuild-plan.md` §0 (D1–D12)

## Contexto

O protótipo (~2.600 linhas: backend Express de arquivo único + frontend vanilla TS) possui
vulnerabilidades exploráveis (SQL injection, IDOR, JWT sem expiração, secrets no git) e
diverge da arquitetura-alvo em todos os eixos: frontend React, backend modular por domínio,
multi-tenancy, migrations, validação, audit e observabilidade.

## Decisão

Reescrever `backend/` e `frontend/` do zero, mantendo:

- o protótipo arquivado em `legacy/` (tag `archive/prototype`) como referência executável;
- o conhecimento de domínio em `docs/behavior-spec.md`, portado via testes de especificação;
- a mesma stack (Node + Postgres + React + Vite) — sem upgrade de plataforma.

## Alternativas consideradas

1. **Patch emergencial + refatoração incremental** (plano original §7 MVP -1).
   Rejeitada: pagaríamos o custo de corrigir código que diverge estruturalmente do alvo e
   depois reescrevê-lo. Em ~360 linhas de backend, "corrigir" ≈ reescrever.
2. **Rewrite com stack maior** (NestJS, ORM pesado, microsserviços).
   Rejeitada: viola o princípio do plano-mãe de "menor produto seguro possível".

## Consequências

- MVP -1 (patch) eliminado; MVP 0 passa a ser fundação greenfield.
- Risco de perda silenciosa de comportamento → mitigado por `behavior-spec.md` + testes.
- Protótipo legado segue executável para demonstração até o Gate 1.
- Vulnerabilidades do legado permanecem documentadas; `legacy/` jamais recebe dados reais.

## Decisões derivadas (aprovadas em 2026-09-16)

| ID | Decisão |
|---|---|
| D1 | Frontend consolidado em React 18 + TS + Vite |
| D2 | Backend Node 20 + Express 5 + TypeScript |
| D3 | Drizzle ORM + drizzle-kit (migrations) |
| D5 | Access JWT 15min + refresh httpOnly com rotação/revogação |
| D6 | `tenants` 1:1 com usuário; schema pronto p/ organizações |
| D7 | AES-256-GCM app-level para `anamnese` e prontuário |
| D12 | `appointments` separado de `session_records` (retenção CFP 5 anos) |
