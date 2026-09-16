# PsicoApp --- Product Engineering & MVP Execution Plan

## 1. Objetivo

Transformar o atual protótipo do PsicoApp em um produto SaaS de gestão
para psicólogos, com arquitetura evolutiva, segurança by design,
isolamento de dados por tenant, observabilidade, controle de custos,
testes automatizados e gates de qualidade.

**Repositório:** https://github.com/cotoski/psicoapp

Este documento deve ser tratado como o **plano técnico principal de
execução pelo Devin**.

> **Regra principal:** não reescrever o projeto inteiro de uma vez.
> Primeiro inspecionar, mapear, preservar o que funciona, corrigir
> fundamentos e evoluir incrementalmente.

------------------------------------------------------------------------

# 2. Contexto atual

O repositório atual contém:

-   `backend/`
-   `frontend/`
-   `docker-compose.yml`
-   `init.sql`
-   protótipos HTML
-   `psicologia_app_visao.md`

A visão existente contempla:

-   gestão de pacientes;
-   histórico clínico;
-   agenda;
-   registro de sessões;
-   documentos;
-   laudos;
-   financeiro;
-   dashboard;
-   requisitos de LGPD;
-   2FA;
-   auditoria;
-   backup.

A visão funcional atual deve ser mantida como referência de produto, mas
o desenvolvimento deve ser reorganizado em MVPs e gates.

------------------------------------------------------------------------

# 3. Princípios de engenharia

## 3.1 Modular Monolith primeiro

Não implementar microservices neste momento.

Arquitetura alvo inicial:

``` text
Web
 |
HTTPS
 |
Reverse Proxy / CDN / WAF
 |
Backend API
 |
+----------------------+
| Modular Monolith     |
|                      |
| Identity             |
| Professionals        |
| Patients             |
| Appointments         |
| Sessions             |
| Financial            |
| Documents            |
| Notifications        |
| Audit                |
+----------------------+
 |
PostgreSQL
 |
Object Storage
```

O sistema deve ser estruturado para permitir extração futura de serviços
sem necessidade de reescrever os módulos.

------------------------------------------------------------------------

## 3.2 Security by Design / Shift Left

Segurança não deve ser uma etapa posterior.

Toda feature deve passar por:

``` text
Requirement
  ↓
Threat Model
  ↓
Security Requirements
  ↓
Implementation
  ↓
Automated Tests
  ↓
Observability
  ↓
Release Gate
```

Usar OWASP ASVS como referência técnica e OWASP SAMM como referência de
maturidade de processo.

------------------------------------------------------------------------

## 3.3 Privacy by Design

O sistema manipula informações potencialmente sensíveis.

Classificar dados em:

### Público

-   informações gerais do produto.

### Identidade/cadastro

-   nome;
-   e-mail;
-   telefone;
-   CPF;
-   data de nascimento;
-   CRP.

### Clínico

-   anamnese;
-   evolução;
-   notas;
-   histórico;
-   avaliações;
-   documentos clínicos.

### Segurança

-   tokens;
-   credenciais;
-   secrets;
-   eventos de autenticação.

Dados clínicos nunca devem aparecer em logs técnicos.

------------------------------------------------------------------------

# 4. Requisitos arquiteturais

## 4.1 Backend

Organizar o backend por domínio:

``` text
backend/src/

modules/
  identity/
  professionals/
  patients/
  appointments/
  sessions/
  financial/
  documents/
  notifications/
  audit/

shared/
  auth/
  database/
  encryption/
  validation/
  errors/
  logging/
  observability/

infrastructure/
  postgres/
  storage/
  email/
```

Não criar uma estrutura artificialmente complexa. O objetivo é separação
clara de responsabilidades.

------------------------------------------------------------------------

# 5. Multi-tenancy

O PsicoApp deve ser SaaS desde a base.

Cada psicólogo/organização deve possuir um `tenant_id`.

Entidades de negócio relevantes devem possuir isolamento por tenant.

Exemplo:

``` text
patients
---------
id
tenant_id
...
```

