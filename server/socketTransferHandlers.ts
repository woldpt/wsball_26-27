import type { ActiveGame, PlayerSession } from "./types";
import {
  logClubNews,
  runExec,
  runGet,
  runAll,
  validatePositiveInt,
} from "./coreHelpers";
import { withJuniorGRs } from "./game/engine";

interface TransferHandlerDeps {
  io: any;
  getGameBySocket: (socketId: string) => ActiveGame | null;
  getPlayerBySocket: (
    game: ActiveGame,
    socketId: string,
  ) => PlayerSession | null;
  getSeasonEndMatchweek: (matchweek: number) => number;
  isMatchInProgress: (game: ActiveGame) => boolean;
  refreshMarket: (game: ActiveGame, emitToRoom?: boolean) => void;
  emitSquadForPlayer: (game: ActiveGame, teamId: number) => void;
  listPlayerOnMarket: (
    game: ActiveGame,
    playerId: number,
    mode: string,
    price: number,
    callback?: (...args: any[]) => void,
  ) => void;
  startAuction: (
    game: ActiveGame,
    player: any,
    startingPrice: number,
    callback?: (...args: any[]) => void,
  ) => void;
  placeAuctionBid: (
    game: ActiveGame,
    teamId: number,
    playerId: number,
    bidAmount: number,
  ) => Promise<any>;
  finalizeAuction: (game: ActiveGame, playerId: number) => void;
}

