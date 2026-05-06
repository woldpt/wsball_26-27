import fs from "fs";
import path from "path";
import sqlite3 from "sqlite3";
import type { ActiveGame, GamePhase, PlayerSession } from "./types";
import { SEASON_CALENDAR } from "./gameConstants";

const sqlite = sqlite3.verbose();

const activeGames: Record<string, ActiveGame> = {};

type SqliteDb = any;
type DbRow = { [key: string]: any } | null;
type OnReady = (game: ActiveGame | null, error?: Error) => void;

function dbDirCandidates() {
  return [
    path.join(__dirname, "db"),
    path.join(__dirname, "..", "db"),
    path.join(process.cwd(), "db"),
  ];
}

function resolveDbPaths(roomCode: string) {
  const candidates = dbDirCandidates();
  const existingBasePath = candidates
    .map((dir) => path.join(dir, "base.db"))
    .find((candidatePath) => fs.existsSync(candidatePath));

  const targetDbDir = existingBasePath
    ? path.dirname(existingBasePath)
    : candidates.find((dir) => fs.existsSync(dir)) ||
      path.join(process.cwd(), "db");

  if (!fs.existsSync(targetDbDir)) {
    fs.mkdirSync(targetDbDir, { recursive: true });
  }

  return {
    dbPath: path.join(targetDbDir, `game_${roomCode}.db`),
    basePath: existingBasePath || path.join(targetDbDir, "base.db"),
    targetDbDir,
  };
}

function doesGameExist(roomCode: string) {
  const { dbPath } = resolveDbPaths(roomCode);
  return fs.existsSync(dbPath);
}

function generateUniqueRoomCode() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code;
  do {
    code = "";
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
  } while (doesGameExist(code));
  return code;
}

