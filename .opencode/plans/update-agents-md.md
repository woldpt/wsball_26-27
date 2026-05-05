# Update AGENTS.md — Dismissal & Transfer System

## Goal

Document the dismissal and transfer system in AGENTS.md, including the recent change that job offers no longer expire.

## Changes to AGENTS.md

### 1. Add to "Game Flow Gotchas" section (after line 53)

Add two new bullet points:

- **Convites de promoção** (job offers) são permanentes — sem expiração. O treinador deve aceitar ou recusar imediatamente. Se não aceitar, permanece no clube actual.
- **Máximo 1 despedimento por época** — na segunda vez, o treinador é rebaixado para a divisão inferior em vez de ser despedido (divisões 1–3). Div 4 → despedimento obrigatório.

### 2. Add new section "Dismissal & Transfer System" (after "Game Flow Gotchas")

```markdown
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
```
