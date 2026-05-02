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
| Backend seed | `cd server && npm run seed` |
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

## Game Flow Gotchas

- **Async submission, sync simulation:** Matchdays advance when all humans submit tactics, but simulation requires all humans to confirm "Pronto" at checkpoints (start, halftime, extra time).
- **Division 5 (Distritais)** exists only internally as an AI team pool. Invisible to humans.
- **Craques** (star players) only exist for MED and ATA positions. Never assign to GR or DEF.
- **Referee bias** is random per match, not a fixed attribute. Does not apply to penalty shootout conversion probabilities.
- **Leilões (auctions)** pop up for all 32 human coaches with a 15-second real-time timer. Each club gets one bid.

## Files to Read First

1. `CLAUDE.md` — full project guide (architecture, UI, conventions)
2. `README.md` — game mechanics and rules
3. `SKILLS.md` — auditing/validation tools
4. `.skillsrc` — quick skill reference

## Style

- Small, cohesive files. Extract modules at ~500 lines.
- Group by responsibility, not convenience.
- Dark palette: base `#0d0d14`, surfaces `#18181f`, borders `#26263a`. Position accents: GR yellow, DEF blue, MED green, ATA pink. Gold `#d4af37` for premium elements.
