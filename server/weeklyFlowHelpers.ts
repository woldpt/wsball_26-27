import type { ActiveGame, PlayerSession } from "./types";
import type { CalendarEntry } from "./gameConstants";
import { SEASON_CALENDAR } from "./gameConstants";
import { getAllTeamForms } from "./coreHelpers";
import {
  finalizeAllRunningAuctions,
  clearPhaseTimer,
  makePhaseToken,
} from "./matchFlowHelpers";
import { withJuniorGRs } from "./game/engine";
import { applyWeeklyTraining } from "./trainingHelpers";

interface WeeklyFlowDeps {
  io: any;
  getPlayerList: (game: ActiveGame) => PlayerSession[];
  generateFixturesForDivision: (
    db: any,
    division: number,
    matchweek: number,
    userTeamId?: number,
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
  processAgentRenegotiations: (game: ActiveGame) => Promise<void>;
  processNpcTransferActivity: (game: ActiveGame) => Promise<void>;
  refreshMarket: (game: ActiveGame, emitToRoom?: boolean) => void;
  processCoachEvents: (game: ActiveGame) => Promise<void>;
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
    processAgentRenegotiations,
    processNpcTransferActivity,
    refreshMarket,
    processCoachEvents,
  } = deps;

  // Guard against concurrent match segment execution
  const segmentRunning: Record<string, boolean> = {};

  // ─── UNIFIED MATCH SEGMENT RUNNER ───────────────────────────────────────────
  // Handles both league and cup first/second halves.
  // Uses game.currentFixtures populated by the caller.

  const MS_PER_GAME_MINUTE = 1000;

