import fs from "fs";
import path from "path";
import sqlite3 from "sqlite3";

const sqlite = sqlite3.verbose();

let globalDb: any = null;

function getDbDir(): string {
  const candidates = [
    path.join(__dirname, "db"),
    path.join(__dirname, "..", "db"),
    path.join(process.cwd(), "db"),
  ];
  return (
    candidates.find((dir) => fs.existsSync(path.join(dir, "base.db"))) ??
    candidates.find((dir) => fs.existsSync(dir)) ??
    candidates[0]
  );
}

export function openGlobalDb(): any {
  if (globalDb) return globalDb;

  const dbDir = getDbDir();
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const dbPath = path.join(dbDir, "global_chat.db");
  globalDb = new sqlite.Database(dbPath);
  globalDb.run(`CREATE TABLE IF NOT EXISTS global_chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    coach_name TEXT NOT NULL,
    room_code TEXT NOT NULL,
    message TEXT NOT NULL,
    timestamp INTEGER NOT NULL
  )`);
  return globalDb;
}

export function saveGlobalMessage(
  coachName: string,
  roomCode: string,
  message: string,
  timestamp: number,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const db = openGlobalDb();
    db.run(
      "INSERT INTO global_chat_messages (coach_name, room_code, message, timestamp) VALUES (?, ?, ?, ?)",
      [coachName, roomCode, message, timestamp],
      function (this: any, err: Error | null) {
        if (err) reject(err);
        else resolve(this.lastID);
      },
    );
  });
}

export function getGlobalMessages(limit = 50): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const db = openGlobalDb();
    db.all(
      "SELECT id, coach_name AS coachName, room_code AS roomCode, message, timestamp FROM global_chat_messages ORDER BY id DESC LIMIT ?",
      [limit],
      (err: Error | null, rows: any[]) => {
        if (err) reject(err);
        else resolve((rows || []).reverse());
      },
    );
  });
}
