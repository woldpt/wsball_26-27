require("dotenv").config();

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const rateLimit = require("express-rate-limit");
const {
  getGame,
  getGameBySocket,
  saveGameState,
  getPlayerBySocket,
  bindSocket,
  unbindSocket,
  getPlayerList,
} = require("./gameManager");
const {
  generateFixturesForDivision,
  simulateMatchSegment,
  applyPostMatchQualityEvolution,
  simulateExtraTime,
  simulatePenaltyShootout,
} = require("./game/engine");
const {
  verifyOrCreateManager,
  verifyManager,
  createManager,
  recordRoomAccess,
  getManagerRooms,
} = require("./auth");
const adminRoutes = require("./adminRoutes");

const app = express();
app.set("trust proxy", 1);
app.use(cors());
app.use(express.json());
app.use("/admin", adminRoutes);

// ── RATE LIMITER ─────────────────────────────────────────────────────────────
// Protects endpoints that perform I/O from being flooded.
// Max 30 requests per minute per IP — generous for legitimate clients.
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiadas tentativas. Tenta novamente em breve." },
});

// ── HEALTH CHECK ──────────────────────────────────────────────────────────────
// Used by Docker healthcheck and monitoring tools to confirm the server is up.
app.get("/health", (req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

// ── LIST SAVES ────────────────────────────────────────────────────────────────
// Returns only the room codes that the requesting coach has access to.
// ?name=<coach> filters to that coach's rooms; omitting it returns all saves.
app.get("/saves", apiLimiter, async (req, res) => {
  try {
    const files = fs.readdirSync(path.join(__dirname, "db"));
    const allSaves = files
      .filter((f) => f.startsWith("game_") && f.endsWith(".db"))
      .map((f) => f.replace("game_", "").replace(".db", ""));

    const managerName = req.query.name;
    if (!managerName) {
      return res.json(allSaves);
    }

    // Filter to rooms this coach has joined
    const mySaves = await getManagerRooms(managerName);
    const filtered = mySaves.filter((r) => allSaves.includes(r));
    res.json(filtered);
  } catch (e) {
    console.error("[/saves] Error:", e.message);
    res.json([]);
  }
});

app.post("/auth/login", apiLimiter, async (req, res) => {
  try {
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    const password =
      typeof req.body?.password === "string" ? req.body.password : "";

    if (!name) {
      return res.status(400).json({ error: "Nome de treinador inválido." });
    }
    if (!password) {
      return res.status(400).json({ error: "A palavra-passe é obrigatória." });
    }

    const authResult = await verifyManager(name, password);
    if (!authResult.ok) {
      return res.status(401).json({ error: authResult.error });
    }

    return res.json({ ok: true, name });
  } catch (error) {
    console.error("[/auth/login] Error:", error.message);
    return res.status(500).json({ error: "Erro interno de autenticação." });
  }
});

app.post("/auth/register", apiLimiter, async (req, res) => {
  try {
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    const password =
      typeof req.body?.password === "string" ? req.body.password : "";

    if (!name) {
      return res.status(400).json({ error: "Nome de treinador inválido." });
    }
    if (!password) {
      return res.status(400).json({ error: "A palavra-passe é obrigatória." });
    }

    const authResult = await createManager(name, password);
    if (!authResult.ok) {
      return res.status(409).json({ error: authResult.error });
    }

    return res.json({ ok: true, name });
  } catch (error) {
    console.error("[/auth/register] Error:", error.message);
    return res.status(500).json({ error: "Erro interno de autenticação." });
  }
});

const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

function getSeasonEndMatchweek(matchweek) {
  return Math.ceil(Math.max(1, matchweek) / 14) * 14;
}

const refereeNames = [
  "Afonso Pereira",
  "Bruno Almeida",
  "Carlos Nogueira",
  "Diogo Valente",
  "Eduardo Matos",
  "Filipe Santos",
  "Gonçalo Ribeiro",
  "Hugo Carvalho",
  "Inácio Moreira",
  "João Varela",
  "Leandro Costa",
  "Miguel Teixeira",
  "Nuno Figueiredo",
  "Óscar Pires",
  "Pedro Cunha",
  "Rafael Martins",
  "Sérgio Lima",
  "Tiago Fernandes",
  "Ulisses Rocha",
  "Vasco Mendes",
  "Xavier Correia",
  "Yuri Lopes",
  "Zé Monteiro",
  "André Simões",
  "Bernardo Fonseca",
  "César Tavares",
  "Daniel Ribeiro",
  "Elias Pinto",
  "Francisco Lobo",
  "Guilherme Serra",
  "Henrique Antunes",
  "Isaac Barros",
];

function hashString(input = "") {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function runAll(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
}

function runGet(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row || null);
    });
  });
}

function getStandingsRows(teams = []) {
  return [...teams].sort((a, b) => {
    const aGoalDifference = (a.goals_for || 0) - (a.goals_against || 0);
    const bGoalDifference = (b.goals_for || 0) - (b.goals_against || 0);
    return (
      (b.points || 0) - (a.points || 0) ||
      bGoalDifference - aGoalDifference ||
      (b.goals_for || 0) - (a.goals_for || 0) ||
      String(a.name || "").localeCompare(String(b.name || ""))
    );
  });
}

function pickRefereeSummary(roomCode, teamId, opponentId, matchweek) {
  const seed = hashString(`${roomCode}:${matchweek}:${teamId}:${opponentId}`);
  const refereeName = refereeNames[seed % refereeNames.length];
  const biasSeed = hashString(
    `${refereeName}:${teamId}:${opponentId}:${roomCode}`,
  );
  const balance = 20 + (biasSeed % 61);
  return {
    refereeName,
    balance,
    favorsTeamA: balance >= 50,
  };
}

async function getTeamRecentResults(game, teamId, limit = 5) {
  const rows = await runAll(
    game.db,
    `SELECT m.matchweek, m.home_team_id, m.away_team_id, m.home_score, m.away_score,
            h.name AS home_name, a.name AS away_name
     FROM matches m
     LEFT JOIN teams h ON h.id = m.home_team_id
     LEFT JOIN teams a ON a.id = m.away_team_id
     WHERE m.played = 1 AND (m.home_team_id = ? OR m.away_team_id = ?)
     ORDER BY m.matchweek DESC, m.id DESC
     LIMIT ?`,
    [teamId, teamId, limit],
  );

  const recent = rows.map((row) => {
    const isHome = row.home_team_id === teamId;
    const goalsFor = isHome ? row.home_score : row.away_score;
    const goalsAgainst = isHome ? row.away_score : row.home_score;
    if (goalsFor > goalsAgainst) return "V";
    if (goalsFor < goalsAgainst) return "D";
    return "E";
  });

  return recent.join("");
}

async function buildNextMatchSummary(game, teamId) {
  const team = await runGet(game.db, "SELECT * FROM teams WHERE id = ?", [
    teamId,
  ]);
  if (!team) return null;

  const standings = getStandingsRows(
    await runAll(
      game.db,
      "SELECT id, name, division, points, wins, draws, losses, goals_for, goals_against FROM teams WHERE division = ?",
      [team.division],
    ),
  );
  const standingsIndex = new Map(
    standings.map((standingTeam, index) => [standingTeam.id, index + 1]),
  );

  const fixtures = await generateFixturesForDivision(
    game.db,
    team.division,
    game.matchweek,
  );
  const fixture = fixtures.find(
    (entry) => entry.homeTeamId === team.id || entry.awayTeamId === team.id,
  );
  if (!fixture) return null;

  const opponentId =
    fixture.homeTeamId === team.id ? fixture.awayTeamId : fixture.homeTeamId;
  const opponent = await runGet(game.db, "SELECT * FROM teams WHERE id = ?", [
    opponentId,
  ]);
  if (!opponent) return null;

  const referee = pickRefereeSummary(
    game.roomCode,
    team.id,
    opponent.id,
    game.matchweek,
  );

  return {
    matchweek: game.matchweek,
    team: {
      id: team.id,
      name: team.name,
      division: team.division,
      position: standingsIndex.get(team.id) || null,
    },
    opponent: {
      id: opponent.id,
      name: opponent.name,
      division: opponent.division,
      position: standingsIndex.get(opponent.id) || null,
      points: opponent.points || 0,
      goalsFor: opponent.goals_for || 0,
      goalsAgainst: opponent.goals_against || 0,
      last5: await getTeamRecentResults(game, opponent.id, 5),
    },
    referee,
  };
}