  async function runMatchSegment(
    game: ActiveGame,
    startMin: number,
    endMin: number,
  ): Promise<void> {
    // Prevent re-running the same segment
    const segmentKey = `${startMin}-${endMin}`;
    if (game._lastCompletedSegment === segmentKey) {
      console.warn(
        `[${game.roomCode}] Skipping already-completed segment ${segmentKey}`,
      );
      return;
    }

    console.log(
      `[${game.roomCode}] ▶ runMatchSegment ${startMin}-${endMin} | phase=${game.gamePhase} | fixtures=${game.currentFixtures.length}`,
    );

    const entry = game.currentEvent as CalendarEntry | null;

    // Calculate attendance only for league first halves
    if (startMin === 1 && (entry?.type === "league" || entry?.type === "cup")) {
      for (const fixture of game.currentFixtures) {
        fixture.attendance = await calculateMatchAttendance(
          game.db,
          fixture.homeTeamId,
        );
      }
    }

    // Read tactics for all fixtures once at segment start
    const fixtureTactics: Array<{ t1: any; t2: any }> =
      game.currentFixtures.map((fixture) => {
        const p1 = Object.values(game.playersByName).find(
          (p) => p.teamId === fixture.homeTeamId,
        );
        const p2 = Object.values(game.playersByName).find(
          (p) => p.teamId === fixture.awayTeamId,
        );
        const t1 = p1
          ? p1.tactic
          : fixture._t1 || { formation: "4-4-2", style: "Balanced" };
        const t2 = p2
          ? p2.tactic
          : fixture._t2 || { formation: "4-4-2", style: "Balanced" };
        if (p1) fixture._t1 = t1;
        if (p2) fixture._t2 = t2;
        return { t1, t2 };
      });

    // Detect if any connected human has a team in the current fixtures
    const humanInFixtures = game.currentFixtures.some((f) =>
      Object.values(game.playersByName).some(
        (p: any) =>
          p.socketId &&
          (p.teamId === f.homeTeamId || p.teamId === f.awayTeamId),
      ),
    );
    const effectiveMsPerMinute = humanInFixtures ? MS_PER_GAME_MINUTE : 100;

    // At the start of the second half, apply halftime tactic changes (substitutions/style)
    // to the cached squads. fixture._homeSquad/_awaySquad were set during the first half and
    // won't reflect tactic position changes made during the interval otherwise.
    // Helper to create lineup snapshot
    const playerOverall = (p: any) =>
      Math.round(
        ((Number(p?.gk ?? p?.skill ?? 1) +
          Number(p?.defesa ?? p?.skill ?? 1) +
          Number(p?.passe ?? p?.skill ?? 1) +
          Number(p?.finalizacao ?? p?.skill ?? 1)) /
          4) *
          (0.8 + Number(p?.form ?? 25) / 250),
      );
    const lineupSnapshot = (squad: any[]) =>
      squad.map((p) => ({
        id: p.id,
        name: p.name,
        position: p.position,
        is_star: p.is_star || 0,
        skill: playerOverall(p),
      }));

    // At the start of the second half, apply halftime tactic changes (substitutions/style)
    if (startMin === 46) {
      try {
        for (let fi = 0; fi < game.currentFixtures.length; fi++) {
          const fixture = game.currentFixtures[fi];
          const { t1, t2 } = fixtureTactics[fi];

          const applyHalftimeSubs = (
            squad: any[] | undefined,
            tactic: any,
            fullRoster: any[] | undefined,
            teamSide: "home" | "away",
          ) => {
            if (!squad || !tactic?.positions || !fullRoster) return;
            const positions: Record<number, string> = tactic.positions;
            const currentIds = new Set(squad.map((p: any) => p.id));

            // Players in the current squad who are now marked as Suplente (subbed out at halftime)
            const toRemoveIds = squad
              .filter((p: any) => positions[p.id] === "Suplente")
              .map((p: any) => p.id);

            // Players not in squad who are now marked as Titular (subbed in at halftime)
            const toAddIds = Object.entries(positions)
              .filter(
                ([id, status]) =>
                  status === "Titular" && !currentIds.has(Number(id)),
              )
              .map(([id]) => Number(id));

            if (toRemoveIds.length === 0 && toAddIds.length === 0) return;

            // Snapshot outgoing/incoming players BEFORE modifying the squad
            const outPlayers = toRemoveIds
              .map((id: number) => squad.find((p: any) => p.id === id))
              .filter(Boolean);
            const inPlayers = toAddIds
              .map((id: number) => fullRoster.find((p: any) => p.id === id))
              .filter(Boolean);

            // Remove subbed-out players
            for (const id of toRemoveIds) {
              const idx = squad.findIndex((p: any) => p.id === id);
              if (idx > -1) squad.splice(idx, 1);
            }

            // Add subbed-in players from the full roster
            for (const player of inPlayers) {
              squad.push(player);
            }

            // Update the lineup snapshot to reflect the new squad composition
            if (teamSide === "home") {
              fixture.homeLineup = lineupSnapshot(squad);
            } else {
              fixture.awayLineup = lineupSnapshot(squad);
            }

            // Emit halftime_sub events so the client lineup display reflects the changes
            const htSubPhrases = [
              (o: string, i: string) =>
                `${o} ficou no balneário. ${i} começa a segunda parte.`,
              (o: string, i: string) =>
                `Mudança ao intervalo: ${i} entra para o lugar de ${o}. Recado recebido.`,
              (o: string, i: string) =>
                `${o} não convenceu. ${i} tem a segunda parte para provar o seu valor.`,
              (o: string, i: string) =>
                `O treinador não esperou: ${o} sai, ${i} entra. Mensagem clara.`,
              (o: string, i: string) =>
                `Substituição ao intervalo. ${i} substitui ${o} — hora de fazer a diferença.`,
              (o: string, i: string) =>
                `${o} foi substituído no intervalo. ${i} vai tentar mudar o rumo da partida.`,
            ];
            const pairs = Math.min(outPlayers.length, inPlayers.length);
            for (let i = 0; i < pairs; i++) {
              const phrasePool = htSubPhrases;
              const phrase = phrasePool[
                Math.floor(Math.random() * phrasePool.length)
              ](outPlayers[i].name, inPlayers[i].name);
              fixture.events = fixture.events || [];
              fixture.events.push({
                minute: 45,
                type: "halftime_sub",
                team: teamSide,
                emoji: "🔁",
                outPlayerId: outPlayers[i].id,
                outPlayerName: outPlayers[i].name,
                playerId: inPlayers[i].id,
                playerName: inPlayers[i].name,
                position: inPlayers[i].position,
                text: `[HT] 🔁 ${phrase}`,
              });
            }
          };

          applyHalftimeSubs(
            fixture._homeSquad,
            t1,
            fixture._homeFullRoster,
            "home",
          );
          applyHalftimeSubs(
            fixture._awaySquad,
            t2,
            fixture._awayFullRoster,
            "away",
          );
        }
      } catch (err) {
        console.error(
          `[${game.roomCode}] Error applying halftime substitutions:`,
          err,
        );
      }
    }

    // Emit match segment start so the client can show the match UI immediately
    io.to(game.roomCode).emit("matchSegmentStart", {
      startMin,
      endMin,
      matchweek: game.matchweek,
      isCup: entry?.type === "cup",
      cupRoundName: entry?.type === "cup" ? (entry as any).roundName : null,
      fixtures: game.currentFixtures.map((f) => ({
        homeTeamId: f.homeTeamId,
        awayTeamId: f.awayTeamId,
        homeTeam: f.homeTeam || null,
        awayTeam: f.awayTeam || null,
        finalHomeGoals: f.finalHomeGoals || 0,
        finalAwayGoals: f.finalAwayGoals || 0,
        events: f.events || [],
        attendance: f.attendance || null,
        homeLineup: f.homeLineup || [],
        awayLineup: f.awayLineup || [],
      })),
    });

    // ── Simulate minute by minute, all fixtures in parallel ──────────────
    for (let minute = startMin; minute <= endMin; minute++) {
      // Simulate this minute for every fixture
      for (let fi = 0; fi < game.currentFixtures.length; fi++) {
        const fixture = game.currentFixtures[fi];
        const { t1, t2 } = fixtureTactics[fi];
        await simulateMatchSegment(game.db, fixture, t1, t2, minute, minute, {
          game,
          io,
          matchweek: game.matchweek,
        });
      }

      // Track current live minute for reconnection recovery
      game.liveMinute = minute;

      // Emit per-minute update so the client clock stays in sync
      io.to(game.roomCode).emit("matchMinuteUpdate", {
        minute,
        fixtures: game.currentFixtures.map((f) => ({
          homeTeamId: f.homeTeamId,
          awayTeamId: f.awayTeamId,
          homeGoals: f.finalHomeGoals,
          awayGoals: f.finalAwayGoals,
          minuteEvents: (f.events || []).filter((e) => e.minute === minute),
          homeLineup: f.homeLineup || [],
          awayLineup: f.awayLineup || [],
        })),
      });

      // Wait before next minute to sync with client clock
      if (minute < endMin) {
        await new Promise((r) => setTimeout(r, effectiveMsPerMinute));
      }
    }

    game._lastCompletedSegment = segmentKey;
    console.log(
      `[${game.roomCode}] ✓ Segment ${startMin}-${endMin} completed | phase=${game.gamePhase}`,
    );

    if (endMin === 45) {
      // ── Halftime ─────────────────────────────────────────────────────────
      console.log(
        `[${game.roomCode}] ⏸ HALFTIME reached | entry=${entry ? `type:${entry.type}` : "null"} | gamePhase=${game.gamePhase}`,
      );
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
            events: (fixture.events || []).slice(),
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
        console.log(
          `[${game.roomCode}] Emitting cupHalfTimeResults with ${game.currentFixtures.length} fixtures`,
        );
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
        const halftimePayload = {
          matchweek: game.matchweek,
          results: halfTimeFixtures,
        };
        game.lastHalftimePayload = halftimePayload;
        io.to(game.roomCode).emit("halfTimeResults", halftimePayload);
      }

      Object.values(game.playersByName).forEach((p) => {
        p.ready = false;
      });
      io.to(game.roomCode).emit("playerListUpdate", getPlayerList(game));
      saveGameState(game);

      // Safety timeout: auto-advance halftime if coaches don't respond within 120s.
      // This prevents permanently stuck matches when all coaches disconnect.
      const HALFTIME_SAFETY_TIMEOUT_MS = 120_000;
      const halftimeToken = game.phaseToken;
      game.phaseTimer = setTimeout(() => {
        // Only fire if we are still in halftime with the same token
        if (
          game.gamePhase !== "match_halftime" ||
          game.phaseToken !== halftimeToken
        )
          return;

        // Check if any connected coach exists
        const anyConnected = Object.values(game.playersByName).some(
          (p) => !!p.socketId,
        );
        if (anyConnected) {
          // Coaches are connected but not ready — don't force; they may be adjusting tactics
          console.log(
            `[${game.roomCode}] ⏱ Halftime safety: coaches connected but not ready, extending timeout`,
          );
          return;
        }

        console.warn(
          `[${game.roomCode}] ⏱ Halftime safety timeout: no connected coaches after ${HALFTIME_SAFETY_TIMEOUT_MS / 1000}s — auto-advancing to second half`,
        );
        // Mark all as ready and trigger advance
        Object.values(game.playersByName).forEach((p) => {
          p.ready = true;
        });
        checkAllReady(game);
      }, HALFTIME_SAFETY_TIMEOUT_MS);

      return;
    }

