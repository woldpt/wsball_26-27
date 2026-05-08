# CashBall 26/27 — Agent Instructions

## Essential Commands
| Action | Command |
|--------|---------|
| Backend Dev | `cd server && npm run dev` |
| Backend Typecheck | `cd server && npm run typecheck` |
| Backend Build | `cd server && npm run build && npm start` |
| Backend Seed | `cd server && npm run seed` (real env: `seed:real`) |
| Frontend Dev | `cd client && npm run dev` |
| Frontend Lint | `cd client && npm run lint` |
| Frontend JSDoc Check | `cd client && npm run check:types` |
| Audit Socket.io | `cd server && npm run audit:socketio` |
| Audit Game State | `cd server && npm run audit:gamestate <ROOM_CODE>` |
| Full Stack | `docker compose up --build` |

## Architecture Pitfalls
- **Frontend JS / Backend TS:** Client is **pure JavaScript**. Use JSDoc for types. Never add TS to `client/`.
- **`game/engine.ts` Mixed Modules:** Starts with ESM `import` but ends with `module.exports = {…}` (line 1487). `index.ts` uses `require("./game/engine")`. Other `game/` files use ESM `export`.
- **Socket Listeners:** All `socket.on()` live in `client/src/hooks/useSocketListeners.js`. **Crucial:** new listeners that call `handlers.setXxx` need the setter added to the handlers object in `App.jsx:372` or they are silent no-ops.
- **Sidebar Offsets:** Overlays/modals must track `sidebarCollapsed` with `lg:left-14` (collapsed) / `lg:left-64` (expanded) — see `App.jsx:5331`.
- **Factory Pattern:** Use `createXxxHelpers(deps)`. Never instantiate helpers directly.
- **Socket Handlers:** `registerXxxSocketHandlers(socket, deps)` in 7 files under `server/`. Called inside `io.on("connection")` in `index.ts`.
- **Portuguese (PT):** All UI text, messages, and code comments must be in Portuguese (PT).

## State & Data Flow
- **Game Truth:** `game.calendarIndex` (0-based, 0–18) is the source of truth for season progress, **not** `game.matchweek`.
- **State Machine:** `gamePhase` (lobby → match_first_half → match_halftime → match_second_half → match_finalizing). Transit phases reset to `lobby` on server restart (prevents permanently locked games).
- **Memory vs DB:** `activeGames` (in-memory map in `gameManager.ts`) is the primary state. DB sync is selective. `game.lockedCoaches` is **never** persisted — avoids permanent locks after crashes.
- **Synchronization:** `phaseToken` (UUID per phase) + `phaseAcks` (Set of coach names) coordinate multi-player actions. New token invalidates previous ACKs.
- **Segment Guard:** `segmentRunning[game.roomCode]` boolean prevents double-execution of `runMatchSegment`.
- **Cache Versioning:** Server `/api/cache-version` returns `{ version: SERVER_START_TIME }`. Client compares with `localStorage.cashball_cache_version`; on mismatch, full `localStorage` wipe and reload.

## Game Mechanics (Key Facts)
- **Craques:** ~10% of MED/ATA (`is_star = 1`). +20% decisive goal probability per star in starting XI (cap 60%). 3+ stars → ego conflict (−10% per extra star, cap −30%). GR and DEF never craques.
- **Moral:** 0–100, starts at 50. Win +10, Draw 0, Loss −15. Attack bonus = `(moral − 50) × 0.005` (±50%). Shared across Liga and Taça, belongs to the club.
- **Squad:** Min 11 (1 GR mandatory), max 24. Substitutions at halftime: up to 3 total.
- **Interest:** 2.5% per week on loans (max 5 active).
- **Stadium:** €300,000 per 5,000 seats (max 120,000).
- **Referee:** Random inclination per game (±15% on cards/penalties). Does NOT affect penalty shootout conversion.
- **Division 5 (Distritais):** Internal-only AI pool in `gameConstants.ts`. Invisible to players; promotion via simple draw.

