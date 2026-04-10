// @ts-nocheck
import type { ActiveGame, PlayerSession } from "./types";
import type { CalendarEntry } from "./gameConstants";
import { SEASON_CALENDAR } from "./gameConstants";
import { clearPhaseTimer, makePhaseToken } from "./matchFlowHelpers";

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
  saveGameState: (game: ActiveGame) => void;
  getTeamSquad: (
    db: any,
    teamId: number,
    tactic: any,
    currentMatchweek?: number,
  ) => Promise<any[]>;
  simulateExtraTime: (...args: any[]) => Promise<any>;
  simulatePenaltyShootout: (...args: any[]) => any;
  pickRefereeSummary: (
    roomCode: string,
    teamId: number,
    opponentId: number,
    matchweek: number,
  ) => { name: string; balance: number; favorsTeamA: boolean };
  getPlayerList: (game: ActiveGame) => PlayerSession[];
  checkAllReady: (game: ActiveGame) => Promise<void>;
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
    saveGameState,
    getTeamSquad,
    simulateExtraTime,
    simulatePenaltyShootout,
    pickRefereeSummary,
    getPlayerList,
    checkAllReady,
  } = deps;

  // ─── SEASON END ────────────────────────────────────────────────────────────

  async function applySeasonEnd(game: ActiveGame) {
    const season = game.season;
    const year = game.year;
    const allTeams = await runAll(game.db, "SELECT * FROM teams ORDER BY division, id");

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
    for (const [upperDiv, lowerDiv] of [[1, 2], [2, 3], [3, 4]]) {
      const upper = byDiv[upperDiv] || [];
      const lower = byDiv[lowerDiv] || [];
      if (!upper.length || !lower.length) continue;
      const relegated = upper.slice(-2).map((team) => team.id);
      const promoted = lower.slice(0, 2).map((team) => team.id);
      relegated.forEach((id) => promotions.push({ teamId: id, toDiv: lowerDiv }));
      promoted.forEach((id) => promotions.push({ teamId: id, toDiv: upperDiv }));
    }

    for (const promotion of promotions) {
      await new Promise((resolve) => {
        game.db.run("UPDATE teams SET division = ? WHERE id = ?", [promotion.toDiv, promotion.teamId], resolve);
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

    // Reset to new season
    game.season += 1;
    game.year += 1;
    game.calendarIndex = 0;
    game.matchweek = 1;
    game.gamePhase = "lobby";
    game.currentEvent = SEASON_CALENDAR[0];
    game.currentFixtures = [];
    game.cupTeamIds = [];
    game.cupDrawPayload = null;
    game.cupHalftimePayload = null;
    game.cupSecondHalfPayload = null;
    game.lastHalftimePayload = null;
    clearPhaseTimer(game);
    game.phaseAcks = new Set();
    game.phaseToken = "";
    saveGameState(game);

    const updatedTeams = await runAll(game.db, "SELECT * FROM teams");
    io.to(game.roomCode).emit("teamsData", updatedTeams);
    io.to(game.roomCode).emit("seasonEnd", {
      season,
      year,
      champion: iLigaWinner ? { id: iLigaWinner.id, name: iLigaWinner.name } : null,
      promotions,
    });
  }

  // ─── CUP DRAW ──────────────────────────────────────────────────────────────

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

    // Fisher-Yates shuffle
    for (let i = teamIds.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [teamIds[i], teamIds[j]] = [teamIds[j], teamIds[i]];
    }

    const fixtures: Array<{ homeTeamId: number; awayTeamId: number }> = [];
    for (let i = 0; i < teamIds.length; i += 2) {
      const homeId = teamIds[i];
      const awayId = teamIds[i + 1];
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
    return fixtures;
  }

  // ─── START CUP ROUND ────────────────────────────────────────────────────────
  // Sets gamePhase = "cup_draw", populates currentFixtures, arms draw timer.

  async function startCupRound(game: ActiveGame, round: number) {
    const drawFixtures = await generateCupDraw(game, round);

    // Enrich fixtures with team info and pre-assign tactics
    const enrichedFixtures: any[] = [];
    for (const fixture of drawFixtures) {
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
      const p1 = (Object.values(game.playersByName) as PlayerSession[]).find(
        (p) => p.teamId === fixture.homeTeamId,
      );
      const p2 = (Object.values(game.playersByName) as PlayerSession[]).find(
        (p) => p.teamId === fixture.awayTeamId,
      );
      enrichedFixtures.push({
        homeTeamId: fixture.homeTeamId,
        awayTeamId: fixture.awayTeamId,
        homeTeam: home,
        awayTeam: away,
        finalHomeGoals: 0,
        finalAwayGoals: 0,
        events: [],
        homeLineup: [],
        awayLineup: [],
        _t1: p1 ? p1.tactic : { formation: "4-4-2", style: "Balanced" },
        _t2: p2 ? p2.tactic : { formation: "4-4-2", style: "Balanced" },
      });
    }

    game.currentFixtures = enrichedFixtures;
    game.currentEvent = SEASON_CALENDAR[game.calendarIndex];

    // Build draw payload (pairs of teams for the draw animation)
    const connectedPlayers = getPlayerList(game);
    const humanTeamIds = new Set(connectedPlayers.map((p) => p.teamId));
    const humanInCup = game.cupTeamIds.some((id) => humanTeamIds.has(id));

    const drawPayload = {
      round,
      roundName: CUP_ROUND_NAMES[round] || `Ronda ${round}`,
      fixtures: enrichedFixtures.map((f) => ({ homeTeam: f.homeTeam, awayTeam: f.awayTeam })),
      humanInCup,
      season: game.season,
    };

    game.cupDrawPayload = drawPayload;
    game.cupHalftimePayload = null;
    game.cupSecondHalfPayload = null;
    game.gamePhase = "cup_draw";
    game.phaseToken = makePhaseToken(game);
    game.phaseAcks = new Set();
    saveGameState(game);

    io.to(game.roomCode).emit("cupDrawStart", drawPayload);

    if (!humanInCup) {
      // No human in cup — transition straight to kickoff and auto-start
      transitionToKickoff(game);
    } else {
      // Wait 30s for all coaches to acknowledge the draw, then auto-proceed
      armPhaseTimer(game, 30000, () => {
        if (game.gamePhase === "cup_draw") {
          console.log(`[${game.roomCode}] Cup draw ack timeout — auto-proceeding`);
          transitionToKickoff(game);
        }
      });
    }
  }

  // ─── DRAW → KICKOFF TRANSITION ───────────────────────────────────────────────

  function transitionToKickoff(game: ActiveGame) {
    clearPhaseTimer(game);
    game.gamePhase = "cup_awaiting_kickoff";
    game.phaseToken = makePhaseToken(game);
    game.phaseAcks = new Set();

    // Reset ready flags
    Object.values(game.playersByName).forEach((p) => { p.ready = false; });

    const entry = game.currentEvent as any;
    const cupPreMatchPayload = {
      round: entry?.round,
      roundName: entry?.roundName,
      season: game.season,
      cupTeamIds: game.cupTeamIds,
    };

    io.to(game.roomCode).emit("cupPreMatch", cupPreMatchPayload);
    io.to(game.roomCode).emit("playerListUpdate", getPlayerList(game));
    saveGameState(game);

    // Check if humans are in the cup; if not, start immediately
    const humanInCup = (Object.values(game.playersByName) as PlayerSession[])
      .some((p) => p.socketId && game.cupTeamIds.includes(p.teamId));

    if (!humanInCup) {
      // Auto-start: all NPC cup → immediately trigger match
      checkAllReady(game).catch((err) =>
        console.error(`[${game.roomCode}] Cup auto-kickoff error:`, err),
      );
    } else {
      // Wait 60s for cup coaches to click Ready, then auto-start
      armPhaseTimer(game, 60000, () => {
        if (game.gamePhase === "cup_awaiting_kickoff") {
          console.log(`[${game.roomCode}] Cup kickoff timeout — auto-starting`);
          // Mark all disconnected cup coaches as ready so the game can proceed
          Object.values(game.playersByName).forEach((p) => {
            if (game.cupTeamIds.includes(p.teamId)) p.ready = true;
          });
          checkAllReady(game).catch((err) =>
            console.error(`[${game.roomCode}] Cup auto-kickoff (timeout) error:`, err),
          );
        }
      });
    }
  }

  // ─── CUP ROUND FINALIZATION (ET + PENALTIES) ────────────────────────────────
  // Called by weeklyFlowHelpers after cup second half completes.

  async function finalizeCupRound(game: ActiveGame) {
    const entry = game.currentEvent as any;
    const round = entry?.round;
    const season = game.season;
    const fixtures = game.currentFixtures;
    const roundName = CUP_ROUND_NAMES[round] || `Ronda ${round}`;
    const results: any[] = [];
    let hasAnyET = false;

    for (const fixture of fixtures) {
      const t1 = fixture._t1 || { formation: "4-4-2", style: "Balanced" };
      const t2 = fixture._t2 || { formation: "4-4-2", style: "Balanced" };
      const ctx = { game, io, matchweek: game.matchweek };

      let winnerId;
      if (fixture.finalHomeGoals !== fixture.finalAwayGoals) {
        winnerId = fixture.finalHomeGoals > fixture.finalAwayGoals
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
        game.gamePhase = "match_extra_time";
        await simulateExtraTime(game.db, fixture, t1, t2, ctx);

        if (fixture.finalHomeGoals !== fixture.finalAwayGoals) {
          winnerId = fixture.finalHomeGoals > fixture.finalAwayGoals
            ? fixture.homeTeamId
            : fixture.awayTeamId;
        } else {
          const homeSquad = await getTeamSquad(game.db, fixture.homeTeamId, t1, game.matchweek);
          const awaySquad = await getTeamSquad(game.db, fixture.awayTeamId, t2, game.matchweek);
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

          winnerId = shootout.homeGoals > shootout.awayGoals
            ? fixture.homeTeamId
            : fixture.awayTeamId;

          await new Promise((resolve) => {
            game.db.run(
              "UPDATE cup_matches SET home_penalties = ?, away_penalties = ?, played = 1, winner_team_id = ? WHERE season = ? AND round = ? AND home_team_id = ? AND away_team_id = ?",
              [shootout.homeGoals, shootout.awayGoals, winnerId, season, round, fixture.homeTeamId, fixture.awayTeamId],
              resolve,
            );
          });
        }

        await new Promise((resolve) => {
          game.db.run(
            "UPDATE cup_matches SET home_et_score = ?, away_et_score = ? WHERE season = ? AND round = ? AND home_team_id = ? AND away_team_id = ?",
            [fixture.finalHomeGoals, fixture.finalAwayGoals, season, round, fixture.homeTeamId, fixture.awayTeamId],
            resolve,
          );
        });
      }

      if (!winnerId) winnerId = fixture.homeTeamId;

      await new Promise((resolve) => {
        game.db.run(
          "UPDATE cup_matches SET home_score = ?, away_score = ?, played = 1, winner_team_id = ? WHERE season = ? AND round = ? AND home_team_id = ? AND away_team_id = ?",
          [fixture.finalHomeGoals, fixture.finalAwayGoals, winnerId, season, round, fixture.homeTeamId, fixture.awayTeamId],
          resolve,
        );
      });

      results.push({
        homeTeamId: fixture.homeTeamId,
        awayTeamId: fixture.awayTeamId,
        homeTeam: fixture.homeTeam || null,
        awayTeam: fixture.awayTeam || null,
        homeGoals: fixture.finalHomeGoals,
        awayGoals: fixture.finalAwayGoals,
        winnerId,
        wentToET: !!fixture._decidedByPenalties || fixture.events.some((e: any) => e.minute > 90),
        decidedByPenalties: !!fixture._decidedByPenalties,
        penaltyHomeGoals: fixture._penaltyHomeGoals ?? null,
        penaltyAwayGoals: fixture._penaltyAwayGoals ?? null,
        events: fixture.events,
      });

      if (round === 5) {
        const winnerTeam = await runGet(game.db, "SELECT name FROM teams WHERE id = ?", [winnerId]);
        await new Promise((resolve) => {
          game.db.run(
            "INSERT INTO palmares (team_id, season, achievement) VALUES (?, ?, ?)",
            [winnerId, game.year, "Vencedor da Taça de Portugal"],
            resolve,
          );
        });
        await new Promise((resolve) => {
          game.db.run("UPDATE teams SET budget = budget + 500000 WHERE id = ?", [winnerId], resolve);
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

    // ET animation gate: wait for all connected coaches to ack before advancing
    if (hasAnyET) {
      const humanInCup = (Object.values(game.playersByName) as PlayerSession[])
        .some((p) => p.socketId && game.cupTeamIds.includes(p.teamId));
      if (humanInCup) {
        await cupETAnimGate(game, 45000);
      }
    }

    // Emit results
    io.to(game.roomCode).emit("cupRoundResults", {
      round,
      roundName,
      results,
      season,
      isFinal: round === 5,
    });

    // Advance calendar
    game.calendarIndex += 1;
    game.currentEvent = SEASON_CALENDAR[game.calendarIndex] ?? null;
    game.currentFixtures = [];
    game.cupDrawPayload = null;
    game.cupHalftimePayload = null;
    game.cupSecondHalfPayload = null;
    game.lastHalftimePayload = null;
    game.gamePhase = "lobby";
    Object.values(game.playersByName).forEach((p) => { p.ready = false; });
    saveGameState(game);

    // Season end if past calendar
    if (game.calendarIndex >= SEASON_CALENDAR.length) {
      try {
        await applySeasonEnd(game);
      } catch (seErr) {
        console.error(`[${game.roomCode}] Season end error (from cup):`, seErr);
      }
    } else {
      io.to(game.roomCode).emit("playerListUpdate", getPlayerList(game));
    }
  }

  // ─── ET ANIMATION GATE ───────────────────────────────────────────────────────

  function cupETAnimGate(game: ActiveGame, timeoutMs = 45000): Promise<void> {
    return new Promise<void>((resolve) => {
      const acks = new Set<string>();
      const timeout = setTimeout(() => {
        delete game._cupETAnimHandler;
        resolve();
      }, timeoutMs);

      game._cupETAnimHandler = (socketId: string) => {
        acks.add(socketId);
        const connected = (Object.values(game.playersByName) as PlayerSession[]).filter(
          (p) => p.socketId,
        );
        if (
          connected.length > 0 &&
          connected.every((p) => acks.has(p.socketId as string))
        ) {
          clearTimeout(timeout);
          delete game._cupETAnimHandler;
          resolve();
        }
      };
    });
  }

  // ─── PHASE TIMER HELPERS ─────────────────────────────────────────────────────

  function armPhaseTimer(game: ActiveGame, ms: number, onElapsed: () => void) {
    clearPhaseTimer(game);
    const token = game.phaseToken;
    game.phaseTimer = setTimeout(() => {
      // Stale check: only fire if token hasn't changed
      if (game.phaseToken !== token) return;
      onElapsed();
    }, ms);
  }

  // ─── RECONNECT HELPERS ───────────────────────────────────────────────────────

  /**
   * Emit the current phase state to a reconnecting socket.
   * Replaces the old emitCurrentCupPhaseToSocket.
   */
  function emitCurrentPhaseToSocket(game: ActiveGame, socket: any) {
    switch (game.gamePhase) {
      case "cup_draw":
        if (game.cupDrawPayload) socket.emit("cupDrawStart", game.cupDrawPayload);
        break;

      case "cup_awaiting_kickoff": {
        const entry = game.currentEvent as any;
        socket.emit("cupPreMatch", {
          round: entry?.round,
          roundName: entry?.roundName,
          season: game.season,
          cupTeamIds: game.cupTeamIds,
        });
        break;
      }

      case "match_halftime":
        if (game.currentEvent?.type === "cup" && game.cupHalftimePayload) {
          socket.emit("cupHalfTimeResults", game.cupHalftimePayload);
        } else if (game.lastHalftimePayload) {
          socket.emit("halfTimeResults", game.lastHalftimePayload);
        }
        break;

      case "match_second_half":
      case "match_extra_time":
        if (game.currentEvent?.type === "cup" && game.cupSecondHalfPayload) {
          socket.emit("cupSecondHalfStart", game.cupSecondHalfPayload);
        }
        break;
    }
  }

  /**
   * Re-arm phase timers for a reconnecting player.
   * Replaces the old ensureCupPhaseTimeout.
   */
  function ensurePhaseTimeout(game: ActiveGame) {
    if (game.phaseTimer) return; // Already running

    const token = game.phaseToken;
    if (!token) return;

    if (game.gamePhase === "cup_draw") {
      armPhaseTimer(game, 30000, () => {
        if (game.gamePhase === "cup_draw" && game.phaseToken === token) {
          console.log(`[${game.roomCode}] Cup draw ack timeout (reconnect re-arm)`);
          transitionToKickoff(game);
        }
      });
    }

    if (game.gamePhase === "cup_awaiting_kickoff") {
      armPhaseTimer(game, 60000, () => {
        if (game.gamePhase === "cup_awaiting_kickoff" && game.phaseToken === token) {
          console.log(`[${game.roomCode}] Cup kickoff timeout (reconnect re-arm)`);
          Object.values(game.playersByName).forEach((p) => {
            if (game.cupTeamIds.includes(p.teamId)) p.ready = true;
          });
          checkAllReady(game).catch(() => {});
        }
      });
    }
  }

  return {
    applySeasonEnd,
    startCupRound,
    finalizeCupRound,
    transitionToKickoff,
    emitCurrentPhaseToSocket,
    ensurePhaseTimeout,
    armPhaseTimer,
  };
}
