import { TrainingPage } from "../components/ui/TrainingPage.jsx";

export function TrainingTab({ me, players, matchweekCount }) {
  return <TrainingPage me={me} players={players} matchweek={matchweekCount} />;
}
