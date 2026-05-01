// ── Match calculation utilities extracted from engine.ts ──────────────────────

import { pickBestPlayer } from "./playerUtils";

type PlayerRow = any;

export function selectPenaltyTaker(squad: PlayerRow[] = []) {
  return pickBestPlayer(squad) || null;
}

export function clampSkill(value: number) {
  return Math.max(0, Math.min(50, Math.round(value)));
}

// Per-minute goal probability multiplier based on real football time distribution.
// Weights are normalised so the average across 90 min = 1.0 (total goals unchanged).
export function getGoalTimeMultiplier(minute: number): number {
  if (minute <= 10) return 0.66; // 00'–10' ~7-8%
  if (minute <= 20) return 0.83; // 11'–20' ~9-10%
  if (minute <= 30) return 0.94; // 21'–30' ~11%
  if (minute <= 40) return 1.02; // 31'–40' ~12%
  if (minute <= 45) return 1.11; // 41'–HT  ~13%
  if (minute <= 55) return 0.85; // 46'–55' ~10%
  if (minute <= 65) return 0.94; // 56'–65' ~11%
  if (minute <= 75) return 1.11; // 66'–75' ~13%
  if (minute <= 85) return 1.28; // 76'–85' ~15%
  return 1.62; // 86'–FT  ~18-20%
}

export function getWeatherGoalMultiplier(condition: string | undefined): number {
  switch (condition) {
    case "neve":
      return 0.8;
    case "nevoeiro":
      return 0.85;
    case "frio":
      return 0.9;
    case "sol":
      return 1.0;
    case "vento":
      return 1.05;
    case "chuva":
      return 1.08;
    case "chuva_forte":
      return 1.15;
    default:
      return 1.0;
  }
}

export function normaliseStyle(style: unknown) {
  const raw = String(style || "Balanced")
    .trim()
    .toUpperCase();
  if (raw === "DEFENSIVO" || raw === "DEFENSIVE") return "DEFENSIVO";
  if (raw === "OFENSIVO" || raw === "OFFENSIVE") return "OFENSIVO";
  return "EQUILIBRADO";
}

export function getAggressivenessValue(player: PlayerRow) {
  if (typeof player?.aggressiveness === "number") {
    return Math.max(1, Math.min(5, Math.round(player.aggressiveness)));
  }

  const AGG_TIER_VALUES = {
    Cordeirinho: 1,
    Cavalheiro: 2,
    "Fair Play": 3,
    Caneleiro: 4,
    Caceteiro: 5,
  };

  return AGG_TIER_VALUES[player?.aggressiveness] ?? 3;
}

export function average(values: number[] = []) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
