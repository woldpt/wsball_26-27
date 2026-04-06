export const DIVISION_NAMES: Record<number, string> = {
  1: "Primeira Liga",
  2: "Segunda Liga",
  3: "Liga 3",
  4: "Campeonato de Portugal",
  5: "Distritais",
};

export const CUP_ROUND_AFTER_MATCHWEEK: Record<number, number> = {
  3: 1,
  6: 2,
  9: 3,
  11: 4,
  14: 5,
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

export const SEASON_CALENDAR = [
  { type: "league", matchweek: 1 },
  { type: "league", matchweek: 2 },
  { type: "league", matchweek: 3 },
  { type: "cup", round: 1, roundName: "16 avos de final", teamsIn: 32 },
  { type: "league", matchweek: 4 },
  { type: "league", matchweek: 5 },
  { type: "league", matchweek: 6 },
  { type: "cup", round: 2, roundName: "Oitavos de final", teamsIn: 16 },
  { type: "league", matchweek: 7 },
  { type: "league", matchweek: 8 },
  { type: "league", matchweek: 9 },
  { type: "cup", round: 3, roundName: "Quartos de final", teamsIn: 8 },
  { type: "league", matchweek: 10 },
  { type: "league", matchweek: 11 },
  { type: "cup", round: 4, roundName: "Meias-finais", teamsIn: 4 },
  { type: "league", matchweek: 12 },
  { type: "league", matchweek: 13 },
  { type: "league", matchweek: 14 },
  { type: "cup", round: 5, roundName: "Final", teamsIn: 2 },
];
