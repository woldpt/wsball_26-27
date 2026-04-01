// @ts-nocheck
const sqlite3 = require("sqlite3").verbose();
const fs = require("fs");
const path = require("path");

const activeGames = {}; // { roomCode: { db, playersByName: {}, socketToName: {}, matchweek, matchState, globalMarket, fixtures } }

function ensurePlayerSchema(db, onDone) {
  db.all("PRAGMA table_info(players)", (err, columns) => {
    if (err) {
      if (onDone) onDone(err);
      return;
    }

    const existing = new Set((columns || []).map((c) => c.name));
    const required = [
      ["red_cards", "INTEGER DEFAULT 0"],
      ["injuries", "INTEGER DEFAULT 0"],
      ["suspension_games", "INTEGER DEFAULT 0"],
      ["injury_weeks", "INTEGER DEFAULT 0"],
      ["suspension_until_matchweek", "INTEGER DEFAULT 0"],
      ["injury_until_matchweek", "INTEGER DEFAULT 0"],
      ["contract_until_matchweek", "INTEGER DEFAULT 0"],
      ["contract_request_pending", "INTEGER DEFAULT 0"],
      ["contract_requested_wage", "INTEGER DEFAULT 0"],
      ["transfer_status", "TEXT DEFAULT 'none'"],
      ["transfer_price", "INTEGER DEFAULT 0"],
      ["is_star", "INTEGER DEFAULT 0"],
      ["signed_season", "INTEGER DEFAULT 0"],
      ["career_goals", "INTEGER DEFAULT 0"],
      ["career_reds", "INTEGER DEFAULT 0"],
      ["career_injuries", "INTEGER DEFAULT 0"],
    ];

    const missing = required.filter(([name]) => !existing.has(name));
    if (missing.length === 0) {
      if (onDone) onDone(null);
      return;
    }

    let remaining = missing.length;
    let finished = false;

    db.serialize(() => {
      for (const [name, definition] of missing) {
        db.run(
          `ALTER TABLE players ADD COLUMN ${name} ${definition}`,
          (alterErr) => {
            if (finished) return;
            if (alterErr) {
              finished = true;
              if (onDone) onDone(alterErr);
              return;
            }

            remaining -= 1;
            if (remaining === 0) {
              finished = true;
              // Backfill is_star if it was just added: assign ~7% of MED/ATA players as craques
              if (missing.some(([n]) => n === "is_star")) {
                db.run(
                  `UPDATE players SET is_star = 1 WHERE id IN (
                    SELECT id FROM players
                    WHERE (position = 'MED' OR position = 'ATA')
                    ORDER BY RANDOM()
                    LIMIT MAX(1, CAST(
                      (SELECT COUNT(*) FROM players WHERE position = 'MED' OR position = 'ATA') * 0.10
                    AS INTEGER))
                  )`,
                  (backfillErr) => {
                    if (backfillErr)
                      console.warn(
                        "[gameManager] is_star backfill failed:",
                        backfillErr.message,
                      );
                    if (onDone) onDone(null);
                  },
                );
              } else {
                if (onDone) onDone(null);
              }
            }
          },
        );
      }
    });
  });
}