function ensurePlayerSchema(
  db: SqliteDb,
  onDone?: (error: Error | null) => void,
) {
  db.all("PRAGMA table_info(players)", (err, columns) => {
    if (err) {
      if (onDone) onDone(err);
      return;
    }

    const existing = new Set(
      (columns || []).map((c: { name: string }) => c.name),
    );
    const required = [
      ["red_cards", "INTEGER DEFAULT 0"],
      ["injuries", "INTEGER DEFAULT 0"],
      ["suspension_games", "INTEGER DEFAULT 0"],
      ["injury_weeks", "INTEGER DEFAULT 0"],
      ["suspension_until_matchweek", "INTEGER DEFAULT 0"],
      ["injury_until_matchweek", "INTEGER DEFAULT 0"],
      ["contract_until_matchweek", "INTEGER DEFAULT 0"],
      ["contract_request_pending", "INTEGER DEFAULT 0"],
      ["contract_requested_wage", "INTEGER DEFAULT 0"],
      ["transfer_status", "TEXT DEFAULT 'none'"],
      ["transfer_price", "INTEGER DEFAULT 0"],
      ["is_star", "INTEGER DEFAULT 0"],
      ["signed_season", "INTEGER DEFAULT 0"],
      ["joined_matchweek", "INTEGER DEFAULT 0"],
      ["career_goals", "INTEGER DEFAULT 0"],
      ["career_reds", "INTEGER DEFAULT 0"],
      ["career_injuries", "INTEGER DEFAULT 0"],
      ["career_games", "INTEGER DEFAULT 0"],
      ["games_played", "INTEGER DEFAULT 0"],
      ["aggressiveness", "INTEGER DEFAULT 3"],
      ["prev_skill", "INTEGER DEFAULT NULL"],
      ["last_auctioned_matchweek", "INTEGER DEFAULT 0"],
    ];

    const missing = required.filter(([name]) => !existing.has(name));
    if (missing.length === 0) {
      if (onDone) onDone(null);
      return;
    }

    let remaining = missing.length;
    let finished = false;

    db.serialize(() => {
      for (const [name, definition] of missing) {
        db.run(
          `ALTER TABLE players ADD COLUMN ${name} ${definition}`,
          (alterErr) => {
            if (finished) return;
            if (alterErr) {
              finished = true;
              if (onDone) onDone(alterErr);
              return;
            }

            remaining -= 1;
            if (remaining === 0) {
              finished = true;
              const backfillSteps: Array<(next: () => void) => void> = [];

              if (missing.some(([n]: [string, string]) => n === "is_star")) {
                backfillSteps.push((next) => {
                  db.run(
                    `UPDATE players SET is_star = 1 WHERE id IN (
                      SELECT id FROM players
                      WHERE (position = 'MED' OR position = 'ATA')
                      ORDER BY RANDOM()
                      LIMIT MAX(1, CAST(
                        (SELECT COUNT(*) FROM players WHERE position = 'MED' OR position = 'ATA') * 0.10
                      AS INTEGER))
                    )`,
                    (backfillErr) => {
                      if (backfillErr)
                        console.warn(
                          "[gameManager] is_star backfill failed:",
                          backfillErr.message,
                        );
                      next();
                    },
                  );
                });
              }

              if (
                missing.some(([n]: [string, string]) => n === "aggressiveness")
              ) {
                backfillSteps.push((next) => {
                  db.run(
                    `UPDATE players SET aggressiveness = 1 + (ABS(RANDOM()) % 5)`,
                    (backfillErr) => {
                      if (backfillErr)
                        console.warn(
                          "[gameManager] aggressiveness backfill failed:",
                          backfillErr.message,
                        );
                      next();
                    },
                  );
                });
              }

              if (
                missing.some(
                  ([n]: [string, string]) => n === "joined_matchweek",
                )
              ) {
                backfillSteps.push((next) => {
                  // Backfill all players with a team as "joined at matchweek 1"
                  // so they become eligible for renegotiations after 28 matchweeks.
                  db.run(
                    `UPDATE players SET joined_matchweek = 1 WHERE team_id IS NOT NULL AND joined_matchweek = 0`,
                    (backfillErr) => {
                      if (backfillErr)
                        console.warn(
                          "[gameManager] joined_matchweek backfill failed:",
                          backfillErr.message,
                        );
                      next();
                    },
                  );
                });
              }

              const runBackfills = (idx: number) => {
                if (idx >= backfillSteps.length) {
                  if (onDone) onDone(null);
                  return;
                }
                backfillSteps[idx](() => runBackfills(idx + 1));
              };
              runBackfills(0);
            }
          },
        );
      }
    });
  });
}

/**
 * Derive calendarIndex from legacy DB keys (for rooms saved before the refactor).
 * Maps old matchweek + cupRound/cupState to the new calendarIndex.
 */
function deriveCalendarIndex(
  matchweek: number,
  cupRound: number,
  cupState: string,
): number {
  if (
    cupState &&
    cupState !== "idle" &&
    cupState !== "done_cup" &&
    cupRound > 0
  ) {
    const cupEntry = SEASON_CALENDAR.find(
      (e) => e.type === "cup" && (e as any).round === cupRound,
    );
    if (cupEntry) return cupEntry.calendarIndex;
  }
  const normMw = ((matchweek - 1) % 14) + 1;
  const leagueEntry = SEASON_CALENDAR.find(
    (e) => e.type === "league" && (e as any).matchweek === normMw,
  );
  return leagueEntry?.calendarIndex ?? 0;
}

/**
 * Derive gamePhase from legacy matchState + cupState.
 * Used when reading rooms saved before the refactor.
 * All transient cup phases collapse to "lobby" so coaches can re-ready.
 */
function deriveGamePhase(matchState: string, cupState: string): GamePhase {
  if (cupState === "halftime") return "match_halftime";
  if (matchState === "halftime") return "match_halftime";
  // All transient simulation states (cup or league) → lobby (safe default)
  return "lobby";
}

