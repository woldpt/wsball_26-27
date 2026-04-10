import type { ActiveGame, PlayerSession } from "./types";
import type { CalendarEntry } from "./gameConstants";
import { SEASON_CALENDAR } from "./gameConstants";
import { getAllTeamForms } from "./coreHelpers";
import { finalizeAllRunningAuctions, clearPhaseTimer, makePhaseToken } from "./matchFlowHelpers";

interface WeeklyFlowDeps {
  io: any;
  getPlayerList: (game: ActiveGame) => PlayerSession[];
  generateFixturesForDivision: (
    db: any,
    division: number,
    matchweek: number,
  ) => Promise<any[]>;
  finalizeAuction: (game: ActiveGame, playerId: number) => void;
  simulateMatchSegment: (...args: any[]) => Promise<void>;
  calculateMatchAttendance: (db: any, homeTeamId: number) => Promise<number>;
  pickRefereeSummary: (
    roomCode: string,
    teamId: number,
    opponentId: number,
    matchweek: number,
  ) => { name: string; balance: number; favorsTeamA: boolean };
  saveGameState: (game: ActiveGame) => void;
  persistMatchResults: (
    game: ActiveGame,
    fixtures: any[],
    matchweek: number,
    onDone?: () => void,
  ) => void;
  applyPostMatchQualityEvolution: (
    db: any,
    fixtures: any[],
    currentMatchweek: number,
  ) => Promise<void>;
  startCupRound: (game: ActiveGame, round: number) => Promise<void>;
  finalizeCupRound: (game: ActiveGame) => Promise<void>;
  applySeasonEnd: (game: ActiveGame) => Promise<void>;
  listPlayerOnMarket: (
    game: ActiveGame,
    playerId: number,
    mode: string,
    price: number,
    callback?: (...args: any[]) => void,
  ) => void;
  processContractExpiries: (game: ActiveGame) => Promise<void>;
  processNpcTransferActivity: (game: ActiveGame) => Promise<void>;
  refreshMarket: (game: ActiveGame, emitToRoom?: boolean) => void;
}