    // ── Full time ────────────────────────────────────────────────────────────
    console.log(
      `[${game.roomCode}] 🏁 FULL TIME reached | entry=${entry ? `type:${entry.type}` : "null"} | phase=${game.gamePhase}`,
    );
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

    console.log(
      `[${game.roomCode}] 📊 finalizeLeagueEvent | mw=${completedMatchweek} | fixtures=${fixtures.length}`,
    );

    return new Promise<void>((resolveOuter) => {
      game.db.serialize(() => {
        game.db.run("BEGIN TRANSACTION");

        for (const match of fixtures) {
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

          Object.values(game.playersByName).forEach((p) => {
            p.ready = false;
          });

          // Advance state
          game.calendarIndex += 1;
          game.matchweek += 1;
          game.currentEvent = SEASON_CALENDAR[game.calendarIndex] ?? null;
          game.currentFixtures = [];
          game.gamePhase = "lobby";
          game.lastHalftimePayload = null;
          console.log(
            `[${game.roomCode}] ↩ League match finalized → lobby | calendarIndex=${game.calendarIndex} | mw=${game.matchweek} | nextEvent=${game.currentEvent?.type ?? "none"}`,
          );
          saveGameState(game);

          // Check season end: calendarIndex past end of calendar
          const seasonDone = game.calendarIndex >= SEASON_CALENDAR.length;

          persistMatchResults(game, fixtures, completedMatchweek, () => {
            applyPostMatchQualityEvolution(game.db, fixtures, game.matchweek)
              .then(async () => {
                try {
                  await applyWeeklyTraining(
                    game.db,
                    game.season,
                    completedMatchweek,
                  );
                } catch (trainingErr) {
                  console.error(
                    `[${game.roomCode}] Training application error:`,
                    trainingErr,
                  );
                }
                if (seasonDone) {
                  try {
                    await applySeasonEnd(game);
                  } catch (seErr) {
                    console.error(
                      `[${game.roomCode}] Season end error:`,
                      seErr,
                    );
                  }
                  resolveOuter();
                  return;
                }

                // Drain pending auction queue — skip if next event is a cup round to avoid
                // the auction modal overlapping the cup draw animation.
                if (
                  game.pendingAuctionQueue &&
                  game.pendingAuctionQueue.length > 0 &&
                  game.currentEvent?.type !== "cup"
                ) {
                  const queue = game.pendingAuctionQueue.splice(0) as any[];
                  let qDelay = 500;
                  for (const qEntry of queue) {
                    setTimeout(() => {
                      listPlayerOnMarket(
                        game,
                        qEntry.playerId,
                        qEntry.mode,
                        qEntry.price,
                        qEntry.callback,
                      );
                    }, qDelay);
                    qDelay += 18000;
                  }
                }

                try {
                  await processContractExpiries(game);
                } catch (_) {}
                try {
                  await processAgentRenegotiations(game);
                } catch (_) {}
                try {
                  await processNpcTransferActivity(game);
                } catch (_) {}
                refreshMarket(game);
                try {
                  await processCoachEvents(game);
                } catch (coachErr) {
                  console.error(
                    `[${game.roomCode}] Coach events error:`,
                    coachErr,
                  );
                }

                // If the next calendar event is a cup round, prepare the draw NOW
                // so coaches see their opponent and can set tactics in the lobby.
                if (game.currentEvent?.type === "cup") {
                  try {
                    await startCupRound(game, (game.currentEvent as any).round);
                    saveGameState(game);
                  } catch (cupErr) {
                    console.error(
                      `[${game.roomCode}] Cup draw preparation error:`,
                      cupErr,
                    );
                  }
                }

                // Broadcast updated standings and squad info
                game.db.all(
                  "SELECT * FROM teams",
                  (err2: any, teams: any[]) => {
                    if (!err2) io.to(game.roomCode).emit("teamsData", teams);
                    getAllTeamForms(game.db, game.season)
                      .then((forms) => {
                        io.to(game.roomCode).emit("teamForms", forms);
                      })
                      .catch(() => {});

                    game.db.all(
                      "SELECT p.id, p.name, p.position, p.goals, p.team_id, t.name as team_name, t.color_primary, t.color_secondary FROM players p LEFT JOIN teams t ON p.team_id = t.id WHERE p.goals > 0 ORDER BY p.goals DESC, ((COALESCE(p.gk, p.skill, 1) + COALESCE(p.defesa, p.skill, 1) + COALESCE(p.passe, p.skill, 1) + COALESCE(p.finalizacao, p.skill, 1)) / 4.0) DESC LIMIT 20",
                      (err3: any, scorers: any[]) => {
                        io.to(game.roomCode).emit("topScorers", scorers || []);

                        const connectedPlayers = getPlayerList(game);
                        const activeTeamIds = connectedPlayers
                          .filter((p) => p.socketId && p.teamId != null)
                          .map((p) => p.teamId as number);

                        const emitSquadsAndFinish = (
                          byTeam: Map<number, any[]>,
                        ) => {
                          connectedPlayers.forEach((player) => {
                            if (!player.socketId || player.teamId == null)
                              return;
                            const squad =
                              byTeam.get(player.teamId as number) || [];
                            io.to(player.socketId as string).emit(
                              "mySquad",
                              withJuniorGRs(
                                squad,
                                player.teamId as number,
                                game.matchweek || 1,
                              ),
                            );
                          });
                          io.to(game.roomCode).emit(
                            "playerListUpdate",
                            getPlayerList(game),
                          );
                          resolveOuter();
                        };

                        if (activeTeamIds.length === 0) {
                          io.to(game.roomCode).emit(
                            "playerListUpdate",
                            getPlayerList(game),
                          );
                          resolveOuter();
                          return;
                        }

                        const placeholders = activeTeamIds
                          .map(() => "?")
                          .join(",");
                        game.db.all(
                          `SELECT * FROM players WHERE team_id IN (${placeholders})`,
                          activeTeamIds,
                          (err4: any, allPlayers: any[]) => {
                            const byTeam = new Map<number, any[]>();
                            if (!err4 && allPlayers) {
                              for (const p of allPlayers) {
                                const list = byTeam.get(p.team_id) || [];
                                list.push(p);
                                byTeam.set(p.team_id, list);
                              }
                            }
                            emitSquadsAndFinish(byTeam);
                          },
                        );
                        return;
                      },
                    );
                  },
                );
              })
              .catch((error: any) => {
                console.error(
                  `[${game.roomCode}] Post-match evolution error:`,
                  error,
                );
                resolveOuter();
              });
          });
        });
      });
    });
  }

  // ─── MAIN DISPATCH: checkAllReady ────────────────────────────────────────────
  // Cup and league use the IDENTICAL flow: lobby → match_first_half → halftime
  // → match_second_half → finalize → lobby. No special cup phases.

  async function checkAllReady(game: ActiveGame) {
    // ── Standard readiness check (same for cup and league) ──────────────────
    if (game.lockedCoaches.size >= 2) {
      const readyStatus = [...game.lockedCoaches].map((name) => ({
        name,
        connected: !!game.playersByName[name]?.socketId,
        ready: !!game.playersByName[name]?.ready,
      }));
      const allReady = readyStatus.every((s) => s.connected && s.ready);
      if (!allReady) return;
      console.log(
        `[${game.roomCode}] ✅ All locked coaches ready: ${readyStatus.map((s) => `${s.name}(${s.ready ? "R" : "-"})`).join(", ")}`,
      );
    } else {
      const connectedPlayers = getPlayerList(game).filter(
        (p) => p.teamId !== null,
      );
      if (connectedPlayers.length === 0) {
        // All connected players are dismissed — only auto-advance from lobby so NPC matches can run.
        if (game.gamePhase !== "lobby") return;
        console.log(
          `[${game.roomCode}] 🤖 No active coaches connected in lobby — auto-advancing NPC matches`,
        );
        // Fall through to advance the lobby
      } else if (!connectedPlayers.every((player) => player.ready)) {
        return;
      } else {
        console.log(
          `[${game.roomCode}] ✅ All ${connectedPlayers.length} connected players ready`,
        );
      }
    }

    console.log(
      `[${game.roomCode}] 🔄 checkAllReady dispatching | calendarIndex=${game.calendarIndex} | gamePhase=${game.gamePhase} | segmentRunning=${!!segmentRunning[game.roomCode]}`,
    );

    // ── Lobby → start match (league OR cup, identical) ──────────────────────
    if (game.gamePhase === "lobby") {
      if (segmentRunning[game.roomCode]) {
        console.warn(
          `[${game.roomCode}] ⚠ Lobby→match blocked: segmentRunning is true (match already in progress)`,
        );
        return;
      }

      const entry = SEASON_CALENDAR[game.calendarIndex];
      if (!entry) {
        console.warn(
          `[${game.roomCode}] ⚠ checkAllReady: calendarIndex ${game.calendarIndex} out of range (calendar length: ${SEASON_CALENDAR.length})`,
        );
        return;
      }

      finalizeAllRunningAuctions(game, finalizeAuction);

      segmentRunning[game.roomCode] = true;
      game.gamePhase = "match_first_half";
      game.currentEvent = entry;
      game.phaseToken = makePhaseToken(game);
      game._lastCompletedSegment = null;

      console.log(
        `[${game.roomCode}] 🏟 Starting match | type=${entry.type} | calendarIndex=${game.calendarIndex} | ${entry.type === "cup" ? `round=${(entry as any).round}` : `mw=${(entry as any).matchweek}`}`,
      );

      // Weekly base income by division (keeps lower-division teams viable)
      const WEEKLY_BASE_INCOME: Record<number, number> = {
        1: 80000,
        2: 50000,
        3: 30000,
        4: 15000,
        5: 5000,
      };
      for (const [div, income] of Object.entries(WEEKLY_BASE_INCOME)) {
        game.db.run("UPDATE teams SET budget = budget + ? WHERE division = ?", [
          income,
          Number(div),
        ]);
      }

      // Deduct weekly wages + loan interest (same for cup and league weeks)
      game.db.run(
        `UPDATE teams SET budget = budget
          - CAST((loan_amount * 0.015) AS INTEGER)
          - (SELECT COALESCE(SUM(wage), 0) FROM players WHERE players.team_id = teams.id)`,
        async (err: any) => {
          if (err) {
            console.error(
              `[${game.roomCode}] ❌ Weekly expense DB error:`,
              err,
            );
            game.gamePhase = "lobby";
            game.currentEvent = entry;
            segmentRunning[game.roomCode] = false;
            return;
          }

          try {
            if (entry.type === "cup") {
              // Cup fixtures were prepared when we entered the lobby (see finalizeLeagueEvent).
              // Fallback: prepare now if missing (e.g. crash recovery).
              if (!game.currentFixtures || game.currentFixtures.length === 0) {
                console.log(
                  `[${game.roomCode}] 🏆 Cup fixtures missing, generating draw for round ${(entry as any).round}`,
                );
                await startCupRound(game, (entry as any).round);
              } else {
                console.log(
                  `[${game.roomCode}] 🏆 Cup fixtures already prepared: ${game.currentFixtures.length} matches`,
                );
              }
            } else {
              // League: generate fixtures now.
              // Pass the human player's teamId so the alternation fix applies.
              const mw = (entry as any).matchweek;
              const userTeamId = Object.values(game.playersByName)
                .map((p) => p.teamId)
                .find(Boolean);
              console.log(
                `[${game.roomCode}] ⚽ Generating league fixtures for mw=${mw}`,
              );
              const [f1, f2, f3, f4] = await Promise.all([
                generateFixturesForDivision(game.db, 1, mw, userTeamId),
                generateFixturesForDivision(game.db, 2, mw, userTeamId),
                generateFixturesForDivision(game.db, 3, mw, userTeamId),
                generateFixturesForDivision(game.db, 4, mw, userTeamId),
              ]);
              game.currentFixtures = [...f1, ...f2, ...f3, ...f4];
              console.log(
                `[${game.roomCode}] ⚽ Generated ${game.currentFixtures.length} league fixtures`,
              );
            }
          } catch (fixtureErr) {
            console.error(
              `[${game.roomCode}] ❌ Fixture generation failed — reverting to lobby:`,
              fixtureErr,
            );
            game.gamePhase = "lobby";
            game.currentEvent = entry;
            game.currentFixtures = [];
            segmentRunning[game.roomCode] = false;
            saveGameState(game);
            // Reset ready states so coaches can retry
            Object.values(game.playersByName).forEach((p) => {
              p.ready = false;
            });
            io.to(game.roomCode).emit("playerListUpdate", getPlayerList(game));
            io.to(game.roomCode).emit(
              "systemMessage",
              "⚠ Erro ao gerar jogos. Tenta novamente.",
            );
            return;
          }

          saveGameState(game);

          try {
            await runMatchSegment(game, 1, 45);
          } catch (segmentErr) {
            console.error(
              `[${game.roomCode}] ❌ First half segment failed:`,
              segmentErr,
            );
          } finally {
            segmentRunning[game.roomCode] = false;
          }
          // segmentRunning is now false; safe to auto-advance if all coaches were dismissed.
          if (game.gamePhase === "lobby") {
            checkAllReady(game);
            return;
          }

          // Auto-advance cup halftime when no human coach is in any fixture.
          // (All eliminated — no substitutions screen needed, continue immediately.)
          if (game.gamePhase === "match_halftime" && entry?.type === "cup") {
            const humanInAnyFixture = game.currentFixtures.some((f) =>
              (Object.values(game.playersByName) as PlayerSession[]).some(
                (p) =>
                  p.socketId &&
                  (p.teamId === f.homeTeamId || p.teamId === f.awayTeamId),
              ),
            );
            if (!humanInAnyFixture) {
              console.log(
                `[${game.roomCode}] 🏆 No human in cup fixtures — auto-advancing to second half`,
              );
              // Cancel halftime safety timeout
              clearPhaseTimer(game);
              finalizeAllRunningAuctions(game, finalizeAuction);
              game.gamePhase = "match_second_half";
              game.phaseToken = makePhaseToken(game);
              saveGameState(game);
              const cupEntry = entry as any;
              io.to(game.roomCode).emit("cupSecondHalfStart", {
                round: cupEntry.round,
                roundName: cupEntry.roundName,
                season: game.season,
                results: game.currentFixtures.map((f) => ({
                  homeTeamId: f.homeTeamId,
                  awayTeamId: f.awayTeamId,
                  finalHomeGoals: f.finalHomeGoals,
                  finalAwayGoals: f.finalAwayGoals,
                  events: f.events,
                })),
              });
              segmentRunning[game.roomCode] = true;
              try {
                await runMatchSegment(game, 46, 90);
              } catch (segmentErr) {
                console.error(
                  `[${game.roomCode}] ❌ Cup auto-advance second half failed:`,
                  segmentErr,
                );
              } finally {
                segmentRunning[game.roomCode] = false;
              }
              // Re-check lobby after cup auto-advance in case all coaches were dismissed.
              if ((game.gamePhase as string) === "lobby") {
                checkAllReady(game);
              }
            }
          }
        },
      );
      return;
    }

    // ── ET gate → start extra time (cup only) ────────────────────────────────
    if (game.gamePhase === "match_et_gate") {
      console.log(
        `[${game.roomCode}] ⏩ ET gate acknowledged — resolving to start extra time`,
      );
      if (game._etGateResolve) {
        game._etGateResolve();
        game._etGateResolve = null;
      }
      return;
    }

    // ── Halftime → second half (league AND cup, identical) ──────────────────
    if (game.gamePhase === "match_halftime") {
      if (segmentRunning[game.roomCode]) {
        console.warn(
          `[${game.roomCode}] ⚠ Halftime→second half blocked: segmentRunning is true`,
        );
        return;
      }
      segmentRunning[game.roomCode] = true;

      // Cancel halftime safety timeout
      clearPhaseTimer(game);

      const entry = game.currentEvent as any;
      console.log(
        `[${game.roomCode}] ▶ Halftime → second half | type=${entry?.type ?? "unknown"}`,
      );

      finalizeAllRunningAuctions(game, finalizeAuction);
      game.gamePhase = "match_second_half";
      game.phaseToken = makePhaseToken(game);
      saveGameState(game);

      // For cup matches, emit animation before second half starts
      if (entry?.type === "cup") {
        io.to(game.roomCode).emit("cupSecondHalfStart", {
          round: entry.round,
          roundName: entry.roundName,
          season: game.season,
          results: game.currentFixtures.map((f) => ({
            homeTeamId: f.homeTeamId,
            awayTeamId: f.awayTeamId,
            finalHomeGoals: f.finalHomeGoals,
            finalAwayGoals: f.finalAwayGoals,
            events: f.events,
          })),
        });
      }

      try {
        await runMatchSegment(game, 46, 90);
      } catch (segmentErr) {
        console.error(
          `[${game.roomCode}] ❌ Second half segment failed:`,
          segmentErr,
        );
      } finally {
        segmentRunning[game.roomCode] = false;
      }
      // segmentRunning is now false; safe to auto-advance if all coaches were dismissed.
      if ((game.gamePhase as string) === "lobby") {
        checkAllReady(game);
      }
    }
  }

  return {
    checkAllReady,
    runMatchSegment,
  };
}
