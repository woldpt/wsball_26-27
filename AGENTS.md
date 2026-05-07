# CashBall 26/27 — Agent Instructions

## Essential Commands
| Action | Command |
|--------|---------|
| Backend Dev | `cd server && npm run dev` |
| Backend Typecheck | `cd server && npm run typecheck` |
| Backend Seed | `cd server && npm run seed` (real: `seed:real`) |
| Frontend Dev | `cd client && npm run dev` |
| Frontend Typecheck | `cd client && npm run check:types` |
| Audit Socket.io | `cd server && npm run audit:socketio` |
| Audit Game State | `cd server && npm run audit:gamestate <ROOM_CODE>` |
| Full Stack | `docker compose up --build` |

## Architecture Pitfalls
- **Frontend JS / Backend TS:** Client is **pure JavaScript**. Use JSDoc for types. Never add TS to `client/`.
- **`game/engine.ts` Quirk:** Uses **CommonJS** (`module.exports`). Other `game/` files use ESM. `engine.ts` re-exports them.
- **Socket Listeners:** Must be in `client/src/hooks/useSocketListeners.js`. **Crucial:** New listeners require a corresponding setter in the `handlers` object in `App.jsx` or they will be silent no-ops.
- **Sidebar Offsets:** Overlays/modals must use `lg:left-14` or `lg:left-64` to track `sidebarCollapsed` state.
- **Factory Pattern:** Use `createXxxHelpers(deps)`. Never instantiate helpers directly.
- **Portuguese (PT):** All UI text, messages, and code comments must be in Portuguese (PT).

## State & Data Flow
- **Game Truth:** `game.calendarIndex` is the source of truth for the season progress, **not** `game.matchweek`.
- **State Machine:** `gamePhase` (lobby → match_first_half → match_halftime → match_second_half → match_finalizing). Transit phases reset to `lobby` on server restart.
- **Memory vs DB:** `activeGames` (in-memory) is the primary state. DB sync is selective. `game.lockedCoaches` is **never** persisted to avoid permanent locks after crashes.
- **Synchronization:** Use `phaseToken` (UUID) to validate ACKs. A new token invalidates previous ACKs.
- ** la Cache Versioning:** Server `/api/cache-version` triggers a full `localStorage` wipe on the client if versions mismatch (prevents stale data after restart).

## Key Files
- `server/index.ts`: Entry point, Socket.io setup.
- `server/gameManager.ts`: Room and state management.
- `server/game/engine.ts`: Match simulation logic.
- `client/src/App.jsx`: Global state and core UI logic.
- `client/src/hooks/useSocketListeners.js`: Centralized socket event handling.
- `server/game/commentary.ts`: All simulation narration (never duplicate phrases).

## Cup Final (Taça de Portugal)
- **Round:** `round === 5` (Final), `calendarIndex 18` (last entry in `SEASON_CALENDAR`).
- **Venue:** Always "Jamor" (neutral ground). Set in `matchSummaryHelpers.ts:190` (history) and `matchSummaryHelpers.ts:296` (next match).
- **No home advantage:** Home advantage multiplier (1.08/0.92) is disabled in `engine.ts:919` when `fixture.round === 5`.
- **Commentary:** Dedicated functions in `commentary.ts`: `finalStartPhrase` (minute 1), `finalGoalPhrase` (goals), `finalEndPhrase` (match end). All in Portuguese.
- **Victory message:** Includes "no Estádio do Jamor" — `cupFlowHelpers.ts:949`.
- **Badge styling:** `App.jsx:2908` uses `bg-amber-500/20 text-amber-400` for Jamor venue. `CupTab.jsx:90` uses `bg-amber-500/30 text-amber-300 border border-amber-500/30` for isFinal label.
- **Draw skip:** Final draw is silent (no animation) — `cupFlowHelpers.ts:490`.
- **fixture.round:** Added to `startCupRound` enriching in `cupFlowHelpers.ts:470` so engine can detect finals.
