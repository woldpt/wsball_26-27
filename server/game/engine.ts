import type { ActiveGame, Tactic } from "../types";

type Db = any;
type PlayerRow = any;
type MatchFixture = any;

function pickBestPlayer(players: PlayerRow[] = []) {
  if (!players.length) return null;
  return [...players].sort((a, b) => b.skill - a.skill)[0];
}

/**
 * Weighted random pick for goal scorer.
 * Stars (MED/ATA with is_star=1) get a 3× weight so they score more often.
 */
function weightedPickScorer(players: PlayerRow[] = []) {
  if (!players.length) return null;
  const weights = players.map((p) => (p.is_star ? 3 : 1));
  const total = weights.reduce((s, w) => s + w, 0);
  let r = Math.random() * total;
  for (let i = 0; i < players.length; i++) {
    r -= weights[i];
    if (r <= 0) return players[i];
  }
  return players[players.length - 1];
}

function isPlayerAvailable(player: PlayerRow, currentMatchweek = 1) {
  const suspensionUntil = player.suspension_until_matchweek || 0;
  const injuryUntil = player.injury_until_matchweek || 0;
  return currentMatchweek > suspensionUntil && currentMatchweek > injuryUntil;
}

async function getTeamSquad(
  db: Db,
  teamId: number,
  tactic: Tactic | null,
  currentMatchweek = 1,
): Promise<PlayerRow[]> {
  return new Promise<PlayerRow[]>((resolve, reject) => {
    db.all("SELECT * FROM players WHERE team_id = ?", [teamId], (err, rows) => {
      if (err) return reject(err);

      const availableRows = (rows || []).filter((p) =>
        isPlayerAvailable(p, currentMatchweek),
      );

      // If tactic has explicit position assignments, use them
      if (tactic && tactic.positions) {
        const lineup = availableRows.filter(
          (p) => tactic.positions[p.id] === "Titular",
        );
        if (lineup.length === 11) return resolve(lineup);
      }

      // Auto-pick best 11 based on formation
      const sorted = [...availableRows].sort((a, b) => b.skill - a.skill);
      const lineup = [];
      const formationStr =
        tactic && tactic.formation ? tactic.formation : "4-4-2";
      const parts = formationStr.split("-");
      const positions = {
        GR: 1,
        DEF: parseInt(parts[0], 10),
        MED: parseInt(parts[1], 10),
        ATA: parseInt(parts[2], 10),
      };
      const currentPos = { GR: 0, DEF: 0, MED: 0, ATA: 0 };

      sorted.forEach((p) => {
        if (currentPos[p.position] < positions[p.position]) {
          lineup.push(p);
          currentPos[p.position]++;
        }
      });

      if (lineup.length < 11) {
        const missing = 11 - lineup.length;
        // Never fill with a 2nd GK — that causes the 2-GK bug
        const remaining = sorted.filter(
          (p) => !lineup.includes(p) && p.position !== "GR",
        );
        lineup.push(...remaining.slice(0, missing));
      }

      resolve(lineup);
    });
  });
}

async function generateFixturesForDivision(
  db: Db,
  division: number,
  matchweek: number,
  userTeamId?: number,
): Promise<MatchFixture[]> {
  return new Promise<MatchFixture[]>((resolve) => {
    db.all(
      "SELECT id FROM teams WHERE division = ? ORDER BY id",
      [division],
      (err, teams) => {
        if (err || !teams || teams.length < 2) return resolve([]);

        const n = teams.length;
        const totalRounds = n - 1;
        const totalMatchweeks = totalRounds * 2;
        const normMw = ((matchweek - 1) % totalMatchweeks) + 1;
        const isSecondLeg = normMw > totalRounds;
        const round = isSecondLeg ? normMw - totalRounds - 1 : normMw - 1;
        const rotating = teams.slice(1);

        const rotated = [];
        for (let i = 0; i < rotating.length; i++) {
          rotated.push(rotating[(i + round) % rotating.length]);
        }

        const allTeams = [teams[0], ...rotated];
        const fixtures = [];

        for (let i = 0; i < n / 2; i++) {
          let homeTeam = allTeams[i];
          let awayTeam = allTeams[n - 1 - i];
          if (isSecondLeg) {
            [homeTeam, awayTeam] = [awayTeam, homeTeam];
          }

          fixtures.push({
            homeTeamId: homeTeam.id,
            awayTeamId: awayTeam.id,
            finalHomeGoals: 0,
            finalAwayGoals: 0,
            events: [],
          });
        }

        // Ensure home/away alternation for userTeam across the season.
        // Compute, for each first-leg round, whether a swap is needed so
        // the user's team never plays two consecutive home (or away) games.
        if (userTeamId) {
          const swapMap: Record<number, boolean> = {};
          let prevCorrectedHome: boolean | null = null;
          for (let r = 0; r < totalRounds; r++) {
            const rot = rotating.map(
              (_, i) => rotating[(i + r) % rotating.length],
            );
            const all = [teams[0], ...rot];
            let rawIsHome: boolean | null = null;
            for (let i = 0; i < Math.floor(n / 2); i++) {
              if (all[i].id === userTeamId) {
                rawIsHome = true;
                break;
              }
              if (all[n - 1 - i].id === userTeamId) {
                rawIsHome = false;
                break;
              }
            }
            if (rawIsHome === null) continue;
            const needsSwap =
              prevCorrectedHome !== null && rawIsHome === prevCorrectedHome;
            swapMap[r] = needsSwap;
            prevCorrectedHome = needsSwap ? !rawIsHome : rawIsHome;
          }

          if (swapMap[round]) {
            const idx = fixtures.findIndex(
              (f) => f.homeTeamId === userTeamId || f.awayTeamId === userTeamId,
            );
            if (idx >= 0) {
              const f = fixtures[idx];
              [f.homeTeamId, f.awayTeamId] = [f.awayTeamId, f.homeTeamId];
            }
          }
        }

        resolve(fixtures);
      },
    );
  });
}

