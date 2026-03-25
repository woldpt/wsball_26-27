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
} = require("./game/engine");
const {
  verifyOrCreateManager,
  recordRoomAccess,
  getManagerRooms,
} = require("./auth");

const app = express();
app.use(cors());
app.use(express.json());

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

const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

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
    getGame(roomCode, (game) => {
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

  // ── HELPERS ────────────────────────────────────────────────────────────────
  function generateRandomTeam(game, socket, name, roomCode, managerId) {
    const takenTeamIds = Object.values(game.playersByName)
      .map((p) => p.teamId)
      .filter(Boolean);
    let query =
      "SELECT id, name FROM teams WHERE division = 4 AND manager_id IS NULL";
    if (takenTeamIds.length > 0)
      query += ` AND id NOT IN (${takenTeamIds.join(",")})`;
    query += " ORDER BY RANDOM() LIMIT 1";

    game.db.get(query, (err, team) => {
      if (err || !team) {
        let fallbackQuery = "SELECT id, name FROM teams WHERE division = 4";
        if (takenTeamIds.length > 0)
          fallbackQuery += ` AND id NOT IN (${takenTeamIds.join(",")})`;
        fallbackQuery += " ORDER BY RANDOM() LIMIT 1";

        game.db.get(fallbackQuery, (err2, team2) => {
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

            const price = player.value * 1.2;
            if (team.budget >= price) {
              game.db.run(
                "UPDATE teams SET budget = budget - ? WHERE id = ?",
                [price, playerState.teamId],
                () => {
                  game.db.run(
                    "UPDATE players SET team_id = ? WHERE id = ?",
                    [playerState.teamId, playerId],
                    () => {
                      const index = game.globalMarket.findIndex(
                        (p) => p.id === playerId,
                      );
                      if (index > -1) game.globalMarket.splice(index, 1);

                      io.to(game.roomCode).emit(
                        "marketUpdate",
                        game.globalMarket,
                      );
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

  // ── SET TACTIC ────────────────────────────────────────────────────────────
  socket.on("setTactic", (tactic) => {
    const game = getGameBySocket(socket.id);
    const playerState = getPlayerBySocket(game, socket.id);
    if (game && playerState) {
      playerState.tactic = tactic;
      socket.emit(
        "systemMessage",
        `Tática alterada para ${tactic.formation} (${tactic.style})`,
      );
    }
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
        const cost = 250000;
        if (team && team.budget >= cost) {
          game.db.run(
            "UPDATE teams SET budget = budget - ?, stadium_capacity = stadium_capacity + 2000 WHERE id = ?",
            [cost, playerState.teamId],
            () => {
              game.db.all("SELECT * FROM teams", (err2, teams) =>
                io.to(game.roomCode).emit("teamsData", teams),
              );
              socket.emit("systemMessage", "+2000 Lugares Construídos!");
            },
          );
        } else {
          socket.emit("systemMessage", "Sem dinheiro (Custo: 250.000€)!");
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
    game.db.run(
      "UPDATE teams SET budget = budget + 500000, loan_amount = loan_amount + 500000 WHERE id = ?",
      [playerState.teamId],
      () => {
        game.db.all("SELECT * FROM teams", (err, teams) =>
          io.to(game.roomCode).emit("teamsData", teams),
        );
        socket.emit(
          "systemMessage",
          "Empréstimo de 500.000€ aprovado (Juro 5%/Semana).",
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
        - CAST((loan_amount * 0.05) AS INTEGER) 
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
        game.fixtures = [...f1, ...f2, ...f3, ...f4];

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

        for (const event of match.events) {
          if (event.type === "goal" && event.playerId) {
            game.db.run(`UPDATE players SET goals=goals+1 WHERE id=?`, [
              event.playerId,
            ]);
          }
        }
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

        io.to(game.roomCode).emit("matchResults", {
          matchweek: game.matchweek,
          results: game.fixtures,
        });
        connectedPlayers.forEach((p) => {
          p.ready = false;
        });
        game.matchweek++;
        saveGameState(game);

        game.db.all("SELECT * FROM teams", (err2, teams) => {
          if (!err2) io.to(game.roomCode).emit("teamsData", teams);

          game.db.all(
            "SELECT p.id, p.name, p.position, p.goals, p.team_id, t.name as team_name, t.color_primary, t.color_secondary FROM players p LEFT JOIN teams t ON p.team_id = t.id WHERE p.goals > 0 ORDER BY p.goals DESC, p.skill DESC LIMIT 20",
            (err3, scorers) => {
              io.to(game.roomCode).emit("topScorers", scorers || []);
              io.to(game.roomCode).emit(
                "playerListUpdate",
                getPlayerList(game),
              );
            },
          );
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
