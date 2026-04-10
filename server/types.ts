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
  teamId: number;
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
  | "lobby"                  // Between events: tactics, transfers, squad review
  | "match_first_half"       // Engine running 1-45 (league OR cup)
  | "match_halftime"         // Waiting: all humans confirm Ready
  | "match_second_half"      // Engine running 46-90
  | "match_extra_time"       // Cup only: ET simulation
  | "match_finalizing"       // Post-match processing (brief, blocking)
  | "cup_draw"               // Cup only: show draw, wait for acks
  | "cup_awaiting_kickoff"   // Cup only: all cup managers confirm Ready
  | "season_end";            // Season wrap-up: promotions, relegations

export interface ActiveGame {
  roomCode: string;
  db: any;
  playersByName: Record<string, PlayerSession>;
  socketToName: Record<string, string>;

  // ── Single calendar cursor (replaces matchweek + cupRound as progress trackers) ──
  calendarIndex: number;    // 0..18 within the season (index into SEASON_CALENDAR)
  season: number;
  year: number;
  matchweek: number;        // convenience field: updated at end of each league event

  // ── Single state machine (replaces matchState + cupState) ──
  gamePhase: GamePhase;

  // ── Current event runtime ──
  currentEvent: any | null; // CalendarEntry | null — what we're playing RIGHT NOW
  currentFixtures: any[];   // active fixture objects (league or cup)

  // ── Single phase timer + ack set (replaces 5 separate timeouts + ack sets) ──
  phaseToken: string;
  phaseTimer: ReturnType<typeof setTimeout> | null;
  phaseAcks: Set<string>;

  // ── Cup runtime payloads (flat fields replacing CupRuntime object) ──
  cupTeamIds: number[];
  cupDrawPayload: unknown | null;
  cupHalftimePayload: unknown | null;
  cupSecondHalfPayload: unknown | null;

  // ── Retained fields ──
  lockedCoaches: Set<string>;
  globalMarket: any[];
  auctions: Record<string, unknown>;
  auctionTimers: Record<string, unknown>;
  pendingAuctionQueue: unknown[];
  initialized: boolean;
  lastHalftimePayload?: any;
  [key: string]: any;
}