function getCurrentPlayerState(game: ActiveGame, teamId: number) {
  return Object.values(game.playersByName).find(
    (p) => p.teamId === teamId && p.socketId,
  );
}

function waitForMatchAction({
  game,
  io,
  type,
  teamId,
  payload,
  timeoutMs,
  fallback,
}: {
  game: ActiveGame;
  io: any;
  type: string;
  teamId: number;
  payload: Record<string, unknown>;
  timeoutMs: number;
  fallback: () => any;
}): Promise<{ choice: any; source: string }> {
  const humanCoach = getCurrentPlayerState(game, teamId);
  if (!humanCoach) {
    return Promise.resolve({ choice: fallback(), source: "auto" });
  }

  return new Promise<{ choice: any; source: string }>((resolve) => {
    const actionId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const finalize = (choice, source = "auto") => {
      const pendingAction: any = game.pendingMatchAction;
      if (pendingAction && pendingAction.actionId === actionId) {
        clearTimeout(pendingAction.timer);
        game.pendingMatchAction = null;
      }
      io.to(game.roomCode).emit("matchActionResolved", {
        actionId,
        teamId,
        source,
      });
      resolve({ choice, source });
    };

    const timer = setTimeout(() => {
      finalize(fallback(), "auto");
    }, timeoutMs);

    game.pendingMatchAction = {
      actionId,
      type,
      teamId,
      timer,
      finalize,
      fallback,
    };

    io.to(game.roomCode).emit("matchActionRequired", {
      actionId,
      type,
      teamId,
      ...payload,
    });
  });
}

function getAvailableBench(teamSquad: PlayerRow[], lineupIds: Set<number>) {
  return teamSquad.filter((p) => !lineupIds.has(p.id));
}

function selectPenaltyTaker(squad: PlayerRow[] = []) {
  return pickBestPlayer(squad) || null;
}

function clampSkill(value: number) {
  return Math.max(0, Math.min(50, Math.round(value)));
}

function normaliseStyle(style: unknown) {
  const raw = String(style || "Balanced")
    .trim()
    .toUpperCase();
  if (raw === "DEFENSIVO" || raw === "DEFENSIVE") return "DEFENSIVO";
  if (raw === "OFENSIVO" || raw === "OFFENSIVE") return "OFENSIVO";
  return "EQUILIBRADO";
}

function getAggressivenessValue(player: PlayerRow) {
  if (typeof player?.aggressiveness === "number") {
    return Math.max(1, Math.min(5, Math.round(player.aggressiveness)));
  }

  const AGG_TIER_VALUES = {
    Cordeirinho: 1,
    Cavalheiro: 2,
    "Fair Play": 3,
    Caneleiro: 4,
    Caceteiro: 5,
  };

  return AGG_TIER_VALUES[player?.aggressiveness] ?? 3;
}

function average(values: number[] = []) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

