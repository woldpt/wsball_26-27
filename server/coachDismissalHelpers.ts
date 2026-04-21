import type { ActiveGame } from "./types";
import { getAllTeamForms, logClubNews } from "./coreHelpers";
import { withJuniorGRs } from "./game/engine";

type Db = any;
type AnyRow = Record<string, any>;

type RunAll = <T extends AnyRow = AnyRow>(
  db: Db,
  sql: string,
  params?: any[],
) => Promise<T[]>;
type RunGet = <T extends AnyRow = AnyRow>(
  db: Db,
  sql: string,
  params?: any[],
) => Promise<T | undefined>;

interface CoachDismissalDeps {
  io: any;
  runAll: RunAll;
  runGet: RunGet;
  saveGameState: (game: ActiveGame) => void;
}

export function createCoachDismissalHelpers(deps: CoachDismissalDeps) {
  const { io, runAll, runGet, saveGameState } = deps;

  // ── Probability tables ─────────────────────────────────────────────────────
  const DISMISSAL_BY_LOSSES: Record<number, number> = {
    3: 0.1,
    4: 0.35,
    5: 0.7,
  };
  const DISMISSAL_BY_BUDGET: Record<number, number> = {
    3: 0.4,
    4: 0.7,
  };
  const DISMISSAL_BY_BUDGET_MAX = 0.95; // streak >= 5
  const INVITE_BY_WINS: Record<number, number> = {
    3: 0.08,
    4: 0.25,
    5: 0.55,
  };

  // ── Internal helpers ───────────────────────────────────────────────────────

  async function dismissHumanCoach(
    game: ActiveGame,
    coachName: string,
    reason: "results" | "budget",
    teamName: string,
    oldTeamId: number,
    division: number,
  ): Promise<void> {
    const player = game.playersByName[coachName];
    if (!player) return;

    const socketId = player.socketId;

    // Mark as dismissed: keep entry in playersByName but clear teamId
    player.teamId = null;
    player.ready = false;
    game.dismissedCoachSince[coachName] = {
      matchweek: game.matchweek,
      division,
      reason,
      teamName,
    };
    delete game.pendingJobOffers[coachName];
    game.lockedCoaches.delete(coachName);

    // Free the old team in the DB
    game.db.run("UPDATE teams SET manager_id = NULL WHERE id = ?", [oldTeamId]);

    // Notify coach
    if (socketId) {
      io.to(socketId).emit("coachDismissed", { reason, teamName });
    }

    // Broadcast to room
    const msg =
      reason === "budget"
        ? `${coachName} foi despedido de ${teamName} por insolvência financeira.`
        : `${coachName} foi despedido de ${teamName} após má série de resultados.`;
    io.to(game.roomCode).emit("systemMessage", msg);

    await autoAssignDismissedCoach(game, coachName);
  }

  async function dismissNpcManager(
    game: ActiveGame,
    team: AnyRow,
  ): Promise<void> {
    game.db.run("UPDATE teams SET manager_id = NULL WHERE id = ?", [team.id]);
    logClubNews(
      game,
      "manager_dismissed",
      `${team.name} despediu o treinador`,
      team.id,
      { description: "Despedimento após má série de resultados" },
      io,
    );
    io.to(game.roomCode).emit(
      "systemMessage",
      `${team.name} despediu o seu treinador.`,
    );
  }

  async function offerJobToCoach(
    game: ActiveGame,
    coachName: string,
    fromTeamId: number,
    toTeam: AnyRow,
    fromTeam: AnyRow,
  ): Promise<void> {
    const player = game.playersByName[coachName];
    if (!player || !player.socketId) return;

    const expiresAtMatchweek = game.matchweek + 1;
    game.pendingJobOffers[coachName] = {
      fromTeamId,
      toTeamId: toTeam.id,
      expiresAtMatchweek,
    };

    io.to(player.socketId).emit("jobOffer", {
      fromTeam: {
        id: fromTeam.id,
        name: fromTeam.name,
        division: fromTeam.division,
      },
      toTeam: {
        id: toTeam.id,
        name: toTeam.name,
        division: toTeam.division,
      },
      expiresAtMatchweek,
    });
  }

  async function autoAssignDismissedCoach(
    game: ActiveGame,
    coachName: string,
  ): Promise<void> {
    const player = game.playersByName[coachName];
    if (!player) return;

    const dismissalInfo = game.dismissedCoachSince[coachName];
    const fromDivision = dismissalInfo?.division ?? 4;

    // Teams currently held by active human coaches
    const takenTeamIds = Object.values(game.playersByName)
      .map((p) => p.teamId)
      .filter((id): id is number => id !== null && id !== undefined);

    const placeholders =
      takenTeamIds.length > 0 ? takenTeamIds.map(() => "?").join(",") : null;

    // Try to place coach in the same division they were dismissed from,
    // then progressively lower (higher number) until div 4.
    let team: AnyRow | undefined;
    for (let div = fromDivision; div <= 4; div++) {
      let query =
        "SELECT id, name, division, budget, color_primary, color_secondary, " +
        "points, wins, draws, losses, goals_for, goals_against, " +
        "stadium_capacity, stadium_name FROM teams WHERE division = ?";
      const params: any[] = [div];
      if (placeholders) {
        query += ` AND id NOT IN (${placeholders})`;
        params.push(...takenTeamIds);
      }
      query += " ORDER BY RANDOM() LIMIT 1";
      const candidate = await runGet<AnyRow>(game.db, query, params);
      if (candidate) {
        team = candidate;
        break;
      }
    }
    if (!team) {
      console.warn(
        `[${game.roomCode}] autoAssignDismissedCoach: no available NPC team found for ${coachName} (dismissed from div ${fromDivision})`,
      );
      return;
    }

    const mgr = await runGet<{ id: number }>(
      game.db,
      "SELECT id FROM managers WHERE name = ?",
      [coachName],
    );
    if (!mgr) {
      console.warn(
        `[${game.roomCode}] autoAssignDismissedCoach: manager record not found for ${coachName}`,
      );
      return;
    }

    // Assign in DB and state
    game.db.run("UPDATE teams SET manager_id = ? WHERE id = ?", [
      mgr.id,
      team.id,
    ]);
    player.teamId = team.id;
    delete game.dismissedCoachSince[coachName];

    // Notify coach
    if (player.socketId) {
      io.to(player.socketId).emit("teamAssigned", {
        teamName: team.name,
        teamId: team.id,
        division: team.division,
        budget: team.budget ?? 0,
        points: team.points ?? 0,
        wins: team.wins ?? 0,
        draws: team.draws ?? 0,
        losses: team.losses ?? 0,
        goalsFor: team.goals_for ?? 0,
        goalsAgainst: team.goals_against ?? 0,
        colorPrimary: team.color_primary ?? "#888888",
        colorSecondary: team.color_secondary ?? "#ffffff",
        stadiumCapacity: team.stadium_capacity ?? 0,
        stadiumName: team.stadium_name ?? "",
        isNew: true,
      });

      game.db.all(
        "SELECT * FROM players WHERE team_id = ?",
        [team.id],
        (err: any, squad: any[]) => {
          if (!err && player.socketId) {
            io.to(player.socketId as string).emit(
              "mySquad",
              withJuniorGRs(squad || [], team.id, game.matchweek || 1),
            );
          }
        },
      );
    }

    io.to(game.roomCode).emit(
      "systemMessage",
      `${coachName} foi atribuído a ${team.name}.`,
    );
  }

  // ── MAIN FUNCTION ─────────────────────────────────────────────────────────

  const processCoachEvents = async (game: ActiveGame): Promise<void> => {
    // 1. Expirar ofertas pendentes antigas
    for (const [coachName, offer] of Object.entries(game.pendingJobOffers)) {
      if (offer.expiresAtMatchweek <= game.matchweek) {
        delete game.pendingJobOffers[coachName];
        const p = game.playersByName[coachName];
        if (p?.socketId) {
          io.to(p.socketId).emit(
            "systemMessage",
            "A oferta de emprego expirou.",
          );
        }
      }
    }

    // 2. Carregar todas as equipas e forms
    const allTeams = await runAll<AnyRow>(
      game.db,
      "SELECT id, name, division, manager_id, budget FROM teams",
    );
    const forms: Record<number, string> = await getAllTeamForms(
      game.db,
      game.season,
    );

    // 3. Equipas humanas activas
    const humanTeamIds = new Set<number>(
      Object.values(game.playersByName)
        .map((p) => p.teamId)
        .filter((id): id is number => id !== null && id !== undefined),
    );

    // 4. Loop coaches humanos activos — budget e forma
    for (const player of Object.values(game.playersByName)) {
      if (player.teamId === null || player.teamId === undefined) continue;

      const coachName = player.name;
      const teamId = player.teamId;
      const team = allTeams.find((t) => t.id === teamId);
      if (!team) continue;

      // 4a. Budget check
      const budget = team.budget ?? 0;
      if (budget < 0) {
        game.negativeBudgetStreak[teamId] =
          (game.negativeBudgetStreak[teamId] ?? 0) + 1;
        const streak = game.negativeBudgetStreak[teamId];
        let dismissalChance = 0;
        if (streak >= 5) {
          dismissalChance = DISMISSAL_BY_BUDGET_MAX;
        } else if (streak >= 3) {
          dismissalChance = DISMISSAL_BY_BUDGET[streak] ?? 0;
        }
        if (dismissalChance > 0 && Math.random() < dismissalChance) {
          await dismissHumanCoach(
            game,
            coachName,
            "budget",
            team.name,
            teamId,
            team.division,
          );
          continue; // already dismissed
        }
      } else {
        game.negativeBudgetStreak[teamId] = 0;
      }

      // Guard: might have been dismissed by budget check above
      const currentPlayer = game.playersByName[coachName];
      if (!currentPlayer || currentPlayer.teamId === null) continue;

      // 4b. Forma check
      const form = forms[teamId] ?? "";
      const results = form.split("").slice(0, 5);
      const lossCount = results.filter((r) => r === "D").length;
      const formDismissalChance = DISMISSAL_BY_LOSSES[lossCount] ?? 0;
      if (formDismissalChance > 0 && Math.random() < formDismissalChance) {
        await dismissHumanCoach(
          game,
          coachName,
          "results",
          team.name,
          teamId,
          team.division,
        );
      }
    }

    // 5. Loop equipas NPC — forma (limiar de 5 derrotas sem aleatoriedade)
    for (const team of allTeams) {
      if (humanTeamIds.has(team.id)) continue;
      if (team.division === 5) continue; // pool interno, invisível

      const form = forms[team.id] ?? "";
      const results = form.split("").slice(0, 5);
      const lossCount = results.filter((r) => r === "D").length;
      if (lossCount < 5) continue;
      await dismissNpcManager(game, team);
    }

    // 6. Loop coaches humanos activos sobreviventes — verificar convites
    for (const player of Object.values(game.playersByName)) {
      if (player.teamId === null || player.teamId === undefined) continue;

      const coachName = player.name;
      const teamId = player.teamId;
      const team = allTeams.find((t) => t.id === teamId);
      if (!team) continue;
      if (team.division <= 1) continue; // já na primeira divisão
      if (game.pendingJobOffers[coachName]) continue; // já tem oferta

      const form = forms[teamId] ?? "";
      const results = form.split("").slice(0, 5);
      const winCount = results.filter((r) => r === "V").length;
      const inviteChance = INVITE_BY_WINS[winCount] ?? 0;
      if (inviteChance <= 0 || Math.random() >= inviteChance) continue;

      // Equipa NPC na divisão superior
      const targetDivision = team.division - 1;
      const npcCandidates = allTeams.filter(
        (t) => t.division === targetDivision && !humanTeamIds.has(t.id),
      );
      if (npcCandidates.length === 0) continue;

      const toTeam =
        npcCandidates[Math.floor(Math.random() * npcCandidates.length)];
      await offerJobToCoach(game, coachName, teamId, toTeam, team);
    }

    // 7. Persistir estado
    saveGameState(game);
  };

  // ── ACCEPT / DECLINE JOB OFFER ────────────────────────────────────────────

  const handleAcceptJobOffer = async (
    game: ActiveGame,
    coachName: string,
  ): Promise<void> => {
    const offer = game.pendingJobOffers[coachName];
    if (!offer) return;

    const player = game.playersByName[coachName];
    if (!player) return;

    const { fromTeamId, toTeamId } = offer;

    const mgr = await runGet<{ id: number }>(
      game.db,
      "SELECT id FROM managers WHERE name = ?",
      [coachName],
    );
    if (!mgr) return;

    // Update DB
    game.db.run("UPDATE teams SET manager_id = ? WHERE id = ?", [
      mgr.id,
      toTeamId,
    ]);
    game.db.run("UPDATE teams SET manager_id = NULL WHERE id = ?", [
      fromTeamId,
    ]);

    // Update in-memory state
    player.teamId = toTeamId;
    delete game.pendingJobOffers[coachName];

    // Fetch new team details
    const team = await runGet<AnyRow>(
      game.db,
      "SELECT id, name, division, budget, points, wins, draws, losses, " +
        "goals_for, goals_against, color_primary, color_secondary, " +
        "stadium_capacity, stadium_name FROM teams WHERE id = ?",
      [toTeamId],
    );
    if (!team) return;

    if (player.socketId) {
      io.to(player.socketId).emit("teamAssigned", {
        teamName: team.name,
        teamId: team.id,
        division: team.division,
        budget: team.budget ?? 0,
        points: team.points ?? 0,
        wins: team.wins ?? 0,
        draws: team.draws ?? 0,
        losses: team.losses ?? 0,
        goalsFor: team.goals_for ?? 0,
        goalsAgainst: team.goals_against ?? 0,
        colorPrimary: team.color_primary ?? "#888888",
        colorSecondary: team.color_secondary ?? "#ffffff",
        stadiumCapacity: team.stadium_capacity ?? 0,
        stadiumName: team.stadium_name ?? "",
        isNew: false,
      });

      game.db.all(
        "SELECT * FROM players WHERE team_id = ?",
        [toTeamId],
        (err: any, squad: any[]) => {
          if (!err && player.socketId) {
            io.to(player.socketId as string).emit(
              "mySquad",
              withJuniorGRs(squad || [], toTeamId, game.matchweek || 1),
            );
          }
        },
      );
    }

    io.to(game.roomCode).emit(
      "systemMessage",
      `${coachName} aceitou o convite de ${team.name}.`,
    );

    // Broadcast updated teams
    game.db.all("SELECT * FROM teams", (err: any, teams: any[]) => {
      if (!err) io.to(game.roomCode).emit("teamsData", teams);
    });

    saveGameState(game);
  };

  const handleDeclineJobOffer = (game: ActiveGame, coachName: string): void => {
    delete game.pendingJobOffers[coachName];
  };

  return { processCoachEvents, handleAcceptJobOffer, handleDeclineJobOffer };
}
