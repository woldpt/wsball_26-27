const fs = require('fs');
const path = require('path');
const db = require('./database');

// Support fixtures: use `--real` to load JSON fixtures from server/db/fixtures/
const useReal = process.argv.includes('--real') || process.argv.includes('-r');
const fixturesDir = path.join(__dirname, 'fixtures');

let divisionsData = null;
let playersByTeam = null;
let stadiumsArr = null;
let managersArr = null;

if (useReal) {
  try {
    const teamsFile = path.join(fixturesDir, 'teams.json');
    if (fs.existsSync(teamsFile)) {
      const teamsJson = JSON.parse(fs.readFileSync(teamsFile, 'utf8'));
      // Expecting structure { divisions: { "1": ["Team A", ...], "2": [...] } }
      divisionsData = {};
      Object.keys(teamsJson.divisions || {}).forEach((k) => {
        divisionsData[Number(k)] = { teams: teamsJson.divisions[k], budget: 1500000 };
      });
      // load other fixtures if present
      const playersFile = path.join(fixturesDir, 'players.json');
      if (fs.existsSync(playersFile)) {
        const p = JSON.parse(fs.readFileSync(playersFile, 'utf8'));
        playersByTeam = p.byTeam || null;
      }
      const stadiumsFile = path.join(fixturesDir, 'stadiums.json');
      if (fs.existsSync(stadiumsFile)) {
        stadiumsArr = JSON.parse(fs.readFileSync(stadiumsFile, 'utf8'));
      }
      const managersFile = path.join(fixturesDir, 'managers.json');
      if (fs.existsSync(managersFile)) {
        managersArr = JSON.parse(fs.readFileSync(managersFile, 'utf8'));
      }
    }
  } catch (e) {
    console.error('Error loading fixtures:', e);
    divisionsData = null;
  }
}

// Fallback random generator (existing behavior) if no fixtures provided
if (!divisionsData) {
  divisionsData = {
    1: { teams: ['Triunfo FC','Atlético do Norte','Desportivo Central','União da Serra','Estrela da Manhã','Guerreiros SC','Invicta FC','Real Clube'], budget: 10000000 },
    2: { teams: ['Academia Sul','Leões da Fronteira','Bravos de Leste','Trovão FC','Fénix Azul','Pioneiros SC','Vanguarda Desportiva','Dragões do Vale'], budget: 5000000 },
    3: { teams: ['Titãs do Ouro','Alvorada FC','Centauros AC','Falcões de Ferro','Gigantes SC','Lobos da Planície','Meteoros FC','Panteras Negras'], budget: 2500000 },
    4: { teams: ['Águias Douradas','Corsários FC','Gladiadores SC','Tempestade AC','Vulcanos FC','Zeus Desportivo','Cometas SC','Piratas do Mar'], budget: 1500000 },
    5: { teams: ['Amadores de Viseu','Rio Maior FC','Desportivo da Aldeia','Recreativo Serrano','União de Bairro','Sporting da Aldeia','Coruchense FC','Lousã Desportiva'], budget: 500000 }
  };
}

const firstA = [
  "Zal",
  "Kael",
  "Dorn",
  "Val",
  "Torn",
  "Gor",
  "Fen",
  "Ryn",
  "Zan",
  "Morg",
  "Sil",
  "Cor",
  "Jax",
  "Tor",
];
const firstB = ["is", "en", "ar", "os", "us", "ok", "ir", "an"];
const lastA = [
  "Trovão",
  "Flecha",
  "Rochedo",
  "Vendaval",
  "Fogo",
  "Aço",
  "Sombra",
  "Luz",
  "Gelo",
  "Vento",
];
const lastB = [
  "Negro",
  "Branco",
  "Veloz",
  "Forte",
  "Bravo",
  "Leal",
  "Cruel",
  "Rápido",
  "Feroz",
  "Eterno",
];
const nationalities = ["ZTR", "VNT", "BRR", "PNN", "MTR", "LST", "GNR", "FRR"];
const aggressivenessLevels = ["Low", "Medium", "Medium", "Medium", "High"];
const skillRanges = {
  1: [40, 50],
  2: [30, 40],
  3: [20, 30],
  4: [5, 20],
  5: [1, 10],
};