async function applyInjuryEvent({
  db,
  fixture,
  teamSide,
  squad,
  fullRoster,
  lineupIds,
  currentMatchweek,
  io,
  game,
}: {
  db: Db;
  fixture: MatchFixture;
  teamSide: "home" | "away";
  squad: PlayerRow[];
  fullRoster: PlayerRow[];
  lineupIds: Set<number>;
  currentMatchweek: number;
  io: any;
  game: ActiveGame;
}) {
  if (!squad.length) return { replaced: false, injuredPlayer: null };

  const injuredPlayer = squad[Math.floor(Math.random() * squad.length)];
  const severityRoll = Math.random();
  let injuryWeeks;
  let injuryLabel;
  if (severityRoll < 0.1) {
    // Grave: 3–8 semanas, incomum
    injuryWeeks = 3 + Math.floor(Math.random() * 6);
    injuryLabel = "grave";
  } else {
    // Leve: 1 semana (afasta da próxima convocatória), comum
    injuryWeeks = 1;
    injuryLabel = "leve";
  }

  const injuryUntil = currentMatchweek + injuryWeeks;
  const qualityLoss =
    injuryLabel === "grave" ? 2 + Math.floor(Math.random() * 4) : 0;
  db.run(
    "UPDATE players SET injuries = injuries + 1, career_injuries = career_injuries + 1, prev_skill = skill, skill = MAX(0, skill - ?), injury_until_matchweek = CASE WHEN injury_until_matchweek > ? THEN injury_until_matchweek ELSE ? END WHERE id = ?",
    [qualityLoss, injuryUntil, injuryUntil, injuredPlayer.id],
  );

  fixture.events.push({
    minute: fixture._minute,
    type: "injury",
    team: teamSide,
    emoji: "🚑",
    playerId: injuredPlayer.id,
    playerName: injuredPlayer.name,
    text: `[${fixture._minute}'] 🚑 Lesão! ${injuredPlayer.name}`,
    severity: injuryLabel,
  });

  const teamId = teamSide === "home" ? fixture.homeTeamId : fixture.awayTeamId;

  // Only show players who were explicitly chosen as "Suplente" in the pre-match tactic.
  // This prevents listing the full squad and showing players that weren't on the bench.
  const tactic = teamSide === "home" ? fixture._t1 : fixture._t2;
  const tacticPositions: Record<number, string> = tactic?.positions || {};
  const benchIds = new Set(
    Object.entries(tacticPositions)
      .filter(([, status]) => status === "Suplente")
      .map(([id]) => Number(id)),
  );
  const roster = fullRoster || squad;
  const availableBench = roster.filter(
    (p) => !lineupIds.has(p.id) && (benchIds.size === 0 || benchIds.has(p.id)),
  );

  // If the injured player is a goalkeeper, prefer substituting with another goalkeeper
  let substituteCandidates = availableBench;
  if (injuredPlayer.position === "GR") {
    const grBench = availableBench.filter((p) => p.position === "GR");
    substituteCandidates = grBench.length > 0 ? grBench : availableBench;
  }

  const fallback = () => pickBestPlayer(substituteCandidates)?.id || null;
  const result = await waitForMatchAction({
    game,
    io,
    type: "injury",
    teamId,
    payload: {
      minute: fixture._minute,
      teamId,
      injuredPlayer: {
        id: injuredPlayer.id,
        name: injuredPlayer.name,
        position: injuredPlayer.position,
      },
      benchPlayers: substituteCandidates.map((p) => ({
        id: p.id,
        name: p.name,
        position: p.position,
        skill: p.skill,
      })),
      currentScore: {
        home: fixture.finalHomeGoals,
        away: fixture.finalAwayGoals,
      },
    },
    timeoutMs: 60000,
    fallback,
  });

  const replacement =
    result.choice && availableBench.find((p) => p.id === result.choice);
  if (replacement) {
    const idx = squad.findIndex((p) => p.id === injuredPlayer.id);
    if (idx > -1) squad.splice(idx, 1, replacement);
    lineupIds.delete(injuredPlayer.id);
    lineupIds.add(replacement.id);
    fixture.events.push({
      minute: fixture._minute,
      type: "substitution",
      team: teamSide,
      emoji: "🔁",
      playerId: replacement.id,
      playerName: replacement.name,
      text: `[${fixture._minute}'] 🔁 Substituição: ${injuredPlayer.name} -> ${replacement.name}`,
    });
    return { replaced: true, injuredPlayer, replacement };
  }

  const idx = squad.findIndex((p) => p.id === injuredPlayer.id);
  if (idx > -1) squad.splice(idx, 1);
  lineupIds.delete(injuredPlayer.id);
  return { replaced: false, injuredPlayer, replacement: null };
}

async function applyPenaltyEvent({
  db,
  fixture,
  teamSide,
  squad,
  currentMatchweek,
  io,
  game,
}: {
  db: Db;
  fixture: MatchFixture;
  teamSide: "home" | "away";
  squad: PlayerRow[];
  currentMatchweek: number;
  io: any;
  game: ActiveGame;
}) {
  const teamId = teamSide === "home" ? fixture.homeTeamId : fixture.awayTeamId;
  const takerCandidates = squad.filter((p) =>
    isPlayerAvailable(p, currentMatchweek),
  );
  const fallback = () => selectPenaltyTaker(takerCandidates)?.id || null;
  const result = await waitForMatchAction({
    game,
    io,
    type: "penalty",
    teamId,
    payload: {
      minute: fixture._minute,
      teamId,
      takerCandidates: takerCandidates.map((p) => ({
        id: p.id,
        name: p.name,
        position: p.position,
        skill: p.skill,
      })),
      currentScore: {
        home: fixture.finalHomeGoals,
        away: fixture.finalAwayGoals,
      },
    },
    timeoutMs: 12000,
    fallback,
  });

  const taker =
    result.choice && takerCandidates.find((p) => p.id === result.choice)
      ? takerCandidates.find((p) => p.id === result.choice)
      : fallback();
  if (!taker) return;

  const penaltySkill = taker.skill || 0;
  const goalChance = Math.max(
    0.35,
    Math.min(0.9, 0.55 + (penaltySkill - 50) / 120),
  );
  const scored = Math.random() < goalChance;

  if (scored) {
    if (teamSide === "home") fixture.finalHomeGoals++;
    else fixture.finalAwayGoals++;
    db.run(
      "UPDATE players SET goals = goals + 1, career_goals = career_goals + 1 WHERE id = ?",
      [taker.id],
    );
    fixture.events.push({
      minute: fixture._minute,
      type: "penalty_goal",
      team: teamSide,
      emoji: "⚽",
      playerId: taker.id,
      playerName: taker.name,
      text: `[${fixture._minute}'] ⚽ PENÁLTI — GOLO!!! ${taker.name}`,
      penaltySuspense: true,
      penaltyResult: "GOLO!!!",
    });
  } else {
    const missTypes = [
      "DEFENDEU!",
      "AO POSTE!",
      "AO LADO!",
      "PANENKA FALHADO!",
    ];
    const missType = missTypes[Math.floor(Math.random() * missTypes.length)];
    fixture.events.push({
      minute: fixture._minute,
      type: "penalty_miss",
      team: teamSide,
      emoji: "❌",
      playerId: taker.id,
      playerName: taker.name,
      text: `[${fixture._minute}'] ❌ PENÁLTI — ${missType} ${taker.name}`,
      penaltySuspense: true,
      penaltyResult: missType,
    });
  }
}

