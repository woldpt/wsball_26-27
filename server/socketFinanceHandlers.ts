import type { ActiveGame, PlayerSession } from "./types";

interface FinanceHandlerDeps {
  io: any;
  getGameBySocket: (socketId: string) => ActiveGame | null;
  getPlayerBySocket: (
    game: ActiveGame,
    socketId: string,
  ) => PlayerSession | null;
}

export function registerFinanceSocketHandlers(
  socket: any,
  deps: FinanceHandlerDeps,
) {
  const { io, getGameBySocket, getPlayerBySocket } = deps;

  socket.on("buildStadium", () => {
    const game = getGameBySocket(socket.id);
    if (!game) return;
    const playerState = getPlayerBySocket(game, socket.id);
    if (!playerState) return;

    game.db.get(
      "SELECT budget, stadium_capacity FROM teams WHERE id = ?",
      [playerState.teamId],
      (err, team) => {
        const cost = 300000;
        const maxCapacity = 120000;
        if (team && team.stadium_capacity >= maxCapacity) {
          socket.emit(
            "systemMessage",
            "Capacidade máxima atingida (120.000 lugares)!",
          );
          return;
        }
        if (team && team.budget >= cost) {
          game.db.run(
            "UPDATE teams SET budget = budget - ?, stadium_capacity = MIN(stadium_capacity + 5000, ?) WHERE id = ?",
            [cost, maxCapacity, playerState.teamId],
            () => {
              // Registar obra nas notícias do clube
              const matchweek = game.matchweek || 1;
              game.db.run(
                "INSERT INTO club_news (team_id, type, title, description, amount, matchweek) VALUES (?, 'stadium_build', 'Expansão do Estádio', '+5000 lugares construídos', ?, ?)",
                [playerState.teamId, cost, matchweek],
              );
              // Emitir teamsData para toda a sala (actualiza budget e capacity)
              game.db.all("SELECT * FROM teams", (err2, teams) => {
                io.to(game.roomCode).emit("teamsData", teams);
              });
              // Emitir evento dedicado para ticker e refresh de finanças
              const updatedTeam = (data: any) => {
                io.to(game.roomCode).emit("stadiumBuilt", {
                  teamId: playerState.teamId,
                  teamName: data?.name || "",
                  newCapacity: (team.stadium_capacity || 10000) + 5000,
                });
              };
              game.db.get(
                "SELECT name FROM teams WHERE id = ?",
                [playerState.teamId],
                (_e: any, row: any) => updatedTeam(row),
              );
              socket.emit("systemMessage", "+5000 Lugares Construídos!");
            },
          );
        } else {
          socket.emit("systemMessage", "Sem dinheiro (Custo: 300.000€)!");
        }
      },
    );
  });

  socket.on("takeLoan", () => {
    const game = getGameBySocket(socket.id);
    if (!game) return;
    const playerState = getPlayerBySocket(game, socket.id);
    if (!playerState) return;

    game.db.get(
      "SELECT budget, loan_amount FROM teams WHERE id = ?",
      [playerState.teamId],
      (err, team) => {
        if (!team) return;
        if (team.loan_amount >= 2500000) {
          socket.emit(
            "systemMessage",
            "Já tens demasiada dívida (máx: 2.500.000€ — 5 empréstimos)!",
          );
          return;
        }
        game.db.run(
          "UPDATE teams SET budget = budget + 500000, loan_amount = loan_amount + 500000 WHERE id = ?",
          [playerState.teamId],
          () => {
            game.db.all("SELECT * FROM teams", (err2, teams) =>
              io.to(game.roomCode).emit("teamsData", teams),
            );
            socket.emit(
              "systemMessage",
              "Empréstimo de 500.000€ aprovado (Juro 1,5%/Semana).",
            );
          },
        );
      },
    );
  });

  socket.on("payLoan", () => {
    const game = getGameBySocket(socket.id);
    if (!game) return;
    const playerState = getPlayerBySocket(game, socket.id);
    if (!playerState) return;

    game.db.get(
      "SELECT budget, loan_amount FROM teams WHERE id = ?",
      [playerState.teamId],
      (err, team) => {
        if (team && team.loan_amount >= 500000 && team.budget >= 500000) {
          game.db.run(
            "UPDATE teams SET budget = budget - 500000, loan_amount = loan_amount - 500000 WHERE id = ?",
            [playerState.teamId],
            () => {
              game.db.all("SELECT * FROM teams", (err2, teams) =>
                io.to(game.roomCode).emit("teamsData", teams),
              );
              socket.emit("systemMessage", "Dívida paga (500.000€) ao Banco.");
            },
          );
        } else {
          socket.emit(
            "systemMessage",
            "Não deves esse valor, ou não tens 500k disponíveis.",
          );
        }
      },
    );
  });
}
