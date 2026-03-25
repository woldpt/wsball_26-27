const db = require('./database');

const divisionsData = {
  1: { teams: ['Triunfo FC', 'Atlético do Norte', 'Desportivo Central', 'União da Serra', 'Estrela da Manhã', 'Guerreiros SC', 'Invicta FC', 'Real Clube'], budget: 10000000 },
  2: { teams: ['Academia Sul', 'Leões da Fronteira', 'Bravos de Leste', 'Trovão FC', 'Fénix Azul', 'Pioneiros SC', 'Vanguarda Desportiva', 'Dragões do Vale'], budget: 5000000 },
  3: { teams: ['Titãs do Ouro', 'Alvorada FC', 'Centauros AC', 'Falcões de Ferro', 'Gigantes SC', 'Lobos da Planície', 'Meteoros FC', 'Panteras Negras'], budget: 2500000 },
  4: { teams: ['Águias Douradas', 'Corsários FC', 'Gladiadores SC', 'Tempestade AC', 'Vulcanos FC', 'Zeus Desportivo', 'Cometas SC', 'Piratas do Mar'], budget: 1500000 }
};

const firstA = ['Zal', 'Kael', 'Dorn', 'Val', 'Torn', 'Gor', 'Fen', 'Ryn', 'Zan', 'Morg', 'Sil', 'Cor', 'Jax', 'Tor'];
const firstB = ['is', 'en', 'ar', 'os', 'us', 'ok', 'ir', 'an'];
const lastA = ['Trovão', 'Flecha', 'Rochedo', 'Vendaval', 'Fogo', 'Aço', 'Sombra', 'Luz', 'Gelo', 'Vento'];
const lastB = ['Negro', 'Branco', 'Veloz', 'Forte', 'Bravo', 'Leal', 'Cruel', 'Rápido', 'Feroz', 'Eterno'];
const nationalities = ['ZTR', 'VNT', 'BRR', 'PNN', 'MTR', 'LST', 'GNR', 'FRR'];
const aggressivenessLevels = ['Low', 'Medium', 'Medium', 'Medium', 'High'];

function getRandomName() {
  const isFantasy = Math.random() > 0.5;
  if(isFantasy) {
     const f = firstA[Math.floor(Math.random() * firstA.length)] + firstB[Math.floor(Math.random() * firstB.length)];
     return f.charAt(0).toUpperCase() + f.slice(1) + ' ' + lastA[Math.floor(Math.random() * lastA.length)];
  } else {
     return lastA[Math.floor(Math.random() * lastA.length)] + ' ' + lastB[Math.floor(Math.random() * lastB.length)];
  }
}

db.serialize(() => {
  db.run('DELETE FROM players');
  db.run('DELETE FROM teams');
  db.run('DELETE FROM managers');
  db.run('DELETE FROM game_state');

  console.log('Seeding 32 fictitious teams and 512 players across 4 divisions (Base DB)...');
  
  const insertManager = db.prepare('INSERT INTO managers (name, reputation) VALUES (?, ?)');
  const insertTeam = db.prepare('INSERT INTO teams (name, manager_id, division, budget) VALUES (?, ?, ?, ?)');
  const insertPlayer = db.prepare('INSERT INTO players (name, position, skill, age, form, aggressiveness, nationality, value, wage, team_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');

  let teamId = 1;
  let managerId = 1;
  
  for (let div = 1; div <= 4; div++) {
    const data = divisionsData[div];
    data.teams.forEach(teamName => {
      const managerName = 'Mr. ' + getRandomName() + ' (' + teamName.split(' ')[0] + ')';
      insertManager.run(managerName, 50);
      insertTeam.run(teamName, managerId, div, data.budget);
      
      const teamPositions = ['GK', 'GK', 'DEF', 'DEF', 'DEF', 'DEF', 'DEF', 'MID', 'MID', 'MID', 'MID', 'MID', 'ATK', 'ATK', 'ATK', 'ATK'];
      teamPositions.forEach(pos => {
        const name = getRandomName();
        const baseSkill = 50 - ((div - 1) * 10); 
        let skill = baseSkill + Math.floor(Math.random() * 15) - 5;
        if (skill < 1) skill = 1;
        if (skill > 50) skill = 50;
        
        const age = Math.floor(Math.random() * 16) + 18; 
        const form = Math.floor(Math.random() * 20) + 80;
        const agg = aggressivenessLevels[Math.floor(Math.random() * aggressivenessLevels.length)];
        const nat = nationalities[Math.floor(Math.random() * nationalities.length)];
        
        const value = skill * 5000;
        const wage = skill * 50;
        
        insertPlayer.run(name, pos, skill, age, form, agg, nat, value, wage, teamId);
      });
      teamId++;
      managerId++;
    });
  }

  // Generate 30 free agents for the transfer market
  const freePositions = ['GK', 'DEF', 'DEF', 'MID', 'MID', 'MID', 'ATK', 'ATK'];
  for (let i = 0; i < 30; i++) {
    const name = getRandomName();
    const pos = freePositions[Math.floor(Math.random() * freePositions.length)];
    let skill = Math.floor(Math.random() * 35) + 5; // 5-39 (no top-tier free agents)
    const age = Math.floor(Math.random() * 16) + 18;
    const form = Math.floor(Math.random() * 20) + 80;
    const agg = aggressivenessLevels[Math.floor(Math.random() * aggressivenessLevels.length)];
    const nat = nationalities[Math.floor(Math.random() * nationalities.length)];
    const value = skill * 5000;
    const wage = skill * 50;
    insertPlayer.run(name, pos, skill, age, form, agg, nat, value, wage, null); // team_id = null = free agent
  }

  // Initialize game state defaults
  db.run("INSERT INTO game_state (key, value) VALUES ('matchweek', '1')");
  db.run("INSERT INTO game_state (key, value) VALUES ('matchState', 'idle')");

  insertManager.finalize();
  insertTeam.finalize();
  insertPlayer.finalize();

  console.log('Base Seed complete.');
});

db.close();
