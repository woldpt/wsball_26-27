const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { getGame, getGameBySocket } = require('./gameManager');
const { simulateDivision } = require('./game/engine');

const app = express();
app.use(cors());

app.get('/saves', (req, res) => {
  try {
    const files = fs.readdirSync(path.join(__dirname, 'db'));
    const saves = files
      .filter(f => f.startsWith('game_') && f.endsWith('.db'))
      .map(f => f.replace('game_', '').replace('.db', ''));
    res.json(saves);
  } catch (e) {
    res.json([]);
  }
});

const server = http.createServer(app);

const io = new Server(server, { cors: { origin: '*', methods: ['GET', 'POST'] } });

io.on('connection', (socket) => {
  socket.on('joinGame', (data) => {
    const roomCode = data.roomCode.toUpperCase();
    const game = getGame(roomCode);
    socket.join(roomCode);
    
    if (Object.keys(game.players).length >= 8) {
      socket.emit('systemMessage', 'Sala cheia (Máximo 8 Treinadores).');
      return;
    }

    const takenTeams = Object.values(game.players).map(p => p.teamId);
    let query = 'SELECT id, name FROM teams WHERE division = 4';
    if (takenTeams.length > 0) {
       query += ` AND id NOT IN (${takenTeams.join(',')})`;
    }
    query += ' ORDER BY RANDOM() LIMIT 1';

    game.db.get(query, (err, team) => {
      if (err || !team) {
         socket.emit('systemMessage', 'Nenhuma equipa disponível na Divisão 4.');
         return;
      }
      
      game.players[socket.id] = { 
        name: data.name, 
        teamId: team.id, 
        roomCode: roomCode,
        ready: false,
        tactic: { formation: '4-4-2', style: 'Balanced' }
      };

      game.db.all('SELECT * FROM teams', (err, teams) => {
        socket.emit('teamsData', teams);
      });
      game.db.all('SELECT * FROM players WHERE team_id = ?', [team.id], (err, squad) => {
        socket.emit('mySquad', squad);
      });
      
      socket.emit('marketUpdate', game.globalMarket);
      io.to(roomCode).emit('playerListUpdate', Object.values(game.players));
      socket.emit('systemMessage', `Foste contratado pelo ${team.name} (Divisão 4)!`);
    });
  });

  socket.on('buyPlayer', (playerId) => {
    const game = getGameBySocket(socket.id);
    if (!game) return;
    const playerState = game.players[socket.id];

    game.db.get('SELECT * FROM players WHERE id = ?', [playerId], (err, player) => {
      if (!player) return;
      game.db.get('SELECT budget FROM teams WHERE id = ?', [playerState.teamId], (err, team) => {
        if (!team) return;
        
        const price = player.value * 1.2;
        if (team.budget >= price) {
          game.db.run('UPDATE teams SET budget = budget - ? WHERE id = ?', [price, playerState.teamId], () => {
             game.db.run('UPDATE players SET team_id = ? WHERE id = ?', [playerState.teamId, playerId], () => {
                const index = game.globalMarket.findIndex(p => p.id === playerId);
                if (index > -1) game.globalMarket.splice(index, 1);
                
                io.to(game.roomCode).emit('marketUpdate', game.globalMarket);
                game.db.all('SELECT * FROM teams', (err, teams) => io.to(game.roomCode).emit('teamsData', teams));
                game.db.all('SELECT * FROM players WHERE team_id = ?', [playerState.teamId], (err, squad) => socket.emit('mySquad', squad));
                socket.emit('systemMessage', `Contrataste ${player.name} por €${price}!`);
             });
          });
        } else {
          socket.emit('systemMessage', 'Não tens fundo de maneio suficiente!');
        }
      });
    });
  });

  socket.on('setTactic', (tactic) => {
    const game = getGameBySocket(socket.id);
    if (game) {
      game.players[socket.id].tactic = tactic;
      socket.emit('systemMessage', `Tática alterada para ${tactic.formation} (${tactic.style})`);
    }
  });

  socket.on('buildStadium', () => {
    const game = getGameBySocket(socket.id);
    if (!game) return;
    const playerState = game.players[socket.id];
    game.db.get('SELECT budget, stadium_capacity FROM teams WHERE id = ?', [playerState.teamId], (err, team) => {
      const cost = 250000;
      if (team && team.budget >= cost) {
        game.db.run('UPDATE teams SET budget = budget - ?, stadium_capacity = stadium_capacity + 2000 WHERE id = ?', [cost, playerState.teamId], () => {
          game.db.all('SELECT * FROM teams', (err, teams) => io.to(game.roomCode).emit('teamsData', teams));
          socket.emit('systemMessage', '+2000 Lugares Construídos!');
        });
      } else {
        socket.emit('systemMessage', 'Sem dinheiro (Custo: 250.000€)!');
      }
    });
  });

  socket.on('takeLoan', () => {
    const game = getGameBySocket(socket.id);
    if (!game) return;
    const playerState = game.players[socket.id];
    game.db.run('UPDATE teams SET budget = budget + 500000, loan_amount = loan_amount + 500000 WHERE id = ?', [playerState.teamId], () => {
      game.db.all('SELECT * FROM teams', (err, teams) => io.to(game.roomCode).emit('teamsData', teams));
      socket.emit('systemMessage', 'Empréstimo de 500.000€ aprovado (Juro 5%/Semana).');
    });
  });

  socket.on('payLoan', () => {
    const game = getGameBySocket(socket.id);
    if (!game) return;
    const playerState = game.players[socket.id];
    game.db.get('SELECT budget, loan_amount FROM teams WHERE id = ?', [playerState.teamId], (err, team) => {
      if (team && team.loan_amount >= 500000 && team.budget >= 500000) {
        game.db.run('UPDATE teams SET budget = budget - 500000, loan_amount = loan_amount - 500000 WHERE id = ?', [playerState.teamId], () => {
          game.db.all('SELECT * FROM teams', (err, teams) => io.to(game.roomCode).emit('teamsData', teams));
          socket.emit('systemMessage', 'Dívida paga (500.000€) ao Banco.');
        });
      } else {
        socket.emit('systemMessage', 'Não deves esse valor, ou não tens 500k disponíveis.');
      }
    });
  });

  socket.on('setReady', (ready) => {
    const game = getGameBySocket(socket.id);
    if (!game) return;
    game.players[socket.id].ready = ready;
    io.to(game.roomCode).emit('playerListUpdate', Object.values(game.players));
    checkAllReady(game);
  });

  socket.on('disconnect', () => {
    const game = getGameBySocket(socket.id);
    if (game) {
      delete game.players[socket.id];
      io.to(game.roomCode).emit('playerListUpdate', Object.values(game.players));
      checkAllReady(game); // Advance if others were waiting on him
    }
  });
});

async function checkAllReady(game) {
  const playerIds = Object.keys(game.players);
  if (playerIds.length === 0) return;

  const allReady = playerIds.every(id => game.players[id].ready);
  
  if (allReady) {
    console.log(`All players ready in room ${game.roomCode}! Simulating matchweek ${game.matchweek}...`);
    
    game.db.run(`
      UPDATE teams 
      SET budget = budget 
        - CAST((loan_amount * 0.05) AS INTEGER) 
        + (stadium_capacity * 10)
        - (SELECT COALESCE(SUM(wage), 0) FROM players WHERE players.team_id = teams.id)
    `, async () => {
        const results = await simulateDivision(game, 4);
        
        io.to(game.roomCode).emit('matchResults', { matchweek: game.matchweek, results });
        
        playerIds.forEach(id => game.players[id].ready = false);
        game.matchweek++;
        
        // Broadcast new team financial stats
        game.db.all('SELECT * FROM teams', (err, teams) => io.to(game.roomCode).emit('teamsData', teams));
        io.to(game.roomCode).emit('playerListUpdate', Object.values(game.players));
    });
  } else {
    // Notify users about who is ready
    const readyCount = playerIds.filter(id => game.players[id].ready).length;
    // Just informative
  }
}

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
