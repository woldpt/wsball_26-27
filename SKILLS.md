# CashBall Skills — Auditing & Validation Tools

Este documento descreve os 3 skills personalizados criados para otimizar o projecto CashBall.

---

## 1. 🎮 Game State Audit

**Objetivo:** Validar integridade do estado do jogo durante simulações, evitando bugs subtis em mecânicas complexas.

**Localização:** `server/scripts/gameStateAudit.ts`

### O que valida

- **Orçamentos de equipas:** Detecta inconsistências entre budget e obrigações salariais
- **Composição de equipas:** Verifica se cada equipa tem suficientes jogadores por posição (GR≥1, DEF≥3, MED≥3, ATA≥1)
- **Duplicatas:** Identifica o mesmo jogador em múltiplas equipas
- **Contratos:** Detecta contratos expirados ou inválidos
- **Fases de jogo:** Valida transições de estado (pending → first_half → halftime → etc)
- **Integridade de transferências:** Encontra transferências orfãs (time de origem deletado)

### Uso

```bash
# Auditar uma sala específica
npx tsx server/scripts/gameStateAudit.ts SALA123

# Exemplo de output
# 📋 Auditing game state for room SALA123...
# ❌ Team FC Porto has massive negative budget (-5000) vs salary obligations (8000)
# ⚠️  Team Benfica has insufficient DEF players (2 < 3)
# 📊 Summary: 2 errors, 3 warnings, 0 infos
```

### Quando usar

- Após simulações de jornada (antes de salvar estado)
- Antes de executar leilões ou transferências
- Quando há reports de comportamentos estranhos em jogo
- Rotineiramente como health check do servidor

---

## 2. 🔌 Socket.io Event Contract Validator

**Objetivo:** Garantir que eventos Socket.io emitidos/recebidos respeitam contratos de dados, evitando bugs de sincronização.

**Localização:** `server/scripts/socketioContractValidator.ts`

### O que valida

- **Eventos órfãos:** Detecta eventos emitidos mas nunca escutados (vazamento)
- **Handlers órfãos:** Encontra listeners de eventos que nunca são emitidos
- **Conflitos:** Identifica múltiplos handlers para o mesmo evento
- **Convenções:** Valida camelCase, evita nomes genéricos como "data" ou "message"

### Uso

```bash
# Validar todos os eventos Socket.io
npx tsx server/scripts/socketioContractValidator.ts

# Exemplo de output
# ⚠️  Event 'playerSubstituted' is emitted but never listened to
#     At: socketGameplayHandlers.ts:156
# 
# ⚠️  Event 'updateBalance' has 2 handlers (potential conflicts)
#     At: socketFinanceHandlers.ts:45, socketSessionHandlers.ts:89
# 
# 📝 Event registry saved to: server/socketEventRegistry.json
```

### Artefato gerado

`server/socketEventRegistry.json` — mapa de todos os eventos e onde são emitidos/recebidos:

```json
{
  "matchStarted": {
    "emit": ["socketGameplayHandlers.ts", "matchFlowHelpers.ts"],
    "receive": ["socketGameplayHandlers.ts"]
  },
  "playerSubstituted": {
    "emit": ["socketGameplayHandlers.ts"],
    "receive": []
  }
}
```

### Quando usar

- Após adicionar novos eventos Socket.io
- Antes de fazer merge de PRs que toquem em comunicação em tempo real
- Para documentar a arquitetura de eventos
- Para identificar pontos de sincronização frágeis

---

## 3. 🎨 Frontend JSDoc Type Checker

**Objetivo:** Validar anotações de tipos JSDoc em React, garantindo consistência sem adicionar TypeScript.

**Localização:** `client/scripts/jsDocTypeChecker.js`

### O que valida

- **Parâmetros não documentados:** Funções com parâmetros mas sem `@param`
- **Parâmetros não usados:** `@param` que não existem na assinatura
- **Componentes sem props docs:** Componentes React que desestruturem props sem `@param`
- **Inconsistências de tipo:** Variáveis com `@type` mas atribuições conflitantes

### Uso

```bash
# Validar todos os ficheiros JS/JSX
node client/scripts/jsDocTypeChecker.js

# Exemplo de output
# ⚠️  WARNINGS:
#    src/App.jsx:45
#    Undocumented parameter(s): gameState, setGameState
#
#    src/components/TeamCard.jsx:12
#    Parameter(s) documented but not in signature: teamData
#
# ℹ️  SUGGESTIONS:
#    src/AdminPanel.jsx:78
#    Component 'MatchDay' destructures props but has no @param documentation
#
# 📊 Summary: 0 errors, 3 warnings, 1 suggestions
```

