import type { ActiveGame, PlayerSession } from "./types";

type AnyRow = Record<string, any>;

type RunAll = <T extends AnyRow = AnyRow>(
  db: any,
  sql: string,
  params?: any[],
) => Promise<T[]>;

type RunGet = <T extends AnyRow = AnyRow>(
  db: any,
  sql: string,
  params?: any[],
) => Promise<T | null>;

interface ContractDeps {
  io: any;
  getSeasonEndMatchweek: (matchweek: number) => number;
  runAll: RunAll;
  runGet: RunGet;
}

export function createContractHelpers(deps: ContractDeps) {
  const { io, getSeasonEndMatchweek, runAll, runGet } = deps;

  const maybeTriggerContractRequest = (game: ActiveGame, player: any) => {
    if (!player || !player.team_id) return;
    if (player.transfer_status && player.transfer_status !== "none") return;
    if (player.contract_request_pending) return;

    const wage = player.wage || 0;
    const value = player.value || (player.skill || 0) * 20000;
    // Non-linear demand base: mirrors the seeding wage formula with a small premium
    const fairWage = Math.round(Math.pow(value, 0.62) / 2.5);
    const demandBase = Math.max(fairWage, Math.round(wage * 1.05), wage + 100);
    if (wage >= demandBase * 0.88 && Math.random() > 0.08) return;

    const requestedWage = Math.round(demandBase * (1.05 + Math.random() * 0.15));
    game.db.run(
      "UPDATE players SET contract_request_pending = 1, contract_requested_wage = ? WHERE id = ?",
      [requestedWage, player.id],
      () => {
        const coach = (
          Object.values(game.playersByName) as PlayerSession[]
        ).find((p) => p.teamId === player.team_id && p.socketId);
        if (!coach) {
          game.db.run(
            "UPDATE players SET contract_request_pending = 0 WHERE id = ?",
            [player.id],
          );
          return;
        }

        io.to(coach.socketId as string).emit("matchActionRequired", {
          actionId: `contract-${player.id}-${Date.now()}`,
          type: "contract",
          teamId: player.team_id,
          player: {
            id: player.id,
            name: player.name,
            position: player.position,
            skill: player.skill,
            wage,
            requestedWage,
          },
        });
      },
    );
  };

  const processAgentRenegotiations = async (game: ActiveGame) => {
    const currentMw = game.matchweek;
    // Jogadores com 2+ temporadas (>= 28 matchweeks) no mesmo clube e sem processo pendente
    const veterans = await runAll(
      game.db,
      `SELECT * FROM players
       WHERE team_id IS NOT NULL
         AND transfer_status = 'none'
         AND contract_request_pending = 0
         AND joined_matchweek > 0
         AND (? - joined_matchweek) >= 28`,
      [currentMw],
    );

    for (const player of veterans) {
      // 30% chance per matchweek to avoid avalanche of simultaneous requests
      if (Math.random() > 0.3) continue;

      const coach = (Object.values(game.playersByName) as PlayerSession[]).find(
        (p) => p.teamId === player.team_id && p.socketId,
      );
      if (!coach) continue;

      const wage = player.wage || 0;
      const value = player.value || (player.skill || 0) * 20000;
      // Agente exige mais do que na renovação por expiração: jogador valorizado
      const fairWage = Math.round(Math.pow(value, 0.62) / 2.5);
      const demandBase = Math.max(
        Math.round(fairWage * 1.15),
        Math.round(wage * 1.3),
      );
      // Apenas aciona se diferença significativa (>20% acima do salário actual)
      if (wage >= demandBase * 0.85) continue;

      const requestedWage = Math.round(
        demandBase * (1.0 + Math.random() * 0.15),
      );

      game.db.run(
        "UPDATE players SET contract_request_pending = 1, contract_requested_wage = ? WHERE id = ?",
        [requestedWage, player.id],
        () => {
          io.to(coach.socketId as string).emit("matchActionRequired", {
            actionId: `contract-renegotiate-${player.id}-${Date.now()}`,
            type: "contract",
            teamId: player.team_id,
            isRenegotiation: true,
            player: {
              id: player.id,
              name: player.name,
              position: player.position,
              skill: player.skill,
              wage,
              requestedWage,
            },
          });
        },
      );
    }
  };

  const processContractExpiries = async (game: ActiveGame) => {
    const currentMw = game.matchweek;

    const expired = await runAll(
      game.db,
      "SELECT * FROM players WHERE team_id IS NOT NULL AND contract_until_matchweek > 0 AND contract_until_matchweek <= ?",
      [currentMw],
    );

    for (const player of expired) {
      const coach = (Object.values(game.playersByName) as PlayerSession[]).find(
        (pl) => pl.teamId === player.team_id && pl.socketId,
      );
      if (!coach) {
        const team = await runGet(
          game.db,
          "SELECT budget FROM teams WHERE id = ?",
          [player.team_id],
        );
        const newWage = Math.max(
          Math.round((player.skill || 0) * 55),
          player.wage || 0,
        );
        if (team && team.budget > newWage * 14) {
          await new Promise((resolve) => {
            game.db.run(
              "UPDATE players SET wage = ?, contract_until_matchweek = ?, contract_request_pending = 0 WHERE id = ?",
              [newWage, getSeasonEndMatchweek(currentMw), player.id],
              resolve,
            );
          });
        } else {
          await new Promise((resolve) => {
            game.db.run(
              "UPDATE players SET team_id = NULL, transfer_status = 'none', transfer_price = 0, contract_request_pending = 0 WHERE id = ?",
              [player.id],
              resolve,
            );
          });
        }
      }
    }

    const soonExpiring = await runAll(
      game.db,
      "SELECT * FROM players WHERE team_id IS NOT NULL AND contract_until_matchweek > 0 AND contract_until_matchweek <= ? AND contract_until_matchweek > ? AND contract_request_pending = 0",
      [currentMw + 3, currentMw],
    );

    for (const player of soonExpiring) {
      maybeTriggerContractRequest(game, player);
    }
  };

  return {
    maybeTriggerContractRequest,
    processAgentRenegotiations,
    processContractExpiries,
  };
}
