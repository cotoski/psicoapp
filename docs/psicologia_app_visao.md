# Visão do Produto: PsicoApp

## 1. Resumo Executivo

Plataforma all-in-one para psicólogos gerenciarem consultório: sessões, pacientes, agendamentos, pagamentos, cálculo tributário automático e documentação, com conformidade LGPD integrada.

**Versão**: 1.1 (Atualizado com módulo tributário e reajuste automático)  
**Última atualização**: Agosto 2026

---

## 2. Core Funcionalidades

### 2.1 Gestão de Pacientes
- **Perfil do Paciente**: Dados básicos (nome, CPF mascarado), contato, anamnese
- **Histórico Clínico**: Timeline com pontos importantes da vida do paciente (traumas, marcos, relacionamentos, profissão)
- **Tags/Lembretes**: Sistema de anotações rápidas para pontos recorrentes (ex: "mãe falecida", "trabalha com pressão")
- **Documentos**: Arquivos de consentimento, fichas de anamnese (upload seguro)

### 2.2 Agendamentos & Calendário
- **Calendário Integrado**: Vista mensal/semanal/dia
- **Blocos de Tempo**: Sessões agendadas com duração configurável
- **Status de Sessão**: Agendada → Realizada → Cancelada → Remarcada
- **Notificações**: Lembretes 24h antes (SMS/Push opcional)
- **Disponibilidade**: Configurar horários de atendimento por dia da semana

### 2.3 Registro de Sessões (Prontuário Eletrônico)
- **Estrutura Flexível**:
  - Avaliação do estado emocional (escala)
  - Temas abordados (tags: relacionamento, carreira, saúde mental, etc)
  - Notas clínicas (texto livre, estruturado)
  - Exercícios/Tarefas para casa
  - Próximas metas

- **Segurança LGPD**:
  - Criptografia de dados em repouso
  - Acesso por autenticação (2FA opcional)
  - Logs de acesso a cada prontuário
  - Exclusão segura de dados (direito ao esquecimento)
  - Backup automático

### 2.4 Geração de Laudos
- **Templates Configuráveis**:
  - Laudo de diagnóstico
  - Relatório para terceiros (escola, emprego, etc)
  - Atestado de comparecimento
  - Relatório de evolução clínica

- **Preenchimento Assistido**: Pulls dados automáticos (histórico, sessões)
- **Assinatura Digital**: Integração com certificado digital ou e-signature
- **Auditoria**: Cada laudo gerado é registrado com timestamp

### 2.5 Gestão Financeira
- **Controle de Sessões Pagas**:
  - Status por sessão: Paga / Pendente / Cancelada
  - Valor configurável por tipo de sessão
  - Data de pagamento

- **Recibos**: Geração automática de recibos (PDF)
- **Relatórios**: Faturamento mensal, taxa de inadimplência
- **Integração (Future)**: Pix, cartão, boleto

### 2.6 Dashboard & Relatórios
- **KPIs**:
  - Sessões do mês / Faturamento
  - Taxa de comparecimento
  - Pacientes ativos vs inativos
  
- **Insights Clínicos**:
  - Temas mais abordados
  - Evolução de pacientes (sentimento geral ao longo do tempo)

---

## 3. Arquitetura Técnica

### Stack Recomendado
```
Frontend: React 18 + TypeScript
Backend: Node.js/Express + PostgreSQL
Auth: JWT + 2FA (Authenticator)
Criptografia: AES-256 (dados sensíveis)
Hosting: AWS (VPC isolada) ou similar
```

### Fluxo de Dados (Segurança LGPD)
```
[Cliente Web/Mobile] 
    ↓ (HTTPS + Token JWT)
[API Gateway + Rate Limiting]
    ↓ (Validação, 2FA)
[Backend Seguro]
    ↓ (AES-256 Encryption)
[PostgreSQL Isolado + Backups Encriptados]
```

### Estrutura de Banco de Dados (Simplificada)

```sql
-- Usuários (Psicólogos)
users (id, email, nome, senha_hash, crp, 2fa_secret)

-- Pacientes
patients (id, user_id, nome_hash, cpf_hash, telefone_enc, email_enc, data_nascimento_enc)

-- Sessões
sessions (id, patient_id, data_hora, duracao, status, valor, pago_em, notas_criptografadas)

-- Histórico Clínico (Lembretes)
patient_notes (id, patient_id, tipo, conteúdo, data_criacao)

-- Laudos
reports (id, user_id, patient_id, tipo, conteudo, data_geracao, assinado_em)

-- Logs de Acesso (LGPD)
audit_logs (id, user_id, patient_id, acao, timestamp, ip)
```

---

## 4. Conformidade LGPD

### Princípios Implementados

| Princípio | Implementação |
|-----------|---------------|
| **Consentimento** | Checkbox de aceite na primeira sessão + assinatura digital |
| **Segurança** | AES-256 + HTTPS + 2FA + Backups encriptados |
| **Transparência** | Logs de acesso; política de privacidade clara |
| **Direito ao Esquecimento** | Botão de exclusão de dados (soft delete + purge após 90 dias) |
| **Portabilidade** | Exportar dados do paciente em JSON |
| **Proteção de Menores** | Validação de consentimento de responsável se < 18 anos |

### Documentos Necessários
- [ ] Política de Privacidade
- [ ] Termo de Consentimento para Processamento de Dados
- [ ] Manual de Segurança (para psicólogos)
- [ ] Acordo de Processamento de Dados (APD)

---

## 5. Fluxos Principais

### Fluxo 1: Primeiro Atendimento
1. Psicólogo cria novo paciente (dados básicos)
2. Paciente assina TCLE digital
3. Anamnese realizada e registrada
4. Sistema sugere tags/lembretes baseado em respostas

### Fluxo 2: Sessão Rotineira
1. Abrir calendário → Clicar em sessão agendada
2. Carregar histórico do paciente (tags, última sessão)
3. Registrar notas da sessão
4. Definir tarefas/metas
5. Marcar pagamento
6. Gerar laudo se necessário

### Fluxo 3: Relatório Financeiro
1. Menu → Financeiro → Mês (selecionável)
2. Ver todas as sessões do mês + status de pagamento
3. Gerar recibo para pacientes específicos
4. Exportar para conta (Excel/PDF)

---

## 6. Diferenciais & Nice-to-Have

### MVP (v1.0)
- ✅ Gestão de pacientes + histórico
- ✅ Agendamentos básicos
- ✅ Registro de sessões
- ✅ Controle financeiro
- ✅ LGPD compliance

### v1.1 (Next)
- Geração de laudos com templates
- Dashboard com insights
- Autenticação 2FA
- Backup automático

### v2.0+ (Future)
- App mobile (React Native)
- Integração com Zoom/Google Meet
- Sistema de pagamento integrado
- IA para análise de sentimento (notas da sessão)
- Prescrição de tarefas com lembretes ao paciente

---

## 7. Estimativa Inicial

| Componente | Horas | Complexidade |
|-----------|-------|--------------|
| Backend API (Core) | 120 | Alta |
| Frontend (Dashboard) | 100 | Média |
| Segurança + LGPD | 60 | Alta |
| Testes + QA | 80 | Média |
| Deploy + Docs | 40 | Baixa |
| **TOTAL** | **~400h** | - |

---

## 8. Próximos Passos

1. ✅ Validar visão com psicólogos (3-5 usuários-piloto)
2. ⬜ Definir stack específico + provisionamento AWS
3. ⬜ Começar API backend (auth, patients, sessions)
4. ⬜ Homologação LGPD com especialista
5. ⬜ Desenvolver frontend em paralelo