O isolamento deve ocorrer em três níveis:

1.  aplicação;
2.  queries/repositories;
3.  testes automatizados de autorização.

Regra obrigatória:

``` text
Tenant A → Patient A = ALLOW
Tenant A → Patient B = DENY
```

Nunca confiar somente no frontend para isolamento.

------------------------------------------------------------------------

# 6. Autorização

Implementar RBAC inicialmente:

``` text
OWNER
ADMIN
PSYCHOLOGIST
ASSISTANT
```

A autorização deve verificar:

``` text
User
 ↓
Tenant
 ↓
Role
 ↓
Resource
 ↓
Action
```

Exemplos:

``` text
patients:read
patients:create
patients:update
patients:archive

sessions:read
sessions:create
sessions:update

documents:read
documents:create
documents:download

financial:read
financial:update
```

Suporte administrativo não deve possuir acesso automático a conteúdo
clínico.

------------------------------------------------------------------------

# 7. Autenticação

Implementar:

-   senha com hash forte;
-   sessão segura;
-   expiração;
-   refresh/revocation quando aplicável;
-   proteção contra brute force;
-   rate limiting;
-   recuperação de senha segura;
-   2FA preparado para ativação;
-   logout/revogação;
-   auditoria de login.

Nunca armazenar senha em texto puro.

Não colocar JWT secret no código ou no `docker-compose.yml`.

------------------------------------------------------------------------

# 8. Secrets

O ambiente atual possui credenciais de protótipo no
`docker-compose.yml`.

Isso deve ser corrigido antes de qualquer ambiente real.

Nunca versionar:

-   senha de banco;
-   JWT secret;
-   API keys;
-   private keys;
-   encryption keys;
-   credenciais de terceiros.

Criar:

``` text
.env.example
```

com placeholders.

Produção deve utilizar secret manager apropriado.

------------------------------------------------------------------------

# 9. Banco de dados

PostgreSQL.

Usar migrations versionadas.

Evitar depender de `init.sql` como mecanismo principal de evolução de
schema.

Requisitos:

-   migrations;
-   constraints;
-   foreign keys;
-   índices;
-   timestamps;
-   soft delete quando necessário;
-   estratégia de retenção;
-   índices considerando `tenant_id`;
-   transações para operações críticas.

Exemplo:

``` sql
CREATE INDEX idx_patients_tenant_id
ON patients(tenant_id);
```

------------------------------------------------------------------------

# 10. Dados clínicos

Separar conceitualmente:

``` text
Patient
Session
Clinical Note
Patient Note
Document
Report
Audit Event
```

Evitar armazenar grandes documentos binários no PostgreSQL.

Arquivos devem utilizar object storage privado.

Fluxo:

``` text
Frontend
 ↓
Backend authorization
 ↓
Pre-signed URL
 ↓
Private Object Storage
```

O banco armazena apenas metadata.

------------------------------------------------------------------------

# 11. Criptografia

Usar TLS em trânsito.

Dados sensíveis devem possuir estratégia explícita de proteção em
repouso.

Não implementar criptografia caseira.

Encryption keys devem ficar fora do banco e fora do Git.

Documentar:

-   algoritmo;
-   gerenciamento de chaves;
-   rotação;
-   recuperação;
-   impacto de perda de chave.

Antes de implementar criptografia de campos, avaliar impacto em:

-   busca;
-   índices;
-   performance;
-   recuperação;
-   exportação.

------------------------------------------------------------------------

# 12. Audit Trail

Criar mecanismo de auditoria separado dos logs técnicos.

Eventos mínimos:

``` text
LOGIN_SUCCESS
LOGIN_FAILURE
LOGOUT
PATIENT_CREATED
PATIENT_VIEWED
PATIENT_UPDATED
PATIENT_ARCHIVED
SESSION_CREATED
SESSION_VIEWED
SESSION_UPDATED
DOCUMENT_CREATED
DOCUMENT_VIEWED
DOCUMENT_DOWNLOADED
REPORT_CREATED
DATA_EXPORTED
DATA_DELETED
PERMISSION_DENIED
```

