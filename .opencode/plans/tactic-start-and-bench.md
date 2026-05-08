# Plan: Tactic Start Phrases + Opponent Bench Position

## Goal
1. Adicionar comentários no início da partida descrevendo as tácticas escolhidas pelos treinadores
2. Colocar os suplentes do adversário por baixo do campo relvado no MatchPanel

---

## 1. Tactic Start Phrases

### 1a. `server/game/commentary.ts`

Adicionar função `tacticStartPhrase()` antes de `finalEndPhrase()`:

```ts
function tacticStartPhrase(
  homeName: string,
  homeFormation: string,
  homeStyle: string,
  awayName: string,
  awayFormation: string,
  awayStyle: string,
): string {
  const styleLabel = (s: string) => {
    switch (s) {
      case "OFENSIVO": return "estilo ofensivo";
      case "DEFENSIVO": return "estilo defensivo";
      default: return "equilibrado";
    }
  };
  return pickPhrase([
    `A ${homeName} estreia-se com um ${homeFormation} ${styleLabel(homeStyle)}, enquanto o ${awayName} opta por um ${awayFormation} ${styleLabel(awayStyle)}.`,
    `No grande jogo, ${homeName} joga de ${homeFormation} ${styleLabel(homeStyle)} contra o ${awayName} a ${awayFormation} ${styleLabel(awayStyle)}.`,
    `${homeName} prepara-se para um ${homeFormation} ${styleLabel(homeStyle)} e o ${awayName} responde com um ${awayFormation} ${styleLabel(awayStyle)}.`,
    // ... 6 frases adicionais
  ]);
}
```

Adicionar ao `export` no final do ficheiro:
```ts
  tacticStartPhrase,
```

### 1b. `server/game/engine.ts`

Na função `simulateMatchSegment`, modificar o bloco do minuto 1 (linhas 889-900):

```ts
if (minute === 1 && !fixture._firstHalfStartComment) {
  const homeName = fixture.homeTeam?.name || "Casa";
  const awayName = fixture.awayTeam?.name || "Fora";
  const homeFormation = homeTactic?.formation || "4-4-2";
  const awayFormation = awayTactic?.formation || "4-4-2";
  const homeStyle = homeTactic?.style || "EQUILIBRADO";
  const awayStyle = awayTactic?.style || "EQUILIBRADO";

  if (fixture.round === 5) {
    // Final da Taça — mantém frase existente
    fixture.events.push({
      minute,
      type: "phase_start",
      team: null,
      emoji: "🏟️",
      text: `[1'] 🏟️ ${finalStartPhrase()}`,
    });
  } else {
    // Liga normal — adiciona frase de táctica
    fixture.events.push({
      minute,
      type: "phase_start",
      team: null,
      emoji: "📋",
      text: `[1'] 📋 ${tacticStartPhrase(homeName, homeFormation, homeStyle, awayName, awayFormation, awayStyle)}`,
    });
  }
  fixture._firstHalfStartComment = true;
}
```

---

## 2. TabAdversario Bench Position

### `client/src/components/modals/MatchPanel.jsx`

Problema: O campo tem `aspectRatio: "16/10"` sem `maxHeight`, o que pode empurrar o banco para fora da área visível.

**Linha 373** — Adicionar `maxHeight` ao container do campo:

```jsx
<div className="relative w-full rounded-md overflow-hidden border border-emerald-900/60 bg-[linear-gradient(180deg,#05430e_0%,#0b5e1a_50%,#05430e_100%)]" style={{ aspectRatio: "16/10", maxHeight: "300px" }}>
```

Isto garante que o campo não ocupa mais de 300px de altura, permitindo que o banco de suplentes seja visível abaixo sem scroll.

---

## Files to Change
1. `server/game/commentary.ts` — adicionar `tacticStartPhrase()` + export
2. `server/game/engine.ts` — adicionar evento de táctica no minuto 1
3. `client/src/components/modals/MatchPanel.jsx` — adicionar `maxHeight` ao campo

## Testing
- `cd server && npm run typecheck`
- `cd server && npm run build`
- Verificar que o evento de táctica aparece no minuto 1 nos jogos da Liga
- Verificar que o banco do adversário é visível abaixo do campo no intervalo
