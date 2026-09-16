# PsicoApp

Plataforma SaaS de gestão de consultório para psicólogos: pacientes, agenda, prontuário, financeiro e módulo tributário — com LGPD e segurança by design.

**Repositório:** https://github.com/cotoski/psicoapp

## Estado atual

O projeto está em **rebuild estruturado** (ver `docs/rebuild-plan.md`). O protótipo original está arquivado em `legacy/` e preservado na tag `archive/prototype`.

```
legacy/        # protótipo arquivado — referência apenas, contém vulns conhecidas
docs/          # assessment, plano de rebuild, specs, ADRs
backend/       # API nova (a partir da T-002)
frontend/      # React app novo (a partir da T-013)
```

## Setup de desenvolvimento

```bash
cp .env.example .env        # preencha os valores
docker compose up -d        # Postgres + Mailpit (captura de e-mail)
```

- Postgres: `localhost:5432`
- Mailpit UI: `http://localhost:8025` (SMTP em `localhost:1025`)

## Protótipo legado (somente referência)

```bash
cd legacy && docker compose up --build
```

> ⚠️ `legacy/` contém vulnerabilidades conhecidas (ver `docs/product-engineering-assessment.md` §2). Nunca usar com dados reais nem expor à rede.

## Documentos-chave

- `PSICOAPP_DEVIN_PRODUCT_ENGINEERING_PLAN.md` — plano-mãe de engenharia (gates, MVPs)
- `docs/product-engineering-assessment.md` — avaliação do protótipo e riscos
- `docs/rebuild-plan.md` — plano de rebuild, ordem de tasks
- `docs/behavior-spec.md` — comportamento do legado a preservar
- `docs/psicologia_app_visao.md` — visão de produto
- `docs/specs/` — specs de features
- `docs/decisions/` — ADRs
