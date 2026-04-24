import type { ActiveGame } from "./types";
import { MAX_ATTENDANCE_BY_DIVISION } from "./gameConstants";

type Db = any;
type AnyRow = Record<string, any>;

const refereeNames = [
  "João Pinheiro (AF Braga)",
  "Luís Godinho (AF Évora)",
  "Artur Soares Dias (AF Porto)",
  "António Nobre (AF Leiria)",
  "Fábio Veríssimo (AF Leiria)",
  "Tiago Martins (AF Lisboa)",
  "Miguel Nogueira (AF Lisboa)",
  "Gustavo Correia (AF Porto)",
  "Cláudio Pereira (AF Aveiro)",
  "João Gonçalves (AF Porto)",
  "André Narciso (AF Setúbal)",
  "Hélder Malheiro (AF Lisboa)",
  "Ricardo Baixinho (AF Lisboa)",
  "Hélder Carvalho (AF Santarém)",
  "Iancu Vasilica (AF Vila Real)",
  "David Rafael Silva (AF Porto)",
  "Carlos Macedo (AF Braga)",
  "José Bessa (AF Porto)",
  "Bruno Pires Costa (AF Viana do Castelo)",
  "Miguel Fonseca (AF Porto)",
  "Sérgio Guelho (AF Guarda)",
  "Anzhony Rodrigues (AF Madeira)",
  "Diogo Rosa (AF Beja)",
  "Pedro Ramalho (AF Évora)",
  "Hugo Miguel (AF Lisboa)",
  "Manuel Oliveira (AF Porto)",
  "Rui Costa (AF Porto)",
  "Bruno Esteves (AF Setúbal)",
  "Vasco Santos (AF Porto)",
  "Nuno Almeida (AF Algarve)",
  "Luís Ferreira (AF Braga)",
  "Rui Oliveira (AF Porto)",
  "Catarina Campos (AF Lisboa)",
  "Sandra Bastos (AF Aveiro)",
  "Sílvia Domingos (AF Algarve)",
  "Ana Afonso (AF Porto)",
  "Inês Andrada (AF Lisboa)",
  "Teresa Oliveira (AF Braga)",
  "Sara Alves (AF Porto)",
  "Bruno Vieira (AF Lisboa)",
  "Vítor Ferreira (AF Braga)",
  "Márcio Torres (AF Viana do Castelo)",
  "Gonçalo Neves (AF Coimbra)",
  "Flávio Jesus (AF Aveiro)",
  "Fábio Melo (AF Porto)",
  "Diogo Araújo (AF Porto)",
  "Marcos Brazão (AF Algarve)",
  "Rui Lima (AF Viana do Castelo)",
  "Vítor Lopes (AF Viana do Castelo)",
  "João Mendes (AF Santarém)",
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

export function validatePositiveInt(val: unknown): number | null {
  const n = Number(val);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function runExec(
  db: Db,
  sql: string,
  params: any[] = [],
): Promise<{ changes: number }> {
  return new Promise<{ changes: number }>((resolve, reject) => {
    db.run(sql, params, function (this: any, err: Error | null) {
      if (err) return reject(err);
      resolve({ changes: this.changes ?? 0 });
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

export async function getAllTeamForms(
  db: Db,
  season?: number,
): Promise<Record<number, string>> {
  const rows = await runAll(
    db,
    season != null
      ? `SELECT m.home_team_id, m.away_team_id, m.home_score, m.away_score
         FROM matches m
         WHERE m.played = 1 AND m.season = ${season}
         ORDER BY m.id DESC`
      : `SELECT m.home_team_id, m.away_team_id, m.home_score, m.away_score
         FROM matches m
         WHERE m.played = 1
         ORDER BY m.id DESC`,
  );
  const formMap: Record<number, string[]> = {};
  for (const row of rows) {
    const homeId = row.home_team_id;
    const awayId = row.away_team_id;
    if (!formMap[homeId]) formMap[homeId] = [];
    if (!formMap[awayId]) formMap[awayId] = [];
    if (formMap[homeId].length < 5) {
      formMap[homeId].push(
        row.home_score > row.away_score
          ? "V"
          : row.home_score < row.away_score
            ? "D"
            : "E",
      );
    }
    if (formMap[awayId].length < 5) {
      formMap[awayId].push(
        row.away_score > row.home_score
          ? "V"
          : row.away_score < row.home_score
            ? "D"
            : "E",
      );
    }
  }
  const result: Record<number, string> = {};
  for (const [id, arr] of Object.entries(formMap)) {
    result[Number(id)] = arr.reverse().join("");
  }
  return result;
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
  const team = await runGet<{
    stadium_capacity?: number;
    division?: number;
    avg_attendance?: number;
  }>(
    db,
    "SELECT stadium_capacity, division, avg_attendance FROM teams WHERE id = ?",
    [homeTeamId],
  );
  const rawCapacity = team ? team.stadium_capacity || 10000 : 10000;
  const divLimit = MAX_ATTENDANCE_BY_DIVISION[team?.division ?? 1] ?? Infinity;
  const capacity = Math.min(rawCapacity, divLimit);

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

  // Calcular índice de forma (0.0 a 1.0) com base nos últimos 5 jogos
  // W=1.0, D=0.4, L=0 (conforme README)
  let formPoints = recentMatches.length === 0 ? 0.5 : 0;
  for (const m of recentMatches) {
    const isHome = m.home_team_id === homeTeamId;
    const gf = isHome ? m.home_score : m.away_score;
    const ga = isHome ? m.away_score : m.home_score;
    if (gf > ga) formPoints += 1.0;
    else if (gf === ga) formPoints += 0.4;
  }
  if (recentMatches.length > 0) {
    formPoints /= recentMatches.length;
  }

  // Ocupação do estádio: mínimo 30%, máximo 100%
  const formAttendance = Math.floor(capacity * (0.3 + formPoints * 0.7));

  // Se existe média histórica, blendá-la com a previsão baseada em forma
  const prevAvg = team?.avg_attendance || 0;
  if (prevAvg > 0) {
    return Math.min(capacity, Math.round((prevAvg + formAttendance) / 2));
  }
  return formAttendance;
}

export function logClubNews(
  game: ActiveGame,
  type: string,
  title: string,
  teamId: number,
  data: {
    player_name?: string;
    player_id?: number;
    related_team_name?: string;
    related_team_id?: number;
    amount?: number;
    description?: string;
  },
  io?: any,
  extra?: Record<string, any>,
) {
  const description = data.description || null;
  game.db.run(
    `INSERT INTO club_news (team_id, type, title, description, player_id, player_name, related_team_id, related_team_name, amount, matchweek, year)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      teamId,
      type,
      title,
      description,
      data.player_id || null,
      data.player_name || null,
      data.related_team_id || null,
      data.related_team_name || null,
      data.amount || null,
      game.matchweek,
      game.year || 0,
    ],
    () => {
      if (io) {
        io.to(game.roomCode).emit("clubNewsUpdated", {
          teamId,
          type,
          title,
          playerId: data.player_id || null,
          playerName: data.player_name || null,
          ...extra,
        });
      }
    },
  );
}
