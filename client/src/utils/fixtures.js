// Round-robin fixture generator — mirrors server game/engine.ts exactly.
// seedIds: ordered list of team IDs (from game.fixtureSeeds[division]).
// matchweek: 1-based matchweek number.
export function generateLeagueFixtures(seedIds, matchweek) {
  const n = seedIds.length;
  if (n < 2) return [];
  const totalRounds = n - 1;
  const totalMatchweeks = totalRounds * 2;
  const normMw = ((matchweek - 1) % totalMatchweeks) + 1;
  const isSecondLeg = normMw > totalRounds;
  const round = isSecondLeg ? normMw - totalRounds - 1 : normMw - 1;
  const rotating = seedIds.slice(1);
  const rotated = rotating.map((_, i) => rotating[(i + round) % rotating.length]);
  const allIds = [seedIds[0], ...rotated];
  const fixtures = [];
  for (let i = 0; i < Math.floor(n / 2); i++) {
    const a = allIds[i];
    const b = allIds[n - 1 - i];
    // Padrão C/F alternado: cada equipa tem alternância perfeita
    const teamIndexInSeed = seedIds.indexOf(a);
    const isSecondLegMatchweek = isSecondLeg ? 1 : 0;
    const aIsHome = (teamIndexInSeed + round + isSecondLegMatchweek) % 2 === 0;
    if (aIsHome) {
      fixtures.push({ homeTeamId: a, awayTeamId: b });
    } else {
      fixtures.push({ homeTeamId: b, awayTeamId: a });
    }
  }
  return fixtures;
}
