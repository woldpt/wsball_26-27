import type { ActiveGame, PlayerSession } from "./types";

interface CupHandlerDeps {
  io: any;
  getGameBySocket: (socketId: string) => ActiveGame | null;
  getPlayerBySocket: (
    game: ActiveGame,
    socketId: string,
  ) => PlayerSession | null;
  getPlayerList: (game: ActiveGame) => PlayerSession[];
  allConnectedCoachesAcked: (game: ActiveGame, ackSet: Set<string>) => boolean;
  allCupCoachesAcked: (game: ActiveGame, ackSet: Set<string>) => boolean;
  clearCupTimeout: (game: ActiveGame, key: string) => void;
  setCupPhase: (
    game: ActiveGame,
    phase: string,
    saveGameState: (game: ActiveGame) => void,
    round?: number,
  ) => string;
  saveGameState: (game: ActiveGame) => void;
  CUP_ROUND_NAMES: string[];
  armCupTimeout: (args: {
    game: ActiveGame;
    key: string;
    ms: number;
    phase: string;
    round: number;
    token: string;
    onElapsed: () => void;
  }) => void;
  simulateCupFirstHalf: (
    game: ActiveGame,
    round: number,
    expectedToken: string,
  ) => Promise<void>;
  simulateCupSecondHalf: (
    game: ActiveGame,
    round: number,
    expectedToken: string,
  ) => Promise<void>;
  startCupRound: (game: ActiveGame, round: number) => Promise<void>;
  finalizeCupRound: (
    game: ActiveGame,
    round: number,
    expectedToken: string,
  ) => Promise<void>;
}

export function registerCupSocketHandlers(socket: any, deps: CupHandlerDeps) {
  const {
    io,
    getGameBySocket,
    getPlayerBySocket,
    getPlayerList,
    allConnectedCoachesAcked,
    allCupCoachesAcked,
    clearCupTimeout,
    setCupPhase,
    saveGameState,
    CUP_ROUND_NAMES,
    armCupTimeout,
    simulateCupFirstHalf,
    simulateCupSecondHalf,
    startCupRound,
    finalizeCupRound,
  } = deps;

  socket.on("cupDrawAcknowledged", () => {
    const game = getGameBySocket(socket.id);
    if (!game || game.cupState !== "draw") return;

    game.cupDrawAcks.add(socket.id);

    const allAcked = allConnectedCoachesAcked(game, game.cupDrawAcks);
    if (allAcked) {
      clearCupTimeout(game, "_cupDrawTimeout");
      const preMatchToken = setCupPhase(
        game,
        "pre_match",
        saveGameState,
        game.cupRound,
      );
      game.cupPreMatchAcks = new Set();
      const preMatchRoundName =
        CUP_ROUND_NAMES[game.cupRound] || `Ronda ${game.cupRound}`;
      const preMatchPayload = {
        round: game.cupRound,
        roundName: preMatchRoundName,
        season: game.season,
        cupTeamIds: game.cupTeamIds || [],
      };
      game.cupRuntime.preMatchPayload = preMatchPayload;
      io.to(game.roomCode).emit("cupPreMatch", preMatchPayload);
      Object.values(game.playersByName).forEach((player) => {
        player.ready = false;
      });
      io.to(game.roomCode).emit("playerListUpdate", getPlayerList(game));
      armCupTimeout({
        game,
        key: "_cupPreMatchTimeout",
        ms: 60000,
        phase: "pre_match",
        round: game.cupRound,
        token: preMatchToken,
        onElapsed: () => {
          console.log(
            `[${game.roomCode}] Cup pre-match timeout — auto-starting round ${game.cupRound}`,
          );
          simulateCupFirstHalf(
            game,
            game.cupRound,
            game.cupRuntime?.phaseToken,
          );
        },
      });
    }
  });

  socket.on("cupKickOff", () => {
    const game = getGameBySocket(socket.id);
    if (!game || game.cupState !== "pre_match") return;
    const player = getPlayerBySocket(game, socket.id);
    if (!player || !game.cupTeamIds.includes(player.teamId)) return;
    player.ready = true;
    game.cupPreMatchAcks = game.cupPreMatchAcks || new Set();
    game.cupPreMatchAcks.add(socket.id);
    io.to(game.roomCode).emit("playerListUpdate", getPlayerList(game));
    const allReady = allCupCoachesAcked(game, game.cupPreMatchAcks);
    if (allReady) {
      clearCupTimeout(game, "_cupPreMatchTimeout");
      Object.values(game.playersByName).forEach((coach) => {
        coach.ready = false;
      });
      simulateCupFirstHalf(game, game.cupRound, game.cupRuntime?.phaseToken);
    }
  });

  socket.on("cupHalfTimeReady", () => {
    const game = getGameBySocket(socket.id);
    if (!game || game.cupState !== "halftime") return;

    game.cupHalfTimeAcks.add(socket.id);

    const allReady = allCupCoachesAcked(game, game.cupHalfTimeAcks);
    if (allReady) {
      clearCupTimeout(game, "_cupHalftimeTimeout");
      simulateCupSecondHalf(game, game.cupRound, game.cupRuntime?.phaseToken);
    }
  });

  socket.on("leagueAnimDone", () => {
    const game = getGameBySocket(socket.id);
    if (!game || game.pendingCupRound == null) return;

    game.leagueAnimAcks.add(socket.id);

    const connected = getPlayerList(game).filter((player) => player.socketId);
    const allDone = connected.every((player) =>
      game.leagueAnimAcks.has(player.socketId),
    );
    if (allDone) {
      if (game._leagueAnimTimeout) clearTimeout(game._leagueAnimTimeout);
      const round = game.pendingCupRound;
      game.pendingCupRound = null;
      game.leagueAnimAcks = new Set();
      startCupRound(game, round).catch((cupErr) =>
        console.error(`[${game.roomCode}] Cup round error:`, cupErr),
      );
    }
  });

  socket.on("cupSecondHalfDone", () => {
    const game = getGameBySocket(socket.id);
    if (!game || game.cupState !== "second_half_waiting") return;

    game.cupSecondHalfAcks = game.cupSecondHalfAcks || new Set();
    game.cupSecondHalfAcks.add(socket.id);

    const allDone = allConnectedCoachesAcked(game, game.cupSecondHalfAcks);
    if (allDone) {
      clearCupTimeout(game, "_cupSecondHalfTimeout");
      finalizeCupRound(game, game.cupRound, game.cupRuntime?.phaseToken);
    }
  });

  socket.on("cupExtraTimeDone", () => {
    const game = getGameBySocket(socket.id);
    if (!game || !game._cupETAnimHandler) return;
    game._cupETAnimHandler(socket.id);
  });
}
