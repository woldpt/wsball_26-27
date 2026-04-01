// @ts-nocheck
require("dotenv").config();

import type { ActiveGame, PlayerSession } from "./types";

type Db = any;
type AnyRow = Record<string, any>;

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
} = require("./gameManager") as {
  getGame: (
    roomCode: string,
    onReady?: (game: ActiveGame | null, error?: Error) => void,
  ) => ActiveGame | null;
  getGameBySocket: (socketId: string) => ActiveGame | null;
  saveGameState: (game: ActiveGame) => void;
  getPlayerBySocket: (
    game: ActiveGame,
    socketId: string,
  ) => PlayerSession | null;
  bindSocket: (game: ActiveGame, name: string, socketId: string) => void;
  unbindSocket: (game: ActiveGame, socketId: string) => void;
  getPlayerList: (game: ActiveGame) => PlayerSession[];
};
const {
  generateFixturesForDivision,
  simulateMatchSegment,
  applyPostMatchQualityEvolution,
  simulateExtraTime,
  simulatePenaltyShootout,
  getTeamSquad,
} = require("./game/engine") as {
  generateFixturesForDivision: (
    db: Db,
    division: number,
    matchweek: number,
  ) => Promise<any[]>;
  simulateMatchSegment: (...args: any[]) => Promise<void>;
  applyPostMatchQualityEvolution: (
    db: Db,
    fixtures: any[],
    currentMatchweek: number,
  ) => Promise<void>;
  simulateExtraTime: (...args: any[]) => Promise<any>;
  simulatePenaltyShootout: (...args: any[]) => any;
  getTeamSquad: (
    db: Db,
    teamId: number,
    tactic: any,
    currentMatchweek?: number,
  ) => Promise<any[]>;
};
const {
  verifyOrCreateManager,
  verifyManager,
  createManager,
  recordRoomAccess,
  getManagerRooms,
} = require("./auth");
const {
  getSeasonEndMatchweek,
  runAll,
  runGet,
  getStandingsRows,
  pickRefereeSummary,
  calculateMatchAttendance,
} = require("./coreHelpers") as {
  getSeasonEndMatchweek: (matchweek: number) => number;
  runAll: <T extends AnyRow = AnyRow>(
    db: Db,
    sql: string,
    params?: any[],
  ) => Promise<T[]>;
  runGet: <T extends AnyRow = AnyRow>(
    db: Db,
    sql: string,
    params?: any[],
  ) => Promise<T | null>;
  getStandingsRows: (teams?: AnyRow[]) => AnyRow[];
  pickRefereeSummary: (
    roomCode: string,
    teamId: number,
    opponentId: number,
    matchweek: number,
  ) => { name: string; balance: number; favorsTeamA: boolean };
  calculateMatchAttendance: (db: Db, homeTeamId: number) => Promise<number>;
};
const {
  setCupPhase,
  clearCupTimeout,
  armCupTimeout,
  allConnectedCoachesAcked,
  allCupCoachesAcked,
} = require("./cupHelpers") as {
  setCupPhase: (
    game: ActiveGame,
    phase: string,
    saveGameState: (game: ActiveGame) => void,
    round?: number,
  ) => string;
  clearCupTimeout: (game: ActiveGame, key: string) => void;
  armCupTimeout: (args: {
    game: ActiveGame;
    key: string;
    ms: number;
    phase: string;
    round: number;
    token: string;
    onElapsed: () => void;
  }) => void;
  allConnectedCoachesAcked: (game: ActiveGame, ackSet: Set<string>) => boolean;
  allCupCoachesAcked: (game: ActiveGame, ackSet: Set<string>) => boolean;
};
const {
  DIVISION_NAMES,
  CUP_ROUND_AFTER_MATCHWEEK,
  CUP_ROUND_NAMES,
  CUP_TEAMS_BY_ROUND,
  SEASON_CALENDAR,
} = require("./gameConstants") as {
  DIVISION_NAMES: Record<number, string>;
  CUP_ROUND_AFTER_MATCHWEEK: Record<number, number>;
  CUP_ROUND_NAMES: string[];
  CUP_TEAMS_BY_ROUND: Record<number, number>;
  SEASON_CALENDAR: Array<Record<string, any>>;
};
const { isMatchInProgress, finalizeAllRunningAuctions, cancelPendingCupDraw } =
  require("./matchFlowHelpers") as {
    isMatchInProgress: (game: ActiveGame) => boolean;
    finalizeAllRunningAuctions: (
      game: ActiveGame,
      finalizeAuction: (game: ActiveGame, playerId: number) => void,
    ) => void;
    cancelPendingCupDraw: (game: ActiveGame) => void;
  };
