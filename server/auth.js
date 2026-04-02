/**
 * auth.js — Central coach authentication module.
 *
 * Keeps a lightweight SQLite database (accounts.db) that is separate from
 * per-room game databases so that manager accounts persist across all rooms
 * and are not included in game saves shared with other players.
 *
 * Tables
 * ──────
 *  managers       – name / password_hash pairs (one row per coach account)
 *  room_managers  – tracks which coaches have ever joined which room so that
 *                   the /saves endpoint only shows their own rooms
 */

const sqlite3 = require("sqlite3").verbose();
const bcrypt = require("bcryptjs");
const path = require("path");
const fs = require("fs");

function resolveAccountsDbPath() {
  const candidates = [
    path.join(__dirname, "db"),
    path.join(__dirname, "..", "db"),
    path.join(process.cwd(), "db"),
  ];

  const existingFile = candidates
    .map((dir) => path.join(dir, "accounts.db"))
    .find((candidatePath) => fs.existsSync(candidatePath));

  if (existingFile) {
    return existingFile;
  }

  const targetDir =
    candidates.find((dir) => fs.existsSync(dir)) || candidates[0];
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
  return path.join(targetDir, "accounts.db");
}

const DB_PATH = resolveAccountsDbPath();

// Ensure the db directory exists (it always will in production but guards
// against a fresh checkout where only base.db is present).
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error("[auth] Failed to open accounts.db:", err.message);
  } else {
    console.log("[auth] accounts.db ready.");
  }
});

// Create tables once on startup
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS managers (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      name          TEXT    UNIQUE NOT NULL COLLATE NOCASE,
      password_hash TEXT    NOT NULL
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS room_managers (
      room_code    TEXT NOT NULL COLLATE NOCASE,
      manager_name TEXT NOT NULL COLLATE NOCASE,
      PRIMARY KEY (room_code, manager_name)
    )
  `);
});

/**
 * Verify an existing account or create a new one.
 *
 * @param {string} name      Coach name (case-insensitive unique key)
 * @param {string} password  Plain-text password provided by the user
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
function verifyOrCreateManager(name, password) {
  const normalizedName = typeof name === "string" ? name.trim() : "";
  const normalizedPassword = typeof password === "string" ? password : "";

  if (!normalizedName || !normalizedPassword) {
    return Promise.resolve({ ok: false, error: "Credenciais inválidas." });
  }

  return new Promise((resolve) => {
    db.get(
      "SELECT id, password_hash FROM managers WHERE name = ? COLLATE NOCASE",
      [normalizedName],
      async (err, row) => {
        if (err) {
          console.error("[auth] DB error:", err.message);
          return resolve({ ok: false, error: "Erro interno de autenticação." });
        }

        if (row) {
          // Existing account — verify password
          const match = await bcrypt.compare(
            normalizedPassword,
            row.password_hash,
          );
          if (!match) {
            return resolve({ ok: false, error: "Palavra-passe incorrecta." });
          }
          return resolve({ ok: true });
        } else {
          // New account — create with hashed password
          const hash = await bcrypt.hash(normalizedPassword, 10);
          db.run(
            "INSERT INTO managers (name, password_hash) VALUES (?, ?)",
            [normalizedName, hash],
            (err2) => {
              if (err2) {
                console.error("[auth] Insert error:", err2.message);
                return resolve({ ok: false, error: "Erro ao criar conta." });
              }
              console.log(
                `[auth] New coach account created: "${normalizedName}"`,
              );
              resolve({ ok: true });
            },
          );
        }
      },
    );
  });
}

/**
 * Verify an existing manager account without creating a new one.
 *
 * @param {string} name
 * @param {string} password
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
function verifyManager(name, password) {
  const normalizedName = typeof name === "string" ? name.trim() : "";
  const normalizedPassword = typeof password === "string" ? password : "";

  if (!normalizedName || !normalizedPassword) {
    return Promise.resolve({ ok: false, error: "Credenciais inválidas." });
  }

  return new Promise((resolve) => {
    db.get(
      "SELECT id, password_hash FROM managers WHERE name = ? COLLATE NOCASE",
      [normalizedName],
      async (err, row) => {
        if (err) {
          console.error("[auth] DB error:", err.message);
          return resolve({ ok: false, error: "Erro interno de autenticação." });
        }

        if (!row) {
          return resolve({ ok: false, error: "Conta não encontrada." });
        }

        const match = await bcrypt.compare(
          normalizedPassword,
          row.password_hash,
        );
        if (!match) {
          return resolve({ ok: false, error: "Palavra-passe incorrecta." });
        }

        return resolve({ ok: true });
      },
    );
  });
}

/**
 * Create a new manager account.
 *
 * @param {string} name
 * @param {string} password
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
function createManager(name, password) {
  const normalizedName = typeof name === "string" ? name.trim() : "";
  const normalizedPassword = typeof password === "string" ? password : "";

  if (!normalizedName || !normalizedPassword) {
    return Promise.resolve({ ok: false, error: "Credenciais inválidas." });
  }

  return new Promise((resolve) => {
    db.get(
      "SELECT id FROM managers WHERE name = ? COLLATE NOCASE",
      [normalizedName],
      async (err, row) => {
        if (err) {
          console.error("[auth] DB error:", err.message);
          return resolve({ ok: false, error: "Erro interno de autenticação." });
        }

        if (row) {
          return resolve({
            ok: false,
            error: "Já existe uma conta com esse nome.",
          });
        }

        const hash = await bcrypt.hash(normalizedPassword, 10);
        db.run(
          "INSERT INTO managers (name, password_hash) VALUES (?, ?)",
          [normalizedName, hash],
          (err2) => {
            if (err2) {
              console.error("[auth] Insert error:", err2.message);
              return resolve({ ok: false, error: "Erro ao criar conta." });
            }
            console.log(
              `[auth] New coach account created: "${normalizedName}"`,
            );
            resolve({ ok: true });
          },
        );
      },
    );
  });
}

/**
 * Record that a coach has joined (or created) a game room.
 * Idempotent — safe to call on every join.
 *
 * @param {string} managerName
 * @param {string} roomCode
 */
function recordRoomAccess(managerName, roomCode) {
  db.run(
    "INSERT OR IGNORE INTO room_managers (room_code, manager_name) VALUES (?, ?)",
    [roomCode.toUpperCase(), managerName],
  );
}

/**
 * Return the list of room codes the given coach has ever joined.
 *
 * @param {string} managerName
 * @returns {Promise<string[]>}
 */
function getManagerRooms(managerName) {
  return new Promise((resolve) => {
    db.all(
      "SELECT room_code FROM room_managers WHERE manager_name = ? COLLATE NOCASE ORDER BY room_code",
      [managerName],
      (err, rows) => {
        if (err) return resolve([]);
        resolve(rows.map((r) => r.room_code));
      },
    );
  });
}

module.exports = {
  verifyOrCreateManager,
  verifyManager,
  createManager,
  recordRoomAccess,
  getManagerRooms,
};
