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
  emitPresence: (game: ActiveGame) => void;
  saveGameState: (game: ActiveGame) => void;
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
    emitPresence,
    saveGameState,
    handleAcceptJobOffer,
    handleDeclineJobOffer,
    emitGlobalPlayerUpdate,
  } = deps;

  const VALID_FORMATIONS = new Set([
    "4-4-2", "4-3-3", "3-5-2", "5-3-2", "4-5-1", "3-4-3", "4-2-4", "5-4-1",
  ]);
  const VALID_STYLES = new Set(["Balanced", "Defensive", "Offensive"]);

  socket.on("setTactic", (tactic) => {
    if (
      !tactic ||
      typeof tactic !== "object" ||
      typeof tactic.formation !== "string" ||
      typeof tactic.style !== "string" ||
      !VALID_FORMATIONS.has(tactic.formation) ||
      !VALID_STYLES.has(tactic.style)
    )
      return;
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
    emitPresence(game);
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

  socket.on("request_substitution", () => {
    const game = getGameBySocket(socket.id);
    if (!game) return;
    const playerState = getPlayerBySocket(game, socket.id);
    if (!playerState || !playerState.teamId) return;

    if (!game.pendingSubstitutions) {
      game.pendingSubstitutions = new Set();
    }
    game.pendingSubstitutions.add(playerState.teamId);
    console.log(
      `[${game.roomCode}] 🔁 ${playerState.name} requested substitution for team ${playerState.teamId}`,
    );
    // Notificar todos os jogadores humanos que este treinador está a fazer substituições
    io.to(game.roomCode).emit("substitutionPauseStarted", {
      teamId: playerState.teamId,
      coachName: playerState.name,
    });
  });

  socket.on("resolveMatchAction", ({ actionId, teamId, playerId, choice }) => {
    const game = getGameBySocket(socket.id);
    if (!game) return;

    if (!game.pendingMatchAction) {
      // Já foi resolvido (timer ou desconexão auto-resolveu) — desbloquear cliente preso
      socket.emit("matchActionResolved", { source: "auto" });
      return;
    }

    const pendingAction: any = game.pendingMatchAction;
    if (pendingAction.actionId !== actionId) return;
    if (pendingAction.teamId !== teamId) return;

    const pending: any = pendingAction;
    clearTimeout(pending.timer);
    game.pendingMatchAction = null;

    const finalChoice = choice !== undefined ? choice : playerId;

    if (finalChoice === null || finalChoice === undefined) {
      pending.finalize(pending.fallback ? pending.fallback() : null, "auto");
    } else {
      pending.finalize(finalChoice, "human");
    }
  });

  // Expulsar um coach da sala (apenas Admin no lobby)
  socket.on("kickCoach", ({ targetName }: { targetName: string }) => {
    const game = getGameBySocket(socket.id);
    if (!game) return;
    if (game.gamePhase !== "lobby") return;

    const requesterName = game.socketToName[socket.id];
    if (!requesterName || requesterName !== game.roomCreator) return;
    if (!targetName || targetName === requesterName) return;

    const target = game.playersByName[targetName];
    if (!target) return;

    // Notificar o coach expulso antes de remover
    const targetSocketId = target.socketId;
    if (targetSocketId) {
      io.to(targetSocketId).emit("kicked", {
        reason: "Foste removido da sala pelo Admin.",
      });
    }

    // Remover coach da sala
    delete game.playersByName[targetName];
    game.lockedCoaches.delete(targetName);

    // Libertar a equipa no DB
    if (target.teamId) {
      game.db.run(
        "UPDATE teams SET manager_id = NULL WHERE id = ?",
        [target.teamId],
        () => {},
      );
      game.db.run(
        "DELETE FROM managers WHERE name = ?",
        [targetName],
        () => {},
      );
    }

    saveGameState(game);
    emitPresence(game);
    emitGlobalPlayerUpdate?.();

    console.log(
      `[${game.roomCode}] 🚫 Admin ${requesterName} expulsou ${targetName}`,
    );
  });

  socket.on("disconnect", () => {
    const game = getGameBySocket(socket.id);
    if (!game) return;

    const playerState = getPlayerBySocket(game, socket.id);
    console.log(
      `[${game.roomCode}] 🔌 Disconnect: ${playerState?.name ?? "unknown"} (socket=${socket.id}) | phase=${game.gamePhase}`,
    );

    if (playerState) {
      // In lobby: reset ready state so a refreshing coach must re-confirm their tactic.
      // This prevents a disconnect from triggering an auto-advance into the match.
      if (game.gamePhase === "lobby") {
        playerState.ready = false;
      }

      // Remove from lockedCoaches so checkAllReady doesn't block on offline coach
      game.lockedCoaches.delete(playerState.name);

      // Cancel any pending contract counter-offer timer for this coach's team
      if (game.pendingRenewalCounterOffers) {
        for (const [pid, offer] of Object.entries(
          game.pendingRenewalCounterOffers as Record<string, any>,
        )) {
          if (offer.teamId === playerState.teamId) {
            clearTimeout(offer.timer);
            delete (game.pendingRenewalCounterOffers as any)[pid];
          }
        }
      }

      // If the disconnected socket owned the pending match action, auto-resolve it
      const pendingAction: any = game.pendingMatchAction;
      if (pendingAction && pendingAction.teamId === playerState.teamId) {
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
    }

    unbindSocket(game, socket.id);
    emitPresence(game);
    emitGlobalPlayerUpdate?.();
    // Let remaining ready coaches proceed if all are now ready.
    // Skip in lobby: a disconnect must never auto-start the match.
    if (game.gamePhase !== "lobby") {
      checkAllReady(game);
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
