import type { ActiveGame } from "./types";

export function emitAwaitingCoaches(game: ActiveGame, io: any) {
  if (game.lockedCoaches.size < 2) return;
  const offline = [...game.lockedCoaches].filter(
    (name) => !game.playersByName[name]?.socketId,
  );
  io.to(game.roomCode).emit("awaitingCoaches", offline);
}
