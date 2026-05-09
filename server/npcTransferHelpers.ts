import type { ActiveGame } from "./types";
import { logClubNews } from "./coreHelpers";

type AnyRow = Record<string, any>;

type RunAll = <T extends AnyRow = AnyRow>(
  db: any,
  sql: string,
  params?: any[],
) => Promise<T[]>;

interface NpcTransferDeps {
  runAll: RunAll;
  getSeasonEndMatchweek: (matchweek: number) => number;
  io: any;
}

export function createNpcTransferHelpers(deps: NpcTransferDeps) {
  const { runAll, getSeasonEndMatchweek, io } = deps;

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
      "SELECT * FROM players WHERE team_id IS NOT NULL AND transfer_status = 'fixed' AND (signed_season IS NULL OR signed_season != ?) ORDER BY skill DESC, value ASC",
      [Math.ceil(Math.max(1, game.matchweek) / 14)],
    );

    for (const npcTeam of npcTeams) {
      const squadRows = await runAll(
        game.db,
        "SELECT id FROM players WHERE team_id = ?",
        [npcTeam.id],
      );
      if (squadRows.length >= 24) continue;
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

        // Conditional UPDATE: only proceed if the player is still on the transfer list.
        // This prevents a double-sale when two NPC teams share the same marketPlayers snapshot.
        const changes = await new Promise<number>((resolve) => {
          game.db.run(
            "UPDATE players SET team_id = ?, transfer_status = 'none', transfer_price = 0, contract_until_matchweek = ?, signed_season = ?, joined_matchweek = ?, transfer_cooldown_until_matchweek = ?, contract_request_pending = 0, contract_requested_wage = 0 WHERE id = ? AND transfer_status = 'fixed' AND (signed_season IS NULL OR signed_season != ?)",
            [
              npcTeam.id,
              getSeasonEndMatchweek(game.matchweek),
              Math.ceil(Math.max(1, game.matchweek) / 14),
              game.matchweek,
              game.matchweek,
              player.id,
              Math.ceil(Math.max(1, game.matchweek) / 14),
            ],
            function (this: any) {
              resolve(this.changes ?? 0);
            },
          );
        });

        if (changes === 0) {
          // Player was already sold to another NPC — roll back the budget deduction
          await new Promise((resolve) => {
            game.db.run(
              "UPDATE teams SET budget = budget + ? WHERE id = ?",
              [price, npcTeam.id],
              resolve,
            );
          });
          if (player.team_id) {
            await new Promise((resolve) => {
              game.db.run(
                "UPDATE teams SET budget = budget - ? WHERE id = ?",
                [price, player.team_id],
                resolve,
              );
            });
          }
          continue; // try next player
        }

        // Remove from in-memory snapshot so no other NPC can re-buy this player
        const idx = marketPlayers.indexOf(player);
        if (idx > -1) marketPlayers.splice(idx, 1);

        // Log club news for seller (human team) when NPC buys from transfer list
        if (player.team_id && humanTeamIds.has(player.team_id)) {
          logClubNews(
            game,
            "transfer_out",
            `${player.name} vendido (Lista de Transferências)`,
            player.team_id,
            {
              player_name: player.name,
              player_id: player.id,
              related_team_id: npcTeam.id,
              related_team_name: npcTeam.name,
              amount: price,
              description: `${player.name} foi vendido por €${price}.`,
            },
            io,
          );
          // Broadcast updated team budgets
          game.db.all("SELECT * FROM teams", (_err: any, teams: any[]) => {
            if (teams) io.to(game.roomCode).emit("teamsData", teams);
          });
        }

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
        "SELECT * FROM players WHERE team_id = ? AND transfer_status = 'none' AND contract_request_pending = 0 AND (signed_season IS NULL OR signed_season != ?) ORDER BY skill ASC",
        [npcTeam.id, Math.ceil(Math.max(1, game.matchweek) / 14)],
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
      auctionDelay = Math.min(auctionDelay + 18000, 120000);
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

    // Buscar todos os dados necessários numa só query:
    // equipas com orçamento acima do preço base, divisão da equipa vendedora, e
    // composição do plantel de cada candidata (para avaliar necessidades por posição).
    game.db.get(
      "SELECT division FROM teams WHERE id = ?",
      [auction.sellerTeamId],
      (errDiv: any, sellerRow: any) => {
        const sellerDivision: number = sellerRow?.division ?? 3;

        game.db.all(
          "SELECT position, skill, value, wage, is_star FROM players WHERE id = ?",
          [playerId],
          (errP: any, playerRows: any[]) => {
            const playerInfo = playerRows?.[0] ?? null;
            if (!playerInfo) return;

            const playerValue = playerInfo.value || 0;
            const playerPosition: string = playerInfo.position || "MED";
            const playerSkill: number = playerInfo.skill || 50;

            game.db.all(
              "SELECT * FROM teams WHERE budget > ?",
              [auction.startingPrice],
              (err: any, teams: any[]) => {
                if (err || !teams) return;
                const npcTeams = teams.filter(
                  (team) =>
                    !humanTeamIds.has(team.id) &&
                    team.id !== auction.sellerTeamId &&
                    Math.abs((team.division ?? 3) - sellerDivision) <= 1,
                );
                if (npcTeams.length === 0) return;

                // Para cada equipa NPC elegível, verificar necessidades de plantel
                // e calcular probabilidade de interesse
                let processed = 0;
                for (const npcTeam of npcTeams) {
                  game.db.all(
                    "SELECT position, skill FROM players WHERE team_id = ?",
                    [npcTeam.id],
                    (errS: any, squadRows: any[]) => {
                      processed++;
                      if (errS || !squadRows) {
                        if (processed === npcTeams.length) return;
                        return;
                      }

                      // Contar jogadores por posição
                      const posCounts: Record<string, number> = { GR: 0, DEF: 0, MED: 0, ATA: 0 };
                      for (const p of squadRows) {
                        if (posCounts[p.position] !== undefined) posCounts[p.position]++;
                      }

                      // Mínimos recomendados por posição para um plantel funcional
                      const POS_MIN: Record<string, number> = { GR: 2, DEF: 4, MED: 4, ATA: 3 };
                      const posMin = POS_MIN[playerPosition] ?? 3;
                      const posCount = posCounts[playerPosition] ?? 0;
                      const hasUrgentNeed = posCount < posMin;
                      const hasModerateNeed = posCount >= posMin && squadRows.length < 20;

                      // Calcular nível médio do plantel — NPC só compra se o jogador
                      // for compatível com o nível da equipa (±15 skill)
                      const avgSkill = squadRows.length > 0
                        ? squadRows.reduce((s, p) => s + (p.skill || 0), 0) / squadRows.length
                        : playerSkill;
                      const skillCompatible = Math.abs(playerSkill - avgSkill) <= 15;
                      if (!skillCompatible) return;

                      // Probabilidade de participação
                      let interestProb = 0.0;
                      if (hasUrgentNeed) interestProb += 0.55;
                      else if (hasModerateNeed) interestProb += 0.25;
                      else interestProb += 0.10; // pode reforçar mesmo sem necessidade urgente

                      // NPC de divisão mais forte → mais confiante/agressivo
                      const npcDiv = npcTeam.division ?? 3;
                      if (npcDiv < sellerDivision) interestProb *= 1.3;
                      else if (npcDiv > sellerDivision) interestProb *= 0.7;

                      // Cap a 85%
                      interestProb = Math.min(interestProb, 0.85);

                      if (Math.random() > interestProb) return;

                      // Orçamento máximo que este NPC está disposto a pagar
                      const budgetCap = Math.round(npcTeam.budget * 0.4);
                      const valueCap = Math.round(playerValue * 1.8);
                      const maxBid = Math.min(budgetCap, valueCap);
                      if (maxBid < auction.startingPrice) return;

                      // Valor de interesse — urgência e divisão influenciam o topo
                      const interestMultMin = hasUrgentNeed ? 1.0 : 0.85;
                      const interestMultMax = hasUrgentNeed
                        ? (npcDiv < sellerDivision ? 1.45 : 1.25)
                        : (npcDiv < sellerDivision ? 1.15 : 1.0);
                      const interestMult =
                        interestMultMin + Math.random() * (interestMultMax - interestMultMin);
                      let bidAmount = Math.round(playerValue * interestMult);

                      // Garantir mínimo e máximo
                      bidAmount = Math.max(auction.startingPrice, Math.min(bidAmount, maxBid));

                      // Delay humano realista: equipas de divisão superior respondem mais rápido
                      const delayMin = npcDiv < sellerDivision ? 2000 : 4000;
                      const delayMax = npcDiv < sellerDivision ? 9000 : 16000;
                      const bidDelay = delayMin + Math.floor(Math.random() * (delayMax - delayMin));

                      setTimeout(() => {
                        const currentAuction = game.auctions?.[playerId] as any;
                        if (!currentAuction || currentAuction.status !== "open") return;
                        // Não relicitar aqui — só o mecanismo de counter-bid faz isso
                        if (currentAuction.bids[npcTeam.id] != null) return;

                        placeAuctionBid(game, npcTeam.id, playerId, bidAmount);
                      }, bidDelay);
                    },
                  );
                }
              },
            );
          },
        );
      },
    );
  };

  /**
   * Agendado quando um NPC perde a liderança de um leilão.
   * Dá ao NPC uma oportunidade de relicitar (máximo 1 vez por leilão).
   */
  const scheduleNpcCounterBid = (
    game: ActiveGame,
    playerId: number,
    npcTeamId: number,
    placeAuctionBid: (
      game: ActiveGame,
      teamId: number,
      playerId: number,
      bidAmount: number,
    ) => Promise<any>,
  ) => {
    const auction = game.auctions?.[playerId] as any;
    if (!auction) return;

    // Inicializar contador de relicitações se necessário
    if (!auction.npcRelicitationCount) auction.npcRelicitationCount = {};
    if ((auction.npcRelicitationCount[npcTeamId] ?? 0) >= 1) return; // já relicitou

    // Delay realista de ponderação: o NPC "pensa" se vale a pena
    const counterDelay = 4000 + Math.floor(Math.random() * 14000); // 4s a 18s

    setTimeout(() => {
      const currentAuction = game.auctions?.[playerId] as any;
      if (!currentAuction || currentAuction.status !== "open") return;

      // 60% de hipótese de realmente contra-atacar (40% desiste)
      if (Math.random() > 0.60) return;

      // Recalcular o lance mais alto actual
      let currentHighBid = 0;
      for (const amt of Object.values(currentAuction.bids || {})) {
        const b = Number(amt || 0);
        if (b > currentHighBid) currentHighBid = b;
      }

      // Superar por uma margem realista
      const marginMin = 50000;
      const marginMax = 200000;
      const margin = marginMin + Math.floor(Math.random() * (marginMax - marginMin));
      const counterBid = currentHighBid + margin;

      // Verificar se o NPC tem orçamento para este lance
      game.db.get(
        "SELECT budget FROM teams WHERE id = ?",
        [npcTeamId],
        (err: any, teamRow: any) => {
          if (err || !teamRow) return;
          const maxAffordable = Math.round(teamRow.budget * 0.4);
          if (counterBid > maxAffordable) return; // demasiado caro, desiste

          // Registar relicitação antes de colocar o lance
          if (!currentAuction.npcRelicitationCount) currentAuction.npcRelicitationCount = {};
          currentAuction.npcRelicitationCount[npcTeamId] =
            (currentAuction.npcRelicitationCount[npcTeamId] ?? 0) + 1;

          placeAuctionBid(game, npcTeamId, playerId, counterBid);
        },
      );
    }, counterDelay);
  };

  return {
    processNpcTransferActivity,
    scheduleNpcAuctionBids,
    scheduleNpcCounterBid,
  };
}