## Cup Final (Taça de Portugal)
- **Round:** `round === 5` (Final), `calendarIndex === 18` (last entry in `SEASON_CALENDAR`).
- **Venue:** Always "Jamor" (neutral ground). Set in `matchSummaryHelpers.ts:190` (history) and `matchSummaryHelpers.ts:296` (next match).
- **No home advantage:** `fixture.round !== 5` guard at `engine.ts:935` disables 1.08/0.92 multiplier for finals.
- **Commentary:** Dedicated functions in `commentary.ts`: `finalStartPhrase` (minute 1), `finalGoalPhrase` (goals), `finalEndPhrase` (match end). All in Portuguese.
- **Victory message:** Includes "no Estádio do Jamor" — `cupFlowHelpers.ts:949`.
- **Badge styling:** `App.jsx:2903/2908` uses `bg-amber-500/20 text-amber-400` for Jamor venue. `CupTab.jsx:90` uses `bg-amber-500/30 text-amber-300 border border-amber-500/30` for isFinal label.
- **Draw skip:** Final draw is silent (no animation) — `cupFlowHelpers.ts:490`.
- **fixture.round:** Added to enriched fixtures in `cupFlowHelpers.ts:470` so engine can detect finals.

## Weekly Flow (`checkAllReady` in `weeklyFlowHelpers.ts`)
Central dispatch point. On all-coach confirmation:
1. Advance `calendarIndex`, apply weekly income by division, deduct wages
2. Generate fixtures, call `runMatchSegment(game, 1, 45)`
3. Pause at `match_halftime`; await re-confirmation
4. Call `runMatchSegment(game, 46, 90)`
5. For tied cups: pause at `match_et_gate`, then `runMatchSegment(game, 91, 120)`
6. Penalties if needed, then `match_finalizing` → `lobby`

**Halftime safety timeout:** 120s. If no coaches connected, auto-advance. If coaches connected, wait indefinitely (no forced advance while they adjust subs).
**Cup draw:** Prepared at end of previous event (not start of cup match).

## Design & Style
- **Dark palette:** Base `#0d0d14` / `#13131f`; surfaces `#18181f`; borders `#26263a`
- **Position accents:** GR: `#eab308`; DEF: `#3b82f6`; MED: `#10b981`; ATA: `#f43f5e`
- **Gold accent:** `#d4af37` / `#f0c330` — auctions, prices, premium elements
- **Auction shutter:** Fixed horizontal bar with gold gradient + shimmer animation (`index.css`)
- **Icons:** Material Symbols Outlined (`className="material-symbols-outlined"`)
- **Framer Motion:** Page transitions via `PageTransition.jsx`

## Key Files
- `server/index.ts`: Entry point, Express + Socket.io, CORS, rate limiting
- `server/gameManager.ts`: Room and state management (`activeGames`, DB per room)
- `server/game/engine.ts`: Match simulation (mixed ESM/CommonJS)
- `server/game/commentary.ts`: 16 narration functions (*Phrase) — never duplicate phrases
- `client/src/App.jsx`: Root component (auth, 60+ state vars, match animation)
- `client/src/hooks/useSocketListeners.js`: 40+ socket.on() centralized
- `server/*Helpers.ts`: 12 domain-specific helper files
- `server/socket*Handlers.ts`: 7 Socket handler files by domain

## Existing Instruction Sources
- `CLAUDE.md` — Detailed architecture guide (same content as this file but longer)
- `SKILLS.md` — Full documentation of 3 auditing/validation tools
- `.skillsrc` — Quick reference for audit commands
- `README.md` — Game rules, mechanics, and full stack overview

## Rules for Assistente
1. **Português de Portugal** em UI, mensagens e comentários de código
2. **Frontend é JS, nunca TS** — usar JSDoc para type hints
3. **`game/engine.ts`** usa CommonJS (`module.exports`); ficheiros auxiliares usam ES modules
4. **Narração** só em `game/commentary.ts` — nunca duplicar frases
5. **Socket listeners** só em `hooks/useSocketListeners.js` — verificar setters no objecto `handlers` em `App.jsx`
6. **SQLite** — sem tipos PostgreSQL-específicos (`SERIAL`, `JSONB`, etc.)
7. **Divisão 5 (Distritais)** existe só internamente como pool IA
8. **Craques** apenas MED e ATA — nunca atribuir a GR ou DEF
9. **Árbitro** — inclinação aleatória por jogo, não se aplica a penalties
10. **Empréstimos** — máx 5 activos, 2,5% juros/semana
11. **Plantel** — mín 11, máx 24
12. **Estádio** — máx 120.000 lugares
13. **Sem Distritais com simulação** — sorteio simples de promoção
14. **Em caso de dúvida sobre mecânica não descrita, perguntar antes de inventar**
