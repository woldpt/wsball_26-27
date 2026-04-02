type Db = any;
type AnyRow = Record<string, any>;

const refereeNames = [
  "Afonso Pereira",
  "Bruno Almeida",
  "Carlos Nogueira",
  "Diogo Valente",
  "Eduardo Matos",
  "Filipe Santos",
  "Gonçalo Ribeiro",
  "Hugo Carvalho",
  "Inácio Moreira",
  "João Varela",
  "Leandro Costa",
  "Miguel Teixeira",
  "Nuno Figueiredo",
  "Óscar Pires",
  "Pedro Cunha",
  "Rafael Martins",
  "Sérgio Lima",
  "Tiago Fernandes",
  "Ulisses Rocha",
  "Vasco Mendes",
  "Xavier Correia",
  "Yuri Lopes",
  "Zé Monteiro",
  "André Simões",
  "Bernardo Fonseca",
  "César Tavares",
  "Daniel Ribeiro",
  "Elias Pinto",
  "Francisco Lobo",
  "Guilherme Serra",
  "Henrique Antunes",
  "Isaac Barros",
];

export function getSeasonEndMatchweek(matchweek: number) {
  return Math.ceil(Math.max(1, matchweek) / 14) * 14;
}

export function hashString(input = "") {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
  }
  return hash;
}

export function runAll<T extends AnyRow = AnyRow>(
  db: Db,
  sql: string,
  params: any[] = [],
): Promise<T[]> {
  return new Promise<T[]>((resolve, reject) => {
    db.all(sql, params, (err: Error | null, rows: T[]) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
}

export function runGet<T extends AnyRow = AnyRow>(
  db: Db,
  sql: string,
  params: any[] = [],
): Promise<T | null> {
  return new Promise<T | null>((resolve, reject) => {
    db.get(sql, params, (err: Error | null, row: T | null) => {
      if (err) return reject(err);
      resolve(row || null);
    });
  });
}

export function getStandingsRows(teams: AnyRow[] = []) {
  return [...teams].sort((a, b) => {
    const aGoalDifference = (a.goals_for || 0) - (a.goals_against || 0);
    const bGoalDifference = (b.goals_for || 0) - (b.goals_against || 0);
    return (
      (b.points || 0) - (a.points || 0) ||
      bGoalDifference - aGoalDifference ||
      (b.goals_for || 0) - (a.goals_for || 0) ||
      String(a.name || "").localeCompare(String(b.name || ""))
    );
  });
}

export function pickRefereeSummary(
  roomCode: string,
  teamId: number,
  opponentId: number,
  matchweek: number,
) {
  const seed = hashString(`${roomCode}:${matchweek}:${teamId}:${opponentId}`);
  const refereeName = refereeNames[seed % refereeNames.length];
  const biasSeed = hashString(
    `${refereeName}:${teamId}:${opponentId}:${roomCode}`,
  );
  const balance = 20 + (biasSeed % 61);
  return {
    name: refereeName,
    balance,
    favorsTeamA: balance >= 50,
  };
}

export async function calculateMatchAttendance(db: Db, homeTeamId: number) {
  const team = await runGet<{ stadium_capacity?: number }>(
    db,
    "SELECT stadium_capacity FROM teams WHERE id = ?",
    [homeTeamId],
  );
  const capacity = team ? team.stadium_capacity || 5000 : 5000;

  const recentMatches = await runAll<{
    home_team_id: number;
    away_team_id: number;
    home_score: number;
    away_score: number;
  }>(
    db,
    `SELECT home_team_id, away_team_id, home_score, away_score
     FROM matches
     WHERE played = 1 AND (home_team_id = ? OR away_team_id = ?)
     ORDER BY matchweek DESC, id DESC
     LIMIT 5`,
    [homeTeamId, homeTeamId],
  );

  let formScore = recentMatches.length === 0 ? 5 : 0;
  for (const m of recentMatches) {
    const isHome = m.home_team_id === homeTeamId;
    const gf = isHome ? m.home_score : m.away_score;
    const ga = isHome ? m.away_score : m.home_score;
    if (gf > ga) formScore += 3;
    else if (gf === ga) formScore += 1;
  }

  const maxFormScore = Math.max(recentMatches.length, 1) * 3;
  const baseOccupancy = 0.35 + (formScore / Math.max(maxFormScore, 15)) * 0.5;
  const noise = (Math.random() - 0.5) * 0.16;
  const occupancy = Math.max(0.15, Math.min(1.0, baseOccupancy + noise));
  return Math.floor(capacity * occupancy);
}
