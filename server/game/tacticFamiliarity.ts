// ── Táctica Familiaridade (estilo Hattrick) ────────────────────────────────────
// Registra e calcula bonus de "rotina" quando treinadores humanos usam a mesma
// táctica repetidamente. O bonus aplica-se ao poder da equipa na engine.

type TacticFamiliarityResult = {
  bonus: number;
  count: number;
  isMostUsed: boolean;
  totalGames: number;
  formation: string;
  style: string;
};

type TacticFamiliarityEntry = {
  formation: string;
  style: string;
  count: number;
  bonus: number;
  label: string;
};

const TIER_THRESHOLDS = [
  { min: 21, bonus: 0.06, label: "Mestre" },
  { min: 16, bonus: 0.05, label: "Dominante" },
  { min: 11, bonus: 0.04, label: "Consolidada" },
  { min: 6, bonus: 0.03, label: "Familiar" },
  { min: 3, bonus: 0.02, label: "Ganhando rotina" },
  { min: 1, bonus: 0.01, label: "A familiarizar" },
];

export function insertTacticHistory(db: any, teamId: number, playerName: string, formation: string, style: string, matchweek: number, competition: string, result: string): void {
  db.run(
    "INSERT INTO player_tactic_history (team_id, player_name, formation, style, matchweek, competition, result) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [teamId, playerName, formation, style, matchweek, competition, result],
  );
}

export function getTacticFamiliarity(
  db: any,
  teamId: number,
  playerName: string,
  currentFormation: string,
  currentStyle: string,
): TacticFamiliarityResult {
  let count = 0;
  let totalGames = 0;

  try {
    db.get(
      "SELECT COUNT(*) AS cnt FROM player_tactic_history WHERE team_id = ? AND player_name = ? AND formation = ? AND style = ?",
      [teamId, playerName, currentFormation, currentStyle],
      (err: any, row: any) => {
        if (!err && row) count = row.cnt;
      },
    );

    db.get(
      "SELECT COUNT(*) AS cnt FROM player_tactic_history WHERE team_id = ? AND player_name = ?",
      [teamId, playerName],
      (err: any, row: any) => {
        if (!err && row) totalGames = row.cnt;
      },
    );
  } catch {
    // Table may not exist yet — return zero
  }

  const tier = TIER_THRESHOLDS.find((t) => count >= t.min) || TIER_THRESHOLDS[TIER_THRESHOLDS.length - 1];

  return {
    bonus: tier.bonus,
    count,
    isMostUsed: true,
    totalGames,
    formation: currentFormation,
    style: currentStyle,
  };
}

export function getBestTacticFamiliarity(
  db: any,
  teamId: number,
  playerName: string,
  allFormations: string[],
): { bonus: number; count: number; formation: string; style: string; isMostUsed: boolean; totalGames: number } {
  let totalGames = 0;
  let bestBonus = 0;
  let bestCount = 0;
  let bestFormation = "";
  let bestStyle = "";

  try {
    db.get(
      "SELECT COUNT(*) AS cnt FROM player_tactic_history WHERE team_id = ? AND player_name = ?",
      [teamId, playerName],
      (err: any, row: any) => {
        if (!err && row) totalGames = row.cnt;
      },
    );

    for (const formation of allFormations) {
      for (const style of ["Balanced", "Defensive", "Offensive"]) {
        let cnt = 0;
        db.get(
          "SELECT COUNT(*) AS cnt FROM player_tactic_history WHERE team_id = ? AND player_name = ? AND formation = ? AND style = ?",
          [teamId, playerName, formation, style],
          (err: any, row: any) => {
            if (!err && row) {
              cnt = row.cnt;
              const tier = TIER_THRESHOLDS.find((t) => cnt >= t.min);
              const bonus = tier ? tier.bonus : 0;
              if (bonus > bestBonus || (bonus === bestBonus && cnt > bestCount)) {
                bestBonus = bonus;
                bestCount = cnt;
                bestFormation = formation;
                bestStyle = style;
              }
            }
          },
        );
      }
    }
  } catch {
    // Table may not exist yet
  }

  return {
    bonus: bestBonus,
    count: bestCount,
    formation: bestFormation,
    style: bestStyle,
    isMostUsed: true,
    totalGames,
  };
}

// Devolve a familiaridade de todas as combinações formação+estilo de uma vez,
// usando uma única query SQL para evitar N+1 callbacks.
export function getAllTacticFamiliarity(
  db: any,
  teamId: number,
  playerName: string,
): Promise<TacticFamiliarityEntry[]> {
  return new Promise((resolve) => {
    db.all(
      `SELECT formation, style, COUNT(*) AS cnt
       FROM player_tactic_history
       WHERE team_id = ? AND player_name = ?
       GROUP BY formation, style`,
      [teamId, playerName],
      (err: any, rows: Array<{ formation: string; style: string; cnt: number }> | undefined) => {
        if (err || !rows) return resolve([]);
        const result: TacticFamiliarityEntry[] = rows.map((row) => {
          const tier = TIER_THRESHOLDS.find((t) => row.cnt >= t.min);
          return {
            formation: row.formation,
            style: row.style,
            count: row.cnt,
            bonus: tier ? tier.bonus : 0,
            label: tier ? tier.label : "",
          };
        });
        resolve(result);
      },
    );
  });
}