Cada evento deve registrar, quando aplicável:

``` text
event_id
tenant_id
actor_user_id
action
resource_type
resource_id
timestamp
ip
request_id
result
```

Não registrar conteúdo clínico no audit log.

------------------------------------------------------------------------

# 13. Observabilidade

Implementar desde o início:

``` text
Logs
Metrics
Traces
Audit
```

Preferir OpenTelemetry para instrumentação.

## Logs

Logs estruturados em JSON.

Campos recomendados:

``` text
timestamp
level
service
environment
request_id
trace_id
user_id
tenant_id
route
status_code
duration_ms
error_code
```

Nunca registrar:

-   senha;
-   token;
-   JWT;
-   dados clínicos;
-   conteúdo de prontuário;
-   secrets.

------------------------------------------------------------------------

# 14. Health checks

Criar:

``` text
/health/live
/health/ready
```

Liveness verifica se o processo está vivo.

Readiness verifica dependências críticas.

Não expor informações sensíveis no health check.

------------------------------------------------------------------------

# 15. Métricas

Métricas técnicas:

``` text
http_requests_total
http_request_duration_ms
http_5xx_total
http_4xx_total
db_query_duration_ms
db_connections
auth_failures_total
permission_denied_total
```

Métricas de negócio:

``` text
active_psychologists
active_patients
sessions_created
sessions_completed
appointments_cancelled
payments_pending
```

------------------------------------------------------------------------

# 16. Performance

Objetivo inicial:

-   API p95 \< 500 ms para operações comuns;
-   endpoints de consulta paginados;
-   evitar N+1 queries;
-   índices adequados;
-   payloads pequenos;
-   paginação obrigatória em listas potencialmente grandes.

Não introduzir Redis apenas por antecipação.

Adicionar cache quando houver evidência de necessidade.

------------------------------------------------------------------------

# 17. Escalabilidade

Escala inicial:

``` text
Load Balancer
      |
  API instances
      |
 PostgreSQL
```

O backend deve ser stateless sempre que possível.

Não armazenar estado de sessão em memória local.

Preparar para múltiplas instâncias.

Filas/background jobs podem ser adicionados posteriormente para:

-   e-mail;
-   notificações;
-   geração de PDF;
-   relatórios;
-   tarefas demoradas.

------------------------------------------------------------------------

# 18. Controle de custos / FinOps

O produto deve nascer com controle de custo.

Tags/labels por:

``` text
environment
application
component
```

Monitorar:

``` text
compute
database
storage
network
observability
third-party
```

Métricas:

``` text
cost_per_tenant
cost_per_active_psychologist
cost_per_active_patient
```

Não adicionar infraestrutura gerenciada sem necessidade.

Preferir simplicidade até haver evidência de escala.

------------------------------------------------------------------------

# 19. CI/CD

Criar pipeline automatizado.

Fluxo:

``` text
Pull Request
   ↓
Install
   ↓
Lint
   ↓
Type Check
   ↓
Unit Tests
   ↓
Integration Tests
   ↓
SAST
   ↓
Dependency Scan
   ↓
Secret Scan
   ↓
Build
   ↓
Deploy Staging
   ↓
Smoke Tests
```

Produção somente após os gates.

------------------------------------------------------------------------

# 20. Quality Gates

## Gate A --- Product

Obrigatório:

-   problema definido;
-   usuário definido;
-   acceptance criteria;
-   métricas de sucesso.

------------------------------------------------------------------------

## Gate B --- Architecture

Obrigatório:

-   impacto arquitetural analisado;
-   modelo de dados;
-   API contract;
-   threat model quando aplicável;
-   ADR quando houver decisão arquitetural relevante.

------------------------------------------------------------------------

## Gate C --- Security

Obrigatório:

-   autenticação;
-   autorização;
-   validação de entrada;
-   proteção contra IDOR;
-   proteção contra injection;
-   secret scanning;
-   dependency scanning;
-   testes de tenant isolation;
-   testes de permissionamento.

