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
              if (onDone) onDone(null);
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
      throw new Error("Base DB not found!");
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
    cupDrawAcks: new Set(), // socket IDs that acknowledged the current draw
    globalMarket: [],
    fixtures: [],
    auctions: {},
    initialized: false,
  };

  activeGames[roomCode] = game;

  // Load persisted state — chain DB reads so all values are ready before onReady fires
  db.run(
    "CREATE TABLE IF NOT EXISTS game_state (key TEXT PRIMARY KEY, value TEXT)",
    () => {
      ensurePlayerSchema(db, () => {
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
                              "SELECT value FROM game_state WHERE key = 'year'",
                              (err6y, row6y) => {
                                if (row6y) {
                                  game.year = parseInt(row6y.value) || (2025 + game.season);
                                } else {
                                  // Migrate: derive year from season for existing games
                                  game.year = 2025 + game.season;
                                }

                                // Load free agents and transfer-listed players for market
                                db.all(
                                  "SELECT * FROM players WHERE team_id IS NULL OR transfer_status != 'none' ORDER BY RANDOM() LIMIT 40",
                                  (err7, rows) => {
                                    if (!err7 && rows) game.globalMarket = rows;
                                    game.initialized = true;
                                    if (onReady) onReady(game);
                                  },
                                );
                              },
                            );
                          });
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
    "INSERT OR REPLACE INTO game_state (key, value) VALUES ('year', ?)",
    [String(game.year || 2026)],
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
