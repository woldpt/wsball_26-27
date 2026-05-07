# CashBall 26/27 — Agent Instructions

## Quick Start

```bash
# Full stack
docker compose up --build

# Dev (two terminals)
cd server && npm run dev
cd client && npm run dev
```

## Commands

| Action | Command |
|--------|---------|
| Backend dev | `cd server && npm run dev` |
| Backend build + start | `cd server && npm run build && npm start` |
| Backend typecheck | `cd server && npm run typecheck` |
| Seed DB (mock) | `cd server && npm run seed` |
| Seed DB (real) | `cd server && npm run seed:real` |
| Frontend dev | `cd client && npm run dev` |
| Frontend lint | `cd client && npm run lint` |
| JSDoc check | `cd client && npm run check:types` |
| Socket.io audit | `cd server && npm run audit:socketio` |
| Game state audit | `cd server && npm run audit:gamestate <ROOM_CODE>` |

## Architecture

- **Backend:** Express 5 + Socket.io 4 in TypeScript (`server/`, `tsconfig.json` has `strict: false`)
- **Frontend:** React 19 + Vite 8 in JavaScript (`client/src/`, no TypeScript)
- **DB:** SQLite at `server/db/base.db` (per room), `accounts.db`, `global_chat.db`
- **Factory pattern:** All helpers use `createXxxHelpers(deps)`, never instantiate directly
- **Socket handlers:** 7 files (`socket*Handlers.ts`) in `io.on("connection")`

## Critical Conventions

- **Frontend is JS.** Use JSDoc for type hints.
- **Socket listeners in** `client/src/hooks/useSocketListeners.js`. Add new handlers to the `handlers` object from `App.jsx` — missing setters cause silent no-ops.
- **Tabs in** `client/src/views/` (9 files). Only `BracketTab` accesses socket directly. `live` and `tactic` inline in `App.jsx`.
- **`game/engine.ts`** uses CommonJS (`module.exports`). Other `game/` files use ES modules. Re-export via `engine.ts`.
- **All narration** in `game/commentary.ts`. Never duplicate phrases.
- **Portuguese (PT)** for UI text, messages, and code comments.
- **`auth.js` and `adminRoutes.js`** are intentionally JavaScript.
- **Sidebar overlays** (modals, auction blinds) must use `lg:left-14` / `lg:left-64` offset to track `sidebarCollapsed` state.

## Files to Read First

1. `CLAUDE.md` — full project guide
2. `README.md` — game mechanics and rules
3. `SKILLS.md` — auditing tools