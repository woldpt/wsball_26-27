// @ts-nocheck
require("./logBootstrap");
require("dotenv").config();

import type { ActiveGame } from "./types";

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
  emitPresence: emitPresenceHelper,
  doesGameExist,
  generateUniqueRoomCode,
  closeAllDatabases,
  activeGames,
} = require("./gameManager") as typeof import("./gameManager");
const {
  generateFixturesForDivision,
  simulateMatchSegment,
  applyPostMatchQualityEvolution,
  simulateExtraTime,
  simulatePenaltyShootout,
  getTeamSquad,
} = require("./game/engine") as typeof import("./game/engine");
const {
  verifyOrCreateManager,
  verifyManager,
  createManager,
  recordRoomAccess,
  getManagerRooms,
  deleteRoomAccess,
  changePassword,
  getManagerInfo,
  getAvatarSeed,
  setAvatarSeed,
  deleteManager,
} = require("./auth");
const {
  getSeasonEndMatchweek,
  runAll,
  runGet,
  getStandingsRows,
  pickRefereeSummary,
  calculateMatchAttendance,
} = require("./coreHelpers") as typeof import("./coreHelpers");
const { DIVISION_NAMES, CUP_ROUND_NAMES, CUP_TEAMS_BY_ROUND, SEASON_CALENDAR } =
  require("./gameConstants") as typeof import("./gameConstants");
const { isMatchInProgress, finalizeAllRunningAuctions, pauseAllRunningAuctions } =
  require("./matchFlowHelpers") as typeof import("./matchFlowHelpers");
const { createAuctionHelpers } =
  require("./auctionHelpers") as typeof import("./auctionHelpers");
const { createContractHelpers } =
  require("./contractHelpers") as typeof import("./contractHelpers");
const { createNpcTransferHelpers } =
  require("./npcTransferHelpers") as typeof import("./npcTransferHelpers");
const { registerTransferSocketHandlers } =
  require("./socketTransferHandlers") as typeof import("./socketTransferHandlers");
const { registerFinanceSocketHandlers } =
  require("./socketFinanceHandlers") as typeof import("./socketFinanceHandlers");
const { registerSessionSocketHandlers } =
  require("./socketSessionHandlers") as typeof import("./socketSessionHandlers");
const { registerCupSocketHandlers } =
  require("./socketCupHandlers") as typeof import("./socketCupHandlers");
const { registerGameplaySocketHandlers } =
  require("./socketGameplayHandlers") as typeof import("./socketGameplayHandlers");
const { registerChatHandlers } =
  require("./socketChatHandlers") as typeof import("./socketChatHandlers");
const { createTrainingHandlers } =
  require("./socketTrainingHandlers") as typeof import("./socketTrainingHandlers");
const { createTrainingHelpers } =
  require("./trainingHelpers") as typeof import("./trainingHelpers");
const { emitAwaitingCoaches: emitAwaitingCoachesHelper } =
  require("./presenceHelpers") as typeof import("./presenceHelpers");
const { createWeeklyFlowHelpers } =
  require("./weeklyFlowHelpers") as typeof import("./weeklyFlowHelpers");
const { createCupFlowHelpers } =
  require("./cupFlowHelpers") as typeof import("./cupFlowHelpers");
const { createMatchSummaryHelpers } =
  require("./matchSummaryHelpers") as typeof import("./matchSummaryHelpers");
const { createCoachDismissalHelpers } =
  require("./coachDismissalHelpers") as typeof import("./coachDismissalHelpers");
const adminRoutes = require("./adminRoutes");
const sqlite3 = require("sqlite3").verbose();

function resolveDbDir() {
  const candidates = [
    path.join(__dirname, "db"),
    path.join(__dirname, "..", "db"),
    path.join(process.cwd(), "db"),
  ];
  return (
    candidates.find((dir) => fs.existsSync(path.join(dir, "base.db"))) ??
    candidates.find((dir) => fs.existsSync(dir)) ??
    candidates[0]
  );
}

