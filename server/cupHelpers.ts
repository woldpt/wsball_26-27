import type { ActiveGame, PlayerSession } from "./types";

export function createCupPhaseToken(
  game: ActiveGame,
  round: number,
  phase: string,
) {
  return `${game.season}:${round}:${phase}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
}

export function setCupPhase(
  game: ActiveGame,
  phase: string,
  saveGameState: (game: ActiveGame) => void,
  round = game.cupRound,
) {
  game.cupRound = round;
  game.cupState = phase;
  game.cupRuntime = game.cupRuntime || {
    phaseToken: "",
    drawPayload: null,
    preMatchPayload: null,
    halftimePayload: null,
    secondHalfPayload: null,
    fixtures: [],
  };
  game.cupRuntime.phaseToken = createCupPhaseToken(game, round, phase);
  saveGameState(game);
  return game.cupRuntime.phaseToken;
}

export function clearCupTimeout(game: ActiveGame, key: string) {
  if (game[key]) {
    clearTimeout(game[key]);
    game[key] = null;
  }
}

export function armCupTimeout({
  game,
  key,
  ms,
  phase,
  round,
  token,
  onElapsed,
}: {
  game: ActiveGame;
  key: string;
  ms: number;
  phase: string;
  round: number;
  token: string;
  onElapsed: () => void;
}) {
  clearCupTimeout(game, key);
  game[key] = setTimeout(() => {
    const currentToken = game.cupRuntime?.phaseToken;
    if (
      game.cupState !== phase ||
      game.cupRound !== round ||
      currentToken !== token
    ) {
      return;
    }
    onElapsed();
  }, ms);
}

export function allConnectedCoachesAcked(
  game: ActiveGame,
  ackSet: Set<string>,
) {
  const socketIds = (Object.values(game.playersByName) as PlayerSession[])
    .filter((player) => player.socketId)
    .map((player) => player.socketId as string);

  return socketIds.every((socketId) => ackSet.has(socketId));
}

export function allCupCoachesAcked(game: ActiveGame, ackSet: Set<string>) {
  const cupSocketIds = (Object.values(game.playersByName) as PlayerSession[])
    .filter((p) => p.socketId && (game.cupTeamIds || []).includes(p.teamId))
    .map((p) => p.socketId as string);

  if (cupSocketIds.length === 0) return true;
  return cupSocketIds.every((socketId) => ackSet.has(socketId));
}
