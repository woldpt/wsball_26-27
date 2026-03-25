const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const activeGames = {}; // { roomCode: { db, playersByName: {}, socketToName: {}, matchweek, matchState, globalMarket, fixtures } }

function getGame(roomCode, onReady) {
  if (activeGames[roomCode]) {
    if (onReady) onReady(activeGames[roomCode]);
    return activeGames[roomCode];
  }

  const dbPath = path.join(__dirname, 'db', `game_${roomCode}.db`);
  const basePath = path.join(__dirname, 'db', 'base.db');

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
    playersByName: {},  // name -> { name, teamId, roomCode, ready, tactic, socketId }
    socketToName: {},   // socketId -> name
    matchweek: 1,
    matchState: 'idle',
    globalMarket: [],
    fixtures: [],
    initialized: false
  };

  activeGames[roomCode] = game;

  // Load persisted state — chain DB reads so all values are ready before onReady fires
  db.get("SELECT value FROM game_state WHERE key = 'matchweek'", (err, row) => {
    if (row) game.matchweek = parseInt(row.value) || 1;

    db.get("SELECT value FROM game_state WHERE key = 'matchState'", (err2, row2) => {
      if (row2) game.matchState = row2.value || 'idle';

      // Load free agents for market (only players with no team)
      db.all('SELECT * FROM players WHERE team_id IS NULL ORDER BY RANDOM() LIMIT 20', (err3, rows) => {
        if (!err3 && rows) game.globalMarket = rows;
        game.initialized = true;
        if (onReady) onReady(game);
      });
    });
  });

  return game;
}

function saveGameState(game) {
  game.db.run("INSERT OR REPLACE INTO game_state (key, value) VALUES ('matchweek', ?)", [String(game.matchweek)]);
  game.db.run("INSERT OR REPLACE INTO game_state (key, value) VALUES ('matchState', ?)", [game.matchState]);
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
  return Object.values(game.playersByName).filter(p => p.socketId !== null);
}

module.exports = { getGame, getGameBySocket, saveGameState, getPlayerBySocket, bindSocket, unbindSocket, getPlayerList, activeGames };
