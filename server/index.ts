// @ts-nocheck
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
  doesGameExist,
  generateUniqueRoomCode,
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
} = require("./auth");
const {
  getSeasonEndMatchweek,
  runAll,
  runGet,
  getStandingsRows,
  pickRefereeSummary,
  calculateMatchAttendance,
} = require("./coreHelpers") as typeof import("./coreHelpers");
const {
  DIVISION_NAMES,
  CUP_ROUND_NAMES,
  CUP_TEAMS_BY_ROUND,
  SEASON_CALENDAR,
} = require("./gameConstants") as typeof import("./gameConstants");
const { isMatchInProgress, finalizeAllRunningAuctions } =
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
const { emitAwaitingCoaches: emitAwaitingCoachesHelper } =
  require("./presenceHelpers") as typeof import("./presenceHelpers");
const { createWeeklyFlowHelpers } =
  require("./weeklyFlowHelpers") as typeof import("./weeklyFlowHelpers");
const { createCupFlowHelpers } =
  require("./cupFlowHelpers") as typeof import("./cupFlowHelpers");
const { createMatchSummaryHelpers } =
  require("./matchSummaryHelpers") as typeof import("./matchSummaryHelpers");
const adminRoutes = require("./adminRoutes");

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

const app = express();
app.set("trust proxy", 1);
app.use(cors());
app.use(express.json());
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

app.get("/saves", apiLimiter, async (req, res) => {
  try {
    const files = fs.readdirSync(resolveDbDir());
    const allSaves = files
      .filter((f) => f.startsWith("game_") && f.endsWith(".db"))
      .map((f) => f.replace("game_", "").replace(".db", ""));

    const managerName = req.query.name;
    if (!managerName) {
      return res.json(allSaves);
    }

    const mySaves = await getManagerRooms(managerName);
    const filtered = mySaves.filter((r) => allSaves.includes(r));
    res.json(filtered);
  } catch (e) {
    console.error("[/saves] Error:", e.message);
    res.json([]);
  }
});

app.delete("/saves/:roomCode", apiLimiter, async (req, res) => {
  try {
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    const roomCode = (req.params.roomCode || "").toUpperCase();

    if (!name) return res.status(400).json({ error: "Nome de treinador inválido." });
    if (!password) return res.status(400).json({ error: "A palavra-passe é obrigatória." });
    if (!roomCode) return res.status(400).json({ error: "Código de sala inválido." });

    const authResult = await verifyManager(name, password);
    if (!authResult.ok) return res.status(401).json({ error: authResult.error });

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
        return res.status(409).json({ error: "Sala tem jogadores ligados. Tenta mais tarde." });
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
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    if (!name) return res.status(400).json({ error: "Nome de treinador inválido." });
    if (!password) return res.status(400).json({ error: "A palavra-passe é obrigatória." });
    const authResult = await verifyManager(name, password);
    if (!authResult.ok) return res.status(401).json({ error: authResult.error });
    return res.json({ ok: true, name });
  } catch (error) {
    console.error("[/auth/login] Error:", error.message);
    return res.status(500).json({ error: "Erro interno de autenticação." });
  }
});

app.post("/auth/register", apiLimiter, async (req, res) => {
  try {
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    if (!name) return res.status(400).json({ error: "Nome de treinador inválido." });
    if (!password) return res.status(400).json({ error: "A palavra-passe é obrigatória." });
    const authResult = await createManager(name, password);
    if (!authResult.ok) return res.status(409).json({ error: authResult.error });
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

// ── HELPERS ───────────────────────────────────────────────────────────────────

const emitAwaitingCoaches = (game: ActiveGame) =>
  emitAwaitingCoachesHelper(game, io);

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
const startAuction = auctionHelpers.startAuction;
const finalizeAuction = auctionHelpers.finalizeAuction;
const placeAuctionBid = auctionHelpers.placeAuctionBid;

const processContractExpiries = contractHelpers.processContractExpiries;
const processNpcTransferActivity = (game) =>
  npcTransferHelpers.processNpcTransferActivity(game, listPlayerOnMarket);

function scheduleNpcAuctionBids(game, playerId) {
  return npcTransferHelpers.scheduleNpcAuctionBids(game, playerId, placeAuctionBid);
}

// ── CUP FLOW ──────────────────────────────────────────────────────────────────
// No circular dependency: cupFlowHelpers no longer needs checkAllReady.
// weeklyFlowHelpers calls startCupRound (from cupFlowHelpers) when preparing
// the lobby for an upcoming cup week.

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
});

const applySeasonEnd = cupFlowHelpers.applySeasonEnd;
const startCupRound = cupFlowHelpers.startCupRound;
const finalizeCupRound = cupFlowHelpers.finalizeCupRound;
const emitCurrentPhaseToSocket = cupFlowHelpers.emitCurrentPhaseToSocket;
const ensurePhaseTimeout = cupFlowHelpers.ensurePhaseTimeout;

// ── WEEKLY FLOW ────────────────────────────────────────────────────────────────

const weeklyFlowHelpers = createWeeklyFlowHelpers({
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
});

const checkAllReady = weeklyFlowHelpers.checkAllReady;

// ── SOCKET HANDLERS ───────────────────────────────────────────────────────────

io.on("connection", (socket) => {
  registerSessionSocketHandlers(socket, {
    io,
    verifyOrCreateManager,
    getGame,
    recordRoomAccess,
    getGameBySocket,
    getPlayerBySocket,
    bindSocket,
    getPlayerList,
    saveGameState,
    emitCurrentPhaseToSocket,
    ensurePhaseTimeout,
    emitAwaitingCoaches,
    runAll,
    buildNextMatchSummary,
    doesGameExist,
    generateUniqueRoomCode,
  });

  registerCupSocketHandlers(socket, {
    io,
    getGameBySocket,
    getPlayerBySocket,
    getPlayerList,
    saveGameState,
    checkAllReady,
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