function getGame(roomCode, onReady) {
  if (activeGames[roomCode]) {
    if (onReady) onReady(activeGames[roomCode]);
    return activeGames[roomCode];
  }

  const dbPath = path.join(__dirname, "db", `game_${roomCode}.db`);
  const basePath = path.join(__dirname, "db", "base.db");

  if (!fs.existsSync(dbPath)) {
    if (!fs.existsSync(basePath)) {
      console.error("[gameManager] base.db not found — run: npm run seed:real");
      if (onReady)
        onReady(
          null,
          new Error("Base DB not found. Server needs to be seeded first."),
        );
      return null;
    }
    // Validate base.db is not empty before copying
    const stat = fs.statSync(basePath);
    if (stat.size < 1024) {
      console.error(
        "[gameManager] base.db is empty or corrupt — run: npm run seed:real",
      );
      if (onReady)
        onReady(
          null,
          new Error("Base DB is empty. Server needs to be seeded first."),
        );
      return null;
    }
    fs.copyFileSync(basePath, dbPath);
  }

  const db = new sqlite3.Database(dbPath);

  const game = {
    roomCode,
    db,
    playersByName: {}, // name -> { name, teamId, roomCode, ready, tactic, socketId }
    socketToName: {}, // socketId -> name
    matchweek: 1,
    matchState: "idle",
    season: 1,
    year: 2026, // real-world year of the current season (starts 2026)
    cupRound: 0, // 0 = no cup in progress; 1-5 = current round
    cupState: "idle", // idle | draw | playing | done_round | done_cup
    cupTeamIds: [], // team IDs still alive in the cup this season
    cupFixtures: [],
    cupHumanInCup: false,
    cupDrawAcks: new Set(), // socket IDs that acknowledged the current draw
    cupRuntime: {
      phaseToken: "",
      drawPayload: null,
      halftimePayload: null,
      secondHalfPayload: null,
      fixtures: [],
    },
    lockedCoaches: new Set(), // names of all human coaches ever in this room (lock is permanent once >= 2)
    globalMarket: [],
    fixtures: [],
    auctions: {},
    auctionTimers: {},
    pendingAuctionQueue: [],
    initialized: false,
  };

  activeGames[roomCode] = game;

  // Load persisted state — chain DB reads so all values are ready before onReady fires
  db.run(
    "CREATE TABLE IF NOT EXISTS game_state (key TEXT PRIMARY KEY, value TEXT)",
    () => {
      ensurePlayerSchema(db, () => {
        // Ensure morale column exists in teams (migration for existing DBs).
        db.run(
          "ALTER TABLE teams ADD COLUMN morale INTEGER DEFAULT 50",
          () => {},
        );
        // Ensure attendance column exists in matches (migration for existing DBs).
        // Callback suppresses the "duplicate column" error on existing DBs.
        db.run(
          "ALTER TABLE matches ADD COLUMN attendance INTEGER DEFAULT 0",
          () => {},
        );
        // Ensure cup/palmares tables added after initial schema
        db.run(`CREATE TABLE IF NOT EXISTS cup_matches (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          season INTEGER NOT NULL,
          round INTEGER NOT NULL,
          home_team_id INTEGER,
          away_team_id INTEGER,
          home_score INTEGER DEFAULT 0,
          away_score INTEGER DEFAULT 0,
          home_et_score INTEGER DEFAULT 0,
          away_et_score INTEGER DEFAULT 0,
          home_penalties INTEGER DEFAULT 0,
          away_penalties INTEGER DEFAULT 0,
          winner_team_id INTEGER,
          played BOOLEAN DEFAULT 0
        )`);
        db.run(`CREATE TABLE IF NOT EXISTS palmares (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          team_id INTEGER NOT NULL,
          season INTEGER NOT NULL,
          achievement TEXT NOT NULL
        )`);
        db.get(
          "SELECT value FROM game_state WHERE key = 'matchweek'",
          (err, row) => {
            if (row) game.matchweek = parseInt(row.value) || 1;

            db.get(
              "SELECT value FROM game_state WHERE key = 'matchState'",
              (err2, row2) => {
                if (row2) game.matchState = row2.value || "idle";
                // Recovery: if matchState is stuck in a transient state, reset to idle
                const stuckStates = [
                  "running_first_half",
                  "playing_second_half",
                ];
                if (stuckStates.includes(game.matchState)) {
                  console.warn(
                    `[gameManager] Recovering stuck matchState '${game.matchState}' -> 'idle' for room ${roomCode}`,
                  );
                  game.matchState = "idle";
                }

                db.get(
                  "SELECT value FROM game_state WHERE key = 'season'",
                  (err3, row3) => {
                    if (row3) game.season = parseInt(row3.value) || 1;

                    db.get(
                      "SELECT value FROM game_state WHERE key = 'cupRound'",
                      (err4, row4) => {
                        if (row4) game.cupRound = parseInt(row4.value) || 0;

                        db.get(
                          "SELECT value FROM game_state WHERE key = 'cupState'",
                          (err5, row5) => {
                            if (row5) game.cupState = row5.value || "idle";

                            db.get(
                              "SELECT value FROM game_state WHERE key = 'cupRuntime'",
                              (errCupRuntime, rowCupRuntime) => {
                                if (rowCupRuntime && rowCupRuntime.value) {
                                  try {
                                    const parsed = JSON.parse(
                                      rowCupRuntime.value,
                                    );
                                    if (parsed && typeof parsed === "object") {
                                      game.cupRuntime = {
                                        phaseToken: parsed.phaseToken || "",
                                        drawPayload: parsed.drawPayload || null,
                                        halftimePayload:
                                          parsed.halftimePayload || null,
                                        secondHalfPayload:
                                          parsed.secondHalfPayload || null,
                                        fixtures: Array.isArray(parsed.fixtures)
                                          ? parsed.fixtures
                                          : [],
                                      };
                                      game.cupFixtures =
                                        game.cupRuntime.fixtures || [];
                                    }
                                  } catch (_) {}
                                }

                                if (game.cupState === "playing_first_half") {
                                  game.cupState = game.cupRuntime
                                    .halftimePayload
                                    ? "halftime"
                                    : "draw";
                                }
                                if (game.cupState === "playing_second_half") {
                                  game.cupState = game.cupRuntime
                                    .secondHalfPayload
                                    ? "second_half_waiting"
                                    : "halftime";
                                }

                                db.get(
                                  "SELECT value FROM game_state WHERE key = 'year'",
                                  (err6y, row6y) => {
                                    if (row6y) {
                                      game.year =
                                        parseInt(row6y.value) ||
                                        2025 + game.season;
                                    } else {
                                      // Migrate: derive year from season for existing games
                                      game.year = 2025 + game.season;
                                    }

                                    db.get(
                                      "SELECT value FROM game_state WHERE key = 'lockedCoaches'",
                                      (err8, row8) => {
                                        if (row8 && row8.value) {
                                          try {
                                            const names = JSON.parse(
                                              row8.value,
                                            );
                                            if (Array.isArray(names)) {
                                              game.lockedCoaches = new Set(
                                                names,
                                              );
                                            }
                                          } catch (_) {}
                                        }

                                        // Load free agents and transfer-listed players for market
                                        db.all(
                                          "SELECT * FROM players WHERE team_id IS NULL OR transfer_status != 'none' ORDER BY RANDOM() LIMIT 40",
                                          (err7, rows) => {
                                            if (!err7 && rows)
                                              game.globalMarket = rows;
                                            game.initialized = true;
                                            if (onReady) onReady(game);
                                          },
                                        );
                                      },
                                    );
                                  },
                                );
                              },
                            );
                          },
                        );
                      },
                    );
                  },
                );
              },
            );
          },
        );
      });
    },
  );

  return game;
}