------------------------------------------------------------------------

## Gate D --- Quality

Obrigatório:

-   unit tests;
-   integration tests;
-   E2E quando aplicável;
-   regressão;
-   lint;
-   type check.

------------------------------------------------------------------------

## Gate E --- Production

Obrigatório:

-   logs;
-   métricas;
-   health checks;
-   alertas;
-   backup;
-   restore test;
-   rollback;
-   runbook;
-   custo estimado.

------------------------------------------------------------------------

## Gate F --- Product Release

Monitorar:

-   ativação;
-   usuários ativos;
-   retenção;
-   erros;
-   performance;
-   custo por usuário;
-   feedback.

------------------------------------------------------------------------

# 21. MVP 0 --- Foundation

Objetivo:

> Transformar o protótipo em uma base segura e sustentável para
> desenvolvimento.

### Entregas

-   organizar backend;
-   organizar frontend;
-   environment configuration;
-   `.env.example`;
-   remover secrets do código;
-   migrations;
-   database constraints;
-   error handling;
-   validation;
-   structured logging;
-   health checks;
-   CI;
-   unit tests;
-   integration test foundation;
-   SAST;
-   dependency scan;
-   secret scan;
-   documentação de arquitetura.

### Gate MVP 0

``` text
[ ] Build reproduzível
[ ] Testes executam automaticamente
[ ] Nenhum secret no Git
[ ] Banco possui migrations
[ ] Health checks funcionando
[ ] Logs estruturados
[ ] CI funcionando
[ ] Vulnerability scan configurado
[ ] Arquitetura documentada
[ ] Threat model inicial
```

------------------------------------------------------------------------

# 22. MVP 1 --- Core Product

Objetivo:

> Permitir que um psicólogo gerencie o ciclo básico do atendimento.

Fluxo:

``` text
Paciente
 ↓
Agendamento
 ↓
Sessão
 ↓
Evolução
 ↓
Pagamento
```

## 22.1 Pacientes

Implementar:

-   criar paciente;
-   editar paciente;
-   visualizar paciente;
-   arquivar paciente;
-   busca;
-   paginação;
-   histórico básico.

------------------------------------------------------------------------

## 22.2 Agenda

Implementar:

-   criar agendamento;
-   alterar;
-   cancelar;
-   remarcar;
-   status;
-   duração;
-   calendário.

Estados:

``` text
SCHEDULED
COMPLETED
CANCELLED
RESCHEDULED
NO_SHOW
```

------------------------------------------------------------------------

## 22.3 Sessão

Implementar:

-   iniciar registro;
-   registrar evolução;
-   notas;
-   temas;
-   tarefas;
-   metas;
-   salvar;
-   histórico.

Conteúdo clínico deve possuir proteção de acesso e auditoria.

------------------------------------------------------------------------

## 22.4 Financeiro

Implementar:

-   valor da sessão;
-   status;
-   data de pagamento;
-   pendente;
-   pago;
-   cancelado;
-   resumo mensal.

Não implementar integração bancária neste MVP.

------------------------------------------------------------------------

# 23. Gate 1 --- Clinical Safety / Security

Não liberar dados reais antes deste gate.

Checklist:

``` text
[ ] Multi-tenancy testado
[ ] IDOR testado
[ ] RBAC testado
[ ] Authorization testado
[ ] Audit trail implementado
[ ] Dados clínicos protegidos
[ ] Backup configurado
[ ] Restore test realizado
[ ] Rate limiting
[ ] Password security
[ ] Session security
[ ] 2FA architecture ready
[ ] Dependency scan
[ ] SAST
[ ] Secret scan
[ ] Security headers
[ ] Input validation
[ ] Error handling sem vazamento
```

------------------------------------------------------------------------

# 24. MVP 2 --- Consultório

Depois do Core validado:

### Agenda

-   recorrência;
-   disponibilidade;
-   bloqueios;
-   lembretes.

### Documentos