const { createAuctionHelpers } = require("./auctionHelpers") as {
  createAuctionHelpers: (deps: {
    io: any;
    isMatchInProgress: (game: ActiveGame) => boolean;
    getSeasonEndMatchweek: (matchweek: number) => number;
    scheduleNpcAuctionBids: (game: ActiveGame, playerId: number) => void;
  }) => {
    refreshMarket: (game: ActiveGame, emitToRoom?: boolean) => void;
    emitSquadForPlayer: (game: ActiveGame, teamId: number) => void;
    listPlayerOnMarket: (
      game: ActiveGame,
      playerId: number,
      mode: string,
      price: number,
      callback?: (...args: any[]) => void,
    ) => void;
    startAuction: (
      game: ActiveGame,
      player: any,
      startingPrice: number,
      callback?: (...args: any[]) => void,
    ) => void;
    finalizeAuction: (game: ActiveGame, playerId: number) => void;
    placeAuctionBid: (
      game: ActiveGame,
      teamId: number,
      playerId: number,
      bidAmount: number,
    ) => Promise<any>;
  };
};
const { createContractHelpers } = require("./contractHelpers") as {
  createContractHelpers: (deps: {
    io: any;
    getSeasonEndMatchweek: (matchweek: number) => number;
    runAll: <T extends AnyRow = AnyRow>(
      db: Db,
      sql: string,
      params?: any[],
    ) => Promise<T[]>;
    runGet: <T extends AnyRow = AnyRow>(
      db: Db,
      sql: string,
      params?: any[],
    ) => Promise<T | null>;
  }) => {
    maybeTriggerContractRequest: (game: ActiveGame, player: any) => void;
    processContractExpiries: (game: ActiveGame) => Promise<void>;
  };
};
const { createNpcTransferHelpers } = require("./npcTransferHelpers") as {
  createNpcTransferHelpers: (deps: {
    runAll: <T extends AnyRow = AnyRow>(
      db: Db,
      sql: string,
      params?: any[],
    ) => Promise<T[]>;
    getSeasonEndMatchweek: (matchweek: number) => number;
  }) => {
    processNpcTransferActivity: (
      game: ActiveGame,
      listPlayerOnMarket: (
        game: ActiveGame,
        playerId: number,
        mode: string,
        price: number,
        callback?: (...args: any[]) => void,
      ) => void,
    ) => Promise<void>;
    scheduleNpcAuctionBids: (
      game: ActiveGame,
      playerId: number,
      placeAuctionBid: (
        game: ActiveGame,
        teamId: number,
        playerId: number,
        bidAmount: number,
      ) => Promise<any>,
    ) => void;
  };
};
const { registerTransferSocketHandlers } =
  require("./socketTransferHandlers") as {
    registerTransferSocketHandlers: (
      socket: any,
      deps: {
        io: any;
        getGameBySocket: (socketId: string) => ActiveGame | null;
        getPlayerBySocket: (
          game: ActiveGame,
          socketId: string,
        ) => PlayerSession | null;
        getSeasonEndMatchweek: (matchweek: number) => number;
        isMatchInProgress: (game: ActiveGame) => boolean;
        refreshMarket: (game: ActiveGame, emitToRoom?: boolean) => void;
        emitSquadForPlayer: (game: ActiveGame, teamId: number) => void;
        listPlayerOnMarket: (
          game: ActiveGame,
          playerId: number,
          mode: string,
          price: number,
          callback?: (...args: any[]) => void,
        ) => void;
        startAuction: (
          game: ActiveGame,
          player: any,
          startingPrice: number,
          callback?: (...args: any[]) => void,
        ) => void;
        placeAuctionBid: (
          game: ActiveGame,
          teamId: number,
          playerId: number,
          bidAmount: number,
        ) => Promise<any>;
      },
    ) => void;
  };
const { registerFinanceSocketHandlers } =
  require("./socketFinanceHandlers") as {
    registerFinanceSocketHandlers: (
      socket: any,
      deps: {
        io: any;
        getGameBySocket: (socketId: string) => ActiveGame | null;
        getPlayerBySocket: (
          game: ActiveGame,
          socketId: string,
        ) => PlayerSession | null;
      },
    ) => void;
  };
const { registerGameplaySocketHandlers } =
  require("./socketGameplayHandlers") as {
    registerGameplaySocketHandlers: (
      socket: any,
      deps: {
        io: any;
        getGameBySocket: (socketId: string) => ActiveGame | null;
        getPlayerBySocket: (
          game: ActiveGame,
          socketId: string,
        ) => PlayerSession | null;
        getPlayerList: (game: ActiveGame) => PlayerSession[];
        unbindSocket: (game: ActiveGame, socketId: string) => void;
        checkAllReady: (game: ActiveGame) => void | Promise<void>;
        emitAwaitingCoaches: (game: ActiveGame) => void;
      },
    ) => void;
  };
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

