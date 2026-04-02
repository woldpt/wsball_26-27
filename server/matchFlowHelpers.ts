import type { ActiveGame } from "./types";

export function isMatchInProgress(game: ActiveGame) {
  return (
    game.matchState === "running_first_half" ||
    game.matchState === "halftime" ||
    game.matchState === "playing_second_half"
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

export function cancelPendingCupDraw(game: ActiveGame) {
  if (game._leagueAnimTimeout) {
    clearTimeout(game._leagueAnimTimeout);
    game._leagueAnimTimeout = null;
  }
  if (game._cupDrawTimeout) {
    clearTimeout(game._cupDrawTimeout);
    game._cupDrawTimeout = null;
  }

  if (game.pendingCupRound != null) {
    game.deferredCupRound = game.pendingCupRound;
  }
  game.pendingCupRound = null;
  game.leagueAnimAcks = new Set();
  game.cupDrawAcks = new Set();
}