-   upload;
-   download autorizado;
-   metadata;
-   versionamento.

### Relatórios

-   faturamento;
-   sessões;
-   comparecimento;
-   pacientes ativos.

### Recibos

-   geração de PDF;
-   histórico;
-   download seguro.

------------------------------------------------------------------------

# 25. Gate 2 --- Production Readiness

Obrigatório antes de abertura pública:

``` text
[ ] SLO definido
[ ] Monitoring
[ ] Alerting
[ ] Backup
[ ] Restore
[ ] Disaster recovery strategy
[ ] Rollback
[ ] Runbook
[ ] Incident response
[ ] Load test
[ ] Security test
[ ] Cost monitoring
[ ] Data retention strategy
[ ] Privacy documentation
```

------------------------------------------------------------------------

# 26. MVP 3 --- Scale & Automation

Somente após validação do produto.

Adicionar conforme necessidade:

-   Redis;
-   queue;
-   workers;
-   CDN;
-   object storage;
-   autoscaling;
-   background jobs;
-   notification service.

Não adicionar tecnologia sem uma necessidade mensurável.

------------------------------------------------------------------------

# 27. MVP 4 --- Platform

Futuro:

-   portal do paciente;
-   notificações;
-   assinatura digital;
-   pagamentos;
-   Pix;
-   integrações;
-   mobile;
-   teleatendimento.

------------------------------------------------------------------------

# 28. MVP 5 --- AI

IA somente depois que:

-   segurança estiver consolidada;
-   modelo de dados estiver estável;
-   governança estiver definida;
-   fluxo clínico estiver validado.

Possíveis funcionalidades:

-   resumo de sessão;
-   organização de notas;
-   preparação de relatórios;
-   tarefas administrativas;
-   busca semântica controlada.

Evitar inicialmente funcionalidades que façam inferências clínicas ou
diagnósticas.

Toda funcionalidade de IA deve ter:

``` text
Data classification
Threat model
Prompt/data isolation
Audit
Human review
Opt-in/consent where applicable
Provider data policy review
Cost monitoring
```

------------------------------------------------------------------------

# 29. Modelo de desenvolvimento por feature

Para cada feature, o Devin deve seguir:

``` text
1. Inspect
2. Plan
3. Threat model
4. Implement
5. Test
6. Observe
7. Document
8. Commit
```

Nunca fazer:

``` text
"Rewrite everything"
```

------------------------------------------------------------------------

# 30. Definition of Done

Uma feature só está concluída quando:

## Produto

``` text
[ ] Acceptance criteria atendidos
[ ] UX funcional
```

## Arquitetura

``` text
[ ] Código no módulo correto
[ ] Sem duplicação desnecessária
[ ] ADR quando necessário
```

## Segurança

``` text
[ ] Authorization
[ ] Validation
[ ] Tenant isolation
[ ] Secrets safe
[ ] Security tests
```

## Qualidade

``` text
[ ] Unit tests
[ ] Integration tests quando necessário
[ ] E2E quando necessário
[ ] Regression
```

## Observabilidade

``` text
[ ] Logs
[ ] Metrics
[ ] Trace quando aplicável
[ ] Audit quando envolve dado sensível
```

## Operação

``` text
[ ] Health check
[ ] Error handling
[ ] Rollback considerado
[ ] Documentação atualizada
```

------------------------------------------------------------------------

# 31. Requisitos de API

Todas as APIs devem:

-   validar input;
-   validar autenticação;
-   validar autorização;
-   aplicar tenant isolation;
-   retornar erros padronizados;
-   possuir status HTTP correto;
-   evitar vazamento de informações;
-   suportar pagination quando necessário.

Formato recomendado:

``` json
{
  "error": {
    "code": "PATIENT_NOT_FOUND",
    "message": "Patient not found",
    "requestId": "..."
  }
}
```

Não retornar stack trace ao cliente.

------------------------------------------------------------------------

# 32. Testes obrigatórios de segurança

Criar testes específicos para:

### Tenant isolation

