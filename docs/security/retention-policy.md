# Política de Retenção de Dados Clínicos

**Status**: decisão técnica — pendente de revisão jurídica (CFP/LGPD)
**Base regulatória**: Resolução CFP nº 01/2009 — documentos psicológicos devem ser
conservados por **no mínimo 5 anos** a partir da última atualização/encerramento.

## Decisões técnicas implementadas

| Garantia | Onde | Como |
|---|---|---|
| Prontuário nunca é deletado via API | `modules/records/routes.ts` | só existem `GET` e `PUT` — não há verbo `DELETE` |
| `legal_hold` é irreversível pela API | `modules/records/service.ts` | tentativa de desmarcar → 409 |
| Deletes são lógicos (soft delete) | `patients`, `appointments` | `deleted_at` timestamp — linha e prontuário permanecem |
| Regeneração de agenda preserva registros | `appointments/repo.ts` `deleteRegenerable` | `NOT EXISTS` em `session_records` exclui do delete |
| FK impede hard-delete acidental | `db/schema.ts` | `session_records.appointment_id → appointments` sem `ON DELETE CASCADE` (NO ACTION) — apagar agendamento com prontuário falha no banco |
| Auditoria imutável de acesso | `audit_events` | `SESSION_VIEWED`/`SESSION_CREATED`/`SESSION_UPDATED` sem conteúdo clínico |

Cobertura de teste: `backend/tests/security.test.ts` → describe
"retenção CFP".

## Pendências para revisão jurídica

- [ ] Validar os 5 anos da Res. CFP 01/2009 contra normas mais recentes
      (Res. CFP 06/2019 institui o Sistema de Prontuário — verificar se há
      prazo distinto) e contra o Código Civil/CDC para guarda de documentos fiscais.
- [ ] Definir política de **anonimização/exclusão sob LGPD art. 16** — o
      titular pode pedir eliminação, mas prontuário tem hipótese de
      conservação por obrigação legal (art. 16, I). Documentar o fluxo.
- [ ] Decidir se agendamento cancelado/falta entra no prontuário (prazo
      corre do que consta no registro).
- [ ] Definir procedimento para dados de pacientes de maior de idade vs.
      adolescente/criança (prazo pode correr até maioridade + 5 anos? —
      ponto jurídico conhecido como controvertido).
- [ ] Termo de consentimento e política de privacidade (LGPD arts. 7-9).

## Regra operacional

**Nenhuma funcionalidade, migração ou job pode remover linhas de
`session_records` ou `audit_events`.** Qualquer necessidade futura de
purgar dados clínicos passa por: (1) revisão jurídica, (2) retenção mínima
de 5 anos verificada por `created_at`, (3) decisão registrada em
`docs/decisions/`.