function persistMatchResults(game, fixtures, matchweek, onDone) {
  let remaining = fixtures.length;
  if (remaining === 0) {
    if (onDone) onDone();
    return;
  }

  game.db.serialize(() => {
    fixtures.forEach((match) => {
      game.db.run(
        "DELETE FROM matches WHERE matchweek = ? AND home_team_id = ? AND away_team_id = ? AND competition = 'League'",
        [game.matchweek, match.homeTeamId, match.awayTeamId],
        () => {
          game.db.run(
            `INSERT INTO matches (
              matchweek, home_team_id, away_team_id, home_score, away_score, played, narrative, competition
            ) VALUES (?, ?, ?, ?, ?, 1, ?, 'League')`,
            [
              game.matchweek,
              match.homeTeamId,
              match.awayTeamId,
              match.finalHomeGoals,
              match.finalAwayGoals,
              JSON.stringify(match.events || []),
            ],
            () => {
              remaining -= 1;
              if (remaining === 0 && onDone) onDone();
            },
          );
        },
      );
    });
  });
}

// ─── DIVISION NAMES ────────────────────────────────────────────────────────────
const DIVISION_NAMES = {
  1: "I Liga",
  2: "II Liga",
  3: "Liga 3",
  4: "Campeonato de Portugal",
  5: "Distritais",
};

// ─── CUP ROUND SCHEDULE ─────────────────────────────────────────────────────
// matchweek → cup round (1-indexed)
const CUP_ROUND_AFTER_MATCHWEEK = { 3: 1, 6: 2, 9: 3, 12: 4, 14: 5 };
const CUP_ROUND_NAMES = [
  "",
  "16 avos de final",
  "Oitavos de final",
  "Quartos de final",
  "Meias-finais",
  "Final",
];