// ── DELETE SAVE ───────────────────────────────────────────────────────────────
// Deletes a room's .db file. Only allowed if the requesting coach has access to
// that room and no players are currently connected to it.
app.delete("/saves/:roomCode", apiLimiter, async (req, res) => {
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

const auctionHelpers = createAuctionHelpers({
  io,
  isMatchInProgress,
  getSeasonEndMatchweek,
  scheduleNpcAuctionBids,
});

const contractHelpers = createContractHelpers({
  io,
  getSeasonEndMatchweek,
  runAll,
  runGet,
});

const npcTransferHelpers = createNpcTransferHelpers({
  runAll,
  getSeasonEndMatchweek,
});

async function getTeamRecentResults(
  game: ActiveGame,
  teamId: number,
  limit = 5,
) {
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

async function buildNextMatchSummary(game: ActiveGame, teamId: number) {
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

  const isHome = fixture.homeTeamId === team.id;
  const opponentId = isHome ? fixture.awayTeamId : fixture.homeTeamId;
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
    venue: isHome ? "Casa" : "Fora",
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

function persistMatchResults(
  game: ActiveGame,
  fixtures: any[],
  matchweek: number,
  onDone?: () => void,
) {
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
              matchweek, home_team_id, away_team_id, home_score, away_score, played, narrative, competition, attendance
            ) VALUES (?, ?, ?, ?, ?, 1, ?, 'League', ?)`,
            [
              game.matchweek,
              match.homeTeamId,
              match.awayTeamId,
              match.finalHomeGoals,
              match.finalAwayGoals,
              JSON.stringify(match.events || []),
              match.attendance || 0,
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

// ─── SEASON END ───────────────────────────────────────────────────────────────
// Called after matchweek 14 completes. Awards palmares, applies promo/relegation.
async function applySeasonEnd(game: ActiveGame) {
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

  // Promotion / relegation between divisions 1-4
  // Each boundary: bottom 2 of higher div drop, top 2 of lower div rise
  const promotions = []; // { teamId, fromDiv, toDiv }

  for (const [upperDiv, lowerDiv] of [
    [1, 2],
    [2, 3],
    [3, 4],
  ]) {
    const upper = byDiv[upperDiv] || [];
    const lower = byDiv[lowerDiv] || [];
    if (!upper.length || !lower.length) continue;

    const relegated = upper.slice(-2).map((t) => t.id);
    const promoted = lower.slice(0, 2).map((t) => t.id);

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

  // Reset standings for all divisions
  await new Promise((resolve) => {
    game.db.run(
      "UPDATE teams SET points=0, wins=0, draws=0, losses=0, goals_for=0, goals_against=0",
      resolve,
    );
  });

  // ── ACUMULAR STATS DE CARREIRA ANTES DO RESET DE ÉPOCA ──────────────────
  await new Promise((resolve) => {
    game.db.run(
      "UPDATE players SET career_goals = career_goals + goals, career_reds = career_reds + red_cards, career_injuries = career_injuries + injuries",
      resolve,
    );
  });

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
  game.cupFixtures = [];
  game.cupHumanInCup = false;
  game.cupRuntime = {
    phaseToken: "",
    drawPayload: null,
    preMatchPayload: null,
    halftimePayload: null,
    secondHalfPayload: null,
    fixtures: [],
  };
  game.pendingCupRound = null;
  game.leagueAnimAcks = new Set();
  game.cupSecondHalfAcks = new Set();
  if (game._leagueAnimTimeout) {
    clearTimeout(game._leagueAnimTimeout);
    game._leagueAnimTimeout = null;
  }
  if (game._cupPreMatchTimeout) {
    clearTimeout(game._cupPreMatchTimeout);
    game._cupPreMatchTimeout = null;
  }
  if (game._cupDrawTimeout) {
    clearTimeout(game._cupDrawTimeout);
    game._cupDrawTimeout = null;
  }
  if (game._cupHalftimeTimeout) {
    clearTimeout(game._cupHalftimeTimeout);
    game._cupHalftimeTimeout = null;
  }
  if (game._cupSecondHalfTimeout) {
    clearTimeout(game._cupSecondHalfTimeout);
    game._cupSecondHalfTimeout = null;
  }
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
async function generateCupDraw(game: ActiveGame, round: number) {
  const season = game.season;
  let teamIds;

  if (round === 1) {
    // All teams from divisions 1-4
    const teams = await runAll(
      game.db,
      "SELECT id FROM teams WHERE division BETWEEN 1 AND 4 ORDER BY id",
    );
    teamIds = teams.map((t) => t.id);
    if (teamIds.length !== CUP_TEAMS_BY_ROUND[1]) {
      throw new Error(
        `Cup round ${round} expected ${CUP_TEAMS_BY_ROUND[1]} teams from divisions 1-4, got ${teamIds.length}`,
      );
    }
  } else {
    // Winners of previous round
    const prevRound = await runAll(
      game.db,
      "SELECT winner_team_id FROM cup_matches WHERE season = ? AND round = ? AND played = 1",
      [season, round - 1],
    );
    teamIds = prevRound.map((r) => r.winner_team_id).filter(Boolean);
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

// ─── CUP EXTRA-TIME ANIMATION GATE ──────────────────────────────────────────
// Returns a promise that resolves once every connected coach has emitted
// "cupExtraTimeDone", or after `timeoutMs` milliseconds (whichever comes first).
function cupETAnimGate(game: ActiveGame, timeoutMs = 45000): Promise<void> {
  return new Promise<void>((resolve) => {
    const acks = new Set();
    const timeout = setTimeout(() => {
      delete game._cupETAnimHandler;
      resolve();
    }, timeoutMs);

    game._cupETAnimHandler = (socketId) => {
      acks.add(socketId);
      const connected = (
        Object.values(game.playersByName) as PlayerSession[]
      ).filter((p) => p.socketId);
      if (
        connected.length > 0 &&
        connected.every((p) => acks.has(p.socketId))
      ) {
        clearTimeout(timeout);
        delete game._cupETAnimHandler;
        resolve();
      }
    };
  });
}

async function finalizeCupRound(
  game: ActiveGame,
  round: number,
  expectedToken: string,
) {
  if (game.cupState !== "second_half_waiting" || game.cupRound !== round)
    return;
  if ((game.cupRuntime?.phaseToken || "") !== expectedToken) return;

  setCupPhase(game, "finalizing_cup_round", saveGameState, round);
  clearCupTimeout(game, "_cupSecondHalfTimeout");

  const season = game.season;
  const fixtures = game.cupFixtures || [];
  const roundName = CUP_ROUND_NAMES[round] || `Ronda ${round}`;
  const results = [];
  let hasAnyET = false;

  for (const fixture of fixtures) {
    const t1 = fixture._t1 || { formation: "4-4-2", style: "Balanced" };
    const t2 = fixture._t2 || { formation: "4-4-2", style: "Balanced" };
    const ctx = { game, io, matchweek: game.matchweek };

    let winnerId;
    if (fixture.finalHomeGoals !== fixture.finalAwayGoals) {
      winnerId =
        fixture.finalHomeGoals > fixture.finalAwayGoals
          ? fixture.homeTeamId
          : fixture.awayTeamId;
    } else {
      // Notify clients that this fixture is going to extra time
      hasAnyET = true;
      io.to(game.roomCode).emit("cupExtraTimeStart", {
        homeTeamId: fixture.homeTeamId,
        awayTeamId: fixture.awayTeamId,
        homeGoals: fixture.finalHomeGoals,
        awayGoals: fixture.finalAwayGoals,
      });
      await simulateExtraTime(game.db, fixture, t1, t2, ctx);

      if (fixture.finalHomeGoals !== fixture.finalAwayGoals) {
        winnerId =
          fixture.finalHomeGoals > fixture.finalAwayGoals
            ? fixture.homeTeamId
            : fixture.awayTeamId;
      } else {
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

        // Guardar info de pénaltis no fixture para incluir nos resultados finais
        fixture._penaltyHomeGoals = shootout.homeGoals;
        fixture._penaltyAwayGoals = shootout.awayGoals;
        fixture._decidedByPenalties = true;

        winnerId =
          shootout.homeGoals > shootout.awayGoals
            ? fixture.homeTeamId
            : fixture.awayTeamId;

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

      await new Promise((resolve) => {
        game.db.run(
          "UPDATE cup_matches SET home_et_score = ?, away_et_score = ? WHERE season = ? AND round = ? AND home_team_id = ? AND away_team_id = ?",
          [
            fixture.finalHomeGoals,
            fixture.finalAwayGoals,
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
      winnerId = fixture.homeTeamId;
    }

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
      wentToET:
        !!fixture._decidedByPenalties ||
        (fixture.finalHomeGoals === fixture.finalAwayGoals &&
          fixture.events.some((e) => e.minute > 90)),
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

  // If any fixture went to extra time AND there are humans in the cup,
  // wait for all clients to finish the ET animation (up to 45 s).
  if (hasAnyET && game.cupHumanInCup) {
    await cupETAnimGate(game, 45000);
  }

  game.cupFixtures = [];
  game.cupRuntime.drawPayload = null;
  game.cupRuntime.halftimePayload = null;
  game.cupRuntime.secondHalfPayload = null;
  game.cupRuntime.fixtures = [];
  setCupPhase(
    game,
    round === 5 ? "done_cup" : "done_round",
    saveGameState,
    round,
  );

  io.to(game.roomCode).emit("cupRoundResults", {
    round,
    roundName,
    results,
    season,
    isFinal: round === 5,
  });

  if (round === 5) {
    const normMw = ((game.matchweek - 2) % 14) + 1;
    if (normMw === 14 || normMw === 0) {
      try {
        await applySeasonEnd(game);
      } catch (seErr) {
        console.error(`[${game.roomCode}] Season end error (from cup):`, seErr);
      }
    }
  }
}

// ─── CUP: START ROUND ─────────────────────────────────────────────────────────
// Called after the league matchweek that triggers a cup round.
// If any human is still in the cup, emits the draw popup; otherwise auto-sims.
async function startCupRound(game: ActiveGame, round: number) {
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
  game.cupHumanInCup = humanInCup;

  const drawPayload = {
    round,
    roundName: CUP_ROUND_NAMES[round] || `Ronda ${round}`,
    fixtures: enriched,
    humanInCup,
    season: game.season,
  };

  const drawToken = setCupPhase(game, "draw", saveGameState, round);
  game.cupRuntime.drawPayload = drawPayload;
  game.cupRuntime.halftimePayload = null;
  game.cupRuntime.secondHalfPayload = null;
  game.cupRuntime.fixtures = [];
  saveGameState(game);

  io.to(game.roomCode).emit("cupDrawStart", drawPayload);

  if (!humanInCup) {
    await simulateCupFirstHalf(game, round, drawToken);
  } else {
    armCupTimeout({
      game,
      key: "_cupDrawTimeout",
      ms: 30000,
      phase: "draw",
      round,
      token: drawToken,
      onElapsed: () => {
        console.log(
          `[${game.roomCode}] Cup draw timeout — auto-proceeding round ${round}`,
        );
        simulateCupFirstHalf(game, round, drawToken);
      },
    });
  }
}

// ─── CUP: SIMULATE FIRST HALF ─────────────────────────────────────────────────
async function simulateCupFirstHalf(
  game: ActiveGame,
  round: number,
  expectedToken: string,
) {
  if (
    (game.cupState !== "draw" && game.cupState !== "pre_match") ||
    game.cupRound !== round
  )
    return;
  if ((game.cupRuntime?.phaseToken || "") !== expectedToken) return;

  clearCupTimeout(game, "_cupDrawTimeout");
  clearCupTimeout(game, "_cupPreMatchTimeout");
  setCupPhase(game, "playing_first_half", saveGameState, round);

  const season = game.season;
  const matchRows = await runAll(
    game.db,
    "SELECT * FROM cup_matches WHERE season = ? AND round = ? AND played = 0",
    [season, round],
  );

  const fixtures = [];
  const roundName = CUP_ROUND_NAMES[round] || `Ronda ${round}`;

  for (const row of matchRows) {
    const fixture: any = {
      _dbRow: row,
      homeTeamId: row.home_team_id,
      awayTeamId: row.away_team_id,
      finalHomeGoals: 0,
      finalAwayGoals: 0,
      events: [],
    };

    const p1 = (Object.values(game.playersByName) as PlayerSession[]).find(
      (p) => p.teamId === row.home_team_id,
    );
    const p2 = (Object.values(game.playersByName) as PlayerSession[]).find(
      (p) => p.teamId === row.away_team_id,
    );
    fixture._t1 = p1 ? p1.tactic : { formation: "4-4-2", style: "Balanced" };
    fixture._t2 = p2 ? p2.tactic : { formation: "4-4-2", style: "Balanced" };

    const ctx = { game, io, matchweek: game.matchweek };
    await simulateMatchSegment(
      game.db,
      fixture,
      fixture._t1,
      fixture._t2,
      1,
      45,
      ctx,
    );

    fixtures.push(fixture);
  }

  // Enrich with team info for the UI
  const enrichedHalftime = await Promise.all(
    fixtures.map(async (fx) => {
      const home = await runGet(
        game.db,
        "SELECT id, name, color_primary, color_secondary FROM teams WHERE id = ?",
        [fx.homeTeamId],
      );
      const away = await runGet(
        game.db,
        "SELECT id, name, color_primary, color_secondary FROM teams WHERE id = ?",
        [fx.awayTeamId],
      );
      return {
        homeTeam: home,
        awayTeam: away,
        homeGoals: fx.finalHomeGoals,
        awayGoals: fx.finalAwayGoals,
        events: fx.events.slice(),
        homeLineup: fx.homeLineup || [],
        awayLineup: fx.awayLineup || [],
        attendance: fx.attendance || null,
        referee: pickRefereeSummary(
          game.roomCode,
          fx.homeTeamId,
          fx.awayTeamId,
          game.matchweek,
        ),
      };
    }),
  );

  // Persist cup fixtures so the second-half function can resume them
  game.cupFixtures = fixtures;
  game.cupRuntime.fixtures = fixtures;
  const halftimeToken = setCupPhase(game, "halftime", saveGameState, round);
  game.cupHalfTimeAcks = new Set();
  game.cupRuntime.halftimePayload = {
    round,
    roundName,
    season,
    fixtures: enrichedHalftime,
  };
  game.cupRuntime.secondHalfPayload = null;
  saveGameState(game);

  io.to(game.roomCode).emit(
    "cupHalfTimeResults",
    game.cupRuntime.halftimePayload,
  );

  // Also update player list so the client knows to show "ready" state
  io.to(game.roomCode).emit("playerListUpdate", getPlayerList(game));

  if (!game.cupHumanInCup) {
    await simulateCupSecondHalf(game, round, halftimeToken);
  } else {
    armCupTimeout({
      game,
      key: "_cupHalftimeTimeout",
      ms: 30000,
      phase: "halftime",
      round,
      token: halftimeToken,
      onElapsed: () => {
        console.log(
          `[${game.roomCode}] Cup halftime timeout — auto-proceeding round ${round}`,
        );
        simulateCupSecondHalf(game, round, halftimeToken);
      },
    });
  }
}

// ─── CUP: SIMULATE SECOND HALF ────────────────────────────────────────────────
async function simulateCupSecondHalf(
  game: ActiveGame,
  round: number,
  expectedToken: string,
) {
  if (game.cupState !== "halftime" || game.cupRound !== round) return;
  if ((game.cupRuntime?.phaseToken || "") !== expectedToken) return;

  clearCupTimeout(game, "_cupHalftimeTimeout");
  setCupPhase(game, "playing_second_half", saveGameState, round);

  const season = game.season;
  const fixtures = game.cupFixtures || [];
  const roundName = CUP_ROUND_NAMES[round] || `Ronda ${round}`;

  // ── PHASE 1: simulate minutes 46-90 for every fixture ──────────────────────
  for (const fixture of fixtures) {
    const t1 = fixture._t1 || { formation: "4-4-2", style: "Balanced" };
    const t2 = fixture._t2 || { formation: "4-4-2", style: "Balanced" };
    const ctx = { game, io, matchweek: game.matchweek };
    await simulateMatchSegment(game.db, fixture, t1, t2, 46, 90, ctx);
  }

  // ── PHASE 2: send second-half start event so clients animate 45→90 ─────────
  const enrichedSecondHalf = await Promise.all(
    fixtures.map(async (fx) => {
      const home = await runGet(
        game.db,
        "SELECT id, name, color_primary, color_secondary FROM teams WHERE id = ?",
        [fx.homeTeamId],
      );
      const away = await runGet(
        game.db,
        "SELECT id, name, color_primary, color_secondary FROM teams WHERE id = ?",
        [fx.awayTeamId],
      );
      return {
        homeTeamId: fx.homeTeamId,
        awayTeamId: fx.awayTeamId,
        finalHomeGoals: fx.finalHomeGoals,
        finalAwayGoals: fx.finalAwayGoals,
        events: fx.events.slice(),
        homeTeam: home,
        awayTeam: away,
        homeLineup: fx.homeLineup || [],
        awayLineup: fx.awayLineup || [],
        attendance: fx.attendance || null,
        referee: pickRefereeSummary(
          game.roomCode,
          fx.homeTeamId,
          fx.awayTeamId,
          game.matchweek,
        ),
      };
    }),
  );

  const secondHalfPayload = {
    round,
    roundName,
    season,
    results: enrichedSecondHalf,
  };

  const secondHalfToken = setCupPhase(
    game,
    "second_half_waiting",
    saveGameState,
    round,
  );
  game.cupSecondHalfAcks = new Set();
  game.cupRuntime.secondHalfPayload = secondHalfPayload;
  game.cupRuntime.fixtures = fixtures;
  saveGameState(game);

  io.to(game.roomCode).emit("cupSecondHalfStart", secondHalfPayload);

  if (game.cupHumanInCup) {
    armCupTimeout({
      game,
      key: "_cupSecondHalfTimeout",
      ms: 90000,
      phase: "second_half_waiting",
      round,
      token: secondHalfToken,
      onElapsed: () => {
        console.log(
          `[${game.roomCode}] Cup 2nd-half anim timeout — auto-proceeding round ${round}`,
        );
        finalizeCupRound(game, round, secondHalfToken);
      },
    });
    return;
  }

  await finalizeCupRound(game, round, secondHalfToken);
}

function emitCurrentCupPhaseToSocket(game: ActiveGame, socket: any) {
  const runtime = game.cupRuntime || {};
  if (game.cupState === "draw" && runtime.drawPayload) {
    socket.emit("cupDrawStart", runtime.drawPayload);
    return;
  }
  if (game.cupState === "pre_match" && runtime.preMatchPayload) {
    socket.emit("cupPreMatch", runtime.preMatchPayload);
    return;
  }
  if (game.cupState === "halftime" && runtime.halftimePayload) {
    socket.emit("cupHalfTimeResults", runtime.halftimePayload);
    return;
  }
  if (game.cupState === "second_half_waiting" && runtime.secondHalfPayload) {
    socket.emit("cupSecondHalfStart", runtime.secondHalfPayload);
  }
}

function ensureCupPhaseTimeout(game: ActiveGame) {
  const token = game.cupRuntime?.phaseToken;
  const round = game.cupRound;
  if (!token || !round) return;

  if (game.cupState === "pre_match" && !game._cupPreMatchTimeout) {
    armCupTimeout({
      game,
      key: "_cupPreMatchTimeout",
      ms: 60000,
      phase: "pre_match",
      round,
      token,
      onElapsed: () => {
        console.log(
          `[${game.roomCode}] Cup pre-match timeout — auto-starting round ${round}`,
        );
        simulateCupFirstHalf(game, round, token);
      },
    });
  }

  if (game.cupState === "draw" && !game._cupDrawTimeout) {
    armCupTimeout({
      game,
      key: "_cupDrawTimeout",
      ms: 30000,
      phase: "draw",
      round,
      token,
      onElapsed: () => {
        console.log(
          `[${game.roomCode}] Cup draw timeout — auto-proceeding round ${round}`,
        );
        simulateCupFirstHalf(game, round, token);
      },
    });
  }

  if (game.cupState === "halftime" && !game._cupHalftimeTimeout) {
    armCupTimeout({
      game,
      key: "_cupHalftimeTimeout",
      ms: 30000,
      phase: "halftime",
      round,
      token,
      onElapsed: () => {
        console.log(
          `[${game.roomCode}] Cup halftime timeout — auto-proceeding round ${round}`,
        );
        simulateCupSecondHalf(game, round, token);
      },
    });
  }

  if (game.cupState === "second_half_waiting" && !game._cupSecondHalfTimeout) {
    armCupTimeout({
      game,
      key: "_cupSecondHalfTimeout",
      ms: 90000,
      phase: "second_half_waiting",
      round,
      token,
      onElapsed: () => {
        console.log(
          `[${game.roomCode}] Cup 2nd-half anim timeout — auto-proceeding round ${round}`,
        );
        finalizeCupRound(game, round, token);
      },
    });
  }
}

const refreshMarket = auctionHelpers.refreshMarket;
const emitSquadForPlayer = auctionHelpers.emitSquadForPlayer;
const listPlayerOnMarket = auctionHelpers.listPlayerOnMarket;
const startAuction = auctionHelpers.startAuction;
const finalizeAuction = auctionHelpers.finalizeAuction;
const placeAuctionBid = auctionHelpers.placeAuctionBid;

// ─── CONTRACT EXPIRY CHECK ─────────────────────────────────────────────────
// Called after each matchweek. Releases players whose contracts expired and
// triggers renewal requests for players approaching contract end.
const processContractExpiries = contractHelpers.processContractExpiries;

// ─── NPC TRANSFER ACTIVITY ─────────────────────────────────────────────────
// Called after each matchweek. NPC teams buy players they need.
const processNpcTransferActivity = (game) =>
  npcTransferHelpers.processNpcTransferActivity(game, listPlayerOnMarket);

// ─── NPC AUCTION BIDDING ───────────────────────────────────────────────────
// Sealed-bid model: each NPC team places exactly one blind bid at a random
// delay (2-12s). Bid amount is random between startingPrice and a cap.
function scheduleNpcAuctionBids(game, playerId) {
  return npcTransferHelpers.scheduleNpcAuctionBids(
    game,
    playerId,
    placeAuctionBid,
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

    const allAcked = allConnectedCoachesAcked(game, game.cupDrawAcks);
    if (allAcked) {
      clearCupTimeout(game, "_cupDrawTimeout");
      const preMatchToken = setCupPhase(
        game,
        "pre_match",
        saveGameState,
        game.cupRound,
      );
      game.cupPreMatchAcks = new Set();
      const preMatchRoundName =
        CUP_ROUND_NAMES[game.cupRound] || `Ronda ${game.cupRound}`;
      const preMatchPayload = {
        round: game.cupRound,
        roundName: preMatchRoundName,
        season: game.season,
        cupTeamIds: game.cupTeamIds || [],
      };
      game.cupRuntime.preMatchPayload = preMatchPayload;
      io.to(game.roomCode).emit("cupPreMatch", preMatchPayload);
      Object.values(game.playersByName).forEach((p) => {
        p.ready = false;
      });
      io.to(game.roomCode).emit("playerListUpdate", getPlayerList(game));
      armCupTimeout({
        game,
        key: "_cupPreMatchTimeout",
        ms: 60000,
        phase: "pre_match",
        round: game.cupRound,
        token: preMatchToken,
        onElapsed: () => {
          console.log(
            `[${game.roomCode}] Cup pre-match timeout — auto-starting round ${game.cupRound}`,
          );
          simulateCupFirstHalf(
            game,
            game.cupRound,
            game.cupRuntime?.phaseToken,
          );
        },
      });
    }
  });

  // ── CUP KICK OFF ──────────────────────────────────────────────────────────
  socket.on("cupKickOff", () => {
    const game = getGameBySocket(socket.id);
    if (!game || game.cupState !== "pre_match") return;
    const player = getPlayerBySocket(game, socket.id);
    if (!player || !game.cupTeamIds.includes(player.teamId)) return;
    player.ready = true;
    game.cupPreMatchAcks = game.cupPreMatchAcks || new Set();
    game.cupPreMatchAcks.add(socket.id);
    io.to(game.roomCode).emit("playerListUpdate", getPlayerList(game));
    const allReady = allCupCoachesAcked(game, game.cupPreMatchAcks);
    if (allReady) {
      clearCupTimeout(game, "_cupPreMatchTimeout");
      Object.values(game.playersByName).forEach((p) => {
        p.ready = false;
      });
      simulateCupFirstHalf(game, game.cupRound, game.cupRuntime?.phaseToken);
    }
  });

  // ── CUP HALF TIME READY ───────────────────────────────────────────────────
  socket.on("cupHalfTimeReady", () => {
    const game = getGameBySocket(socket.id);
    if (!game || game.cupState !== "halftime") return;

    game.cupHalfTimeAcks.add(socket.id);

    const allReady = allCupCoachesAcked(game, game.cupHalfTimeAcks);
    if (allReady) {
      clearCupTimeout(game, "_cupHalftimeTimeout");
      simulateCupSecondHalf(game, game.cupRound, game.cupRuntime?.phaseToken);
    }
  });

  // ── LEAGUE ANIMATION DONE ─────────────────────────────────────────────────
  // Client emits this after the league 2nd-half animation finishes (liveMinute >= 90).
  // Only then do we start the cup round draw so the popup doesn't interrupt the animation.
  socket.on("leagueAnimDone", () => {
    const game = getGameBySocket(socket.id);
    if (!game || game.pendingCupRound == null) return;

    game.leagueAnimAcks.add(socket.id);

    const connected = getPlayerList(game).filter((p) => p.socketId);
    const allDone = connected.every((p) => game.leagueAnimAcks.has(p.socketId));
    if (allDone) {
      if (game._leagueAnimTimeout) clearTimeout(game._leagueAnimTimeout);
      const r = game.pendingCupRound;
      game.pendingCupRound = null;
      game.leagueAnimAcks = new Set();
      startCupRound(game, r).catch((cupErr) =>
        console.error(`[${game.roomCode}] Cup round error:`, cupErr),
      );
    }
  });

  // ── CUP SECOND HALF ANIMATION DONE ───────────────────────────────────────
  // Client emits this after the cup 2nd-half animation finishes (liveMinute >= 90).
  // Only cup-team humans need to send this.
  socket.on("cupSecondHalfDone", () => {
    const game = getGameBySocket(socket.id);
    if (!game || game.cupState !== "second_half_waiting") return;

    game.cupSecondHalfAcks = game.cupSecondHalfAcks || new Set();
    game.cupSecondHalfAcks.add(socket.id);

    const allDone = allConnectedCoachesAcked(game, game.cupSecondHalfAcks);
    if (allDone) {
      clearCupTimeout(game, "_cupSecondHalfTimeout");
      finalizeCupRound(game, game.cupRound, game.cupRuntime?.phaseToken);
    }
  });

  // ── CUP EXTRA-TIME ANIMATION DONE ────────────────────────────────────────
  // Client emits this when the ET (90-120) animation finishes.
  socket.on("cupExtraTimeDone", () => {
    const game = getGameBySocket(socket.id);
    if (!game || !game._cupETAnimHandler) return;
    game._cupETAnimHandler(socket.id);
  });

  // ── REQUEST PALMARES ──────────────────────────────────────────────────────
  socket.on("requestPalmares", async ({ teamId }: { teamId?: number } = {}) => {
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

    // ── MULTI-HUMAN LOCK ───────────────────────────────────────────────────
    // Add this coach to the permanent lock set. Once the room has ever had >= 2
    // human coaches they are all locked in and the game only progresses when
    // every member of lockedCoaches is connected AND ready.
    game.lockedCoaches.add(name);
    if (game.lockedCoaches.size >= 2) {
      saveGameState(game);
      io.to(roomCode).emit("roomLocked", { coaches: [...game.lockedCoaches] });
    }
    // ── END MULTI-HUMAN LOCK ───────────────────────────────────────────────

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
      cupState: game.cupState,
      year: game.year,
      tactic: game.playersByName[name]?.tactic || null,
      lockedCoaches: [...game.lockedCoaches],
    });

    emitCurrentCupPhaseToSocket(game, socket);
    ensureCupPhaseTimeout(game);
    io.to(roomCode).emit("playerListUpdate", getPlayerList(game));
    emitAwaitingCoaches(game);

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

  registerTransferSocketHandlers(socket, {
    io,
    getGameBySocket,
    getPlayerBySocket,
    getSeasonEndMatchweek,
    isMatchInProgress,
    refreshMarket,
    emitSquadForPlayer,
    listPlayerOnMarket,
    startAuction,
    placeAuctionBid,
  });

  registerFinanceSocketHandlers(socket, {
    io,
    getGameBySocket,
    getPlayerBySocket,
  });

  registerGameplaySocketHandlers(socket, {
    io,
    getGameBySocket,
    getPlayerBySocket,
    getPlayerList,
    unbindSocket,
    checkAllReady,
    emitAwaitingCoaches,
  });
});

// ── MATCH FLOW ────────────────────────────────────────────────────────────────

// Helper: broadcast which locked coaches are currently offline.
function emitAwaitingCoaches(game) {
  if (game.lockedCoaches.size < 2) return;
  const offline = [...game.lockedCoaches].filter(
    (name) => !game.playersByName[name]?.socketId,
  );
  io.to(game.roomCode).emit("awaitingCoaches", offline);
}

// Guard flag: prevents checkAllReady from starting the weekly loop a second
// time if it fires while the previous loop's async DB work is still in flight.
const weeklyLoopRunning = {};

async function checkAllReady(game) {
  if (game.lockedCoaches.size >= 2) {
    // Multi-human room: every locked coach must be online AND ready.
    const allReady = [...game.lockedCoaches].every(
      (name) =>
        game.playersByName[name]?.socketId && game.playersByName[name]?.ready,
    );
    if (!allReady) return;
  } else {
    // Single-human (or no humans): only consider currently connected players.
    const connectedPlayers = getPlayerList(game);
    if (connectedPlayers.length === 0) return;
    if (!connectedPlayers.every((p) => p.ready)) return;
  }

  console.log(
    `[${game.roomCode}] All players ready — matchweek=${game.matchweek} matchState=${game.matchState}`,
  );

  if (game.matchState === "idle") {
    // Guard against double-entry while async DB work is in progress
    if (weeklyLoopRunning[game.roomCode]) return;
    weeklyLoopRunning[game.roomCode] = true;

    // Resolve all open auctions now — their timers must not fire mid-match.
    finalizeAllRunningAuctions(game, finalizeAuction);
    // Cancel any pending cup draw — its safety timeout must not fire mid-match.
    cancelPendingCupDraw(game);

    // Lock state immediately so no second call can enter here
    game.matchState = "running_first_half";

    // Weekly financial loop
    game.db.run(
      `
      UPDATE teams 
      SET budget = budget 
        - CAST((loan_amount * 0.05) AS INTEGER) 
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
        game.fixtures = [...f1, ...f2, ...f3, ...f4];

        await processSegment(game, 1, 45, "halftime");
        weeklyLoopRunning[game.roomCode] = false;
      },
    );
  } else if (game.matchState === "halftime") {
    // BUG-06 FIX: Prevent double execution if checkAllReady fires twice.
    // Immediately lock state to prevent re-entry.
    //
    // Resolve any auctions that started during half-time so their timers
    // cannot interrupt second-half simulation.
    finalizeAllRunningAuctions(game, finalizeAuction);
    // Also cancel any pending cup draw.
    cancelPendingCupDraw(game);
    game.matchState = "playing_second_half";
    await processSegment(game, 46, 90, "idle");
    // If a cup draw was deferred because coaches kicked off while it was pending,
    // trigger it now that the match has fully ended.
    if (game.deferredCupRound != null) {
      const r = game.deferredCupRound;
      game.deferredCupRound = null;
      startCupRound(game, r).catch((e) =>
        console.error(`[${game.roomCode}] Deferred cup draw error:`, e),
      );
    }
  }
}

