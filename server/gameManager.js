const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const activeGames = {}; // { roomCode: { db, players: {}, matchweek, matchState, globalMarket, fixtures } }

function getGame(roomCode) {
  if (activeGames[roomCode]) return activeGames[roomCode];

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
    players: {}, 
    matchweek: 1,
    matchState: 'idle',
    globalMarket: [],
    fixtures: [],
    initialized: false
  };

  // Load persisted state from DB
  db.get("SELECT value FROM game_state WHERE key = 'matchweek'", (err, row) => {
    if (row) game.matchweek = parseInt(row.value) || 1;
  });
  
  db.get("SELECT value FROM game_state WHERE key = 'matchState'", (err, row) => {
    if (row) game.matchState = row.value || 'idle';
  });

  // Load free agents for market (only unassigned players)
  db.all('SELECT * FROM players WHERE team_id IS NULL ORDER BY RANDOM() LIMIT 20', (err, rows) => {
    if (!err && rows) game.globalMarket = rows;
    game.initialized = true;
  });

  activeGames[roomCode] = game;
  return game;
}

function saveGameState(game) {
  game.db.run("INSERT OR REPLACE INTO game_state (key, value) VALUES ('matchweek', ?)", [String(game.matchweek)]);
  game.db.run("INSERT OR REPLACE INTO game_state (key, value) VALUES ('matchState', ?)", [game.matchState]);
}

function getGameBySocket(socketId) {
  for (const roomCode in activeGames) {
    if (activeGames[roomCode].players[socketId]) {
      return activeGames[roomCode];
    }
  }
  return null;
}

module.exports = { getGame, getGameBySocket, saveGameState, activeGames };
