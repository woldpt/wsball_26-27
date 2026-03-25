async function getTeamSquad(db, teamId, tactic) {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM players WHERE team_id = ?', [teamId], (err, rows) => {
      if (err) return reject(err);
      
      // If tactic has explicit position assignments, use them
      if (tactic && tactic.positions) {
         const lineup = rows.filter(p => tactic.positions[p.id] === 'Titular');
         if (lineup.length === 11) return resolve(lineup);
      }
      
      // Auto-pick best 11 based on formation
      const sorted = rows.sort((a, b) => (b.skill * b.form) - (a.skill * a.form));
      const lineup = [];
      const formationStr = (tactic && tactic.formation) ? tactic.formation : '4-4-2';
      const parts = formationStr.split('-');
      const positions = { 'GK': 1, 'DEF': parseInt(parts[0]), 'MID': parseInt(parts[1]), 'ATK': parseInt(parts[2]) };
      const currentPos = { 'GK': 0, 'DEF': 0, 'MID': 0, 'ATK': 0 };
      
      sorted.forEach(p => {
        if (currentPos[p.position] < positions[p.position]) {
          lineup.push(p);
          currentPos[p.position]++;
        }
      });
      
      if (lineup.length < 11) {
         const missing = 11 - lineup.length;
         const remaining = sorted.filter(p => !lineup.includes(p));
         lineup.push(...remaining.slice(0, missing));
      }
      
      resolve(lineup);
    });
  });
}

/**
 * Generate round-robin fixtures for a division for a given matchweek.
 * Uses the circle method: fix team[0], rotate the rest.
 * 8 teams => 14 matchweeks (7 rounds × 2 for home/away swap).
 */
async function generateFixturesForDivision(db, division, matchweek) {
  return new Promise((resolve) => {
    db.all('SELECT id FROM teams WHERE division = ? ORDER BY id', [division], (err, teams) => {
      if (err || !teams || teams.length < 2) return resolve([]);
      
      const n = teams.length; // 8
      const rounds = n - 1;   // 7 unique rounds
      
      // Determine which round and whether to flip home/away
      // matchweek 1-7: first leg, matchweek 8-14: second leg (home/away swapped)
      const isSecondLeg = matchweek > rounds;
      const round = isSecondLeg ? (matchweek - rounds - 1) : (matchweek - 1); // 0-indexed
      
      // Circle method: fix teams[0], rotate teams[1..n-1]
      const rotating = teams.slice(1);
      
      // Rotate the array by 'round' positions
      const rotated = [];
      for (let i = 0; i < rotating.length; i++) {
        rotated.push(rotating[(i + round) % rotating.length]);
      }
      
      // Build pairings: teams[0] vs rotated[0], rotated[1] vs rotated[n-2], etc.
      const allTeams = [teams[0], ...rotated];
      const fixtures = [];
      
      for (let i = 0; i < n / 2; i++) {
        let homeTeam = allTeams[i];
        let awayTeam = allTeams[n - 1 - i];
        
        // Swap home/away for second leg
        if (isSecondLeg) {
          [homeTeam, awayTeam] = [awayTeam, homeTeam];
        }
        
        fixtures.push({
          homeTeamId: homeTeam.id,
          awayTeamId: awayTeam.id,
          finalHomeGoals: 0,
          finalAwayGoals: 0,
          events: []
        });
      }
      
      resolve(fixtures);
    });
  });
}

async function simulateMatchSegment(db, fixture, homeTactic, awayTactic, startMin, endMin) {
  // BUG-08 FIX: Pass full tactic objects to getTeamSquad (not .formation string)
  const homeSquad = await getTeamSquad(db, fixture.homeTeamId, homeTactic);
  const awaySquad = await getTeamSquad(db, fixture.awayTeamId, awayTactic);
  
  const getPower = (squad, style) => {
    let attack = 0, defense = 0, midfield = 0, gk = 0;
    squad.forEach(p => {
      const effSkill = p.skill * (p.form / 100);
      if (p.position === 'GK') gk += effSkill;
      if (p.position === 'DEF') defense += effSkill;
      if (p.position === 'MID') midfield += effSkill;
      if (p.position === 'ATK') attack += effSkill;
    });
    
    if (style === 'Offensive') { attack *= 1.15; defense *= 0.85; }
    if (style === 'Defensive') { defense *= 1.20; attack *= 0.80; }
    
    return { attack, defense, midfield, gk, squad };
  };

  const home = getPower(homeSquad, homeTactic.style);
  const away = getPower(awaySquad, awayTactic.style);

  const homeBonus = 1.1; 
  const hStrength = ((home.attack || 10) * 1.5 + (home.midfield || 10) * 1.0 + (home.defense || 10) * 0.5) * homeBonus;
  const aStrength = ((away.attack || 10) * 1.5 + (away.midfield || 10) * 1.0 + (away.defense || 10) * 0.5);
  
  for (let minute = startMin; minute <= endMin; minute++) {
    const chance = Math.random();
    if (chance < 0.03) {
      if (Math.random() * (hStrength + aStrength) < hStrength) {
        const scorers = home.squad.filter(p => p.position === 'ATK' || p.position === 'MID');
        const scorer = scorers.length > 0 ? scorers[Math.floor(Math.random() * scorers.length)] : home.squad[0];
        fixture.finalHomeGoals++;
        fixture.events.push({ minute, type: 'goal', team: 'home', text: `[${minute}'] ⚽ GOLO! ${scorer ? scorer.name : 'Jogador'}` });
      } else {
        const scorers = away.squad.filter(p => p.position === 'ATK' || p.position === 'MID');
        const scorer = scorers.length > 0 ? scorers[Math.floor(Math.random() * scorers.length)] : away.squad[0];
        fixture.finalAwayGoals++;
        fixture.events.push({ minute, type: 'goal', team: 'away', text: `[${minute}'] ⚽ GOLO! ${scorer ? scorer.name : 'Jogador'}` });
      }
    }
    
    const cardChance = Math.random();
    if (cardChance < 0.015) { 
      const isHomeCard = Math.random() > 0.5;
      const squad = isHomeCard ? home.squad : away.squad;
      if (squad.length > 0) {
        const offender = squad[Math.floor(Math.random() * squad.length)];
        let redProb = 0.05;
        if (offender.aggressiveness === 'High') redProb = 0.20;
        if (offender.aggressiveness === 'Low') redProb = 0.01;
        
        if (Math.random() < redProb) {
          fixture.events.push({ minute, type: 'red', team: isHomeCard ? 'home' : 'away', text: `[${minute}'] 🟥 VERMELHO! ${offender.name}` });
        } else {
          fixture.events.push({ minute, type: 'yellow', team: isHomeCard ? 'home' : 'away', text: `[${minute}'] 🟨 Amarelo para ${offender.name}` });
        }
      }
    }
  }
}

module.exports = {
  simulateMatchSegment,
  getTeamSquad,
  generateFixturesForDivision
};
