// ── Player utilities extracted from engine.ts ────────────────────────────────

type PlayerRow = any;

const JUNIOR_FIRST_NAMES = [
  "Carlos",
  "João",
  "Miguel",
  "André",
  "Rui",
  "Diogo",
  "Pedro",
  "Tiago",
  "Nuno",
  "Luís",
  "Filipe",
  "Gonçalo",
  "Rodrigo",
  "Rafael",
  "Marco",
];
const JUNIOR_LAST_NAMES = [
  "Silva",
  "Santos",
  "Ferreira",
  "Pereira",
  "Oliveira",
  "Costa",
  "Rodrigues",
  "Martins",
  "Jesus",
  "Sousa",
  "Fernandes",
  "Gonçalves",
  "Gomes",
  "Lopes",
  "Marques",
];

/**
 * Generates a deterministic ephemeral junior GR player for a team.
 * Uses negative IDs so all DB write operations are harmless no-ops.
 * The same (teamId, matchweek, slotIndex) always produces the same name and ID.
 * ID scheme: -(teamId * 10 + slotIndex + 1)
 */
export function generateJuniorGR(
  teamId: number,
  matchweek: number,
  slotIndex: number,
): PlayerRow {
  const firstIdx =
    Math.abs(teamId * 37 + matchweek * 13 + slotIndex * 7) %
    JUNIOR_FIRST_NAMES.length;
  const lastIdx =
    Math.abs(teamId * 53 + matchweek * 17 + slotIndex * 11) %
    JUNIOR_LAST_NAMES.length;
  const juniorSkill =
    1 +
    Math.abs(
      teamId * 37 + matchweek * 13 + slotIndex * 7 + firstIdx * 3 + lastIdx * 5,
    ) %
      5;
  return {
    id: -(teamId * 10 + slotIndex + 1),
    name: `${JUNIOR_FIRST_NAMES[firstIdx]} ${JUNIOR_LAST_NAMES[lastIdx]} (Junior)`,
    position: "GR",
    skill: juniorSkill,
    aggressiveness: 3,
    resistance: 3,
    isJunior: true,
    team_id: teamId,
    age: 17,
    form: 50,
    nationality: "🇵🇹",
    value: 0,
    wage: 0,
    goals: 0,
    is_star: 0,
    suspension_until_matchweek: 0,
    injury_until_matchweek: 0,
    games_played: 0,
    yellow_cards: 0,
    red_cards: 0,
    career_injuries: 0,
    career_reds: 0,
    transfer_status: "none",
    prev_skill: null,
    signed_season: null,
  };
}

/**
 * Injects junior GR players into a squad whenever there are fewer than 2 available GRs.
 * Accepts the full squad (including unavailable players) or a pre-filtered available subset;
 * in both cases it correctly counts only available GRs before deciding how many juniors to add.
 * The original array is never mutated.
 */
export function withJuniorGRs(
  squad: PlayerRow[],
  teamId: number,
  matchweek: number,
): PlayerRow[] {
  const availableGRCount = squad.filter(
    (p) => p.position === "GR" && isPlayerAvailable(p, matchweek),
  ).length;
  if (availableGRCount >= 1) return squad;
  const juniors: PlayerRow[] = [];
  juniors.push(generateJuniorGR(teamId, matchweek, 0));
  return [...squad, ...juniors];
}

/**
 * Generates a deterministic ephemeral junior field player for a team.
 * Position cycles through DEF / MED / ATA based on slotIndex.
 * Uses negative IDs (different base from GR juniors) so all DB writes are harmless no-ops.
 * The same (teamId, matchweek, slotIndex) always produces the same name and ID.
 * ID scheme: -(teamId * 1000 + slotIndex + 1)
 */