function getRoomName(roomCode: string): Promise<string> {
  return new Promise((resolve) => {
    const dbPath = path.join(resolveDbDir(), `game_${roomCode}.db`);
    const db = new sqlite3.Database(dbPath, (err: any) => {
      if (err) {
        resolve(roomCode); // fallback to room code if db error
        return;
      }
      db.get(
        "SELECT value FROM game_state WHERE key = 'roomName'",
        (err: any, row: any) => {
          db.close();
          if (err || !row || !row.value) {
            resolve(roomCode);
          } else {
            resolve(row.value);
          }
        },
      );
    });
  });
}

function getRoomInfo(
  roomCode: string,
  managerName: string,
): Promise<{ roomCode: string; roomName: string; teamName: string | null }> {
  return new Promise((resolve) => {
    const dbPath = path.join(resolveDbDir(), `game_${roomCode}.db`);
    if (!fs.existsSync(dbPath)) {
      resolve({ roomCode, roomName: roomCode, teamName: null });
      return;
    }
    const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err: any) => {
      if (err) {
        resolve({ roomCode, roomName: roomCode, teamName: null });
        return;
      }
      // Get room name + team name for this manager
      db.get(
        "SELECT value FROM game_state WHERE key = 'roomName'",
        (_err1: any, row1: any) => {
          const roomName = row1?.value || roomCode;
          db.get(
            `SELECT t.name AS teamName
             FROM teams t
             JOIN managers m ON m.id = t.manager_id
             WHERE m.name = ? COLLATE NOCASE`,
            [managerName],
            (_err2: any, row2: any) => {
              db.close();
              resolve({
                roomCode,
                roomName,
                teamName: row2?.teamName || null,
              });
            },
          );
        },
      );
    });
  });
}

const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || "http://localhost:5173")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const SERVER_START_TIME = Date.now();

