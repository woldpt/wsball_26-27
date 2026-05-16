# AGENTS.md — Operational Manual & Regression Prevention

> **Nota:** Este ficheiro é o manual de operações rápidas. Ele complementa o `CLAUDE.md` (Arquitetura) e o `README.md` (Produto).

## ⚡ Quick Commands

| Contexto                 | Comando                                            |
| :----------------------- | :------------------------------------------------- |
| **Backend Dev**          | `cd server && npm run dev`                         |
| **Backend Typecheck**    | `cd server && npm run typecheck`                   |
| **Backend Build/Start**  | `cd server && npm run build && npm run start`      |
| **Backend Seed**         | `cd server && npm run seed`                        |
| **Frontend Dev**         | `cd client && npm run dev`                         |
| **Frontend Lint**        | `cd client && npm run lint`                        |
| **Frontend JSDoc Check** | `cd client && npm run check:types`                 |
| **Socket Audit**         | `cd server && npm run audit:socketio`              |
| **Game-State Audit**     | `cd server && npm run audit:gamestate <ROOM_CODE>` |
| **Full Stack**           | `docker compose up --build`                        |

## ⚠️ REGRESSION PREVENTION (Crucial)

**NÃO cometer estes erros que já foram corrigidos em sessões anteriores:**

- **Mercado/Transferências:**
  - Use sempre `TransferHub.jsx`. **NUNCA** use `MarketTab.jsx`.
  - Garanta que leilões são filtrados em `TransferHub` (`p.transfer_status !== "auction"`).
- **Leilões (Auctions):**
  - Verifique sempre o guard `bids[npcTeam.id] != null` para evitar lances duplicados de NPCs.
  - Não use o prefixo `p.` em queries de `playerRows[0]` (evita `null` sem JOIN).
- **Histórico de Jogadores:**
  - A abertura do modal deve seguir o fluxo: `SquadRow (prop onOpenPlayerHistory)` $\rightarrow$ `socket.emit("requestPlayerHistory")`.
- **Visual/Avatar:**
  - **PROIBIDO** usar `clipPath` em `PlayerAvatar.jsx`. Use apenas caminhos geométricos puros.
- **Estado do Jogo:**
  - A fonte da verdade é `game.calendarIndex`. Nunca use `matchweek` para lógica de progresso.
  - Não tente persistir `game.lockedCoaches` na base de dados.

## 🛠️ COMPLEX LOGIC PATTERNS

**Siga estes padrões para garantir a integridade do sistema:**

### 1. Sistema de Juniores (Banco de Suplentes)

Para garantir que uma equipa tem sempre jogadores disponíveis, siga esta ordem de execução obrigatória:

1. `withJuniorGRs(squad, teamId, matchweek)` (Garante 1 GR para o 11 inicial).
2. `ensureFullBench(squad, teamId, matchweek)` (Garante o resto do banco: 2 GR + 14 campo).
   _Atenção: Os IDs de juniores são negativos._

### 2. Backend Helpers (Factory Pattern)

Nunca instancie helpers diretamente. Use sempre:
`const helpers = createXxxHelpers({ io, db, game });`

## 🎨 DESIGN & STITCH WORKFLOW

**Para novas interfaces, não adivinhe o design. Use o Stitch AI MCP:**

1. **Prototipar:** No projeto Stitch (`projects/2994088005927103850`).
2. **Extrair:** Forneça o ID da tela ao Claude.
3. **Implementar:** Claude usa `stitch_get_screen` $\rightarrow$ React/Tailwind.

## 🚀 Commit Workflow

- Mensagens de commit devem focar no **"porquê"** (ex: `fix: prevent duplicate NPC bids in auctions`) e não apenas no "o quê".
