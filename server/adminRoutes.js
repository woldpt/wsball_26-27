const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const express = require("express");

const router = express.Router();

const fixturesDir = path.join(__dirname, "db", "fixtures");
const supportedFixtures = new Map([
  ["all_teams", "all_teams.json"],
  ["managers", "managers.json"],
  ["referees", "referees.json"],
  ["stadiums", "stadiums.json"],
]);

const tokenStore = new Map();
const tokenTtlMs = 12 * 60 * 60 * 1000;

function cleanupTokens() {
  const now = Date.now();
  for (const [token, session] of tokenStore.entries()) {
    if (session.expiresAt <= now) tokenStore.delete(token);
  }
}

function issueToken(username) {
  cleanupTokens();
  const token = crypto.randomBytes(24).toString("hex");
  tokenStore.set(token, {
    username,
    expiresAt: Date.now() + tokenTtlMs,
  });
  return token;
}

function readToken(req) {
  const authHeader = String(req.headers.authorization || "");
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim();
  }
  const headerToken = req.headers["x-admin-token"];
  if (typeof headerToken === "string") return headerToken.trim();
  return "";
}

function requireAdmin(req, res, next) {
  cleanupTokens();
  const token = readToken(req);
  if (!token || !tokenStore.has(token)) {
    return res.status(401).json({ error: "Admin authentication required." });
  }

  const session = tokenStore.get(token);
  if (!session || session.expiresAt <= Date.now()) {
    tokenStore.delete(token);
    return res.status(401).json({ error: "Admin session expired." });
  }

  req.adminUser = session.username;
  req.adminToken = token;
  return next();
}

function getFixturePath(fileKey) {
  const fileName = supportedFixtures.get(fileKey);
  if (!fileName) return null;
  return path.join(fixturesDir, fileName);
}

function readFixture(fileKey) {
  const fixturePath = getFixturePath(fileKey);
  if (!fixturePath) return null;
  const raw = fs.readFileSync(fixturePath, "utf8");
  return JSON.parse(raw);
}