export function generateJuniorFieldPlayer(
  teamId: number,
  matchweek: number,
  slotIndex: number,
  position: "DEF" | "MED" | "ATA",
): PlayerRow {
  const firstIdx =
    Math.abs(teamId * 37 + matchweek * 13 + slotIndex * 7) %
    JUNIOR_FIRST_NAMES.length;
  const lastIdx =
    Math.abs(teamId * 53 + matchweek * 17 + slotIndex * 11) %
    JUNIOR_LAST_NAMES.length;
  const juniorSkill =
    1 +
    Math.abs(
      teamId * 37 + matchweek * 13 + slotIndex * 7 + firstIdx * 3 + lastIdx * 5,
    ) %
      5;
  return {
    id: -(teamId * 1000 + slotIndex + 1),
    name: `${JUNIOR_FIRST_NAMES[firstIdx]} ${JUNIOR_LAST_NAMES[lastIdx]} (Junior)`,
    position,
    skill: juniorSkill,
    aggressiveness: 3,
    resistance: 3,
    isJunior: true,
    team_id: teamId,
    age: 17,
    form: 50,
    nationality: "🇵🇹",
    value: 0,
    wage: 0,
    goals: 0,
    is_star: 0,
    suspension_until_matchweek: 0,
    injury_until_matchweek: 0,
    games_played: 0,
    yellow_cards: 0,
    red_cards: 0,
    career_injuries: 0,
    career_reds: 0,
    transfer_status: "none",
    prev_skill: null,
    signed_season: null,
  };
}

/**
 * Ensures the squad has enough available players to fill both the starting
 * eleven (11) and a full bench (1 GR + 4 field = 5 substitutes).
 *
 * Minimum requirements:
 *   - 2 GR  (1 starter + 1 bench)
 *   - 14 field players (10 starters + 4 bench)
 *
 * Temporary junior players are generated for any missing slots.
 * This function is designed to be called AFTER withJuniorGRs() so the
 * starting-GR requirement is already satisfied.
 * The original array is never mutated.
 */
export function ensureFullBench(
  squad: PlayerRow[],
  teamId: number,
  matchweek: number,
): PlayerRow[] {
  const result = [...squad];

  const availableGRCount = squad.filter(
    (p) => p.position === "GR" && isPlayerAvailable(p, matchweek),
  ).length;
  const availableFieldCount = squad.filter(
    (p) => p.position !== "GR" && isPlayerAvailable(p, matchweek),
  ).length;

  // Ensure at least 2 GRs (1 starter + 1 bench)
  if (availableGRCount < 2) {
    result.push(generateJuniorGR(teamId, matchweek, 1));
  }

  // Ensure at least 14 field players (10 starters + 4 bench)
  if (availableFieldCount < 14) {
    const needed = 14 - availableFieldCount;
    const positions: Array<"DEF" | "MED" | "ATA"> = ["DEF", "MED", "ATA"];
    for (let i = 0; i < needed; i++) {
      const pos = positions[i % 3];
      result.push(generateJuniorFieldPlayer(teamId, matchweek, 100 + i, pos));
    }
  }

  return result;
}

export function pickBestPlayer(players: PlayerRow[] = []) {
  if (!players.length) return null;
  return [...players].sort((a, b) => b.skill - a.skill)[0];
}

/**
 * Weighted random pick for goal scorer.
 * Weight = positionWeight × starMultiplier × individualForm.
 *   ATA: 2, MED: 1; star ×3; form clamped to 0.7–1.3 of nominal 1.0.
 */
export function weightedPickScorer(players: PlayerRow[] = []) {
  if (!players.length) return null;
  const weights = players.map((p) => {
    const positionWeight = p.position === "ATA" ? 2 : 1;
    const starMultiplier = p.is_star ? 3 : 1;
    const formMultiplier = Math.max(
      0.7,
      Math.min(1.3, (p.form || 100) / 100),
    );
    return positionWeight * starMultiplier * formMultiplier;
  });
  const total = weights.reduce((s, w) => s + w, 0);
  let r = Math.random() * total;
  for (let i = 0; i < players.length; i++) {
    r -= weights[i];
    if (r <= 0) return players[i];
  }
  return players[players.length - 1];
}

export function isPlayerAvailable(player: PlayerRow, currentMatchweek = 1) {
  const suspensionUntil = player.suspension_until_matchweek || 0;
  const injuryUntil = player.injury_until_matchweek || 0;
  const cooldownUntil = player.transfer_cooldown_until_matchweek || 0;
  return currentMatchweek > Math.max(suspensionUntil, injuryUntil, cooldownUntil);
}
