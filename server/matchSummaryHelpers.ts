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

  function generateWeatherForecast() {
    const weatherRoll = Math.random();
    let condition: string;
    let emoji: string;
    if (weatherRoll < 0.35) {
      condition = "sol";
      emoji = "☀️";
    } else if (weatherRoll < 0.65) {
      condition = "chuva";
      emoji = "🌧️";
    } else if (weatherRoll < 0.8) {
      condition = "vento";
      emoji = "💨";
    } else if (weatherRoll < 0.88) {
      condition = "chuva_forte";
      emoji = "⛈️";
    } else if (weatherRoll < 0.95) {
      condition = "frio";
      emoji = "🥶";
    } else if (weatherRoll < 0.98) {
      condition = "nevoeiro";
      emoji = "🌫️";
    } else {
      condition = "neve";
      emoji = "❄️";
    }
    return { condition, emoji };
  }

  async function getLastConfrontation(
    game: ActiveGame,
    teamAId: number,
    teamBId: number,
  ) {
    const leagueRow: any = await runGet(
      game.db,
      `SELECT season, matchweek, home_team_id, away_team_id, home_score, away_score
       FROM matches
       WHERE played = 1
         AND ((home_team_id = ? AND away_team_id = ?)
           OR (home_team_id = ? AND away_team_id = ?))
       ORDER BY season DESC, matchweek DESC, id DESC
       LIMIT 1`,
      [teamAId, teamBId, teamBId, teamAId],
    );

    const cupRow: any = await runGet(
      game.db,
      `SELECT season, round, home_team_id, away_team_id, home_score, away_score,
              home_et_score, away_et_score, home_penalties, away_penalties
       FROM cup_matches
       WHERE played = 1
         AND ((home_team_id = ? AND away_team_id = ?)
           OR (home_team_id = ? AND away_team_id = ?))
       ORDER BY season DESC, round DESC
       LIMIT 1`,
      [teamAId, teamBId, teamBId, teamAId],
    );

    if (!leagueRow && !cupRow) return null;

    // Pick the more recent of the two using calendarIndex within season.
    const leagueIdx = leagueRow
      ? SEASON_CALENDAR.find(
          (e) => e.type === "league" && e.matchweek === leagueRow.matchweek,
        )?.calendarIndex ?? -1
      : -1;
    const cupIdx = cupRow
      ? SEASON_CALENDAR.find(
          (e) => e.type === "cup" && e.round === cupRow.round,
        )?.calendarIndex ?? -1
      : -1;

    let pick: "league" | "cup";
    if (!leagueRow) pick = "cup";
    else if (!cupRow) pick = "league";
    else if (cupRow.season !== leagueRow.season)
      pick = cupRow.season > leagueRow.season ? "cup" : "league";
    else pick = cupIdx > leagueIdx ? "cup" : "league";

    if (pick === "league") {
      const isHome = leagueRow.home_team_id === teamAId;
      const goalsFor = isHome ? leagueRow.home_score : leagueRow.away_score;
      const goalsAgainst = isHome ? leagueRow.away_score : leagueRow.home_score;
      const result =
        goalsFor > goalsAgainst ? "V" : goalsFor < goalsAgainst ? "D" : "E";
      return {
        season: leagueRow.season,
        competition: "league" as const,
        matchweek: leagueRow.matchweek,
        venue: isHome ? "Casa" : ("Fora" as "Casa" | "Fora"),
        goalsFor,
        goalsAgainst,
        result,
      };
    }

    const isHome = cupRow.home_team_id === teamAId;
    const goalsFor = isHome ? cupRow.home_score : cupRow.away_score;
    const goalsAgainst = isHome ? cupRow.away_score : cupRow.home_score;
    const cupEntry = SEASON_CALENDAR.find(
      (e) => e.type === "cup" && e.round === cupRow.round,
    ) as Extract<typeof SEASON_CALENDAR[number], { type: "cup" }> | undefined;

    const hasEt =
      cupRow.home_et_score != null && cupRow.away_et_score != null;
    const hasPen =
      cupRow.home_penalties != null && cupRow.away_penalties != null;

    // Determine result including ET/penalties for cup ties.
    let result: "V" | "E" | "D";
    if (hasPen) {
      const myPen = isHome ? cupRow.home_penalties : cupRow.away_penalties;
      const opPen = isHome ? cupRow.away_penalties : cupRow.home_penalties;
      result = myPen > opPen ? "V" : "D";
    } else if (hasEt) {
      const myEt =
        (isHome ? cupRow.home_score : cupRow.away_score) +
        (isHome ? cupRow.home_et_score : cupRow.away_et_score);
      const opEt =
        (isHome ? cupRow.away_score : cupRow.home_score) +
        (isHome ? cupRow.away_et_score : cupRow.home_et_score);
      result = myEt > opEt ? "V" : myEt < opEt ? "D" : "E";
    } else {
      result =
        goalsFor > goalsAgainst ? "V" : goalsFor < goalsAgainst ? "D" : "E";
    }

    return {
      season: cupRow.season,
      competition: "cup" as const,
      cupRound: cupRow.round,
      cupRoundName: cupEntry?.roundName ?? null,
      venue: isHome ? "Casa" : ("Fora" as "Casa" | "Fora"),
      goalsFor,
      goalsAgainst,
      result,
      ...(hasEt
        ? {
            extraTime: {
              goalsFor: isHome ? cupRow.home_et_score : cupRow.away_et_score,
              goalsAgainst: isHome
                ? cupRow.away_et_score
                : cupRow.home_et_score,
            },
          }
        : {}),
      ...(hasPen
        ? {
            penalties: {
              goalsFor: isHome ? cupRow.home_penalties : cupRow.away_penalties,
              goalsAgainst: isHome
                ? cupRow.away_penalties
                : cupRow.home_penalties,
            },
          }
        : {}),
    };
  }

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
      if (!cupMatch) {
        // Team is eliminated from this round — return spectator summary (no opponent)
        return {
          matchweek: game.matchweek,
          isCup: true,
          cupRound: (currentEntry as any).round,
          cupRoundName: (currentEntry as any).roundName,
          opponent: null,
        };
      }

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

      const weather = generateWeatherForecast();

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
          color_primary: opponent.color_primary || null,
          color_secondary: opponent.color_secondary || null,
          last5: await getTeamRecentResults(game, opponent.id, 5),
          lastConfrontation: await getLastConfrontation(
            game,
            team.id,
            opponent.id,
          ),
        },
        referee,
        weatherForecast: weather,
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

    const weather = generateWeatherForecast();

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
        color_primary: opponent.color_primary || null,
        color_secondary: opponent.color_secondary || null,
        last5: await getTeamRecentResults(game, opponent.id, 5),
        lastConfrontation: await getLastConfrontation(
          game,
          team.id,
          opponent.id,
        ),
      },
      referee,
      weatherForecast: weather,
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
                season, matchweek, home_team_id, away_team_id, home_score, away_score, played, narrative, competition, attendance, home_lineup, away_lineup
              ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, 'League', ?, ?, ?)`,
              [
                game.season,
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
                // Update player form after match
                const homeLineupIds = (match.homeLineup || [])
                  .map((p: any) => p.id)
                  .filter((id: number) => id > 0);
                const awayLineupIds = (match.awayLineup || [])
                  .map((p: any) => p.id)
                  .filter((id: number) => id > 0);
                const homeWon = match.finalHomeGoals > match.finalAwayGoals;
                const awayWon = match.finalAwayGoals > match.finalHomeGoals;
                const drew = !homeWon && !awayWon;

                const applyFormDelta = (ids: number[], won: boolean) => {
                  if (ids.length === 0) return;
                  const delta = drew
                    ? Math.floor(Math.random() * 5) - 2 // -2 a +2
                    : won
                      ? 5 + Math.floor(Math.random() * 6) // +5 a +10
                      : -(5 + Math.floor(Math.random() * 6)); // -5 a -10
                  const ph = ids.map(() => "?").join(",");
                  game.db.run(
                    `UPDATE players SET form = MIN(130, MAX(70, form + ?)) WHERE id IN (${ph})`,
                    [delta, ...ids],
                  );
                };

                applyFormDelta(homeLineupIds, homeWon);
                applyFormDelta(awayLineupIds, awayWon);

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
