const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const db = require('./db/database');
const { simulateMatch } = require('./game/engine');

const app = express();
app.use(cors());
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

let players = {}; // { socketId: { name, teamId, ready } }
let matchweek = 1;

let globalMarket = [];
db.all('SELECT * FROM players ORDER BY RANDOM() LIMIT 20', (err, rows) => {
  if (!err) globalMarket = rows;
});

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Send initial data
  db.all('SELECT * FROM teams', (err, teams) => {
    socket.emit('teamsData', teams);
  });

  socket.on('joinGame', (data) => {
    players[socket.id] = { 
      name: data.name, 
      teamId: data.teamId, 
      ready: false,
      tactic: { formation: '4-4-2', style: 'Balanced' }
    };
    
    db.all('SELECT * FROM players WHERE team_id = ?', [data.teamId], (err, squad) => {
      socket.emit('mySquad', squad);
    });
    
    socket.emit('marketUpdate', globalMarket);
    
    io.emit('playerListUpdate', Object.values(players));
    console.log(`${data.name} joined with team ${data.teamId}`);
  });

  socket.on('buyPlayer', (playerId) => {
    const playerState = players[socket.id];
    if (!playerState) return;

    db.get('SELECT * FROM players WHERE id = ?', [playerId], (err, player) => {
      if (!player) return;
      db.get('SELECT budget FROM teams WHERE id = ?', [playerState.teamId], (err, team) => {
        if (!team) return;
        
        const price = player.value * 1.2; // 20% premium
        if (team.budget >= price) {
          db.run('UPDATE teams SET budget = budget - ? WHERE id = ?', [price, playerState.teamId], () => {
             db.run('UPDATE players SET team_id = ? WHERE id = ?', [playerState.teamId, playerId], () => {
                const index = globalMarket.findIndex(p => p.id === playerId);
                if (index > -1) globalMarket.splice(index, 1);
                
                io.emit('marketUpdate', globalMarket);
                db.all('SELECT * FROM teams', (err, teams) => io.emit('teamsData', teams));
                db.all('SELECT * FROM players WHERE team_id = ?', [playerState.teamId], (err, squad) => socket.emit('mySquad', squad));
                socket.emit('systemMessage', `Contrataste ${player.name} por ${price}!`);
             });
          });
        } else {
          socket.emit('systemMessage', 'Não tens fundo de maneio suficiente!');
        }
      });
    });
  });

  socket.on('setReady', (ready) => {
    if (players[socket.id]) {
      players[socket.id].ready = ready;
      io.emit('playerListUpdate', Object.values(players));
      checkAllReady();
    }
  });

  socket.on('setTactic', (tactic) => {
    if (players[socket.id]) {
      players[socket.id].tactic = tactic;
      socket.emit('systemMessage', `Tática alterada para ${tactic.formation} (${tactic.style})`);
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    delete players[socket.id];
    io.emit('playerListUpdate', Object.values(players));
  });
});

async function checkAllReady() {
  const playerIds = Object.keys(players);
  if (playerIds.length === 0) return;

  const allReady = playerIds.every(id => players[id].ready);
  
  if (allReady) {
    console.log(`All players ready! Simulating matchweek ${matchweek}...`);
    
    const pList = Object.values(players);
    let hTeam = 1, aTeam = 2;
    let hTactic = { formation: '4-4-2', style: 'Balanced' };
    let aTactic = { formation: '4-4-2', style: 'Balanced' };

    if (pList.length >= 2) {
       hTeam = pList[0].teamId; hTactic = pList[0].tactic;
       aTeam = pList[1].teamId; aTactic = pList[1].tactic;
    } else if (pList.length === 1) {
       hTeam = pList[0].teamId; hTactic = pList[0].tactic;
       aTeam = hTeam == 1 ? 2 : 1; 
    }

    const { simulateMatch } = require('./game/engine');
    const results = await simulateMatch(hTeam, aTeam, hTactic, aTactic); 
    
    io.emit('matchResults', { matchweek, results });
    
    // Reset ready status
    playerIds.forEach(id => players[id].ready = false);
    matchweek++;
    
    io.emit('playerListUpdate', Object.values(players));
  }
}

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
