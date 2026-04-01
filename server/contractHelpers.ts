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
    const demandBase = Math.max(
      Math.round((player.skill || 0) * 70),
      wage + 200,
    );
    if (wage >= demandBase * 0.85 && Math.random() > 0.08) return;

    const requestedWage = Math.round(demandBase * (1.05 + Math.random() * 0.2));
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

  const finalizeContractDecision = (
    game: ActiveGame,
    playerId: number,
    decision: string,
    teamId: number,
    currentMatchweek: number,
    listPlayerOnMarket: (
      game: ActiveGame,
      playerId: number,
      mode: string,
      price: number,
      callback?: (...args: any[]) => void,
    ) => void,
    emitSquadForPlayer: (game: ActiveGame, teamId: number) => void,
  ) => {
    game.db.get(
      "SELECT * FROM players WHERE id = ?",
      [playerId],
      (err: any, player: any) => {
        if (err || !player) return;

        if (decision === "accept") {
          const seasonEnd = getSeasonEndMatchweek(currentMatchweek);
          const newWage = player.contract_requested_wage || player.wage || 0;
          game.db.run(
            "UPDATE players SET wage = ?, contract_until_matchweek = ?, contract_request_pending = 0, contract_requested_wage = 0 WHERE id = ?",
            [newWage, seasonEnd, playerId],
            () => {
              const coach = (
                Object.values(game.playersByName) as PlayerSession[]
              ).find((p) => p.teamId === teamId && p.socketId);
              if (coach) {
                io.to(coach.socketId as string).emit(
                  "systemMessage",
                  `${player.name} renovou contrato por €${newWage}/sem.`,
                );
              }
              emitSquadForPlayer(game, teamId);
            },
          );
        } else {
          listPlayerOnMarket(
            game,
            playerId,
            "auction",
            Math.max(
              player.value * 0.65,
              (player.contract_requested_wage || player.wage || 0) * 12,
            ),
            () => {
              game.db.run(
                "UPDATE players SET contract_request_pending = 0, contract_requested_wage = 0 WHERE id = ?",
                [playerId],
              );
              const coach = (
                Object.values(game.playersByName) as PlayerSession[]
              ).find((p) => p.teamId === teamId && p.socketId);
              if (coach) {
                io.to(coach.socketId as string).emit(
                  "systemMessage",
                  `${player.name} foi colocado em leilão.`,
                );
              }
            },
          );
        }
      },
    );
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
    finalizeContractDecision,
    maybeTriggerContractRequest,
    processContractExpiries,
  };
}