function saveGameState(game) {
  game.db.run(
    "INSERT OR REPLACE INTO game_state (key, value) VALUES ('matchweek', ?)",
    [String(game.matchweek)],
    (err) => {
      if (err) console.error("Error saving matchweek:", err);
    },
  );
  game.db.run(
    "INSERT OR REPLACE INTO game_state (key, value) VALUES ('matchState', ?)",
    [game.matchState],
    (err) => {
      if (err) console.error("Error saving matchState:", err);
    },
  );
  game.db.run(
    "INSERT OR REPLACE INTO game_state (key, value) VALUES ('season', ?)",
    [String(game.season || 1)],
  );
  game.db.run(
    "INSERT OR REPLACE INTO game_state (key, value) VALUES ('cupRound', ?)",
    [String(game.cupRound || 0)],
  );
  game.db.run(
    "INSERT OR REPLACE INTO game_state (key, value) VALUES ('cupState', ?)",
    [game.cupState || "idle"],
  );
  game.db.run(
    "INSERT OR REPLACE INTO game_state (key, value) VALUES ('cupRuntime', ?)",
    [
      JSON.stringify({
        phaseToken: game.cupRuntime?.phaseToken || "",
        drawPayload: game.cupRuntime?.drawPayload || null,
        halftimePayload: game.cupRuntime?.halftimePayload || null,
        secondHalfPayload: game.cupRuntime?.secondHalfPayload || null,
        fixtures: Array.isArray(game.cupFixtures)
          ? game.cupFixtures
          : game.cupRuntime?.fixtures || [],
      }),
    ],
  );
  game.db.run(
    "INSERT OR REPLACE INTO game_state (key, value) VALUES ('year', ?)",
    [String(game.year || 2026)],
  );
  game.db.run(
    "INSERT OR REPLACE INTO game_state (key, value) VALUES ('lockedCoaches', ?)",
    [JSON.stringify([...game.lockedCoaches])],
  );
}

// Look up a player entry by socket ID
function getPlayerBySocket(game, socketId) {
  const name = game.socketToName[socketId];
  return name ? game.playersByName[name] : null;
}

// Register / update a player's socket ID binding
function bindSocket(game, name, socketId) {
  // Remove any old socket binding for this name
  const existing = game.playersByName[name];
  if (existing && existing.socketId && existing.socketId !== socketId) {
    delete game.socketToName[existing.socketId];
  }
  if (game.playersByName[name]) {
    game.playersByName[name].socketId = socketId;
  }
  game.socketToName[socketId] = name;
}

// Remove a player socket binding on disconnect (keep the player entry so they can reconnect)
function unbindSocket(game, socketId) {
  const name = game.socketToName[socketId];
  if (name && game.playersByName[name]) {
    game.playersByName[name].socketId = null;
  }
  delete game.socketToName[socketId];
}

function getGameBySocket(socketId) {
  for (const roomCode in activeGames) {
    if (activeGames[roomCode].socketToName[socketId]) {
      return activeGames[roomCode];
    }
  }
  return null;
}

// Return a snapshot of all connected players (for socket broadcasts)
function getPlayerList(game) {
  return Object.values(game.playersByName).filter((p) => p.socketId !== null);
}

module.exports = {
  getGame,
  getGameBySocket,
  saveGameState,
  getPlayerBySocket,
  bindSocket,
  unbindSocket,
  getPlayerList,
  activeGames,
};