async function simulateMatchSegment(
  db: Db,
  fixture: MatchFixture,
  homeTactic: Tactic | null,
  awayTactic: Tactic | null,
  startMin: number,
  endMin: number,
  context: any = {},
) {
  const currentMatchweek = context.matchweek || 1;
  const io = context.io;
  const game = context.game;

  let homeSquad;
  if (fixture._homeSquad) {
    homeSquad = fixture._homeSquad;
  } else if (fixture.homeLineup && fixture.homeLineup.length > 0) {
    const homeIds = new Set(fixture.homeLineup.map((p: any) => p.id));
    for (const e of fixture.events || []) {
      if (e.team === "home") {
        if ((e.type === "red" || e.type === "injury") && e.playerId)
          homeIds.delete(e.playerId);
        if (e.type === "substitution" && e.playerId) homeIds.add(e.playerId);
      }
    }
    homeSquad = await new Promise<any[]>((resolve) => {
      const ids = Array.from(homeIds);
      const ph = ids.length > 0 ? ids.map(() => "?").join(",") : "0";
      db.all(
        `SELECT * FROM players WHERE id IN (${ph})`,
        ids.length > 0 ? ids : [],
        (_, r) => resolve(r || []),
      );
    });
    fixture._homeSquad = homeSquad;
  } else {
    homeSquad = await getTeamSquad(
      db,
      fixture.homeTeamId,
      homeTactic,
      currentMatchweek,
    );
    fixture._homeSquad = homeSquad;
  }

  let awaySquad;
  if (fixture._awaySquad) {
    awaySquad = fixture._awaySquad;
  } else if (fixture.awayLineup && fixture.awayLineup.length > 0) {
    const awayIds = new Set(fixture.awayLineup.map((p: any) => p.id));
    for (const e of fixture.events || []) {
      if (e.team === "away") {
        if ((e.type === "red" || e.type === "injury") && e.playerId)
          awayIds.delete(e.playerId);
        if (e.type === "substitution" && e.playerId) awayIds.add(e.playerId);
      }
    }
    awaySquad = await new Promise<any[]>((resolve) => {
      const ids = Array.from(awayIds);
      const ph = ids.length > 0 ? ids.map(() => "?").join(",") : "0";
      db.all(
        `SELECT * FROM players WHERE id IN (${ph})`,
        ids.length > 0 ? ids : [],
        (_, r) => resolve(r || []),
      );
    });
    fixture._awaySquad = awaySquad;
  } else {
    awaySquad = await getTeamSquad(
      db,
      fixture.awayTeamId,
      awayTactic,
      currentMatchweek,
    );
    fixture._awaySquad = awaySquad;
  }

  if (!fixture._yellowCards) {
    fixture._yellowCards = {};
  }

  // Track games played — increment once per match (startMin === 0 only)
  if (startMin === 0) {
    const participantIds = [
      ...Array.from(new Set((homeSquad || []).map((p: any) => p.id))),
      ...Array.from(new Set((awaySquad || []).map((p: any) => p.id))),
    ].filter(Boolean);
    if (participantIds.length > 0) {
      const ph = participantIds.map(() => "?").join(",");
      db.run(
        `UPDATE players SET games_played = games_played + 1 WHERE id IN (${ph})`,
        participantIds,
      );
    }
  }

  // Load team morale values (cached on fixture for minute-by-minute mode)
  let homeMorale: number, awayMorale: number;
  if (fixture._homeMorale !== undefined) {
    homeMorale = fixture._homeMorale;
    awayMorale = fixture._awayMorale;
  } else {
    [homeMorale, awayMorale] = await Promise.all([
      new Promise<number>((res) =>
        db.get(
          "SELECT morale FROM teams WHERE id = ?",
          [fixture.homeTeamId],
          (err, row) => res(row && row.morale != null ? row.morale : 50),
        ),
      ),
      new Promise<number>((res) =>
        db.get(
          "SELECT morale FROM teams WHERE id = ?",
          [fixture.awayTeamId],
          (err, row) => res(row && row.morale != null ? row.morale : 50),
        ),
      ),
    ]);
    fixture._homeMorale = homeMorale;
    fixture._awayMorale = awayMorale;
  }

  // Load full rosters for bench availability during injuries (cached on fixture)
  let homeFullRoster: PlayerRow[], awayFullRoster: PlayerRow[];
  if (fixture._homeFullRoster) {
    homeFullRoster = fixture._homeFullRoster;
    awayFullRoster = fixture._awayFullRoster;
  } else {
    homeFullRoster = await new Promise<PlayerRow[]>((resolve, reject) => {
      db.all(
        "SELECT * FROM players WHERE team_id = ?",
        [fixture.homeTeamId],
        (err, rows) => {
          if (err) return reject(err);
          resolve(
            (rows || []).filter((p) => isPlayerAvailable(p, currentMatchweek)),
          );
        },
      );
    });
    awayFullRoster = await new Promise<PlayerRow[]>((resolve, reject) => {
      db.all(
        "SELECT * FROM players WHERE team_id = ?",
        [fixture.awayTeamId],
        (err, rows) => {
          if (err) return reject(err);
          resolve(
            (rows || []).filter((p) => isPlayerAvailable(p, currentMatchweek)),
          );
        },
      );
    });
    fixture._homeFullRoster = homeFullRoster;
    fixture._awayFullRoster = awayFullRoster;
  }

  // Snapshot the lineups for this segment so clients can display "who was on the pitch"
  const lineupSnapshot = (squad: any[]) =>
    squad.map((p) => ({
      id: p.id,
      name: p.name,
      position: p.position,
      is_star: p.is_star || 0,
      skill: p.skill,
    }));
  if (!fixture.homeLineup || fixture.homeLineup.length === 0) {
    fixture.homeLineup = lineupSnapshot(homeSquad);
    fixture.awayLineup = lineupSnapshot(awaySquad);
  }

  // Persistent lineup tracking across all minutes in this segment
  const homeLineupIds = new Set<number>(homeSquad.map((p: any) => p.id));
  const awayLineupIds = new Set<number>(awaySquad.map((p: any) => p.id));

  const getPower = (squad, tactic, morale = 50) => {
    const formation = String(tactic?.formation || "4-4-2");
    const style = normaliseStyle(tactic?.style);

    const midfielders = squad.filter((p) => p.position === "MED");
    const forwards = squad.filter((p) => p.position === "ATA");
    const defenders = squad.filter((p) => p.position === "DEF");
    const keepers = squad.filter((p) => p.position === "GR");

    const avgMidfielderQuality = average(midfielders.map((p) => p.skill || 0));
    const avgForwardQuality = average(forwards.map((p) => p.skill || 0));
    const avgDefenderQuality = average(defenders.map((p) => p.skill || 0));
    const avgKeeperQuality = average(keepers.map((p) => p.skill || 0));

    const formationOffensiveFactors = {
      "4-2-4": 1.15,
      "3-4-3": 1.12,
      "4-3-3": 1.08,
      "3-5-2": 1.05,
      "4-4-2": 1.0,
      "4-5-1": 0.9,
      "5-3-2": 0.85,
      "5-4-1": 0.8,
    };

    const formationDefensiveFactors = {
      "5-4-1": 1.25,
      "5-3-2": 1.2,
      "4-5-1": 1.1,
      "4-4-2": 1.0,
      "3-5-2": 0.95,
      "4-3-3": 0.9,
      "3-4-3": 0.85,
      "4-2-4": 0.75,
    };

    const styleOffensiveFactor = {
      DEFENSIVO: 0.85,
      EQUILIBRADO: 1.0,
      OFENSIVO: 1.15,
    };

    const styleDefensiveFactor = {
      DEFENSIVO: 1.15,
      EQUILIBRADO: 1.0,
      OFENSIVO: 0.85,
    };

    const formationAttack = formationOffensiveFactors[formation] ?? 1.0;
    const formationDefense = formationDefensiveFactors[formation] ?? 1.0;

    const moraleFactor = 1 + (morale - 50) * 0.005;

    const attackBase = avgMidfielderQuality * 0.4 + avgForwardQuality * 0.6;
    const defenseBase = avgDefenderQuality * 0.6 + avgKeeperQuality * 0.4;

    return {
      attack:
        attackBase *
        formationAttack *
        Math.max(0.5, Math.min(1.5, moraleFactor)) *
        styleOffensiveFactor[style],
      defense: defenseBase * formationDefense,
      style,
      squad,
    };
  };

  const home = getPower(homeSquad, homeTactic, homeMorale);
  const away = getPower(awaySquad, awayTactic, awayMorale);

  for (let minute = startMin; minute <= endMin; minute++) {
    fixture._minute = minute;

    const currentHome = getPower(home.squad, homeTactic, homeMorale);
    const currentAway = getPower(away.squad, awayTactic, awayMorale);

    const maybeOpenPlayGoal = (attackingSide) => {
      const attacking = attackingSide === "home" ? currentHome : currentAway;
      const defending = attackingSide === "home" ? currentAway : currentHome;
      const isHome = attackingSide === "home";

      // Apply opponent style factor to attack per README spec:
      // força_ofensiva *= (1 / estilo_factor[adversário_instrução])
      const STYLE_FACTORS = {
        DEFENSIVO: 0.85,
        EQUILIBRADO: 1.0,
        OFENSIVO: 1.15,
      };
      const opponentStyleFactor = STYLE_FACTORS[defending.style] || 1.0;
      const adjustedAttack =
        (attacking.attack || 1) * (1.0 / opponentStyleFactor);

      const ratio =
        adjustedAttack / (adjustedAttack + (defending.defense || 1) * 2);
        let probGoal = ratio * 0.03; // Base chance of a goal in any given minute, scaled by power ratio
      probGoal *= isHome ? 1.05 : 0.95;

      // Ego conflict penalty: 3+ craques no onze titular reduzem probabilidade
      const scoringSquad = isHome ? home.squad : away.squad;
      const craquesInXI = scoringSquad.filter(
        (p) => p.is_star && (p.position === "MED" || p.position === "ATA"),
      ).length;
      if (craquesInXI > 2) {
        const egoPenalty = Math.min(0.3, (craquesInXI - 2) * 0.1);
        probGoal *= 1.0 - egoPenalty;
      }

      if (Math.random() >= probGoal) return;

      const scorers = scoringSquad.filter(
        (p) => p.position === "ATA" || p.position === "MED",
      );
      const scorer =
        scorers.length > 0 ? weightedPickScorer(scorers) : scoringSquad[0];

      if (isHome) fixture.finalHomeGoals++;
      else fixture.finalAwayGoals++;

      const decisiveChance = Math.min(0.6, craquesInXI * 0.2);
      const isDecisive = Math.random() < decisiveChance;

      fixture.events.push({
        minute,
        type: "goal",
        team: attackingSide,
        emoji: "⚽",
        playerId: scorer ? scorer.id : null,
        playerName: scorer ? scorer.name : "Jogador",
        text: `[${minute}'] ⚽ GOLO! ${scorer ? scorer.name : "Jogador"}`,
        isDecisive,
      });

      if (scorer) {
        db.run(
          "UPDATE players SET goals = goals + 1, career_goals = career_goals + 1 WHERE id = ?",
          [scorer.id],
        );
      }
    };

    const penaltyChance = 0.002;
    if (Math.random() < penaltyChance) {
      const attackingSide = Math.random() < 0.5 ? "home" : "away";
      const attackingSquad = attackingSide === "home" ? home.squad : away.squad;
      await applyPenaltyEvent({
        db,
        fixture,
        teamSide: attackingSide,
        squad: attackingSquad,
        currentMatchweek,
        io,
        game,
      });
    }

    maybeOpenPlayGoal("home");
    maybeOpenPlayGoal("away");

    const homeAggAvg = average(
      home.squad.map((p) => getAggressivenessValue(p)),
    );
    const awayAggAvg = average(
      away.squad.map((p) => getAggressivenessValue(p)),
    );

    const emitCard = (isHomeCard: boolean) => {
      const squad = isHomeCard ? home.squad : away.squad;
      const side = isHomeCard ? "home" : "away";
      if (squad.length > 0) {
        const offender = squad[Math.floor(Math.random() * squad.length)];
        const offenderId = offender.id;

        const executeRedCard = () => {
          // Cartão vermelho — 2 jogos de suspensão
          db.run(
            "UPDATE players SET red_cards = red_cards + 1, career_reds = career_reds + 1, suspension_games = suspension_games + 2, suspension_until_matchweek = CASE WHEN suspension_until_matchweek > ? THEN suspension_until_matchweek ELSE ? END WHERE id = ?",
            [currentMatchweek + 2, currentMatchweek + 2, offender.id],
          );
          fixture.events.push({
            minute,
            type: "red",
            team: side,
            emoji: "🟥",
            playerId: offender.id,
            playerName: offender.name,
            text: `[${minute}'] 🟥 Vermelho! ${offender.name}`,
          });
          const idx = squad.findIndex((p: any) => p.id === offender.id);
          if (idx > -1) squad.splice(idx, 1);
        };

        if (fixture._yellowCards[offenderId] >= 1) {
          // If the player already has a yellow card, there's only a 15% chance this foul results in a second yellow (red).
          // Otherwise, it's just a warning/foul with no card given.
          if (Math.random() < 0.15) {
            executeRedCard();
          }
        } else if (Math.random() < 0.005) {
          // Straight red card chance lowered from 4% to 0.5% (more realistic)
          executeRedCard();
        } else {
          // Cartão amarelo — sem expulsão
          fixture._yellowCards[offenderId] =
            (fixture._yellowCards[offenderId] || 0) + 1;
          fixture.events.push({
            minute,
            type: "yellow",
            team: side,
            emoji: "🟨",
            playerId: offender.id,
            playerName: offender.name,
            text: `[${minute}'] 🟨 Amarelo! ${offender.name}`,
          });
        }
      }
    };

    const homeCardProb = 0.015 * (1 + (homeAggAvg - 3) * 0.1);
    const awayCardProb = 0.015 * (1 + (awayAggAvg - 3) * 0.1);
    if (Math.random() < homeCardProb) emitCard(true);
    if (Math.random() < awayCardProb) emitCard(false);

    const injuryChance = Math.random();
    if (injuryChance < 0.003) {
      const isHomeInjury = Math.random() > 0.5;
      const squad = isHomeInjury ? home.squad : away.squad;
      const side = isHomeInjury ? "home" : "away";
      const lineupIds = isHomeInjury ? homeLineupIds : awayLineupIds;
      const fullRoster = isHomeInjury ? homeFullRoster : awayFullRoster;
      if (squad.length > 0) {
        const injuryResult = await applyInjuryEvent({
          db,
          fixture,
          teamSide: side,
          squad,
          fullRoster,
          lineupIds,
          currentMatchweek,
          io,
          game,
        });
        if (injuryResult.replaced && side === "home") home.squad = squad;
        if (injuryResult.replaced && side === "away") away.squad = squad;
      }
    }
  }

  delete fixture._minute;
}

