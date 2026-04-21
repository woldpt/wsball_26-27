import type { ActiveGame, PlayerSession } from "./types";
import { withJuniorGRs } from "./game/engine";

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
  emitGlobalPlayerUpdate?: () => void;
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
    emitGlobalPlayerUpdate,
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
    if (!playerState.teamId) return;
    playerState.ready = ready;
    console.log(
      `[${game.roomCode}] 👤 ${playerState.name} setReady=${ready} | phase=${game.gamePhase}`,
    );
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
        const base = err ? [] : squad || [];
        socket.emit("teamSquadData", {
          teamId,
          squad: withJuniorGRs(base, teamId, game.matchweek || 1),
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
    if (!game) return;

    const playerState = getPlayerBySocket(game, socket.id);
    console.log(
      `[${game.roomCode}] 🔌 Disconnect: ${playerState?.name ?? "unknown"} (socket=${socket.id}) | phase=${game.gamePhase}`,
    );

    // If the disconnected socket owned the pending match action, auto-resolve it
    const pendingAction: any = game.pendingMatchAction;
    if (
      playerState &&
      pendingAction &&
      pendingAction.teamId === playerState.teamId
    ) {
      clearTimeout(pendingAction.timer);
      game.pendingMatchAction = null;
      const fallbackValue = pendingAction.fallback
        ? pendingAction.fallback()
        : null;
      try {
        pendingAction.finalize(fallbackValue, "auto");
      } catch (err) {
        console.error(
          "[disconnect] Error finalizing pending match action:",
          err,
        );
      }
    }

    unbindSocket(game, socket.id);
    io.to(game.roomCode).emit("playerListUpdate", getPlayerList(game));
    emitGlobalPlayerUpdate?.();
    emitAwaitingCoaches(game);
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
