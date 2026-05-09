import type { ActiveGame } from "./types";

/**
 * Returns true if any match simulation is currently running.
 * Used by auction helpers to block new auctions during live matches.
 * Uses the unified gamePhase instead of the old dual matchState + cupState.
 */
export function isMatchInProgress(game: ActiveGame) {
  return (
    game.gamePhase === "match_first_half" ||
    game.gamePhase === "match_halftime" ||
    game.gamePhase === "match_second_half" ||
    game.gamePhase === "match_et_gate" ||
    game.gamePhase === "match_extra_time" ||
    game.gamePhase === "match_finalizing"
  );
}

export function finalizeAllRunningAuctions(
  game: ActiveGame,
  finalizeAuction: (game: ActiveGame, playerId: number) => void,
) {
  if (!game.auctions) return;
  const playerIds = Object.keys(game.auctions);
  if (playerIds.length === 0) return;

  for (const playerId of playerIds) {
    if (game.auctionTimers?.[playerId]) {
      clearTimeout(game.auctionTimers[playerId] as any);
      delete game.auctionTimers[playerId];
    }
    finalizeAuction(game, Number(playerId));
  }
}

/**
 * Pausa todos os leilões em curso: cancela os timers mas preserva game.auctions.
 * Emite "auctionPaused" para a sala para cada leilão pausado.
 */
export function pauseAllRunningAuctions(game: ActiveGame, io: any) {
  if (!game.auctions) return;
  const playerIds = Object.keys(game.auctions);
  if (playerIds.length === 0) return;

  for (const playerId of playerIds) {
    const auction = game.auctions[playerId] as any;
    if (!auction || auction.status !== "open") continue;

    if (game.auctionTimers?.[playerId]) {
      clearTimeout(game.auctionTimers[playerId] as any);
      delete game.auctionTimers[playerId];
    }

    auction.status = "paused";
    io.to(game.roomCode).emit("auctionPaused", { playerId: Number(playerId) });
  }
}

/**
 * Clear the single phase timer and ack set.
 * Replaces the old clearCupTimeout / individual timeout slots.
 */
export function clearPhaseTimer(game: ActiveGame) {
  if (game.phaseTimer) {
    clearTimeout(game.phaseTimer);
    game.phaseTimer = null;
  }
}

/**
 * Generate a phase token — used to detect stale timer callbacks after state transitions.
 */
export function makePhaseToken(game: ActiveGame): string {
  return `${game.season}:${game.calendarIndex}:${game.gamePhase}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
}
