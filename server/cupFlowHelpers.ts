// @ts-nocheck
import type { ActiveGame, PlayerSession } from "./types";
import type { CalendarEntry } from "./gameConstants";
import { SEASON_CALENDAR, SPONSOR_REVENUE_BY_DIVISION } from "./gameConstants";
import { clearPhaseTimer } from "./matchFlowHelpers";

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
  applyTrainingBonuses: (
    game: ActiveGame,
    fixtures: any[],
    completedCalendarIndex: number,
  ) => Promise<void>;
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
    applyTrainingBonuses,
  } = deps;

  // ─── SEASON END ────────────────────────────────────────────────────────────

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

    const CHAMPION_PRIZE: Record<number, number> = {
      1: 2000000,
      2: 1000000,
      3: 500000,
      4: 250000,
    };

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
          "UPDATE teams SET budget = budget + ? WHERE id = ?",
          [CHAMPION_PRIZE[1], iLigaWinner.id],
          resolve,
        );
      });
      io.to(game.roomCode).emit(
        "systemMessage",
        `🏆 ${iLigaWinner.name} é o Campeão Nacional de ${year}! (+2.000.000€)`,
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
        const prize = CHAMPION_PRIZE[div];
        await new Promise((resolve) => {
          game.db.run(
            "UPDATE teams SET budget = budget + ? WHERE id = ?",
            [prize, winner.id],
            resolve,
          );
        });
        const prizeFormatted = new Intl.NumberFormat("pt-PT").format(prize);
        io.to(game.roomCode).emit(
          "systemMessage",
          `🥇 ${winner.name} é Campeão ${DIVISION_NAMES[div]} de ${year}! (+${prizeFormatted}€)`,
        );
      }
    }

    // Sponsor revenue by division
    for (const team of allTeams) {
      const sponsorAmount = SPONSOR_REVENUE_BY_DIVISION[team.division] || 0;
      if (sponsorAmount > 0) {
        await new Promise((resolve) => {
          game.db.run(
            "UPDATE teams SET budget = budget + ? WHERE id = ?",
            [sponsorAmount, team.id],
            resolve,
          );
        });
      }
    }
    io.to(game.roomCode).emit(
      "systemMessage",
      "📺 Receitas de patrocinadores distribuídas.",
    );

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
        game.db.run(
          "UPDATE teams SET budget = budget + 500000 WHERE id = ?",
          [topScorer.team_id],
          resolve,
        );
      });
      io.to(game.roomCode).emit(
        "systemMessage",
        `⚽ ${topScorer.name} (${topScorer.team_name}) é o Melhor Marcador com ${topScorer.goals} golos! (+500.000€ para ${topScorer.team_name})`,
      );
    }

    // Clear financial club news (revenues and expenses list)
    await new Promise((resolve) => {
      game.db.run("DELETE FROM club_news WHERE amount IS NOT NULL", resolve);
    });

    const promotions: Array<{
      teamId: number;
      toDiv: number;
      fromDiv: number;
      teamName: string;
    }> = [];

    function pickRandomTeamIds(teams: any[], count: number): number[] {
      const pool = [...teams];
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      return pool.slice(0, Math.min(count, pool.length)).map((team) => team.id);
    }

    for (const [upperDiv, lowerDiv] of [
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
    ]) {
      const upper = byDiv[upperDiv] || [];
      const lower = byDiv[lowerDiv] || [];
      if (!upper.length || !lower.length) continue;
      const relegated = upper.slice(-2).map((team) => team.id);
      const promoted =
        upperDiv === 4 && lowerDiv === 5
          ? pickRandomTeamIds(lower, 2)
          : lower.slice(0, 2).map((team) => team.id);
      relegated.forEach((id) => {
        const team = allTeams.find((t: any) => t.id === id);
        promotions.push({
          teamId: id,
          toDiv: lowerDiv,
          fromDiv: upperDiv,
          teamName: team?.name || `Equipa ${id}`,
        });
      });
      promoted.forEach((id) => {
        const team = allTeams.find((t: any) => t.id === id);
        promotions.push({
          teamId: id,
          toDiv: upperDiv,
          fromDiv: lowerDiv,
          teamName: team?.name || `Equipa ${id}`,
        });
      });
    }

    const dbRun = (sql: string, params: any[] = []) =>
      new Promise<void>((resolve, reject) =>
        game.db.run(sql, params, (err: any) => (err ? reject(err) : resolve())),
      );

    await dbRun("BEGIN");
    try {
      for (const promotion of promotions) {
        await dbRun("UPDATE teams SET division = ? WHERE id = ?", [
          promotion.toDiv,
          promotion.teamId,
        ]);
      }
      await dbRun(
        "UPDATE teams SET points=0, wins=0, draws=0, losses=0, goals_for=0, goals_against=0",
      );
      await dbRun("COMMIT");
    } catch (txErr) {
      await dbRun("ROLLBACK").catch(() => {});
      throw txErr;
    }

    // Persist avg_attendance per team (rolling average: blend previous + this season)
    for (const team of allTeams) {
      const homeMatches = await runAll<{ attendance: number }>(
        game.db,
        "SELECT attendance FROM matches WHERE home_team_id = ? AND played = 1 AND attendance > 0",
        [team.id],
      );
      if (homeMatches.length > 0) {
        const seasonAvg = Math.round(
          homeMatches.reduce((s, m) => s + (m.attendance || 0), 0) /
            homeMatches.length,
        );
        const prevAvg = team.avg_attendance || 0;
        const newAvg =
          prevAvg > 0 ? Math.round((prevAvg + seasonAvg) / 2) : seasonAvg;
        await new Promise((resolve) => {
          game.db.run(
            "UPDATE teams SET avg_attendance = ? WHERE id = ?",
            [newAvg, team.id],
            resolve,
          );
        });
      }
    }
    await dbRun("BEGIN");
    try {
      await dbRun(
        "UPDATE players SET career_goals = career_goals + goals, career_reds = career_reds + red_cards, career_injuries = career_injuries + injuries, career_games = career_games + games_played",
      );
      await dbRun(
        "UPDATE players SET goals = 0, red_cards = 0, injuries = 0, games_played = 0, suspension_games = 0, suspension_until_matchweek = 0, injury_until_matchweek = 0, transfer_cooldown_until_matchweek = 0",
      );
      await dbRun("UPDATE players SET signed_season = 0");
      await dbRun("COMMIT");
    } catch (txErr) {
      await dbRun("ROLLBACK").catch(() => {});
      throw txErr;
    }

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
    game.dismissalsThisSeason = new Set<string>();
    clearPhaseTimer(game);
    game.phaseAcks = new Set();
    game.phaseToken = "";
    saveGameState(game);

    const updatedTeams = await runAll(game.db, "SELECT * FROM teams");
    io.to(game.roomCode).emit("teamsData", updatedTeams);
    io.to(game.roomCode).emit("topScorers", []); // Reset top scorers for new season
    io.to(game.roomCode).emit("teamForms", {}); // Reset form display for new season

    // Build season-end summary for the modal
    const divisionChampions = ([1, 2, 3, 4] as number[])
      .map((div) => {
        const winner = byDiv[div]?.[0];
        if (!winner) return null;
        return {
          divId: div,
          divName: DIVISION_NAMES[div] || `Divisão ${div}`,
          teamId: winner.id,
          teamName: winner.name,
          prize: CHAMPION_PRIZE[div] || 0,
        };
      })
      .filter(Boolean);
    const cupWinnerRow = await runGet(
      game.db,
      `SELECT p.team_id, t.name as team_name
       FROM palmares p
       JOIN teams t ON p.team_id = t.id
       WHERE p.season = ? AND p.achievement = 'Vencedor da Taça de Portugal'
       LIMIT 1`,
      [year],
    );

    io.to(game.roomCode).emit("seasonEnd", {
      season,
      year,
      champion: iLigaWinner
        ? { id: iLigaWinner.id, name: iLigaWinner.name }
        : null,
      promotions,
      divisionChampions,
      cupWinner: cupWinnerRow
        ? {
            teamId: cupWinnerRow.team_id,
            teamName: cupWinnerRow.team_name,
            prize: 500000,
          }
        : null,
      topScorer: topScorer
        ? {
            name: topScorer.name,
            teamId: topScorer.team_id,
            teamName: topScorer.team_name,
            goals: topScorer.goals,
            prize: 500000,
          }
        : null,
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

    // Reset draw-seen tracking for this new round
    game.cupDrawSeenBy = new Set();

    // Compute humanInCup for the client's draw payload
    const connectedPlayers = getPlayerList(game);
    const humanTeamIds = new Set(connectedPlayers.map((p) => p.teamId));
    const humanInCup = game.cupTeamIds.some((id) => humanTeamIds.has(id));

    const drawPayload = {
      round,
      roundName: CUP_ROUND_NAMES[round] || `Ronda ${round}`,
      fixtures: enrichedFixtures.map((f) => ({
        homeTeam: f.homeTeam,
        awayTeam: f.awayTeam,
      })),
      humanInCup,
      season: game.season,
    };

    // Emit draw so clients can show the animation in the lobby
    io.to(game.roomCode).emit("cupDrawStart", drawPayload);

    // Mark all currently connected coaches as having seen the draw
    for (const player of connectedPlayers) {
      game.cupDrawSeenBy.add(player.name);
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

    console.log(
      `[${game.roomCode}] 🏆 finalizeCupRound | round=${round} (${roundName}) | fixtures=${fixtures.length}`,
    );

    // ── Phase 1: Setup tactics and snapshot 90-min scores ────────────────────
    type FixtureSetup = {
      fixture: any;
      t1: any;
      t2: any;
      ctx: any;
      goals90Home: number;
      goals90Away: number;
    };
    const setups: FixtureSetup[] = fixtures.map((fixture) => {
      const p1 = Object.values(game.playersByName).find(
        (p: any) => p.teamId === fixture.homeTeamId,
      );
      const p2 = Object.values(game.playersByName).find(
        (p: any) => p.teamId === fixture.awayTeamId,
      );
      const t1 = (p1 as any)?.tactic ||
        fixture._t1 || { formation: "4-4-2", style: "Balanced" };
      const t2 = (p2 as any)?.tactic ||
        fixture._t2 || { formation: "4-4-2", style: "Balanced" };
      if (p1) fixture._t1 = t1;
      if (p2) fixture._t2 = t2;
      console.log(
        `[${game.roomCode}] 🏆 Cup fixture result: ${fixture.homeTeam?.name ?? fixture.homeTeamId} ${fixture.finalHomeGoals}-${fixture.finalAwayGoals} ${fixture.awayTeam?.name ?? fixture.awayTeamId}`,
      );
      return {
        fixture,
        t1,
        t2,
        ctx: { game, io, matchweek: game.matchweek },
        goals90Home: fixture.finalHomeGoals,
        goals90Away: fixture.finalAwayGoals,
      };
    });

    // ── Phase 2: Extra time — all drawn fixtures batched ─────────────────────
    const drawnSetups = setups.filter((s) => s.goals90Home === s.goals90Away);
    const hasAnyET = drawnSetups.length > 0;

    if (hasAnyET) {
      console.log(
        `[${game.roomCode}] 🏆 ${drawnSetups.length} fixture(s) drawn at 90 min — ET`,
      );

      // ET gate: show substitution screen ONCE for all coaches if any human is in a drawn fixture
      const humanInAnyDraw = drawnSetups.some(({ fixture }) =>
        (Object.values(game.playersByName) as PlayerSession[]).some(
          (p) =>
            p.socketId &&
            (p.teamId === fixture.homeTeamId ||
              p.teamId === fixture.awayTeamId),
        ),
      );

      if (humanInAnyDraw) {
        console.log(
          `[${game.roomCode}] ⏸ ET gate: waiting for coaches to ready up`,
        );
        // Reset ready states BEFORE changing phase
        Object.values(game.playersByName).forEach((p: any) => {
          p.ready = false;
        });
        game.gamePhase = "match_et_gate";
        const etGatePayload = {
          round,
          roundName,
          season,
          fixtures: fixtures.map((fx: any) => ({
            homeTeam: fx.homeTeam || null,
            awayTeam: fx.awayTeam || null,
            homeGoals: fx.finalHomeGoals,
            awayGoals: fx.finalAwayGoals,
            events: (fx.events || []).slice(),
            homeLineup: fx.homeLineup || [],
            awayLineup: fx.awayLineup || [],
            attendance: fx.attendance || null,
          })),
        };
        game.lastHalftimePayload = etGatePayload;
        io.to(game.roomCode).emit("playerListUpdate", getPlayerList(game));
        io.to(game.roomCode).emit("cupETHalfTime", etGatePayload);

        await new Promise<void>((resolve) => {
          game._etGateResolve = resolve;
          game._etGateTimer = setTimeout(() => {
            game._etGateResolve = null;
            game._etGateTimer = null;
            resolve();
          }, 90_000);
        });
        if (game._etGateTimer) {
          clearTimeout(game._etGateTimer);
          game._etGateTimer = null;
        }
        game._etGateResolve = null;
        console.log(
          `[${game.roomCode}] ⏩ ET gate resolved — starting extra time`,
        );
        io.to(game.roomCode).emit("playerListUpdate", getPlayerList(game));

        // Apply ET substitutions and re-read tactics changed during the pause screen
        const lineupSnapshotET = (squad: any[]) =>
          squad.map((p) => ({
            id: p.id,
            name: p.name,
            position: p.position,
            is_star: p.is_star || 0,
            skill: p.skill,
          }));

        const applyETSubs = (
          squad: any[] | undefined,
          tactic: any,
          fullRoster: any[] | undefined,
          fx: any,
          teamSide: "home" | "away",
        ) => {
          if (!squad || !tactic?.positions || !fullRoster) return;
          const positions: Record<number, string> = tactic.positions;
          const currentIds = new Set(squad.map((p: any) => p.id));
          const toRemoveIds = squad
            .filter((p: any) => positions[p.id] === "Suplente")
            .map((p: any) => p.id);
          const toAddIds = Object.entries(positions)
            .filter(
              ([id, status]) =>
                status === "Titular" && !currentIds.has(Number(id)),
            )
            .map(([id]) => Number(id));
          if (toRemoveIds.length === 0 && toAddIds.length === 0) return;

          const outPlayers = toRemoveIds
            .map((id: number) => squad.find((p: any) => p.id === id))
            .filter(Boolean);
          const inPlayers = toAddIds
            .map((id: number) => fullRoster.find((p: any) => p.id === id))
            .filter(Boolean);

          for (const id of toRemoveIds) {
            const idx = squad.findIndex((p: any) => p.id === id);
            if (idx > -1) squad.splice(idx, 1);
          }
          for (const player of inPlayers) {
            squad.push(player);
          }

          if (teamSide === "home") {
            fx.homeLineup = lineupSnapshotET(squad);
          } else {
            fx.awayLineup = lineupSnapshotET(squad);
          }

          const pairs = Math.min(outPlayers.length, inPlayers.length);
          for (let i = 0; i < pairs; i++) {
            fx.events = fx.events || [];
            fx.events.push({
              minute: 90,
              type: "et_sub",
              team: teamSide,
              emoji: "🔁",
              outPlayerId: outPlayers[i].id,
              outPlayerName: outPlayers[i].name,
              playerId: inPlayers[i].id,
              playerName: inPlayers[i].name,
              position: inPlayers[i].position,
              text: `[90+ET] 🔁 ${outPlayers[i].name} → ${inPlayers[i].name}`,
            });
          }
        };

        for (const setup of drawnSetups) {
          const { fixture: fx } = setup;
          const p1 = Object.values(game.playersByName).find(
            (p: any) => p.teamId === fx.homeTeamId,
          );
          const p2 = Object.values(game.playersByName).find(
            (p: any) => p.teamId === fx.awayTeamId,
          );
          if ((p1 as any)?.tactic) {
            setup.t1 = (p1 as any).tactic;
            fx._t1 = (p1 as any).tactic;
          }
          if ((p2 as any)?.tactic) {
            setup.t2 = (p2 as any).tactic;
            fx._t2 = (p2 as any).tactic;
          }
          applyETSubs(fx._homeSquad, setup.t1, fx._homeFullRoster, fx, "home");
          applyETSubs(fx._awaySquad, setup.t2, fx._awayFullRoster, fx, "away");
        }
      }

      // Emit cupExtraTimeStart ONCE — use the human's drawn fixture if available
      const primaryDrawn =
        drawnSetups.find(({ fixture }) =>
          (Object.values(game.playersByName) as PlayerSession[]).some(
            (p) =>
              p.socketId &&
              (p.teamId === fixture.homeTeamId ||
                p.teamId === fixture.awayTeamId),
          ),
        )?.fixture ?? drawnSetups[0].fixture;
      io.to(game.roomCode).emit("cupExtraTimeStart", {
        homeTeamId: primaryDrawn.homeTeamId,
        awayTeamId: primaryDrawn.awayTeamId,
        homeGoals: primaryDrawn.finalHomeGoals,
        awayGoals: primaryDrawn.finalAwayGoals,
      });

      game.gamePhase = "match_extra_time";
      console.log(
        `[${game.roomCode}] 🏆 Simulating ET for ${drawnSetups.length} fixture(s) in parallel...`,
      );
      // Simulate ALL drawn fixtures' ET simultaneously so the clock only runs once
      await Promise.all(
        drawnSetups.map(({ fixture, t1, t2, ctx }) => {
          (ctx as any).hasHumanInET = humanInAnyDraw;
          return simulateExtraTime(game.db, fixture, t1, t2, ctx);
        }),
      );

      // Post-ET: determine winner (or penalties) for each drawn fixture
      for (const { fixture, t1, t2 } of drawnSetups) {
        console.log(
          `[${game.roomCode}] 🏆 ET result: ${fixture.finalHomeGoals}-${fixture.finalAwayGoals} | ${fixture.homeTeam?.name ?? fixture.homeTeamId} vs ${fixture.awayTeam?.name ?? fixture.awayTeamId}`,
        );
        io.to(game.roomCode).emit("extraTimeEnded", {
          homeTeamId: fixture.homeTeamId,
          awayTeamId: fixture.awayTeamId,
          homeGoals: fixture.finalHomeGoals,
          awayGoals: fixture.finalAwayGoals,
        });

        const etGoalsHome = fixture.finalHomeGoals;
        const etGoalsAway = fixture.finalAwayGoals;

        if (etGoalsHome !== etGoalsAway) {
          fixture._winnerId =
            etGoalsHome > etGoalsAway ? fixture.homeTeamId : fixture.awayTeamId;
          console.log(
            `[${game.roomCode}] 🏆 Winner decided in ET: teamId=${fixture._winnerId}`,
          );
        } else {
          console.log(
            `[${game.roomCode}] 🏆 Still draw after ET — going to penalties`,
          );
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

          const humanInThisFixture = (
            Object.values(game.playersByName) as PlayerSession[]
          ).some(
            (p) =>
              p.socketId &&
              (p.teamId === fixture.homeTeamId ||
                p.teamId === fixture.awayTeamId),
          );
          if (humanInThisFixture) {
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
          fixture._winnerId =
            shootout.homeGoals > shootout.awayGoals
              ? fixture.homeTeamId
              : fixture.awayTeamId;
          console.log(
            `[${game.roomCode}] 🏆 Penalties: ${shootout.homeGoals}-${shootout.awayGoals} → winner teamId=${fixture._winnerId}`,
          );

          await new Promise((resolve) => {
            game.db.run(
              "UPDATE cup_matches SET home_penalties = ?, away_penalties = ?, played = 1, winner_team_id = ? WHERE season = ? AND round = ? AND home_team_id = ? AND away_team_id = ?",
              [
                shootout.homeGoals,
                shootout.awayGoals,
                fixture._winnerId,
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
              etGoalsHome,
              etGoalsAway,
              season,
              round,
              fixture.homeTeamId,
              fixture.awayTeamId,
            ],
            resolve,
          );
        });
      }
    }

    // ── Phase 3: DB updates, morale, and results for all fixtures ────────────
    for (const { fixture, goals90Home, goals90Away } of setups) {
      const winnerId =
        fixture._winnerId ??
        (goals90Home > goals90Away ? fixture.homeTeamId : fixture.awayTeamId);

      await new Promise((resolve) => {
        game.db.run(
          "UPDATE cup_matches SET home_score = ?, away_score = ?, played = 1, winner_team_id = ? WHERE season = ? AND round = ? AND home_team_id = ? AND away_team_id = ?",
          [
            goals90Home,
            goals90Away,
            winnerId,
            season,
            round,
            fixture.homeTeamId,
            fixture.awayTeamId,
          ],
          resolve,
        );
      });

      // Cup upset morale boost: winner beat a team from a higher division
      const [homeDiv, awayDiv] = await Promise.all([
        runGet(game.db, "SELECT division FROM teams WHERE id = ?", [
          fixture.homeTeamId,
        ]),
        runGet(game.db, "SELECT division FROM teams WHERE id = ?", [
          fixture.awayTeamId,
        ]),
      ]);
      const winnerIsHome = winnerId === fixture.homeTeamId;
      const winnerDiv = winnerIsHome
        ? (homeDiv?.division ?? 5)
        : (awayDiv?.division ?? 5);
      const loserDiv = winnerIsHome
        ? (awayDiv?.division ?? 5)
        : (homeDiv?.division ?? 5);
      if (loserDiv < winnerDiv) {
        const divDiff = winnerDiv - loserDiv;
        const extraMorale = Math.min(25, divDiff * 10);
        await new Promise((resolve) => {
          game.db.run(
            "UPDATE teams SET morale = MIN(100, morale + ?) WHERE id = ?",
            [extraMorale, winnerId],
            resolve,
          );
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
        wentToET:
          !!fixture._decidedByPenalties ||
          fixture.events.some((e: any) => e.minute > 90),
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

    // ET animation gate: wait for all connected coaches to ack before advancing
    if (hasAnyET) {
      const anyHumanConnected = (
        Object.values(game.playersByName) as PlayerSession[]
      ).some((p) => !!p.socketId);
      if (anyHumanConnected) {
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

    // Apply training bonuses for this completed calendar event (cup round)
    const completedCalendarIndex = game.calendarIndex;
    try {
      await applyTrainingBonuses(game, fixtures, completedCalendarIndex);
    } catch (trainErr) {
      console.error(`[${game.roomCode}] training (cup): error applying bonuses:`, trainErr);
    }

    // Reduzir timers de indisponibilidade para equipas que jogaram esta ronda
    if (game.cupTeamIds.length > 0) {
      const placeholders = game.cupTeamIds.map(() => "?").join(", ");
      await runAll(
        game.db,
        `UPDATE players
         SET
           injury_until_matchweek             = MAX(0, injury_until_matchweek - 1),
           suspension_until_matchweek         = MAX(0, suspension_until_matchweek - 1),
           transfer_cooldown_until_matchweek  = MAX(0, transfer_cooldown_until_matchweek - 1)
         WHERE team_id IN (${placeholders})`,
        game.cupTeamIds,
      );
      console.log(
        `[${game.roomCode}] ⏱ Timers reduzidos para ${game.cupTeamIds.length} equipas da Taça`,
      );
    }

    // Advance calendar
    game.calendarIndex += 1;
    game.currentEvent = SEASON_CALENDAR[game.calendarIndex] ?? null;
    game.currentFixtures = [];
    game.cupHalftimePayload = null;
    game.lastHalftimePayload = null;
    game.gamePhase = "lobby";
    Object.values(game.playersByName).forEach((p) => {
      p.ready = false;
    });
    console.log(
      `[${game.roomCode}] ↩ Cup round ${round} finalized → lobby | calendarIndex=${game.calendarIndex} | nextEvent=${game.currentEvent?.type ?? "none"}`,
    );
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
        // Only require acks from coaches whose teams are still in a current fixture.
        // Eliminated coaches are observers: their client may not send cupExtraTimeDone,
        // which would otherwise block the gate for the full 45s timeout.
        const inFixture = (
          Object.values(game.playersByName) as PlayerSession[]
        ).filter(
          (p) =>
            !!p.socketId &&
            game.currentFixtures.some(
              (f) => f.homeTeamId === p.teamId || f.awayTeamId === p.teamId,
            ),
        );
        // Fallback: if no human coach is in any fixture, use all connected coaches.
        const relevant =
          inFixture.length > 0
            ? inFixture
            : (Object.values(game.playersByName) as PlayerSession[]).filter(
                (p) => !!p.socketId,
              );
        if (
          relevant.length > 0 &&
          relevant.every((p) => acks.has(p.socketId as string))
        ) {
          clearTimeout(timeout);
          delete game._cupETAnimHandler;
          resolve();
        }
      };
    });
  }

  // ─── RECONNECT HELPERS ───────────────────────────────────────────────────────

  /**
   * Emit the current phase state to a reconnecting socket.
   * Cup lobby: re-emit the draw so the client can show the matchup.
   */
  function emitCurrentPhaseToSocket(game: ActiveGame, socket: any) {
    console.log(
      `[${game.roomCode}] 🔌 emitCurrentPhaseToSocket | phase=${game.gamePhase} | eventType=${game.currentEvent?.type ?? "none"}`,
    );

    // Lobby during a cup week: re-emit draw so reconnecting coach sees matchup
    if (
      game.gamePhase === "lobby" &&
      game.currentEvent?.type === "cup" &&
      game.currentFixtures.length > 0
    ) {
      const coachName = game.socketToName[socket.id];
      if (coachName && game.cupDrawSeenBy.has(coachName)) {
        return;
      }
      const entry = game.currentEvent as any;
      const connectedPlayers = getPlayerList(game);
      const humanTeamIds = new Set(connectedPlayers.map((p) => p.teamId));
      const humanInCup = game.cupTeamIds.some((id) => humanTeamIds.has(id));
      socket.emit("cupDrawStart", {
        round: entry.round,
        roundName: entry.roundName,
        fixtures: game.currentFixtures.map((f: any) => ({
          homeTeam: f.homeTeam,
          awayTeam: f.awayTeam,
        })),
        humanInCup,
        season: game.season,
      });
      if (coachName) {
        game.cupDrawSeenBy.add(coachName);
      }
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

    if (game.gamePhase === "match_et_gate") {
      if (game.lastHalftimePayload) {
        socket.emit("cupETHalfTime", game.lastHalftimePayload);
      }
      return;
    }

    // Recovery for match_extra_time: tell the reconnecting client that ET is running
    if (
      game.gamePhase === "match_extra_time" &&
      game.currentFixtures?.length > 0
    ) {
      const entry = game.currentEvent as any;
      socket.emit("matchReplay", {
        // Default to 91 because extra time starts at minute 91
        minute: game.liveMinute ?? 91,
        matchweek: game.matchweek,
        isCup: true,
        cupRoundName: entry?.roundName || null,
        fixtures: game.currentFixtures.map((f: any) => ({
          homeTeamId: f.homeTeamId,
          awayTeamId: f.awayTeamId,
          homeTeam: f.homeTeam || null,
          awayTeam: f.awayTeam || null,
          finalHomeGoals: f.finalHomeGoals || 0,
          finalAwayGoals: f.finalAwayGoals || 0,
          events: (f.events || []).slice(),
          homeLineup: f.homeLineup || [],
          awayLineup: f.awayLineup || [],
          attendance: f.attendance || null,
        })),
      });
      return;
    }

    // Recovery for match_finalizing: tell the client we are wrapping up
    if (game.gamePhase === "match_finalizing") {
      socket.emit("gameState", {
        gamePhase: game.gamePhase,
        calendarIndex: game.calendarIndex,
        currentEvent: game.currentEvent,
        matchweek: game.matchweek,
        year: game.year,
      });
      return;
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
