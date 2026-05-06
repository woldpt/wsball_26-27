import type { ActiveGame, GamePhase, PlayerSession } from "./types";
import { getAllTeamForms } from "./coreHelpers";
import { SPONSOR_REVENUE_BY_DIVISION } from "./gameConstants";
import { getGlobalMessages } from "./db/globalDatabase";
import { withJuniorGRs } from "./game/engine";

type AnyRow = Record<string, any>;

type RunAll = <T extends AnyRow = AnyRow>(
  db: any,
  sql: string,
  params?: any[],
) => Promise<T[]>;

type RunGet = <T extends AnyRow = AnyRow>(
  db: any,
  sql: string,
  params?: any[],
) => Promise<T | null>;

interface SessionHandlerDeps {
  io: any;
  verifyOrCreateManager: (
    name: string,
    password: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  getGame: (
    roomCode: string,
    onReady?: (game: ActiveGame | null, error?: Error) => void,
  ) => ActiveGame | null;
  recordRoomAccess: (name: string, roomCode: string) => void;
  getGameBySocket: (socketId: string) => ActiveGame | null;
  getPlayerBySocket: (
    game: ActiveGame,
    socketId: string,
  ) => PlayerSession | null;
  bindSocket: (
    game: ActiveGame,
    name: string,
    socketId: string,
  ) => string | null;
  getPlayerList: (game: ActiveGame) => PlayerSession[];
  saveGameState: (game: ActiveGame) => void;
  emitCurrentPhaseToSocket: (game: ActiveGame, socket: any) => void;
  ensurePhaseTimeout: (game: ActiveGame) => void;
  emitAwaitingCoaches: (game: ActiveGame) => void;
  emitPresence: (game: ActiveGame) => void;
  checkAllReady: (game: ActiveGame) => void | Promise<void>;
  runAll: RunAll;
  runGet: RunGet;
  buildNextMatchSummary: (game: ActiveGame, teamId: number) => Promise<any>;
  doesGameExist: (roomCode: string) => boolean;
  generateUniqueRoomCode: () => string;
  globalDb?: any;
  emitGlobalPlayerUpdate?: () => void;
}

function safeParse<T>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json);
  } catch {
    return fallback;
  }
}

// ─── LEGACY COMPAT HELPERS ───────────────────────────────────────────────────
// Derive old-style matchState/cupState from the new unified gamePhase.
// Keeps the existing client working without changes.

function legacyMatchState(gamePhase: GamePhase): string {
  switch (gamePhase) {
    case "match_first_half":
      return "running_first_half";
    case "match_halftime":
      return "halftime";
    case "match_second_half":
      return "playing_second_half";
    default:
      return "idle";
  }
}

function legacyCupState(game: ActiveGame): string {
  if (!game.currentEvent || game.currentEvent.type !== "cup") return "idle";
  switch (game.gamePhase) {
    case "match_first_half":
      return "playing_first_half";
    case "match_halftime":
      return "halftime";
    case "match_second_half":
    case "match_extra_time":
      return "playing_second_half";
    default:
      return "idle";
  }
}

