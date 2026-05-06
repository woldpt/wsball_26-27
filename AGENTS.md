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

- **Backend:** Express 5 + Socket.io 4 in **TypeScript** (`server/`). Entry: `index.ts`. `tsconfig.json` has `strict: false`.
- **Frontend:** React 19 + Vite 8 in **JavaScript** (`client/src/`). No TypeScript. Vite proxies `/auth`, `/saves`, `/admin` to `localhost:3000`.
- **DB:** SQLite file at `server/db/base.db` (ignored in git). Also `accounts.db` and `global_chat.db`.
- **Docker:** Backend port 3000; frontend on fixed IP `172.100.0.57` via external network `cftunnel`.
- **Factory pattern:** All domain helpers use `createXxxHelpers(deps)`. Never instantiate directly.
- **Socket handlers:** 7 files (`socket*Handlers.ts`) register via `registerXxxSocketHandlers(socket, deps)` inside `io.on("connection")`.

## Critical Conventions

- **Frontend is JS, never TS.** Use JSDoc for type hints.
- **Socket listeners live in** `client/src/hooks/useSocketListeners.js`. All `socket.on()` calls go there. When adding new listeners that call `handlers.setXxx`, ensure the setter is included in the `handlers` object passed from `App.jsx` — omissions cause silent no-ops.
- **Tabs** are in `client/src/views/` (9 files). Each receives state as props. Only `BracketTab` accesses the socket directly. `live` and `tactic` tabs are inline in `App.jsx`.
- **`game/engine.ts`** uses CommonJS (`module.exports`) for compatibility. Other `game/` files use ES modules. Re-exports via `engine.ts` allow `import { withJuniorGRs } from "./game/engine"`.
- **All narration** is in `game/commentary.ts`. Never duplicate phrases elsewhere.
- **Portuguese (PT)** for all UI text, messages, and code comments.
- **`auth.js` and `adminRoutes.js`** are intentionally JavaScript — do not convert to TypeScript.
- **Sidebar overlays** (auction blinds, overlays) must offset with `lg:left-14` / `lg:left-64` to track `sidebarCollapsed` state in `App.jsx`.

## State Machine Gotchas

- **`game.calendarIndex`** is the source of truth for season progression. `game.matchweek` is a convenience field — not the source of truth.
- **`lockedCoaches`** is a Set that blocks transfers/tactics during simulation. **Never persisted to DB** — coaches are added to it on reconnect via `assignPlayer()`. Persisting would cause permanent lockups after crash.
- **`phaseToken` (UUID) + `phaseAcks` (Set)** coordinate multi-player actions. A new token invalidates previous ACKs — always verify the token is still current before advancing.
- **`segmentRunning[game.roomCode]`** guard prevents double `runMatchSegment()` calls. Check before every segment invocation.
- **Halftime timeout:** 120s safety timeout. If no coaches connected, auto-advance. If coaches are connected, wait indefinitely — never force while they're adjusting substitutions.
- **Cup draw** is prepared at the **end of the previous event**, not at the start of the cup match. Coaches see opponents and set tactics in the lobby before kickoff.

## Game Flow Gotchas

- **Async submission, sync simulation:** Matchdays advance when all humans submit tactics, but simulation requires all humans to confirm "Pronto" at checkpoints (start, halftime, extra time).
- **Division 5 (Distritais)** exists only internally as an AI team pool. Invisible to humans.
- **Craques** (star players) only exist for MED and ATA positions. Never assign to GR or DEF.
- **Referee bias** is random per match, not a fixed attribute. Does not apply to penalty shootout conversion probabilities.
- **Leilões (auctions)** pop up for all 32 human coaches with a 15-second real-time timer. Each club gets one bid.
- **Convites de promoção** (job offers) são permanentes — sem expiração. O treinador deve aceitar ou recusar imediatamente.
- **Máximo 1 despedimento por época** — na segunda vez, o treinador é rebaixado para a divisão inferior em vez de ser despedido (divisões 1–3). Div 4 → despedimento obrigatório.

## Persistence Gotchas

- **`activeGames` map** in `gameManager.ts` is the only live copy. Sync with DB is **selective, not continuous**.
- **Transient state** (fixtures, lineups, current minute during simulation) — memory only; written via `saveGameState()` on specific events.
- **Persistent state** (standings, player records, transfer history, budgets) — written to DB immediately after each mutation.
- **After restart**, transient phases are discarded. Coaches must reconnect and confirm "Pronto" again.

## Dismissal & Transfer System

**Key file:** `server/coachDismissalHelpers.ts`

**Dismissal triggers (human coaches, per matchweek):**

| Losses in last 5 games | Dismissal chance |
|------------------------|------------------|
| 3                      | 10%              |
| 4                      | 35%              |
| 5                      | 70%              |

| Consecutive negative budget games | Dismissal chance |
|-----------------------------------|------------------|
| 3                                 | 40%              |
| 4                                 | 70%              |
| ≥5                                | 95% (max)        |

Streak resets when budget returns to positive.

**NPC teams:** 5 losses in 5 games → automatic dismissal (no randomness).

**One dismissal per season:** `game.dismissalsThisSeason.has(coachName)` tracks dismissals.
- Divisions 1–3: Second dismissal → `demoteCoach()` (dropped to next division with random NPC team).
- Division 4: Second dismissal → mandatory dismissal.

**Job offers:**

| Wins in last 5 games | Invite chance |
|----------------------|---------------|
| 3                    | 5%            |
| 4                    | 15%           |
| 5                    | 35%           |

- Only divisions 2–4. No expiration. Random NPC team in division above. Declined → coach stays.

**Key files:** `server/types.ts` (`ActiveGame` with `dismissalsThisSeason`, `pendingJobOffers`, `negativeBudgetStreak`), `client/components/modals/JobOfferModal.jsx`

## Recent Changes

### 2026-05-06 — Deterministic fixture calendar with rigid H/A alternation
- **`fixtureSeeds`** now persisted in `game_state` (DB) for crash recovery.
- Fisher-Yates shuffle + circular method `(i + round) % 2` for rigid H/A alternation on ALL teams.
- **`swapMap` removed** — no more special alternation for player's team.
- **`applySeasonEnd()`** generates `fixtureSeeds` for next season from final rankings.
- Files: `engine.ts`, `weeklyFlowHelpers.ts`, `cupFlowHelpers.ts`, `gameManager.ts`, `types.ts`

### 2026-05-06 — Cup unavailability counts
- **`finalizeCupRound()`** reduces `injury_until_matchweek`, `suspension_until_matchweek`, `transfer_cooldown_until_matchweek` by 1 for all players on teams that played the cup (winners and losers).
- Uses `MAX(0, ...)` to prevent negative values.
- File: `cupFlowHelpers.ts:961-977`

### 2026-05-05 — Notification sounds only for player's team
- **`App.jsx`** and **`useSocketListeners.js`** now check `me?.teamId` instead of `hasHuman` for notification, goal, and VAR sounds.
- Files: `App.jsx:614-650`, `useSocketListeners.js:656-853`, `utils/audio.js`

## Files to Read First

1. `CLAUDE.md` — full project guide (architecture, UI, conventions, state machine)
2. `README.md` — game mechanics and rules
3. `SKILLS.md` — auditing/validation tools
4. `.skillsrc` — quick skill reference

## Style

- Small, cohesive files. Extract modules at ~500 lines.
- Group by responsibility, not convenience.
- Dark palette: base `#0d0d14`, surfaces `#18181f`, borders `#26263a`. Position accents: GR yellow, DEF blue, MED green, ATA pink. Gold `#d4af37` for premium elements.
