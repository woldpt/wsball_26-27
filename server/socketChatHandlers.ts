import type { ActiveGame, PlayerSession } from "./types";
import {
  saveGlobalMessage,
  getGlobalMessages,
} from "./db/globalDatabase";

const MAX_MESSAGE_LENGTH = 500;
const RATE_LIMIT_MS = 1000;

// Per-socket in-memory rate limit tracker (cleared on disconnect)
const lastMessageTimes = new Map<string, number>();

interface ChatHandlerDeps {
  io: any;
  getGameBySocket: (socketId: string) => ActiveGame | null;
  getPlayerBySocket: (game: ActiveGame, socketId: string) => PlayerSession | null;
}

export function registerChatHandlers(
  socket: any,
  deps: ChatHandlerDeps,
) {
  const { io, getGameBySocket, getPlayerBySocket } = deps;

  socket.on(
    "sendChatMessage",
    async ({ channel, message }: { channel: "room" | "global"; message: string }) => {
      const game = getGameBySocket(socket.id);
      if (!game) return;
      const player = getPlayerBySocket(game, socket.id);

      // Fallback: player lookup via socketToName directly (handles mid-reconnect edge case)
      const coachNameFallback = game.socketToName?.[socket.id];
      const coachName = player?.name || coachNameFallback;
      if (!coachName) {
        console.warn(`[chat] socket ${socket.id} has no player/name in game ${game.roomCode}`);
        return;
      }

      // Rate limit: 1 message per second per socket
      const now = Date.now();
      const lastTime = lastMessageTimes.get(socket.id) ?? 0;
      if (now - lastTime < RATE_LIMIT_MS) {
        socket.emit("systemMessage", "Estás a enviar mensagens demasiado rápido.");
        return;
      }
      lastMessageTimes.set(socket.id, now);

      // Validate
      const trimmed = (typeof message === "string" ? message : "").trim();
      if (!trimmed) return;
      if (trimmed.length > MAX_MESSAGE_LENGTH) {
        socket.emit(
          "systemMessage",
          `Mensagem demasiado longa (máx. ${MAX_MESSAGE_LENGTH} caracteres).`,
        );
        return;
      }

      const roomCode = game.roomCode;
      const timestamp = now;

      if (channel === "room") {
        game.db.run(
          "INSERT INTO chat_messages (coach_name, message, timestamp) VALUES (?, ?, ?)",
          [coachName, trimmed, timestamp],
          function (this: any, err: Error | null) {
            if (err) {
              console.error("[chat] Failed to save room message:", err.message);
              return;
            }
            const msgData = {
              channel: "room" as const,
              id: this.lastID,
              coachName,
              message: trimmed,
              timestamp,
            };
            console.log(`[chat] Room msg from ${coachName} in ${roomCode} → broadcasting to room`);
            io.to(roomCode).emit("chatMessage", msgData);
          },
        );
      } else if (channel === "global") {
        try {
          const id = await saveGlobalMessage(coachName, roomCode, trimmed, timestamp);
          const msgData = {
            channel: "global" as const,
            id,
            coachName,
            message: trimmed,
            timestamp,
          };
          io.to("__global__").emit("chatMessage", msgData);
        } catch (err: any) {
          console.error("[chat] Failed to save global message:", err.message);
        }
      }
    },
  );

  socket.on(
    "getChatHistory",
    async ({ channel }: { channel: "room" | "global" }) => {
      const game = getGameBySocket(socket.id);
      if (!game) return;
      const player = getPlayerBySocket(game, socket.id);
      if (!player) return;

      if (channel === "room") {
        game.db.all(
          "SELECT id, coach_name AS coachName, message, timestamp FROM chat_messages ORDER BY id DESC LIMIT 50",
          (err: Error | null, rows: any[]) => {
            const messages = err ? [] : (rows || []).reverse();
            socket.emit("chatHistory", { channel: "room", messages });
          },
        );
      } else if (channel === "global") {
        try {
          const messages = await getGlobalMessages(50);
          socket.emit("chatHistory", { channel: "global", messages });
        } catch (_) {
          socket.emit("chatHistory", { channel: "global", messages: [] });
        }
      }
    },
  );

  // Clean up rate limit state on disconnect
  socket.on("disconnect", () => {
    lastMessageTimes.delete(socket.id);
  });
}
