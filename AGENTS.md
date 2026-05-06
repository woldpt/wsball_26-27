# CashBall 26/27 — Agent Instructions

## Quick Start

```bash
# Full stack
docker compose up --build

# Dev (two terminals)
cd server && npm run dev        # Express + Socket.io, tsx hot-reload
cd client && npm run dev        # Vite dev server
```

## Commands

| Action | Command |
|--------|---------|
| Backend dev | `cd server && npm run dev` |
| Backend build | `cd server && npm run build && npm start` |
| Backend typecheck | `cd server && npm run typecheck` |
| Backend seed (mock) | `cd server && npm run seed` |
| Backend seed (real data) | `cd server && npm run seed:real` |
| Frontend dev | `cd client && npm run dev` |
| Frontend lint | `cd client && npm run lint` |
| Frontend JSDoc check | `cd client && npm run check:types` |
| Socket.io audit | `cd server && npm run audit:socketio` |
| Game state audit | `cd server && npm run audit:gamestate <ROOM_CODE>` |

## Architecture

- **Backend:** Express 5 + Socket.io 4 in **TypeScript** (`server/`). Entry: `index.ts`. Game logic split across `game/` (engine, commentary, playerUtils, matchCalculations) and `*Helpers.ts` files by domain.
- **Frontend:** React 19 + Vite 8 in **JavaScript** (`client/src/`). No TypeScript.
- **DB:** SQLite file at `server/db/base.db` (ignored in git).
- **Docker:** Backend port 3000; frontend on fixed IP `172.100.0.57` via external network `cftunnel`.

## Critical Conventions

- **Frontend is JS, never TS.** Use JSDoc for type hints.
- **Socket listeners live in** `client/src/hooks/useSocketListeners.js`. All `socket.on()` calls go there. When adding new listeners that call `handlers.setXxx`, ensure the setter is included in the `handlers` object passed from `App.jsx` — omissions cause silent no-ops.
- **Tabs** are in `client/src/views/`. Each receives state as props. Only `BracketTab` accesses the socket directly. `live` and `tactic` tabs are inline in `App.jsx`.
- **`game/engine.ts`** uses CommonJS (`module.exports`) for compatibility. Other `game/` files use ES modules. Re-exports via `engine.ts` allow external imports like `import { withJuniorGRs } from "./game/engine"`.
- **All narration** is in `game/commentary.ts`. Never duplicate phrases elsewhere.
- **Portuguese (PT)** for all UI text, messages, and code comments.
- **`auth.js` and `adminRoutes.js`** are intentionally JavaScript — do not convert to TypeScript.
- **Sidebar overlays** (auction blinds, overlays) must offset with `lg:left-14` / `lg:left-64` to track `sidebarCollapsed` state in `App.jsx`.

## Game Flow Gotchas

- **Async submission, sync simulation:** Matchdays advance when all humans submit tactics, but simulation requires all humans to confirm "Pronto" at checkpoints (start, halftime, extra time).
- **Division 5 (Distritais)** exists only internally as an AI team pool. Invisible to humans.
- **Craques** (star players) only exist for MED and ATA positions. Never assign to GR or DEF.
- **Referee bias** is random per match, not a fixed attribute. Does not apply to penalty shootout conversion probabilities.
- **Leilões (auctions)** pop up for all 32 human coaches with a 15-second real-time timer. Each club gets one bid.
- **Convites de promoção** (job offers) são permanentes — sem expiração. O treinador deve aceitar ou recusar imediatamente. Se não aceitar, permanece no clube actual.
- **Máximo 1 despedimento por época** — na segunda vez, o treinador é rebaixado para a divisão inferior em vez de ser despedido (divisões 1–3). Div 4 → despedimento obrigatório.

## Dismissal & Transfer System

### Dismissal triggers (per matchweek, via `coachDismissalHelpers.ts`)

**By results (human coaches):**
| Losses in last 5 games | Dismissal chance |
|------------------------|------------------|
| 3                      | 10%              |
| 4                      | 35%              |
| 5                      | 70%              |

**By budget (negative budget streak):**
| Consecutive negative budget games | Dismissal chance |
|-----------------------------------|------------------|
| 3                                 | 40%              |
| 4                                 | 70%              |
| ≥5                                | 95% (max)        |

Streak resets when budget returns to positive.

**NPC teams:** 5 losses in 5 games → automatic dismissal (no randomness).

### One dismissal per season

`game.dismissalsThisSeason.has(coachName)` tracks dismissals.
- **Divisions 1–3:** Second dismissal → `demoteCoach()` (dropped to next division with a random NPC team).
- **Division 4:** Second dismissal → mandatory dismissal (div 5 is not playable).

### Job offers (promotion invites)

| Wins in last 5 games | Invite chance |
|----------------------|---------------|
| 3                    | 8%            |
| 4                    | 25%           |
| 5                    | 55%           |

- Only for coaches in divisions 2–4.
- **No expiration** — permanent until accepted or declined.
- Offered to a random NPC team in the division above.
- If declined, coach stays at current club.

### Auto-assignment after dismissal

`autoAssignDismissedCoach()` finds a random available NPC team in the same division or lower (up to div 4).

### Key files

- `server/coachDismissalHelpers.ts` — all dismissal/transfer logic
- `server/types.ts` — `ActiveGame` type with `dismissalsThisSeason`, `pendingJobOffers`, `negativeBudgetStreak`
- `client/components/modals/JobOfferModal.jsx` — job offer UI

## Recent Changes

### 2026-05-06 — Calendário determinístico com alternância rígida

- **`fixtureSeeds`** agora é persistido em `game_state` (DB) para recuperação após crash
- **`generateFixturesForDivision`** usa Fisher-Yates shuffle + método circular com `(i + round) % 2` para alternância rígida Casa/Fora em TODAS as equipas (humanas e NPC)
- **`swapMap` removido** — já não há alternância especial para equipa do jogador
- **`applySeasonEnd()`** gera `fixtureSeeds` para a próxima época a partir do ranking final
- Key files: `server/game/engine.ts`, `server/weeklyFlowHelpers.ts`, `server/cupFlowHelpers.ts`, `server/gameManager.ts`, `server/types.ts`

### 2026-05-06 — Indisponibilidades contam na taça

- **`finalizeCupRound()`** agora reduz `injury_until_matchweek`, `suspension_until_matchweek` e `transfer_cooldown_until_matchweek` em 1 para todos os jogadores das equipas que jogaram a taça (vencedores e derrotados)
- Usa `MAX(0, ...)` para prevenir valores negativos
- Key file: `server/cupFlowHelpers.ts:961-977`

### 2026-05-05 — Sons de notificação apenas para equipa do jogador

- **`App.jsx`** e **`useSocketListeners.js`** agora verificam `me?.teamId` em vez de `hasHuman` para sons de notificação, golos e VAR
- **`playGoalSound()` removido** do bloco de penalties em partidas não-participantes
- Key files: `client/src/App.jsx:614-650`, `client/src/hooks/useSocketListeners.js:656-853`, `client/src/utils/audio.js`

## Files to Read First

1. `CLAUDE.md` — full project guide (architecture, UI, conventions)
2. `README.md` — game mechanics and rules
3. `SKILLS.md` — auditing/validation tools
4. `.skillsrc` — quick skill reference

## Style

- Small, cohesive files. Extract modules at ~500 lines.
- Group by responsibility, not convenience.
- Dark palette: base `#0d0d14`, surfaces `#18181f`, borders `#26263a`. Position accents: GR yellow, DEF blue, MED green, ATA pink. Gold `#d4af37` for premium elements.