export function createWeeklyFlowHelpers(deps: WeeklyFlowDeps) {
  const {
    io,
    getPlayerList,
    generateFixturesForDivision,
    finalizeAuction,
    simulateMatchSegment,
    calculateMatchAttendance,
    pickRefereeSummary,
    saveGameState,
    persistMatchResults,
    applyPostMatchQualityEvolution,
    startCupRound,
    finalizeCupRound,
    applySeasonEnd,
    listPlayerOnMarket,
    processContractExpiries,
    processNpcTransferActivity,
    refreshMarket,
  } = deps;

  // Guard against concurrent match segment execution
  const segmentRunning: Record<string, boolean> = {};

  // ─── UNIFIED MATCH SEGMENT RUNNER ───────────────────────────────────────────
  // Handles both league and cup first/second halves.
  // Uses game.currentFixtures populated by the caller.

  async function runMatchSegment(
    game: ActiveGame,
    startMin: number,
    endMin: number,
  ): Promise<void> {
    const entry = game.currentEvent as CalendarEntry | null;

    // Calculate attendance only for league first halves
    if (startMin === 1 && entry?.type === "league") {
      for (const fixture of game.currentFixtures) {
        fixture.attendance = await calculateMatchAttendance(game.db, fixture.homeTeamId);
      }
    }

    // Simulate all fixtures
    for (const fixture of game.currentFixtures) {
      // Use stored tactics from fixture (set during draw/fixture generation) or look up live player tactic
      const p1 = Object.values(game.playersByName).find((p) => p.teamId === fixture.homeTeamId);
      const p2 = Object.values(game.playersByName).find((p) => p.teamId === fixture.awayTeamId);
      const t1 = p1 ? p1.tactic : (fixture._t1 || { formation: "4-4-2", style: "Balanced" });
      const t2 = p2 ? p2.tactic : (fixture._t2 || { formation: "4-4-2", style: "Balanced" });
      // Also keep _t1/_t2 updated for second half (in case player changed tactic at halftime)
      if (p1) fixture._t1 = t1;
      if (p2) fixture._t2 = t2;
      await simulateMatchSegment(game.db, fixture, t1, t2, startMin, endMin, {
        game,
        io,
        matchweek: game.matchweek,
      });
    }

    if (endMin === 45) {
      // ── Halftime ─────────────────────────────────────────────────────────
      game.gamePhase = "match_halftime";

      if (entry?.type === "cup") {
        const halftimePayload = {
          round: (entry as any).round,
          roundName: (entry as any).roundName,
          season: game.season,
          fixtures: game.currentFixtures.map((fixture) => ({
            homeTeam: fixture.homeTeam || null,
            awayTeam: fixture.awayTeam || null,
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
          })),
        };
        game.cupHalftimePayload = halftimePayload;
        game.lastHalftimePayload = halftimePayload;
        io.to(game.roomCode).emit("cupHalfTimeResults", halftimePayload);
      } else {
        const halfTimeFixtures = game.currentFixtures.map((fixture) => ({
          ...fixture,
          referee: pickRefereeSummary(
            game.roomCode,
            fixture.homeTeamId,
            fixture.awayTeamId,
            game.matchweek,
          ),
        }));
        const halftimePayload = { matchweek: game.matchweek, results: halfTimeFixtures };
        game.lastHalftimePayload = halftimePayload;
        io.to(game.roomCode).emit("halfTimeResults", halftimePayload);
      }

      Object.values(game.playersByName).forEach((p) => { p.ready = false; });
      io.to(game.roomCode).emit("playerListUpdate", getPlayerList(game));
      saveGameState(game);
      return;
    }

    // ── Full time ────────────────────────────────────────────────────────────
    game.gamePhase = "match_finalizing";
    saveGameState(game);

    if (entry?.type === "cup") {
      await finalizeCupRound(game);
    } else {
      await finalizeLeagueEvent(game);
    }
  }

  // ─── LEAGUE EVENT FINALIZATION ───────────────────────────────────────────────

  async function finalizeLeagueEvent(game: ActiveGame): Promise<void> {
    const fixtures = game.currentFixtures;
    const entry = game.currentEvent as CalendarEntry | null;
    const completedMatchweek = game.matchweek;

    return new Promise<void>((resolveOuter) => {
      game.db.serialize(() => {
        game.db.run("BEGIN TRANSACTION");

        for (const match of fixtures) {
          const hG = match.finalHomeGoals;
          const aG = match.finalAwayGoals;
          let hPts = 0, aPts = 0, hW = 0, hD = 0, hL = 0, aW = 0, aD = 0, aL = 0;
          if (hG > aG) { hPts = 3; hW = 1; aL = 1; }
          else if (hG < aG) { aPts = 3; aW = 1; hL = 1; }
          else { hPts = 1; aPts = 1; hD = 1; aD = 1; }

          game.db.run(
            `UPDATE teams SET points=points+?, wins=wins+?, draws=draws+?, losses=losses+?, goals_for=goals_for+?, goals_against=goals_against+? WHERE id=?`,
            [hPts, hW, hD, hL, hG, aG, match.homeTeamId],
          );
          game.db.run(
            `UPDATE teams SET points=points+?, wins=wins+?, draws=draws+?, losses=losses+?, goals_for=goals_for+?, goals_against=goals_against+? WHERE id=?`,
            [aPts, aW, aD, aL, aG, hG, match.awayTeamId],
          );
        }

        game.db.run("COMMIT", (err: any) => {
          if (err) {
            console.error(`[${game.roomCode}] Standings update error:`, err);
            game.db.run("ROLLBACK");
            game.gamePhase = "lobby";
            resolveOuter();
            return;
          }

          // Attendance revenue
          for (const match of fixtures) {
            const revenue = (match.attendance || 0) * 15;
            if (revenue > 0) {
              game.db.run("UPDATE teams SET budget = budget + ? WHERE id = ?", [
                revenue,
                match.homeTeamId,
              ]);
            }
          }

          // Emit match results
          const fullTimeFixtures = fixtures.map((fixture) => ({
            ...fixture,
            referee: pickRefereeSummary(
              game.roomCode,
              fixture.homeTeamId,
              fixture.awayTeamId,
              completedMatchweek,
            ),
          }));
          io.to(game.roomCode).emit("matchResults", {
            matchweek: completedMatchweek,
            results: fullTimeFixtures,
          });

          Object.values(game.playersByName).forEach((p) => { p.ready = false; });

          // Advance state
          game.calendarIndex += 1;
          game.matchweek += 1;
          game.currentEvent = SEASON_CALENDAR[game.calendarIndex] ?? null;
          game.currentFixtures = [];
          game.gamePhase = "lobby";
          game.lastHalftimePayload = null;
          saveGameState(game);

          // Check season end: calendarIndex past end of calendar
          const seasonDone = game.calendarIndex >= SEASON_CALENDAR.length;

          persistMatchResults(game, fixtures, completedMatchweek, () => {
            applyPostMatchQualityEvolution(game.db, fixtures, game.matchweek)
              .then(async () => {
                if (seasonDone) {
                  try {
                    await applySeasonEnd(game);
                  } catch (seErr) {
                    console.error(`[${game.roomCode}] Season end error:`, seErr);
                  }
                  resolveOuter();
                  return;
                }

                // Drain pending auction queue
                if (game.pendingAuctionQueue && game.pendingAuctionQueue.length > 0) {
                  const queue = game.pendingAuctionQueue.splice(0) as any[];
                  let qDelay = 500;
                  for (const qEntry of queue) {
                    setTimeout(() => {
                      listPlayerOnMarket(game, qEntry.playerId, qEntry.mode, qEntry.price, qEntry.callback);
                    }, qDelay);
                    qDelay += 18000;
                  }
                }

                try { await processContractExpiries(game); } catch (_) {}
                try { await processNpcTransferActivity(game); } catch (_) {}
                refreshMarket(game);

                // Broadcast updated standings and squad info
                game.db.all("SELECT * FROM teams", (err2: any, teams: any[]) => {
                  if (!err2) io.to(game.roomCode).emit("teamsData", teams);
                  getAllTeamForms(game.db).then((forms) => {
                    io.to(game.roomCode).emit("teamForms", forms);
                  }).catch(() => {});

                  game.db.all(
                    "SELECT p.id, p.name, p.position, p.goals, p.team_id, t.name as team_name, t.color_primary, t.color_secondary FROM players p LEFT JOIN teams t ON p.team_id = t.id WHERE p.goals > 0 ORDER BY p.goals DESC, p.skill DESC LIMIT 20",
                    (err3: any, scorers: any[]) => {
                      io.to(game.roomCode).emit("topScorers", scorers || []);

                      const connectedPlayers = getPlayerList(game);
                      connectedPlayers.forEach((player) => {
                        if (!player.socketId) return;
                        game.db.all(
                          "SELECT * FROM players WHERE team_id = ?",
                          [player.teamId],
                          (err4: any, squad: any[]) => {
                            if (!err4) io.to(player.socketId as string).emit("mySquad", squad || []);
                          },
                        );
                      });

                      io.to(game.roomCode).emit("playerListUpdate", getPlayerList(game));
                      resolveOuter();
                    },
                  );
                });
              })
              .catch((error: any) => {
                console.error(`[${game.roomCode}] Post-match evolution error:`, error);
                resolveOuter();
              });
          });
        });
      });
    });
  }

  // ─── MAIN DISPATCH: checkAllReady ────────────────────────────────────────────
  // Called every time a player's ready status changes.
  // Dispatches based on gamePhase — the single source of truth.

  async function checkAllReady(game: ActiveGame) {
    // ── Cup awaiting kickoff: only cup coaches need to be ready ──────────────
    if (game.gamePhase === "cup_awaiting_kickoff") {
      const cupCoaches = Object.values(game.playersByName).filter(
        (p) => p.socketId && game.cupTeamIds.includes(p.teamId),
      );
      // If human coaches are in the cup, all must be ready
      if (cupCoaches.length > 0 && !cupCoaches.every((p) => p.ready)) return;

      if (segmentRunning[game.roomCode]) return;
      segmentRunning[game.roomCode] = true;
      clearPhaseTimer(game);

      game.gamePhase = "match_first_half";
      game.phaseToken = makePhaseToken(game);
      saveGameState(game);

      try {
        await runMatchSegment(game, 1, 45);
      } finally {
        segmentRunning[game.roomCode] = false;
      }
      return;
    }

    // ── All other phases: standard readiness check ───────────────────────────
    if (game.lockedCoaches.size >= 2) {
      const allReady = [...game.lockedCoaches].every(
        (name) => game.playersByName[name]?.socketId && game.playersByName[name]?.ready,
      );
      if (!allReady) return;
    } else {
      const connectedPlayers = getPlayerList(game);
      if (connectedPlayers.length === 0) return;
      if (!connectedPlayers.every((player) => player.ready)) return;
    }

    console.log(
      `[${game.roomCode}] All ready — calendarIndex=${game.calendarIndex} gamePhase=${game.gamePhase}`,
    );

    if (game.gamePhase === "lobby") {
      if (segmentRunning[game.roomCode]) return;

      const entry = SEASON_CALENDAR[game.calendarIndex];
      if (!entry) {
        // Past end of calendar — season end should have fired already
        console.warn(`[${game.roomCode}] checkAllReady: calendarIndex ${game.calendarIndex} out of range`);
        return;
      }

      finalizeAllRunningAuctions(game, finalizeAuction);

      if (entry.type === "cup") {
        // Cup events: start the draw phase (not a direct match)
        // startCupRound sets gamePhase = "cup_draw" internally
        await startCupRound(game, (entry as any).round);
        return;
      }

      // League event
      segmentRunning[game.roomCode] = true;
      game.gamePhase = "match_first_half";
      game.currentEvent = entry;
      game.phaseToken = makePhaseToken(game);

      // Deduct weekly wages + loan interest
      game.db.run(
        `UPDATE teams SET budget = budget
          - CAST((loan_amount * 0.025) AS INTEGER)
          - (SELECT COALESCE(SUM(wage), 0) FROM players WHERE players.team_id = teams.id)`,
        async (err: any) => {
          if (err) {
            console.error(`[${game.roomCode}] Weekly expense error:`, err);
            game.gamePhase = "lobby";
            game.currentEvent = entry;
            segmentRunning[game.roomCode] = false;
            return;
          }

          const mw = (entry as any).matchweek;
          const [f1, f2, f3, f4] = await Promise.all([
            generateFixturesForDivision(game.db, 1, mw),
            generateFixturesForDivision(game.db, 2, mw),
            generateFixturesForDivision(game.db, 3, mw),
            generateFixturesForDivision(game.db, 4, mw),
          ]);
          game.currentFixtures = [...f1, ...f2, ...f3, ...f4];
          saveGameState(game);

          try {
            await runMatchSegment(game, 1, 45);
          } finally {
            segmentRunning[game.roomCode] = false;
          }
        },
      );
      return;
    }

    if (game.gamePhase === "match_halftime") {
      if (segmentRunning[game.roomCode]) return;
      segmentRunning[game.roomCode] = true;

      finalizeAllRunningAuctions(game, finalizeAuction);
      game.gamePhase = "match_second_half";
      game.phaseToken = makePhaseToken(game);
      saveGameState(game);

      try {
        await runMatchSegment(game, 46, 90);
      } finally {
        segmentRunning[game.roomCode] = false;
      }
    }
  }

  return {
    checkAllReady,
    runMatchSegment,
  };
}