function getGame(roomCode: string, onReady?: OnReady): ActiveGame | null {
  if (activeGames[roomCode]) {
    if (onReady) onReady(activeGames[roomCode]);
    return activeGames[roomCode];
  }

  const { dbPath, basePath, targetDbDir } = resolveDbPaths(roomCode);

  if (!fs.existsSync(dbPath)) {
    if (!fs.existsSync(basePath)) {
      console.error(
        `[gameManager] base.db not found in ${targetDbDir} — run: npm run seed:real`,
      );
      if (onReady)
        onReady(
          null,
          new Error("Base DB not found. Server needs to be seeded first."),
        );
      return null;
    }
    const stat = fs.statSync(basePath);
    if (stat.size < 1024) {
      console.error(
        "[gameManager] base.db is empty or corrupt — run: npm run seed:real",
      );
      if (onReady)
        onReady(
          null,
          new Error("Base DB is empty. Server needs to be seeded first."),
        );
      return null;
    }
    fs.copyFileSync(basePath, dbPath);
  }

  const db = new sqlite.Database(dbPath);
  db.run("PRAGMA foreign_keys = ON", (err: Error | null) => {
    if (err)
      console.error(
        `[gameManager] Failed to enable foreign keys for ${roomCode}:`,
        err.message,
      );
  });

  // Ensure performance indexes exist on FK columns (idempotent)
  const indexStatements = [
    "CREATE INDEX IF NOT EXISTS idx_teams_manager_id ON teams(manager_id)",
    "CREATE INDEX IF NOT EXISTS idx_players_team_id ON players(team_id)",
    "CREATE INDEX IF NOT EXISTS idx_matches_home_team_id ON matches(home_team_id)",
    "CREATE INDEX IF NOT EXISTS idx_matches_away_team_id ON matches(away_team_id)",
    "CREATE INDEX IF NOT EXISTS idx_matches_matchweek ON matches(matchweek)",
    "CREATE INDEX IF NOT EXISTS idx_matches_played ON matches(played)",
    "CREATE INDEX IF NOT EXISTS idx_cup_matches_season_round ON cup_matches(season, round)",
    "CREATE INDEX IF NOT EXISTS idx_palmares_team_id ON palmares(team_id)",
    "CREATE INDEX IF NOT EXISTS idx_club_news_team_id ON club_news(team_id)",
    "CREATE INDEX IF NOT EXISTS idx_club_news_player_id ON club_news(player_id)",
    "CREATE INDEX IF NOT EXISTS idx_club_news_created_at ON club_news(created_at)",
  ];
  db.serialize(() => {
    for (const sql of indexStatements) {
      db.run(sql, (idxErr: Error | null) => {
        if (idxErr)
          console.error(
            `[gameManager] Index creation failed for ${roomCode}:`,
            idxErr.message,
          );
      });
    }
  });

  const game: ActiveGame = {
    roomCode,
    db,
    playersByName: {} as Record<string, PlayerSession>,
    socketToName: {} as Record<string, string>,

    // New unified state machine
    calendarIndex: 0,
    gamePhase: "lobby",
    season: 1,
    year: 2026,
    matchweek: 1,

    // Current event runtime
    currentEvent: null,
    currentFixtures: [],
    liveMinute: null,

    // Single phase timer + ack set
    phaseToken: "",
    phaseTimer: null,
    phaseAcks: new Set<string>(),

    // Cup runtime payloads
    cupTeamIds: [],
    cupHalftimePayload: null,
    cupDrawSeenBy: new Set<string>(),

    // Retained fields
    lockedCoaches: new Set<string>(),
    globalMarket: [],
    auctions: {} as Record<string, unknown>,
    auctionTimers: {} as Record<string, unknown>,
    pendingAuctionQueue: [],
    pendingAuctionQueueTimers: [],
    initialized: false,
    roomName: "",

    // Fixture seeds por divisão (aleatórios por época)
    fixtureSeeds: {},

    // Coach dismissal & job offers
    pendingJobOffers: {},
    negativeBudgetStreak: {},
    dismissedCoachSince: {},
    dismissalsThisSeason: new Set<string>(),
  };

  activeGames[roomCode] = game;

  db.run(
    "CREATE TABLE IF NOT EXISTS game_state (key TEXT PRIMARY KEY, value TEXT)",
    () => {
      ensurePlayerSchema(db, () => {
        const continueAfterMigrations = () => {
          db.run(
            "ALTER TABLE teams ADD COLUMN morale INTEGER DEFAULT 50",
            () => {},
          );
          db.run(
            "ALTER TABLE teams ADD COLUMN stadium_name TEXT DEFAULT ''",
            () => {},
          );
          db.run(
            "ALTER TABLE teams ADD COLUMN avg_attendance INTEGER DEFAULT 0",
            () => {},
          );
          db.run(
            "ALTER TABLE matches ADD COLUMN attendance INTEGER DEFAULT 0",
            () => {},
          );
          db.run("ALTER TABLE matches ADD COLUMN home_lineup TEXT", () => {});
          db.run("ALTER TABLE matches ADD COLUMN away_lineup TEXT", () => {});
          db.run(
            "ALTER TABLE matches ADD COLUMN season INTEGER DEFAULT 1",
            () => {},
          );
          db.run(`CREATE TABLE IF NOT EXISTS cup_matches (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            season INTEGER NOT NULL,
            round INTEGER NOT NULL,
            home_team_id INTEGER,
            away_team_id INTEGER,
            home_score INTEGER DEFAULT 0,
            away_score INTEGER DEFAULT 0,
            home_et_score INTEGER DEFAULT 0,
            away_et_score INTEGER DEFAULT 0,
            home_penalties INTEGER DEFAULT 0,
            away_penalties INTEGER DEFAULT 0,
            winner_team_id INTEGER,
            played BOOLEAN DEFAULT 0
          )`);
          db.run(`CREATE TABLE IF NOT EXISTS palmares (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            team_id INTEGER NOT NULL,
            season INTEGER NOT NULL,
            achievement TEXT NOT NULL
          )`);
          db.run(`CREATE TABLE IF NOT EXISTS chat_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            coach_name TEXT NOT NULL,
            message TEXT NOT NULL,
            timestamp INTEGER NOT NULL
          )`);

          // ── Read persisted state (flat: one query for all keys) ──────────────
          db.all(
            "SELECT key, value FROM game_state",
            (_, stateRows: Array<{ key: string; value: string }> | null) => {
              const st: Record<string, string> = {};
              for (const row of stateRows || []) st[row.key] = row.value;

              // Season / year / matchweek
              if (st["season"]) game.season = parseInt(st["season"]) || 1;
              if (st["year"]) {
                game.year = parseInt(st["year"]) || 2025 + game.season;
              } else {
                game.year = 2025 + game.season;
              }
              if (st["matchweek"])
                game.matchweek = parseInt(st["matchweek"]) || 1;

              // Calendar index (new key first; derive from legacy if absent)
              if (st["calendarIndex"]) {
                game.calendarIndex = parseInt(st["calendarIndex"]) || 0;
              } else {
                const legacyMW = parseInt(st["matchweek"]) || 1;
                const legacyCR = parseInt(st["cupRound"]) || 0;
                const legacyCS = st["cupState"] || "idle";
                game.calendarIndex = deriveCalendarIndex(
                  legacyMW,
                  legacyCR,
                  legacyCS,
                );
              }

              // Game phase (new key first; derive from legacy if absent)
              if (st["gamePhase"]) {
                const savedPhase = st["gamePhase"] as GamePhase;
                const transientStates: GamePhase[] = [
                  "match_first_half",
                  "match_second_half",
                  "match_extra_time",
                  "match_finalizing",
                  "match_et_gate",
                ];
                if (transientStates.includes(savedPhase)) {
                  console.warn(
                    `[gameManager] 🔄 Recovering stuck gamePhase '${savedPhase}' → 'lobby' for room ${roomCode}`,
                  );
                  game.gamePhase = "lobby";
                } else {
                  game.gamePhase = savedPhase;
                  console.log(
                    `[gameManager] Restored gamePhase='${savedPhase}' for room ${roomCode}`,
                  );
                }
              } else {
                game.gamePhase = deriveGamePhase(
                  st["matchState"] || "idle",
                  st["cupState"] || "idle",
                );
              }

              // Halftime payload (for reconnect during match_halftime)
              if (game.gamePhase === "match_halftime") {
                if (st["cupHalftimePayload"]) {
                  try {
                    game.cupHalftimePayload = JSON.parse(
                      st["cupHalftimePayload"],
                    );
                  } catch (_) {}
                  game.lastHalftimePayload = game.cupHalftimePayload;
                } else if (st["lastHalftimePayload"]) {
                  try {
                    game.lastHalftimePayload = JSON.parse(
                      st["lastHalftimePayload"],
                    );
                  } catch (_) {}
                } else if (st["cupRuntime"]) {
                  try {
                    const parsed = JSON.parse(st["cupRuntime"]);
                    if (parsed?.halftimePayload)
                      game.lastHalftimePayload = parsed.halftimePayload;
                  } catch (_) {}
                }
              }

              // Phase token
              if (st["phaseToken"]) game.phaseToken = st["phaseToken"];

              if (st["roomName"]) {
                (game as any).roomName = st["roomName"];
              }

              // Cup team IDs
              if (st["cupTeamIds"]) {
                try {
                  const parsed = JSON.parse(st["cupTeamIds"]);
                  if (Array.isArray(parsed)) game.cupTeamIds = parsed;
                } catch (_) {}
              }

              // Cup draw seen-by tracking
              if (st["cupDrawSeenBy"]) {
                try {
                  const parsed = JSON.parse(st["cupDrawSeenBy"]);
                  if (Array.isArray(parsed)) game.cupDrawSeenBy = new Set(parsed);
                } catch (_) {}
              }

              // Current fixtures (for reconnect during match or cup lobby)
              if (st["currentFixtures"]) {
                try {
                  const parsed = JSON.parse(st["currentFixtures"]);
                  if (Array.isArray(parsed)) game.currentFixtures = parsed;
                } catch (_) {}
              }

              // Current live minute for reconnects mid-match
              if (Object.prototype.hasOwnProperty.call(st, "liveMinute")) {
                if (st["liveMinute"] === "null") {
                  game.liveMinute = null;
                } else {
                  const parsedMinute = parseInt(st["liveMinute"], 10);
                  game.liveMinute = Number.isFinite(parsedMinute)
                    ? parsedMinute
                    : null;
                }
              }

              // lockedCoaches is intentionally NOT restored from DB.
              // Coaches re-add themselves to the set as they reconnect (via assignPlayer).
              // Restoring from DB could include coaches who are offline after a restart,
              // which would permanently block checkAllReady until they reconnect.

              // Coach dismissal persistence (transient: pendingJobOffers is never persisted)
              game.pendingJobOffers = {};
              if (st["negativeBudgetStreak"]) {
                try {
                  const parsed = JSON.parse(st["negativeBudgetStreak"]);
                  game.negativeBudgetStreak = Object.fromEntries(
                    Object.entries(parsed).map(([k, v]) => [
                      Number(k),
                      Number(v),
                    ]),
                  );
                } catch (_) {}
              }
              if (st["dismissedCoachSince"]) {
                try {
                  const parsed = JSON.parse(st["dismissedCoachSince"]);
                  game.dismissedCoachSince = Object.fromEntries(
                    Object.entries(parsed).map(([k, v]) => [
                      String(k),
                      typeof v === "object" && v !== null
                        ? (v as { matchweek: number; division: number })
                        : { matchweek: Number(v), division: 4 }, // legacy compat
                    ]),
                  );
                } catch (_) {}
              }
              if (st["dismissalsThisSeason"]) {
                try {
                  const names = JSON.parse(st["dismissalsThisSeason"]);
                  if (Array.isArray(names))
                    game.dismissalsThisSeason = new Set<string>(names);
                } catch (_) {}
              }
              if (st["fixtureSeeds"]) {
                try {
                  const parsed = JSON.parse(st["fixtureSeeds"]);
                  if (parsed && typeof parsed === "object") {
                    game.fixtureSeeds = Object.fromEntries(
                      Object.entries(parsed).map(([k, v]) => [
                        Number(k),
                        Array.isArray(v) ? (v as number[]) : [],
                      ]),
                    );
                  }
                } catch (_) {}
              }

              // Set currentEvent from calendarIndex
              game.currentEvent = SEASON_CALENDAR[game.calendarIndex] ?? null;

              // Load market
              db.all(
                "SELECT * FROM players WHERE team_id IS NOT NULL AND transfer_status != 'none' ORDER BY RANDOM() LIMIT 40",
                (err7, rows) => {
                  if (!err7 && rows) game.globalMarket = rows;
                  game.initialized = true;
                  if (onReady) onReady(game);
                },
              );
            },
          );
        };

        // One-time migration: fix aggressiveness if all-default or out-of-range
        db.get(
          "SELECT COUNT(*) AS total, SUM(CASE WHEN aggressiveness = 3 THEN 1 ELSE 0 END) AS allThree, SUM(CASE WHEN aggressiveness < 1 OR aggressiveness > 5 THEN 1 ELSE 0 END) AS outOfRange FROM players",
          (
            aggCheckErr: Error | null,
            aggRow: {
              total: number;
              allThree: number;
              outOfRange: number;
            } | null,
          ) => {
            const needsFix =
              !aggCheckErr &&
              aggRow &&
              aggRow.total > 0 &&
              (aggRow.total === aggRow.allThree || aggRow.outOfRange > 0);
            if (needsFix) {
              console.log(
                `[gameManager] Backfilling aggressiveness for room ${roomCode}`,
              );
              db.run(
                `UPDATE players SET aggressiveness = 1 + (ABS(RANDOM()) % 5)`,
                () => {
                  continueAfterMigrations();
                },
              );
            } else {
              continueAfterMigrations();
            }
          },
        );
      });
    },
  );

  return game;
}

