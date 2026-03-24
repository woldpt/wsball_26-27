async function getTeamSquad(db, teamId, tactic) {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM players WHERE team_id = ?', [teamId], (err, rows) => {
      if (err) return reject(err);
      
      if (tactic && tactic.positions) {
         const lineup = rows.filter(p => tactic.positions[p.id] === 'Titular');
         if (lineup.length === 11) return resolve(lineup);
      }
      
      const sorted = rows.sort((a, b) => (b.skill * b.form) - (a.skill * a.form));
      const lineup = [];
      const parts = (tactic?.formation || '4-4-2').split('-');
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

async function generateFixturesForDivision(db, division) {
  return new Promise((resolve) => {
    db.all('SELECT id FROM teams WHERE division = ?', [division], (err, teams) => {
      const fixtures = [];
      const used = new Set();
      for (let i = 0; i < teams.length; i++) {
        if (!used.has(teams[i].id)) {
           used.add(teams[i].id);
           let opponent = teams.find(t => !used.has(t.id) && t.id !== teams[i].id);
           if (opponent) {
             used.add(opponent.id);
             fixtures.push({ homeTeamId: teams[i].id, awayTeamId: opponent.id, finalHomeGoals: 0, finalAwayGoals: 0, events: [] });
           }
        }
      }
      resolve(fixtures);
    });
  });
}

async function simulateMatchSegment(db, fixture, homeTactic, awayTactic, startMin, endMin) {
  const homeSquad = await getTeamSquad(db, fixture.homeTeamId, homeTactic.formation);
  const awaySquad = await getTeamSquad(db, fixture.awayTeamId, awayTactic.formation);
  
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