async function applyPostMatchQualityEvolution(
  db: Db,
  fixtures: MatchFixture[],
  currentMatchweek: number,
) {
  return new Promise<void>((resolve) => {
    const teamResults = new Map();
    for (const match of fixtures || []) {
      const homeResult =
        match.finalHomeGoals > match.finalAwayGoals
          ? "W"
          : match.finalHomeGoals < match.finalAwayGoals
            ? "L"
            : "D";
      const awayResult =
        match.finalAwayGoals > match.finalHomeGoals
          ? "W"
          : match.finalAwayGoals < match.finalHomeGoals
            ? "L"
            : "D";
      teamResults.set(match.homeTeamId, homeResult);
      teamResults.set(match.awayTeamId, awayResult);
    }

    // ── Morale update per team ─────────────────────────────────────────────
    const moraleUpdates = [];
    for (const [teamId, result] of teamResults.entries()) {
      let delta;
      if (result === "W") delta = 20;
      else if (result === "L") delta = -15;
      else delta = 5;
      moraleUpdates.push({ teamId, delta });
    }

    if (moraleUpdates.length > 0) {
      db.all(
        "SELECT id, morale FROM teams WHERE id IN (" +
          moraleUpdates.map(() => "?").join(",") +
          ")",
        moraleUpdates.map((u) => u.teamId),
        (err, rows) => {
          if (err || !rows) return;
          rows.forEach((row) => {
            const upd = moraleUpdates.find((u) => u.teamId === row.id);
            if (!upd) return;
            const newMorale = Math.max(
              0,
              Math.min(100, (row.morale ?? 50) + upd.delta),
            );
            db.run("UPDATE teams SET morale = ? WHERE id = ?", [
              newMorale,
              row.id,
            ]);
          });
        },
      );
    }

    // ── Player skill evolution ─────────────────────────────────────────────
    db.all(
      "SELECT id, team_id, skill, injury_until_matchweek, suspension_until_matchweek FROM players WHERE team_id IS NOT NULL ORDER BY team_id, id",
      (err, players) => {
        if (err || !players || players.length === 0) {
          resolve();
          return;
        }

        const teamGroups = new Map();
        for (const player of players) {
          if (!teamGroups.has(player.team_id))
            teamGroups.set(player.team_id, []);
          teamGroups.get(player.team_id).push(player);
        }

        const updates = [];
        for (const player of players) {
          if ((player.injury_until_matchweek || 0) >= currentMatchweek)
            continue;
          if ((player.suspension_until_matchweek || 0) >= currentMatchweek)
            continue;

          const group = teamGroups.get(player.team_id) || [];
          const avgSkill =
            group.reduce((sum, p) => sum + (p.skill || 0), 0) /
            Math.max(1, group.length);
          const diff = avgSkill - (player.skill || 0);
          const teamResult = teamResults.get(player.team_id) || "D";

          let delta = 0;

          // Convivência: jogadores abaixo da média do plantel evoluem ao
          // conviver com colegas mais talentosos (spec: "evoluem se
          // conviverem com jogadores mais talentosos")
          if (diff >= 3 && Math.random() < Math.min(0.22, 0.05 + diff / 80)) {
            delta += 1;
          }

          // Vitória reforça evolução para jogadores abaixo da média
          if (
            teamResult === "W" &&
            diff >= 0 &&
            Math.random() < Math.min(0.1, 0.02 + diff / 220)
          ) {
            delta += 1;
          }

          // Maus resultados: jogadores perdem qualidade se houver derrotas
          // (spec: "perdem qualidade se houver muitos maus resultados seguidos")
          // Jogadores acima da média do plantel são mais afectados
          if (teamResult === "L") {
            const lossPressure = Math.min(
              0.12,
              0.02 + Math.max(0, -diff) / 250,
            );
            if (Math.random() < lossPressure) delta -= 1;
          }

          // Empate contra equipa mais forte — pequena hipótese de evolução
          if (teamResult === "D" && diff >= 8 && Math.random() < 0.04) {
            delta += 1;
          }

          if (delta !== 0) {
            updates.push({
              id: player.id,
              skill: clampSkill((player.skill || 0) + delta),
            });
          }
        }

        if (updates.length === 0) {
          resolve();
          return;
        }

        let remaining = updates.length;
        db.serialize(() => {
          updates.forEach((update) => {
            db.run(
              "UPDATE players SET prev_skill = skill, skill = ? WHERE id = ?",
              [update.skill, update.id],
              () => {
                remaining -= 1;
                if (remaining === 0) resolve();
              },
            );
          });
        });
      },
    );
  });
}

