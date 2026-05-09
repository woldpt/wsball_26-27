# CashBall 26/27 — Agent Instructions (Compact)

## Quick Commands
| Action | Command |
|---|---|
| Backend dev | `cd server && npm run dev` |
| Backend typecheck | `cd server && npm run typecheck` |
| Backend build/start | `cd server && npm run build && npm run start` |
| Backend seed | `cd server && npm run seed` |
| Frontend dev | `cd client && npm run dev` |
| Frontend lint | `cd client && npm run lint` |
| Frontend JSDoc check | `cd client && npm run check:types` |
| Socket audit | `cd server && npm run audit:socketio` |
| Game-state audit | `cd server && npm run audit:gamestate <ROOM_CODE>` |
| Full stack | `docker compose up --build` |

## Non-Negotiables
- Frontend is **JavaScript only** (no TypeScript in `client/`). Use JSDoc hints.
- Backend is TypeScript; SQLite is the DB (avoid PostgreSQL-specific SQL types).
- UI/messages/comments in **Portuguese (PT)**.
- Narration phrases only in `server/game/commentary.ts` (never duplicate elsewhere).
- Socket listeners live in `client/src/hooks/useSocketListeners.js`; any new `handlers.setXxx` must exist in `handlers` passed from `client/src/App.jsx`.

## Current Market UX (latest)
- Market tab uses `TransferHub`, not `MarketTab`:
  - `client/src/App.jsx`
  - `client/src/components/ui/TransferHub.jsx`
- Layout: cards in desktop grid, single column in mobile.
- Cards support flip interaction and open `PlayerHistoryModal` via `requestPlayerHistory`.
- Cards use `PlayerAvatar` and show essential stats/actions.
- Visual tuning applied:
  - thicker card outlines (`border-2` / `ring-2`)
  - subtle team-color tint fill (from player/team primary color fallback chain).

## Game/State Core
- Source of season truth: `game.calendarIndex` (not `game.matchweek`).
- Phase machine: `lobby -> match_first_half -> match_halftime -> match_second_half -> [match_et_gate -> match_extra_time] -> match_finalizing -> lobby`.
- Transitional phases reset to `lobby` after server restart.
- `activeGames` in memory is primary runtime state; DB sync is selective.
- `game.lockedCoaches` is never persisted.
- Sync gates: `phaseToken` + `phaseAcks`.
- Segment double-run guard: `segmentRunning[roomCode]`.

## Important Mechanics
- Craques: only MED/ATA (`is_star = 1`), never GR/DEF.
- Squad limits: min 11, max 24; halftime substitutions max 3.
- Loans: max 5 active, 2.5% weekly interest.
- Stadium: up to 120,000 seats.
- Division 5 (Distritais): internal AI-only pool, hidden from players.
- Cache versioning: `/api/cache-version` mismatch triggers client storage wipe + reload.

## Architecture Pointers
- `server/index.ts`: Express + Socket.io entry.
- `server/gameManager.ts`: room and state lifecycle (`activeGames`).
- `server/game/engine.ts`: simulation core (mixed module style for compatibility).
- `server/socket*Handlers.ts`: Socket domains registration.
- `server/*Helpers.ts`: domain helpers via factory pattern (`createXxxHelpers(deps)`).
- `client/src/App.jsx`: root state orchestration.
- `client/src/hooks/useSocketListeners.js`: centralized socket listeners.

## UI/Design Guidelines
- Keep existing dark visual language and position accents:
  - GR `#eab308`, DEF `#3b82f6`, MED `#10b981`, ATA `#f43f5e`
- Keep sidebar overlay offsets compatible with `sidebarCollapsed` (`lg:left-14` / `lg:left-64`).
- Icons: Material Symbols Outlined.

## If Unsure
- Do not invent mechanics; ask before changing game rules.
