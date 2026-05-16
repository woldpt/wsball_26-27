# CLAUDE.md — Technical Architecture & Engineering Standards

This file serves as the primary technical reference for the CashBall 26/27 codebase. It focuses on architecture, engineering patterns, and system internals.

## 🛠️ Tech Stack

| Layer              | Technology          | Notes                                                                 |
| :----------------- | :------------------ | :-------------------------------------------------------------------- |
| **Frontend**       | React 19 + Vite 8   | **JavaScript only** (no TypeScript). Use JSDoc for type hints.        |
| **Styling**        | Tailwind CSS 4      | Uses Material Symbols Outlined for icons.                             |
| **Backend**        | Node.js + Express 5 | **TypeScript** (strict: false).                                       |
| **Real-time**      | Socket.io 4         | Centralized listeners in `client/src/hooks/useSocketListeners.js`.    |
| **Database**       | SQLite 3            | Local file-based (`server/db/base.db`). No PostgreSQL-specific types. |
| **Infrastructure** | Docker Compose      | Containerized environment.                                            |

### Frontend JSDoc Standards

To maintain type safety without TypeScript, all components and non-trivial functions must use JSDoc:

- **Components:**
  ```javascript
  /**
   * @param {Object} props
   * @param {string} props.name - Description
   * @returns {JSX.Element}
   */
  function MyComponent({ name }) { ... }
  ```
- **Async Functions:** Always specify the return type as a Promise: `/** @returns {Promise<User>} */`.
- **Complexity:** Use `@param {Array<{id: number, name: string}>} players` for complex object arrays.
- **Validation:** Run `npm run check:types` before committing.

---

## 🏗️ Architecture & Core Logic

### 1. State Management & Truth

- **Season Truth:** `game.calendarIndex` is the absolute source of truth for the season progression (not `matchweek`).
- **Game Phase Machine:**
  `lobby` $\rightarrow$ `match_first_half` $\rightarrow$ `match_halftime` $\rightarrow$ `match_second_half` $\rightarrow$ `[match_et_gate $\rightarrow$ match_extra_time]` $\rightarrow$ `match_finalizing` $\rightarrow$ `lobby`.
  _Note: Transitional phases reset to `lobby` on server restart to prevent deadlocks._
- **Memory vs DB:** `activeGames` in `gameManager.ts` is the primary runtime state. DB synchronization is **selective** (stats/finances are persistent; match minute/lineups are transient).

### 2. Synchronization & Gates

- **Phase Coordination:** Uses `phaseToken` (UUID) + `phaseAcks` (Set of confirmed coach names) to synchronize multi-player actions.
- **Segment Guard:** `segmentRunning[roomCode]` prevents double-execution of match segments.

### 3. Backend Patterns

- **Domain Helpers:** Uses the **Factory Pattern**: `createXxxHelpers(deps)` where `deps` includes `{ io, db, game }`. Never instantiate helpers directly.
- **Socket Handlers:** Each domain (gameplay, transfer, etc.) has its own handler file registered in `index.ts` via `registerXxxSocketHandlers(socket, deps)`.
- **Simulation Engine:** `game/engine.ts` uses CommonJS (`module.exports`) for compatibility, while other files in `game/` use ES Modules.

---

## 📁 Project Structure

### Backend (`/server`)

- `index.ts`: Entry point (Express + Socket.io).
- `gameManager.ts`: Room and state lifecycle management.
- `game/`: Core simulation logic (`engine.ts`, `commentary.ts`, `playerUtils.ts`).
- `*Handlers.ts`: Socket.io domain registration.
- `*Helpers.ts`: Business logic (via Factory Pattern).
- `db/`: SQLite schema, seed scripts, and migrations.

### Frontend (`/client`)

- `src/App.jsx`: Root state orchestration and socket initialization.
- `src/hooks/useSocketListeners.js`: Centralized socket event handling.
- `src/views/`: Modularized tab components (Standings, Market, etc.).
- `src/components/`: UI hierarchy (`modals/`, `ui/`, `shared/`).
- `src/utils/`: Helpers (audio, formatters, cache management).

---

## 🎨 Design Workflow (Stitch)

To maintain visual consistency, do not guess designs. Use the **Stitch AI MCP** workflow:

1. **Prototype:** Design/edit in the Stitch project (`projects/2994088005927103850`).
2. **Extract:** Provide the Screen ID to Claude.
3. **Implement:** Claude uses `stitch_get_screen` to translate specs into React/Tailwind.
4. **UI Rules:** Respect position colors (GR: `#eab308`, DEF: `#3b82f6`, MED: `#10b981`, ATA: `#f43f5e`) and Sidebar offsets (`lg:left-14` / `lg:left-64`).

---

## 📜 Engineering Rules (Non-Negotiables)

1. **Frontend:** **STRICTLY JAVASCRIPT**. No TypeScript in `/client`.
2. **Language:** All UI, messages, and code comments must be in **Portuguese (PT)**.
3. **Narration:** All game commentary phrases must live in `server/game/commentary.ts`.
4. **Database:** SQLite only. Avoid `SERIAL` or `JSONB`.
5. **Documentation:** Use JSDoc for all complex functions and component props.
