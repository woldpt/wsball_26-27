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

  // Prefer the directory that contains base.db so that accounts.db lands in
  // the same volume-mounted folder as the game databases, not in dist/db/.
  const targetDir =
    candidates.find((dir) => fs.existsSync(path.join(dir, "base.db"))) ||
    candidates.find((dir) => fs.existsSync(dir)) ||
    candidates[0];
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
  // Migration: add avatar_seed column (safe to re-run)
  db.run(`ALTER TABLE managers ADD COLUMN avatar_seed TEXT DEFAULT ''`, (err) => {
    if (err) {
      // Column already exists — ignore
    }
  });
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

/**
 * Remove all room_managers entries for a given room (called when a room is deleted).
 *
 * @param {string} roomCode
 * @returns {Promise<void>}
 */
function deleteRoomAccess(roomCode) {
  return new Promise((resolve) => {
    db.run(
      "DELETE FROM room_managers WHERE room_code = ? COLLATE NOCASE",
      [roomCode.toUpperCase()],
      () => resolve(),
    );
  });
}

/**
 * Change a manager's password (requires current password verification).
 *
 * @param {string} name
 * @param {string} currentPassword
 * @param {string} newPassword
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
function changePassword(name, currentPassword, newPassword) {
  const normalizedName = typeof name === "string" ? name.trim() : "";
  const normalizedCurrent = typeof currentPassword === "string" ? currentPassword : "";
  const normalizedNew = typeof newPassword === "string" ? newPassword : "";

  if (!normalizedName || !normalizedCurrent || !normalizedNew) {
    return Promise.resolve({ ok: false, error: "Credenciais inválidas." });
  }
  if (normalizedNew.length < 3) {
    return Promise.resolve({ ok: false, error: "A nova palavra-passe deve ter pelo menos 3 caracteres." });
  }

  return new Promise((resolve) => {
    db.get(
      "SELECT id, password_hash FROM managers WHERE name = ? COLLATE NOCASE",
      [normalizedName],
      async (err, row) => {
        if (err) {
          console.error("[auth] DB error:", err.message);
          return resolve({ ok: false, error: "Erro interno." });
        }
        if (!row) {
          return resolve({ ok: false, error: "Conta não encontrada." });
        }
        const match = await bcrypt.compare(normalizedCurrent, row.password_hash);
        if (!match) {
          return resolve({ ok: false, error: "Palavra-passe actual incorrecta." });
        }
        const hash = await bcrypt.hash(normalizedNew, 10);
        db.run(
          "UPDATE managers SET password_hash = ? WHERE id = ?",
          [hash, row.id],
          (err2) => {
            if (err2) {
              console.error("[auth] Update error:", err2.message);
              return resolve({ ok: false, error: "Erro ao alterar palavra-passe." });
            }
            resolve({ ok: true });
          },
        );
      },
    );
  });
}

/**
 * Return public info about a manager (name, list of room codes).
 *
 * @param {string} name
 * @returns {Promise<{ok: boolean, error?: string, info?: {name: string, rooms: string[]}}>}
 */
function getManagerInfo(name) {
  const normalizedName = typeof name === "string" ? name.trim() : "";
  if (!normalizedName) {
    return Promise.resolve({ ok: false, error: "Nome inválido." });
  }

  return new Promise((resolve) => {
    db.get(
      "SELECT id, name FROM managers WHERE name = ? COLLATE NOCASE",
      [normalizedName],
      async (err, row) => {
        if (err) {
          console.error("[auth] DB error:", err.message);
          return resolve({ ok: false, error: "Erro interno." });
        }
        if (!row) {
          return resolve({ ok: false, error: "Conta não encontrada." });
        }

        const rooms = await getManagerRooms(normalizedName);

        resolve({
          ok: true,
          info: {
            name: row.name,
            rooms,
          },
        });
      },
    );
  });
}

/**
 * Get the avatar seed for a manager.
 *
 * @param {string} name
 * @returns {Promise<string>}
 */
function getAvatarSeed(name) {
  const normalizedName = typeof name === "string" ? name.trim() : "";
  if (!normalizedName) return Promise.resolve("");

  return new Promise((resolve) => {
    db.get(
      "SELECT avatar_seed FROM managers WHERE name = ? COLLATE NOCASE",
      [normalizedName],
      (err, row) => {
        if (err || !row) return resolve("");
        resolve(row.avatar_seed || "");
      },
    );
  });
}

/**
 * Set the avatar seed for a manager.
 *
 * @param {string} name
 * @param {string} seed
 * @returns {Promise<{ok: boolean}>}
 */
function setAvatarSeed(name, seed) {
  const normalizedName = typeof name === "string" ? name.trim() : "";
  if (!normalizedName) return Promise.resolve({ ok: false });

  return new Promise((resolve) => {
    db.run(
      "UPDATE managers SET avatar_seed = ? WHERE name = ? COLLATE NOCASE",
      [seed, normalizedName],
      (err) => {
        if (err) {
          console.error("[auth] setAvatarSeed error:", err.message);
          return resolve({ ok: false });
        }
        resolve({ ok: true });
      },
    );
  });
}

/**
 * Delete a manager account and all associated room access records.
 *
 * @param {string} name
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
function deleteManager(name) {
  const normalizedName = typeof name === "string" ? name.trim() : "";
  if (!normalizedName) {
    return Promise.resolve({ ok: false, error: "Nome inválido." });
  }

  return new Promise((resolve) => {
    db.serialize(() => {
      db.run(
        "DELETE FROM room_managers WHERE manager_name = ? COLLATE NOCASE",
        [normalizedName],
      );
      db.run(
        "DELETE FROM managers WHERE name = ? COLLATE NOCASE",
        [normalizedName],
        (err) => {
          if (err) {
            console.error("[auth] deleteManager error:", err.message);
            return resolve({ ok: false, error: "Erro ao apagar conta." });
          }
          resolve({ ok: true });
        },
      );
    });
  });
}

module.exports = {
  verifyOrCreateManager,
  verifyManager,
  createManager,
  recordRoomAccess,
  deleteRoomAccess,
  getManagerRooms,
  changePassword,
  getManagerInfo,
  getAvatarSeed,
  setAvatarSeed,
  deleteManager,
};
