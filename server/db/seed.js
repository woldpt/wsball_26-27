require("../logBootstrap");
const fs = require("fs");
const path = require("path");
const db = require("./database");

// Ensure schema exists before seeding
const schemaPath = path.join(__dirname, "schema.sql");
const schema = fs.readFileSync(schemaPath, "utf8");

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

function randomAggressiveness() {
  return 1 + Math.floor(Math.random() * 5);
}
const skillRanges = {
  1: [36, 50],
  2: [26, 35],
  3: [16, 25],
  4: [5, 15],
  5: [5, 15],
};

function randomSkill(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

db.configure("busyTimeout", 10000);

// Drop tables in dependency order so that the schema is always recreated fresh.
// This ensures new columns (e.g. stadium_name) are present even when reseeding
// an existing database that was created with an older schema.
const dropSchema = `
DROP TABLE IF EXISTS club_news;
DROP TABLE IF EXISTS matches;
DROP TABLE IF EXISTS cup_matches;
DROP TABLE IF EXISTS palmares;
DROP TABLE IF EXISTS players;
DROP TABLE IF EXISTS teams;
DROP TABLE IF EXISTS managers;
DROP TABLE IF EXISTS game_state;
`;

db.serialize(() => {
  db.run("BEGIN EXCLUSIVE", (err) => {
    if (err) {
      console.error("[seed] Failed to start transaction:", err.message);
      process.exit(1);
    }
  });

  // Drop all tables then recreate with the current schema so that any schema
  // changes (e.g. added columns) are always applied when reseeding.
  db.exec(dropSchema, (dropErr) => {
    if (dropErr) {
      console.error("[seed] Drop tables failed:", dropErr.message);
      process.exit(1);
    }
  });
  db.exec(schema, (schemaErr) => {
    if (schemaErr) {
      console.error("[seed] Schema init failed:", schemaErr.message);
      process.exit(1);
    }
  });

  console.log(`Seeding ${allTeamsData.length} teams from all_teams.json...`);

  const insertManager = db.prepare(
    "INSERT INTO managers (name, reputation) VALUES (?, ?)",
  );
  const insertTeam = db.prepare(
    "INSERT INTO teams (name, manager_id, division, stadium_capacity, stadium_name, budget, color_primary, color_secondary) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  );
  const insertPlayer = db.prepare(
    "INSERT INTO players (name, position, skill, gk, defesa, passe, finalizacao, resistencia, age, form, aggressiveness, nationality, value, wage, goals, is_star, team_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)",
  );

  let teamId = 1;
  let managerId = 1;
  const usedManagers = new Set();

  const teamsToSeed = allTeamsData;

  teamsToSeed.forEach((teamData) => {
    // Insert manager
    let managerName = teamData.manager?.name || "Treinador";
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
    const BUDGET_BY_DIVISION = {
      1: 2500000,
      2: 2000000,
      3: 1500000,
      4: 1000000,
      5: 500000,
    };
    const budget = BUDGET_BY_DIVISION[teamData.division || 4] ?? 1000000;

    const stadiumName = stadium.name || "";

    insertTeam.run(
      teamData.name,
      managerId,
      teamData.division || 4,
      stadiumCapacity,
      stadiumName,
      budget,
      primaryColor,
      secondaryColor,
    );

    // Load all players from fixture — no random names, no fixed limit
    const providedPlayers = teamData.players || [];

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

    const division = teamData.division || 4;

    // Build full player list before inserting so we can guarantee ≥1 craque per team
    const playersToInsert = providedPlayers
      .filter((p) => p && p.name)
      .map((p) => {
        const pos = POSITION_MAP[p.position] || p.position || "MED";
        const skill =
          p.skill ||
          randomSkill(
            (skillRanges[division] || [5, 20])[0],
            (skillRanges[division] || [5, 20])[1],
          );
        const age = p.age || Math.floor(Math.random() * 16) + 18;
        const form = p.form || Math.floor(Math.random() * 15) + 30;
        const agg = randomAggressiveness();
        const nat = p.nationality || p.country || "🇵🇹";
        const value = skill * 20000;
        const wage = skill * 200;
        const isStar =
          (pos === "MED" || pos === "ATA") && Math.random() < 0.1 ? 1 : 0;
        const roleBoosts = {
          GR: { gk: 10, defesa: 2, passe: 1, finalizacao: 0 },
          DEF: { gk: 0, defesa: 10, passe: 2, finalizacao: 1 },
          MED: { gk: 0, defesa: 3, passe: 10, finalizacao: 3 },
          ATA: { gk: 0, defesa: 1, passe: 3, finalizacao: 10 },
        };
        const boosts = roleBoosts[pos] || roleBoosts.MED;
        const clampAttr = (v) => Math.max(1, Math.min(50, Math.round(v)));
        const gk = clampAttr(
          skill - 8 + boosts.gk + Math.floor(Math.random() * 5),
        );
        const defesa = clampAttr(
          skill - 8 + boosts.defesa + Math.floor(Math.random() * 5),
        );
        const passe = clampAttr(
          skill - 8 + boosts.passe + Math.floor(Math.random() * 5),
        );
        const finalizacao = clampAttr(
          skill - 8 + boosts.finalizacao + Math.floor(Math.random() * 5),
        );
        const resistencia = Math.max(
          1,
          Math.min(50, Math.round(form + Math.floor(Math.random() * 7) - 3)),
        );
        return {
          name: p.name,
          pos,
          skill,
          gk,
          defesa,
          passe,
          finalizacao,
          resistencia,
          age,
          form,
          agg,
          nat,
          value,
          wage,
          isStar,
        };
      });

    // Garantir pelo menos um craque por equipa: se nenhum foi escolhido
    // aleatoriamente, promover o melhor MED ou ATA
    const hasStar = playersToInsert.some((p) => p.isStar === 1);
    if (!hasStar) {
      const eligibles = playersToInsert.filter(
        (p) => p.pos === "MED" || p.pos === "ATA",
      );
      if (eligibles.length > 0) {
        const best = eligibles.reduce((a, b) => (b.skill > a.skill ? b : a));
        best.isStar = 1;
      }
    }

    playersToInsert.forEach(
      ({
        name,
        pos,
        skill,
        gk,
        defesa,
        passe,
        finalizacao,
        resistencia,
        age,
        form,
        agg,
        nat,
        value,
        wage,
        isStar,
      }) => {
        insertPlayer.run(
          name,
          pos,
          skill,
          gk,
          defesa,
          passe,
          finalizacao,
          resistencia,
          age,
          form,
          agg,
          nat,
          value,
          wage,
          isStar,
          teamId,
        );
      },
    );

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
    // All seeded players start as "joined at matchweek 1" so agent renegotiations
    // become eligible after 2 seasons (28 matchweeks) of gameplay.
    db.run(
      "UPDATE players SET joined_matchweek = 1 WHERE team_id IS NOT NULL",
      (updateErr) => {
        if (updateErr)
          console.warn(
            "[seed] joined_matchweek backfill failed:",
            updateErr.message,
          );
        db.run("COMMIT", (commitErr) => {
          if (commitErr) {
            console.error("[seed] COMMIT failed:", commitErr.message);
            process.exit(1);
          }
          console.log("Base Seed complete.");
          db.close(() => process.exit(0));
        });
      },
    );
  });
});
