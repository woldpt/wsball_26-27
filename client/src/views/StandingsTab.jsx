import { LeagueStandings } from "../components/ui/LeagueStandings.jsx";

export function StandingsTab({
  teams,
  teamForms,
  topScorers,
  myTeamId,
  completedJornada,
  matchweekCount,
  palmares,
  onTeamClick,
  players,
}) {
  return (
    <LeagueStandings
      teams={teams}
      teamForms={teamForms}
      topScorers={topScorers}
      myTeamId={myTeamId}
      completedJornada={completedJornada}
      matchweekCount={matchweekCount}
      palmares={palmares}
      onTeamClick={onTeamClick}
      players={players}
    />
  );
}
