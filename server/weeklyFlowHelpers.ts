import type { ActiveGame, PlayerSession } from "./types";
import { getAllTeamForms } from "./coreHelpers";

interface WeeklyFlowDeps {
  io: any;
  getPlayerList: (game: ActiveGame) => PlayerSession[];
  generateFixturesForDivision: (
    db: any,
    division: number,
    matchweek: number,
  ) => Promise<any[]>;
  finalizeAllRunningAuctions: (
    game: ActiveGame,
    finalizeAuction: (game: ActiveGame, playerId: number) => void,
  ) => void;
  finalizeAuction: (game: ActiveGame, playerId: number) => void;
  cancelPendingCupDraw: (game: ActiveGame) => void;
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
  CUP_ROUND_AFTER_MATCHWEEK: Record<number, number>;
  startCupRound: (game: ActiveGame, round: number) => Promise<void>;
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
    finalizeAllRunningAuctions,
    finalizeAuction,
    cancelPendingCupDraw,
    simulateMatchSegment,
    calculateMatchAttendance,
    pickRefereeSummary,
    saveGameState,
    persistMatchResults,
    applyPostMatchQualityEvolution,
    CUP_ROUND_AFTER_MATCHWEEK,
    startCupRound,
    applySeasonEnd,
    listPlayerOnMarket,
    processContractExpiries,
    processNpcTransferActivity,
    refreshMarket,
  } = deps;

  const weeklyLoopRunning: Record<string, boolean> = {};

  async function processSegment(
    game: ActiveGame,
    startMin: number,
    endMin: number,
    nextState: string,
  ) {
    if (startMin === 1) {
      for (const fixture of game.fixtures) {
        fixture.attendance = await calculateMatchAttendance(
          game.db,
          fixture.homeTeamId,
        );
      }
    }

    for (const fixture of game.fixtures) {
      const p1 = Object.values(game.playersByName).find(
        (player) => player.teamId === fixture.homeTeamId,
      );
      const p2 = Object.values(game.playersByName).find(
        (player) => player.teamId === fixture.awayTeamId,
      );
      const t1 = p1 ? p1.tactic : { formation: "4-4-2", style: "Balanced" };
      const t2 = p2 ? p2.tactic : { formation: "4-4-2", style: "Balanced" };
      await simulateMatchSegment(game.db, fixture, t1, t2, startMin, endMin, {
        game,
        io,
        matchweek: game.matchweek,
      });
    }

    if (nextState === "halftime") {
      game.matchState = nextState;
      const connectedPlayers = getPlayerList(game);
      const halfTimeFixtures = game.fixtures.map((fixture) => ({
        ...fixture,
        referee: pickRefereeSummary(
          game.roomCode,
          fixture.homeTeamId,
          fixture.awayTeamId,
          game.matchweek,
        ),
      }));
      io.to(game.roomCode).emit("halfTimeResults", {
        matchweek: game.matchweek,
        results: halfTimeFixtures,
      });
      game.lastHalfTimePayload = {
        matchweek: game.matchweek,
        results: halfTimeFixtures,
      };
      connectedPlayers.forEach((player) => {
        player.ready = false;
      });
      io.to(game.roomCode).emit("playerListUpdate", getPlayerList(game));
      saveGameState(game);
      return;
    }

    const connectedPlayers = getPlayerList(game);

    game.db.serialize(() => {
      game.db.run("BEGIN TRANSACTION");

      for (const match of game.fixtures) {
        const hG = match.finalHomeGoals;
        const aG = match.finalAwayGoals;
        let hPts = 0,
          aPts = 0,
          hW = 0,
          hD = 0,
          hL = 0,
          aW = 0,
          aD = 0,
          aL = 0;
        if (hG > aG) {
          hPts = 3;
          hW = 1;
          aL = 1;
        } else if (hG < aG) {
          aPts = 3;
          aW = 1;
          hL = 1;
        } else {
          hPts = 1;
          aPts = 1;
          hD = 1;
          aD = 1;
        }

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
          game.matchState = "idle";
          return;
        }

        for (const match of game.fixtures) {
          const revenue = (match.attendance || 0) * 10;
          if (revenue > 0) {
            game.db.run("UPDATE teams SET budget = budget + ? WHERE id = ?", [
              revenue,
              match.homeTeamId,
            ]);
          }
        }

        game.matchState = nextState;
        const completedMatchweek = game.matchweek;

        const fullTimeFixtures = game.fixtures.map((fixture) => ({
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

        connectedPlayers.forEach((player) => {
          player.ready = false;
        });
        game.matchweek++;
        saveGameState(game);

        persistMatchResults(game, game.fixtures, completedMatchweek, () => {
          applyPostMatchQualityEvolution(game.db, game.fixtures, game.matchweek)
            .then(async () => {
              const normMw = ((completedMatchweek - 1) % 14) + 1;
              const cupRound = CUP_ROUND_AFTER_MATCHWEEK[normMw];
              if (cupRound) {
                game.pendingCupRound = cupRound;
                game.leagueAnimAcks = new Set();
                if (game._leagueAnimTimeout)
                  clearTimeout(game._leagueAnimTimeout);
                game._leagueAnimTimeout = setTimeout(async () => {
                  if (game.pendingCupRound != null) {
                    const round = game.pendingCupRound;
                    game.pendingCupRound = null;
                    game.leagueAnimAcks = new Set();
                    try {
                      await startCupRound(game, round);
                    } catch (cupErr) {
                      console.error(
                        `[${game.roomCode}] Cup round error (timeout fallback):`,
                        cupErr,
                      );
                    }
                  }
                }, 90000);
              }

              if (normMw === 14 && !cupRound) {
                try {
                  await applySeasonEnd(game);
                } catch (seErr) {
                  console.error(`[${game.roomCode}] Season end error:`, seErr);
                }
              }

              if (
                game.pendingAuctionQueue &&
                game.pendingAuctionQueue.length > 0
              ) {
                const queue = game.pendingAuctionQueue.splice(0) as any[];
                let qDelay = 500;
                for (const entry of queue) {
                  setTimeout(() => {
                    listPlayerOnMarket(
                      game,
                      entry.playerId,
                      entry.mode,
                      entry.price,
                      entry.callback,
                    );
                  }, qDelay);
                  qDelay += 18000;
                }
              }

              try {
                await processContractExpiries(game);
              } catch (ceErr) {
                console.error(
                  `[${game.roomCode}] Contract expiry error:`,
                  ceErr,
                );
              }
              try {
                await processNpcTransferActivity(game);
              } catch (ntErr) {
                console.error(`[${game.roomCode}] NPC transfer error:`, ntErr);
              }

              refreshMarket(game);

              game.db.all("SELECT * FROM teams", (err2: any, teams: any[]) => {
                if (!err2) io.to(game.roomCode).emit("teamsData", teams);
                getAllTeamForms(game.db).then((forms) => {
                  io.to(game.roomCode).emit("teamForms", forms);
                }).catch(() => {});

                game.db.all(
                  "SELECT p.id, p.name, p.position, p.goals, p.team_id, t.name as team_name, t.color_primary, t.color_secondary FROM players p LEFT JOIN teams t ON p.team_id = t.id WHERE p.goals > 0 ORDER BY p.goals DESC, p.skill DESC LIMIT 20",
                  (err3: any, scorers: any[]) => {
                    io.to(game.roomCode).emit("topScorers", scorers || []);

                    connectedPlayers.forEach((player) => {
                      if (!player.socketId) return;
                      game.db.all(
                        "SELECT * FROM players WHERE team_id = ?",
                        [player.teamId],
                        (err4: any, squad: any[]) => {
                          if (!err4) {
                            io.to(player.socketId as string).emit(
                              "mySquad",
                              squad || [],
                            );
                          }
                        },
                      );
                    });

                    io.to(game.roomCode).emit(
                      "playerListUpdate",
                      getPlayerList(game),
                    );
                  },
                );
              });
            })
            .catch((error: any) => {
              console.error(
                `[${game.roomCode}] Post-match evolution error:`,
                error,
              );
            });
        });
      });
    });
  }

  async function checkAllReady(game: ActiveGame) {
    if (game.lockedCoaches.size >= 2) {
      const allReady = [...game.lockedCoaches].every(
        (name) =>
          game.playersByName[name]?.socketId && game.playersByName[name]?.ready,
      );
      if (!allReady) return;
    } else {
      const connectedPlayers = getPlayerList(game);
      if (connectedPlayers.length === 0) return;
      if (!connectedPlayers.every((player) => player.ready)) return;
    }

    console.log(
      `[${game.roomCode}] All players ready — matchweek=${game.matchweek} matchState=${game.matchState}`,
    );

    if (game.matchState === "idle") {
      if (weeklyLoopRunning[game.roomCode]) return;
      weeklyLoopRunning[game.roomCode] = true;

      finalizeAllRunningAuctions(game, finalizeAuction);
      cancelPendingCupDraw(game);

      game.matchState = "running_first_half";

      game.db.run(
        `
      UPDATE teams 
      SET budget = budget 
        - CAST((loan_amount * 0.05) AS INTEGER) 
        - (SELECT COALESCE(SUM(wage), 0) FROM players WHERE players.team_id = teams.id)
    `,
        async (err: any) => {
          if (err) {
            console.error(`[${game.roomCode}] Weekly Loop Err:`, err);
            game.matchState = "idle";
            weeklyLoopRunning[game.roomCode] = false;
            return;
          }

          const mw = game.matchweek;
          const f1 = await generateFixturesForDivision(game.db, 1, mw);
          const f2 = await generateFixturesForDivision(game.db, 2, mw);
          const f3 = await generateFixturesForDivision(game.db, 3, mw);
          const f4 = await generateFixturesForDivision(game.db, 4, mw);
          game.fixtures = [...f1, ...f2, ...f3, ...f4];

          await processSegment(game, 1, 45, "halftime");
          weeklyLoopRunning[game.roomCode] = false;
        },
      );
      return;
    }

    if (game.matchState === "halftime") {
      finalizeAllRunningAuctions(game, finalizeAuction);
      cancelPendingCupDraw(game);
      game.matchState = "playing_second_half";
      await processSegment(game, 46, 90, "idle");
      if (game.deferredCupRound != null) {
        const round = game.deferredCupRound;
        game.deferredCupRound = null;
        startCupRound(game, round).catch((err) =>
          console.error(`[${game.roomCode}] Deferred cup draw error:`, err),
        );
      }
    }
  }

  return {
    checkAllReady,
  };
}
