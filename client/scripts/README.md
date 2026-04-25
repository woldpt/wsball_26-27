# Client Scripts — Type & Style Validation

Scripts Node.js para validar tipos JSDoc e qualidade de código frontend.

## 📦 Requisitos

- Node.js 18+
- npm ou yarn

## 🎨 jsDocTypeChecker.js

Valida anotações de tipos JSDoc em componentes React e módulos.

### Uso

```bash
cd client
npm run check:types

# Ou diretamente:
node scripts/jsDocTypeChecker.js
```

### Validações

1. **Undocumented Parameters** — Funções com parâmetros mas sem `@param`
2. **Orphaned Documentation** — `@param` que não existem na assinatura
3. **Component Props** — Componentes React que desestruturem props sem documentação
4. **Type Consistency** — Variáveis com `@type` mas atribuições conflitantes

### Output

```
📋 Checking 47 JavaScript files...

─────────────────────────────────────────────────────────

❌ ERRORS:

   src/App.jsx:134
   Parameter(s) documented but not in signature: gameMode

⚠️  WARNINGS:

   src/App.jsx:45
   Undocumented parameter(s): gameState, setGameState

   src/components/TeamCard.jsx:12
   Undocumented parameter(s): teamData

ℹ️  SUGGESTIONS:

   src/AdminPanel.jsx:78
   Component 'MatchDay' destructures props but has no @param documentation

   src/utils/helpers.jsx:156
   Undocumented parameter(s): options

─────────────────────────────────────────────────────────

📊 Summary: 0 errors, 2 warnings, 3 suggestions
```

### Exit Codes

- `0` — Sem erros
- `1` — Erros encontrados

---

## 📝 JSDoc Best Practices

### Função com Parâmetros

```javascript
/**
 * Calcula a pontuação de um jogador baseada em atributos.
 * @param {number} goals - Número de golos marcados
 * @param {number} assists - Número de assistências
 * @param {boolean} isWinner - Se a equipa ganhou
 * @returns {number} Pontuação total (0-100)
 */
function calculatePlayerScore(goals, assists, isWinner) {
  return goals * 5 + assists * 3 + (isWinner ? 10 : 0);
}
```

### Componente React com Props

```javascript
/**
 * Card de apresentação de equipa.
 * @param {Object} props - Propriedades do componente
 * @param {number} props.teamId - ID da equipa
 * @param {string} props.teamName - Nome completo da equipa
 * @param {string} props.division - Divisão (e.g., "1ª Divisão")
 * @param {Array} props.players - Array de jogadores
 * @param {function} props.onSelect - Callback ao seleccionar equipa
 * @returns {JSX.Element}
 */
function TeamCard({ teamId, teamName, division, players, onSelect }) {
  return (
    <div onClick={() => onSelect(teamId)}>
      <h2>{teamName}</h2>
      <p>{division}</p>
      {/* ... */}
    </div>
  );
}
```

### Objetos Complexos

```javascript
/**
 * Simula uma jornada de campeonato.
 * @param {Object} params - Parâmetros de simulação
 * @param {Array<{homeTeamId: number, awayTeamId: number}>} params.fixtures - Fixtures a simular
 * @param {number} params.weekNumber - Número da jornada
 * @param {Object} params.weather - Condições de clima
 * @param {string} params.weather.condition - "sunny", "rainy", "snowy"
 * @param {number} params.weather.humidity - Humidade 0-100
 * @returns {Array<{homeTeamId: number, homeScore: number, awayScore: number}>}
 */
function simulateWeekend(params) {
  // ...
}
```

### Promises e Async

```javascript
/**
 * Obtém dados de um jogador da API.
 * @param {number} playerId - ID do jogador
 * @returns {Promise<{id: number, name: string, position: string}>}
 */
async function getPlayerData(playerId) {
  const response = await fetch(`/api/players/${playerId}`);
  return response.json();
}
```

---

## ✅ Checklist Pré-Merge

Antes de fazer merge de componentes ou lógica:

```bash
# 1. Lint de código
npm run lint

# 2. Type check JSDoc
npm run check:types

# 3. Build para verificar erros
npm run build

# 4. Preview local
npm run dev
# → Abrir http://localhost:5173 e testar o código novo
```

---

## 🔧 Troubleshooting

### "Checking X JavaScript files..." mas sem output

Certifique-se de que:
- `src/` diretório existe
- Há ficheiros `.js` ou `.jsx` em `src/`

### "Command not found: node"

```bash
# Instalar Node.js 18+
# https://nodejs.org/

# Ou usar nvm:
nvm install 18
nvm use 18
```

---

## 📊 Padrões Comuns

### Não documentar (menos crítico)

```javascript
// OK para funções internas/privadas:
function _sortPlayersByRating(players) {
  return players.sort((a, b) => b.rating - a.rating);
}

// OK para callbacks triviais:
const numbers = [1, 2, 3];
numbers.forEach(n => console.log(n));
```

### Padrão de Props Spread

```javascript
/**
 * Wrapper genérico de componente.
 * @param {Object} props
 * @param {string} props.className - Classes Tailwind
 * @param {Object} props.rest - Outras propriedades (spread)
 * @returns {JSX.Element}
 */
function Card({ className, ...rest }) {
  return <div className={`card ${className}`} {...rest} />;
}
```

---

## 🚀 Integração com CI/CD

### GitHub Actions

```yaml
- name: Type Check JSDoc
  run: npm run check:types
```

### Husky Pre-Commit

```bash
# .husky/pre-commit
npm run check:types
```

---

## 📈 Métricas

Executar periodicamente para monitorar qualidade:

```bash
# Guardar histórico
npm run check:types > typecheck-$(date +%Y%m%d).log
# Acompanhar warnings/errors ao longo do tempo
```
