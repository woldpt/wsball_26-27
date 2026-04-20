import type { ActiveGame, PlayerSession } from "./types";
import { CUP_ROUND_NAMES } from "./gameConstants";

type AnyRow = Record<string, any>;
type RunAll = <T extends AnyRow = AnyRow>(db: any, sql: string, params?: any[]) => Promise<T[]>;

interface CupHandlerDeps {
  io: any;
  getGameBySocket: (socketId: string) => ActiveGame | null;
  getPlayerBySocket: (game: ActiveGame, socketId: string) => PlayerSession | null;
  getPlayerList: (game: ActiveGame) => PlayerSession[];
  saveGameState: (game: ActiveGame) => void;
  checkAllReady: (game: ActiveGame) => Promise<void>;
  runAll: RunAll;
}

export function registerCupSocketHandlers(socket: any, deps: CupHandlerDeps) {
  const { getGameBySocket, runAll } = deps;

  // ── Cup bracket data ─────────────────────────────────────────────────────
  socket.on("requestCupBracket", async () => {
    const game = getGameBySocket(socket.id);
    if (!game) return;
    try {
      type CupRow = {
        id: number; round: number;
        home_team_id: number; away_team_id: number;
        home_score: number; away_score: number;
        home_et_score: number; away_et_score: number;
        home_penalties: number; away_penalties: number;
        winner_team_id: number | null; played: number;
        home_name: string | null; home_cp: string | null; home_cs: string | null;
        away_name: string | null; away_cp: string | null; away_cs: string | null;
      };
      const rows = await runAll<CupRow>(
        game.db,
        `SELECT cm.id, cm.round, cm.home_team_id, cm.away_team_id,
          cm.home_score, cm.away_score, cm.home_et_score, cm.away_et_score,
          cm.home_penalties, cm.away_penalties, cm.winner_team_id, cm.played,
          th.name AS home_name, th.color_primary AS home_cp, th.color_secondary AS home_cs,
          ta.name AS away_name, ta.color_primary AS away_cp, ta.color_secondary AS away_cs
        FROM cup_matches cm
        LEFT JOIN teams th ON cm.home_team_id = th.id
        LEFT JOIN teams ta ON cm.away_team_id = ta.id
        WHERE cm.season = ?
        ORDER BY cm.round, cm.id`,
        [game.season],
      );

      const roundMap = new Map<number, any[]>();
      for (const row of rows) {
        if (!roundMap.has(row.round)) roundMap.set(row.round, []);
        roundMap.get(row.round)!.push({
          id: row.id,
          homeTeam: row.home_name
            ? { id: row.home_team_id, name: row.home_name, color_primary: row.home_cp, color_secondary: row.home_cs }
            : null,
          awayTeam: row.away_name
            ? { id: row.away_team_id, name: row.away_name, color_primary: row.away_cp, color_secondary: row.away_cs }
            : null,
          homeScore: row.home_score,
          awayScore: row.away_score,
          homeEtScore: row.home_et_score,
          awayEtScore: row.away_et_score,
          homePenalties: row.home_penalties,
          awayPenalties: row.away_penalties,
          winnerId: row.winner_team_id,
          played: row.played === 1,
        });
      }

      const rounds = Array.from(roundMap.entries())
        .sort(([a], [b]) => a - b)
        .map(([round, matches]) => ({
          round,
          roundName: CUP_ROUND_NAMES[round] || `Ronda ${round}`,
          matches,
        }));

      socket.emit("cupBracketData", { season: game.season, rounds });
    } catch (err) {
      console.error(`[${game.roomCode}] requestCupBracket error:`, err);
    }
  });

  // ── ET animation done ───────────────────────────────────────────────────────
  socket.on("cupExtraTimeDone", () => {
    const game = getGameBySocket(socket.id);
    if (!game || !game._cupETAnimHandler) return;
    game._cupETAnimHandler(socket.id);
  });

  // ── Legacy compat shims (no-ops) ────────────────────────────────────────────
  // Cup now uses the same lobby → setReady flow as league.
  // These events are kept so old clients don't throw errors, but do nothing.
  socket.on("cupDrawAcknowledged", () => {});
  socket.on("cupKickOff", () => {});
  socket.on("cupHalfTimeReady", () => {});
  
  socket.on("leagueAnimDone", () => {});
}
