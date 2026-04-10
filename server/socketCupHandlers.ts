import type { ActiveGame, PlayerSession } from "./types";

interface CupHandlerDeps {
  io: any;
  getGameBySocket: (socketId: string) => ActiveGame | null;
  getPlayerBySocket: (game: ActiveGame, socketId: string) => PlayerSession | null;
  getPlayerList: (game: ActiveGame) => PlayerSession[];
  saveGameState: (game: ActiveGame) => void;
  transitionToKickoff: (game: ActiveGame) => void;
  checkAllReady: (game: ActiveGame) => Promise<void>;
}

export function registerCupSocketHandlers(socket: any, deps: CupHandlerDeps) {
  const {
    io,
    getGameBySocket,
    getPlayerBySocket,
    getPlayerList,
    saveGameState,
    transitionToKickoff,
    checkAllReady,
  } = deps;

  // ── Cup draw acknowledgement ────────────────────────────────────────────────
  // Client emits this after seeing the draw animation.
  // When all connected coaches have acked, transition to cup_awaiting_kickoff.
  socket.on("cupDrawAcknowledged", () => {
    const game = getGameBySocket(socket.id);
    if (!game || game.gamePhase !== "cup_draw") return;

    game.phaseAcks.add(socket.id);

    // Check if all connected coaches have acked
    const connected = (Object.values(game.playersByName) as PlayerSession[]).filter(
      (p) => p.socketId,
    );
    const allAcked =
      connected.length > 0 &&
      connected.every((p) => game.phaseAcks.has(p.socketId as string));

    if (allAcked) {
      transitionToKickoff(game);
    }
  });

  // ── Cup ET animation done ───────────────────────────────────────────────────
  socket.on("cupExtraTimeDone", () => {
    const game = getGameBySocket(socket.id);
    if (!game || !game._cupETAnimHandler) return;
    game._cupETAnimHandler(socket.id);
  });

  // ── Legacy compat shims ─────────────────────────────────────────────────────
  // These events are still emitted by the current client.
  // They are redirected to the unified checkAllReady / setReady flow.
  // Can be removed when the client is updated to use setReady exclusively.

  socket.on("cupKickOff", () => {
    // Old: triggered cup pre-match → start first half
    // New: equivalent to setReady during cup_awaiting_kickoff
    const game = getGameBySocket(socket.id);
    if (!game || game.gamePhase !== "cup_awaiting_kickoff") return;
    const player = getPlayerBySocket(game, socket.id);
    if (!player || !game.cupTeamIds.includes(player.teamId)) return;
    player.ready = true;
    io.to(game.roomCode).emit("playerListUpdate", getPlayerList(game));
    checkAllReady(game).catch((err) =>
      console.error(`[${game.roomCode}] cupKickOff compat error:`, err),
    );
  });

  socket.on("cupHalfTimeReady", () => {
    // Old: triggered cup second half
    // New: equivalent to setReady during match_halftime (cup context)
    const game = getGameBySocket(socket.id);
    if (!game || game.gamePhase !== "match_halftime") return;
    if (game.currentEvent?.type !== "cup") return;
    const player = getPlayerBySocket(game, socket.id);
    if (!player) return;
    player.ready = true;
    io.to(game.roomCode).emit("playerListUpdate", getPlayerList(game));
    checkAllReady(game).catch((err) =>
      console.error(`[${game.roomCode}] cupHalfTimeReady compat error:`, err),
    );
  });

  socket.on("cupSecondHalfDone", () => {
    // Old: triggered cup finalization after second half animation
    // New: finalization is automatic — no-op compat shim
  });

  socket.on("leagueAnimDone", () => {
    // Old: triggered cup draw after league match results animation
    // New: cup draw starts only when coaches click Ready in lobby — no-op compat shim
  });
}
