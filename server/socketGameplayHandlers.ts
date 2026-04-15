import type { ActiveGame, PlayerSession } from "./types";

interface GameplayHandlerDeps {
  io: any;
  getGameBySocket: (socketId: string) => ActiveGame | null;
  getPlayerBySocket: (
    game: ActiveGame,
    socketId: string,
  ) => PlayerSession | null;
  getPlayerList: (game: ActiveGame) => PlayerSession[];
  unbindSocket: (game: ActiveGame, socketId: string) => void;
  checkAllReady: (game: ActiveGame) => void | Promise<void>;
  emitAwaitingCoaches: (game: ActiveGame) => void;
  handleAcceptJobOffer: (game: ActiveGame, coachName: string) => Promise<void>;
  handleDeclineJobOffer: (game: ActiveGame, coachName: string) => void;
}

export function registerGameplaySocketHandlers(
  socket: any,
  deps: GameplayHandlerDeps,
) {
  const {
    io,
    getGameBySocket,
    getPlayerBySocket,
    getPlayerList,
    unbindSocket,
    checkAllReady,
    emitAwaitingCoaches,
    handleAcceptJobOffer,
    handleDeclineJobOffer,
  } = deps;

  socket.on("setTactic", (tactic) => {
    const game = getGameBySocket(socket.id);
    const playerState = getPlayerBySocket(game, socket.id);
    if (game && playerState) {
      playerState.tactic = tactic;
    }
  });

  socket.on("setReady", (ready) => {
    const game = getGameBySocket(socket.id);
    if (!game) return;
    const playerState = getPlayerBySocket(game, socket.id);
    if (!playerState) return;
    playerState.ready = ready;
    io.to(game.roomCode).emit("playerListUpdate", getPlayerList(game));
    checkAllReady(game);
  });

  socket.on("requestTeamSquad", (teamId) => {
    const game = getGameBySocket(socket.id);
    if (!game) return;

    game.db.all(
      "SELECT * FROM players WHERE team_id = ? ORDER BY CASE position WHEN 'GR' THEN 1 WHEN 'DEF' THEN 2 WHEN 'MED' THEN 3 WHEN 'ATA' THEN 4 ELSE 5 END, skill DESC, name",
      [teamId],
      (err, squad) => {
        socket.emit("teamSquadData", {
          teamId,
          squad: err ? [] : squad || [],
        });
      },
    );
  });

  socket.on("resolveMatchAction", ({ actionId, teamId, playerId }) => {
    const game = getGameBySocket(socket.id);
    if (!game || !game.pendingMatchAction) return;
    const pendingAction: any = game.pendingMatchAction;
    if (pendingAction.actionId !== actionId) return;
    if (pendingAction.teamId !== teamId) return;

    const pending: any = pendingAction;
    clearTimeout(pending.timer);
    game.pendingMatchAction = null;
    if (playerId === null || playerId === undefined) {
      pending.finalize(pending.fallback ? pending.fallback() : null, "auto");
    } else {
      pending.finalize(playerId, "human");
    }
  });

  socket.on("disconnect", () => {
    const game = getGameBySocket(socket.id);
    if (game) {
      unbindSocket(game, socket.id);
      io.to(game.roomCode).emit("playerListUpdate", getPlayerList(game));
      emitAwaitingCoaches(game);
    }
  });

  socket.on("acceptJobOffer", async () => {
    const game = getGameBySocket(socket.id);
    if (!game) return;
    const name = game.socketToName[socket.id];
    if (!name) return;
    await handleAcceptJobOffer(game, name);
  });

  socket.on("declineJobOffer", () => {
    const game = getGameBySocket(socket.id);
    if (!game) return;
    const name = game.socketToName[socket.id];
    if (!name) return;
    handleDeclineJobOffer(game, name);
  });
}
