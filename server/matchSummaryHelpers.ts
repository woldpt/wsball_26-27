import type { ActiveGame } from "./types";
import { SEASON_CALENDAR } from "./gameConstants";

interface MatchSummaryDeps {
  runAll: <T extends Record<string, any> = Record<string, any>>(
    db: any,
    sql: string,
    params?: any[],
  ) => Promise<T[]>;
  runGet: <T extends Record<string, any> = Record<string, any>>(
    db: any,
    sql: string,
    params?: any[],
  ) => Promise<T | null>;
  getStandingsRows: (teams?: Record<string, any>[]) => Record<string, any>[];
  generateFixturesForDivision: (
    db: any,
    division: number,
    matchweek: number,
    userTeamId?: number,
  ) => Promise<any[]>;
  pickRefereeSummary: (
    roomCode: string,
    teamId: number,
    opponentId: number,
    matchweek: number,
  ) => { name: string; balance: number; favorsTeamA: boolean };
}

export function createMatchSummaryHelpers(deps: MatchSummaryDeps) {
  const {
    runAll,
    runGet,
    getStandingsRows,
    generateFixturesForDivision,
    pickRefereeSummary,
  } = deps;

  async function getTeamRecentResults(
    game: ActiveGame,
    teamId: number,
    limit = 5,
  ) {
    const rows = await runAll(
      game.db,
      `SELECT m.matchweek, m.home_team_id, m.away_team_id, m.home_score, m.away_score,
              h.name AS home_name, a.name AS away_name
       FROM matches m
       LEFT JOIN teams h ON h.id = m.home_team_id
       LEFT JOIN teams a ON a.id = m.away_team_id
       WHERE m.played = 1 AND (m.home_team_id = ? OR m.away_team_id = ?)
       ORDER BY m.matchweek DESC, m.id DESC
       LIMIT ?`,
      [teamId, teamId, limit],
    );

    const recent = rows.map((row: any) => {
      const isHome = row.home_team_id === teamId;
      const goalsFor = isHome ? row.home_score : row.away_score;
      const goalsAgainst = isHome ? row.away_score : row.home_score;
      if (goalsFor > goalsAgainst) return "V";
      if (goalsFor < goalsAgainst) return "D";
      return "E";
    });

    return recent.join("");
  }

  async function buildNextMatchSummary(game: ActiveGame, teamId: number) {
    const team = await runGet(game.db, "SELECT * FROM teams WHERE id = ?", [
      teamId,
    ]);
    if (!team) return null;

    const currentEntry = SEASON_CALENDAR[game.calendarIndex];

    // ── CUP WEEK ────────────────────────────────────────────────────────────
    if (currentEntry?.type === "cup") {
      const cupMatch = await runGet(
        game.db,
        "SELECT * FROM cup_matches WHERE season = ? AND round = ? AND (home_team_id = ? OR away_team_id = ?) AND played = 0",
        [game.season, currentEntry.round, teamId, teamId],
      );
      if (!cupMatch) return null;

      const isHome = cupMatch.home_team_id === teamId;
      const opponentId = isHome ? cupMatch.away_team_id : cupMatch.home_team_id;
      const opponent = await runGet(
        game.db,
        "SELECT * FROM teams WHERE id = ?",
        [opponentId],
      );
      if (!opponent) return null;

      const referee = pickRefereeSummary(
        game.roomCode,
        team.id,
        opponent.id,
        game.matchweek,
      );

      return {
        matchweek: game.matchweek,
        isCup: true,
        cupRound: currentEntry.round,
        cupRoundName: currentEntry.roundName,
        venue: isHome ? "Casa" : "Fora",
        team: {
          id: team.id,
          name: team.name,
          division: team.division,
          position: null,
        },
        opponent: {
          id: opponent.id,
          name: opponent.name,
          division: opponent.division,
          position: null,
          points: opponent.points || 0,
          goalsFor: opponent.goals_for || 0,
          goalsAgainst: opponent.goals_against || 0,
          last5: await getTeamRecentResults(game, opponent.id, 5),
        },
        referee,
      };
    }

    // ── LEAGUE WEEK ─────────────────────────────────────────────────────────
    const standings = getStandingsRows(
      await runAll(
        game.db,
        "SELECT id, name, division, points, wins, draws, losses, goals_for, goals_against FROM teams WHERE division = ?",
        [team.division],
      ),
    );
    const standingsIndex = new Map(
      standings.map((standingTeam, index) => [standingTeam.id, index + 1]),
    );

    const fixtures = await generateFixturesForDivision(
      game.db,
      team.division,
      game.matchweek,
      team.id,
    );
    const fixture = fixtures.find(
      (entry: any) =>
        entry.homeTeamId === team.id || entry.awayTeamId === team.id,
    );
    if (!fixture) return null;

    const isHome = fixture.homeTeamId === team.id;
    const opponentId = isHome ? fixture.awayTeamId : fixture.homeTeamId;
    const opponent = await runGet(game.db, "SELECT * FROM teams WHERE id = ?", [
      opponentId,
    ]);
    if (!opponent) return null;

    const referee = pickRefereeSummary(
      game.roomCode,
      team.id,
      opponent.id,
      game.matchweek,
    );

    return {
      matchweek: game.matchweek,
      isCup: false,
      venue: isHome ? "Casa" : "Fora",
      team: {
        id: team.id,
        name: team.name,
        division: team.division,
        position: standingsIndex.get(team.id) || null,
      },
      opponent: {
        id: opponent.id,
        name: opponent.name,
        division: opponent.division,
        position: standingsIndex.get(opponent.id) || null,
        points: opponent.points || 0,
        goalsFor: opponent.goals_for || 0,
        goalsAgainst: opponent.goals_against || 0,
        last5: await getTeamRecentResults(game, opponent.id, 5),
      },
      referee,
    };
  }

  function persistMatchResults(
    game: ActiveGame,
    fixtures: any[],
    matchweek: number,
    onDone?: () => void,
  ) {
    let remaining = fixtures.length;
    if (remaining === 0) {
      if (onDone) onDone();
      return;
    }

    game.db.serialize(() => {
      fixtures.forEach((match) => {
        game.db.run(
          "DELETE FROM matches WHERE matchweek = ? AND home_team_id = ? AND away_team_id = ? AND competition = 'League'",
          [matchweek, match.homeTeamId, match.awayTeamId],
          () => {
            game.db.run(
              `INSERT INTO matches (
                matchweek, home_team_id, away_team_id, home_score, away_score, played, narrative, competition, attendance, home_lineup, away_lineup
              ) VALUES (?, ?, ?, ?, ?, 1, ?, 'League', ?, ?, ?)`,
              [
                matchweek,
                match.homeTeamId,
                match.awayTeamId,
                match.finalHomeGoals,
                match.finalAwayGoals,
                JSON.stringify(match.events || []),
                match.attendance || 0,
                JSON.stringify(match.homeLineup || []),
                JSON.stringify(match.awayLineup || []),
              ],
              () => {
                remaining -= 1;
                if (remaining === 0 && onDone) onDone();
              },
            );
          },
        );
      });
    });
  }

  return {
    getTeamRecentResults,
    buildNextMatchSummary,
    persistMatchResults,
  };
}
