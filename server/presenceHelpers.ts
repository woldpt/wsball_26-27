import type { ActiveGame } from "./types";

export function emitAwaitingCoaches(game: ActiveGame, io: any) {
  // Usa playersByName como fonte de verdade — inclui todos os coaches registados na sala,
  // independentemente do estado de lockedCoaches (que é transiente e não persiste entre restarts)
  const offline = Object.entries(game.playersByName)
    .filter(([, session]) => !session.socketId)
    .map(([name]) => name);
  io.to(game.roomCode).emit("awaitingCoaches", offline);
}
