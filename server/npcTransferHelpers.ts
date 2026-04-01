import type { ActiveGame } from "./types";

type AnyRow = Record<string, any>;

type RunAll = <T extends AnyRow = AnyRow>(
  db: any,
  sql: string,
  params?: any[],
) => Promise<T[]>;

interface NpcTransferDeps {
  runAll: RunAll;
  getSeasonEndMatchweek: (matchweek: number) => number;
}

export function createNpcTransferHelpers(deps: NpcTransferDeps) {
  const { runAll, getSeasonEndMatchweek } = deps;

  const processNpcTransferActivity = async (
    game: ActiveGame,
    listPlayerOnMarket: (
      game: ActiveGame,
      playerId: number,
      mode: string,
      price: number,
      callback?: (...args: any[]) => void,
    ) => void,
  ) => {
    const humanTeamIds = new Set(
      Object.values(game.playersByName)
        .map((p) => p.teamId)
        .filter(Boolean),
    );

    const allTeams = await runAll(
      game.db,
      "SELECT * FROM teams WHERE budget > 20000",
    );
    const npcTeams = allTeams.filter((team) => !humanTeamIds.has(team.id));
    if (npcTeams.length === 0) return;

    const marketPlayers = await runAll(
      game.db,
      "SELECT * FROM players WHERE (team_id IS NULL OR transfer_status = 'fixed') AND transfer_status != 'auction' ORDER BY skill DESC, value ASC",
    );

    for (const npcTeam of npcTeams) {
      const squadRows = await runAll(
        game.db,
        "SELECT id FROM players WHERE team_id = ?",
        [npcTeam.id],
      );
      if (squadRows.length >= 22) continue;
      if (Math.random() > 0.25) continue;

      for (const player of marketPlayers) {
        if (player.team_id === npcTeam.id) continue;

        const price =
          player.transfer_status === "fixed" && player.transfer_price > 0
            ? player.transfer_price
            : Math.round((player.value || 0) * 1.2);
        if (price <= 0) continue;
        if (price > npcTeam.budget * 0.35) continue;
        if (Math.random() > 0.4) continue;

        await new Promise((resolve) => {
          game.db.run(
            "UPDATE teams SET budget = budget - ? WHERE id = ?",
            [price, npcTeam.id],
            resolve,
          );
        });

        if (player.team_id) {
          await new Promise((resolve) => {
            game.db.run(
              "UPDATE teams SET budget = budget + ? WHERE id = ?",
              [price, player.team_id],
              resolve,
            );
          });
        }

        await new Promise((resolve) => {
          game.db.run(
            "UPDATE players SET team_id = ?, transfer_status = 'none', transfer_price = 0, contract_until_matchweek = ?, contract_request_pending = 0, contract_requested_wage = 0 WHERE id = ?",
            [npcTeam.id, getSeasonEndMatchweek(game.matchweek), player.id],
            resolve,
          );
        });

        npcTeam.budget -= price;
        break;
      }
    }

    const allNpcTeams = (await runAll(game.db, "SELECT * FROM teams")).filter(
      (team) => !humanTeamIds.has(team.id),
    );

    const npcListings: Array<{
      candidate: any;
      useAuction: boolean;
      price: number;
    }> = [];
    for (const npcTeam of allNpcTeams) {
      const squad = await runAll(
        game.db,
        "SELECT * FROM players WHERE team_id = ? AND transfer_status = 'none' AND contract_request_pending = 0 ORDER BY skill ASC",
        [npcTeam.id],
      );

      const listChance = squad.length > 16 ? 0.4 : squad.length > 12 ? 0.15 : 0;
      if (listChance === 0 || Math.random() > listChance) continue;

      const candidate = squad[0];
      if (!candidate) continue;

      const useAuction = Math.random() < 0.4;
      const price = Math.round(
        (candidate.value || 0) * (useAuction ? 0.75 : 1.0),
      );
      if (price <= 0) continue;

      npcListings.push({ candidate, useAuction, price });
    }

    if (npcListings.length === 0) return;

    const auctionListings = npcListings
      .filter((listing) => listing.useAuction)
      .sort(() => Math.random() - 0.5)
      .slice(0, 3);
    const fixedListings = npcListings.filter((listing) => !listing.useAuction);

    for (const { candidate, price } of fixedListings) {
      await new Promise((resolve) => {
        listPlayerOnMarket(game, candidate.id, "fixed", price, resolve);
      });
    }

    let auctionDelay = 500;
    for (const { candidate, price } of auctionListings) {
      setTimeout(() => {
        listPlayerOnMarket(game, candidate.id, "auction", price, null);
      }, auctionDelay);
      auctionDelay += 18000;
    }
  };

  const scheduleNpcAuctionBids = (
    game: ActiveGame,
    playerId: number,
    placeAuctionBid: (
      game: ActiveGame,
      teamId: number,
      playerId: number,
      bidAmount: number,
    ) => Promise<any>,
  ) => {
    const auction = game.auctions?.[playerId] as any;
    if (!auction) return;

    const humanTeamIds = new Set(
      Object.values(game.playersByName)
        .map((p) => p.teamId)
        .filter(Boolean),
    );

    game.db.all(
      "SELECT * FROM teams WHERE budget > ?",
      [auction.startingPrice],
      (err: any, teams: any[]) => {
        if (err || !teams) return;
        const npcTeams = teams.filter(
          (team) =>
            !humanTeamIds.has(team.id) && team.id !== auction.sellerTeamId,
        );

        for (const npcTeam of npcTeams) {
          if (Math.random() > 0.5) continue;

          const bidDelay = 2000 + Math.floor(Math.random() * 10000);
          setTimeout(() => {
            const currentAuction = game.auctions?.[playerId] as any;
            if (!currentAuction || currentAuction.status !== "open") return;
            if (currentAuction.bids[npcTeam.id] != null) return;

            const maxBid = Math.min(
              Math.round(auction.startingPrice * 1.5),
              Math.round(npcTeam.budget * 0.4),
            );
            if (maxBid < auction.startingPrice) return;

            const bidAmount =
              auction.startingPrice +
              Math.floor(Math.random() * (maxBid - auction.startingPrice + 1));

            placeAuctionBid(game, npcTeam.id, playerId, bidAmount);
          }, bidDelay);
        }
      },
    );
  };

  return {
    processNpcTransferActivity,
    scheduleNpcAuctionBids,
  };
}