export function registerTransferSocketHandlers(
  socket: any,
  deps: TransferHandlerDeps,
) {
  const {
    io,
    getGameBySocket,
    getPlayerBySocket,
    getSeasonEndMatchweek,
    isMatchInProgress,
    refreshMarket,
    emitSquadForPlayer,
    listPlayerOnMarket,
    startAuction,
    placeAuctionBid,
    finalizeAuction,
  } = deps;

  socket.on("buyPlayer", async (playerId) => {
    const game = getGameBySocket(socket.id);
    if (!game) return;
    const playerState = getPlayerBySocket(game, socket.id);
    if (!playerState) return;

    if (isMatchInProgress(game)) {
      socket.emit("systemMessage", "Não é possível contratar jogadores durante uma partida.");
      return;
    }

    const validPlayerId = validatePositiveInt(playerId);
    if (!validPlayerId) return;

    try {
      const player = await runGet<any>(
        game.db,
        "SELECT * FROM players WHERE id = ?",
        [validPlayerId],
      );
      if (!player) return;

      const currentSeason = Math.ceil(Math.max(1, game.matchweek) / 14);
      if (player.signed_season === currentSeason) {
        socket.emit("systemMessage", "Este jogador já foi transferido nesta época.");
        return;
      }

      const team = await runGet<any>(
        game.db,
        "SELECT budget FROM teams WHERE id = ?",
        [playerState.teamId],
      );
      if (!team) return;

      const listedPrice =
        player.transfer_status && player.transfer_status !== "none"
          ? player.transfer_price || Math.round(player.value * 0.8)
          : Math.round(player.value * 1.2);
      const price = listedPrice;

      if (team.budget < price) {
        socket.emit("systemMessage", "Não tens fundo de maneio suficiente!");
        return;
      }

      await runExec(game.db, "BEGIN");
      try {
        await runExec(
          game.db,
          "UPDATE teams SET budget = budget - ? WHERE id = ?",
          [price, playerState.teamId],
        );
        if (player.team_id && player.team_id !== playerState.teamId) {
          await runExec(
            game.db,
            "UPDATE teams SET budget = budget + ? WHERE id = ?",
            [price, player.team_id],
          );
        }
        await runExec(
          game.db,
          "UPDATE players SET team_id = ?, contract_until_matchweek = ?, signed_season = ?, joined_matchweek = ?, transfer_cooldown_until_matchweek = ?, transfer_status = 'none', transfer_price = 0, contract_request_pending = 0, contract_requested_wage = 0 WHERE id = ?",
          [
            playerState.teamId,
            getSeasonEndMatchweek(game.matchweek),
            Math.ceil(Math.max(1, game.matchweek) / 14),
            game.matchweek,
            game.matchweek,
            validPlayerId,
          ],
        );
        await runExec(game.db, "COMMIT");
      } catch (txErr) {
        await runExec(game.db, "ROLLBACK").catch(() => {});
        throw txErr;
      }

      // Log transfer news (outside transaction — non-critical)
      const buyingTeam = await runGet<any>(
        game.db,
        "SELECT name FROM teams WHERE id = ?",
        [playerState.teamId],
      );
      logClubNews(
        game,
        "transfer_in",
        `${player.name} contratado (Listagem)`,
        playerState.teamId,
        {
          player_name: player.name,
          player_id: validPlayerId,
          related_team_id: player.team_id,
          related_team_name: player.team_name,
          amount: price,
          description: `${player.name} foi contratado por €${price}.`,
        },
        io,
      );
      if (player.team_id) {
        logClubNews(
          game,
          "transfer_out",
          `${player.name} vendido (Listagem)`,
          player.team_id,
          {
            player_name: player.name,
            player_id: validPlayerId,
            related_team_id: playerState.teamId,
            related_team_name: buyingTeam?.name,
            amount: price,
            description: `${player.name} foi vendido por €${price}.`,
          },
          io,
        );
      }

      refreshMarket(game);
      const teams = await runAll(game.db, "SELECT * FROM teams");
      io.to(game.roomCode).emit("teamsData", teams);
      const squad = await runAll(
        game.db,
        "SELECT * FROM players WHERE team_id = ?",
        [playerState.teamId],
      );
      socket.emit(
        "mySquad",
        withJuniorGRs(squad, playerState.teamId as number, game.matchweek || 1),
      );
      socket.emit("systemMessage", `Contrataste ${player.name} por €${price}!`);
    } catch (err) {
      console.error("[buyPlayer] Error:", err);
      socket.emit("systemMessage", "Erro ao processar compra.");
    }
  });

  socket.on(
    "listPlayerForTransfer",
    ({ playerId, mode, price, startingPrice }) => {
      const game = getGameBySocket(socket.id);
      if (!game) return;
      const playerState = getPlayerBySocket(game, socket.id);
      if (!playerState) return;

      const validPlayerId = validatePositiveInt(playerId);
      if (!validPlayerId) return;

      const finalMode = mode === "auction" ? "auction" : "fixed";
      if (isMatchInProgress(game)) {
        socket.emit(
          "systemMessage",
          "Não é possível listar jogadores durante uma partida.",
        );
        return;
      }

      game.db.get(
        "SELECT p.*, t.name as team_name FROM players p LEFT JOIN teams t ON p.team_id = t.id WHERE p.id = ? AND p.team_id = ?",
        [playerId, playerState.teamId],
        (err, player) => {
          if (!player) return;
          const currentSeason = Math.ceil(Math.max(1, game.matchweek) / 14);
          if (player.signed_season === currentSeason) {
            socket.emit(
              "systemMessage",
              "Este jogador já foi transferido nesta época — não pode ser listado.",
            );
            return;
          }
          const finalPrice = Math.max(
            0,
            Math.round(
              startingPrice ||
                price ||
                player.value * (finalMode === "auction" ? 0.75 : 1.0),
            ),
          );

          if (finalMode === "auction") {
            const currentMw = game.matchweek || 0;
            if (
              (player.last_auctioned_matchweek || 0) >= currentMw &&
              currentMw > 0
            ) {
              socket.emit(
                "systemMessage",
                "Este jogador já foi a leilão nesta jornada. Aguarda a próxima jornada.",
              );
              return;
            }
            startAuction(game, player, finalPrice, () => {
              emitSquadForPlayer(game, playerState.teamId);
              socket.emit(
                "systemMessage",
                `${player.name} colocado em leilão por €${finalPrice}.`,
              );
            });
          } else {
            game.db.run(
              "UPDATE players SET transfer_status = ?, transfer_price = ? WHERE id = ?",
              [finalMode, finalPrice, playerId],
              (runErr: Error | null) => {
                if (runErr) {
                  console.error("[listPlayerForTransfer] Error:", runErr);
                  socket.emit("systemMessage", "Erro ao listar jogador.");
                  return;
                }
                refreshMarket(game);
                emitSquadForPlayer(game, playerState.teamId);
                socket.emit(
                  "systemMessage",
                  `${player.name} colocado na lista por €${finalPrice}.`,
                );
              },
            );
          }
        },
      );
    },
  );

  socket.on("removeFromTransferList", (playerId) => {
    const game = getGameBySocket(socket.id);
    if (!game) return;
    const playerState = getPlayerBySocket(game, socket.id);
    if (!playerState) return;

    game.db.run(
      "UPDATE players SET transfer_status = 'none', transfer_price = 0 WHERE id = ? AND team_id = ? AND transfer_status = 'fixed'",
      [playerId, playerState.teamId],
      function (this: any, runErr: Error | null) {
        if (runErr) {
          console.error("[removeFromTransferList] Error:", runErr);
          socket.emit("systemMessage", "Erro ao retirar jogador da lista.");
          return;
        }
        if (this.changes > 0) {
          refreshMarket(game);
          emitSquadForPlayer(game, playerState.teamId);
          socket.emit(
            "systemMessage",
            "Jogador retirado da lista de transferências.",
          );
        }
      },
    );
  });

  socket.on("renewContract", ({ playerId, offeredWage }) => {
    const game = getGameBySocket(socket.id);
    if (!game) return;
    const playerState = getPlayerBySocket(game, socket.id);
    if (!playerState) return;

    game.db.get(
      "SELECT * FROM players WHERE id = ? AND team_id = ?",
      [playerId, playerState.teamId],
      (err, player) => {
        if (err || !player) return;

        const value = player.value || (player.skill || 0) * 20000;
        const fairWage = Math.round(Math.pow(value, 0.62) / 2.5);
        const demandedWage = Math.max(
          fairWage,
          Math.round((player.wage || 0) * 1.05),
        );
        const acceptedWage = Math.max(0, Math.round(offeredWage || 0));
        const seasonEnd = getSeasonEndMatchweek(game.matchweek);

        if (acceptedWage >= demandedWage) {
          game.db.run(
            "UPDATE players SET wage = ?, contract_until_matchweek = ?, joined_matchweek = ?, contract_request_pending = 0, contract_requested_wage = 0, transfer_status = 'none', transfer_price = 0 WHERE id = ?",
            [acceptedWage, seasonEnd, game.matchweek, playerId],
            (runErr: Error | null) => {
              if (runErr) {
                console.error("[renewContract] Error:", runErr);
                socket.emit("systemMessage", "Erro ao renovar contrato.");
                return;
              }
              refreshMarket(game);
              emitSquadForPlayer(game, playerState.teamId);
              socket.emit(
                "systemMessage",
                `${player.name} renovou até ao fim da época por €${acceptedWage}/sem.`,
              );
            },
          );
        } else {
          // Counter-offer: inform manager of demanded wage before going to auction
          if (!game.pendingRenewalCounterOffers)
            game.pendingRenewalCounterOffers = {};
          // Cancel any existing timeout for this player
          const existing = game.pendingRenewalCounterOffers[playerId];
          if (existing?.timer) clearTimeout(existing.timer);

          const auctionPrice = Math.max(
            Math.round(player.value * 0.65),
            demandedWage * 12,
          );

          const sendToAuction = () => {
            delete game.pendingRenewalCounterOffers?.[playerId];
            listPlayerOnMarket(game, playerId, "auction", auctionPrice, () => {
              game.db.run(
                "UPDATE players SET contract_request_pending = 0, contract_requested_wage = 0 WHERE id = ?",
                [playerId],
                (runErr: Error | null) => {
                  if (runErr)
                    console.error("[renewContract:reject] Error:", runErr);
                  else emitSquadForPlayer(game, playerState.teamId);
                },
              );
              socket.emit(
                "systemMessage",
                `${player.name} recusou e foi para leilão.`,
              );
            });
          };

          // Store counter-offer state with 90s timeout (if coach doesn't respond, go to auction)
          const timer = setTimeout(sendToAuction, 90_000);
          game.pendingRenewalCounterOffers[playerId] = {
            demandedWage,
            teamId: playerState.teamId,
            timer,
            sendToAuction,
          };

          socket.emit("renewContractCounterOffer", {
            playerId,
            playerName: player.name,
            demandedWage,
          });
        }
      },
    );
  });

  socket.on("acceptCounterOffer", ({ playerId, accepted }) => {
    const game = getGameBySocket(socket.id);
    if (!game) return;
    const playerState = getPlayerBySocket(game, socket.id);
    if (!playerState) return;

    const pending = game.pendingRenewalCounterOffers?.[playerId];
    if (!pending || pending.teamId !== playerState.teamId) return;

    if (game.auctions?.[playerId]) {
      socket.emit("systemMessage", "Jogador já entrou em leilão — a contra-proposta expirou.");
      return;
    }

    clearTimeout(pending.timer);
    delete game.pendingRenewalCounterOffers[playerId];

    if (accepted) {
      const seasonEnd = getSeasonEndMatchweek(game.matchweek);
      game.db.get(
        "SELECT * FROM players WHERE id = ? AND team_id = ?",
        [playerId, playerState.teamId],
        (err: Error | null, player: any) => {
          if (err || !player) return;
          game.db.run(
            "UPDATE players SET wage = ?, contract_until_matchweek = ?, joined_matchweek = ?, contract_request_pending = 0, contract_requested_wage = 0, transfer_status = 'none', transfer_price = 0 WHERE id = ?",
            [pending.demandedWage, seasonEnd, game.matchweek, playerId],
            (runErr: Error | null) => {
              if (runErr) {
                console.error("[acceptCounterOffer] Error:", runErr);
                socket.emit("systemMessage", "Erro ao renovar contrato.");
                return;
              }
              refreshMarket(game);
              emitSquadForPlayer(game, playerState.teamId);
              socket.emit(
                "systemMessage",
                `${player.name} renovou até ao fim da época por €${pending.demandedWage}/sem.`,
              );
            },
          );
        },
      );
    } else {
      pending.sendToAuction();
    }
  });

  socket.on("placeAuctionBid", ({ playerId, bidAmount }) => {
    const game = getGameBySocket(socket.id);
    if (!game) return;
    const playerState = getPlayerBySocket(game, socket.id);
    if (!playerState) return;

    const validPlayerId = validatePositiveInt(playerId);
    const validBidAmount = validatePositiveInt(bidAmount);
    if (!validPlayerId || !validBidAmount) {
      socket.emit("systemMessage", "Lance inválido.");
      return;
    }

    placeAuctionBid(game, playerState.teamId, validPlayerId, validBidAmount)
      .then((result) => {
        const bidResult: any = result;
        if (!bidResult.ok) {
          socket.emit("systemMessage", bidResult.error);
        } else {
          socket.emit("auctionBidConfirmed", {
            playerId: validPlayerId,
            bidAmount: bidResult.bidAmount,
          });

          // In single-player (only 1 human), finalize the auction immediately
          // after the human bids — no need to wait for the timeout.
          const humanCount = Object.values(game.playersByName).filter(
            (p: any) => p.socketId,
          ).length;
          if (humanCount <= 1) {
            const timer = game.auctionTimers?.[validPlayerId];
            if (timer) {
              clearTimeout(timer as any);
              delete game.auctionTimers![validPlayerId];
            }
            finalizeAuction(game, validPlayerId);
          }
        }
      })
      .catch((err) => {
        console.error("[placeAuctionBid] Error:", err);
        socket.emit("systemMessage", "Erro ao processar o lance.");
      });
  });

  socket.on("makeTransferProposal", ({ playerId }) => {
    const game = getGameBySocket(socket.id);
    if (!game) return;
    const playerState = getPlayerBySocket(game, socket.id);
    if (!playerState) return;

    game.db.get(
      "SELECT * FROM players WHERE id = ?",
      [playerId],
      (err, player) => {
        if (err || !player) {
          socket.emit("transferProposalResult", {
            ok: false,
            message: "Jogador não encontrado.",
          });
          return;
        }
        const currentSeason = Math.ceil(Math.max(1, game.matchweek) / 14);
        if (player.signed_season === currentSeason) {
          socket.emit("transferProposalResult", {
            ok: false,
            message: "Este jogador já foi transferido nesta época.",
          });
          return;
        }
        if (Number(player.team_id) === Number(playerState.teamId)) {
          socket.emit("transferProposalResult", {
            ok: false,
            message: "Este jogador já pertence à tua equipa!",
          });
          return;
        }
        // Only allow proposals to teams without a connected human coach
        const targetTeamHasHuman = Object.values(game.playersByName).some(
          (p: any) => Number(p.teamId) === Number(player.team_id) && p.socketId,
        );
        if (targetTeamHasHuman) {
          socket.emit("transferProposalResult", {
            ok: false,
            message:
              "Não podes fazer propostas a equipas controladas por outros treinadores.",
          });
          return;
        }
        // Premium price: 35% above market value
        const proposalPrice = Math.round((player.value || 0) * 1.35);
        game.db.get(
          "SELECT budget FROM teams WHERE id = ?",
          [playerState.teamId],
          (err2, team) => {
            if (err2 || !team) {
              socket.emit("transferProposalResult", {
                ok: false,
                message: "Erro ao verificar orçamento.",
              });
              return;
            }
            if ((team as any).budget < proposalPrice) {
              socket.emit("transferProposalResult", {
                ok: false,
                message: `Orçamento insuficiente. São necessários €${proposalPrice.toLocaleString("pt-PT")}.`,
              });
              return;
            }
            game.db.run(
              "UPDATE teams SET budget = budget - ? WHERE id = ?",
              [proposalPrice, playerState.teamId],
              (errBudget) => {
                if (errBudget) {
                  socket.emit("transferProposalResult", {
                    ok: false,
                    message: "Erro ao processar transferência.",
                  });
                  return;
                }
                if (player.team_id) {
                  game.db.run(
                    "UPDATE teams SET budget = budget + ? WHERE id = ?",
                    [proposalPrice, player.team_id],
                    (errRefund: Error | null) => {
                      if (errRefund)
                        console.error(
                          "[makeTransferProposal:refund] Error:",
                          errRefund,
                        );
                    },
                  );
                }
                game.db.run(
                  "UPDATE players SET team_id = ?, contract_until_matchweek = ?, signed_season = ?, joined_matchweek = ?, transfer_cooldown_until_matchweek = ?, transfer_status = 'none', transfer_price = 0, contract_request_pending = 0, contract_requested_wage = 0 WHERE id = ?",
                  [
                    playerState.teamId,
                    getSeasonEndMatchweek(game.matchweek),
                    Math.ceil(Math.max(1, game.matchweek) / 14),
                    game.matchweek,
                    game.matchweek,
                    playerId,
                  ],
                  (errPlayer) => {
                    if (errPlayer) {
                      socket.emit("transferProposalResult", {
                        ok: false,
                        message: "Erro ao registar jogador.",
                      });
                      return;
                    }
                    // Log transfer news
                    game.db.get(
                      "SELECT name FROM teams WHERE id = ?",
                      [playerState.teamId],
                      (errTeam, buyingTeam) => {
                        game.db.get(
                          "SELECT name FROM teams WHERE id = ?",
                          [player.team_id],
                          (errOldTeam, oldTeam) => {
                            logClubNews(
                              game,
                              "transfer_in",
                              `${player.name} contratado por Cláusula`,
                              playerState.teamId,
                              {
                                player_name: player.name,
                                player_id: playerId,
                                related_team_id: player.team_id,
                                related_team_name: oldTeam?.name,
                                amount: proposalPrice,
                                description: `${player.name} foi contratado por cláusula de rescisão por €${proposalPrice}.`,
                              },
                              io,
                            );
                            if (player.team_id) {
                              logClubNews(
                                game,
                                "transfer_out",
                                `${player.name} vendido por Cláusula`,
                                player.team_id,
                                {
                                  player_name: player.name,
                                  player_id: playerId,
                                  related_team_id: playerState.teamId,
                                  related_team_name: buyingTeam?.name,
                                  amount: proposalPrice,
                                  description: `${player.name} foi transferido por €${proposalPrice}.`,
                                },
                                io,
                              );
                            }
                          },
                        );
                      },
                    );
                    refreshMarket(game);
                    game.db.all("SELECT * FROM teams", (_e1, teams) =>
                      io.to(game.roomCode).emit("teamsData", teams),
                    );
                    game.db.all(
                      "SELECT * FROM players WHERE team_id = ?",
                      [playerState.teamId],
                      (_e2, squad) =>
                        socket.emit(
                          "mySquad",
                          withJuniorGRs(
                            squad || [],
                            playerState.teamId as number,
                            game.matchweek || 1,
                          ),
                        ),
                    );
                    socket.emit("transferProposalResult", {
                      ok: true,
                      message: `Contrataste ${player.name} por €${proposalPrice.toLocaleString("pt-PT")}!`,
                    });
                  },
                );
              },
            );
          },
        );
      },
    );
  });
}
