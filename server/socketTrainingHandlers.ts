import type { ActiveGame } from "./types";

interface TrainingHandlersDeps {
  io: any;
}

export function createTrainingHandlers(deps: TrainingHandlersDeps) {
  const { io } = deps;

  /**
   * Save the team's training focus for the upcoming calendar event.
   * Calls `done` only after the DB write completes (so the client gets a real ack).
   */
  function setTrainingFocus(
    game: ActiveGame,
    playerId: string,
    trainingFocus: string,
    done?: (err?: Error) => void,
  ) {
    const player = game.playersByName[playerId];
    if (!player || player.teamId == null) {
      if (done) done(new Error("no team"));
      return;
    }
    const calendarIndex = game.calendarIndex;
    game.db.run(
      "INSERT OR REPLACE INTO team_training (team_id, matchweek, training_focus, applied) VALUES (?, ?, ?, 0)",
      [player.teamId, calendarIndex, trainingFocus],
      (err: any) => {
        if (err) {
          console.error(`[${game.roomCode}] training: failed to save focus:`, err);
          if (done) done(err);
          return;
        }
        io.to(game.roomCode).emit("trainingFocusUpdated", {
          teamId: player.teamId,
          trainingFocus,
          calendarIndex,
        });
        if (done) done();
      },
    );
  }

  function getTrainingFocus(game: ActiveGame, teamId: number): Promise<string | null> {
    return new Promise((resolve) => {
      game.db.get(
        "SELECT training_focus FROM team_training WHERE team_id = ? AND matchweek = ? AND applied = 0",
        [teamId, game.calendarIndex],
        (err: any, row: any) => {
          if (err) {
            console.error(`[${game.roomCode}] training: failed to get focus:`, err);
            resolve(null);
            return;
          }
          resolve(row ? row.training_focus : null);
        },
      );
    });
  }

  /**
   * Returns the most recent training history rows.
   * If `calendarIndex` is omitted/null, picks the latest matchweek with any rows for the team.
   */
  function getTrainingHistory(
    game: ActiveGame,
    teamId: number,
    calendarIndex: number | null,
  ): Promise<any[]> {
    return new Promise((resolve) => {
      const finish = (cIdx: number) => {
        game.db.all(
          `SELECT
             p.id AS player_id,
             p.name AS player_name,
             p.position,
             tph.attribute,
             tph.old_value,
             tph.new_value,
             tph.delta,
             tph.focus,
             tph.matchweek AS calendar_index
           FROM training_player_history tph
           JOIN players p ON p.id = tph.player_id
           WHERE tph.team_id = ? AND tph.matchweek = ?
           ORDER BY p.position, p.name`,
          [teamId, cIdx],
          (err: any, rows: any[]) => {
            if (err) {
              console.error(`[${game.roomCode}] training: history query failed:`, err);
              resolve([]);
              return;
            }
            resolve(rows || []);
          },
        );
      };

      if (calendarIndex != null) {
        finish(calendarIndex);
        return;
      }

      game.db.get(
        "SELECT MAX(matchweek) AS mw FROM training_player_history WHERE team_id = ?",
        [teamId],
        (err: any, row: any) => {
          if (err || !row || row.mw == null) {
            resolve([]);
            return;
          }
          finish(row.mw);
        },
      );
    });
  }

  return {
    setTrainingFocus,
    getTrainingFocus,
    getTrainingHistory,
  };
}
