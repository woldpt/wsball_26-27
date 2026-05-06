export type TacticStyle =
  | "Balanced"
  | "Defensive"
  | "Offensive"
  | "EQUILIBRADO"
  | "DEFENSIVO"
  | "OFENSIVO";

export interface Tactic {
  formation: string;
  style: TacticStyle;
  positions?: Record<number, "Titular" | "Suplente" | string>;
}

export interface PlayerSession {
  name: string;
  teamId: number | null;
  roomCode: string;
  ready: boolean;
  tactic: Tactic;
  socketId: string | null;
  [key: string]: any;
}

/**
 * Single unified state machine replacing the old matchState + cupState dual machines.
 * Transitions are always linear: no concurrent league+cup activity.
 */
export type GamePhase =
  | "lobby" // Between events: tactics, transfers, squad review
  | "match_first_half" // Engine running 1-45 (league OR cup)
  | "match_halftime" // Waiting: all humans confirm Ready
  | "match_second_half" // Engine running 46-90
  | "match_et_gate" // Cup only: waiting for coaches before extra time
  | "match_extra_time" // Cup only: ET simulation running (91-120)
  | "match_finalizing" // Post-match processing (brief, blocking)
  | "season_end"; // Season wrap-up: promotions, relegations

export interface ActiveGame {
  roomCode: string;
  db: any;
  playersByName: Record<string, PlayerSession>;
  socketToName: Record<string, string>;

  // ── Single calendar cursor (replaces matchweek + cupRound as progress trackers) ──
  calendarIndex: number; // 0..18 within the season (index into SEASON_CALENDAR)
  season: number;
  year: number;
  matchweek: number; // convenience field: updated at end of each league event

  // ── Single state machine (replaces matchState + cupState) ──
  gamePhase: GamePhase;

  // ── Current event runtime ──
  currentEvent: any | null; // CalendarEntry | null — what we're playing RIGHT NOW
  currentFixtures: any[]; // active fixture objects (league or cup)

  // ── Single phase timer + ack set (replaces 5 separate timeouts + ack sets) ──
  phaseToken: string;
  phaseTimer: ReturnType<typeof setTimeout> | null;
  phaseAcks: Set<string>;

  // ── Cup runtime payloads ──
  cupTeamIds: number[];
  cupHalftimePayload: unknown | null;
  cupDrawSeenBy: Set<string>; // coachNames que já viram o sorteio do round actual

  // ── Retained fields ──
  lockedCoaches: Set<string>;
  globalMarket: any[];
  auctions: Record<string, unknown>;
  auctionTimers: Record<string, unknown>;
  pendingAuctionQueue: unknown[];
  pendingAuctionQueueTimers: ReturnType<typeof setTimeout>[];
  initialized: boolean;
  lastHalftimePayload?: any;
  pendingMatchAction?: any;
  pendingSubstitutions?: Set<number>;

  // ── Fixture seeds por divisão (ordem aleatória no início de cada época) ──
  fixtureSeeds: Record<number, number[]>; // div → [teamId, ...] ordenado por seed

  // ── Histórico de resultados de todas as jornadas ──
  allMatchResults: Record<number, any[]>; // matchweek → [{homeTeamId, awayTeamId, homeGoals, awayGoals, ...}, ...]

  // ── Coach dismissal & job offers ──
  pendingJobOffers: Record<string, { fromTeamId: number; toTeamId: number }>;
  negativeBudgetStreak: Record<number, number>; // teamId → semanas consecutivas com budget < 0
  dismissedCoachSince: Record<
    string,
    {
      matchweek: number;
      division: number;
      reason?: "results" | "budget";
      teamName?: string;
    }
  >; // coachName → info de despedimento
  dismissalsThisSeason: Set<string>; // coaches despedidos na época actual (máx 1 por época)

  [key: string]: any;
}
