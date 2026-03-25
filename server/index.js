const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { getGame, getGameBySocket, saveGameState } = require('./gameManager');
const { generateFixturesForDivision, simulateMatchSegment } = require('./game/engine');

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
    
    if (Object.keys(game.players).length >= 8 && !game.players[socket.id]) {
      socket.emit('systemMessage', 'Sala cheia (Máximo 8 Treinadores).');
      return;
    }

    game.db.get('SELECT * FROM managers WHERE name = ?', [data.name], (err, row) => {
      if (row) {
         game.db.get('SELECT id, name FROM teams WHERE manager_id = ?', [row.id], (err, t) => {
            if (t) assignPlayer(game, socket, data.name, t, roomCode);
            else generateRandomTeam(game, socket, data.name, roomCode, row.id);
         });
      } else {
         game.db.run('INSERT INTO managers (name) VALUES (?)', [data.name], function(err) {
            generateRandomTeam(game, socket, data.name, roomCode, this.lastID);
         });
      }
    });
  });

  function generateRandomTeam(game, socket, name, roomCode, managerId) {
    const takenTeams = Object.values(game.players).map(p => p.teamId);
    let query = 'SELECT id, name FROM teams WHERE division = 4 AND manager_id IS NULL';
    if (takenTeams.length > 0) query += ` AND id NOT IN (${takenTeams.join(',')})`;
    query += ' ORDER BY RANDOM() LIMIT 1';

    game.db.get(query, (err, team) => {
      if (err || !team) {
         // Fallback: try any division 4 team not currently in use
         let fallbackQuery = 'SELECT id, name FROM teams WHERE division = 4';
         if (takenTeams.length > 0) fallbackQuery += ` AND id NOT IN (${takenTeams.join(',')})`;
         fallbackQuery += ' ORDER BY RANDOM() LIMIT 1';
         
         game.db.get(fallbackQuery, (err2, team2) => {
           if (err2 || !team2) {
             socket.emit('systemMessage', 'Nenhuma equipa disponível na Divisão 4.');
             return;
           }
           game.db.run('UPDATE teams SET manager_id = ? WHERE id = ?', [managerId, team2.id], () => {
             assignPlayer(game, socket, name, team2, roomCode);
           });
         });
         return;
      }
      game.db.run('UPDATE teams SET manager_id = ? WHERE id = ?', [managerId, team.id], () => {
         assignPlayer(game, socket, name, team, roomCode);
      });
    });
  }

  function assignPlayer(game, socket, name, team, roomCode) {
    // Remove any existing entry for this player name (handles reconnection with new socket ID)
    for (const [sid, p] of Object.entries(game.players)) {
      if (p.name === name) {
        delete game.players[sid];
        break;
      }
    }
    
    game.players[socket.id] = { 
      name: name, teamId: team.id, roomCode: roomCode, ready: false, tactic: { formation: '4-4-2', style: 'Balanced' }
    };
    game.db.all('SELECT * FROM teams', (err, teams) => socket.emit('teamsData', teams));
    game.db.all('SELECT * FROM players WHERE team_id = ?', [team.id], (err, squad) => socket.emit('mySquad', squad));
    socket.emit('marketUpdate', game.globalMarket);
    socket.emit('gameState', { matchweek: game.matchweek, matchState: game.matchState });
    io.to(roomCode).emit('playerListUpdate', Object.values(game.players));
    socket.emit('systemMessage', `Foste contratado pelo ${team.name} (Divisão 4)!`);
  }

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
    if (game && game.players[socket.id]) {
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
      // Don't auto-advance on disconnect — could cause premature match starts
    }
  });
});

async function checkAllReady(game) {
  const playerIds = Object.keys(game.players);
  if (playerIds.length === 0) return;

  const allReady = playerIds.every(id => game.players[id].ready);
  
  if (allReady) {
    console.log(`All players ready in room ${game.roomCode}! matchweek=${game.matchweek} matchState=${game.matchState}`);
    
    if (game.matchState === 'idle') {
      // Weekly financial loop
      game.db.run(`
        UPDATE teams 
        SET budget = budget 
          - CAST((loan_amount * 0.05) AS INTEGER) 
          + (stadium_capacity * 10)
          - (SELECT COALESCE(SUM(wage), 0) FROM players WHERE players.team_id = teams.id)
      `, async (err) => {
          if (err) console.error("Weekly Loop Err:", err);
          
          // Generate fixtures using round-robin with current matchweek
          const mw = game.matchweek;
          const f1 = await generateFixturesForDivision(game.db, 1, mw);
          const f2 = await generateFixturesForDivision(game.db, 2, mw);
          const f3 = await generateFixturesForDivision(game.db, 3, mw);
          const f4 = await generateFixturesForDivision(game.db, 4, mw);
          game.fixtures = [...f1, ...f2, ...f3, ...f4];
          
          await processSegment(game, 1, 45, 'halftime');
      });
    } else if (game.matchState === 'halftime') {
       await processSegment(game, 46, 90, 'idle');
    }
  }
}

async function processSegment(game, startMin, endMin, nextState) {
  for (let fx of game.fixtures) {
      const p1 = Object.values(game.players).find(p => p.teamId === fx.homeTeamId);
      const p2 = Object.values(game.players).find(p => p.teamId === fx.awayTeamId);
      const t1 = p1 ? p1.tactic : { formation: '4-4-2', style: 'Balanced' };
      const t2 = p2 ? p2.tactic : { formation: '4-4-2', style: 'Balanced' };
      await simulateMatchSegment(game.db, fx, t1, t2, startMin, endMin);
  }

  game.matchState = nextState;
  const playerIds = Object.keys(game.players);

  if (nextState === 'halftime') {
      io.to(game.roomCode).emit('halfTimeResults', { matchweek: game.matchweek, results: game.fixtures });
      playerIds.forEach(id => game.players[id].ready = false);
      io.to(game.roomCode).emit('playerListUpdate', Object.values(game.players));
      saveGameState(game);
  } else {
      // Full time — update standings
      game.db.serialize(() => {
        game.db.run("BEGIN TRANSACTION");
        for (let match of game.fixtures) {
           const hG = match.finalHomeGoals;
           const aG = match.finalAwayGoals;
           let hPts = 0, aPts = 0, hW = 0, hD = 0, hL = 0, aW = 0, aD = 0, aL = 0;
           if (hG > aG) { hPts = 3; hW = 1; aL = 1; }
           else if (hG < aG) { aPts = 3; aW = 1; hL = 1; }
           else { hPts = 1; aPts = 1; hD = 1; aD = 1; }
           
           game.db.run('UPDATE teams SET points=points+?, wins=wins+?, draws=draws+?, losses=losses+?, goals_for=goals_for+?, goals_against=goals_against+? WHERE id=?', [hPts, hW, hD, hL, hG, aG, match.homeTeamId]);
           game.db.run('UPDATE teams SET points=points+?, wins=wins+?, draws=draws+?, losses=losses+?, goals_for=goals_for+?, goals_against=goals_against+? WHERE id=?', [aPts, aW, aD, aL, aG, hG, match.awayTeamId]);
        }
        game.db.run("COMMIT", () => {
          io.to(game.roomCode).emit('matchResults', { matchweek: game.matchweek, results: game.fixtures });
          playerIds.forEach(id => game.players[id].ready = false);
          game.matchweek++;
          saveGameState(game);
          game.db.all('SELECT * FROM teams', (err, teams) => io.to(game.roomCode).emit('teamsData', teams));
          io.to(game.roomCode).emit('playerListUpdate', Object.values(game.players));
        });
      });
  }
}

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
