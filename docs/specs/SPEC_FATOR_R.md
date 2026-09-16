# 📋 Especificação Técnica — Calculadora de Fator R

**Projeto**: PsicoApp  
**Feature**: Cálculo automático de Fator R + recomendação de regime tributário  
**Repositório**: https://github.com/cotoski/psicoapp  
**Branch sugerida**: `feature/fator-r-calculator`  
**Destinado a**: Implementação via Devin AI (ou outro agente de codificação autônomo)

---

## 1. Contexto de Negócio

Psicólogos que faturam pelo **Simples Nacional** caem em um de dois anexos, dependendo do **Fator R**:

```
Fator R = (Folha de pagamento + Pró-labore, últimos 12 meses)
          ÷
          (Faturamento bruto, últimos 12 meses)
```

- **Fator R ≥ 28%** → Anexo III (alíquota inicial ~6%, mais barato)
- **Fator R < 28%** → Anexo V (alíquota inicial ~15,5%, mais caro)

O psicólogo pode **aumentar o pró-labore** propositalmente para cruzar o limiar de 28% e pagar menos imposto no total (mesmo pagando mais INSS sobre o pró-labore, a economia líquida geralmente compensa). O objetivo desta feature é automatizar esse cálculo e mostrar a recomendação dentro do módulo tributário já existente (`TributaryCalculator.tsx`).

---

## 2. Objetivo da Feature

Adicionar ao módulo tributário existente:

1. Um **calculador de Fator R** que recebe faturamento e pró-labore dos últimos 12 meses e retorna o Fator R, o anexo resultante e a alíquota efetiva.
2. Um **simulador "quanto falta"**: se o Fator R estiver abaixo de 28%, calcular o pró-labore mínimo necessário para atingir 28% e a economia tributária anual resultante.
3. Um **alerta visual** no card já existente quando o Fator R estiver perto do limiar (25%–28%), sugerindo ajuste.
4. Persistência da configuração por psicólogo (tabela `tax_config`, já definida no schema anterior).

---

## 3. Escopo

### Dentro do escopo
- Novo componente `FatorRCalculator.tsx` dentro de `src/pages/` ou `src/components/tributary/`
- Lógica de cálculo pura em `src/utils/taxCalculations.ts` (nova pasta `utils/` se não existir)
- Integração visual dentro da página `TributaryCalculator.tsx` (novo card abaixo do card de cálculo por sessão)
- Testes unitários da lógica de cálculo (Vitest)
- Atualização do schema SQL (campo já existe: `tax_config.fator_r`, adicionar `tax_config.folha_pagamento_anual` e `tax_config.prolabore_anual`)

### Fora do escopo
- Integração com backend real (API ainda não existe — usar estado local do componente, como o resto do protótipo)
- Envio de declaração fiscal / integração com e-CAC
- Cálculo de INSS detalhado sobre pró-labore (mencionar apenas como nota informativa)

---

## 4. Regras de Cálculo (lógica exata a implementar)

```typescript
// src/utils/taxCalculations.ts

export interface FatorRInput {
  faturamentoAnual: number   // R$, últimos 12 meses
  folhaPagamentoAnual: number // R$, últimos 12 meses (inclui pró-labore)
}

export interface FatorRResult {
  fatorR: number              // percentual, ex: 0.312 = 31.2%
  anexo: 'III' | 'V'
  aliquotaEfetivaEstimada: number // percentual aproximado, primeira faixa
  atingiuLimiar: boolean      // true se fatorR >= 0.28
}

const LIMIAR_FATOR_R = 0.28

// Alíquotas nominais da primeira faixa (RBT12 até R$ 180.000) — Simples Nacional 2026
const ALIQUOTA_ANEXO_III_FAIXA1 = 0.06
const ALIQUOTA_ANEXO_V_FAIXA1 = 0.155

export function calcularFatorR(input: FatorRInput): FatorRResult {
  if (input.faturamentoAnual <= 0) {
    throw new Error('Faturamento anual deve ser maior que zero')
  }

  const fatorR = input.folhaPagamentoAnual / input.faturamentoAnual
  const atingiuLimiar = fatorR >= LIMIAR_FATOR_R
  const anexo = atingiuLimiar ? 'III' : 'V'
  const aliquotaEfetivaEstimada = atingiuLimiar
    ? ALIQUOTA_ANEXO_III_FAIXA1
    : ALIQUOTA_ANEXO_V_FAIXA1

  return { fatorR, anexo, aliquotaEfetivaEstimada, atingiuLimiar }
}

export interface SimulacaoAjuste {
  prolaboreAnualNecessario: number   // valor mínimo p/ atingir 28%
  prolaboreAdicionalNecessario: number // diferença em relação ao atual
  economiaAnualEstimada: number      // diferença de imposto total anexo V vs III
}

export function simularAjusteParaAnexoIII(
  faturamentoAnual: number,
  folhaPagamentoAtual: number
): SimulacaoAjuste {
  const prolaboreAnualNecessario = Math.ceil(faturamentoAnual * LIMIAR_FATOR_R)
  const prolaboreAdicionalNecessario = Math.max(
    0,
    prolaboreAnualNecessario - folhaPagamentoAtual
  )

  const impostoAnexoV = faturamentoAnual * ALIQUOTA_ANEXO_V_FAIXA1
  const impostoAnexoIII = faturamentoAnual * ALIQUOTA_ANEXO_III_FAIXA1
  const economiaAnualEstimada = Math.max(0, impostoAnexoV - impostoAnexoIII)

  return {
    prolaboreAnualNecessario,
    prolaboreAdicionalNecessario,
    economiaAnualEstimada,
  }
}
```

