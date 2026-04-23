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
    if (
      !tactic ||
      typeof tactic !== "object" ||
      typeof tactic.formation !== "string" ||
      typeof tactic.style !== "string"
    )
      return;
    const game = getGameBySocket(socket.id);
    const playerState = getPlayerBySocket(game, socket.id);
    if (game && playerState) {
      playerState.tactic = tactic;
    }
  });

  socket.on("setTrainingPlan", ({ focus, intensity }) => {
    const game = getGameBySocket(socket.id);
    const playerState = getPlayerBySocket(game, socket.id);
    if (!game || !playerState?.teamId) return;
    if (game.gamePhase !== "lobby") return;
    if (playerState.ready) return;

    const normalizedFocus = String(focus || "").toUpperCase();
    const allowedFocus = new Set([
      "FORMA",
      "RESISTENCIA",
      "GR",
      "DEFESA",
      "ATAQUE",
      "PASSE",
    ]);
    if (!allowedFocus.has(normalizedFocus)) return;
    const safeIntensity = Math.max(1, Math.min(100, Number(intensity) || 50));

    game.db.run(
      `INSERT INTO team_training_plan (team_id, season, matchweek, focus, intensity, updated_at)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(team_id, season, matchweek)
       DO UPDATE SET focus = excluded.focus, intensity = excluded.intensity, updated_at = CURRENT_TIMESTAMP`,
      [
        playerState.teamId,
        game.season,
        game.matchweek,
        normalizedFocus,
        safeIntensity,
      ],
      () => {
        socket.emit("trainingPlanUpdated", {
          teamId: playerState.teamId,
          season: game.season,
          matchweek: game.matchweek,
          focus: normalizedFocus,
          intensity: safeIntensity,
        });
      },
    );
  });

  socket.on("requestTrainingPlan", () => {
    const game = getGameBySocket(socket.id);
    const playerState = getPlayerBySocket(game, socket.id);
    if (!game || !playerState?.teamId) return;
    game.db.get(
      "SELECT focus, intensity FROM team_training_plan WHERE team_id = ? AND season = ? AND matchweek = ?",
      [playerState.teamId, game.season, game.matchweek],
      (_err: any, row: any) => {
        socket.emit(
          "trainingPlanData",
          row || { focus: "FORMA", intensity: 50 },
        );
      },
    );
  });

  socket.on("requestTrainingHistory", () => {
    const game = getGameBySocket(socket.id);
    const playerState = getPlayerBySocket(game, socket.id);
    if (!game || !playerState?.teamId) return;
    game.db.all(
      "SELECT season, matchweek, focus, intensity FROM team_training_plan WHERE team_id = ? ORDER BY season DESC, matchweek DESC LIMIT 10",
      [playerState.teamId],
      (_err: any, rows: any[]) => {
        socket.emit("trainingHistoryData", rows || []);
      },
    );
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
      "SELECT * FROM players WHERE team_id = ? ORDER BY CASE position WHEN 'GR' THEN 1 WHEN 'DEF' THEN 2 WHEN 'MED' THEN 3 WHEN 'ATA' THEN 4 ELSE 5 END, ((COALESCE(gk, skill, 1) + COALESCE(defesa, skill, 1) + COALESCE(passe, skill, 1) + COALESCE(finalizacao, skill, 1)) / 4.0) DESC, name",
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
    io.to(game.roomCode).emit("playerListUpdate", getPlayerList(game));
    emitGlobalPlayerUpdate?.();
    emitAwaitingCoaches(game);
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
