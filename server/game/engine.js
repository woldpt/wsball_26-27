function pickBestPlayer(players = []) {
  if (!players.length) return null;
  return [...players].sort((a, b) => b.skill - a.skill)[0];
}

/**
 * Weighted random pick for goal scorer.
 * Stars (MID/ATK with is_star=1) get a 3× weight so they score more often.
 */
function weightedPickScorer(players = []) {
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

function isPlayerAvailable(player, currentMatchweek = 1) {
  const suspensionUntil = player.suspension_until_matchweek || 0;
  const injuryUntil = player.injury_until_matchweek || 0;
  return currentMatchweek > suspensionUntil && currentMatchweek > injuryUntil;
}

async function getTeamSquad(db, teamId, tactic, currentMatchweek = 1) {
  return new Promise((resolve, reject) => {
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
        GK: 1,
        DEF: parseInt(parts[0], 10),
        MID: parseInt(parts[1], 10),
        ATK: parseInt(parts[2], 10),
      };
      const currentPos = { GK: 0, DEF: 0, MID: 0, ATK: 0 };

      sorted.forEach((p) => {
        if (currentPos[p.position] < positions[p.position]) {
          lineup.push(p);
          currentPos[p.position]++;
        }
      });

      if (lineup.length < 11) {
        const missing = 11 - lineup.length;
        const remaining = sorted.filter((p) => !lineup.includes(p));
        lineup.push(...remaining.slice(0, missing));
      }

      resolve(lineup);
    });
  });
}

async function generateFixturesForDivision(db, division, matchweek) {
  return new Promise((resolve) => {
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

        resolve(fixtures);
      },
    );
  });
}

