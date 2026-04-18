import { COUNTRY_FLAGS } from "../countryFlags.js";

export const FLAG_TO_COUNTRY = {};
COUNTRY_FLAGS.forEach(({ flag, label }) => {
  FLAG_TO_COUNTRY[flag] = label.replace(/^\S+\s/, "");
});

export const DIVISION_NAMES = {
  1: "Primeira Liga",
  2: "Segunda Liga",
  3: "Liga 3",
  4: "Campeonato de Portugal",
  5: "Distritais",
};

export const POSITION_SHORT_LABELS = {
  GR: "G",
  DEF: "D",
  MED: "M",
  ATA: "A",
};

// Enable row background color per position
export const ENABLE_ROW_BG = true;

// Text color classes for each position (soft palette)
export const POSITION_TEXT_CLASS = {
  GR: "text-yellow-500",
  DEF: "text-blue-500",
  MED: "text-emerald-500",
  ATA: "text-rose-500",
};

export const POSITION_BORDER_CLASS = {
  GR: "border-yellow-500",
  DEF: "border-blue-500",
  MED: "border-emerald-500",
  ATA: "border-rose-500",
};

export const POSITION_LABEL_MAP = {
  GR: "GR",
  DEF: "DEF",
  MED: "MED",
  ATA: "ATA",
};

// Background color classes for each position (soft, subtle)
export const POSITION_BG_CLASS = {
  GR: "bg-yellow-500/8",
  DEF: "bg-blue-500/8",
  MED: "bg-emerald-500/8",
  ATA: "bg-rose-500/8",
};

export const MAX_MATCH_SUBS = 3;
export const ADMIN_SESSION_KEY = "cashballAdminSession";

// ── SEASON CALENDAR ───────────────────────────────────────────────────────────
export const SEASON_CALENDAR = [
  { type: "league", matchweek: 1, calendarIndex: 0 },
  { type: "league", matchweek: 2, calendarIndex: 1 },
  { type: "league", matchweek: 3, calendarIndex: 2 },
  { type: "cup", round: 1, roundName: "16 avos de final", calendarIndex: 3 },
  { type: "league", matchweek: 4, calendarIndex: 4 },
  { type: "league", matchweek: 5, calendarIndex: 5 },
  { type: "league", matchweek: 6, calendarIndex: 6 },
  { type: "cup", round: 2, roundName: "Oitavos de final", calendarIndex: 7 },
  { type: "league", matchweek: 7, calendarIndex: 8 },
  { type: "league", matchweek: 8, calendarIndex: 9 },
  { type: "league", matchweek: 9, calendarIndex: 10 },
  { type: "cup", round: 3, roundName: "Quartos de final", calendarIndex: 11 },
  { type: "league", matchweek: 10, calendarIndex: 12 },
  { type: "league", matchweek: 11, calendarIndex: 13 },
  { type: "cup", round: 4, roundName: "Meias-finais", calendarIndex: 14 },
  { type: "league", matchweek: 12, calendarIndex: 15 },
  { type: "league", matchweek: 13, calendarIndex: 16 },
  { type: "league", matchweek: 14, calendarIndex: 17 },
  { type: "cup", round: 5, roundName: "Final", calendarIndex: 18 },
];

export const DEFAULT_TACTIC = {
  formation: "4-4-2",
  style: "Balanced",
  positions: {},
};

// ── AGGRESSIVENESS TIERS ──────────────────────────────────────────────────────
export const AGG_TIERS = {
  Cordeirinho: { color: "text-emerald-400" },
  Cavalheiro: { color: "text-sky-400" },
  "Fair Play": { color: "text-zinc-400" },
  Caneleiro: { color: "text-orange-400" },
  Caceteiro: { color: "text-red-400" },
};

export const TICKER_TEAM_COLORS = [
  "#f87171",
  "#fb923c",
  "#facc15",
  "#4ade80",
  "#34d399",
  "#22d3ee",
  "#60a5fa",
  "#a78bfa",
  "#e879f9",
  "#f472b6",
  "#94a3b8",
  "#fbbf24",
  "#86efac",
  "#67e8f9",
  "#c4b5fd",
  "#fda4af",
  "#6ee7b7",
  "#93c5fd",
];