// ─── SEASON END ───────────────────────────────────────────────────────────────
// Called after matchweek 14 completes. Awards palmares, applies promo/relegation.
async function applySeasonEnd(game) {
  const season = game.season;
  const year = game.year; // real-world year of the season just ended
  const allTeams = await runAll(
    game.db,
    "SELECT * FROM teams ORDER BY division, id",
  );

  // Group by division
  const byDiv = {};
  for (const t of allTeams) {
    if (!byDiv[t.division]) byDiv[t.division] = [];
    byDiv[t.division].push(t);
  }

  // Sort each division by standings
  for (const div in byDiv) {
    byDiv[div] = getStandingsRows(byDiv[div]);
  }

  // Award I Liga champion palmares
  const iLigaWinner = byDiv[1] && byDiv[1][0];
  if (iLigaWinner) {
    await new Promise((resolve) => {
      game.db.run(
        "INSERT INTO palmares (team_id, season, achievement) VALUES (?, ?, ?)",
        [iLigaWinner.id, year, "Campeão Nacional"],
        resolve,
      );
    });
    io.to(game.roomCode).emit(
      "systemMessage",
      `🏆 ${iLigaWinner.name} é o Campeão Nacional de ${year}!`,
    );
  }

  // Award division champions (II Liga, Liga 3, Campeonato de Portugal)
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

  // Promotion / relegation between divs 1-4, with Distritais (div 5) as reserve pool
  // Each boundary: bottom 2 of higher div drop, top 2 of lower div rise
  const promotions = []; // { teamId, fromDiv, toDiv }

  for (const [upperDiv, lowerDiv] of [
    [1, 2],
    [2, 3],
    [3, 4],
    [4, 5],
  ]) {
    const upper = byDiv[upperDiv] || [];
    const lower = byDiv[lowerDiv] || [];
    if (!upper.length || !lower.length) continue;

    const relegated = upper.slice(-2).map((t) => t.id);
    // For Distritais: pick the 2 with highest average squad skill rather than just standings
    let promoted;
    if (lowerDiv === 5) {
      const teamsWithSkill = await Promise.all(
        lower.map(async (t) => {
          const players = await runAll(
            game.db,
            "SELECT skill FROM players WHERE team_id = ?",
            [t.id],
          );
          const avgSkill = players.length
            ? players.reduce((s, p) => s + p.skill, 0) / players.length
            : 0;
          return { id: t.id, avgSkill };
        }),
      );
      teamsWithSkill.sort((a, b) => b.avgSkill - a.avgSkill);
      promoted = teamsWithSkill.slice(0, 2).map((t) => t.id);
    } else {
      promoted = lower.slice(0, 2).map((t) => t.id);
    }

    relegated.forEach((id) => promotions.push({ teamId: id, toDiv: lowerDiv }));
    promoted.forEach((id) => promotions.push({ teamId: id, toDiv: upperDiv }));
  }

  // Apply division changes
  for (const p of promotions) {
    await new Promise((resolve) => {
      game.db.run(
        "UPDATE teams SET division = ? WHERE id = ?",
        [p.toDiv, p.teamId],
        resolve,
      );
    });
  }

  // Reset standings for all divisions (including Distritais)
  await new Promise((resolve) => {
    game.db.run(
      "UPDATE teams SET points=0, wins=0, draws=0, losses=0, goals_for=0, goals_against=0",
      resolve,
    );
  });

  // ── AGING + RETIREMENT ──────────────────────────────────────────────────
  // All players age +1 per season
  await new Promise((resolve) => {
    game.db.run("UPDATE players SET age = age + 1", resolve);
  });
  // Players 36+ may retire (probability increases with age)
  const retirementCandidates = await runAll(
    game.db,
    "SELECT id, age FROM players WHERE age >= 36 AND team_id IS NOT NULL",
  );
  for (const p of retirementCandidates) {
    const retireChance =
      p.age >= 39 ? 0.95 : p.age >= 38 ? 0.8 : p.age >= 37 ? 0.6 : 0.35;
    if (Math.random() < retireChance) {
      await new Promise((resolve) => {
        game.db.run(
          "UPDATE players SET team_id = NULL, transfer_status = 'none', transfer_price = 0 WHERE id = ?",
          [p.id],
          resolve,
        );
      });
    }
  }

  // ── RESET GOAL STATS FOR NEW SEASON ─────────────────────────────────────
  await new Promise((resolve) => {
    game.db.run(
      "UPDATE players SET goals = 0, red_cards = 0, injuries = 0, suspension_games = 0, suspension_until_matchweek = 0, injury_until_matchweek = 0",
      resolve,
    );
  });

  // Advance season
  game.season += 1;
  game.year += 1; // advance to the next real-world year
  game.cupRound = 0;
  game.cupState = "idle";
  game.cupTeamIds = [];
  saveGameState(game);

  // Broadcast fresh teams data
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

// ─── CUP: GENERATE DRAW ──────────────────────────────────────────────────────
// Returns the draw fixtures (inserted into cup_matches) for the given round.
async function generateCupDraw(game, round) {
  const season = game.season;
  let teamIds;

  if (round === 1) {
    // All teams from divisions 1-4
    const teams = await runAll(
      game.db,
      "SELECT id FROM teams WHERE division BETWEEN 1 AND 4 ORDER BY id",
    );
    teamIds = teams.map((t) => t.id);
  } else {
    // Winners of previous round
    const prevRound = await runAll(
      game.db,
      "SELECT winner_team_id FROM cup_matches WHERE season = ? AND round = ? AND played = 1",
      [season, round - 1],
    );
    teamIds = prevRound.map((r) => r.winner_team_id).filter(Boolean);
  }

  // Fisher-Yates shuffle
  for (let i = teamIds.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [teamIds[i], teamIds[j]] = [teamIds[j], teamIds[i]];
  }

  // Create pairs
  const fixtures = [];
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
  game.cupRound = round;
  game.cupState = "draw";
  saveGameState(game);

  return fixtures;
}

// ─── CUP: START ROUND ─────────────────────────────────────────────────────────
// Called after the league matchweek that triggers a cup round.
// If any human is still in the cup, emits the draw popup; otherwise auto-sims.
async function startCupRound(game, round) {
  const drawFixtures = await generateCupDraw(game, round);

  // Enrich with team names for the UI
  const enriched = await Promise.all(
    drawFixtures.map(async (f) => {
      const home = await runGet(
        game.db,
        "SELECT id, name, color_primary, color_secondary FROM teams WHERE id = ?",
        [f.homeTeamId],
      );
      const away = await runGet(
        game.db,
        "SELECT id, name, color_primary, color_secondary FROM teams WHERE id = ?",
        [f.awayTeamId],
      );
      return { homeTeam: home, awayTeam: away };
    }),
  );

  const connectedPlayers = getPlayerList(game);
  const humanTeamIds = new Set(connectedPlayers.map((p) => p.teamId));
  const humanInCup = game.cupTeamIds.some((id) => humanTeamIds.has(id));

  game.cupDrawAcks = new Set();

  io.to(game.roomCode).emit("cupDrawStart", {
    round,
    roundName: CUP_ROUND_NAMES[round] || `Ronda ${round}`,
    fixtures: enriched,
    humanInCup,
    season: game.season,
  });

  if (!humanInCup) {
    // No human in cup: auto-simulate and await completion
    await simulateCupRound(game, round);
  } else {
    game.cupState = "draw";
    // Simulation starts after all humans ack (see "cupDrawAcknowledged" handler)
    // Safety timeout: if humans don't ack within 30s, auto-proceed
    if (game._cupDrawTimeout) clearTimeout(game._cupDrawTimeout);
    game._cupDrawTimeout = setTimeout(() => {
      if (game.cupState === "draw") {
        console.log(
          `[${game.roomCode}] Cup draw timeout — auto-proceeding round ${round}`,
        );
        simulateCupRound(game, round);
      }
    }, 30000);
  }
}

// ─── CUP: SIMULATE ROUND ─────────────────────────────────────────────────────
async function simulateCupRound(game, round) {
  game.cupState = "playing";
  saveGameState(game);

  const season = game.season;
  const matchRows = await runAll(
    game.db,
    "SELECT * FROM cup_matches WHERE season = ? AND round = ? AND played = 0",
    [season, round],
  );

  const results = [];

  for (const row of matchRows) {
    const fixture = {
      homeTeamId: row.home_team_id,
      awayTeamId: row.away_team_id,
      finalHomeGoals: 0,
      finalAwayGoals: 0,
      events: [],
    };

    const p1 = Object.values(game.playersByName).find(
      (p) => p.teamId === row.home_team_id,
    );
    const p2 = Object.values(game.playersByName).find(
      (p) => p.teamId === row.away_team_id,
    );
    const t1 = p1 ? p1.tactic : { formation: "4-4-2", style: "Balanced" };
    const t2 = p2 ? p2.tactic : { formation: "4-4-2", style: "Balanced" };

    const ctx = { game, io, matchweek: game.matchweek };

    await simulateMatchSegment(game.db, fixture, t1, t2, 1, 45, ctx);

    io.to(game.roomCode).emit("cupHalfTime", {
      round,
      fixture: {
        homeTeamId: fixture.homeTeamId,
        awayTeamId: fixture.awayTeamId,
        homeGoals: fixture.finalHomeGoals,
        awayGoals: fixture.finalAwayGoals,
      },
    });

    await simulateMatchSegment(game.db, fixture, t1, t2, 46, 90, ctx);

    // Cup: no draws allowed — extra time if level
    let winnerId;
    if (fixture.finalHomeGoals !== fixture.finalAwayGoals) {
      winnerId =
        fixture.finalHomeGoals > fixture.finalAwayGoals
          ? fixture.homeTeamId
          : fixture.awayTeamId;
    } else {
      // Extra time
      await simulateExtraTime(game.db, fixture, t1, t2, ctx);

      if (fixture.finalHomeGoals !== fixture.finalAwayGoals) {
        winnerId =
          fixture.finalHomeGoals > fixture.finalAwayGoals
            ? fixture.homeTeamId
            : fixture.awayTeamId;
      } else {
        // Penalty shootout
        const { getTeamSquad } = require("./game/engine");
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

        // Small delay for UI to show shootout
        await new Promise((r) => setTimeout(r, 500));

        winnerId =
          shootout.homeGoals > shootout.awayGoals
            ? fixture.homeTeamId
            : fixture.awayTeamId;

        // Update DB with penalty scores
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

      // Update ET scores
      const etHome = fixture.finalHomeGoals;
      const etAway = fixture.finalAwayGoals;
      await new Promise((resolve) => {
        game.db.run(
          "UPDATE cup_matches SET home_et_score = ?, away_et_score = ? WHERE season = ? AND round = ? AND home_team_id = ? AND away_team_id = ?",
          [
            etHome,
            etAway,
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
      // Shouldn't happen, but fallback
      winnerId = fixture.homeTeamId;
    }

    // Persist result
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
      events: fixture.events,
    });

    // If this is the Final (round 5), award palmares
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
      if (winnerTeam) {
        io.to(game.roomCode).emit(
          "systemMessage",
          `🏆 ${winnerTeam.name} venceu a Taça de Portugal de ${game.year}!`,
        );
      }
    }
  }

  game.cupState = round === 5 ? "done_cup" : "done_round";
  saveGameState(game);

  io.to(game.roomCode).emit("cupRoundResults", {
    round,
    roundName: CUP_ROUND_NAMES[round] || `Ronda ${round}`,
    results,
    season,
    isFinal: round === 5,
  });

  // If this was the cup final AND a season-ending matchweek, trigger season end now
  if (round === 5) {
    const normMw = ((game.matchweek - 2) % 14) + 1; // matchweek was already incremented
    if (normMw === 14 || normMw === 0) {
      try {
        await applySeasonEnd(game);
      } catch (seErr) {
        console.error(`[${game.roomCode}] Season end error (from cup):`, seErr);
      }
    }
  }
}

function refreshMarket(game, emitToRoom = true) {
  game.db.all(
    `SELECT p.*, t.name as team_name, t.color_primary, t.color_secondary
     FROM players p
     LEFT JOIN teams t ON p.team_id = t.id
     WHERE p.team_id IS NULL OR p.transfer_status != 'none'
     ORDER BY CASE WHEN p.transfer_status = 'auction' THEN 0 ELSE 1 END, p.transfer_price ASC, p.value ASC, p.skill DESC`,
    (err, rows) => {
      if (!err && rows) {
        const decorated = rows.map((row) => {
          const auction = game.auctions?.[row.id];
          return auction
            ? {
                ...row,
                auction_active: true,
                auction_highest_bid: auction.highestBid,
                auction_highest_bidder_team_id: auction.highestBidderTeamId,
                auction_seller_team_id: auction.sellerTeamId,
                auction_ends_at: auction.endsAt,
                auction_min_increment: auction.minIncrement,
              }
            : row;
        });
        game.globalMarket = decorated;
        if (emitToRoom) io.to(game.roomCode).emit("marketUpdate", decorated);
      }
    },
  );
}

function emitSquadForPlayer(game, teamId) {
  const player = Object.values(game.playersByName).find(
    (p) => p.teamId === teamId && p.socketId,
  );
  if (!player) return;
  game.db.all(
    "SELECT * FROM players WHERE team_id = ?",
    [teamId],
    (err, squad) => {
      if (!err) io.to(player.socketId).emit("mySquad", squad || []);
    },
  );
}

function listPlayerOnMarket(game, playerId, mode, price, callback) {
  game.db.get(
    "SELECT * FROM players WHERE id = ?",
    [playerId],
    (err, player) => {
      if (err || !player) {
        if (callback) callback(false, "Jogador inválido.");
        return;
      }
      if (!player.team_id) {
        if (callback) callback(false, "Jogador já está sem contrato.");
        return;
      }
      const finalPrice = Math.max(
        0,
        Math.round(price || player.value * (mode === "auction" ? 0.75 : 1.0)),
      );
      if (mode === "auction") {
        startAuction(game, player, finalPrice, () => {
          if (callback) callback(true, finalPrice, player);
        });
      } else {
        game.db.run(
          "UPDATE players SET transfer_status = ?, transfer_price = ? WHERE id = ?",
          [mode, finalPrice, playerId],
          () => {
            refreshMarket(game);
            if (callback) callback(true, finalPrice, player);
          },
        );
      }
    },
  );
}

function startAuction(game, player, startingPrice, callback) {
  const durationMs = 45000;
  const minIncrement = Math.max(1000, Math.round(startingPrice * 0.05));
  const now = Date.now();
  const existingTimer = game.auctionTimers?.[player.id];
  if (existingTimer) clearTimeout(existingTimer);

  game.db.run(
    "UPDATE players SET transfer_status = 'auction', transfer_price = ? WHERE id = ?",
    [startingPrice, player.id],
    () => {
      if (!game.auctions) game.auctions = {};
      if (!game.auctionTimers) game.auctionTimers = {};
      game.auctions[player.id] = {
        playerId: player.id,
        sellerTeamId: player.team_id,
        highestBid: startingPrice,
        highestBidderTeamId: null,
        minIncrement,
        endsAt: now + durationMs,
        status: "open",
      };

      game.auctionTimers[player.id] = setTimeout(() => {
        finalizeAuction(game, player.id);
      }, durationMs);

      refreshMarket(game);
      io.to(game.roomCode).emit("auctionUpdate", game.auctions[player.id]);
      // Trigger NPC bids for this auction
      scheduleNpcAuctionBids(game, player.id);
      if (callback) callback(true, startingPrice, player);
    },
  );
}

function finalizeAuction(game, playerId) {
  if (!game.auctions || !game.auctions[playerId]) return;
  const auction = game.auctions[playerId];
  const timer = game.auctionTimers?.[playerId];
  if (timer) clearTimeout(timer);

  game.db.get(
    "SELECT * FROM players WHERE id = ?",
    [playerId],
    (err, player) => {
      if (err || !player) {
        delete game.auctions[playerId];
        delete game.auctionTimers?.[playerId];
        refreshMarket(game);
        return;
      }

      if (!auction.highestBidderTeamId) {
        game.db.run(
          "UPDATE players SET transfer_status = 'none', transfer_price = 0 WHERE id = ?",
          [playerId],
          () => {
            const seller = Object.values(game.playersByName).find(
              (p) => p.teamId === auction.sellerTeamId && p.socketId,
            );
            if (seller) {
              io.to(seller.socketId).emit(
                "systemMessage",
                `${player.name} não recebeu lances e saiu do leilão.`,
              );
            }
            delete game.auctions[playerId];
            delete game.auctionTimers?.[playerId];
            refreshMarket(game);
            io.to(game.roomCode).emit("auctionClosed", {
              playerId,
              sold: false,
            });
          },
        );
        return;
      }

      const buyerTeamId = auction.highestBidderTeamId;
      const finalBid = auction.highestBid;

      game.db.run(
        "UPDATE teams SET budget = budget + ? WHERE id = ?",
        [finalBid, auction.sellerTeamId],
        () => {
          game.db.run(
            "UPDATE teams SET budget = budget - ? WHERE id = ?",
            [finalBid, buyerTeamId],
            () => {
              game.db.run(
                "UPDATE players SET team_id = ?, wage = ?, contract_until_matchweek = ?, transfer_status = 'none', transfer_price = 0, contract_request_pending = 0, contract_requested_wage = 0 WHERE id = ?",
                [
                  buyerTeamId,
                  Math.max(player.wage || 0, Math.round(finalBid * 0.06)),
                  getSeasonEndMatchweek(game.matchweek),
                  playerId,
                ],
                () => {
                  const buyerCoach = Object.values(game.playersByName).find(
                    (p) => p.teamId === buyerTeamId && p.socketId,
                  );
                  const sellerCoach = Object.values(game.playersByName).find(
                    (p) => p.teamId === auction.sellerTeamId && p.socketId,
                  );
                  if (buyerCoach) {
                    io.to(buyerCoach.socketId).emit(
                      "systemMessage",
                      `Ganhaste o leilão de ${player.name} por €${finalBid}!`,
                    );
                  }
                  if (sellerCoach) {
                    io.to(sellerCoach.socketId).emit(
                      "systemMessage",
                      `${player.name} foi vendido em leilão por €${finalBid}.`,
                    );
                  }
                  delete game.auctions?.[playerId];
                  delete game.auctionTimers?.[playerId];
                  refreshMarket(game);
                  game.db.all("SELECT * FROM teams", (errTeams, teams) => {
                    if (!errTeams)
                      io.to(game.roomCode).emit("teamsData", teams);
                    emitSquadForPlayer(game, buyerTeamId);
                    io.to(game.roomCode).emit("auctionClosed", {
                      playerId,
                      sold: true,
                      buyerTeamId,
                      finalBid,
                    });
                  });
                },
              );
            },
          );
        },
      );
    },
  );
}

function placeAuctionBid(game, teamId, playerId, bidAmount, io) {
  if (!game.auctions || !game.auctions[playerId]) {
    return { ok: false, error: "Leilão indisponível." };
  }
  const auction = game.auctions[playerId];
  if (auction.sellerTeamId === teamId) {
    return { ok: false, error: "Não podes licitar no teu próprio jogador." };
  }

  const amount = Math.round(bidAmount || 0);
  if (amount < auction.highestBid + auction.minIncrement) {
    return {
      ok: false,
      error: `Lance mínimo: €${auction.highestBid + auction.minIncrement}.`,
    };
  }

  return new Promise((resolve) => {
    game.db.get(
      "SELECT budget FROM teams WHERE id = ?",
      [teamId],
      (err, team) => {
        if (err || !team || team.budget < amount) {
          resolve({ ok: false, error: "Não tens orçamento suficiente." });
          return;
        }

        auction.highestBid = amount;
        auction.highestBidderTeamId = teamId;
        auction.lastBidAt = Date.now();
        game.auctions[playerId] = auction;

        refreshMarket(game);
        io.to(game.roomCode).emit("auctionUpdate", auction);
        resolve({ ok: true, auction });
      },
    );
  });
}

function finalizeContractDecision(
  game,
  playerId,
  decision,
  teamId,
  currentMatchweek,
) {
  game.db.get(
    "SELECT * FROM players WHERE id = ?",
    [playerId],
    (err, player) => {
      if (err || !player) return;

      if (decision === "accept") {
        const seasonEnd = getSeasonEndMatchweek(currentMatchweek);
        const newWage = player.contract_requested_wage || player.wage || 0;
        game.db.run(
          "UPDATE players SET wage = ?, contract_until_matchweek = ?, contract_request_pending = 0, contract_requested_wage = 0 WHERE id = ?",
          [newWage, seasonEnd, playerId],
          () => {
            const coach = Object.values(game.playersByName).find(
              (p) => p.teamId === teamId && p.socketId,
            );
            if (coach)
              io.to(coach.socketId).emit(
                "systemMessage",
                `${player.name} renovou contrato por €${newWage}/sem.`,
              );
            emitSquadForPlayer(game, teamId);
          },
        );
      } else {
        listPlayerOnMarket(
          game,
          playerId,
          "auction",
          Math.max(
            player.value * 0.65,
            (player.contract_requested_wage || player.wage || 0) * 12,
          ),
          () => {
            game.db.run(
              "UPDATE players SET contract_request_pending = 0, contract_requested_wage = 0 WHERE id = ?",
              [playerId],
            );
            const coach = Object.values(game.playersByName).find(
              (p) => p.teamId === teamId && p.socketId,
            );
            if (coach)
              io.to(coach.socketId).emit(
                "systemMessage",
                `${player.name} foi colocado em leilão.`,
              );
          },
        );
      }
    },
  );
}

function maybeTriggerContractRequest(game, io, player) {
  if (!player || !player.team_id) return;
  if (player.transfer_status && player.transfer_status !== "none") return;
  if (player.contract_request_pending) return;

  const wage = player.wage || 0;
  const demandBase = Math.max(Math.round((player.skill || 0) * 70), wage + 200);
  if (wage >= demandBase * 0.85 && Math.random() > 0.08) return;

  const requestedWage = Math.round(demandBase * (1.05 + Math.random() * 0.2));
  game.db.run(
    "UPDATE players SET contract_request_pending = 1, contract_requested_wage = ? WHERE id = ?",
    [requestedWage, player.id],
    () => {
      const coach = Object.values(game.playersByName).find(
        (p) => p.teamId === player.team_id && p.socketId,
      );
      if (!coach) {
        game.db.run(
          "UPDATE players SET contract_request_pending = 0 WHERE id = ?",
          [player.id],
        );
        return;
      }

      io.to(coach.socketId).emit("matchActionRequired", {
        actionId: `contract-${player.id}-${Date.now()}`,
        type: "contract",
        teamId: player.team_id,
        player: {
          id: player.id,
          name: player.name,
          position: player.position,
          skill: player.skill,
          form: player.form,
          wage,
          requestedWage,
        },
      });
    },
  );
}

// ─── CONTRACT EXPIRY CHECK ─────────────────────────────────────────────────
// Called after each matchweek. Releases players whose contracts expired and
// triggers renewal requests for players approaching contract end.
async function processContractExpiries(game) {
  const currentMw = game.matchweek;

  // Release players whose contracts have expired
  const expired = await runAll(
    game.db,
    "SELECT * FROM players WHERE team_id IS NOT NULL AND contract_until_matchweek > 0 AND contract_until_matchweek <= ?",
    [currentMw],
  );
  for (const p of expired) {
    // Only auto-release NPC-managed players; human players get warnings
    const coach = Object.values(game.playersByName).find(
      (pl) => pl.teamId === p.team_id && pl.socketId,
    );
    if (!coach) {
      // NPC team — auto-renew if affordable, otherwise release
      const team = await runGet(
        game.db,
        "SELECT budget FROM teams WHERE id = ?",
        [p.team_id],
      );
      const newWage = Math.max(Math.round((p.skill || 0) * 55), p.wage || 0);
      if (team && team.budget > newWage * 14) {
        await new Promise((resolve) => {
          game.db.run(
            "UPDATE players SET wage = ?, contract_until_matchweek = ?, contract_request_pending = 0 WHERE id = ?",
            [newWage, getSeasonEndMatchweek(currentMw), p.id],
            resolve,
          );
        });
      } else {
        await new Promise((resolve) => {
          game.db.run(
            "UPDATE players SET team_id = NULL, transfer_status = 'none', transfer_price = 0, contract_request_pending = 0 WHERE id = ?",
            [p.id],
            resolve,
          );
        });
      }
    }
    // Human-managed teams: leave as-is, they should have been warned via contract requests
  }

  // Trigger renewal requests for players expiring within 3 matchweeks
  const soonExpiring = await runAll(
    game.db,
    "SELECT * FROM players WHERE team_id IS NOT NULL AND contract_until_matchweek > 0 AND contract_until_matchweek <= ? AND contract_until_matchweek > ? AND contract_request_pending = 0",
    [currentMw + 3, currentMw],
  );
  for (const p of soonExpiring) {
    maybeTriggerContractRequest(game, io, p);
  }
}

// ─── NPC TRANSFER ACTIVITY ─────────────────────────────────────────────────
// Called after each matchweek. NPC teams buy players they need.
async function processNpcTransferActivity(game) {
  const humanTeamIds = new Set(
    Object.values(game.playersByName)
      .map((p) => p.teamId)
      .filter(Boolean),
  );

  // Get all teams
  const allTeams = await runAll(
    game.db,
    "SELECT * FROM teams WHERE budget > 20000",
  );
  const npcTeams = allTeams.filter((t) => !humanTeamIds.has(t.id));

  if (npcTeams.length === 0) return;

  // Get listed players (fixed price) and free agents
  const marketPlayers = await runAll(
    game.db,
    "SELECT * FROM players WHERE (team_id IS NULL OR transfer_status = 'fixed') AND transfer_status != 'auction' ORDER BY skill DESC, value ASC",
  );

  for (const npcTeam of npcTeams) {
    // Check squad size
    const squadRows = await runAll(
      game.db,
      "SELECT id FROM players WHERE team_id = ?",
      [npcTeam.id],
    );
    if (squadRows.length >= 22) continue; // full squad
    if (Math.random() > 0.25) continue; // 25% chance per matchweek to attempt a purchase

    for (const player of marketPlayers) {
      if (player.team_id === npcTeam.id) continue; // own player
      const price =
        player.transfer_status === "fixed" && player.transfer_price > 0
          ? player.transfer_price
          : Math.round((player.value || 0) * 1.2);
      if (price <= 0) continue;
      if (price > npcTeam.budget * 0.35) continue; // won't overspend

      // NPC prefers players with skill near their division level
      if (Math.random() > 0.4) continue;

      // Buy the player
      await new Promise((resolve) => {
        game.db.run(
          "UPDATE teams SET budget = budget - ? WHERE id = ?",
          [price, npcTeam.id],
          resolve,
        );
      });
      if (player.team_id) {
        await new Promise((resolve) => {
          game.db.run(
            "UPDATE teams SET budget = budget + ? WHERE id = ?",
            [price, player.team_id],
            resolve,
          );
        });
      }
      await new Promise((resolve) => {
        game.db.run(
          "UPDATE players SET team_id = ?, transfer_status = 'none', transfer_price = 0, contract_until_matchweek = ?, contract_request_pending = 0, contract_requested_wage = 0 WHERE id = ?",
          [npcTeam.id, getSeasonEndMatchweek(game.matchweek), player.id],
          resolve,
        );
      });
      npcTeam.budget -= price;
      break; // one purchase per matchweek per NPC
    }
  }
}

// ─── NPC AUCTION BIDDING ───────────────────────────────────────────────────
// Called when an auction starts. NPC teams may place bids after a delay.
function scheduleNpcAuctionBids(game, playerId) {
  const auction = game.auctions?.[playerId];
  if (!auction) return;

  const humanTeamIds = new Set(
    Object.values(game.playersByName)
      .map((p) => p.teamId)
      .filter(Boolean),
  );

  game.db.all(
    "SELECT * FROM teams WHERE budget > ?",
    [auction.highestBid + auction.minIncrement],
    (err, teams) => {
      if (err || !teams) return;
      const npcTeams = teams.filter(
        (t) => !humanTeamIds.has(t.id) && t.id !== auction.sellerTeamId,
      );

      let bidDelay = 3000 + Math.floor(Math.random() * 5000);
      for (const npcTeam of npcTeams) {
        if (Math.random() > 0.2) continue; // 20% chance each NPC bids

        setTimeout(() => {
          const currentAuction = game.auctions?.[playerId];
          if (!currentAuction || currentAuction.status !== "open") return;
          const bidAmount =
            currentAuction.highestBid + currentAuction.minIncrement;
          if (bidAmount > npcTeam.budget * 0.4) return;

          placeAuctionBid(game, npcTeam.id, playerId, bidAmount, io);
        }, bidDelay);

        bidDelay += 3000 + Math.floor(Math.random() * 8000);
      }
    },
  );
}

io.on("connection", (socket) => {
  // ── JOIN GAME ──────────────────────────────────────────────────────────────
  socket.on("joinGame", async (data) => {
    const { name, password, roomCode: rawRoom } = data;

    // Basic input validation
    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return socket.emit("systemMessage", "Nome de treinador inválido.");
    }
    if (!password || typeof password !== "string" || password.length === 0) {
      return socket.emit("joinError", "A palavra-passe é obrigatória.");
    }
    if (!rawRoom || typeof rawRoom !== "string") {
      return socket.emit("systemMessage", "Código de sala inválido.");
    }

    const roomCode = rawRoom.toUpperCase();
    const trimmedName = name.trim();

    // Authenticate (or register) the coach before touching the game state
    const authResult = await verifyOrCreateManager(trimmedName, password);
    if (!authResult.ok) {
      return socket.emit("joinError", authResult.error);
    }

    // BUG-04 FIX: Use the callback-based getGame so we only proceed once DB state
    // has been fully loaded (matchweek, matchState, globalMarket).
    getGame(roomCode, (game, gameErr) => {
      if (!game || gameErr) {
        return socket.emit(
          "joinError",
          gameErr
            ? gameErr.message
            : "Erro ao carregar o jogo. Contacta o administrador.",
        );
      }
      socket.join(roomCode);

      const connectedCount = Object.values(game.playersByName).filter(
        (p) => p.socketId,
      ).length;
      if (connectedCount >= 8 && !game.playersByName[trimmedName]) {
        socket.emit("systemMessage", "Sala cheia (Máximo 8 Treinadores).");
        return;
      }

      // Record that this coach has access to this room (idempotent)
      recordRoomAccess(trimmedName, roomCode);

      game.db.get(
        "SELECT * FROM managers WHERE name = ?",
        [trimmedName],
        (err, row) => {
          if (row) {
            game.db.get(
              "SELECT id, name FROM teams WHERE manager_id = ?",
              [row.id],
              (err2, t) => {
                if (t) assignPlayer(game, socket, trimmedName, t, roomCode);
                else
                  generateRandomTeam(
                    game,
                    socket,
                    trimmedName,
                    roomCode,
                    row.id,
                  );
              },
            );
          } else {
            game.db.run(
              "INSERT INTO managers (name) VALUES (?)",
              [trimmedName],
              function (err2) {
                generateRandomTeam(
                  game,
                  socket,
                  trimmedName,
                  roomCode,
                  this.lastID,
                );
              },
            );
          }
        },
      );
    });
  });

  socket.on("requestNextMatchSummary", async ({ teamId }) => {
    const game = getGameBySocket(socket.id);
    if (!game) return;
    const playerState = getPlayerBySocket(game, socket.id);
    if (!playerState) return;

    try {
      const summary = await buildNextMatchSummary(
        game,
        playerState.teamId || teamId,
      );
      socket.emit("nextMatchSummary", summary);
    } catch (error) {
      console.error(`[${game.roomCode}] nextMatchSummary error:`, error);
      socket.emit("nextMatchSummary", null);
    }
  });

  // ── CUP DRAW ACKNOWLEDGED ─────────────────────────────────────────────────
  socket.on("cupDrawAcknowledged", () => {
    const game = getGameBySocket(socket.id);
    if (!game || game.cupState !== "draw") return;

    game.cupDrawAcks.add(socket.id);

    // Check if all connected humans have acknowledged
    const connectedPlayers = getPlayerList(game);
    const allAcked = connectedPlayers.every(
      (p) => !p.socketId || game.cupDrawAcks.has(p.socketId),
    );
    if (allAcked) {
      if (game._cupDrawTimeout) clearTimeout(game._cupDrawTimeout);
      simulateCupRound(game, game.cupRound);
    }
  });

  // ── REQUEST PALMARES ──────────────────────────────────────────────────────
  socket.on("requestPalmares", async ({ teamId } = {}) => {
    const game = getGameBySocket(socket.id);
    if (!game) return;
    try {
      const rows = await runAll(
        game.db,
        `SELECT pa.season, pa.achievement, t.name as team_name
         FROM palmares pa
         JOIN teams t ON t.id = pa.team_id
         WHERE pa.team_id = ?
         ORDER BY pa.season DESC, pa.id DESC`,
        [teamId],
      );
      const allChampions = await runAll(
        game.db,
        `SELECT pa.season, pa.achievement, t.id as team_id, t.name as team_name, t.color_primary, t.color_secondary
         FROM palmares pa
         JOIN teams t ON t.id = pa.team_id
         ORDER BY pa.season DESC, pa.id DESC`,
      );
      socket.emit("palmaresData", { teamId, trophies: rows, allChampions });
    } catch (err) {
      console.error(`[${game.roomCode}] requestPalmares error:`, err);
      socket.emit("palmaresData", { teamId, trophies: [], allChampions: [] });
    }
  });

  // ── HELPERS ────────────────────────────────────────────────────────────────
  function generateRandomTeam(game, socket, name, roomCode, managerId) {
    const takenTeamIds = Object.values(game.playersByName)
      .map((p) => p.teamId)
      .filter(Boolean);
    const placeholders = takenTeamIds.map(() => "?").join(",");
    let query =
      "SELECT id, name FROM teams WHERE division = 4 AND manager_id IS NULL";
    let params = [];
    if (takenTeamIds.length > 0) {
      query += ` AND id NOT IN (${placeholders})`;
      params = [...takenTeamIds];
    }
    query += " ORDER BY RANDOM() LIMIT 1";

    game.db.get(query, params, (err, team) => {
      if (err || !team) {
        let fallbackQuery = "SELECT id, name FROM teams WHERE division = 4";
        let fallbackParams = [];
        if (takenTeamIds.length > 0) {
          fallbackQuery += ` AND id NOT IN (${placeholders})`;
          fallbackParams = [...takenTeamIds];
        }
        fallbackQuery += " ORDER BY RANDOM() LIMIT 1";

        game.db.get(fallbackQuery, fallbackParams, (err2, team2) => {
          if (err2 || !team2) {
            socket.emit(
              "systemMessage",
              "Nenhuma equipa disponível na Divisão 4.",
            );
            return;
          }
          game.db.run(
            "UPDATE teams SET manager_id = ? WHERE id = ?",
            [managerId, team2.id],
            () => {
              assignPlayer(game, socket, name, team2, roomCode);
            },
          );
        });
        return;
      }
      game.db.run(
        "UPDATE teams SET manager_id = ? WHERE id = ?",
        [managerId, team.id],
        () => {
          assignPlayer(game, socket, name, team, roomCode);
        },
      );
    });
  }

  function assignPlayer(game, socket, name, team, roomCode) {
    // BUG-01 FIX: Index player by name (not socket.id). If already in the map,
    // just refresh the socket binding (reconnect support).
    if (!game.playersByName[name]) {
      game.playersByName[name] = {
        name,
        teamId: team.id,
        roomCode,
        ready: false,
        tactic: { formation: "4-4-2", style: "Balanced" },
        socketId: socket.id,
      };
    }
    bindSocket(game, name, socket.id);

    game.db.all("SELECT * FROM teams", (err, teams) =>
      socket.emit("teamsData", teams),
    );
    game.db.all(
      "SELECT * FROM players WHERE team_id = ?",
      [team.id],
      (err, squad) => socket.emit("mySquad", squad),
    );
    socket.emit("marketUpdate", game.globalMarket);
    socket.emit("gameState", {
      matchweek: game.matchweek,
      matchState: game.matchState,
      year: game.year,
      tactic: game.playersByName[name]?.tactic || null,
    });
    io.to(roomCode).emit("playerListUpdate", getPlayerList(game));

    game.db.all(
      "SELECT p.id, p.name, p.position, p.goals, p.team_id, t.name as team_name, t.color_primary, t.color_secondary FROM players p LEFT JOIN teams t ON p.team_id = t.id WHERE p.goals > 0 ORDER BY p.goals DESC, p.skill DESC LIMIT 20",
      (err3, scorers) => {
        socket.emit("topScorers", scorers || []);
      },
    );

    socket.emit(
      "systemMessage",
      `Foste contratado pelo ${team.name} (Divisão 4)!`,
    );
  }

  // ── BUY PLAYER ────────────────────────────────────────────────────────────
  socket.on("buyPlayer", (playerId) => {
    const game = getGameBySocket(socket.id);
    if (!game) return;
    const playerState = getPlayerBySocket(game, socket.id);
    if (!playerState) return;

    game.db.get(
      "SELECT * FROM players WHERE id = ?",
      [playerId],
      (err, player) => {
        if (!player) return;
        game.db.get(
          "SELECT budget FROM teams WHERE id = ?",
          [playerState.teamId],
          (err2, team) => {
            if (!team) return;

            const listedPrice =
              player.transfer_status && player.transfer_status !== "none"
                ? player.transfer_price || Math.round(player.value * 0.8)
                : Math.round(player.value * 1.2);
            const price = listedPrice;
            if (team.budget >= price) {
              game.db.run(
                "UPDATE teams SET budget = budget - ? WHERE id = ?",
                [price, playerState.teamId],
                () => {
                  if (player.team_id && player.team_id !== playerState.teamId) {
                    game.db.run(
                      "UPDATE teams SET budget = budget + ? WHERE id = ?",
                      [price, player.team_id],
                    );
                  }
                  game.db.run(
                    "UPDATE players SET team_id = ?, contract_until_matchweek = ?, transfer_status = 'none', transfer_price = 0, contract_request_pending = 0, contract_requested_wage = 0 WHERE id = ?",
                    [
                      playerState.teamId,
                      getSeasonEndMatchweek(game.matchweek),
                      playerId,
                    ],
                    () => {
                      refreshMarket(game);
                      game.db.all("SELECT * FROM teams", (err3, teams) =>
                        io.to(game.roomCode).emit("teamsData", teams),
                      );
                      game.db.all(
                        "SELECT * FROM players WHERE team_id = ?",
                        [playerState.teamId],
                        (err4, squad) => socket.emit("mySquad", squad),
                      );
                      socket.emit(
                        "systemMessage",
                        `Contrataste ${player.name} por €${price}!`,
                      );
                    },
                  );
                },
              );
            } else {
              socket.emit(
                "systemMessage",
                "Não tens fundo de maneio suficiente!",
              );
            }
          },
        );
      },
    );
  });

  socket.on("listPlayerForTransfer", ({ playerId, mode, price }) => {
    const game = getGameBySocket(socket.id);
    if (!game) return;
    const playerState = getPlayerBySocket(game, socket.id);
    if (!playerState) return;

    game.db.get(
      "SELECT * FROM players WHERE id = ? AND team_id = ?",
      [playerId, playerState.teamId],
      (err, player) => {
        if (!player) return;
        const finalMode = mode === "auction" ? "auction" : "fixed";
        const finalPrice = Math.max(
          0,
          Math.round(
            price || player.value * (finalMode === "auction" ? 0.75 : 1.0),
          ),
        );

        if (finalMode === "auction") {
          startAuction(game, player, finalPrice, () => {
            socket.emit(
              "systemMessage",
              `${player.name} colocado em leilão por €${finalPrice}.`,
            );
          });
        } else {
          game.db.run(
            "UPDATE players SET transfer_status = ?, transfer_price = ? WHERE id = ?",
            [finalMode, finalPrice, playerId],
            () => {
              refreshMarket(game);
              socket.emit(
                "systemMessage",
                `${player.name} colocado na lista por €${finalPrice}.`,
              );
            },
          );
        }
      },
    );
  });

  // ── SET TACTIC ────────────────────────────────────────────────────────────
  socket.on("setTactic", (tactic) => {
    const game = getGameBySocket(socket.id);
    const playerState = getPlayerBySocket(game, socket.id);
    if (game && playerState) {
      playerState.tactic = tactic;
    }
  });

  socket.on("renewContract", ({ playerId, offeredWage }) => {
    const game = getGameBySocket(socket.id);
    if (!game) return;
    const playerState = getPlayerBySocket(game, socket.id);
    if (!playerState) return;

    game.db.get(
      "SELECT * FROM players WHERE id = ? AND team_id = ?",
      [playerId, playerState.teamId],
      (err, player) => {
        if (err || !player) return;

        const demandedWage = Math.max(
          Math.round((player.skill || 0) * 70),
          Math.round((player.wage || 0) * 1.15),
        );
        const acceptedWage = Math.max(0, Math.round(offeredWage || 0));
        const seasonEnd = getSeasonEndMatchweek(game.matchweek);

        if (acceptedWage >= demandedWage) {
          game.db.run(
            "UPDATE players SET wage = ?, contract_until_matchweek = ?, contract_request_pending = 0, contract_requested_wage = 0, transfer_status = 'none', transfer_price = 0 WHERE id = ?",
            [acceptedWage, seasonEnd, playerId],
            () => {
              refreshMarket(game);
              emitSquadForPlayer(game, playerState.teamId);
              socket.emit(
                "systemMessage",
                `${player.name} renovou até ao fim da época por €${acceptedWage}/sem.`,
              );
            },
          );
        } else {
          const auctionPrice = Math.max(
            Math.round(player.value * 0.65),
            demandedWage * 12,
          );
          listPlayerOnMarket(game, playerId, "auction", auctionPrice, () => {
            game.db.run(
              "UPDATE players SET contract_request_pending = 0, contract_requested_wage = 0 WHERE id = ?",
              [playerId],
            );
            socket.emit(
              "systemMessage",
              `${player.name} recusou e foi para leilão.`,
            );
          });
        }
      },
    );
  });

  socket.on("placeAuctionBid", ({ playerId, bidAmount }) => {
    const game = getGameBySocket(socket.id);
    if (!game) return;
    const playerState = getPlayerBySocket(game, socket.id);
    if (!playerState) return;

    placeAuctionBid(game, playerState.teamId, playerId, bidAmount, io).then(
      (result) => {
        if (!result.ok) {
          socket.emit("systemMessage", result.error);
        } else {
          socket.emit(
            "systemMessage",
            `Lance submetido: €${Math.round(bidAmount)}.`,
          );
        }
      },
    );
  });
  // ── BUILD STADIUM ─────────────────────────────────────────────────────────
  socket.on("buildStadium", () => {
    const game = getGameBySocket(socket.id);
    if (!game) return;
    const playerState = getPlayerBySocket(game, socket.id);
    if (!playerState) return;
    game.db.get(
      "SELECT budget, stadium_capacity FROM teams WHERE id = ?",
      [playerState.teamId],
      (err, team) => {
        const cost = 150000;
        if (team && team.budget >= cost) {
          game.db.run(
            "UPDATE teams SET budget = budget - ?, stadium_capacity = stadium_capacity + 5000 WHERE id = ?",
            [cost, playerState.teamId],
            () => {
              game.db.all("SELECT * FROM teams", (err2, teams) =>
                io.to(game.roomCode).emit("teamsData", teams),
              );
              socket.emit("systemMessage", "+5000 Lugares Construídos!");
            },
          );
        } else {
          socket.emit("systemMessage", "Sem dinheiro (Custo: 150.000€)!");
        }
      },
    );
  });

  // ── TAKE LOAN ─────────────────────────────────────────────────────────────
  socket.on("takeLoan", () => {
    const game = getGameBySocket(socket.id);
    if (!game) return;
    const playerState = getPlayerBySocket(game, socket.id);
    if (!playerState) return;
    game.db.get(
      "SELECT budget, loan_amount FROM teams WHERE id = ?",
      [playerState.teamId],
      (err, team) => {
        if (!team) return;
        if (team.loan_amount >= 2000000) {
          socket.emit(
            "systemMessage",
            "Já tens demasiada dívida (máx: 2.000.000€)!",
          );
          return;
        }
        game.db.run(
          "UPDATE teams SET budget = budget + 500000, loan_amount = loan_amount + 500000 WHERE id = ?",
          [playerState.teamId],
          () => {
            game.db.all("SELECT * FROM teams", (err2, teams) =>
              io.to(game.roomCode).emit("teamsData", teams),
            );
            socket.emit(
              "systemMessage",
              "Empréstimo de 500.000€ aprovado (Juro 1%/Semana).",
            );
          },
        );
      },
    );
  });

  // ── PAY LOAN ──────────────────────────────────────────────────────────────
  socket.on("payLoan", () => {
    const game = getGameBySocket(socket.id);
    if (!game) return;
    const playerState = getPlayerBySocket(game, socket.id);
    if (!playerState) return;
    game.db.get(
      "SELECT budget, loan_amount FROM teams WHERE id = ?",
      [playerState.teamId],
      (err, team) => {
        if (team && team.loan_amount >= 500000 && team.budget >= 500000) {
          game.db.run(
            "UPDATE teams SET budget = budget - 500000, loan_amount = loan_amount - 500000 WHERE id = ?",
            [playerState.teamId],
            () => {
              game.db.all("SELECT * FROM teams", (err2, teams) =>
                io.to(game.roomCode).emit("teamsData", teams),
              );
              socket.emit("systemMessage", "Dívida paga (500.000€) ao Banco.");
            },
          );
        } else {
          socket.emit(
            "systemMessage",
            "Não deves esse valor, ou não tens 500k disponíveis.",
          );
        }
      },
    );
  });

  // ── SET READY ─────────────────────────────────────────────────────────────
  // BUG-06 FIX: setReady now accepts an explicit boolean from the client.
  // The halftime "CONFIRMAR" button always sends true to avoid toggle-race.
  socket.on("setReady", (ready) => {
    const game = getGameBySocket(socket.id);
    if (!game) return;
    const playerState = getPlayerBySocket(game, socket.id);
    if (!playerState) return;
    playerState.ready = ready;
    io.to(game.roomCode).emit("playerListUpdate", getPlayerList(game));
    checkAllReady(game);
  });

  // ── REQUEST TEAM SQUAD ───────────────────────────────────────────────────
  socket.on("requestTeamSquad", (teamId) => {
    const game = getGameBySocket(socket.id);
    if (!game) return;

    game.db.all(
      "SELECT * FROM players WHERE team_id = ? ORDER BY position, skill DESC, name",
      [teamId],
      (err, squad) => {
        socket.emit("teamSquadData", {
          teamId,
          squad: err ? [] : squad || [],
        });
      },
    );
  });

  // ── RESOLVE LIVE MATCH ACTION ────────────────────────────────────────────
  socket.on("resolveMatchAction", ({ actionId, teamId, playerId }) => {
    const game = getGameBySocket(socket.id);
    if (!game || !game.pendingMatchAction) return;
    if (game.pendingMatchAction.actionId !== actionId) return;
    if (game.pendingMatchAction.teamId !== teamId) return;

    const pending = game.pendingMatchAction;
    clearTimeout(pending.timer);
    game.pendingMatchAction = null;
    if (playerId === null || playerId === undefined) {
      pending.finalize(pending.fallback ? pending.fallback() : null, "auto");
    } else {
      pending.finalize(playerId, "human");
    }
  });

  // ── DISCONNECT ────────────────────────────────────────────────────────────
  // BUG-01 FIX: On disconnect, keep the player entry so they can reconnect.
  // We only remove the socket binding.
  socket.on("disconnect", () => {
    const game = getGameBySocket(socket.id);
    if (game) {
      unbindSocket(game, socket.id);
      io.to(game.roomCode).emit("playerListUpdate", getPlayerList(game));
    }
  });
});

// ── MATCH FLOW ────────────────────────────────────────────────────────────────

// Guard flag: prevents checkAllReady from starting the weekly loop a second
// time if it fires while the previous loop's async DB work is still in flight.
const weeklyLoopRunning = {};

async function checkAllReady(game) {
  // Only consider currently connected players
  const connectedPlayers = getPlayerList(game);
  if (connectedPlayers.length === 0) return;

  const allReady = connectedPlayers.every((p) => p.ready);
  if (!allReady) return;

  console.log(
    `[${game.roomCode}] All players ready — matchweek=${game.matchweek} matchState=${game.matchState}`,
  );

  if (game.matchState === "idle") {
    // Guard against double-entry while async DB work is in progress
    if (weeklyLoopRunning[game.roomCode]) return;
    weeklyLoopRunning[game.roomCode] = true;

    // Lock state immediately so no second call can enter here
    game.matchState = "running_first_half";

    // Weekly financial loop
    game.db.run(
      `
      UPDATE teams 
      SET budget = budget 
        - CAST((loan_amount * 0.01) AS INTEGER) 
        + (stadium_capacity * 10)
        - (SELECT COALESCE(SUM(wage), 0) FROM players WHERE players.team_id = teams.id)
    `,
      async (err) => {
        if (err) {
          console.error(`[${game.roomCode}] Weekly Loop Err:`, err);
          // Recover: release the lock and reset state so the room is not stuck
          game.matchState = "idle";
          weeklyLoopRunning[game.roomCode] = false;
          return;
        }

        const mw = game.matchweek;
        const f1 = await generateFixturesForDivision(game.db, 1, mw);
        const f2 = await generateFixturesForDivision(game.db, 2, mw);
        const f3 = await generateFixturesForDivision(game.db, 3, mw);
        const f4 = await generateFixturesForDivision(game.db, 4, mw);
        const f5 = await generateFixturesForDivision(game.db, 5, mw);
        game.fixtures = [...f1, ...f2, ...f3, ...f4, ...f5];

        await processSegment(game, 1, 45, "halftime");
        weeklyLoopRunning[game.roomCode] = false;
      },
    );
  } else if (game.matchState === "halftime") {
    // BUG-06 FIX: Prevent double execution if checkAllReady fires twice.
    // Immediately lock state to prevent re-entry.
    game.matchState = "playing_second_half";
    await processSegment(game, 46, 90, "idle");
  }
}

async function processSegment(game, startMin, endMin, nextState) {
  for (const fx of game.fixtures) {
    const p1 = Object.values(game.playersByName).find(
      (p) => p.teamId === fx.homeTeamId,
    );
    const p2 = Object.values(game.playersByName).find(
      (p) => p.teamId === fx.awayTeamId,
    );
    const t1 = p1 ? p1.tactic : { formation: "4-4-2", style: "Balanced" };
    const t2 = p2 ? p2.tactic : { formation: "4-4-2", style: "Balanced" };
    await simulateMatchSegment(game.db, fx, t1, t2, startMin, endMin, {
      game,
      io,
      matchweek: game.matchweek,
    });
  }

  if (nextState === "halftime") {
    game.matchState = nextState;
    const connectedPlayers = getPlayerList(game);
    io.to(game.roomCode).emit("halfTimeResults", {
      matchweek: game.matchweek,
      results: game.fixtures,
    });
    connectedPlayers.forEach((p) => {
      p.ready = false;
    });
    io.to(game.roomCode).emit("playerListUpdate", getPlayerList(game));
    saveGameState(game);
  } else {
    // Full-time — update standings in a single DB transaction then advance state.
    // RACE-CONDITION FIX: game.matchState is set to nextState ('idle') only
    // INSIDE the COMMIT callback, after the DB has been durably updated.
    // Previously it was set before the transaction which allowed checkAllReady
    // to start a new weekly loop while the previous commit was still in flight.
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

      game.db.run("COMMIT", (err) => {
        if (err) {
          console.error(`[${game.roomCode}] Standings update error:`, err);
          game.db.run("ROLLBACK");
          // Release state so the room is not permanently stuck
          game.matchState = "idle";
          return;
        }

        // Only advance state after a successful commit so that clients always
        // receive accurate, persisted standings data.
        game.matchState = nextState;
        const completedMatchweek = game.matchweek;

        io.to(game.roomCode).emit("matchResults", {
          matchweek: completedMatchweek,
          results: game.fixtures,
        });

        connectedPlayers.forEach((p) => {
          p.ready = false;
        });
        game.matchweek++;
        saveGameState(game);

        persistMatchResults(game, game.fixtures, completedMatchweek, () => {
          applyPostMatchQualityEvolution(game.db, game.fixtures, game.matchweek)
            .then(async () => {
              // ── CUP ROUND TRIGGER ───────────────────────────────────────
              // Normalise matchweek within the current season (1-14)
              const normMw = ((completedMatchweek - 1) % 14) + 1;
              const cupRound = CUP_ROUND_AFTER_MATCHWEEK[normMw];
              if (cupRound) {
                try {
                  await startCupRound(game, cupRound);
                } catch (cupErr) {
                  console.error(`[${game.roomCode}] Cup round error:`, cupErr);
                }
              }

              // ── SEASON END ──────────────────────────────────────────────
              // Only trigger here if there was NO cup final this matchweek.
              // When a cup final (round 5) exists, simulateCupRound handles season end.
              if (normMw === 14 && !cupRound) {
                try {
                  await applySeasonEnd(game);
                } catch (seErr) {
                  console.error(`[${game.roomCode}] Season end error:`, seErr);
                }
              }

              // ── CONTRACT EXPIRY + NPC TRANSFERS ─────────────────────────
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

              // Refresh market after NPC activity
              refreshMarket(game);

              game.db.all("SELECT * FROM teams", (err2, teams) => {
                if (!err2) io.to(game.roomCode).emit("teamsData", teams);

                game.db.all(
                  "SELECT p.id, p.name, p.position, p.goals, p.team_id, t.name as team_name, t.color_primary, t.color_secondary FROM players p LEFT JOIN teams t ON p.team_id = t.id WHERE p.goals > 0 ORDER BY p.goals DESC, p.skill DESC LIMIT 20",
                  (err3, scorers) => {
                    io.to(game.roomCode).emit("topScorers", scorers || []);

                    connectedPlayers.forEach((player) => {
                      if (!player.socketId) return;
                      game.db.all(
                        "SELECT * FROM players WHERE team_id = ?",
                        [player.teamId],
                        (err4, squad) => {
                          if (!err4) {
                            io.to(player.socketId).emit("mySquad", squad || []);
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
            .catch((error) => {
              console.error(
                `[${game.roomCode}] Post-match evolution error:`,
                error,
              );
            });
        });
      });
    });
  }
}

const PORT = 3000;
server.listen(PORT, () => {
  const portMsg = `Listening on port ${PORT}`;
  const pad = " ".repeat(Math.max(0, 35 - portMsg.length));
  console.log("");
  console.log("╔══════════════════════════════════════╗");
  console.log("║   CashBall 26/27 — Backend Server    ║");
  console.log(`║   ${portMsg}${pad}║`);
  console.log("╚══════════════════════════════════════╝");
  console.log("");
  console.log("[server] Health check available at /health");
  console.log("[server] Saves listing available at /saves");
  console.log("[server] Socket.io accepting connections...");
});

server.on("error", (err) => {
  console.error("[server] Fatal error:", err.message);
  process.exit(1);
});

process.on("uncaughtException", (err) => {
  console.error("[server] Uncaught exception:", err.message, err.stack);
});

process.on("unhandledRejection", (reason) => {
  console.error("[server] Unhandled promise rejection:", reason);
});
