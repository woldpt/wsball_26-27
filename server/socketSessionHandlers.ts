import type { ActiveGame, PlayerSession } from "./types";

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
  getPlayerBySocket: (
    game: ActiveGame,
    socketId: string,
  ) => PlayerSession | null;
  bindSocket: (game: ActiveGame, name: string, socketId: string) => void;
  getPlayerList: (game: ActiveGame) => PlayerSession[];
  saveGameState: (game: ActiveGame) => void;
  emitCurrentCupPhaseToSocket: (game: ActiveGame, socket: any) => void;
  ensureCupPhaseTimeout: (game: ActiveGame) => void;
  emitAwaitingCoaches: (game: ActiveGame) => void;
  runAll: RunAll;
  buildNextMatchSummary: (game: ActiveGame, teamId: number) => Promise<any>;
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
    emitCurrentCupPhaseToSocket,
    ensureCupPhaseTimeout,
    emitAwaitingCoaches,
    runAll,
    buildNextMatchSummary,
  } = deps;

  function assignPlayer(
    game: ActiveGame,
    name: string,
    team: any,
    roomCode: string,
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

    game.db.all("SELECT * FROM teams", (err: any, teams: any[]) =>
      socket.emit("teamsData", teams),
    );
    game.db.all(
      "SELECT * FROM players WHERE team_id = ?",
      [team.id],
      (err: any, squad: any[]) => socket.emit("mySquad", squad),
    );
    socket.emit("marketUpdate", game.globalMarket);
    socket.emit("gameState", {
      matchweek: game.matchweek,
      matchState: game.matchState,
      cupState: game.cupState,
      year: game.year,
      tactic: game.playersByName[name]?.tactic || null,
      lockedCoaches: [...game.lockedCoaches],
    });

    emitCurrentCupPhaseToSocket(game, socket);
    ensureCupPhaseTimeout(game);
    io.to(roomCode).emit("playerListUpdate", getPlayerList(game));
    emitAwaitingCoaches(game);

    game.db.all(
      "SELECT p.id, p.name, p.position, p.goals, p.team_id, t.name as team_name, t.color_primary, t.color_secondary FROM players p LEFT JOIN teams t ON p.team_id = t.id WHERE p.goals > 0 ORDER BY p.goals DESC, p.skill DESC LIMIT 20",
      (err3: any, scorers: any[]) => {
        socket.emit("topScorers", scorers || []);
      },
    );

    socket.emit(
      "systemMessage",
      `Foste contratado pelo ${team.name} (Divisão 4)!`,
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
            () => {
              assignPlayer(game, name, team2, roomCode);
            },
          );
        });
        return;
      }
      game.db.run(
        "UPDATE teams SET manager_id = ? WHERE id = ?",
        [managerId, team.id],
        () => {
          assignPlayer(game, name, team, roomCode);
        },
      );
    });
  }

  socket.on("joinGame", async (data) => {
    const { name, password, roomCode: rawRoom } = data;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return socket.emit("systemMessage", "Nome de treinador inválido.");
    }
    if (!password || typeof password !== "string" || password.length === 0) {
      return socket.emit("joinError", "A palavra-passe é obrigatória.");
    }
    if (!rawRoom || typeof rawRoom !== "string") {
      return socket.emit("systemMessage", "Código de sala inválido.");
    }

    const roomCode = rawRoom.toUpperCase();
    const trimmedName = name.trim();

    const authResult = await verifyOrCreateManager(trimmedName, password);
    if (!authResult.ok) {
      return socket.emit("joinError", authResult.error);
    }

    getGame(roomCode, (game, gameErr) => {
      if (!game || gameErr) {
        return socket.emit(
          "joinError",
          gameErr
            ? gameErr.message
            : "Erro ao carregar o jogo. Contacta o administrador.",
        );
      }
      socket.join(roomCode);

      const connectedCount = Object.values(game.playersByName).filter(
        (player) => player.socketId,
      ).length;
      if (connectedCount >= 8 && !game.playersByName[trimmedName]) {
        socket.emit("systemMessage", "Sala cheia (Máximo 8 Treinadores).");
        return;
      }

      recordRoomAccess(trimmedName, roomCode);

      game.db.get(
        "SELECT * FROM managers WHERE name = ?",
        [trimmedName],
        (err: any, row: any) => {
          if (row) {
            game.db.get(
              "SELECT id, name FROM teams WHERE manager_id = ?",
              [row.id],
              (err2: any, team: any) => {
                if (team) assignPlayer(game, trimmedName, team, roomCode);
                else generateRandomTeam(game, trimmedName, roomCode, row.id);
              },
            );
          } else {
            game.db.run(
              "INSERT INTO managers (name) VALUES (?)",
              [trimmedName],
              function (err2: any) {
                generateRandomTeam(game, trimmedName, roomCode, this.lastID);
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
}
