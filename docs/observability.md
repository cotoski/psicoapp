# Observabilidade — baseline (T-012)

## Endpoint

`GET /metrics` — formato Prometheus (text/plain). **Sem autenticação** para permitir
scrape; em produção restrinja por rede (security group / ingress / IP allowlist do
Prometheus), nunca exponha publicamente.

## Métricas

| Métrica | Tipo | Labels | Significado |
|---|---|---|---|
| `http_request_duration_seconds` | histogram | `method`, `route`, `status` | Latência por rota normalizada (`/api/v1/patients/:id`) — sem UUIDs |
| `http_5xx_total` | counter | `route` | Erros internos por rota |
| `auth_failures_total` | counter | `code` | 401s: `UNAUTHORIZED`, `INVALID_CREDENTIALS`, `TOKEN_EXPIRED` |
| `permission_denied_total` | counter | `code` | 403s: `FORBIDDEN`, `TENANT_MISMATCH` |
| `process_*`, `nodejs_*` | default | — | Coletadas por `prom-client.collectDefaultMetrics` |

## Alertas sugeridos (MVP 1)

- `rate(auth_failures_total[5m])` alto → possível brute force / enumeração
- `rate(permission_denied_total[5m])` > 0 sustentado → tentativa de acesso cross-tenant
- `rate(http_5xx_total[5m])` > 0 → bug em produção
- p95 de `http_request_duration_seconds` por rota > 1s → degradação

## O que NÃO vai para métricas

- Conteúdo clínico, tokens, e-mails — métricas carregam apenas labels de
  método/rota/status/código de erro. IDs de recursos nunca são labels
  (cardinalidade + privacidade).

## Logs

`pino` em JSON com `requestId` em todo request (`x-request-id` propagado ao cliente).
Campos sensíveis (`password`, `authorization`, cookies) são redigidos pelo logger.
Trilha de negócio vai para `audit_events` (banco), não para stdout.