**Nota importante**: as alíquotas acima são simplificadas (apenas a primeira faixa do Simples Nacional). Adicionar comentário no código deixando claro que é uma estimativa e que o cálculo real usa a tabela progressiva completa (5 ou 6 faixas por anexo) — não implementar a tabela completa nesta versão, apenas a faixa 1, mas deixar a estrutura de dados pronta para expansão futura (array de faixas, não valores soltos).

---

## 5. Especificação de UI

### 5.1 Localização
Novo card dentro de `TributaryCalculator.tsx`, posicionado **entre** o card "💰 Calculadora de Impostos por Sessão" e o card "👥 Pacientes - Status de Reajuste".

### 5.2 Layout do card "📐 Fator R — Simples Nacional"

```
┌─────────────────────────────────────────────┐
│ 📐 Fator R — Simples Nacional                │
│                                               │
│ Faturamento anual (R$)   [input: 96000]      │
│ Folha + pró-labore (R$)  [input: 18000]      │
│                                               │
│ ┌───────────────────────────────────────┐   │
│ │ Fator R: 18,8%                         │   │
│ │ Anexo: V (alíquota inicial ~15,5%)     │   │
│ │ ⚠️ Abaixo do limiar de 28%              │   │
│ └───────────────────────────────────────┘   │
│                                               │
│ 💡 Para cair no Anexo III (mais barato):     │
│ Aumente o pró-labore anual para R$ 26.880    │
│ (+R$ 8.880/ano, ou +R$ 740/mês)              │
│ Economia estimada: R$ 9.120/ano              │
└─────────────────────────────────────────────┘
```

### 5.3 Estados visuais
- **Fator R ≥ 28%**: bloco de resultado com `background: var(--bg-success)`, texto `var(--text-success)`, ícone ✅
- **Fator R entre 25% e 28%**: bloco com `background: var(--bg-warning)`, texto `var(--text-warning)`, ícone ⚠️, mensagem "Muito perto do limiar — pequeno ajuste resolve"
- **Fator R < 25%**: bloco com `background: var(--bg-warning)`, texto `var(--text-warning)`, ícone ⚠️
- Bloco de simulação de ajuste (`💡 Para cair no Anexo III`) só aparece quando `atingiuLimiar === false`

### 5.4 Componente React (estrutura esperada)

```tsx
// src/components/tributary/FatorRCalculator.tsx
import { useState, useMemo } from 'react'
import { calcularFatorR, simularAjusteParaAnexoIII } from '../../utils/taxCalculations'
import Card from '../Card'
import './FatorRCalculator.css'

export default function FatorRCalculator() {
  const [faturamentoAnual, setFaturamentoAnual] = useState(96000)
  const [folhaPagamentoAnual, setFolhaPagamentoAnual] = useState(18000)

  const resultado = useMemo(
    () => calcularFatorR({ faturamentoAnual, folhaPagamentoAnual }),
    [faturamentoAnual, folhaPagamentoAnual]
  )

  const simulacao = useMemo(
    () =>
      resultado.atingiuLimiar
        ? null
        : simularAjusteParaAnexoIII(faturamentoAnual, folhaPagamentoAnual),
    [resultado, faturamentoAnual, folhaPagamentoAnual]
  )

  // JSX conforme layout da seção 5.2/5.3
}
```

---

## 6. Alterações de Schema (SQL)