``` text
User A cannot read Tenant B
User A cannot update Tenant B
User A cannot delete Tenant B
```

### IDOR

``` text
GET /patients/{id}
```

deve negar acesso quando o recurso não pertence ao tenant.

### Role escalation

Usuário comum não pode executar endpoint administrativo.

### Audit

Acesso a dados clínicos deve gerar evento auditável.

### Input attacks

Testar:

-   SQL injection;
-   XSS;
-   malformed JSON;
-   oversized payload;
-   invalid IDs;
-   path traversal;
-   upload inválido.

------------------------------------------------------------------------

# 33. Documentação obrigatória

Criar:

``` text
docs/
  architecture.md
  security.md
  threat-model.md
  data-classification.md
  api.md
  observability.md
  deployment.md
  disaster-recovery.md
  finops.md
  decisions/
```

ADRs:

``` text
docs/decisions/0001-modular-monolith.md
docs/decisions/0002-multi-tenancy.md
docs/decisions/0003-object-storage.md
```

------------------------------------------------------------------------

# 34. AWS --- arquitetura inicial recomendada

Não provisionar tudo imediatamente.

Arquitetura alvo:

``` text
Internet
   |
Route 53
   |
CloudFront / WAF
   |
Load Balancer
   |
Containerized API
   |
RDS PostgreSQL
   |
S3
```

Secrets:

``` text
Secrets Manager
```

Observabilidade:

``` text
CloudWatch
OpenTelemetry
```

A escolha final entre ECS/Fargate, EKS ou outra plataforma deve ser
tomada após avaliar:

-   volume;
-   custo;
-   capacidade operacional;
-   necessidade de escala.

Não usar EKS apenas por ser tecnicamente mais sofisticado.

------------------------------------------------------------------------

# 35. Controle de custo AWS

Começar pequeno.

Monitorar:

``` text
RDS
Compute
S3
CloudFront
WAF
Logs
Network
Secrets
```

Criar alertas de orçamento.

Objetivo:

> descobrir o custo unitário antes de escalar.

------------------------------------------------------------------------

# 36. Critérios para considerar o produto pronto para piloto

O PsicoApp pode entrar em piloto controlado quando:

``` text
[ ] MVP 1 completo
[ ] Gate 1 aprovado
[ ] Sem vulnerabilidades críticas/altas conhecidas sem tratamento
[ ] Tenant isolation comprovado
[ ] Backup/restore testado
[ ] Audit funcionando
[ ] Observabilidade funcionando
[ ] CI/CD funcionando
[ ] Rollback funcionando
[ ] Dados de teste separados de produção
[ ] Documentação mínima disponível
[ ] 3-5 psicólogos piloto definidos
```

------------------------------------------------------------------------

# 37. Estratégia de rollout

Não liberar tudo de uma vez.

``` text
DEV
 ↓
STAGING
 ↓
INTERNAL PILOT
 ↓
3-5 PSYCHOLOGISTS
 ↓
10-20 PSYCHOLOGISTS
 ↓
GENERAL AVAILABILITY
```

Usar feature flags quando necessário.

------------------------------------------------------------------------

# 38. Regra para o Devin

Antes de modificar código:

1.  Ler o repositório.
2.  Identificar stack real.
3.  Executar a aplicação.
4.  Executar testes existentes.
5.  Mapear estrutura atual.
6.  Identificar dívida técnica.
7.  Produzir plano de implementação.
8.  Implementar em pequenos incrementos.
9.  Testar.
10. Documentar.
11. Só então avançar.

Se uma decisão arquitetural não estiver clara:

-   não inventar;
-   documentar a alternativa;
-   escolher a opção mais simples que preserve evolução;
-   registrar ADR.

------------------------------------------------------------------------

# 39. Prioridades

## P0 --- obrigatório

-   segurança;
-   tenant isolation;
-   autenticação;
-   autorização;
-   migrations;
-   testes;
-   CI;
-   secrets;
-   audit;
-   backup;
-   observabilidade básica;
-   core workflow.