### Padrão JSDoc recomendado

```javascript
/**
 * Renders a player card with stats.
 * @param {Object} props
 * @param {number} props.playerId - ID do jogador
 * @param {string} props.name - Nome completo
 * @param {Array<{label: string, value: number}>} props.stats - Estatísticas
 * @param {function} props.onSelect - Callback ao clicar
 * @returns {JSX.Element}
 */
function PlayerCard({ playerId, name, stats, onSelect }) {
  // ...
}
```

### Quando usar

- Antes de code review de componentes novos
- Para onboarding de novos contributors
- Como health check mensal do codebase frontend
- Antes de grandes refactors

---

## 📊 Integração com CI/CD

### GitHub Actions (exemplo)

```yaml
name: Code Quality

on: [push, pull_request]

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18

      - name: Install deps
        run: npm install --workspaces

      - name: Game State Audit
        run: npx tsx server/scripts/gameStateAudit.ts TEST-ROOM
        continue-on-error: true

      - name: Socket.io Validation
        run: npx tsx server/scripts/socketioContractValidator.ts

      - name: JSDoc Type Check
        run: node client/scripts/jsDocTypeChecker.js
```

---

## 📝 Notas de Arquitetura

### Por que 3 skills separados?

1. **Game State Audit** — valida dados persistidos (DB); crítico para integridade de campanha
2. **Socket.io Contract** — valida comunicação em tempo real; crítico para sincronização multiplayer
3. **JSDoc Type Checker** — valida código frontend; melhora confiança sem TypeScript

Cada um tem domínio e periodicidade diferente:
- Game State: após eventos de jogo
- Socket.io: após código novo
- JSDoc: antes de merges

### Limites e anti-padrões

- **Game State Audit** não substitui testes de lógica — valida invariantes, não comportamento
- **Socket.io Validator** não valida payloads — apenas estrutura de eventos e nomeação
- **JSDoc Checker** não substitui TypeScript — é lint apenas, não compilação

---

## 🔄 Fluxo Recomendado

```
Desenvolvimento local:
  1. Escrever código/feature
  2. npm run dev (backend + frontend)
  3. Testar feature manualmente
  4. npx tsx server/scripts/socketioContractValidator.ts (se toquei Socket.io)
  5. node client/scripts/jsDocTypeChecker.js (se toquei React)
  6. Commit + push

Antes de merge:
  1. npx tsx server/scripts/socketioContractValidator.ts
  2. node client/scripts/jsDocTypeChecker.js
  3. (Après simulação num ambiente de teste)
  4. npx tsx server/scripts/gameStateAudit.ts TEST-ROOM-CODE
  5. Merge

Maintenance semanal:
  1. game state audit em todas as salas ativas
  2. Revisar socketEventRegistry.json para eventos órfãos
  3. Corrigir warnings JSDoc
```

---

## 💡 Exemplo: Encontrando um Bug com Estes Skills

**Cenário:** "Às vezes jogadores desaparecem do banco depois de uma substituição"

**Investigação:**

```bash
# 1. Validar estado após jornada problemática
npx tsx server/scripts/gameStateAudit.ts ROOM123
# → Detecta: "Player 'João' appears 2 times in active squads"
#   Ah! Está duplicado em 2 equipas.

# 2. Validar eventos de substituição
npx tsx server/scripts/socketioContractValidator.ts
# → Aviso: "Event 'playerSubstituted' is emitted but never listened to"
#   O frontend não escuta! Não atualiza UI.

# 3. Confirmar tipos
node client/scripts/jsDocTypeChecker.js
# → "Undocumented parameter(s): playerId, substitutedPlayerId"
#   No handler, faltam docs. Fácil perceber que é novo/incompleto.
```

**Root cause encontrado:** Evento `playerSubstituted` é emitido mas o frontend nunca escuta → UI desincronizada.

---

## 📚 Recursos Adicionais

- Frequência recomendada: Game State (diária), Socket.io (por commit), JSDoc (semanal)
- Todos os scripts têm `--help` integrado
- Logs salvos em `server/.audit-logs/` para histórico