const app = express();
app.set("trust proxy", 1);
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-XSS-Protection", "0");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'none'; frame-ancestors 'none'",
  );
  next();
});
app.use(cors({ origin: ALLOWED_ORIGINS, credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use("/admin", adminRoutes);

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiadas tentativas. Tenta novamente em breve." },
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

app.get("/api/cache-version", (_req, res) => {
  res.json({ version: SERVER_START_TIME });
});

app.get("/saves", apiLimiter, async (req, res) => {
  try {
    const files = fs.readdirSync(resolveDbDir());
    const allSaves = files
      .filter((f) => f.startsWith("game_") && f.endsWith(".db"))
      .map((f) => f.replace("game_", "").replace(".db", ""));

    const managerName = req.query.name;
    let roomCodes = allSaves;

    if (managerName) {
      const mySaves = await getManagerRooms(managerName as string);
      roomCodes = mySaves.filter((r) => allSaves.includes(r));
    }

    // Load room names for each room
    const saves = await Promise.all(
      roomCodes.map(async (roomCode) => ({
        code: roomCode,
        name: await getRoomName(roomCode),
      })),
    );

    res.json(saves);
  } catch (e) {
    console.error("[/saves] Error:", e.message);
    res.json([]);
  }
});

app.delete("/saves/:roomCode", apiLimiter, async (req, res) => {
  try {
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    const password =
      typeof req.body?.password === "string" ? req.body.password : "";
    const roomCode = (req.params.roomCode || "").toUpperCase();

    if (!name)
      return res.status(400).json({ error: "Nome de treinador inválido." });
    if (!password)
      return res.status(400).json({ error: "A palavra-passe é obrigatória." });
    if (!/^[A-Z0-9]{4,8}$/.test(roomCode))
      return res.status(400).json({ error: "Código de sala inválido." });

    const authResult = await verifyManager(name, password);
    if (!authResult.ok)
      return res.status(401).json({ error: authResult.error });

    const myRooms = await getManagerRooms(name);
    if (!myRooms.includes(roomCode)) {
      return res.status(403).json({ error: "Não tens acesso a esta sala." });
    }

    const activeGame = getGame(roomCode);
    if (activeGame) {
      const connected = Object.values(activeGame.playersByName).filter(
        (p: any) => p.socketId,
      ).length;
      if (connected > 0) {
        return res
          .status(409)
          .json({ error: "Sala tem jogadores ligados. Tenta mais tarde." });
      }
    }

    const dbDir = resolveDbDir();
    const dbFile = path.join(dbDir, `game_${roomCode}.db`);
    if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);

    await deleteRoomAccess(roomCode);
    console.log(`[/saves] Room "${roomCode}" deleted by coach "${name}"`);
    return res.json({ ok: true });
  } catch (error) {
    console.error("[/saves DELETE] Error:", error.message);
    return res.status(500).json({ error: "Erro ao apagar sala." });
  }
});

app.post("/auth/login", apiLimiter, async (req, res) => {
  try {
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    const password =
      typeof req.body?.password === "string" ? req.body.password : "";
    if (!name)
      return res.status(400).json({ error: "Nome de treinador inválido." });
    if (!password)
      return res.status(400).json({ error: "A palavra-passe é obrigatória." });
    const authResult = await verifyManager(name, password);
    if (!authResult.ok)
      return res.status(401).json({ error: authResult.error });
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
    if (!name)
      return res.status(400).json({ error: "Nome de treinador inválido." });
    if (!password)
      return res.status(400).json({ error: "A palavra-passe é obrigatória." });
    const authResult = await createManager(name, password);
    if (!authResult.ok)
      return res.status(409).json({ error: authResult.error });
    return res.json({ ok: true, name });
  } catch (error) {
    console.error("[/auth/register] Error:", error.message);
    return res.status(500).json({ error: "Erro interno de autenticação." });
  }
});

app.get("/auth/manager-info", async (req, res) => {
  try {
    const name =
      typeof req.query?.name === "string" ? req.query.name.trim() : "";
    if (!name)
      return res.status(400).json({ error: "Nome de treinador inválido." });
    const result = await getManagerInfo(name);
    if (!result.ok)
      return res.status(404).json({ error: result.error });

    const rooms: any[] = [];
    for (const code of result.info.rooms) {
      const dbPath = path.join(resolveDbDir(), `game_${code}.db`);
      if (!fs.existsSync(dbPath)) continue;
      const info = await getRoomInfo(code, name);
      if (!info.teamName) continue;
      rooms.push(info);
    }

    return res.json({ name: result.info.name, rooms });
  } catch (error) {
    console.error("[/auth/manager-info] Error:", error.message);
    return res.status(500).json({ error: "Erro interno." });
  }
});

app.post("/auth/change-password", apiLimiter, async (req, res) => {
  try {
    const name =
      typeof req.body?.name === "string" ? req.body.name.trim() : "";
    const currentPassword =
      typeof req.body?.currentPassword === "string"
        ? req.body.currentPassword
        : "";
    const newPassword =
      typeof req.body?.newPassword === "string" ? req.body.newPassword : "";
    if (!name || !currentPassword || !newPassword)
      return res.status(400).json({ error: "Todos os campos são obrigatórios." });
    if (newPassword.length < 3)
      return res
        .status(400)
        .json({ error: "A nova palavra-passe deve ter pelo menos 3 caracteres." });
    const result = await changePassword(name, currentPassword, newPassword);
    if (!result.ok)
      return res.status(400).json({ error: result.error });
    return res.json({ ok: true });
  } catch (error) {
    console.error("[/auth/change-password] Error:", error.message);
    return res.status(500).json({ error: "Erro interno." });
  }
});

app.get("/auth/avatar-seed", async (req, res) => {
  try {
    const name =
      typeof req.query?.name === "string" ? req.query.name.trim() : "";
    if (!name)
      return res.status(400).json({ error: "Nome de treinador inválido." });
    const seed = await getAvatarSeed(name);
    return res.json({ seed });
  } catch (error) {
    console.error("[/auth/avatar-seed] Error:", error.message);
    return res.status(500).json({ error: "Erro interno." });
  }
});

app.post("/auth/avatar-seed", async (req, res) => {
  try {
    const name =
      typeof req.body?.name === "string" ? req.body.name.trim() : "";
    const seed =
      typeof req.body?.seed === "string" ? req.body.seed.trim() : "";
    if (!name)
      return res.status(400).json({ error: "Nome de treinador inválido." });
    const result = await setAvatarSeed(name, seed);
    if (!result.ok)
      return res.status(500).json({ error: "Erro ao guardar." });
    return res.json({ ok: true });
  } catch (error) {
    console.error("[/auth/avatar-seed] Error:", error.message);
    return res.status(500).json({ error: "Erro interno." });
  }
});

app.post("/auth/delete-account", async (req, res) => {
  try {
    const name =
      typeof req.body?.name === "string" ? req.body.name.trim() : "";
    if (!name)
      return res.status(400).json({ error: "Nome de treinador inválido." });
    const result = await deleteManager(name);
    if (!result.ok)
      return res.status(500).json({ error: result.error });
    return res.json({ ok: true });
  } catch (error) {
    console.error("[/auth/delete-account] Error:", error.message);
    return res.status(500).json({ error: "Erro interno." });
  }
});

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// ── HELPERS ───────────────────────────────────────────────────────────────────

const emitAwaitingCoaches = (game: ActiveGame) =>
  emitAwaitingCoachesHelper(game, io);

// Emite playerListUpdate + awaitingCoaches de forma atómica
const emitPresence = (game: ActiveGame) => emitPresenceHelper(game, io);

const auctionHelpers = createAuctionHelpers({
  io,
  isMatchInProgress,
  getSeasonEndMatchweek,
  scheduleNpcAuctionBids,
  scheduleNpcCounterBid,
});

const startAuction = auctionHelpers.startAuction;

const contractHelpers = createContractHelpers({
  io,
  getSeasonEndMatchweek,
  runAll,
  runGet,
  startAuction,
});

const npcTransferHelpers = createNpcTransferHelpers({
  runAll,
  getSeasonEndMatchweek,
  io,
});

const matchSummaryHelpers = createMatchSummaryHelpers({
  runAll,
  runGet,
  getStandingsRows,
  generateFixturesForDivision,
  pickRefereeSummary,
});

const buildNextMatchSummary = matchSummaryHelpers.buildNextMatchSummary;
const persistMatchResults = matchSummaryHelpers.persistMatchResults;

const refreshMarket = auctionHelpers.refreshMarket;
const emitSquadForPlayer = auctionHelpers.emitSquadForPlayer;
const listPlayerOnMarket = auctionHelpers.listPlayerOnMarket;
const finalizeAuction = auctionHelpers.finalizeAuction;
const placeAuctionBid = auctionHelpers.placeAuctionBid;
const resumeAllPausedAuctions = auctionHelpers.resumeAllPausedAuctions;

const processContractExpiries = contractHelpers.processContractExpiries;
const processAgentRenegotiations = contractHelpers.processAgentRenegotiations;
const processNpcTransferActivity = (game) =>
  npcTransferHelpers.processNpcTransferActivity(game, listPlayerOnMarket);

function scheduleNpcAuctionBids(game, playerId) {
  return npcTransferHelpers.scheduleNpcAuctionBids(
    game,
    playerId,
    placeAuctionBid,
  );
}

function scheduleNpcCounterBid(game, playerId, npcTeamId) {
  return npcTransferHelpers.scheduleNpcCounterBid(
    game,
    playerId,
    npcTeamId,
    placeAuctionBid,
  );
}

// ── CUP FLOW ──────────────────────────────────────────────────────────────────
// No circular dependency: cupFlowHelpers no longer needs checkAllReady.
// weeklyFlowHelpers calls startCupRound (from cupFlowHelpers) when preparing
// the lobby for an upcoming cup week.

const trainingHelpers = createTrainingHelpers({ io });
const applyTrainingBonuses = trainingHelpers.applyTrainingBonuses;

const trainingHandlers = createTrainingHandlers({ io });
const setTrainingFocus = trainingHandlers.setTrainingFocus;
const getTrainingFocus = trainingHandlers.getTrainingFocus;
const getTrainingHistory = trainingHandlers.getTrainingHistory;

const cupFlowHelpers = createCupFlowHelpers({
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
  emitPresence,
  applyTrainingBonuses,
  resumeAllPausedAuctions,
});

const applySeasonEnd = cupFlowHelpers.applySeasonEnd;
const startCupRound = cupFlowHelpers.startCupRound;
const finalizeCupRound = cupFlowHelpers.finalizeCupRound;
const emitCurrentPhaseToSocket = cupFlowHelpers.emitCurrentPhaseToSocket;
const ensurePhaseTimeout = cupFlowHelpers.ensurePhaseTimeout;

// ── WEEKLY FLOW ────────────────────────────────────────────────────────────────

const coachDismissalHelpers = createCoachDismissalHelpers({
  io,
  runAll,
  runGet,
  saveGameState,
});
const processCoachEvents = coachDismissalHelpers.processCoachEvents;
const handleAcceptJobOffer = coachDismissalHelpers.handleAcceptJobOffer;
const handleDeclineJobOffer = coachDismissalHelpers.handleDeclineJobOffer;

const weeklyFlowHelpers = createWeeklyFlowHelpers({
  io,
  getPlayerList,
  emitPresence,
  generateFixturesForDivision,
  finalizeAuction,
  pauseAllRunningAuctions,
  resumeAllPausedAuctions,
  simulateMatchSegment,
  calculateMatchAttendance,
  pickRefereeSummary,
  saveGameState,
  persistMatchResults,
  applyPostMatchQualityEvolution,
  applyTrainingBonuses,
  startCupRound,
  finalizeCupRound,
  applySeasonEnd,
  listPlayerOnMarket,
  processContractExpiries,
  processAgentRenegotiations,
  processNpcTransferActivity,
  refreshMarket,
  processCoachEvents,
});

const checkAllReady = weeklyFlowHelpers.checkAllReady;

function emitGlobalPlayerUpdate() {
  const players: { name: string; roomCode: string }[] = [];
  for (const game of Object.values(activeGames) as any[]) {
    for (const p of Object.values(game.playersByName) as any[]) {
      if (p.socketId) {
        players.push({ name: p.name, roomCode: game.roomCode });
      }
    }
  }
  io.to("__global__").emit("globalPlayersUpdate", players);
}

// ── SOCKET HANDLERS ───────────────────────────────────────────────────────────

io.on("connection", (socket) => {
  socket.emit("serverStartTime", SERVER_START_TIME);

  registerSessionSocketHandlers(socket, {
    io,
    verifyOrCreateManager,
    getGame,
    recordRoomAccess,
    getGameBySocket,
    getPlayerBySocket,
    bindSocket,
    unbindSocket,
    getPlayerList,
    saveGameState,
    emitCurrentPhaseToSocket,
    ensurePhaseTimeout,
    emitAwaitingCoaches,
    emitPresence,
    checkAllReady,
    runAll,
    runGet,
    buildNextMatchSummary,
    doesGameExist,
    generateUniqueRoomCode,
    emitGlobalPlayerUpdate,
  });

  registerCupSocketHandlers(socket, {
    io,
    getGameBySocket,
    getPlayerBySocket,
    getPlayerList,
    saveGameState,
    checkAllReady,
    runAll,
  });

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
    finalizeAuction,
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
    emitPresence,
    saveGameState,
    handleAcceptJobOffer,
    handleDeclineJobOffer,
    emitGlobalPlayerUpdate,
  });

  registerChatHandlers(socket, {
    io,
    getGameBySocket,
    getPlayerBySocket,
  });

  // Training handlers
  socket.on("setTrainingFocus", (trainingFocus: string, callback?: (ok: boolean) => void) => {
    const game = getGameBySocket(socket.id);
    const player = game ? getPlayerBySocket(game, socket.id) : null;
    if (!game || !player) {
      if (callback) callback(false);
      return;
    }
    setTrainingFocus(game, player.name, trainingFocus, (err?: Error) => {
      if (callback) callback(!err);
    });
  });

  socket.on("getTrainingFocus", async (callback: (focus: string | null) => void) => {
    const game = getGameBySocket(socket.id);
    const player = game ? getPlayerBySocket(game, socket.id) : null;
    if (!game || !player || player.teamId == null) {
      if (callback) callback(null);
      return;
    }
    const focus = await getTrainingFocus(game, player.teamId);
    if (callback) callback(focus);
  });

  socket.on(
    "getTrainingHistory",
    async (calendarIndex: number | null, callback: (history: any[]) => void) => {
      const game = getGameBySocket(socket.id);
      const player = game ? getPlayerBySocket(game, socket.id) : null;
      if (!game || !player || player.teamId == null) {
        if (callback) callback([]);
        return;
      }
      const history = await getTrainingHistory(game, player.teamId, calendarIndex ?? null);
      if (callback) callback(history);
    },
  );
});

