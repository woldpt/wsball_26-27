export const DIVISION_NAMES: Record<number, string> = {
  1: "Primeira Liga",
  2: "Segunda Liga",
  3: "Liga 3",
  4: "Campeonato de Portugal",
  5: "Distritais",
};

export const CUP_ROUND_NAMES = [
  "",
  "16 avos de final",
  "Oitavos de final",
  "Quartos de final",
  "Meias-finais",
  "Final",
];

export const CUP_TEAMS_BY_ROUND: Record<number, number> = {
  1: 32,
  2: 16,
  3: 8,
  4: 4,
  5: 2,
};

/**
 * Typed calendar entry — either a league matchweek or a cup round.
 * calendarIndex is the position in SEASON_CALENDAR (0-based, 0..18).
 */
export type CalendarEntry =
  | { type: "league"; matchweek: number; calendarIndex: number }
  | { type: "cup"; round: number; roundName: string; teamsIn: number; calendarIndex: number };

/**
 * The single source of truth for season structure.
 * Each entry is one "game week" — the game plays exactly one event per entry.
 * League and cup NEVER run simultaneously.
 * 19 entries total: 14 league matchweeks + 5 cup rounds.
 */
export const SEASON_CALENDAR: CalendarEntry[] = [
  { type: "league", matchweek: 1,  calendarIndex: 0  },
  { type: "league", matchweek: 2,  calendarIndex: 1  },
  { type: "league", matchweek: 3,  calendarIndex: 2  },
  { type: "cup",    round: 1, roundName: "16 avos de final", teamsIn: 32, calendarIndex: 3  },
  { type: "league", matchweek: 4,  calendarIndex: 4  },
  { type: "league", matchweek: 5,  calendarIndex: 5  },
  { type: "league", matchweek: 6,  calendarIndex: 6  },
  { type: "cup",    round: 2, roundName: "Oitavos de final", teamsIn: 16, calendarIndex: 7  },
  { type: "league", matchweek: 7,  calendarIndex: 8  },
  { type: "league", matchweek: 8,  calendarIndex: 9  },
  { type: "league", matchweek: 9,  calendarIndex: 10 },
  { type: "cup",    round: 3, roundName: "Quartos de final", teamsIn: 8,  calendarIndex: 11 },
  { type: "league", matchweek: 10, calendarIndex: 12 },
  { type: "league", matchweek: 11, calendarIndex: 13 },
  { type: "cup",    round: 4, roundName: "Meias-finais",     teamsIn: 4,  calendarIndex: 14 },
  { type: "league", matchweek: 12, calendarIndex: 15 },
  { type: "league", matchweek: 13, calendarIndex: 16 },
  { type: "league", matchweek: 14, calendarIndex: 17 },
  { type: "cup",    round: 5, roundName: "Final",            teamsIn: 2,  calendarIndex: 18 },
];
