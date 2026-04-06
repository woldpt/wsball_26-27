// @ts-nocheck
import type { ActiveGame, PlayerSession } from "./types";

interface CupFlowDeps {
  io: any;
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
  DIVISION_NAMES: Record<number, string>;
  CUP_TEAMS_BY_ROUND: Record<number, number>;
  CUP_ROUND_NAMES: string[];
  setCupPhase: (
    game: ActiveGame,
    phase: string,
    saveGameState: (game: ActiveGame) => void,
    round?: number,
  ) => string;
  clearCupTimeout: (game: ActiveGame, key: string) => void;
  armCupTimeout: (args: {
    game: ActiveGame;
    key: string;
    ms: number;
    phase: string;
    round: number;
    token: string;
    onElapsed: () => void;
  }) => void;
  saveGameState: (game: ActiveGame) => void;
  getTeamSquad: (
    db: any,
    teamId: number,
    tactic: any,
    currentMatchweek?: number,
  ) => Promise<any[]>;
  simulateExtraTime: (...args: any[]) => Promise<any>;
  simulatePenaltyShootout: (...args: any[]) => any;
  simulateMatchSegment: (...args: any[]) => Promise<void>;
  pickRefereeSummary: (
    roomCode: string,
    teamId: number,
    opponentId: number,
    matchweek: number,
  ) => { name: string; balance: number; favorsTeamA: boolean };
  getPlayerList: (game: ActiveGame) => PlayerSession[];
}

