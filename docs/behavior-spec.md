# Behavior Spec — comportamento do protótipo a preservar

Extraído de `legacy/backend/src/index.js` e `legacy/frontend/src/main.tsx` antes do rebuild.
**Regra:** cada item vira teste de especificação no código novo. Divergência intencional está marcada.

---

## B1. Recorrência de agendamentos (`gerarSessoesRecorrentes`)

Gatilhos: criar paciente, editar paciente, `POST /patients/:id/renovar`.

- Origem: `max(hoje, dataInicio)`; fim: `dataFim` (= `data_reajuste` do paciente).
- Requer `horario` (HH:MM) e ao menos um dia em `dias_semana` (fallback legado: `dia_semana` singular).
- Para cada dia da semana: primeira ocorrência ≥ origem, depois itera pelo intervalo da frequência até `dataFim` **inclusive**.
- Intervalos: `semanal` +7 dias · `quinzenal` +14 dias · `mensal` = primeira ocorrência daquele dia-da-semana no mês seguinte (a partir do dia 1).
- Cada agendamento criado: `duracao=50`, `status='agendada'`, `valor=patient.valor`, `faturada=false`, `notas=''`.
- **Idempotente**: `UNIQUE(patient_id, data_hora)` + `ON CONFLICT DO NOTHING` — rodar 2× não duplica.
- Datas tratadas como locais (sem fuso); `DATE` serializado como `YYYY-MM-DD` (type parser 1082).

### B1.1 Regeneração na edição

`PUT /patients/:id`: se houver `dias_semana` + `horario` + `data_reajuste`, **apaga** agendamentos futuros que satisfaçam **todos**:

```
status = 'agendada' AND faturada = false AND notas = '' AND data_hora >= hoje
```

e regenera o ciclo. Sessões realizadas, faturadas ou com notas são preservadas.

## B2. Ciclo de reajuste

- `data_reajuste` default = `hoje + meses_ciclo`; `meses_ciclo` default = 6.
- `POST /patients/:id/renovar`: `nova_data = data_reajuste_anterior + meses_ciclo`; gera agendamentos no intervalo `[anterior, nova]`.

## B3. Derivação de `qtd_sessoes_nota`

No create/update do paciente (usado pela regra de faturamento):

| `frequencia_recorrencia` | `qtd_sessoes_nota` |
|---|---|
| `mensal` | 1 |
| `quinzenal` | 2 |
| `semanal` (default) | `4 × len(dias_semana)` |
| sem dias definidos | 1 |

## B4. Faturamento ("notas")

`GET /notas/pendentes` (→ novo `GET /api/v1/billing/pending`):

- Escopo: sessões do **mês corrente** com `faturada=false` e `status <> 'cancelada'`.
- Agrupa por paciente: `pendente` (qtd), `valor_total`, `pronto`.
- `pronto = tipo_faturamento='imediato' OR pendente >= qtd_sessoes_nota`.

`POST /notas` (→ novo `POST /api/v1/billing/invoice`):

- Marca `faturada=true` nas sessões informadas (somente do tenant, somente `faturada=false`).
- Retorna `total` e lista de sessões com contato do paciente.
- **Divergência intencional**: legado tinha SQL injection (`ids.join`); novo usa `= ANY($1)` / `IN` tipado e valida que os IDs pertencem ao tenant **antes** de atualizar.

## B5. Dashboard (KPIs)

- `pacientes` = count ativos do usuário.
- `sessoesTotal`, `sessoesRealizadas` = count / count `status='realizada'`.
- `faturamento` = `SUM(valor)` das sessões realizadas.

## B6. Tributário (frontend `main.tsx`)

ISS por município: `sp 2%`, `rj 3%`, `mg 2.5%`, `ba 5%` (default 2%).

| Regime | Componentes sobre o valor |
|---|---|
| Pessoa Física | ISS + IRPF 15% + INSS 10% |
| Simples Nacional | ISS + DAS 7% |
| Lucro Presumido | ISS + IRPJ 7,2% + PIS/COFINS 9,65% + INSS 15% |

**Fator R** (conforme `docs/specs/SPEC_FATOR_R.md` §4): limiar 28%; ≥28% → Anexo III (~6%), <28% → Anexo V (~15,5%); simulador calcula pró-labore necessário (`Math.ceil(faturamento × 0,28)`) e economia anual estimada.

## B7. Mapeamento de status (legado → v1)

| Legado (pt-BR) | v1 (enum) |
|---|---|
| `agendada` | `scheduled` |
| `realizada` | `completed` |
| `cancelada` | `cancelled` |
| `remarcada` | `rescheduled` |
| — (novo) | `no_show` |

## B8. Divergências intencionais do legado

- Prontuário (`session_records`) separado de `appointments` — legado fundia os dois em `sessions.notas`.
- Conteúdo clínico criptografado (AES-256-GCM) — legado era texto puro.
- Soft delete (`deleted_at`) — legado fazia hard delete em cascata.
- Todo endpoint filtra `tenant_id` — legado tinha IDOR em `/sessions`.
- Sem usuário demo auto-criado — seed explícito apenas em dev.
