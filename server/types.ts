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

export interface CupRuntime {
  phaseToken: string;
  drawPayload: unknown;
  preMatchPayload?: unknown;
  halftimePayload: unknown;
  secondHalfPayload: unknown;
  fixtures: unknown[];
}

export interface ActiveGame {
  roomCode: string;
  db: any;
  playersByName: Record<string, PlayerSession>;
  socketToName: Record<string, string>;
  matchweek: number;
  matchState: string;
  season: number;
  year: number;
  cupRound: number;
  cupState: string;
  cupTeamIds: number[];
  cupFixtures: unknown[];
  cupHumanInCup: boolean;
  cupDrawAcks: Set<string>;
  cupRuntime: CupRuntime;
  lockedCoaches: Set<string>;
  globalMarket: any[];
  fixtures: any[];
  auctions: Record<string, unknown>;
  auctionTimers: Record<string, unknown>;
  pendingAuctionQueue: unknown[];
  initialized: boolean;
  [key: string]: any;
}