module.exports = {
  simulateMatchSegment,
  getTeamSquad,
  generateFixturesForDivision,
  isPlayerAvailable,
  applyPostMatchQualityEvolution,
  simulateExtraTime,
  simulatePenaltyShootout,
};

// ─── EXTRA TIME ──────────────────────────────────────────────────────────────
// Simulates two 15-minute extra-time periods (91-105 and 106-120).
// Returns { firstHalfEvents, secondHalfEvents } after updating fixture goals.
async function simulateExtraTime(
  db: Db,
  fixture: MatchFixture,
  homeTactic: Tactic | null,
  awayTactic: Tactic | null,
  context: any,
) {
  // Detect whether a human coach is in this fixture so we can match the
  // real-time speed used by runMatchSegment (1 s/min for human, 100 ms for AI).
  const humanInFixture =
    context.game &&
    Object.values(context.game.playersByName).some(
      (p: any) =>
        p.socketId &&
        (p.teamId === fixture.homeTeamId || p.teamId === fixture.awayTeamId),
    );
  const msPerMinute = humanInFixture ? 1000 : 100;

  const emitMinuteUpdate = (minute: number) => {
    if (!context.io || !context.game) return;
    context.io.to(context.game.roomCode).emit("matchMinuteUpdate", {
      minute,
      fixtures: [
        {
          homeTeamId: fixture.homeTeamId,
          awayTeamId: fixture.awayTeamId,
          homeGoals: fixture.finalHomeGoals,
          awayGoals: fixture.finalAwayGoals,
          minuteEvents: (fixture.events || []).filter(
            (e: any) => e.minute === minute,
          ),
        },
      ],
    });
  };

  // ET first half: minutes 91–105, one minute at a time with real-time delays
  for (let minute = 91; minute <= 105; minute++) {
    await simulateMatchSegment(db, fixture, homeTactic, awayTactic, minute, minute, context);
    emitMinuteUpdate(minute);
    if (minute < 105) await new Promise((r) => setTimeout(r, msPerMinute));
  }

  const et1Events = fixture.events.filter(
    (e: any) => e.minute >= 91 && e.minute <= 105,
  );

  if (context.io && context.game) {
    context.io.to(context.game.roomCode).emit("extraTimeHalfTime", {
      fixture: {
        homeTeamId: fixture.homeTeamId,
        awayTeamId: fixture.awayTeamId,
        homeGoals: fixture.finalHomeGoals,
        awayGoals: fixture.finalAwayGoals,
      },
      events: et1Events,
    });
    // Give the client time to show the ET half-time state (3 s pause)
    await new Promise((r) => setTimeout(r, 3000));
    context.io.to(context.game.roomCode).emit("extraTimeSecondHalfStart", {
      fixture: {
        homeTeamId: fixture.homeTeamId,
        awayTeamId: fixture.awayTeamId,
        homeGoals: fixture.finalHomeGoals,
        awayGoals: fixture.finalAwayGoals,
      },
    });
  }

  // ET second half: minutes 106–120, one minute at a time with real-time delays
  for (let minute = 106; minute <= 120; minute++) {
    await simulateMatchSegment(db, fixture, homeTactic, awayTactic, minute, minute, context);
    emitMinuteUpdate(minute);
    if (minute < 120) await new Promise((r) => setTimeout(r, msPerMinute));
  }

  const et2Events = fixture.events.filter((e: any) => e.minute >= 106);

  return { et1Events, et2Events };
}