function writeFixture(fileKey, data) {
  const fixturePath = getFixturePath(fileKey);
  if (!fixturePath) return false;
  fs.writeFileSync(fixturePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  return true;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeManagerEntry(entry) {
  if (typeof entry === "string") {
    return { name: entry.trim() };
  }
  if (!isPlainObject(entry)) return null;
  const name = String(entry.name || "").trim();
  if (!name) return null;
  return { name };
}

function normalizeRefereeEntry(entry) {
  if (typeof entry === "string") return entry.trim();
  if (!isPlainObject(entry)) return null;
  const name = String(entry.name || "").trim();
  return name || null;
}

function normalizeStadiumEntry(entry) {
  if (!isPlainObject(entry)) return null;
  const name = String(entry.name || "").trim();
  const capacity = Number(entry.capacity);
  if (!name || !Number.isFinite(capacity) || capacity < 0) return null;
  return { name, capacity: Math.trunc(capacity) };
}

function normalizePlayerEntry(entry) {
  if (!isPlainObject(entry)) return null;
  const name = String(entry.name || "").trim();
  const position = String(entry.position || "").trim();
  const country = String(entry.country || entry.nationality || "").trim();
  if (!name || !position || !country) return null;
  return { name, position, country };
}

function normalizeTeamEntry(entry) {
  if (!isPlainObject(entry)) return null;

  const name = String(entry.name || "").trim();
  const division = Number(entry.division);
  const primary = String(entry.colors?.primary || "").trim();
  const secondary = String(entry.colors?.secondary || "").trim();
  const stadiumName = String(entry.stadium?.name || "").trim();
  const stadiumCapacity = Number(entry.stadium?.capacity);
  const managerName = String(entry.manager?.name || entry.manager || "").trim();
  const players = Array.isArray(entry.players)
    ? entry.players.map(normalizePlayerEntry).filter(Boolean)
    : [];

  if (!name || !Number.isFinite(division) || !primary || !secondary) {
    return null;
  }
  if (
    !stadiumName ||
    !Number.isFinite(stadiumCapacity) ||
    stadiumCapacity < 0
  ) {
    return null;
  }
  if (!managerName) return null;

  return {
    name,
    division: Math.trunc(division),
    colors: {
      primary,
      secondary,
    },
    stadium: {
      name: stadiumName,
      capacity: Math.trunc(stadiumCapacity),
    },
    manager: { name: managerName },
    players,
  };
}

function normalizeFixturePayload(fileKey, payload) {
  if (fileKey === "all_teams") {
    const teams = Array.isArray(payload?.teams)
      ? payload.teams.map(normalizeTeamEntry).filter(Boolean)
      : null;
    return teams ? { teams } : null;
  }

  if (fileKey === "managers") {
    const entries = Array.isArray(payload)
      ? payload.map(normalizeManagerEntry).filter(Boolean)
      : null;
    return entries;
  }

  if (fileKey === "referees") {
    const entries = Array.isArray(payload)
      ? payload.map(normalizeRefereeEntry).filter(Boolean)
      : null;
    return entries;
  }

  if (fileKey === "stadiums") {
    const entries = Array.isArray(payload)
      ? payload.map(normalizeStadiumEntry).filter(Boolean)
      : null;
    return entries;
  }

  return null;
}

function validateAdminCredentials(username, password) {
  const configuredUsername = String(process.env.ADMIN_USERNAME || "").trim();
  const configuredPassword = String(process.env.ADMIN_PASSWORD || "");
  if (!configuredUsername || !configuredPassword) {
    return { ok: false, error: "Admin credentials are not configured." };
  }

  if (username !== configuredUsername || password !== configuredPassword) {
    return { ok: false, error: "Credenciais de admin inválidas." };
  }

  return { ok: true };
}

router.post("/login", (req, res) => {
  const username = String(req.body?.username || "").trim();
  const password = String(req.body?.password || "");

  if (!username || !password) {
    return res
      .status(400)
      .json({ error: "Username e password são obrigatórios." });
  }

  const result = validateAdminCredentials(username, password);
  if (!result.ok) {
    return res.status(401).json({ error: result.error });
  }

  const token = issueToken(username);
  return res.json({ ok: true, token, username, expiresIn: tokenTtlMs });
});

router.use(requireAdmin);

router.get("/fixtures/:file", (req, res) => {
  const data = readFixture(req.params.file);
  if (!data) {
    return res.status(404).json({ error: "Fixture not found." });
  }
  return res.json(data);
});

router.put("/fixtures/:file", (req, res) => {
  const normalized = normalizeFixturePayload(req.params.file, req.body);
  if (!normalized) {
    return res.status(400).json({ error: "Invalid fixture payload." });
  }

  if (!writeFixture(req.params.file, normalized)) {
    return res.status(404).json({ error: "Fixture not found." });
  }

  return res.json({ ok: true, data: normalized });
});

router.get("/fixtures/all_teams/team/:index", (req, res) => {
  const index = Number(req.params.index);
  const fixture = readFixture("all_teams");
  if (!fixture || !Array.isArray(fixture.teams) || !Number.isInteger(index)) {
    return res.status(404).json({ error: "Team not found." });
  }

  const team = fixture.teams[index];
  if (!team) {
    return res.status(404).json({ error: "Team not found." });
  }

  return res.json({ index, team });
});

router.put("/fixtures/all_teams/team/:index", (req, res) => {
  const index = Number(req.params.index);
  const fixture = readFixture("all_teams");
  const team = normalizeTeamEntry(req.body);

  if (
    !fixture ||
    !Array.isArray(fixture.teams) ||
    !Number.isInteger(index) ||
    !team
  ) {
    return res.status(400).json({ error: "Invalid team payload." });
  }
  if (!fixture.teams[index]) {
    return res.status(404).json({ error: "Team not found." });
  }

  fixture.teams[index] = team;
  writeFixture("all_teams", fixture);
  return res.json({ ok: true, index, team });
});

router.post("/fixtures/all_teams/team", (req, res) => {
  const fixture = readFixture("all_teams");
  const team = normalizeTeamEntry(req.body);
  if (!fixture || !Array.isArray(fixture.teams) || !team) {
    return res.status(400).json({ error: "Invalid team payload." });
  }

  fixture.teams.push(team);
  writeFixture("all_teams", fixture);
  return res
    .status(201)
    .json({ ok: true, index: fixture.teams.length - 1, team });
});

router.delete("/fixtures/all_teams/team/:index", (req, res) => {
  const index = Number(req.params.index);
  const fixture = readFixture("all_teams");
  if (!fixture || !Array.isArray(fixture.teams) || !Number.isInteger(index)) {
    return res.status(404).json({ error: "Team not found." });
  }

  if (!fixture.teams[index]) {
    return res.status(404).json({ error: "Team not found." });
  }

  const [removed] = fixture.teams.splice(index, 1);
  writeFixture("all_teams", fixture);
  return res.json({ ok: true, removed });
});

router.post("/reseed", (req, res) => {
  const seedScript = path.join(__dirname, "db", "seed.js");
  const child = spawn(process.execPath, [seedScript, "--real"], {
    cwd: __dirname,
    env: process.env,
  });

  let stdout = "";
  let stderr = "";

  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  child.on("close", (code) => {
    if (code !== 0) {
      return res.status(500).json({
        error: "Reseed failed.",
        stdout,
        stderr,
      });
    }

    return res.json({ ok: true, stdout, stderr });
  });
});

module.exports = router;