function validateEnvVars() {
  const warnings: string[] = [];
  if (!process.env.ADMIN_USERNAME) warnings.push("ADMIN_USERNAME");
  if (!process.env.ADMIN_PASSWORD_HASH && !process.env.ADMIN_PASSWORD) {
    warnings.push("ADMIN_PASSWORD_HASH or ADMIN_PASSWORD");
  }
  if (!process.env.CORS_ORIGINS) {
    console.warn(
      "[server] CORS_ORIGINS not set — defaulting to http://localhost:5173",
    );
  }
  if (warnings.length > 0) {
    console.warn(
      `[server] WARNING: missing env vars (${warnings.join(", ")}). Admin endpoints will reject all requests.`,
    );
  }
}
validateEnvVars();

// Migration: ensure resistance column exists for all players
const db = require("./db/database.js");
db.run(
  `ALTER TABLE players ADD COLUMN resistance INTEGER DEFAULT 3`,
  (err: any) => {
    if (
      err &&
      err.message &&
      !err.message.includes("duplicate column name")
    ) {
      console.warn("[migration] resistance column:", err.message);
    }
  },
);

// Migrations for training accumulators (skill/resistance need fractional progress
// because the underlying columns are INTEGER and +0.5/+0.2 would otherwise truncate)
const trainingMigrations: Array<{ sql: string; label: string }> = [
  { sql: `ALTER TABLE players ADD COLUMN training_skill_progress REAL DEFAULT 0`, label: "training_skill_progress" },
  { sql: `ALTER TABLE players ADD COLUMN training_resistance_progress REAL DEFAULT 0`, label: "training_resistance_progress" },
  { sql: `ALTER TABLE team_training ADD COLUMN applied INTEGER DEFAULT 0`, label: "team_training.applied" },
  { sql: `ALTER TABLE training_player_history ADD COLUMN delta REAL NOT NULL DEFAULT 0`, label: "training_player_history.delta" },
  { sql: `ALTER TABLE training_player_history ADD COLUMN focus TEXT`, label: "training_player_history.focus" },
  { sql: `ALTER TABLE players ADD COLUMN transfer_cooldown_until_matchweek INTEGER DEFAULT 0`, label: "players.transfer_cooldown_until_matchweek" },
];
for (const m of trainingMigrations) {
  db.run(m.sql, (err: any) => {
    if (err && err.message && !err.message.includes("duplicate column name") && !err.message.includes("no such table")) {
      console.warn(`[migration] ${m.label}:`, err.message);
    }
  });
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

let shuttingDown = false;
function gracefulShutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[server] ${signal} received, shutting down...`);
  try {
    io.emit("serverShutdown");
  } catch (err) {
    console.error("[server] Error emitting shutdown:", err);
  }
  io.close();
  server.close(() => {
    closeAllDatabases().finally(() => process.exit(0));
  });
  setTimeout(() => {
    console.error("[server] Forced shutdown after timeout");
    process.exit(1);
  }, 10000).unref();
}
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