```sql
-- Adicionar à tabela tax_config já existente
ALTER TABLE tax_config
  ADD COLUMN faturamento_anual DECIMAL(12,2),
  ADD COLUMN folha_pagamento_anual DECIMAL(12,2),
  ADD COLUMN prolabore_anual DECIMAL(12,2);

-- fator_r já existe na tabela (DECIMAL(5,2)) — passa a ser calculado, não editado manualmente
COMMENT ON COLUMN tax_config.fator_r IS 'Calculado automaticamente: folha_pagamento_anual / faturamento_anual';
```

---

## 7. Testes (obrigatórios)

Criar `src/utils/taxCalculations.test.ts` com Vitest cobrindo:

1. `calcularFatorR` retorna Anexo III quando Fator R = exatamente 28%
2. `calcularFatorR` retorna Anexo V quando Fator R = 27,9%
3. `calcularFatorR` lança erro quando faturamento anual é 0 ou negativo
4. `simularAjusteParaAnexoIII` retorna `prolaboreAdicionalNecessario = 0` quando já está no Anexo III
5. `simularAjusteParaAnexoIII` calcula corretamente o valor necessário com faturamento de R$ 96.000 e folha de R$ 18.000 (esperado: necessário R$ 26.880, adicional R$ 8.880)
6. Teste de arredondamento (`Math.ceil`) não deve deixar o valor sugerido abaixo do limiar por causa de arredondamento para baixo

Adicionar script no `package.json` se ainda não existir:
```json
"scripts": {
  "test": "vitest run",
  "test:watch": "vitest"
}
```
Adicionar `vitest` e `@vitest/ui` como devDependencies.

---

## 8. Critérios de Aceite

- [ ] Card "Fator R" aparece na página Impostos, entre os dois cards existentes
- [ ] Alterar os campos de faturamento e folha atualiza o resultado em tempo real, sem precisar de botão "calcular"
- [ ] Resultado mostra corretamente Anexo III/V e alíquota estimada
- [ ] Quando Fator R < 28%, aparece o bloco de simulação com valor de pró-labore sugerido e economia anual
- [ ] Todos os valores monetários exibidos usam formatação `R$ X.XXX,XX` (usar `Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`)
- [ ] Nenhum valor `NaN` ou `Infinity` aparece na tela mesmo com inputs vazios ou zero (tratar com fallback e mensagem "Informe o faturamento" quando faturamento = 0)
- [ ] Testes unitários passam (`npm run test`)
- [ ] Build de produção não quebra (`npm run build`)
- [ ] Componente responsivo (testado em viewport 375px)
- [ ] Sem uso de `any` no TypeScript novo
- [ ] CSS segue o design system existente (usa `var(--*)`, sem cores hardcoded)

---

## 9. Fora de Escopo / Avisos Legais

Adicionar, no rodapé do card, o seguinte texto em `font-size: 11px; color: var(--text-muted)`:

> "Estimativa simplificada com base na primeira faixa do Simples Nacional (RBT12 até R$ 180.000/ano). Não substitui orientação contábil. Consulte um contador antes de alterar o pró-labore."

---

## 10. Ordem de Implementação Sugerida (para o agente)

1. Criar `src/utils/taxCalculations.ts` com as funções puras (seção 4)
2. Criar `src/utils/taxCalculations.test.ts` com os testes (seção 7)
3. Rodar testes e confirmar 100% passando antes de tocar em UI
4. Criar `src/components/tributary/FatorRCalculator.tsx` + `.css`
5. Importar e renderizar dentro de `src/pages/TributaryCalculator.tsx`, na posição indicada (seção 5.1)
6. Validar responsividade e formatação de moeda
7. Rodar `npm run build` para garantir que não há erros de tipo
8. Abrir PR na branch `feature/fator-r-calculator` com descrição resumindo os arquivos alterados

---

## 11. Arquivos Esperados ao Final

```
src/
├── utils/
│   ├── taxCalculations.ts          (novo)
│   └── taxCalculations.test.ts     (novo)
├── components/
│   └── tributary/
│       ├── FatorRCalculator.tsx    (novo)
│       └── FatorRCalculator.css    (novo)
└── pages/
    └── TributaryCalculator.tsx     (modificado — importa e renderiza o novo card)
```

---

**Fim da especificação.** Qualquer ambiguidade não coberta aqui deve seguir o padrão de código já existente no restante do repositório (nomenclatura em português para domínio de negócio, componentes em inglês/PascalCase, CSS em arquivo separado por componente).