function getCurrentPlayerState(game, teamId) {
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
}) {
  const humanCoach = getCurrentPlayerState(game, teamId);
  if (!humanCoach) {
    return Promise.resolve({ choice: fallback(), source: "auto" });
  }

  return new Promise((resolve) => {
    const actionId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const finalize = (choice, source = "auto") => {
      if (
        game.pendingMatchAction &&
        game.pendingMatchAction.actionId === actionId
      ) {
        clearTimeout(game.pendingMatchAction.timer);
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

function getAvailableBench(teamSquad, lineupIds) {
  return teamSquad.filter((p) => !lineupIds.has(p.id));
}

function selectPenaltyTaker(squad = []) {
  return pickBestPlayer(squad) || null;
}

function clampSkill(value) {
  return Math.max(0, Math.min(50, Math.round(value)));
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
    "UPDATE players SET injuries = injuries + 1, skill = MAX(0, skill - ?), injury_until_matchweek = CASE WHEN injury_until_matchweek > ? THEN injury_until_matchweek ELSE ? END WHERE id = ?",
    [qualityLoss, injuryUntil, injuryUntil, injuredPlayer.id],
  );

  fixture.events.push({
    minute: fixture._minute,
    type: "injury",
    team: teamSide,
    emoji: "❌",
    playerId: injuredPlayer.id,
    playerName: injuredPlayer.name,
    text: `[${fixture._minute}'] ❌ Lesão! ${injuredPlayer.name}`,
    severity: injuryLabel,
  });

  const teamId = teamSide === "home" ? fixture.homeTeamId : fixture.awayTeamId;
  const availableBench = getAvailableBench(fullRoster || squad, lineupIds);
  const fallback = () => pickBestPlayer(availableBench)?.id || null;
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
      benchPlayers: availableBench.map((p) => ({
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
    db.run("UPDATE players SET goals = goals + 1 WHERE id = ?", [taker.id]);
    fixture.events.push({
      minute: fixture._minute,
      type: "penalty_goal",
      team: teamSide,
      emoji: "⚽",
      playerId: taker.id,
      playerName: taker.name,
      text: `[${fixture._minute}'] ⚽ PENÁLTI! ${taker.name}`,
    });
  } else {
    fixture.events.push({
      minute: fixture._minute,
      type: "penalty_miss",
      team: teamSide,
      emoji: "❌",
      playerId: taker.id,
      playerName: taker.name,
      text: `[${fixture._minute}'] ❌ PENÁLTI falhado! ${taker.name}`,
    });
  }
}

async function simulateMatchSegment(
  db,
  fixture,
  homeTactic,
  awayTactic,
  startMin,
  endMin,
  context = {},
) {
  const currentMatchweek = context.matchweek || 1;
  const io = context.io;
  const game = context.game;

  const homeSquad = await getTeamSquad(
    db,
    fixture.homeTeamId,
    homeTactic,
    currentMatchweek,
  );
  const awaySquad = await getTeamSquad(
    db,
    fixture.awayTeamId,
    awayTactic,
    currentMatchweek,
  );

  // Load team morale values
  const [homeMorale, awayMorale] = await Promise.all([
    new Promise((res) =>
      db.get(
        "SELECT morale FROM teams WHERE id = ?",
        [fixture.homeTeamId],
        (err, row) => res(row && row.morale != null ? row.morale : 75),
      ),
    ),
    new Promise((res) =>
      db.get(
        "SELECT morale FROM teams WHERE id = ?",
        [fixture.awayTeamId],
        (err, row) => res(row && row.morale != null ? row.morale : 75),
      ),
    ),
  ]);

  // Load full rosters for bench availability during injuries
  const homeFullRoster = await new Promise((resolve, reject) => {
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
  const awayFullRoster = await new Promise((resolve, reject) => {
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

  // Persistent lineup tracking across all minutes in this segment
  const homeLineupIds = new Set(homeSquad.map((p) => p.id));
  const awayLineupIds = new Set(awaySquad.map((p) => p.id));

  const getPower = (squad, style, morale = 75) => {
    let attack = 0,
      defense = 0,
      midfield = 0,
      gk = 0;
    squad.forEach((p) => {
      const starMult =
        p.is_star && (p.position === "MID" || p.position === "ATK")
          ? 1.35
          : 1.0;
      const effSkill = p.skill * (morale / 100) * starMult;
      if (p.position === "GK") gk += effSkill;
      if (p.position === "DEF") defense += effSkill;
      if (p.position === "MID") midfield += effSkill;
      if (p.position === "ATK") attack += effSkill;
    });

    // Ego / chemistry penalty: too many star players in the same team
    // causes dressing-room friction — offensive power degrades beyond 2 stars.
    const starCount = squad.filter(
      (p) => p.is_star && (p.position === "MID" || p.position === "ATK"),
    ).length;
    if (starCount >= 3) {
      const excessStars = starCount - 2; // every star beyond 2 adds friction
      const egoPenalty = Math.min(0.3, excessStars * 0.08); // up to -30%
      attack *= 1 - egoPenalty;
      midfield *= 1 - egoPenalty * 0.6; // midfield hit is softer
    }

    if (style === "Offensive") {
      attack *= 1.15;
      defense *= 0.85;
    }
    if (style === "Defensive") {
      defense *= 1.2;
      attack *= 0.8;
    }

    return { attack, defense, midfield, gk, squad };
  };

  const home = getPower(
    homeSquad,
    homeTactic ? homeTactic.style : "Balanced",
    homeMorale,
  );
  const away = getPower(
    awaySquad,
    awayTactic ? awayTactic.style : "Balanced",
    awayMorale,
  );

  for (let minute = startMin; minute <= endMin; minute++) {
    fixture._minute = minute;

    const currentHome = getPower(
      home.squad,
      homeTactic ? homeTactic.style : "Balanced",
      homeMorale,
    );
    const currentAway = getPower(
      away.squad,
      awayTactic ? awayTactic.style : "Balanced",
      awayMorale,
    );
    const currentHStrength =
      ((currentHome.attack || 10) * 1.5 +
        (currentHome.midfield || 10) * 1.0 +
        (currentHome.defense || 10) * 0.5) *
      1.1;
    const currentAStrength =
      (currentAway.attack || 10) * 1.5 +
      (currentAway.midfield || 10) * 1.0 +
      (currentAway.defense || 10) * 0.5;

    const chance = Math.random();
    if (chance < 0.03) {
      const penaltyChance = 0.008;
      const isPenalty = Math.random() < penaltyChance;
      const attackingSide =
        Math.random() * (currentHStrength + currentAStrength) < currentHStrength
          ? "home"
          : "away";
      const attackingSquad = attackingSide === "home" ? home.squad : away.squad;

      if (isPenalty) {
        await applyPenaltyEvent({
          db,
          fixture,
          teamSide: attackingSide,
          squad: attackingSquad,
          currentMatchweek,
          io,
          game,
        });
      } else {
        const scoringSquad = attackingSide === "home" ? home.squad : away.squad;
        const scoringTeam = attackingSide;
        const scorers = scoringSquad.filter(
          (p) => p.position === "ATK" || p.position === "MID",
        );
        const scorer =
          scorers.length > 0 ? weightedPickScorer(scorers) : scoringSquad[0];
        if (attackingSide === "home") fixture.finalHomeGoals++;
        else fixture.finalAwayGoals++;
        fixture.events.push({
          minute,
          type: "goal",
          team: scoringTeam,
          emoji: "⚽",
          playerId: scorer ? scorer.id : null,
          playerName: scorer ? scorer.name : "Jogador",
          text: `[${minute}'] ⚽ GOLO! ${scorer ? scorer.name : "Jogador"}`,
        });
        if (scorer)
          db.run("UPDATE players SET goals = goals + 1 WHERE id = ?", [
            scorer.id,
          ]);
      }
    }

    const cardChance = Math.random();
    if (cardChance < 0.005) {
      const isHomeCard = Math.random() > 0.5;
      const squad = isHomeCard ? home.squad : away.squad;
      const side = isHomeCard ? "home" : "away";
      if (squad.length > 0) {
        const offender = squad[Math.floor(Math.random() * squad.length)];
        let seriousProb = 0.15;
        if (offender.aggressiveness === "High") seriousProb = 0.4;
        if (offender.aggressiveness === "Low") seriousProb = 0.05;

        if (Math.random() < seriousProb) {
          // Expulsão grave — 3 jogos de suspensão
          db.run(
            "UPDATE players SET red_cards = red_cards + 1, suspension_games = suspension_games + 3, suspension_until_matchweek = CASE WHEN suspension_until_matchweek > ? THEN suspension_until_matchweek ELSE ? END WHERE id = ?",
            [currentMatchweek + 3, currentMatchweek + 3, offender.id],
          );
          fixture.events.push({
            minute,
            type: "red",
            subType: "serious",
            team: side,
            emoji: "🟥",
            playerId: offender.id,
            playerName: offender.name,
            text: `[${minute}'] 🟥 Vermelho! ${offender.name}`,
          });
          const idx = squad.findIndex((p) => p.id === offender.id);
          if (idx > -1) squad.splice(idx, 1);
        } else {
          // Expulsão simples — 1 jogo de suspensão
          db.run(
            "UPDATE players SET red_cards = red_cards + 1, suspension_games = suspension_games + 1, suspension_until_matchweek = CASE WHEN suspension_until_matchweek > ? THEN suspension_until_matchweek ELSE ? END WHERE id = ?",
            [currentMatchweek + 1, currentMatchweek + 1, offender.id],
          );
          fixture.events.push({
            minute,
            type: "red",
            subType: "simple",
            team: side,
            emoji: "🟥",
            playerId: offender.id,
            playerName: offender.name,
            text: `[${minute}'] 🟥 Vermelho! ${offender.name}`,
          });
          const idx = squad.findIndex((p) => p.id === offender.id);
          if (idx > -1) squad.splice(idx, 1);
        }
      }
    }

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

async function applyPostMatchQualityEvolution(db, fixtures, currentMatchweek) {
  return new Promise((resolve) => {
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
      if (result === "W")
        delta = 8 + Math.floor(Math.random() * 5); // +8..+12
      else if (result === "L")
        delta = -(8 + Math.floor(Math.random() * 5)); // -8..-12
      else delta = Math.floor(Math.random() * 5) - 2; // -2..+2
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
              20,
              Math.min(100, (row.morale ?? 75) + upd.delta),
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

          if (diff >= 5 && Math.random() < Math.min(0.18, 0.03 + diff / 120)) {
            delta += 1;
          }

          if (
            teamResult === "W" &&
            diff >= 0 &&
            Math.random() < Math.min(0.1, 0.02 + diff / 220)
          ) {
            delta += 1;
          }

          if (teamResult === "L") {
            const lossPressure = Math.min(
              0.18,
              0.03 + Math.max(0, -diff) / 220,
            );
            if (Math.random() < lossPressure) delta -= 1;
          }

          if (teamResult === "D" && diff >= 10 && Math.random() < 0.04) {
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
              "UPDATE players SET skill = ? WHERE id = ?",
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
async function simulateExtraTime(db, fixture, homeTactic, awayTactic, context) {
  await simulateMatchSegment(
    db,
    fixture,
    homeTactic,
    awayTactic,
    91,
    105,
    context,
  );
  const et1Events = fixture.events.filter(
    (e) => e.minute >= 91 && e.minute <= 105,
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

  await simulateMatchSegment(
    db,
    fixture,
    homeTactic,
    awayTactic,
    106,
    120,
    context,
  );
  const et2Events = fixture.events.filter((e) => e.minute >= 106);

  return { et1Events, et2Events };
}

// ─── PENALTY SHOOTOUT ─────────────────────────────────────────────────────────
// Simulates a penalty shootout between two squads.
// Returns { homeGoals, awayGoals, kicks: [{team, playerName, scored}] }
function simulatePenaltyShootout(homeSquad, awaySquad) {
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
  const homeGK = homeSquad.find((p) => p.position === "GK") || homeSquad[0];
  const awayGK = awaySquad.find((p) => p.position === "GK") || awaySquad[0];

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
