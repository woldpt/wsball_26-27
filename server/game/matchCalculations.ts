// ── Match calculation utilities extracted from engine.ts ──────────────────────

import { pickBestPlayer, withJuniorGRs } from "./playerUtils";

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

const FORMATIONS = ["4-4-2", "4-3-3", "3-5-2", "5-3-2", "4-5-1", "3-4-3", "4-2-4", "5-4-1"];

const FORMATION_WEIGHTS: Record<string, { GR: number; DEF: number; MED: number; ATA: number }> = {
  "4-4-2": { GR: 1, DEF: 4, MED: 4, ATA: 2 },
  "4-3-3": { GR: 1, DEF: 4, MED: 3, ATA: 3 },
  "3-5-2": { GR: 1, DEF: 3, MED: 5, ATA: 2 },
  "5-3-2": { GR: 1, DEF: 5, MED: 3, ATA: 2 },
  "4-5-1": { GR: 1, DEF: 4, MED: 5, ATA: 1 },
  "3-4-3": { GR: 1, DEF: 3, MED: 4, ATA: 3 },
  "4-2-4": { GR: 1, DEF: 4, MED: 2, ATA: 4 },
  "5-4-1": { GR: 1, DEF: 5, MED: 4, ATA: 1 },
};

export async function generateAITactic(
  db: any,
  teamId: number,
  opponentId: number,
  matchweek: number = 1,
): Promise<{ formation: string; style: string; positions: Record<number, string> }> {
  return new Promise<{ formation: string; style: string; positions: Record<number, string> }>((resolve) => {
    db.all(
      "SELECT * FROM players WHERE team_id IN (?, ?) AND team_id IS NOT NULL",
      [teamId, opponentId],
      (err: any, rows: PlayerRow[] | undefined) => {
        if (!rows || rows.length === 0) {
          return resolve({ formation: "4-4-2", style: "EQUILIBRADO", positions: {} });
        }

        const selfRows = withJuniorGRs(
          rows.filter((p) => p.team_id === teamId),
          teamId,
          matchweek,
        );
        const oppRows = rows.filter((p) => p.team_id === opponentId);

        const avgSelf = average(selfRows.map((p) => p.skill || 0));
        const avgOpp = average(oppRows.map((p) => p.skill || 0));

        const bestFormation = FORMATIONS.reduce((best, form) => {
          const w = FORMATION_WEIGHTS[form];
          const score =
            (average(selfRows.filter((p) => p.position === "GR").map((p) => p.skill || 0)) * w.GR +
            average(selfRows.filter((p) => p.position === "DEF").map((p) => p.skill || 0)) * w.DEF +
            average(selfRows.filter((p) => p.position === "MED").map((p) => p.skill || 0)) * w.MED +
            average(selfRows.filter((p) => p.position === "ATA").map((p) => p.skill || 0)) * w.ATA) /
            (w.GR + w.DEF + w.MED + w.ATA);
          return score > best.score ? { score, form } : best;
        }, { score: -Infinity, form: "4-4-2" }).form;

        const ratio = avgOpp > 0 ? avgSelf / avgOpp : 1;
        const style = ratio >= 1.10 ? "OFENSIVO" : ratio <= 0.90 ? "DEFENSIVO" : "EQUILIBRADO";

        // Seleccionar os 11 melhores jogadores por formação e marcar como Titular
        const w = FORMATION_WEIGHTS[bestFormation];
        const pickBest = (pool: PlayerRow[], n: number): PlayerRow[] =>
          [...pool].sort((a, b) => (b.skill || 0) - (a.skill || 0)).slice(0, n);

        const grs = pickBest(selfRows.filter((p) => p.position === "GR"), w.GR);
        const defs = pickBest(selfRows.filter((p) => p.position === "DEF"), w.DEF);
        const meds = pickBest(selfRows.filter((p) => p.position === "MED"), w.MED);
        const atas = pickBest(selfRows.filter((p) => p.position === "ATA"), w.ATA);
        const starters = [...grs, ...defs, ...meds, ...atas];
        const starterIds = new Set(starters.map((p) => p.id));

        const positions: Record<number, string> = {};
        for (const p of starters) {
          positions[p.id] = "Titular";
        }

        // Banco: máx 5 (1 GR suplente + 4 de campo) — igual ao auto-builder humano
        const nonStarters = selfRows.filter((p) => !starterIds.has(p.id));
        const grBench = nonStarters
          .filter((p) => p.position === "GR")
          .sort((a, b) => (b.skill || 0) - (a.skill || 0))
          .slice(0, 1);
        const fieldBench = nonStarters
          .filter((p) => p.position !== "GR")
          .sort((a, b) => (b.skill || 0) - (a.skill || 0))
          .slice(0, 5 - grBench.length);
        for (const p of [...grBench, ...fieldBench]) {
          positions[p.id] = "Suplente";
        }
        // Restantes jogadores não aparecem no mapa (tratados como excluídos)

        resolve({ formation: bestFormation, style, positions });
      },
    );
  });
}