function saveGameState(game: ActiveGame): void {
  console.log(
    `[${game.roomCode}] 💾 saveGameState | phase=${game.gamePhase} | calIdx=${game.calendarIndex} | mw=${game.matchweek} | season=${game.season}`,
  );
  const upsert = (key: string, value: string) => {
    game.db.run(
      "INSERT OR REPLACE INTO game_state (key, value) VALUES (?, ?)",
      [key, value],
      (err) => {
        if (err) console.error(`[gameManager] Error saving ${key}:`, err);
      },
    );
  };

  // ── New keys ──────────────────────────────────────────────────────────────
  upsert("calendarIndex", String(game.calendarIndex));
  upsert("gamePhase", game.gamePhase);
  upsert("phaseToken", game.phaseToken || "");
  upsert("season", String(game.season || 1));
  upsert("year", String(game.year || 2026));
  upsert("matchweek", String(game.matchweek || 1));
  upsert(
    "liveMinute",
    game.liveMinute != null ? String(game.liveMinute) : "null",
  );
  upsert("cupTeamIds", JSON.stringify(game.cupTeamIds || []));
  upsert(
    "cupHalftimePayload",
    game.cupHalftimePayload ? JSON.stringify(game.cupHalftimePayload) : "null",
  );
  upsert(
    "cupDrawSeenBy",
    JSON.stringify([...(game.cupDrawSeenBy ?? [])]),
  );
  upsert(
    "lastHalftimePayload",
    game.lastHalftimePayload
      ? JSON.stringify(game.lastHalftimePayload)
      : "null",
  );
  upsert("lockedCoaches", JSON.stringify([...game.lockedCoaches]));
  upsert("roomName", (game as any).roomName || "");
  upsert(
    "negativeBudgetStreak",
    JSON.stringify(game.negativeBudgetStreak || {}),
  );
  upsert("dismissedCoachSince", JSON.stringify(game.dismissedCoachSince || {}));
  upsert(
    "dismissalsThisSeason",
    JSON.stringify([...(game.dismissalsThisSeason ?? [])]),
  );
  upsert("fixtureSeeds", JSON.stringify(game.fixtureSeeds || {}));

  // Persist current fixtures for crash recovery (only serialisable fields)
  if (game.currentFixtures && game.currentFixtures.length > 0) {
    const serializableFixtures = game.currentFixtures.map((f) => ({
      homeTeamId: f.homeTeamId,
      awayTeamId: f.awayTeamId,
      homeTeam: f.homeTeam || null,
      awayTeam: f.awayTeam || null,
      finalHomeGoals: f.finalHomeGoals || 0,
      finalAwayGoals: f.finalAwayGoals || 0,
      attendance: f.attendance || 0,
      events: f.events || [],
      homeLineup: f.homeLineup || [],
      awayLineup: f.awayLineup || [],
      _t1: f._t1 || null,
      _t2: f._t2 || null,
    }));
    upsert("currentFixtures", JSON.stringify(serializableFixtures));
  } else {
    upsert("currentFixtures", "[]");
  }

  // ── Legacy keys (backward compat — kept so old clients/DBs still work) ──
  // Derive legacy values from new state
  const legacyMatchState = (() => {
    switch (game.gamePhase) {
      case "match_first_half":
        return "running_first_half";
      case "match_halftime":
        return "halftime";
      case "match_second_half":
        return "playing_second_half";
      default:
        return "idle";
    }
  })();
  const cupEntry = game.currentEvent?.type === "cup" ? game.currentEvent : null;
  const legacyCupRound = cupEntry ? cupEntry.round : 0;
  const legacyCupState = (() => {
    if (!cupEntry) return "idle";
    switch (game.gamePhase) {
      case "match_first_half":
        return "playing_first_half";
      case "match_halftime":
        return "halftime";
      case "match_second_half":
        return "playing_second_half";
      default:
        return "idle";
    }
  })();

  upsert("matchState", legacyMatchState);
  upsert("cupRound", String(legacyCupRound));
  upsert("cupState", legacyCupState);
}