// ─── PENALTY SHOOTOUT ─────────────────────────────────────────────────────────
// Simulates a penalty shootout between two squads.
// Returns { homeGoals, awayGoals, kicks: [{team, playerName, scored}] }
function simulatePenaltyShootout(
  homeSquad: PlayerRow[],
  awaySquad: PlayerRow[],
) {
  const kicks = [];
  let homeGoals = 0;
  let awayGoals = 0;

  const pickShooter = (squad, usedIds) => {
    const available = squad.filter((p) => !usedIds.has(p.id));
    if (available.length === 0) {
      // Cycle through again if all have taken a penalty
      usedIds.clear();
      return squad[0] || null;
    }
    // Pick by skill
    available.sort((a, b) => b.skill - a.skill);
    return available[0];
  };

  const homeUsed = new Set();
  const awayUsed = new Set();
  const homeGK = homeSquad.find((p) => p.position === "GR") || homeSquad[0];
  const awayGK = awaySquad.find((p) => p.position === "GR") || awaySquad[0];

  const calcScoredChance = (taker, gk) => {
    const takerSkill = taker ? taker.skill || 10 : 10;
    const gkSkill = gk ? gk.skill || 10 : 10;
    return Math.max(0.3, Math.min(0.85, 0.6 + (takerSkill - gkSkill) / 120));
  };

  // 5 regulation rounds
  for (let round = 0; round < 5; round++) {
    const homeTaker = pickShooter(homeSquad, homeUsed);
    const awayTaker = pickShooter(awaySquad, awayUsed);
    if (homeTaker) homeUsed.add(homeTaker.id);
    if (awayTaker) awayUsed.add(awayTaker.id);

    const homeScored = Math.random() < calcScoredChance(homeTaker, awayGK);
    const awayScored = Math.random() < calcScoredChance(awayTaker, homeGK);

    if (homeScored) homeGoals++;
    if (awayScored) awayGoals++;

    kicks.push({
      team: "home",
      playerName: homeTaker ? homeTaker.name : "?",
      scored: homeScored,
    });
    kicks.push({
      team: "away",
      playerName: awayTaker ? awayTaker.name : "?",
      scored: awayScored,
    });

    // Early finish: if one side can't catch up after n rounds
    const remaining = 4 - round;
    if (homeGoals > awayGoals + remaining || awayGoals > homeGoals + remaining)
      break;
  }

  // Sudden death if still tied
  let sdRound = 0;
  while (homeGoals === awayGoals && sdRound < 20) {
    sdRound++;
    const homeTaker = pickShooter(homeSquad, homeUsed);
    const awayTaker = pickShooter(awaySquad, awayUsed);
    if (homeTaker) homeUsed.add(homeTaker.id);
    if (awayTaker) awayUsed.add(awayTaker.id);

    const homeScored = Math.random() < calcScoredChance(homeTaker, awayGK);
    const awayScored = Math.random() < calcScoredChance(awayTaker, homeGK);

    if (homeScored) homeGoals++;
    if (awayScored) awayGoals++;

    kicks.push({
      team: "home",
      playerName: homeTaker ? homeTaker.name : "?",
      scored: homeScored,
      suddenDeath: true,
    });
    kicks.push({
      team: "away",
      playerName: awayTaker ? awayTaker.name : "?",
      scored: awayScored,
      suddenDeath: true,
    });

    if (homeScored !== awayScored) break; // One scored, other didn't → winner decided
  }

  // Tiebreak failsafe
  if (homeGoals === awayGoals) homeGoals++;

  return { homeGoals, awayGoals, kicks };
}
