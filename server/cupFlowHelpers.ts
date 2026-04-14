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

    // Sponsor revenue by division
    const sponsorByDiv: Record<number, number> = { 1: 2000000, 2: 1500000, 3: 1000000, 4: 500000, 5: 0 };
    for (const team of allTeams) {
      const sponsorAmount = sponsorByDiv[team.division] || 0;
      if (sponsorAmount > 0) {
        await new Promise((resolve) => {
          game.db.run("UPDATE teams SET budget = budget + ? WHERE id = ?", [sponsorAmount, team.id], resolve);
        });
      }
    }
    io.to(game.roomCode).emit("systemMessage", "📺 Receitas de patrocinadores distribuídas.");

    // Best scorer prize
    const topScorer = await runGet(
      game.db,
      `SELECT p.id, p.name, p.team_id, p.goals, t.name as team_name
       FROM players p
       LEFT JOIN teams t ON p.team_id = t.id
       WHERE p.goals > 0
       ORDER BY p.goals DESC, p.skill DESC
       LIMIT 1`,
    );
    if (topScorer && topScorer.team_id) {
      await new Promise((resolve) => {
        game.db.run("UPDATE teams SET budget = budget + 500000 WHERE id = ?", [topScorer.team_id], resolve);
      });
      io.to(game.roomCode).emit(
        "systemMessage",
        `⚽ ${topScorer.name} (${topScorer.team_name}) é o Melhor Marcador com ${topScorer.goals} golos! (+500.000€ para ${topScorer.team_name})`,
      );
    }

    const promotions: Array<{ teamId: number; toDiv: number }> = [];
    for (const [upperDiv, lowerDiv] of [[1, 2], [2, 3], [3, 4], [4, 5]]) {
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
    game.cupHalftimePayload = null;
    game.lastHalftimePayload = null;
    clearPhaseTimer(game);
    game.phaseAcks = new Set();
    game.phaseToken = "";
    saveGameState(game);

    const updatedTeams = await runAll(game.db, "SELECT * FROM teams");
    io.to(game.roomCode).emit("teamsData", updatedTeams);
    io.to(game.roomCode).emit("topScorers", []); // Reset top scorers for new season
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

    // Fisher-Yates shuffle (skip for finals — neutral ground)
    if (round !== 5) {
      for (let i = teamIds.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [teamIds[i], teamIds[j]] = [teamIds[j], teamIds[i]];
      }
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

  // ─── PREPARE CUP ROUND ──────────────────────────────────────────────────────
  // Generates the draw, populates game.currentFixtures, emits cupDrawStart.
  // Does NOT change gamePhase — that is the caller's responsibility.
  // Called when transitioning TO the lobby for a cup week, so coaches can
  // see their opponent and set tactics before clicking Ready.

  async function startCupRound(game: ActiveGame, round: number) {
    const drawFixtures = await generateCupDraw(game, round);

    // Enrich fixtures with team info
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
        // Tactics are NOT pre-assigned here — they are read live from
        // game.playersByName[p].tactic at match start, same as league.
      });
    }

    game.currentFixtures = enrichedFixtures;
    game.currentEvent = SEASON_CALENDAR[game.calendarIndex];
    game.cupHalftimePayload = null;

    // Skip draw animation for the final (round 5) — fixtures are set silently
    if (round === 5) return;

    // Compute humanInCup for the client's draw payload
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

    // Emit draw so clients can show the animation in the lobby
    io.to(game.roomCode).emit("cupDrawStart", drawPayload);
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

    // ─── ET halftime gate: pause before ET so coaches can make substitutions ───
    const drawFixtures = fixtures.filter(
      (f) => f.finalHomeGoals === f.finalAwayGoals,
    );

    if (drawFixtures.length > 0) {
      const humanInAnyDraw = drawFixtures.some((f) =>
        (Object.values(game.playersByName) as PlayerSession[]).some(
          (p) => p.socketId && (p.teamId === f.homeTeamId || p.teamId === f.awayTeamId),
        ),
      );

      if (humanInAnyDraw) {
        game.gamePhase = "match_et_halftime";
        io.to(game.roomCode).emit("cupETHalfTime", {
          round,
          roundName,
          season: game.season,
          fixtures: drawFixtures.map((f) => ({
            homeTeam: f.homeTeam || null,
            awayTeam: f.awayTeam || null,
            homeGoals: f.finalHomeGoals,
            awayGoals: f.finalAwayGoals,
            events: (f.events || []).slice(),
            homeLineup: f.homeLineup || [],
            awayLineup: f.awayLineup || [],
          })),
        });
        Object.values(game.playersByName).forEach((p) => { p.ready = false; });
        io.to(game.roomCode).emit("playerListUpdate", getPlayerList(game));
        saveGameState(game);

        // Wait for all connected coaches to click "Pronto" (5-min fallback timeout)
        await new Promise<void>((resolve) => {
          const timeout = setTimeout(() => {
            delete (game as any)._cupETReadyResolve;
            resolve();
          }, 300_000);
          (game as any)._cupETReadyResolve = () => {
            clearTimeout(timeout);
            delete (game as any)._cupETReadyResolve;
            resolve();
          };
        });
      }
    }

    for (const fixture of fixtures) {
      // Re-read tactics from live player state so ET uses any changes made
      // during the ET halftime interval (tactic changes, style adjustments).
      const p1 = Object.values(game.playersByName).find((p: any) => p.teamId === fixture.homeTeamId);
      const p2 = Object.values(game.playersByName).find((p: any) => p.teamId === fixture.awayTeamId);
      const t1 = (p1 as any)?.tactic || fixture._t1 || { formation: "4-4-2", style: "Balanced" };
      const t2 = (p2 as any)?.tactic || fixture._t2 || { formation: "4-4-2", style: "Balanced" };
      if (p1) fixture._t1 = t1;
      if (p2) fixture._t2 = t2;
      const ctx = { game, io, matchweek: game.matchweek };

      let winnerId;
      if (fixture.finalHomeGoals !== fixture.finalAwayGoals) {
        winnerId = fixture.finalHomeGoals > fixture.finalAwayGoals
          ? fixture.homeTeamId
          : fixture.awayTeamId;
      } else {
        // Only process ET for fixtures involving human players
        const humanInFixture = (Object.values(game.playersByName) as PlayerSession[])
          .some((p) => p.socketId && (p.teamId === fixture.homeTeamId || p.teamId === fixture.awayTeamId));

        if (humanInFixture) {
          hasAnyET = true;
          io.to(game.roomCode).emit("cupExtraTimeStart", {
            homeTeamId: fixture.homeTeamId,
            awayTeamId: fixture.awayTeamId,
            homeGoals: fixture.finalHomeGoals,
            awayGoals: fixture.finalAwayGoals,
          });
        }

        game.gamePhase = "match_extra_time";
        await simulateExtraTime(game.db, fixture, t1, t2, ctx);

        // Notify that ET is over and show final score
        io.to(game.roomCode).emit("extraTimeEnded", {
          homeTeamId: fixture.homeTeamId,
          awayTeamId: fixture.awayTeamId,
          homeGoals: fixture.finalHomeGoals,
          awayGoals: fixture.finalAwayGoals,
        });

        if (fixture.finalHomeGoals !== fixture.finalAwayGoals) {
          winnerId = fixture.finalHomeGoals > fixture.finalAwayGoals
            ? fixture.homeTeamId
            : fixture.awayTeamId;
        } else {
          const homeSquad = await getTeamSquad(game.db, fixture.homeTeamId, t1, game.matchweek);
          const awaySquad = await getTeamSquad(game.db, fixture.awayTeamId, t2, game.matchweek);
          const shootout = simulatePenaltyShootout(homeSquad, awaySquad);

          // Only emit penalty shootout for fixtures involving human players
          const humanInFixture = (Object.values(game.playersByName) as PlayerSession[])
            .some((p) => p.socketId && (p.teamId === fixture.homeTeamId || p.teamId === fixture.awayTeamId));
          if (humanInFixture) {
            io.to(game.roomCode).emit("cupPenaltyShootout", {
              round,
              homeTeamId: fixture.homeTeamId,
              awayTeamId: fixture.awayTeamId,
              ...shootout,
            });
          }

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

      // Cup upset morale boost: winner beat a team from a higher division
      const [homeDiv, awayDiv] = await Promise.all([
        runGet(game.db, "SELECT division FROM teams WHERE id = ?", [fixture.homeTeamId]),
        runGet(game.db, "SELECT division FROM teams WHERE id = ?", [fixture.awayTeamId]),
      ]);
      const winnerIsHome = winnerId === fixture.homeTeamId;
      const winnerDiv = winnerIsHome ? (homeDiv?.division ?? 5) : (awayDiv?.division ?? 5);
      const loserDiv = winnerIsHome ? (awayDiv?.division ?? 5) : (homeDiv?.division ?? 5);
      if (loserDiv < winnerDiv) {
        const divDiff = winnerDiv - loserDiv;
        const extraMorale = Math.min(25, divDiff * 10);
        await new Promise((resolve) => {
          game.db.run("UPDATE teams SET morale = MIN(100, morale + ?) WHERE id = ?", [extraMorale, winnerId], resolve);
        });
      }

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
    game.cupHalftimePayload = null;
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
   * Cup lobby: re-emit the draw so the client can show the matchup.
   */
  function emitCurrentPhaseToSocket(game: ActiveGame, socket: any) {
    // Lobby during a cup week: re-emit draw so reconnecting coach sees matchup
    if (game.gamePhase === "lobby" && game.currentEvent?.type === "cup" && game.currentFixtures.length > 0) {
      const entry = game.currentEvent as any;
      const connectedPlayers = getPlayerList(game);
      const humanTeamIds = new Set(connectedPlayers.map((p) => p.teamId));
      const humanInCup = game.cupTeamIds.some((id) => humanTeamIds.has(id));
      socket.emit("cupDrawStart", {
        round: entry.round,
        roundName: entry.roundName,
        fixtures: game.currentFixtures.map((f: any) => ({ homeTeam: f.homeTeam, awayTeam: f.awayTeam })),
        humanInCup,
        season: game.season,
      });
      return;
    }

    if (game.gamePhase === "match_halftime") {
      if (game.currentEvent?.type === "cup" && game.cupHalftimePayload) {
        socket.emit("cupHalfTimeResults", game.cupHalftimePayload);
      } else if (game.lastHalftimePayload) {
        socket.emit("halfTimeResults", game.lastHalftimePayload);
      }
      return;
    }

    // ET halftime: reconnecting coach sees the draw scoreline and can set tactics
    if (game.gamePhase === "match_et_halftime") {
      const etEntry = game.currentEvent as any;
      const drawFixtures = game.currentFixtures.filter(
        (f: any) => f.finalHomeGoals === f.finalAwayGoals,
      );
      socket.emit("cupETHalfTime", {
        round: etEntry?.round,
        roundName: CUP_ROUND_NAMES[etEntry?.round] || `Ronda ${etEntry?.round}`,
        season: game.season,
        fixtures: drawFixtures.map((f: any) => ({
          homeTeam: f.homeTeam || null,
          awayTeam: f.awayTeam || null,
          homeGoals: f.finalHomeGoals,
          awayGoals: f.finalAwayGoals,
          events: (f.events || []).slice(),
          homeLineup: f.homeLineup || [],
          awayLineup: f.awayLineup || [],
        })),
      });
    }
  }

  /**
   * No phase timers needed for cup lobby — coaches ready up same as league.
   * Kept for API compatibility; no-op unless there's a timer already set.
   */
  function ensurePhaseTimeout(_game: ActiveGame) {
    // Cup now uses the same lobby Ready flow as league — no separate timers.
  }

  return {
    applySeasonEnd,
    startCupRound,
    finalizeCupRound,
    emitCurrentPhaseToSocket,
    ensurePhaseTimeout,
  };
}