## P1 --- importante

-   documentos;
-   relatórios;
-   notificações;
-   2FA;
-   FinOps;
-   disaster recovery;
-   performance.

## P2 --- evolução

-   Redis;
-   queues;
-   autoscaling;
-   integrações;
-   portal do paciente.

## P3 --- futuro

-   mobile;
-   pagamentos;
-   teleatendimento;
-   IA;
-   analytics avançado.

------------------------------------------------------------------------

# 40. Resultado esperado

Ao final desta evolução, o PsicoApp deve deixar de ser:

``` text
Protótipo
```

e se tornar:

``` text
                 PSICOAPP

        ┌─────────────────────┐
        │      Product        │
        └──────────┬──────────┘
                   │
        ┌──────────▼──────────┐
        │   Modular Backend   │
        └──────────┬──────────┘
                   │
      ┌────────────┼────────────┐
      ▼            ▼            ▼
 Security     Observability   FinOps
      │            │            │
      └────────────┼────────────┘
                   ▼
             PostgreSQL
                   +
             Object Storage
                   +
              CI/CD
                   +
             Automated QA
```

O objetivo não é construir a arquitetura mais sofisticada.

O objetivo é construir **o menor produto possível que seja seguro,
testável, observável, operável e capaz de evoluir para escala**.

------------------------------------------------------------------------

# 41. Primeira tarefa do Devin

Antes de implementar qualquer feature:

## TASK-000 --- Product Engineering Assessment

O Devin deve:

1.  Clonar/inspecionar o repositório.
2.  Identificar todas as tecnologias utilizadas atualmente.
3.  Mapear frontend.
4.  Mapear backend.
5.  Mapear banco.
6.  Mapear APIs.
7.  Mapear autenticação.
8.  Mapear autorização.
9.  Mapear dados sensíveis.
10. Mapear dependências.
11. Mapear testes existentes.
12. Mapear Docker.
13. Mapear CI/CD existente.
14. Identificar secrets.
15. Identificar vulnerabilidades óbvias.
16. Identificar problemas de multi-tenancy.
17. Identificar problemas de observabilidade.
18. Identificar problemas de performance.
19. Identificar problemas de custo.
20. Produzir `docs/product-engineering-assessment.md`.

O assessment deve conter:

``` text
Current State
Target State
Gap Analysis
P0
P1
P2
Architecture Risks
Security Risks
Product Risks
Technical Debt
Recommended Sequence
```

### Regra

**Não começar uma grande refatoração antes de concluir o assessment.**

Depois do assessment, iniciar:

``` text
TASK-001 — MVP 0 Foundation
```

e avançar sequencialmente pelos gates deste documento.

------------------------------------------------------------------------

# 42. Definition of Done do projeto

O projeto será considerado evoluído de protótipo para produto quando:

``` text
Architecture
    ✓ modular
    ✓ documented
    ✓ evolvable

Security
    ✓ authentication
    ✓ authorization
    ✓ tenant isolation
    ✓ audit
    ✓ secrets management
    ✓ security testing

Quality
    ✓ unit tests
    ✓ integration tests
    ✓ E2E critical flows
    ✓ CI/CD

Operations
    ✓ logs
    ✓ metrics
    ✓ traces
    ✓ alerts
    ✓ backup
    ✓ restore
    ✓ rollback

Product
    ✓ patients
    ✓ appointments
    ✓ sessions
    ✓ financial

Compliance
    ✓ data classification
    ✓ privacy controls
    ✓ retention strategy
    ✓ export/delete workflows

FinOps
    ✓ cost visibility
    ✓ budget alerts
    ✓ unit economics

Scale
    ✓ stateless backend
    ✓ horizontal scaling path
    ✓ asynchronous processing path
```

------------------------------------------------------------------------

## Nota importante

Este documento é um **plano técnico de engenharia**, não uma
certificação jurídica ou de conformidade. Requisitos legais e
regulatórios específicos devem ser validados com profissional
especializado antes do uso com dados reais.