export function createCupFlowHelpers(deps: CupFlowDeps) {
  const {
    io,
    runAll,
    runGet,
    getStandingsRows,
    DIVISION_NAMES,
    CUP_TEAMS_BY_ROUND,
    CUP_ROUND_NAMES,
    setCupPhase,
    clearCupTimeout,
    armCupTimeout,
    saveGameState,
    getTeamSquad,
    simulateExtraTime,
    simulatePenaltyShootout,
    simulateMatchSegment,
    pickRefereeSummary,
    getPlayerList,
  } = deps;

  async function applySeasonEnd(game: ActiveGame) {
    const season = game.season;
    const year = game.year;
    const allTeams = await runAll(
      game.db,
      "SELECT * FROM teams ORDER BY division, id",
    );

    const byDiv: Record<number, any[]> = {};
    for (const team of allTeams) {
      if (!byDiv[team.division]) byDiv[team.division] = [];
      byDiv[team.division].push(team);
    }

    for (const div in byDiv) {
      byDiv[Number(div)] = getStandingsRows(byDiv[Number(div)]);
    }

    const iLigaWinner = byDiv[1] && byDiv[1][0];
    if (iLigaWinner) {
      await new Promise((resolve) => {
        game.db.run(
          "INSERT INTO palmares (team_id, season, achievement) VALUES (?, ?, ?)",
          [iLigaWinner.id, year, "Campeão Nacional"],
          resolve,
        );
      });
      // Prémio do campeonato: 1.000.000€ para o vencedor da Primeira Liga
      await new Promise((resolve) => {
        game.db.run(
          "UPDATE teams SET budget = budget + 1000000 WHERE id = ?",
          [iLigaWinner.id],
          resolve,
        );
      });
      io.to(game.roomCode).emit(
        "systemMessage",
        `🏆 ${iLigaWinner.name} é o Campeão Nacional de ${year}!`,
      );
    }

    for (const div of [2, 3, 4]) {
      const winner = byDiv[div] && byDiv[div][0];
      if (winner) {
        await new Promise((resolve) => {
          game.db.run(
            "INSERT INTO palmares (team_id, season, achievement) VALUES (?, ?, ?)",
            [winner.id, year, `Campeão ${DIVISION_NAMES[div]}`],
            resolve,
          );
        });
      }
    }

    const promotions: Array<{ teamId: number; toDiv: number }> = [];
    for (const [upperDiv, lowerDiv] of [
      [1, 2],
      [2, 3],
      [3, 4],
    ]) {
      const upper = byDiv[upperDiv] || [];
      const lower = byDiv[lowerDiv] || [];
      if (!upper.length || !lower.length) continue;

      const relegated = upper.slice(-2).map((team) => team.id);
      const promoted = lower.slice(0, 2).map((team) => team.id);

      relegated.forEach((id) =>
        promotions.push({ teamId: id, toDiv: lowerDiv }),
      );
      promoted.forEach((id) =>
        promotions.push({ teamId: id, toDiv: upperDiv }),
      );
    }

    for (const promotion of promotions) {
      await new Promise((resolve) => {
        game.db.run(
          "UPDATE teams SET division = ? WHERE id = ?",
          [promotion.toDiv, promotion.teamId],
          resolve,
        );
      });
    }

    await new Promise((resolve) => {
      game.db.run(
        "UPDATE teams SET points=0, wins=0, draws=0, losses=0, goals_for=0, goals_against=0",
        resolve,
      );
    });

    await new Promise((resolve) => {
      game.db.run(
        "UPDATE players SET career_goals = career_goals + goals, career_reds = career_reds + red_cards, career_injuries = career_injuries + injuries",
        resolve,
      );
    });

    await new Promise((resolve) => {
      game.db.run(
        "UPDATE players SET goals = 0, red_cards = 0, injuries = 0, suspension_games = 0, suspension_until_matchweek = 0, injury_until_matchweek = 0",
        resolve,
      );
    });

    game.season += 1;
    game.year += 1;
    game.cupRound = 0;
    game.cupState = "idle";
    game.cupTeamIds = [];
    game.cupFixtures = [];
    game.cupHumanInCup = false;
    game.cupRuntime = {
      phaseToken: "",
      drawPayload: null,
      preMatchPayload: null,
      halftimePayload: null,
      secondHalfPayload: null,
      fixtures: [],
    };
    game.pendingCupRound = null;
    game.leagueAnimAcks = new Set();
    game.cupSecondHalfAcks = new Set();
    if (game._leagueAnimTimeout) {
      clearTimeout(game._leagueAnimTimeout);
      game._leagueAnimTimeout = null;
    }
    if (game._cupPreMatchTimeout) {
      clearTimeout(game._cupPreMatchTimeout);
      game._cupPreMatchTimeout = null;
    }
    if (game._cupDrawTimeout) {
      clearTimeout(game._cupDrawTimeout);
      game._cupDrawTimeout = null;
    }
    if (game._cupHalftimeTimeout) {
      clearTimeout(game._cupHalftimeTimeout);
      game._cupHalftimeTimeout = null;
    }
    if (game._cupSecondHalfTimeout) {
      clearTimeout(game._cupSecondHalfTimeout);
      game._cupSecondHalfTimeout = null;
    }
    saveGameState(game);

    const updatedTeams = await runAll(game.db, "SELECT * FROM teams");
    io.to(game.roomCode).emit("teamsData", updatedTeams);
    io.to(game.roomCode).emit("seasonEnd", {
      season,
      year,
      champion: iLigaWinner
        ? { id: iLigaWinner.id, name: iLigaWinner.name }
        : null,
      promotions,
    });
  }

  async function generateCupDraw(game: ActiveGame, round: number) {
    const season = game.season;
    let teamIds: number[];

    if (round === 1) {
      const teams = await runAll(
        game.db,
        "SELECT id FROM teams WHERE division BETWEEN 1 AND 4 ORDER BY id",
      );
      teamIds = teams.map((team: any) => team.id);
      if (teamIds.length !== CUP_TEAMS_BY_ROUND[1]) {
        throw new Error(
          `Cup round ${round} expected ${CUP_TEAMS_BY_ROUND[1]} teams from divisions 1-4, got ${teamIds.length}`,
        );
      }
    } else {
      const prevRound = await runAll(
        game.db,
        "SELECT winner_team_id FROM cup_matches WHERE season = ? AND round = ? AND played = 1",
        [season, round - 1],
      );
      teamIds = prevRound.map((row: any) => row.winner_team_id).filter(Boolean);
      const expectedTeams = CUP_TEAMS_BY_ROUND[round] || 0;
      if (teamIds.length !== expectedTeams) {
        throw new Error(
          `Cup round ${round} expected ${expectedTeams} winners, got ${teamIds.length}`,
        );
      }
    }

    for (let index = teamIds.length - 1; index > 0; index--) {
      const randomIndex = Math.floor(Math.random() * (index + 1));
      [teamIds[index], teamIds[randomIndex]] = [
        teamIds[randomIndex],
        teamIds[index],
      ];
    }

    const fixtures: Array<{ homeTeamId: number; awayTeamId: number }> = [];
    for (let index = 0; index < teamIds.length; index += 2) {
      const homeId = teamIds[index];
      const awayId = teamIds[index + 1];
      if (!homeId || !awayId) continue;
      await new Promise((resolve) => {
        game.db.run(
          "INSERT INTO cup_matches (season, round, home_team_id, away_team_id) VALUES (?, ?, ?, ?)",
          [season, round, homeId, awayId],
          resolve,
        );
      });
      fixtures.push({ homeTeamId: homeId, awayTeamId: awayId });
    }

    game.cupTeamIds = teamIds;
    game.cupRound = round;
    game.cupState = "draw";
    saveGameState(game);

    return fixtures;
  }

  function cupETAnimGate(game: ActiveGame, timeoutMs = 45000): Promise<void> {
    return new Promise<void>((resolve) => {
      const acks = new Set();
      const timeout = setTimeout(() => {
        delete game._cupETAnimHandler;
        resolve();
      }, timeoutMs);

      game._cupETAnimHandler = (socketId: string) => {
        acks.add(socketId);
        const connected = (
          Object.values(game.playersByName) as PlayerSession[]
        ).filter((player) => player.socketId);
        if (
          connected.length > 0 &&
          connected.every((player) => acks.has(player.socketId as string))
        ) {
          clearTimeout(timeout);
          delete game._cupETAnimHandler;
          resolve();
        }
      };
    });
  }

  async function finalizeCupRound(
    game: ActiveGame,
    round: number,
    expectedToken: string,
  ) {
    if (game.cupState !== "second_half_waiting" || game.cupRound !== round)
      return;
    if ((game.cupRuntime?.phaseToken || "") !== expectedToken) return;

    setCupPhase(game, "finalizing_cup_round", saveGameState, round);
    clearCupTimeout(game, "_cupSecondHalfTimeout");

    const season = game.season;
    const fixtures = game.cupFixtures || [];
    const roundName = CUP_ROUND_NAMES[round] || `Ronda ${round}`;
    const results: any[] = [];
    let hasAnyET = false;

    for (const fixture of fixtures) {
      const t1 = fixture._t1 || { formation: "4-4-2", style: "Balanced" };
      const t2 = fixture._t2 || { formation: "4-4-2", style: "Balanced" };
      const ctx = { game, io, matchweek: game.matchweek };

      let winnerId;
      if (fixture.finalHomeGoals !== fixture.finalAwayGoals) {
        winnerId =
          fixture.finalHomeGoals > fixture.finalAwayGoals
            ? fixture.homeTeamId
            : fixture.awayTeamId;
      } else {
        hasAnyET = true;
        io.to(game.roomCode).emit("cupExtraTimeStart", {
          homeTeamId: fixture.homeTeamId,
          awayTeamId: fixture.awayTeamId,
          homeGoals: fixture.finalHomeGoals,
          awayGoals: fixture.finalAwayGoals,
        });
        await simulateExtraTime(game.db, fixture, t1, t2, ctx);

        if (fixture.finalHomeGoals !== fixture.finalAwayGoals) {
          winnerId =
            fixture.finalHomeGoals > fixture.finalAwayGoals
              ? fixture.homeTeamId
              : fixture.awayTeamId;
        } else {
          const homeSquad = await getTeamSquad(
            game.db,
            fixture.homeTeamId,
            t1,
            game.matchweek,
          );
          const awaySquad = await getTeamSquad(
            game.db,
            fixture.awayTeamId,
            t2,
            game.matchweek,
          );
          const shootout = simulatePenaltyShootout(homeSquad, awaySquad);

          io.to(game.roomCode).emit("cupPenaltyShootout", {
            round,
            homeTeamId: fixture.homeTeamId,
            awayTeamId: fixture.awayTeamId,
            ...shootout,
          });

          fixture._penaltyHomeGoals = shootout.homeGoals;
          fixture._penaltyAwayGoals = shootout.awayGoals;
          fixture._decidedByPenalties = true;

          winnerId =
            shootout.homeGoals > shootout.awayGoals
              ? fixture.homeTeamId
              : fixture.awayTeamId;

          await new Promise((resolve) => {
            game.db.run(
              "UPDATE cup_matches SET home_penalties = ?, away_penalties = ?, played = 1, winner_team_id = ? WHERE season = ? AND round = ? AND home_team_id = ? AND away_team_id = ?",
              [
                shootout.homeGoals,
                shootout.awayGoals,
                winnerId,
                season,
                round,
                fixture.homeTeamId,
                fixture.awayTeamId,
              ],
              resolve,
            );
          });
        }

        await new Promise((resolve) => {
          game.db.run(
            "UPDATE cup_matches SET home_et_score = ?, away_et_score = ? WHERE season = ? AND round = ? AND home_team_id = ? AND away_team_id = ?",
            [
              fixture.finalHomeGoals,
              fixture.finalAwayGoals,
              season,
              round,
              fixture.homeTeamId,
              fixture.awayTeamId,
            ],
            resolve,
          );
        });
      }

      if (!winnerId) {
        winnerId = fixture.homeTeamId;
      }

      await new Promise((resolve) => {
        game.db.run(
          "UPDATE cup_matches SET home_score = ?, away_score = ?, played = 1, winner_team_id = ? WHERE season = ? AND round = ? AND home_team_id = ? AND away_team_id = ?",
          [
            fixture.finalHomeGoals,
            fixture.finalAwayGoals,
            winnerId,
            season,
            round,
            fixture.homeTeamId,
            fixture.awayTeamId,
          ],
          resolve,
        );
      });

      results.push({
        homeTeamId: fixture.homeTeamId,
        awayTeamId: fixture.awayTeamId,
        homeGoals: fixture.finalHomeGoals,
        awayGoals: fixture.finalAwayGoals,
        winnerId,
        wentToET:
          !!fixture._decidedByPenalties ||
          (fixture.finalHomeGoals === fixture.finalAwayGoals &&
            fixture.events.some((event: any) => event.minute > 90)),
        decidedByPenalties: !!fixture._decidedByPenalties,
        penaltyHomeGoals: fixture._penaltyHomeGoals ?? null,
        penaltyAwayGoals: fixture._penaltyAwayGoals ?? null,
        events: fixture.events,
      });

      if (round === 5) {
        const winnerTeam = await runGet(
          game.db,
          "SELECT name FROM teams WHERE id = ?",
          [winnerId],
        );
        await new Promise((resolve) => {
          game.db.run(
            "INSERT INTO palmares (team_id, season, achievement) VALUES (?, ?, ?)",
            [winnerId, game.year, "Vencedor da Taça de Portugal"],
            resolve,
          );
        });
        await new Promise((resolve) => {
          game.db.run(
            "UPDATE teams SET budget = budget + 500000 WHERE id = ?",
            [winnerId],
            resolve,
          );
        });
        const updatedTeams = await runAll(game.db, "SELECT * FROM teams");
        io.to(game.roomCode).emit("teamsData", updatedTeams);
        if (winnerTeam) {
          io.to(game.roomCode).emit(
            "systemMessage",
            `🏆 ${winnerTeam.name} venceu a Taça de Portugal de ${game.year}! (+500 000 €)`,
          );
        }
      }
    }

    if (hasAnyET && game.cupHumanInCup) {
      await cupETAnimGate(game, 45000);
    }

    game.cupFixtures = [];
    game.cupRuntime.drawPayload = null;
    game.cupRuntime.halftimePayload = null;
    game.cupRuntime.secondHalfPayload = null;
    game.cupRuntime.fixtures = [];
    setCupPhase(
      game,
      round === 5 ? "done_cup" : "done_round",
      saveGameState,
      round,
    );

    io.to(game.roomCode).emit("cupRoundResults", {
      round,
      roundName,
      results,
      season,
      isFinal: round === 5,
    });

    if (round === 5) {
      const normMw = ((game.matchweek - 2) % 14) + 1;
      if (normMw === 14 || normMw === 0) {
        try {
          await applySeasonEnd(game);
        } catch (seErr) {
          console.error(
            `[${game.roomCode}] Season end error (from cup):`,
            seErr,
          );
        }
      }
    }
  }

  async function startCupRound(game: ActiveGame, round: number) {
    const drawFixtures = await generateCupDraw(game, round);

    const enriched = await Promise.all(
      drawFixtures.map(async (fixture) => {
        const home = await runGet(
          game.db,
          "SELECT id, name, color_primary, color_secondary FROM teams WHERE id = ?",
          [fixture.homeTeamId],
        );
        const away = await runGet(
          game.db,
          "SELECT id, name, color_primary, color_secondary FROM teams WHERE id = ?",
          [fixture.awayTeamId],
        );
        return { homeTeam: home, awayTeam: away };
      }),
    );

    const connectedPlayers = getPlayerList(game);
    const humanTeamIds = new Set(
      connectedPlayers.map((player) => player.teamId),
    );
    const humanInCup = game.cupTeamIds.some((id) => humanTeamIds.has(id));

    game.cupDrawAcks = new Set();
    game.cupHumanInCup = humanInCup;

    const drawPayload = {
      round,
      roundName: CUP_ROUND_NAMES[round] || `Ronda ${round}`,
      fixtures: enriched,
      humanInCup,
      season: game.season,
    };

    const drawToken = setCupPhase(game, "draw", saveGameState, round);
    game.cupRuntime.drawPayload = drawPayload;
    game.cupRuntime.halftimePayload = null;
    game.cupRuntime.secondHalfPayload = null;
    game.cupRuntime.fixtures = [];
    saveGameState(game);

    io.to(game.roomCode).emit("cupDrawStart", drawPayload);

    if (!humanInCup) {
      await simulateCupFirstHalf(game, round, drawToken);
    } else {
      armCupTimeout({
        game,
        key: "_cupDrawTimeout",
        ms: 30000,
        phase: "draw",
        round,
        token: drawToken,
        onElapsed: () => {
          console.log(
            `[${game.roomCode}] Cup draw timeout — auto-proceeding round ${round}`,
          );
          simulateCupFirstHalf(game, round, drawToken);
        },
      });
    }
  }

  async function simulateCupFirstHalf(
    game: ActiveGame,
    round: number,
    expectedToken: string,
  ) {
    if (
      (game.cupState !== "draw" && game.cupState !== "pre_match") ||
      game.cupRound !== round
    )
      return;
    if ((game.cupRuntime?.phaseToken || "") !== expectedToken) return;

    clearCupTimeout(game, "_cupDrawTimeout");
    clearCupTimeout(game, "_cupPreMatchTimeout");
    setCupPhase(game, "playing_first_half", saveGameState, round);

    const season = game.season;
    const matchRows = await runAll(
      game.db,
      "SELECT * FROM cup_matches WHERE season = ? AND round = ? AND played = 0",
      [season, round],
    );

    const fixtures: any[] = [];
    const roundName = CUP_ROUND_NAMES[round] || `Ronda ${round}`;

    for (const row of matchRows) {
      const fixture: any = {
        _dbRow: row,
        homeTeamId: row.home_team_id,
        awayTeamId: row.away_team_id,
        finalHomeGoals: 0,
        finalAwayGoals: 0,
        events: [],
      };

      const p1 = (Object.values(game.playersByName) as PlayerSession[]).find(
        (player) => player.teamId === row.home_team_id,
      );
      const p2 = (Object.values(game.playersByName) as PlayerSession[]).find(
        (player) => player.teamId === row.away_team_id,
      );
      fixture._t1 = p1 ? p1.tactic : { formation: "4-4-2", style: "Balanced" };
      fixture._t2 = p2 ? p2.tactic : { formation: "4-4-2", style: "Balanced" };

      const ctx = { game, io, matchweek: game.matchweek };
      await simulateMatchSegment(
        game.db,
        fixture,
        fixture._t1,
        fixture._t2,
        1,
        45,
        ctx,
      );

      fixtures.push(fixture);
    }

    const enrichedHalftime = await Promise.all(
      fixtures.map(async (fixture) => {
        const home = await runGet(
          game.db,
          "SELECT id, name, color_primary, color_secondary FROM teams WHERE id = ?",
          [fixture.homeTeamId],
        );
        const away = await runGet(
          game.db,
          "SELECT id, name, color_primary, color_secondary FROM teams WHERE id = ?",
          [fixture.awayTeamId],
        );
        return {
          homeTeam: home,
          awayTeam: away,
          homeGoals: fixture.finalHomeGoals,
          awayGoals: fixture.finalAwayGoals,
          events: fixture.events.slice(),
          homeLineup: fixture.homeLineup || [],
          awayLineup: fixture.awayLineup || [],
          attendance: fixture.attendance || null,
          referee: pickRefereeSummary(
            game.roomCode,
            fixture.homeTeamId,
            fixture.awayTeamId,
            game.matchweek,
          ),
        };
      }),
    );

    game.cupFixtures = fixtures;
    game.cupRuntime.fixtures = fixtures;
    const halftimeToken = setCupPhase(game, "halftime", saveGameState, round);
    game.cupHalfTimeAcks = new Set();
    game.cupRuntime.halftimePayload = {
      round,
      roundName,
      season,
      fixtures: enrichedHalftime,
    };
    game.cupRuntime.secondHalfPayload = null;
    saveGameState(game);

    io.to(game.roomCode).emit(
      "cupHalfTimeResults",
      game.cupRuntime.halftimePayload,
    );
    io.to(game.roomCode).emit("playerListUpdate", getPlayerList(game));

    if (!game.cupHumanInCup) {
      await simulateCupSecondHalf(game, round, halftimeToken);
    } else {
      armCupTimeout({
        game,
        key: "_cupHalftimeTimeout",
        ms: 30000,
        phase: "halftime",
        round,
        token: halftimeToken,
        onElapsed: () => {
          console.log(
            `[${game.roomCode}] Cup halftime timeout — auto-proceeding round ${round}`,
          );
          simulateCupSecondHalf(game, round, halftimeToken);
        },
      });
    }
  }

  async function simulateCupSecondHalf(
    game: ActiveGame,
    round: number,
    expectedToken: string,
  ) {
    if (game.cupState !== "halftime" || game.cupRound !== round) return;
    if ((game.cupRuntime?.phaseToken || "") !== expectedToken) return;

    clearCupTimeout(game, "_cupHalftimeTimeout");
    setCupPhase(game, "playing_second_half", saveGameState, round);

    const season = game.season;
    const fixtures = game.cupFixtures || [];
    const roundName = CUP_ROUND_NAMES[round] || `Ronda ${round}`;

    for (const fixture of fixtures) {
      const t1 = fixture._t1 || { formation: "4-4-2", style: "Balanced" };
      const t2 = fixture._t2 || { formation: "4-4-2", style: "Balanced" };
      const ctx = { game, io, matchweek: game.matchweek };
      await simulateMatchSegment(game.db, fixture, t1, t2, 46, 90, ctx);
    }

    const enrichedSecondHalf = await Promise.all(
      fixtures.map(async (fixture) => {
        const home = await runGet(
          game.db,
          "SELECT id, name, color_primary, color_secondary FROM teams WHERE id = ?",
          [fixture.homeTeamId],
        );
        const away = await runGet(
          game.db,
          "SELECT id, name, color_primary, color_secondary FROM teams WHERE id = ?",
          [fixture.awayTeamId],
        );
        return {
          homeTeamId: fixture.homeTeamId,
          awayTeamId: fixture.awayTeamId,
          finalHomeGoals: fixture.finalHomeGoals,
          finalAwayGoals: fixture.finalAwayGoals,
          events: fixture.events.slice(),
          homeTeam: home,
          awayTeam: away,
          homeLineup: fixture.homeLineup || [],
          awayLineup: fixture.awayLineup || [],
          attendance: fixture.attendance || null,
          referee: pickRefereeSummary(
            game.roomCode,
            fixture.homeTeamId,
            fixture.awayTeamId,
            game.matchweek,
          ),
        };
      }),
    );

    const secondHalfPayload = {
      round,
      roundName,
      season,
      results: enrichedSecondHalf,
    };

    const secondHalfToken = setCupPhase(
      game,
      "second_half_waiting",
      saveGameState,
      round,
    );
    game.cupSecondHalfAcks = new Set();
    game.cupRuntime.secondHalfPayload = secondHalfPayload;
    game.cupRuntime.fixtures = fixtures;
    saveGameState(game);

    io.to(game.roomCode).emit("cupSecondHalfStart", secondHalfPayload);

    if (game.cupHumanInCup) {
      armCupTimeout({
        game,
        key: "_cupSecondHalfTimeout",
        ms: 90000,
        phase: "second_half_waiting",
        round,
        token: secondHalfToken,
        onElapsed: () => {
          console.log(
            `[${game.roomCode}] Cup 2nd-half anim timeout — auto-proceeding round ${round}`,
          );
          finalizeCupRound(game, round, secondHalfToken);
        },
      });
      return;
    }

    await finalizeCupRound(game, round, secondHalfToken);
  }

  function emitCurrentCupPhaseToSocket(game: ActiveGame, socket: any) {
    const runtime = game.cupRuntime || {};
    if (game.cupState === "draw" && runtime.drawPayload) {
      socket.emit("cupDrawStart", runtime.drawPayload);
      return;
    }
    if (game.cupState === "pre_match" && runtime.preMatchPayload) {
      socket.emit("cupPreMatch", runtime.preMatchPayload);
      return;
    }
    if (game.cupState === "halftime" && runtime.halftimePayload) {
      socket.emit("cupHalfTimeResults", runtime.halftimePayload);
      return;
    }
    if (game.cupState === "second_half_waiting" && runtime.secondHalfPayload) {
      socket.emit("cupSecondHalfStart", runtime.secondHalfPayload);
    }
  }

  function ensureCupPhaseTimeout(game: ActiveGame) {
    const token = game.cupRuntime?.phaseToken;
    const round = game.cupRound;
    if (!token || !round) return;

    if (game.cupState === "pre_match" && !game._cupPreMatchTimeout) {
      armCupTimeout({
        game,
        key: "_cupPreMatchTimeout",
        ms: 60000,
        phase: "pre_match",
        round,
        token,
        onElapsed: () => {
          console.log(
            `[${game.roomCode}] Cup pre-match timeout — auto-starting round ${round}`,
          );
          simulateCupFirstHalf(game, round, token);
        },
      });
    }

    if (game.cupState === "draw" && !game._cupDrawTimeout) {
      armCupTimeout({
        game,
        key: "_cupDrawTimeout",
        ms: 30000,
        phase: "draw",
        round,
        token,
        onElapsed: () => {
          console.log(
            `[${game.roomCode}] Cup draw timeout — auto-proceeding round ${round}`,
          );
          simulateCupFirstHalf(game, round, token);
        },
      });
    }

    if (game.cupState === "halftime" && !game._cupHalftimeTimeout) {
      armCupTimeout({
        game,
        key: "_cupHalftimeTimeout",
        ms: 30000,
        phase: "halftime",
        round,
        token,
        onElapsed: () => {
          console.log(
            `[${game.roomCode}] Cup halftime timeout — auto-proceeding round ${round}`,
          );
          simulateCupSecondHalf(game, round, token);
        },
      });
    }

    if (
      game.cupState === "second_half_waiting" &&
      !game._cupSecondHalfTimeout
    ) {
      armCupTimeout({
        game,
        key: "_cupSecondHalfTimeout",
        ms: 90000,
        phase: "second_half_waiting",
        round,
        token,
        onElapsed: () => {
          console.log(
            `[${game.roomCode}] Cup 2nd-half anim timeout — auto-proceeding round ${round}`,
          );
          finalizeCupRound(game, round, token);
        },
      });
    }
  }

  return {
    applySeasonEnd,
    startCupRound,
    simulateCupFirstHalf,
    simulateCupSecondHalf,
    finalizeCupRound,
    emitCurrentCupPhaseToSocket,
    ensureCupPhaseTimeout,
  };
}