function getPlayerBySocket(
  game: ActiveGame,
  socketId: string,
): PlayerSession | null {
  const name = game.socketToName[socketId];
  return name ? game.playersByName[name] : null;
}

function bindSocket(
  game: ActiveGame,
  name: string,
  socketId: string,
): string | null {
  const existing = game.playersByName[name];
  const oldSocketId =
    existing && existing.socketId && existing.socketId !== socketId
      ? existing.socketId
      : null;
  if (oldSocketId) {
    delete game.socketToName[oldSocketId];
  }
  if (game.playersByName[name]) {
    game.playersByName[name].socketId = socketId;
  }
  game.socketToName[socketId] = name;
  return oldSocketId;
}

function unbindSocket(game: ActiveGame, socketId: string): void {
  const name = game.socketToName[socketId];
  if (name && game.playersByName[name]) {
    game.playersByName[name].socketId = null;
  }
  delete game.socketToName[socketId];
}

function getGameBySocket(socketId: string): ActiveGame | null {
  for (const roomCode in activeGames) {
    if (activeGames[roomCode].socketToName[socketId]) {
      return activeGames[roomCode];
    }
  }
  return null;
}

function getPlayerList(game: ActiveGame): PlayerSession[] {
  return Object.values(game.playersByName).filter((p) => p.socketId !== null);
}

function closeAllDatabases(): Promise<void> {
  const closes = Object.values(activeGames).map(
    (game) =>
      new Promise<void>((resolve) => {
        try {
          game.db.close((err: Error | null) => {
            if (err)
              console.error("[gameManager] DB close error:", err.message);
            resolve();
          });
        } catch (err) {
          console.error("[gameManager] DB close threw:", err);
          resolve();
        }
      }),
  );
  return Promise.all(closes).then(() => undefined);
}

module.exports = {
  getGame,
  getGameBySocket,
  saveGameState,
  getPlayerBySocket,
  bindSocket,
  unbindSocket,
  getPlayerList,
  activeGames,
  doesGameExist,
  generateUniqueRoomCode,
  closeAllDatabases,
};