async function processSegment(game, startMin, endMin, nextState) {
  // Calculate attendance once per match at kick-off (first half only)
  if (startMin === 1) {
    for (const fx of game.fixtures) {
      fx.attendance = await calculateMatchAttendance(game.db, fx.homeTeamId);
    }
  }

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
    const halfTimeFixtures = game.fixtures.map((fx) => ({
      ...fx,
      referee: pickRefereeSummary(
        game.roomCode,
        fx.homeTeamId,
        fx.awayTeamId,
        game.matchweek,
      ),
    }));
    io.to(game.roomCode).emit("halfTimeResults", {
      matchweek: game.matchweek,
      results: halfTimeFixtures,
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

        // Apply ticket revenue based on actual attendance per home match
        for (const match of game.fixtures) {
          const revenue = (match.attendance || 0) * 10;
          if (revenue > 0) {
            game.db.run("UPDATE teams SET budget = budget + ? WHERE id = ?", [
              revenue,
              match.homeTeamId,
            ]);
          }
        }

        // Only advance state after a successful commit so that clients always
        // receive accurate, persisted standings data.
        game.matchState = nextState;
        const completedMatchweek = game.matchweek;

        const fullTimeFixtures = game.fixtures.map((fx) => ({
          ...fx,
          referee: pickRefereeSummary(
            game.roomCode,
            fx.homeTeamId,
            fx.awayTeamId,
            completedMatchweek,
          ),
        }));
        io.to(game.roomCode).emit("matchResults", {
          matchweek: completedMatchweek,
          results: fullTimeFixtures,
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
                // Wait for all connected clients to finish animating the league
                // second half before showing the cup draw popup.
                // Clients emit "leagueAnimDone" when their liveMinute reaches 90.
                // Safety timeout: 90 s in case a client never responds.
                game.pendingCupRound = cupRound;
                game.leagueAnimAcks = new Set();
                if (game._leagueAnimTimeout)
                  clearTimeout(game._leagueAnimTimeout);
                game._leagueAnimTimeout = setTimeout(async () => {
                  if (game.pendingCupRound != null) {
                    const r = game.pendingCupRound;
                    game.pendingCupRound = null;
                    game.leagueAnimAcks = new Set();
                    try {
                      await startCupRound(game, r);
                    } catch (cupErr) {
                      console.error(
                        `[${game.roomCode}] Cup round error (timeout fallback):`,
                        cupErr,
                      );
                    }
                  }
                }, 90000);
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

              // ── FLUSH PENDING AUCTION QUEUE ────────────────────────────
              // Auctions that were requested during the match are now fired.
              if (
                game.pendingAuctionQueue &&
                game.pendingAuctionQueue.length > 0
              ) {
                const queue = game.pendingAuctionQueue.splice(0);
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
                  qDelay += 18000; // 15s auction + 3s buffer
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
