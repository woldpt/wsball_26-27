# Server Scripts — Auditing & Validation

Scripts Node.js para validar estado do jogo, comunicação Socket.io e outras invariantes.

## 📦 Requisitos

- Node.js 18+
- npm ou yarn
- TypeScript compiler (tsx)

## 🎮 gameStateAudit.ts

Valida integridade do estado da base de dados de uma sala de jogo.

### Uso

```bash
cd server
npm run audit:gamestate <ROOM_CODE>

# Exemplos:
npm run audit:gamestate ROOM123
npm run audit:gamestate ABC456
```

### Validações

1. **Team Budgets** — Detecta orçamentos inconsistentes vs. obrigações salariais
2. **Squad Composition** — Verifica se cada equipa tem mínimo de jogadores por posição
3. **Duplicate Players** — Encontra o mesmo jogador em múltiplas equipas (erro crítico)
4. **Contract Expiry** — Identifica contratos com datas inválidas
5. **Match Phases** — Valida estados de jogo (pending, first_half, halftime, etc.)
6. **Transfers Integrity** — Encontra referências orfãs (time deletado, transfer mantida)

### Output

```
📋 Auditing game state for room ROOM123...

─────────────────────────────────────────────────────────
📁 BUDGET
  ❌ Team FC Porto has massive negative budget (-5000) vs salary (8000)
     {"teamId": 1, "budget": -5000, "totalSalary": 8000}

📁 SQUAD
  ⚠️  Team Benfica has insufficient DEF players (2 < 3)
     {"teamId": 2, "position": "DEF", "count": 2}

─────────────────────────────────────────────────────────
📊 Summary: 1 errors, 1 warnings, 0 infos
```

### Exit Codes

- `0` — Nenhum erro encontrado
- `1` — Erros críticos detectados

---

## 🔌 socketioContractValidator.ts

Valida que eventos Socket.io respeitam contratos de emissão/recepção.

### Uso

```bash
cd server
npm run audit:socketio

# Gera arquivo de registry:
# → server/socketEventRegistry.json
```

### Validações

1. **Orphaned Emissions** — Eventos emitidos mas nunca escutados
2. **Orphaned Handlers** — Listeners para eventos que nunca são emitidos
3. **Duplicate Handlers** — Múltiplos listeners para o mesmo evento (conflito)
4. **Naming Convention** — Verifica camelCase, detecta nomes genéricos

### Output

```
🔌 Validating Socket.io event contracts...

✓ Found 42 unique socket events

─────────────────────────────────────────────────────────
📋 Issues Found:

❌ playerSubstituted
   Event 'playerSubstituted' is emitted but never listened to
   At: socketGameplayHandlers.ts:156

⚠️  updateBalance
   Event 'updateBalance' has 2 handlers (potential conflicts)
   At: socketFinanceHandlers.ts:45, socketSessionHandlers.ts:89

─────────────────────────────────────────────────────────
📊 Summary: 1 errors, 1 warnings

📝 Event registry saved to: server/socketEventRegistry.json
```

### Registry Format

```json
{
  "matchStarted": {
    "emit": ["socketGameplayHandlers.ts"],
    "receive": ["socketGameplayHandlers.ts", "socketSessionHandlers.ts"]
  },
  "playerSubstituted": {
    "emit": ["socketGameplayHandlers.ts"],
    "receive": []
  }
}
```

---

## 📋 Checklist Pré-Merge

Antes de fazer merge de código que toque em jogo ou comunicação:

```bash
# 1. Compilar e verificar tipos
npm run typecheck

# 2. Validar eventos (se tocou Socket.io)
npm run audit:socketio

# 3. Validar estado (em ambiente de teste)
npm run audit:gamestate TEST-ROOM-12345

# 4. Revisar registry de eventos
cat socketEventRegistry.json | jq '.[] | select(.receive | length == 0)'
```

---

## 🔧 Troubleshooting

### "Database not found"

```
❌ Database not found: /path/to/game_ROOM123.db
```

**Solução:** Certifique-se de que a sala foi criada e tem uma base de dados gerada.

### "Cannot find module 'sqlite3'"

```
npm install
```

### "Permission denied"

```bash
# Se o script não tem permissão de execução:
chmod +x scripts/gameStateAudit.ts
```

---

## 📊 Métricas e Histórico

Para manter histórico de auditorias:

```bash
# Guardar resultado em arquivo
npm run audit:gamestate ROOM123 > audit-$(date +%Y%m%d-%H%M%S).log
```

---

## 🚀 Integração com CI/CD

### GitHub Actions

```yaml
- name: Audit Game State
  run: npm run audit:gamestate TEST-ROOM
  continue-on-error: true

- name: Validate Socket.io
  run: npm run audit:socketio
```

### Husky Pre-Commit

```bash
# .husky/pre-commit
npm run audit:socketio
```
