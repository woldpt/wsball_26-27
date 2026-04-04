import type { ActiveGame, PlayerSession } from "./types";

interface AuctionDeps {
  io: any;
  isMatchInProgress: (game: ActiveGame) => boolean;
  getSeasonEndMatchweek: (matchweek: number) => number;
  scheduleNpcAuctionBids: (game: ActiveGame, playerId: number) => void;
}

export function createAuctionHelpers(deps: AuctionDeps) {
  const {
    io,
    isMatchInProgress,
    getSeasonEndMatchweek,
    scheduleNpcAuctionBids,
  } = deps;

  const refreshMarket = (game: ActiveGame, emitToRoom = true) => {
    game.db.all(
      `SELECT p.*, t.name as team_name, t.color_primary, t.color_secondary
     FROM players p
     LEFT JOIN teams t ON p.team_id = t.id
     WHERE p.team_id IS NULL OR p.transfer_status != 'none'
     ORDER BY CASE WHEN p.transfer_status = 'auction' THEN 0 ELSE 1 END, p.transfer_price ASC, p.value ASC, p.skill DESC`,
      (err: Error | null, rows: any[]) => {
        if (!err && rows) {
          const decorated = rows.map((row) => {
            const auction = game.auctions?.[row.id] as any;
            return auction
              ? {
                  ...row,
                  auction_active: true,
                  auction_seller_team_id: auction.sellerTeamId,
                  auction_ends_at: auction.endsAt,
                  auction_starting_price: auction.startingPrice,
                }
              : row;
          });
          game.globalMarket = decorated;
          if (emitToRoom) io.to(game.roomCode).emit("marketUpdate", decorated);
        }
      },
    );
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
        if (!err) io.to(player.socketId as string).emit("mySquad", squad || []);
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
      "SELECT p.*, t.name as team_name FROM players p LEFT JOIN teams t ON p.team_id = t.id WHERE p.id = ?",
      [playerId],
      (err: Error | null, player: any) => {
        if (err || !player) {
          delete game.auctions![playerId];
          delete game.auctionTimers?.[playerId];
          refreshMarket(game);
          return;
        }

        if (!winnerTeamId) {
          game.db.run(
            "UPDATE players SET transfer_status = 'none', transfer_price = 0 WHERE id = ?",
            [playerId],
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
                      "UPDATE players SET team_id = ?, wage = ?, contract_until_matchweek = ?, signed_season = ?, transfer_status = 'none', transfer_price = 0, contract_request_pending = 0, contract_requested_wage = 0 WHERE id = ?",
                      [
                        buyerTeamId,
                        Math.max(player.wage || 0, Math.round(finalBid * 0.06)),
                        getSeasonEndMatchweek(game.matchweek),
                        Math.ceil(Math.max(1, game.matchweek) / 14),
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
    const durationMs = 15000;
    const now = Date.now();
    const existingTimer = game.auctionTimers?.[player.id];
    if (existingTimer) clearTimeout(existingTimer as any);

    game.db.run(
      "UPDATE players SET transfer_status = 'auction', transfer_price = ? WHERE id = ?",
      [startingPrice, player.id],
      () => {
        if (!game.auctions) game.auctions = {};
        if (!game.auctionTimers) game.auctionTimers = {};
        game.auctions[player.id] = {
          playerId: player.id,
          sellerTeamId: player.team_id,
          startingPrice,
          bids: {},
          endsAt: now + durationMs,
          status: "open",
        };

        game.auctionTimers[player.id] = setTimeout(() => {
          finalizeAuction(game, player.id);
        }, durationMs);

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
          endsAt: now + durationMs,
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
      "SELECT p.*, t.name as team_name FROM players p LEFT JOIN teams t ON p.team_id = t.id WHERE p.id = ?",
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
    if (auction.status !== "open") {
      return Promise.resolve({ ok: false, error: "Leilão já encerrado." });
    }
    if (auction.sellerTeamId === teamId) {
      return Promise.resolve({
        ok: false,
        error: "Não podes licitar no teu próprio jogador.",
      });
    }
    if (auction.bids[teamId] != null) {
      return Promise.resolve({
        ok: false,
        error: "Já licitaste neste leilão.",
      });
    }

    const amount = Math.round(bidAmount || 0);
    if (amount < auction.startingPrice) {
      return Promise.resolve({
        ok: false,
        error: `Lance mínimo: €${auction.startingPrice}.`,
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
          auction.bids[teamId] = amount;
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
  };
}
