function pickBestPlayer(players = []) {
  if (!players.length) return null;
  return [...players].sort(
    (a, b) => b.skill * (b.form / 100) - a.skill * (a.form / 100),
  )[0];
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
      const sorted = [...availableRows].sort(
        (a, b) => b.skill * b.form - a.skill * a.form,
      );
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
    return Promise.resolve(fallback());
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

async function applyInjuryEvent({
  db,
  fixture,
  teamSide,
  squad,
  lineupIds,
  currentMatchweek,
  io,
  game,
}) {
  if (!squad.length) return { replaced: false, injuredPlayer: null };

  const injuredPlayer = squad[Math.floor(Math.random() * squad.length)];
  const severityRoll = Math.random();
  let injuryWeeks = 1;
  let injuryLabel = "ligeira";
  if (severityRoll < 0.12) {
    injuryWeeks = 10;
    injuryLabel = "grave";
  } else if (severityRoll < 0.32) {
    injuryWeeks = 3;
    injuryLabel = "moderada";
  }

  const injuryUntil = currentMatchweek + injuryWeeks;
  db.run(
    "UPDATE players SET injuries = injuries + 1, injury_until_matchweek = CASE WHEN injury_until_matchweek > ? THEN injury_until_matchweek ELSE ? END WHERE id = ?",
    [injuryUntil, injuryUntil, injuredPlayer.id],
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
  const availableBench = getAvailableBench(squad, lineupIds);
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
        form: p.form,
      })),
      currentScore: {
        home: fixture.finalHomeGoals,
        away: fixture.finalAwayGoals,
      },
    },
    timeoutMs: 12000,
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
        form: p.form,
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

  const penaltySkill = (taker.skill || 0) * 0.8 + (taker.form || 0) * 0.2;
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

  const getPower = (squad, style) => {
    let attack = 0,
      defense = 0,
      midfield = 0,
      gk = 0;
    squad.forEach((p) => {
      const effSkill = p.skill * (p.form / 100);
      if (p.position === "GK") gk += effSkill;
      if (p.position === "DEF") defense += effSkill;
      if (p.position === "MID") midfield += effSkill;
      if (p.position === "ATK") attack += effSkill;
    });

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

  const home = getPower(homeSquad, homeTactic ? homeTactic.style : "Balanced");
  const away = getPower(awaySquad, awayTactic ? awayTactic.style : "Balanced");

  const yellowCounts = { home: {}, away: {} };

  for (let minute = startMin; minute <= endMin; minute++) {
    fixture._minute = minute;

    const currentHome = getPower(
      home.squad,
      homeTactic ? homeTactic.style : "Balanced",
    );
    const currentAway = getPower(
      away.squad,
      awayTactic ? awayTactic.style : "Balanced",
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
      } else if (
        Math.random() * (currentHStrength + currentAStrength) <
        currentHStrength
      ) {
        const scorers = home.squad.filter(
          (p) => p.position === "ATK" || p.position === "MID",
        );
        const scorer =
          scorers.length > 0
            ? scorers[Math.floor(Math.random() * scorers.length)]
            : home.squad[0];
        fixture.finalHomeGoals++;
        fixture.events.push({
          minute,
          type: "goal",
          team: "home",
          emoji: "⚽",
          playerId: scorer ? scorer.id : null,
          playerName: scorer ? scorer.name : "Jogador",
          text: `[${minute}'] ⚽ GOLO! ${scorer ? scorer.name : "Jogador"}`,
        });
        if (scorer)
          db.run("UPDATE players SET goals = goals + 1 WHERE id = ?", [
            scorer.id,
          ]);
      } else {
        const scorers = away.squad.filter(
          (p) => p.position === "ATK" || p.position === "MID",
        );
        const scorer =
          scorers.length > 0
            ? scorers[Math.floor(Math.random() * scorers.length)]
            : away.squad[0];
        fixture.finalAwayGoals++;
        fixture.events.push({
          minute,
          type: "goal",
          team: "away",
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
    if (cardChance < 0.015) {
      const isHomeCard = Math.random() > 0.5;
      const squad = isHomeCard ? home.squad : away.squad;
      const side = isHomeCard ? "home" : "away";
      if (squad.length > 0) {
        const offender = squad[Math.floor(Math.random() * squad.length)];
        const prevYellows = yellowCounts[side][offender.id] || 0;
        let redProb = 0.05;
        if (offender.aggressiveness === "High") redProb = 0.2;
        if (offender.aggressiveness === "Low") redProb = 0.01;

        if (prevYellows >= 1) {
          db.run(
            "UPDATE players SET red_cards = red_cards + 1, suspension_games = suspension_games + 1, suspension_until_matchweek = CASE WHEN suspension_until_matchweek > ? THEN suspension_until_matchweek ELSE ? END WHERE id = ?",
            [currentMatchweek + 1, currentMatchweek + 1, offender.id],
          );
          fixture.events.push({
            minute,
            type: "red",
            subType: "double_yellow",
            team: side,
            emoji: "🟥",
            playerId: offender.id,
            playerName: offender.name,
            text: `[${minute}'] 🟥 Segundo amarelo = vermelho! ${offender.name}`,
          });
          const idx = squad.findIndex((p) => p.id === offender.id);
          if (idx > -1) squad.splice(idx, 1);
        } else if (Math.random() < redProb) {
          db.run(
            "UPDATE players SET red_cards = red_cards + 1, suspension_games = suspension_games + 3, suspension_until_matchweek = CASE WHEN suspension_until_matchweek > ? THEN suspension_until_matchweek ELSE ? END WHERE id = ?",
            [currentMatchweek + 3, currentMatchweek + 3, offender.id],
          );
          fixture.events.push({
            minute,
            type: "red",
            subType: "direct",
            team: side,
            emoji: "🟥",
            playerId: offender.id,
            playerName: offender.name,
            text: `[${minute}'] 🟥 VERMELHO! ${offender.name}`,
          });
          const idx = squad.findIndex((p) => p.id === offender.id);
          if (idx > -1) squad.splice(idx, 1);
        } else {
          yellowCounts[side][offender.id] = prevYellows + 1;
          fixture.events.push({
            minute,
            type: "yellow",
            team: side,
            emoji: "🟨",
            playerId: offender.id,
            playerName: offender.name,
            text: `[${minute}'] 🟨 Amarelo para ${offender.name}`,
          });
        }
      }
    }

    const injuryChance = Math.random();
    if (injuryChance < 0.01) {
      const isHomeInjury = Math.random() > 0.5;
      const squad = isHomeInjury ? home.squad : away.squad;
      const side = isHomeInjury ? "home" : "away";
      const lineupIds = new Set(squad.map((p) => p.id));
      if (squad.length > 0) {
        const injuryResult = await applyInjuryEvent({
          db,
          fixture,
          teamSide: side,
          squad,
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

module.exports = {
  simulateMatchSegment,
  getTeamSquad,
  generateFixturesForDivision,
  isPlayerAvailable,
};
