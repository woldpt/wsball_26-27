import type { ActiveGame, PlayerSession } from "./types";
import { logClubNews } from "./coreHelpers";
import { withJuniorGRs } from "./game/engine";

interface AuctionDeps {
  io: any;
  isMatchInProgress: (game: ActiveGame) => boolean;
  getSeasonEndMatchweek: (matchweek: number) => number;
  scheduleNpcAuctionBids: (game: ActiveGame, playerId: number) => void;
  scheduleNpcCounterBid: (game: ActiveGame, playerId: number, npcTeamId: number) => void;
}

export function createAuctionHelpers(deps: AuctionDeps) {
  const {
    io,
    isMatchInProgress,
    getSeasonEndMatchweek,
    scheduleNpcAuctionBids,
    scheduleNpcCounterBid,
  } = deps;

  const refreshMarket = (game: ActiveGame, emitToRoom = true) => {
    game.db.all(
      `SELECT p.*, COALESCE(t.name, '?') as team_name, t.color_primary, t.color_secondary
     FROM players p
     LEFT JOIN teams t ON p.team_id = t.id
     WHERE p.team_id IS NOT NULL AND p.transfer_status != 'none'
     ORDER BY CASE WHEN p.transfer_status = 'auction' THEN 0 ELSE 1 END, p.transfer_price ASC, p.value ASC, p.skill DESC`,
      (err: Error | null, rows: any[]) => {
        if (!err && rows) {
          const decorated = rows.map((row) => {
            const auction = game.auctions?.[row.id] as any;
            if (!auction) return row;
            let currentHighBid = 0;
            let currentHighBidTeamId: number | null = null;
            for (const [tid, amt] of Object.entries(auction.bids || {})) {
              const b = Number(amt || 0);
              if (b > currentHighBid) {
                currentHighBid = b;
                currentHighBidTeamId = parseInt(tid, 10);
              }
            }
            return {
              ...row,
              auction_active: true,
              auction_seller_team_id: auction.sellerTeamId,
              auction_ends_at: auction.endsAt,
              auction_starting_price: auction.startingPrice,
              auction_high_bid: currentHighBid,
              auction_high_bid_team_id: currentHighBidTeamId,
            };
          });
          game.globalMarket = decorated;
          if (emitToRoom) io.to(game.roomCode).emit("marketUpdate", decorated);
        }
      },
    );
  };

  const resumeAllPausedAuctions = (game: ActiveGame) => {
    if (!game.auctions) return;
    const playerIds = Object.keys(game.auctions);
    if (playerIds.length === 0) return;

    for (const playerIdStr of playerIds) {
      const playerId = Number(playerIdStr);
      const auction = game.auctions[playerId] as any;
      if (!auction || auction.status !== "paused") continue;

      // Clear any stale timer
      if (game.auctionTimers?.[playerId]) {
        clearTimeout(game.auctionTimers[playerId] as any);
      }

      const now = Date.now();
      auction.status = "open";
      auction.endsAt = now + 120000;
      // Garantir que o contador de relicitações existe (pode estar ausente em leilões restaurados da BD)
      if (!auction.npcRelicitationCount) auction.npcRelicitationCount = {};

      if (!game.auctionTimers) game.auctionTimers = {};
      game.auctionTimers[playerId] = setTimeout(() => {
        finalizeAuction(game, playerId);
      }, 120000);

      // Recalculate current high bid
      let currentHighBid = 0;
      let currentHighBidTeamId: number | null = null;
      for (const [tid, amt] of Object.entries(auction.bids || {})) {
        const b = Number(amt || 0);
        if (b > currentHighBid) {
          currentHighBid = b;
          currentHighBidTeamId = parseInt(tid, 10);
        }
      }

      io.to(game.roomCode).emit("auctionResumed", {
        playerId,
        endsAt: auction.endsAt,
        currentHighBid,
        currentHighBidTeamId,
      });

      scheduleNpcAuctionBids(game, playerId);
    }
  };

  const emitSquadForPlayer = (game: ActiveGame, teamId: number) => {
    const player = (Object.values(game.playersByName) as PlayerSession[]).find(
      (p) => p.teamId === teamId && p.socketId,
    );
    if (!player) return;
    game.db.all(
      "SELECT * FROM players WHERE team_id = ?",
      [teamId],
      (err: Error | null, squad: any[]) => {
        if (!err)
          io.to(player.socketId as string).emit(
            "mySquad",
            withJuniorGRs(squad || [], teamId, game.matchweek || 1),
          );
      },
    );
  };

  const finalizeAuction = (game: ActiveGame, playerId: number) => {
    if (!game.auctions || !game.auctions[playerId]) return;
    const auction = game.auctions[playerId] as any;
    const timer = game.auctionTimers?.[playerId];
    if (timer) clearTimeout(timer as any);

    const bidEntries = Object.entries(auction.bids || {});
    let winnerTeamId: number | null = null;
    let winnerBid = 0;
    for (const [teamId, amount] of bidEntries) {
      const bid = Number(amount || 0);
      if (bid > winnerBid || (bid === winnerBid && Math.random() < 0.5)) {
        winnerBid = bid;
        winnerTeamId = parseInt(teamId, 10);
      }
    }

    game.db.get(
      "SELECT p.*, COALESCE(t.name, '?') as team_name FROM players p LEFT JOIN teams t ON p.team_id = t.id WHERE p.id = ?",
      [playerId],
      (err: Error | null, player: any) => {
        if (err || !player) {
          delete game.auctions![playerId];
          delete game.auctionTimers?.[playerId];
          refreshMarket(game);
          return;
        }

        if (!winnerTeamId) {
          const currentMw = game.matchweek || 0;
          game.db.run(
            "UPDATE players SET transfer_status = 'none', transfer_price = 0, last_auctioned_matchweek = ? WHERE id = ?",
            [currentMw, playerId],
            () => {
              const seller = (
                Object.values(game.playersByName) as PlayerSession[]
              ).find((p) => p.teamId === auction.sellerTeamId && p.socketId);
              if (seller) {
                io.to(seller.socketId as string).emit(
                  "systemMessage",
                  `${player.name} não recebeu lances e saiu do leilão.`,
                );
              }

              // Log club news for failed auction
              logClubNews(
                game,
                "auction_failed",
                `${player.name} não vendido em leilão`,
                auction.sellerTeamId,
                {
                  player_name: player.name,
                  player_id: playerId,
                  description: "Nenhum lance recebido",
                },
                io,
                { isAuction: true },
              );

              delete game.auctions![playerId];
              delete game.auctionTimers?.[playerId];
              refreshMarket(game);
              io.to(game.roomCode).emit("auctionClosed", {
                playerId,
                playerName: player.name,
                sold: false,
              });
            },
          );
          return;
        }

        const buyerTeamId = winnerTeamId;
        const finalBid = winnerBid;

        const currentSeason = Math.ceil(Math.max(1, game.matchweek) / 14);
        if (player.signed_season === currentSeason) {
          game.db.run(
            "UPDATE players SET transfer_status = 'none', transfer_price = 0, last_auctioned_matchweek = ? WHERE id = ?",
            [game.matchweek || 0, playerId],
            () => {
              const seller = (
                Object.values(game.playersByName) as PlayerSession[]
              ).find((p) => p.teamId === auction.sellerTeamId && p.socketId);
              if (seller) {
                io.to(seller.socketId as string).emit(
                  "systemMessage",
                  `${player.name} não foi vendido em leilão — já transferido nesta época.`,
                );
              }
              delete game.auctions![playerId];
              delete game.auctionTimers?.[playerId];
              refreshMarket(game);
              io.to(game.roomCode).emit("auctionClosed", {
                playerId,
                playerName: player.name,
                sold: false,
              });
            },
          );
          return;
        }

        game.db.get(
          "SELECT name FROM teams WHERE id = ?",
          [buyerTeamId],
          (errT: Error | null, buyerTeam: any) => {
            const buyerTeamName = buyerTeam ? buyerTeam.name : "?";

            game.db.run(
              "UPDATE teams SET budget = budget + ? WHERE id = ?",
              [finalBid, auction.sellerTeamId],
              () => {
                game.db.run(
                  "UPDATE teams SET budget = budget - ? WHERE id = ?",
                  [finalBid, buyerTeamId],
                  () => {
                    game.db.run(
                      "UPDATE players SET team_id = ?, wage = ?, contract_until_matchweek = ?, signed_season = ?, joined_matchweek = ?, transfer_cooldown_until_matchweek = ?, transfer_status = 'none', transfer_price = 0, contract_request_pending = 0, contract_requested_wage = 0 WHERE id = ?",
                      [
                        buyerTeamId,
                        (() => {
                          const resFactor = 0.9 + ((player.resistance || 3) / 5) * 0.2;
                          const formFactor = (player.form || 90) / 90;
                          const starFactor = player.is_star ? 1.2 : 1;
                          const adjustedSkillWage = Math.round((player.skill || 0) * 300 * resFactor * formFactor * starFactor);
                          return Math.max(player.wage || 0, adjustedSkillWage);
                        })(),
                        getSeasonEndMatchweek(game.matchweek),
                        Math.ceil(Math.max(1, game.matchweek) / 14),
                        game.matchweek,
                        game.matchweek,
                        playerId,
                      ],
                      () => {
                        const buyerCoach = (
                          Object.values(game.playersByName) as PlayerSession[]
                        ).find((p) => p.teamId === buyerTeamId && p.socketId);
                        const sellerCoach = (
                          Object.values(game.playersByName) as PlayerSession[]
                        ).find(
                          (p) =>
                            p.teamId === auction.sellerTeamId && p.socketId,
                        );
                        if (buyerCoach) {
                          io.to(buyerCoach.socketId as string).emit(
                            "systemMessage",
                            `Ganhaste o leilão de ${player.name} por €${finalBid}!`,
                          );
                        }
                        if (sellerCoach) {
                          io.to(sellerCoach.socketId as string).emit(
                            "systemMessage",
                            `${player.name} foi vendido em leilão por €${finalBid}.`,
                          );
                        }

                        // Log club news for buyer (transfer_in)
                        logClubNews(
                          game,
                          "transfer_in",
                          `${player.name} contratado em leilão`,
                          buyerTeamId,
                          {
                            player_name: player.name,
                            player_id: playerId,
                            related_team_name: player.team_name,
                            related_team_id: auction.sellerTeamId,
                            amount: finalBid,
                          },
                          io,
                          { isAuction: true },
                        );

                        // Log club news for seller (transfer_out)
                        logClubNews(
                          game,
                          "transfer_out",
                          `${player.name} vendido em leilão`,
                          auction.sellerTeamId,
                          {
                            player_name: player.name,
                            player_id: playerId,
                            related_team_name: buyerTeamName,
                            related_team_id: buyerTeamId,
                            amount: finalBid,
                          },
                          io,
                          { isAuction: true },
                        );

                        delete game.auctions?.[playerId];
                        delete game.auctionTimers?.[playerId];
                        refreshMarket(game);
                        game.db.all(
                          "SELECT * FROM teams",
                          (errTeams: Error | null, teams: any[]) => {
                            if (!errTeams)
                              io.to(game.roomCode).emit("teamsData", teams);
                            emitSquadForPlayer(game, buyerTeamId);
                            if (auction.sellerTeamId !== buyerTeamId) {
                              emitSquadForPlayer(game, auction.sellerTeamId);
                            }
                            io.to(game.roomCode).emit("auctionClosed", {
                              playerId,
                              playerName: player.name,
                              sold: true,
                              buyerTeamId,
                              buyerTeamName,
                              finalBid,
                            });
                          },
                        );
                      },
                    );
                  },
                );
              },
            );
          },
        );
      },
    );
  };

  const startAuction = (
    game: ActiveGame,
    player: any,
    startingPrice: number,
    callback?: (...args: any[]) => void,
  ) => {
    const now = Date.now();
    const actualDurationMs = 120000;

    const existingTimer = game.auctionTimers?.[player.id];
    if (existingTimer) clearTimeout(existingTimer as any);

    const currentMw = game.matchweek || 0;
    game.db.run(
      "UPDATE players SET transfer_status = 'auction', transfer_price = ?, last_auctioned_matchweek = ? WHERE id = ?",
      [startingPrice, currentMw, player.id],
      () => {
        if (!game.auctions) game.auctions = {};
        if (!game.auctionTimers) game.auctionTimers = {};
        game.auctions[player.id] = {
          playerId: player.id,
          sellerTeamId: player.team_id,
          startingPrice,
          bids: {},
          npcRelicitationCount: {},
          endsAt: now + actualDurationMs,
          status: "open",
        };

        game.auctionTimers[player.id] = setTimeout(() => {
          finalizeAuction(game, player.id);
        }, actualDurationMs);

        refreshMarket(game);
        io.to(game.roomCode).emit("auctionStarted", {
          playerId: player.id,
          name: player.name,
          team_name: player.team_name || null,
          sellerTeamId: player.team_id,
          position: player.position,
          skill: player.skill,
          value: player.value,
          wage: player.wage,
          nationality: player.nationality,
          goals: player.goals || 0,
          red_cards: player.red_cards || 0,
          injuries: player.injuries || 0,
          games_played: player.games_played || 0,
          aggressiveness: player.aggressiveness ?? 3,
          is_star: player.is_star || 0,
          startingPrice,
          endsAt: now + actualDurationMs,
          currentHighBid: 0,
          currentHighBidTeamId: null,
        });

        scheduleNpcAuctionBids(game, player.id);
        if (callback) callback(true, startingPrice, player);
      },
    );
  };

  const listPlayerOnMarket = (
    game: ActiveGame,
    playerId: number,
    mode: string,
    price: number,
    callback?: (...args: any[]) => void,
  ) => {
    if (mode === "auction" && isMatchInProgress(game)) {
      if (!game.pendingAuctionQueue) game.pendingAuctionQueue = [];
      game.pendingAuctionQueue.push({ playerId, mode, price, callback });
      return;
    }

    game.db.get(
      "SELECT p.*, COALESCE(t.name, '?') as team_name FROM players p LEFT JOIN teams t ON p.team_id = t.id WHERE p.id = ?",
      [playerId],
      (err: Error | null, player: any) => {
        if (err || !player) {
          if (callback) callback(false, "Jogador inválido.");
          return;
        }
        if (!player.team_id) {
          if (callback) callback(false, "Jogador já está sem contrato.");
          return;
        }
        if (mode === "auction") {
          const currentMw = game.matchweek || 0;
          if (
            (player.last_auctioned_matchweek || 0) >= currentMw &&
            currentMw > 0
          ) {
            if (callback)
              callback(
                false,
                "Este jogador já foi a leilão nesta jornada. Aguarda a próxima jornada.",
              );
            return;
          }
        }
        const finalPrice = Math.max(
          0,
          Math.round(price || player.value * (mode === "auction" ? 0.75 : 1.0)),
        );
        if (mode === "auction") {
          startAuction(game, player, finalPrice, () => {
            if (callback) callback(true, finalPrice, player);
          });
        } else {
          game.db.run(
            "UPDATE players SET transfer_status = ?, transfer_price = ? WHERE id = ?",
            [mode, finalPrice, playerId],
            () => {
              refreshMarket(game);
              if (callback) callback(true, finalPrice, player);
            },
          );
        }
      },
    );
  };

  const placeAuctionBid = (
    game: ActiveGame,
    teamId: number,
    playerId: number,
    bidAmount: number,
  ): Promise<any> => {
    if (!game.auctions || !game.auctions[playerId]) {
      return Promise.resolve({ ok: false, error: "Leilão indisponível." });
    }
    const auction = game.auctions[playerId] as any;
    if (auction.status === "paused") {
      return Promise.resolve({ ok: false, error: "Leilão temporariamente pausado durante o jogo." });
    }
    if (auction.status !== "open") {
      return Promise.resolve({ ok: false, error: "Leilão já encerrado." });
    }
    if (auction.sellerTeamId === teamId) {
      return Promise.resolve({
        ok: false,
        error: "Não podes licitar no teu próprio jogador.",
      });
    }

    // Calculate current high bid
    let currentHighBid = 0;
    let currentHighBidTeamId: number | null = null;
    for (const [tid, amount] of Object.entries(auction.bids || {})) {
      const bid = Number(amount || 0);
      if (bid > currentHighBid) {
        currentHighBid = bid;
        currentHighBidTeamId = parseInt(tid, 10);
      }
    }

    // Leader cannot rebid
    if (currentHighBidTeamId === teamId) {
      return Promise.resolve({
        ok: false,
        error: "Já és o maior licitador deste leilão.",
      });
    }

    const amount = Math.round(bidAmount || 0);
    const minBid = currentHighBid > 0
      ? currentHighBid + 50000
      : auction.startingPrice;

    if (amount < minBid) {
      return Promise.resolve({
        ok: false,
        error: `Lance mínimo: €${minBid}.`,
      });
    }

    return new Promise((resolve) => {
      game.db.get(
        "SELECT budget FROM teams WHERE id = ?",
        [teamId],
        (err: Error | null, team: any) => {
          if (err || !team || team.budget < amount) {
            resolve({ ok: false, error: "Não tens orçamento suficiente." });
            return;
          }
          // Guardar quem liderava ANTES deste lance (pode ser NPC)
          const prevLeaderTeamId = currentHighBidTeamId;

          auction.bids[teamId] = amount;

          // Recalculate high bid after placing
          let newHighBid = 0;
          let newHighBidTeamId: number | null = null;
          for (const [tid, amt] of Object.entries(auction.bids || {})) {
            const b = Number(amt || 0);
            if (b > newHighBid) {
              newHighBid = b;
              newHighBidTeamId = parseInt(tid, 10);
            }
          }

          io.to(game.roomCode).emit("auctionBidPlaced", {
            playerId,
            currentHighBid: newHighBid,
            currentHighBidTeamId: newHighBidTeamId,
          });

          const humanTeamIds = new Set(
            Object.values(game.playersByName).map((p) => p.teamId).filter(Boolean),
          );

          // Se o líder anterior era um NPC e agora perdeu a liderança,
          // dar-lhe oportunidade de relicitar (máx 1 vez por leilão)
          if (
            prevLeaderTeamId !== null &&
            prevLeaderTeamId !== newHighBidTeamId &&
            !humanTeamIds.has(prevLeaderTeamId)
          ) {
            scheduleNpcCounterBid(game, playerId, prevLeaderTeamId);
          }

          // NPCs que ainda não licitaram neste leilão têm oportunidade de reagir
          // ao novo lance (o guard interno evita duplicados)
          scheduleNpcAuctionBids(game, playerId);

          resolve({ ok: true, bidAmount: amount });
        },
      );
    });
  };

  return {
    refreshMarket,
    emitSquadForPlayer,
    listPlayerOnMarket,
    startAuction,
    finalizeAuction,
    placeAuctionBid,
    resumeAllPausedAuctions,
  };
}
