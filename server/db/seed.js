const db = require('./database');

const divisionsData = {
  1: { teams: ['Benfica', 'FC Porto', 'Sporting CP', 'SC Braga', 'Vitória SC', 'Boavista', 'Famalicão', 'Estoril'], budget: 50000 },
  2: { teams: ['Marítimo', 'Paços de Ferreira', 'Nacional', 'Leiria', 'Belenenses', 'Feirense', 'Penafiel', 'Mafra'], budget: 35000 },
  3: { teams: ['Académica', 'Alverca', 'Varzim', 'Felgueiras', 'Braga B', 'Trofense', 'Fafe', 'Sanjoanense'], budget: 25000 },
  4: { teams: ['Salgueiros', 'Leixões', 'Beira-Mar', 'Vianense', 'Vila Real', 'Mirandela', 'Ponte da Barca', 'Bragança'], budget: 15000 }
};

const firstNames = ['João', 'Rui', 'Miguel', 'Pedro', 'Nuno', 'Ricardo', 'Tiago', 'Diogo', 'Bruno', 'André', 'Hugo', 'Filipe', 'Carlos', 'José', 'Ruben', 'Gonçalo', 'Francisco'];
const lastNames = ['Silva', 'Santos', 'Ferreira', 'Pereira', 'Oliveira', 'Costa', 'Rodrigues', 'Martins', 'Gomes', 'Lopes', 'Alves', 'Monteiro', 'Ribeiro', 'Fernandes'];
const nationalities = ['POR', 'POR', 'POR', 'POR', 'BRA', 'BRA', 'ARG', 'ESP'];
const aggressivenessLevels = ['Low', 'Medium', 'Medium', 'Medium', 'High'];

function getRandomName() {
  const first = firstNames[Math.floor(Math.random() * firstNames.length)];
  const last = lastNames[Math.floor(Math.random() * lastNames.length)];
  return `${first} ${last}`;
}

db.serialize(() => {
  db.run('DELETE FROM players');
  db.run('DELETE FROM teams');

  console.log('Seeding 32 teams and 512 players across 4 divisions...');
  
  const insertTeam = db.prepare('INSERT INTO teams (name, division, budget) VALUES (?, ?, ?)');
  const insertPlayer = db.prepare('INSERT INTO players (name, position, skill, age, form, aggressiveness, nationality, value, wage, team_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');

  let teamId = 1;
  
  for (let div = 1; div <= 4; div++) {
    const data = divisionsData[div];
    data.teams.forEach(teamName => {
      insertTeam.run(teamName, div, data.budget);
      
      const teamPositions = ['GK', 'GK', 'DEF', 'DEF', 'DEF', 'DEF', 'DEF', 'MID', 'MID', 'MID', 'MID', 'MID', 'ATK', 'ATK', 'ATK', 'ATK'];
      
      teamPositions.forEach(pos => {
        const name = getRandomName();
        const baseSkill = 50 - ((div - 1) * 10); 
        let skill = baseSkill + Math.floor(Math.random() * 15) - 5;
        if (skill < 1) skill = 1;
        if (skill > 50) skill = 50;
        
        const age = Math.floor(Math.random() * 16) + 18; // 18 to 34
        const form = Math.floor(Math.random() * 20) + 80; // 80 to 100
        const agg = aggressivenessLevels[Math.floor(Math.random() * aggressivenessLevels.length)];
        const nat = nationalities[Math.floor(Math.random() * nationalities.length)];
        
        const value = skill * 50000;
        let wage = 500;
        if (skill >= 10 && skill < 25) wage = 1000;
        if (skill >= 25 && skill < 40) wage = 2000;
        if (skill >= 40) wage = 5000;
        
        insertPlayer.run(name, pos, skill, age, form, agg, nat, value, wage, teamId);
      });
      teamId++;
    });
  }

  insertTeam.finalize();
  insertPlayer.finalize();

  console.log('Seed complete. Ready for new sim.');
});

db.close();