function randomSkill(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getRandomName() {
  const isFantasy = Math.random() > 0.5;
  if (isFantasy) {
    const f =
      firstA[Math.floor(Math.random() * firstA.length)] +
      firstB[Math.floor(Math.random() * firstB.length)];
    return (
      f.charAt(0).toUpperCase() +
      f.slice(1) +
      " " +
      lastA[Math.floor(Math.random() * lastA.length)]
    );
  } else {
    return (
      lastA[Math.floor(Math.random() * lastA.length)] +
      " " +
      lastB[Math.floor(Math.random() * lastB.length)]
    );
  }
}

db.serialize(() => {
  db.run("DELETE FROM players");
  db.run("DELETE FROM teams");
  db.run("DELETE FROM managers");
  db.run("DELETE FROM game_state");
  // reset sqlite autoincrement sequences so inserted IDs start predictable at 1
  db.run("DELETE FROM sqlite_sequence WHERE name='players'");
  db.run("DELETE FROM sqlite_sequence WHERE name='teams'");
  db.run("DELETE FROM sqlite_sequence WHERE name='managers'");

  console.log(
    "Seeding 40 fictitious teams and 640 players across 5 divisions (inc. Distritais) (Base DB)...",
  );

  const insertManager = db.prepare('INSERT INTO managers (name, reputation) VALUES (?, ?)');
  const insertTeam = db.prepare('INSERT INTO teams (name, manager_id, division, stadium_capacity, budget, color_primary, color_secondary) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const insertPlayer = db.prepare('INSERT INTO players (name, position, skill, age, form, aggressiveness, nationality, value, wage, goals, is_star, team_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)');

  let teamId = 1;
  let managerId = 1;
  const usedManagers = new Set();

  for (let div = 1; div <= 5; div++) {
    const data = divisionsData[div];
    if (!data) continue;
    data.teams.forEach((teamName) => {
      // manager: try to use fixtures manager list if present, else random
      let managerName = 'Mr. ' + getRandomName() + ' (' + teamName.split(' ')[0] + ')';
      try {
        const managersFile = path.join(fixturesDir, 'managers.json');
        if (useReal && fs.existsSync(managersFile)) {
          const managersArr = JSON.parse(fs.readFileSync(managersFile, 'utf8'));
          const m = managersArr[(managerId - 1) % managersArr.length];
          if (m && m.name) {
            // ensure uniqueness (managers.name is UNIQUE in schema)
            const base = m.name;
            let candidate = base;
            let suffix = 1;
            while (usedManagers.has(candidate)) {
              candidate = `${base} #${suffix}`;
              suffix++;
            }
            managerName = candidate;
            usedManagers.add(managerName);
          }
        }
      } catch (e) {
        // ignore and fallback to generated name
      }

      insertManager.run(managerName, 50);

      const colors = [
        ['#dc2626', '#ffffff'], ['#2563eb', '#ffffff'], ['#16a34a', '#ffffff'], ['#000000', '#ffffff'], ['#ca8a04', '#000000'], ['#7c3aed', '#ffffff'], ['#db2777', '#ffffff'], ['#ea580c', '#ffffff'], ['#0891b2', '#ffffff'], ['#4f46e5', '#ffffff'], ['#059669', '#ffffff'], ['#ffffff', '#000000']
      ];
      const teamColors = colors[teamId % colors.length];
      let stadiumCapacity = data.budget || 10000;
      try {
        if (stadiumsArr && stadiumsArr[teamId - 1] && stadiumsArr[teamId - 1].capacity) {
          stadiumCapacity = stadiumsArr[teamId - 1].capacity;
        }
      } catch (e) {}
      insertTeam.run(teamName, managerId, div, stadiumCapacity, data.budget || 150000, teamColors[0], teamColors[1]);

      // ensure 20 players per team when using real fixtures, otherwise keep previous 16
      const desiredPlayers = useReal ? 20 : 16;
      // If playersByTeam has entries for this team, use them
      let provided = [];
      try {
        if (playersByTeam && playersByTeam[teamName] && Array.isArray(playersByTeam[teamName])) {
          provided = playersByTeam[teamName];
        }
      } catch (e) { provided = []; }

      const positionsDefault = ['GK','GK','DEF','DEF','DEF','DEF','DEF','DEF','MID','MID','MID','MID','MID','MID','ATK','ATK','ATK','ATK','MID','DEF'];
      // insert provided players first
      for (let i = 0; i < desiredPlayers; i++) {
        let p = provided[i];
        let pos = positionsDefault[i % positionsDefault.length];
        let name = getRandomName();
        let skill = randomSkill((skillRanges[div]||[5,20])[0], (skillRanges[div]||[5,20])[1]);
        let age = Math.floor(Math.random() * 16) + 18;
        let form = Math.floor(Math.random() * 20) + 80;
        let agg = aggressivenessLevels[Math.floor(Math.random() * aggressivenessLevels.length)];
        let nat = nationalities[Math.floor(Math.random() * nationalities.length)];
        if (p) {
          if (p.name) name = p.name;
          if (p.position) pos = p.position;
          if (p.skill) skill = p.skill;
          if (p.age) age = p.age;
          if (p.form) form = p.form;
          if (p.aggressiveness) agg = p.aggressiveness;
          if (p.nationality) nat = p.nationality;
        }
        const value = skill * 5000;
        const wage = skill * 50;
        const isStar = (pos === 'MID' || pos === 'ATK') && Math.random() < 0.18 ? 1 : 0;
        insertPlayer.run(name, pos, skill, age, form, agg, nat, value, wage, isStar, teamId);
      }
      teamId++;
      managerId++;
    });
  }

  // Generate 30 free agents for the transfer market
  const freePositions = ["GK", "DEF", "DEF", "MID", "MID", "MID", "ATK", "ATK"];
  for (let i = 0; i < 30; i++) {
    const name = getRandomName();
    const pos = freePositions[Math.floor(Math.random() * freePositions.length)];
    let skill = randomSkill(0, 15); // Distrital-level free agents
    const age = Math.floor(Math.random() * 16) + 18;
    const form = Math.floor(Math.random() * 20) + 80;
    const agg =
      aggressivenessLevels[
        Math.floor(Math.random() * aggressivenessLevels.length)
      ];
    const nat = nationalities[Math.floor(Math.random() * nationalities.length)];
    const value = skill * 5000;
    const wage = skill * 50;
    const isStar =
      (pos === "MID" || pos === "ATK") && Math.random() < 0.12 ? 1 : 0;
    insertPlayer.run(
      name,
      pos,
      skill,
      age,
      form,
      agg,
      nat,
      value,
      wage,
      isStar,
      null,
    ); // team_id = null = free agent
  }

  // Initialize game state defaults
  db.run("INSERT INTO game_state (key, value) VALUES ('matchweek', '1')");
  db.run("INSERT INTO game_state (key, value) VALUES ('matchState', 'idle')");
  db.run("INSERT INTO game_state (key, value) VALUES ('season', '1')");
  db.run("INSERT INTO game_state (key, value) VALUES ('cupRound', '0')");
  db.run("INSERT INTO game_state (key, value) VALUES ('cupState', 'idle')");

  insertManager.finalize();
  insertTeam.finalize();
  insertPlayer.finalize();

  console.log("Base Seed complete.");
});

db.close();