export function registerSessionSocketHandlers(
  socket: any,
  deps: SessionHandlerDeps,
) {
  const {
    io,
    verifyOrCreateManager,
    getGame,
    recordRoomAccess,
    getGameBySocket,
    getPlayerBySocket,
    bindSocket,
    getPlayerList,
    saveGameState,
    emitCurrentPhaseToSocket,
    ensurePhaseTimeout,
    emitAwaitingCoaches,
    emitPresence,
    checkAllReady,
    runAll,
    runGet,
    buildNextMatchSummary,
    doesGameExist,
    generateUniqueRoomCode,
    emitGlobalPlayerUpdate,
  } = deps;

  function assignPlayer(
    game: ActiveGame,
    name: string,
    team: any,
    roomCode: string,
    isNew: boolean = true,
  ) {
    console.log(
      `[${roomCode}] 👤 assignPlayer: ${name} → team=${team.name ?? team.id} | isNew=${isNew} | phase=${game.gamePhase}`,
    );
    if (!game.playersByName[name]) {
      game.playersByName[name] = {
        name,
        teamId: team.id,
        roomCode,
        ready: false,
        tactic: { formation: "4-4-2", style: "Balanced" },
        socketId: socket.id,
      };
    }
    const displacedSocketId = bindSocket(game, name, socket.id);
    if (displacedSocketId) {
      io.to(displacedSocketId).emit("sessionDisplaced", {
        reason: "another_device",
      });
    }

    game.lockedCoaches.add(name);
    if (game.lockedCoaches.size >= 2) {
      saveGameState(game);
      io.to(roomCode).emit("roomLocked", { coaches: [...game.lockedCoaches] });
    }

    game.db.all("SELECT * FROM teams", (err: any, teams: any[]) => {
      socket.emit("teamsData", teams);
      getAllTeamForms(game.db, game.season)
        .then((forms) => {
          socket.emit("teamForms", forms);
        })
        .catch(() => {});
    });
    game.db.all(
      "SELECT * FROM players WHERE team_id = ?",
      [team.id],
      (err: any, squad: any[]) =>
        socket.emit(
          "mySquad",
          withJuniorGRs(squad || [], team.id, game.matchweek || 1),
        ),
    );
    socket.emit("marketUpdate", game.globalMarket);

    // Smooth reconnect: send current match state to clients rejoining mid-match
    if (
      (game.gamePhase === "match_first_half" ||
        game.gamePhase === "match_second_half") &&
      game.currentFixtures?.length > 0
    ) {
      const entry = game.currentEvent as any;
      // Reconnects must always receive replay payload; if minute is not persisted yet, use phase start.
      const fallbackMinute = game.gamePhase === "match_first_half" ? 1 : 46;
      socket.emit("matchReplay", {
        minute: game.liveMinute ?? fallbackMinute,
        matchweek: game.matchweek,
        isCup: entry?.type === "cup",
        cupRoundName: entry?.roundName || null,
        fixtures: game.currentFixtures.map((f: any) => ({
          homeTeamId: f.homeTeamId,
          awayTeamId: f.awayTeamId,
          homeTeam: f.homeTeam || null,
          awayTeam: f.awayTeam || null,
          finalHomeGoals: f.finalHomeGoals || 0,
          finalAwayGoals: f.finalAwayGoals || 0,
          events: (f.events || []).slice(),
          homeLineup: f.homeLineup || [],
          awayLineup: f.awayLineup || [],
          attendance: f.attendance || null,
        })),
      });
    }

    // Emit gameState with both new fields and legacy compat fields
    socket.emit("gameState", {
      // ── New fields ──────────────────────────────────────────────────────────
      gamePhase: game.gamePhase,
      calendarIndex: game.calendarIndex,
      currentEvent: game.currentEvent,
      liveMinute: game.liveMinute ?? null,
      allMatchResults: game.allMatchResults || {},
      // ── Legacy compat fields (derived from new state machine) ────────────────
      matchweek: game.matchweek,
      matchState: legacyMatchState(game.gamePhase),
      cupState: legacyCupState(game),
      cupRound:
        game.currentEvent?.type === "cup"
          ? (game.currentEvent as any).round
          : 0,
      year: game.year,
      tactic: game.playersByName[name]?.tactic || null,
      lockedCoaches: [...game.lockedCoaches],
      lastHalfTimePayload:
        game.gamePhase === "match_halftime"
          ? game.lastHalftimePayload || null
          : null,
    });

    emitCurrentPhaseToSocket(game, socket);
    ensurePhaseTimeout(game);

    emitPresence(game);
    emitGlobalPlayerUpdate?.();

    // If halftime is already waiting and all coaches are now ready (e.g. safety
    // timeout fired while this coach was offline), advance without waiting for
    // another setReady — otherwise the button stays permanently disabled.
    if (game.gamePhase === "match_halftime") {
      checkAllReady(game);
    }

    game.db.all(
      "SELECT p.id, p.name, p.position, p.goals, p.team_id, t.name as team_name, t.color_primary, t.color_secondary FROM players p LEFT JOIN teams t ON p.team_id = t.id WHERE p.goals > 0 ORDER BY p.goals DESC, p.skill DESC LIMIT 20",
      (err3: any, scorers: any[]) => {
        socket.emit("topScorers", scorers || []);
      },
    );

    game.db.get(
      "SELECT id, name, division, budget, points, wins, draws, losses, goals_for, goals_against, color_primary, color_secondary, stadium_capacity, stadium_name FROM teams WHERE id = ?",
      [team.id],
      (err: any, details: any) => {
        if (err) {
          console.error(
            `[${roomCode}] assignPlayer: failed to fetch team details for id=${team.id}:`,
            err,
          );
        }
        const d = details || team;
        socket.emit("teamAssigned", {
          teamName: d.name,
          teamId: d.id,
          division: d.division ?? 4,
          budget: d.budget ?? 0,
          points: d.points ?? 0,
          wins: d.wins ?? 0,
          draws: d.draws ?? 0,
          losses: d.losses ?? 0,
          goalsFor: d.goals_for ?? 0,
          goalsAgainst: d.goals_against ?? 0,
          colorPrimary: d.color_primary ?? "#888888",
          colorSecondary: d.color_secondary ?? "#ffffff",
          stadiumCapacity: d.stadium_capacity ?? 0,
          stadiumName: d.stadium_name ?? "",
          isNew,
        });
      },
    );

    // Emit chat history for both channels
    game.db.all(
      "SELECT id, coach_name AS coachName, message, timestamp FROM chat_messages ORDER BY id DESC LIMIT 50",
      (err: any, rows: any[]) => {
        const messages = err ? [] : (rows || []).reverse();
        socket.emit("chatHistory", { channel: "room", messages });
      },
    );
    getGlobalMessages(50)
      .then((messages) =>
        socket.emit("chatHistory", { channel: "global", messages }),
      )
      .catch(() =>
        socket.emit("chatHistory", { channel: "global", messages: [] }),
      );
  }

  function generateRandomTeam(
    game: ActiveGame,
    name: string,
    roomCode: string,
    managerId: number,
  ) {
    const takenTeamIds = Object.values(game.playersByName)
      .map((player) => player.teamId)
      .filter(Boolean);
    const placeholders = takenTeamIds.map(() => "?").join(",");
    let query =
      "SELECT id, name FROM teams WHERE division = 4 AND manager_id IS NULL";
    let params: any[] = [];
    if (takenTeamIds.length > 0) {
      query += ` AND id NOT IN (${placeholders})`;
      params = [...takenTeamIds];
    }
    query += " ORDER BY RANDOM() LIMIT 1";

    game.db.get(query, params, (err: any, team: any) => {
      if (err || !team) {
        let fallbackQuery = "SELECT id, name FROM teams WHERE division = 4";
        let fallbackParams: any[] = [];
        if (takenTeamIds.length > 0) {
          fallbackQuery += ` AND id NOT IN (${placeholders})`;
          fallbackParams = [...takenTeamIds];
        }
        fallbackQuery += " ORDER BY RANDOM() LIMIT 1";

        game.db.get(fallbackQuery, fallbackParams, (err2: any, team2: any) => {
          if (err2 || !team2) {
            socket.emit(
              "systemMessage",
              "Nenhuma equipa disponível na Divisão 4.",
            );
            return;
          }
          game.db.run(
            "UPDATE teams SET manager_id = ? WHERE id = ?",
            [managerId, team2.id],
            () => assignPlayer(game, name, team2, roomCode),
          );
        });
        return;
      }
      game.db.run(
        "UPDATE teams SET manager_id = ? WHERE id = ?",
        [managerId, team.id],
        () => assignPlayer(game, name, team, roomCode),
      );
    });
  }

  socket.on("joinGame", async (data) => {
    const { name, password, roomCode: rawRoom, roomName, joinMode } = data;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return socket.emit("systemMessage", "Nome de treinador inválido.");
    }
    if (!password || typeof password !== "string" || password.length === 0) {
      return socket.emit("joinError", "A palavra-passe é obrigatória.");
    }

    const trimmedName = name.trim();

    const authResult = await verifyOrCreateManager(trimmedName, password);
    if (!authResult.ok) {
      return socket.emit("joinError", authResult.error);
    }

    let finalRoomCode = (rawRoom || "").toUpperCase();

    if (joinMode === "new-game") {
      finalRoomCode = generateUniqueRoomCode();
    } else if (joinMode === "friend-room" || joinMode === "saved-game") {
      if (!doesGameExist(finalRoomCode)) {
        return socket.emit(
          "joinError",
          "Sala não encontrada. Verifica o código.",
        );
      }
    } else {
      // Reconnect flow
      if (!finalRoomCode) {
        return socket.emit("systemMessage", "Código de sala inválido.");
      }
      if (!doesGameExist(finalRoomCode)) {
        return socket.emit("joinError", "A sala já não existe.");
      }
    }

    getGame(finalRoomCode, (game, gameErr) => {
      if (!game || gameErr) {
        return socket.emit(
          "joinError",
          gameErr
            ? gameErr.message
            : "Erro ao carregar o jogo. Contacta o administrador.",
        );
      }

      const doJoinContinue = () => {

      recordRoomAccess(trimmedName, finalRoomCode);

      game.db.get(
        "SELECT * FROM managers WHERE name = ?",
        [trimmedName],
        (err: any, row: any) => {
          if (row) {
            game.db.get(
              "SELECT id, name FROM teams WHERE manager_id = ?",
              [row.id],
              (err2: any, team: any) => {
                if (team) {
                  assignPlayer(game, trimmedName, team, finalRoomCode, false);
                } else if (game.dismissedCoachSince[trimmedName]) {
                  // Coach is dismissed and waiting for a new job — rebind socket
                  // without assigning a new team so their dismissed state is preserved.
                  if (!game.playersByName[trimmedName]) {
                    game.playersByName[trimmedName] = {
                      name: trimmedName,
                      teamId: null,
                      roomCode: finalRoomCode,
                      ready: false,
                      tactic: { formation: "4-4-2", style: "Balanced" },
                      socketId: socket.id,
                    };
                  }
                  const displacedSocketId = bindSocket(
                    game,
                    trimmedName,
                    socket.id,
                  );
                  if (displacedSocketId) {
                    io.to(displacedSocketId).emit("sessionDisplaced", {
                      reason: "another_device",
                    });
                  }

                  const dismissalInfo = game.dismissedCoachSince[trimmedName];
                  socket.emit("coachDismissed", {
                    reason: dismissalInfo.reason || "results",
                    teamName: dismissalInfo.teamName || "equipa anterior",
                  });

                  game.db.all(
                    "SELECT * FROM teams",
                    (errT: any, teams: any[]) => {
                      if (!errT) socket.emit("teamsData", teams);
                      getAllTeamForms(game.db, game.season)
                        .then((forms) => socket.emit("teamForms", forms))
                        .catch(() => {});
                    },
                  );

                  socket.emit("gameState", {
                    gamePhase: game.gamePhase,
                    calendarIndex: game.calendarIndex,
                    currentEvent: game.currentEvent,
                    liveMinute: game.liveMinute ?? null,
                    matchweek: game.matchweek,
                    matchState: legacyMatchState(game.gamePhase),
                    cupState: legacyCupState(game),
                    cupRound:
                      game.currentEvent?.type === "cup"
                        ? (game.currentEvent as any).round
                        : 0,
                    year: game.year,
                    tactic: null,
                    lockedCoaches: [...game.lockedCoaches],
                    lastHalfTimePayload: null,
                  });

                  emitPresence(game);
                  emitGlobalPlayerUpdate?.();

                  game.db.all(
                    "SELECT id, coach_name AS coachName, message, timestamp FROM chat_messages ORDER BY id DESC LIMIT 50",
                    (errC: any, rows: any[]) => {
                      const messages = errC ? [] : (rows || []).reverse();
                      socket.emit("chatHistory", { channel: "room", messages });
                    },
                  );
                  getGlobalMessages(50)
                    .then((messages) =>
                      socket.emit("chatHistory", {
                        channel: "global",
                        messages,
                      }),
                    )
                    .catch(() =>
                      socket.emit("chatHistory", {
                        channel: "global",
                        messages: [],
                      }),
                    );

                  console.log(
                    `[${finalRoomCode}] 🔄 Dismissed coach ${trimmedName} reconnected — preserved dismissed state`,
                  );
                } else {
                  generateRandomTeam(game, trimmedName, finalRoomCode, row.id);
                }
              },
            );
          } else {
            // New player (no record in this room's DB).
            // Block entry if the game has already started — prevents strangers
            // from entering a live room just by knowing the room code.
            if ((game.calendarIndex || 0) > 0) {
              socket.emit(
                "joinError",
                "Esta sala já iniciou. Apenas os treinadores originais podem entrar.",
              );
              return;
            }
            game.db.run(
              "INSERT INTO managers (name) VALUES (?)",
              [trimmedName],
              function (err2: any) {
                generateRandomTeam(
                  game,
                  trimmedName,
                  finalRoomCode,
                  this.lastID,
                );
              },
            );
          }
        },
      );
      }; // end doJoinContinue

      const doJoin = () => {
        socket.join(finalRoomCode);
        socket.join("__global__");

        socket.emit("joinGameSuccess", {
          roomCode: finalRoomCode,
          roomName: (game as any).roomName || finalRoomCode,
        });

        const connectedCount = Object.values(game.playersByName).filter(
          (player) => player.socketId,
        ).length;
        if (connectedCount >= 8 && !game.playersByName[trimmedName]) {
          socket.emit("systemMessage", "Sala cheia (Máximo 8 Treinadores).");
          return;
        }

        doJoinContinue();
      }; // end doJoin

      if (joinMode === "new-game" && roomName) {
        game.db.run(
          "INSERT OR REPLACE INTO game_state (key, value) VALUES ('roomName', ?)",
          [roomName],
          () => {
            (game as any).roomName = roomName;
            doJoin();
          },
        );
      } else {
        doJoin();
      }
    });
  });

  socket.on("requestNextMatchSummary", async ({ teamId }) => {
    const game = getGameBySocket(socket.id);
    if (!game) return;
    const playerState = getPlayerBySocket(game, socket.id);
    if (!playerState) return;

    try {
      const summary = await buildNextMatchSummary(
        game,
        playerState.teamId || teamId,
      );
      socket.emit("nextMatchSummary", summary);
    } catch (error) {
      console.error(`[${game.roomCode}] nextMatchSummary error:`, error);
      socket.emit("nextMatchSummary", null);
    }
  });

  socket.on("requestCalendar", async () => {
    const game = getGameBySocket(socket.id);
    if (!game) return;
    try {
      const leagueMatches = await runAll(
        game.db,
        "SELECT id, matchweek, home_team_id, away_team_id, home_score, away_score, attendance, home_lineup, away_lineup, narrative FROM matches WHERE played = 1 ORDER BY matchweek, id",
      );

      // Parse JSON fields from database
      const parsedLeagueMatches = leagueMatches.map((match: any) => ({
        ...match,
        finalHomeGoals: match.home_score,
        finalAwayGoals: match.away_score,
        events: safeParse(match.narrative, []),
        homeLineup: safeParse(match.home_lineup, []),
        awayLineup: safeParse(match.away_lineup, []),
      }));

      const cupMatches = await runAll(
        game.db,
        "SELECT id, round, home_team_id, away_team_id, home_score, away_score, home_et_score, away_et_score, home_penalties, away_penalties, winner_team_id, played FROM cup_matches WHERE season = ? ORDER BY round, id LIMIT 200",
        [game.season],
      );
      socket.emit("calendarData", {
        calendarIndex: game.calendarIndex,
        season: game.season,
        year: game.year,
        matchweek: game.matchweek,
        gamePhase: game.gamePhase,
        leagueMatches: parsedLeagueMatches,
        cupMatches,
      });
    } catch (err) {
      console.error(`[${game.roomCode}] requestCalendar error:`, err);
      socket.emit("calendarData", null);
    }
  });

  socket.on("requestPalmares", async ({ teamId }: { teamId?: number } = {}) => {
    const game = getGameBySocket(socket.id);
    if (!game) return;
    try {
      const rows = await runAll(
        game.db,
        `SELECT pa.season, pa.achievement, t.name as team_name
         FROM palmares pa
         JOIN teams t ON t.id = pa.team_id
         WHERE pa.team_id = ?
         ORDER BY pa.season DESC, pa.id DESC`,
        [teamId],
      );
      const allChampions = await runAll(
        game.db,
        `SELECT pa.season, pa.achievement, t.id as team_id, t.name as team_name, t.color_primary, t.color_secondary
         FROM palmares pa
         JOIN teams t ON t.id = pa.team_id
         ORDER BY pa.season DESC, pa.id DESC`,
      );
      socket.emit("palmaresData", { teamId, trophies: rows, allChampions });
    } catch (err) {
      console.error(`[${game.roomCode}] requestPalmares error:`, err);
      socket.emit("palmaresData", { teamId, trophies: [], allChampions: [] });
    }
  });

  socket.on("requestClubNews", async ({ teamId }: { teamId?: number } = {}) => {
    const game = getGameBySocket(socket.id);
    if (!game || !teamId) return;
    try {
      const news = await runAll(
        game.db,
        `SELECT id, team_id, type, title, description, player_id, player_name, related_team_id, related_team_name, amount, matchweek, year, created_at
         FROM club_news
         WHERE team_id = ?
         ORDER BY created_at DESC, id DESC
         LIMIT 20`,
        [teamId],
      );
      socket.emit("clubNewsData", { teamId, news: news || [] });
    } catch (err) {
      console.error(`[${game.roomCode}] requestClubNews error:`, err);
      socket.emit("clubNewsData", { teamId, news: [] });
    }
  });

  socket.on(
    "requestPlayerHistory",
    async ({ playerId }: { playerId?: number } = {}) => {
      const game = getGameBySocket(socket.id);
      // Negative IDs belong to ephemeral junior GRs — no DB row exists for them.
      if (!game || !playerId || playerId < 0) return;
      try {
        const player = await runGet(
          game.db,
          `SELECT p.*, t.name as team_name
         FROM players p
         LEFT JOIN teams t ON t.id = p.team_id
         WHERE p.id = ?`,
          [playerId],
        );
        if (!player) {
          socket.emit("playerHistoryData", null);
          return;
        }
        const transfers = await runAll(
          game.db,
          `SELECT cn.year, cn.matchweek, cn.title, cn.amount,
                cn.team_id, t.name as team_name,
                cn.related_team_id, cn.related_team_name, cn.type
         FROM club_news cn
         LEFT JOIN teams t ON t.id = cn.team_id
         WHERE cn.player_id = ?
           AND cn.type IN ('transfer_in', 'auction_won')
         ORDER BY cn.year ASC, cn.matchweek ASC`,
          [playerId],
        );
        socket.emit("playerHistoryData", {
          player,
          transfers: transfers || [],
        });
      } catch (err) {
        console.error(`[${game.roomCode}] requestPlayerHistory error:`, err);
        socket.emit("playerHistoryData", null);
      }
    },
  );

  socket.on(
    "requestFinanceData",
    async ({ teamId }: { teamId?: number } = {}) => {
      const game = getGameBySocket(socket.id);
      if (!game || !teamId) return;
      try {
        const homeMatches = await runAll(
          game.db,
          "SELECT attendance, matchweek FROM matches WHERE home_team_id = ? AND played = 1 AND season = ? ORDER BY matchweek ASC",
          [teamId, game.season],
        );
        const totalTicketRevenue = homeMatches.reduce(
          (sum, m) => sum + (m.attendance || 0) * 15,
          0,
        );
        const ticketBreakdown = homeMatches.map((m) => ({
          matchweek: m.matchweek,
          attendance: m.attendance || 0,
          revenue: (m.attendance || 0) * 15,
        }));

        const transferInList = await runAll(
          game.db,
          "SELECT player_name, amount, related_team_name, matchweek FROM club_news WHERE team_id = ? AND type = 'transfer_in' AND amount > 0 ORDER BY matchweek ASC",
          [teamId],
        );
        const transferOutList = await runAll(
          game.db,
          "SELECT player_name, amount, related_team_name, matchweek FROM club_news WHERE team_id = ? AND type = 'transfer_out' AND amount > 0 ORDER BY matchweek ASC",
          [teamId],
        );
        const stadiumBuilds = await runAll(
          game.db,
          "SELECT amount FROM club_news WHERE team_id = ? AND type = 'stadium_build' AND amount > 0",
          [teamId],
        );
        const totalTransferIncome = transferOutList.reduce(
          (sum, n) => sum + (n.amount || 0),
          0,
        );
        const totalTransferExpenses = transferInList.reduce(
          (sum, n) => sum + (n.amount || 0),
          0,
        );
        const totalStadiumExpenses = stadiumBuilds.reduce(
          (sum, n) => sum + (n.amount || 0),
          0,
        );

        const team = await runGet(
          game.db,
          "SELECT division FROM teams WHERE id = ?",
          [teamId],
        );
        const sponsorRevenue =
          SPONSOR_REVENUE_BY_DIVISION[team?.division || 4] || 0;

        socket.emit("financeData", {
          teamId,
          totalTicketRevenue,
          totalTransferIncome,
          totalTransferExpenses,
          totalStadiumExpenses,
          sponsorRevenue,
          homeMatchesPlayed: homeMatches.length,
          ticketBreakdown,
          transferInList,
          transferOutList,
        });
      } catch (err) {
        console.error(`[${game.roomCode}] requestFinanceData error:`, err);
        socket.emit("financeData", {
          teamId,
          totalTicketRevenue: 0,
          totalTransferIncome: 0,
          totalTransferExpenses: 0,
          totalStadiumExpenses: 0,
          sponsorRevenue: 0,
          homeMatchesPlayed: 0,
          ticketBreakdown: [],
          transferInList: [],
          transferOutList: [],
        });
      }
    },
  );
}
