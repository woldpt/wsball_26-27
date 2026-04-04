const fs = require("fs");
const path = require("path");
const db = require("./database");

// Always load team fixtures from server/db/fixtures/all_teams.json
const fixturesDir = path.join(__dirname, "fixtures");

let allTeamsData = null;

try {
  const allTeamsFile = path.join(fixturesDir, "all_teams.json");
  if (fs.existsSync(allTeamsFile)) {
    const data = JSON.parse(fs.readFileSync(allTeamsFile, "utf8"));
    if (data.teams && Array.isArray(data.teams)) {
      allTeamsData = data.teams;
    }
  }
} catch (e) {
  console.error("Error loading all_teams.json:", e);
  allTeamsData = null;
}

if (!allTeamsData || allTeamsData.length === 0) {
  console.error("FATAL: all_teams.json not found or empty. Cannot seed.");
  process.exit(1);
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
const nationalities = ["🇵🇹", "🇧🇷", "🇪🇸", "🇫🇷", "🇩🇪", "🇦🇷", "🇺🇾", "🇨🇴", "🇳🇬", "🇸🇳", "🇨🇮", "🇬🇭", "🇲🇦", "🇩🇿", "🇨🇲", "🇧🇪", "🇳🇱", "🇮🇹", "🇭🇷", "🇸🇪"];
function randomAggressiveness() {
  return 1 + Math.floor(Math.random() * 5);
}
const skillRanges = {
  1: [42, 50],
  2: [32, 42],
  3: [20, 32],
  4: [8, 20],
  5: [1, 7],
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

db.configure("busyTimeout", 10000);

db.serialize(() => {
  db.run("BEGIN EXCLUSIVE", (err) => {
    if (err) {
      console.error("[seed] Failed to start transaction:", err.message);
      process.exit(1);
    }
  });
  db.run("DELETE FROM players");
  db.run("DELETE FROM teams");
  db.run("DELETE FROM managers");
  db.run("DELETE FROM game_state");
  db.run("DELETE FROM cup_matches", () => {});
  db.run("DELETE FROM palmares", () => {});
  // reset sqlite autoincrement sequences so inserted IDs start predictable at 1
  db.run("DELETE FROM sqlite_sequence WHERE name='players'");
  db.run("DELETE FROM sqlite_sequence WHERE name='teams'");
  db.run("DELETE FROM sqlite_sequence WHERE name='managers'");
  db.run("DELETE FROM sqlite_sequence WHERE name='cup_matches'", () => {});
  db.run("DELETE FROM sqlite_sequence WHERE name='palmares'", () => {});

  console.log(
    `Seeding ${allTeamsData.length} teams from all_teams.json with 20 players each...`,
  );

  const insertManager = db.prepare(
    "INSERT INTO managers (name, reputation) VALUES (?, ?)",
  );
  const insertTeam = db.prepare(
    "INSERT INTO teams (name, manager_id, division, stadium_capacity, budget, color_primary, color_secondary) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );
  const insertPlayer = db.prepare(
    "INSERT INTO players (name, position, skill, age, form, aggressiveness, nationality, value, wage, goals, is_star, team_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)",
  );

  let teamId = 1;
  let managerId = 1;
  const usedManagers = new Set();

  const teamsToSeed = allTeamsData;

  teamsToSeed.forEach((teamData) => {
      // Insert manager
      let managerName = teamData.manager?.name || "Mr. " + getRandomName();
      const base = managerName;
      let candidate = base;
      let suffix = 1;
      while (usedManagers.has(candidate)) {
        candidate = `${base} #${suffix}`;
        suffix++;
      }
      managerName = candidate;
      usedManagers.add(managerName);

      insertManager.run(managerName, 50);

      // Colors from fixture or fallback
      const colors = teamData.colors || {
        primary: "#dc2626",
        secondary: "#ffffff",
      };
      const primaryColor = colors.primary || "#dc2626";
      const secondaryColor = colors.secondary || "#ffffff";

      // Stadium from fixture
      const stadium = teamData.stadium || {
        name: "Generic Stadium",
        capacity: 10000,
      };
      const stadiumCapacity = stadium.capacity || 10000;
      const budget = 1500000; // default budget for all

      insertTeam.run(
        teamData.name,
        managerId,
        teamData.division || 4,
        stadiumCapacity,
        budget,
        primaryColor,
        secondaryColor,
      );

      // Generate 20 players per team
      const desiredPlayers = 20;
      const providedPlayers = teamData.players || [];
      const positionsDefault = [
        "GR",
        "GR",
        "DEF",
        "DEF",
        "DEF",
        "DEF",
        "DEF",
        "DEF",
        "MED",
        "MED",
        "MED",
        "MED",
        "MED",
        "MED",
        "ATA",
        "ATA",
        "ATA",
        "ATA",
        "MED",
        "DEF",
      ];

      // Map fixture positions to spec positions (GK→GR, MID→MED, ATK→ATA)
      const POSITION_MAP = {
        GK: "GR",
        MID: "MED",
        ATK: "ATA",
        DEF: "DEF",
        GR: "GR",
        MED: "MED",
        ATA: "ATA",
      };

      for (let i = 0; i < desiredPlayers; i++) {
        let p = providedPlayers[i];
        let pos = positionsDefault[i % positionsDefault.length];
        let name = getRandomName();
        let division = teamData.division || 4;
        let skill = randomSkill(
          (skillRanges[division] || [5, 20])[0],
          (skillRanges[division] || [5, 20])[1],
        );
        let age = Math.floor(Math.random() * 16) + 18;
        let form = Math.floor(Math.random() * 20) + 80;
        let agg = randomAggressiveness();
        let nat =
          nationalities[Math.floor(Math.random() * nationalities.length)];

        if (p) {
          if (p.name) name = p.name;
          if (p.position) pos = POSITION_MAP[p.position] || p.position;
          if (p.skill) skill = p.skill;
          if (p.age) age = p.age;
          if (p.form) form = p.form;
          // agressividade é sempre gerada aleatoriamente (não é lida de fixtures)
          if (p.nationality || p.country) nat = p.nationality || p.country;
        }

        const value = skill * 20000;
        const wage = skill * 200;
        const isStar =
          (pos === "MED" || pos === "ATA") && Math.random() < 0.1 ? 1 : 0;
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
          teamId,
        );
      }

      teamId++;
      managerId++;
    });

  // Initialize game state defaults
  db.run("INSERT INTO game_state (key, value) VALUES ('matchweek', '1')");
  db.run("INSERT INTO game_state (key, value) VALUES ('matchState', 'idle')");
  db.run("INSERT INTO game_state (key, value) VALUES ('season', '1')");
  db.run("INSERT INTO game_state (key, value) VALUES ('cupRound', '0')");
  db.run("INSERT INTO game_state (key, value) VALUES ('cupState', 'idle')");

  insertManager.finalize();
  insertTeam.finalize();
  insertPlayer.finalize((err) => {
    if (err) {
      console.error("[seed] Error finalizing players:", err.message);
      db.run("ROLLBACK", () => process.exit(1));
      return;
    }
    db.run("COMMIT", (commitErr) => {
      if (commitErr) {
        console.error("[seed] COMMIT failed:", commitErr.message);
        process.exit(1);
      }
      console.log("Base Seed complete.");
      db.close(() => process.exit(0));
    });
  });
});
