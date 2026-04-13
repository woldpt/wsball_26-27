import type { ActiveGame, GamePhase, PlayerSession } from "./types";
import { getAllTeamForms } from "./coreHelpers";

type AnyRow = Record<string, any>;

type RunAll = <T extends AnyRow = AnyRow>(
  db: any,
  sql: string,
  params?: any[],
) => Promise<T[]>;

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
  getPlayerBySocket: (game: ActiveGame, socketId: string) => PlayerSession | null;
  bindSocket: (game: ActiveGame, name: string, socketId: string) => void;
  getPlayerList: (game: ActiveGame) => PlayerSession[];
  saveGameState: (game: ActiveGame) => void;
  emitCurrentPhaseToSocket: (game: ActiveGame, socket: any) => void;
  ensurePhaseTimeout: (game: ActiveGame) => void;
  emitAwaitingCoaches: (game: ActiveGame) => void;
  runAll: RunAll;
  buildNextMatchSummary: (game: ActiveGame, teamId: number) => Promise<any>;
  doesGameExist: (roomCode: string) => boolean;
  generateUniqueRoomCode: () => string;
}

// ─── LEGACY COMPAT HELPERS ───────────────────────────────────────────────────
// Derive old-style matchState/cupState from the new unified gamePhase.
// Keeps the existing client working without changes.

function legacyMatchState(gamePhase: GamePhase): string {
  switch (gamePhase) {
    case "match_first_half": return "running_first_half";
    case "match_halftime":   return "halftime";
    case "match_second_half": return "playing_second_half";
    default: return "idle";
  }
}

function legacyCupState(game: ActiveGame): string {
  if (!game.currentEvent || game.currentEvent.type !== "cup") return "idle";
  switch (game.gamePhase) {
    case "match_first_half":  return "playing_first_half";
    case "match_halftime":    return "halftime";
    case "match_second_half":
    case "match_extra_time":  return "playing_second_half";
    default: return "idle";
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
    runAll,
    buildNextMatchSummary,
    doesGameExist,
    generateUniqueRoomCode,
  } = deps;

  function assignPlayer(
    game: ActiveGame,
    name: string,
    team: any,
    roomCode: string,
    isNew: boolean = true,
  ) {
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
    bindSocket(game, name, socket.id);

    game.lockedCoaches.add(name);
    if (game.lockedCoaches.size >= 2) {
      saveGameState(game);
      io.to(roomCode).emit("roomLocked", { coaches: [...game.lockedCoaches] });
    }

    game.db.all("SELECT * FROM teams", (err: any, teams: any[]) => {
      socket.emit("teamsData", teams);
      getAllTeamForms(game.db).then((forms) => {
        socket.emit("teamForms", forms);
      }).catch(() => {});
    });
    game.db.all(
      "SELECT * FROM players WHERE team_id = ?",
      [team.id],
      (err: any, squad: any[]) => socket.emit("mySquad", squad),
    );
    socket.emit("marketUpdate", game.globalMarket);

    // Emit gameState with both new fields and legacy compat fields
    socket.emit("gameState", {
      // ── New fields ──────────────────────────────────────────────────────────
      gamePhase: game.gamePhase,
      calendarIndex: game.calendarIndex,
      currentEvent: game.currentEvent,
      // ── Legacy compat fields (derived from new state machine) ────────────────
      matchweek: game.matchweek,
      matchState: legacyMatchState(game.gamePhase),
      cupState: legacyCupState(game),
      cupRound: game.currentEvent?.type === "cup" ? (game.currentEvent as any).round : 0,
      year: game.year,
      tactic: game.playersByName[name]?.tactic || null,
      lockedCoaches: [...game.lockedCoaches],
      lastHalfTimePayload: game.gamePhase === "match_halftime" ? game.lastHalftimePayload || null : null,
    });

    emitCurrentPhaseToSocket(game, socket);
    ensurePhaseTimeout(game);
    io.to(roomCode).emit("playerListUpdate", getPlayerList(game));
    emitAwaitingCoaches(game);

    game.db.all(
      "SELECT p.id, p.name, p.position, p.goals, p.team_id, t.name as team_name, t.color_primary, t.color_secondary FROM players p LEFT JOIN teams t ON p.team_id = t.id WHERE p.goals > 0 ORDER BY p.goals DESC, p.skill DESC LIMIT 20",
      (err3: any, scorers: any[]) => {
        socket.emit("topScorers", scorers || []);
      },
    );

    game.db.get(
      "SELECT id, name, division, budget, points, wins, draws, losses, goals_for, goals_against, color_primary, color_secondary, stadium_capacity FROM teams WHERE id = ?",
      [team.id],
      (err: any, details: any) => {
        if (err) {
          console.error(`[${roomCode}] assignPlayer: failed to fetch team details for id=${team.id}:`, err);
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
          isNew,
        });
      },
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
            socket.emit("systemMessage", "Nenhuma equipa disponível na Divisão 4.");
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
        return socket.emit("joinError", "Sala não encontrada. Verifica o código.");
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
          gameErr ? gameErr.message : "Erro ao carregar o jogo. Contacta o administrador.",
        );
      }
      
      if (joinMode === "new-game" && roomName) {
        game.db.run("INSERT OR REPLACE INTO game_state (key, value) VALUES ('roomName', ?)", [roomName]);
        (game as any).roomName = roomName;
      }
      
      socket.join(finalRoomCode);

      socket.emit("joinGameSuccess", { 
        roomCode: finalRoomCode, 
        roomName: (game as any).roomName || finalRoomCode 
      });

      const connectedCount = Object.values(game.playersByName).filter(
        (player) => player.socketId,
      ).length;
      if (connectedCount >= 8 && !game.playersByName[trimmedName]) {
        socket.emit("systemMessage", "Sala cheia (Máximo 8 Treinadores).");
        return;
      }

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
                if (team) assignPlayer(game, trimmedName, team, finalRoomCode, false);
                else generateRandomTeam(game, trimmedName, finalRoomCode, row.id);
              },
            );
          } else {
            game.db.run(
              "INSERT INTO managers (name) VALUES (?)",
              [trimmedName],
              function (err2: any) {
                generateRandomTeam(game, trimmedName, finalRoomCode, this.lastID);
              },
            );
          }
        },
      );
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
        events: match.narrative ? JSON.parse(match.narrative) : [],
        homeLineup: match.home_lineup ? JSON.parse(match.home_lineup) : [],
        awayLineup: match.away_lineup ? JSON.parse(match.away_lineup) : [],
      }));

      const cupMatches = await runAll(
        game.db,
        "SELECT id, round, home_team_id, away_team_id, home_score, away_score, home_et_score, away_et_score, home_penalties, away_penalties, winner_team_id, played FROM cup_matches WHERE season = ? ORDER BY round, id",
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
        `SELECT id, team_id, type, title, description, player_id, player_name, related_team_id, related_team_name, amount, matchweek, created_at
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
}
