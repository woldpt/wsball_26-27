const db = require('../db/database');

function getTeamSquad(teamId, formation = '4-4-2') {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM players WHERE team_id = ?', [teamId], (err, rows) => {
      if (err) return reject(err);
      
      const sorted = rows.sort((a, b) => (b.skill * b.form) - (a.skill * a.form));
      
      const lineup = [];
      const parts = formation.split('-');
      const positions = { 'GK': 1, 'DEF': parseInt(parts[0]), 'MID': parseInt(parts[1]), 'ATK': parseInt(parts[2]) };
      const currentPos = { 'GK': 0, 'DEF': 0, 'MID': 0, 'ATK': 0 };
      
      sorted.forEach(p => {
        if (currentPos[p.position] < positions[p.position]) {
          lineup.push(p);
          currentPos[p.position]++;
        }
      });
      
      // If we don't have exactly 11 players filling those roles, fill with whatever is best
      if (lineup.length < 11) {
         const missing = 11 - lineup.length;
         const remaining = sorted.filter(p => !lineup.includes(p));
         lineup.push(...remaining.slice(0, missing));
      }
      
      resolve(lineup);
    });
  });
}

async function simulateMatch(homeTeamId, awayTeamId, homeTactic, awayTactic) {
  const homeSquad = await getTeamSquad(homeTeamId, homeTactic.formation);
  const awaySquad = await getTeamSquad(awayTeamId, awayTactic.formation);
  
  // Calculate power
  const getPower = (squad, style) => {
    let attack = 0, defense = 0, midfield = 0, gk = 0;
    squad.forEach(p => {
      const effSkill = p.skill * (p.form / 100);
      if (p.position === 'GK') gk += effSkill;
      if (p.position === 'DEF') defense += effSkill;
      if (p.position === 'MID') midfield += effSkill;
      if (p.position === 'ATK') attack += effSkill;
    });
    
    // Apply style modifiers
    if (style === 'Offensive') { attack *= 1.15; defense *= 0.85; }
    if (style === 'Defensive') { defense *= 1.20; attack *= 0.80; }
    
    return { attack, defense, midfield, gk, squad };
  };

  const home = getPower(homeSquad, homeTactic.style);
  const away = getPower(awaySquad, awayTactic.style);

  const homeBonus = 1.1; // Home team advantage
  const hStrength = ((home.attack || 10) * 1.5 + (home.midfield || 10) * 1.0 + (home.defense || 10) * 0.5) * homeBonus;
  const aStrength = ((away.attack || 10) * 1.5 + (away.midfield || 10) * 1.0 + (away.defense || 10) * 0.5);
  
  let homeGoals = 0;
  let awayGoals = 0;
  let narrative = [];
  
  // Minute by minute simulation
  for (let minute = 1; minute <= 90; minute++) {
    const chance = Math.random();
    
    // 3% chance of a highlight per minute (~2-3 highlights per game)
    if (chance < 0.03) {
      if (Math.random() * (hStrength + aStrength) < hStrength) {
        const scorers = home.squad.filter(p => p.position === 'ATK' || p.position === 'MID');
        const scorer = scorers.length > 0 ? scorers[Math.floor(Math.random() * scorers.length)] : home.squad[0];
        homeGoals++;
        narrative.push(`[${minute}'] GOLO! ${scorer ? scorer.name : 'Jogador'} marca para a equipa da casa!`);
      } else {
        const scorers = away.squad.filter(p => p.position === 'ATK' || p.position === 'MID');
        const scorer = scorers.length > 0 ? scorers[Math.floor(Math.random() * scorers.length)] : away.squad[0];
        awayGoals++;
        narrative.push(`[${minute}'] GOLO! ${scorer ? scorer.name : 'Jogador'} gela o estádio!`);
      }
    }
    
    // Cards simulation
    const cardChance = Math.random();
    if (cardChance < 0.015) { // 1.5% chance per minute for a card
      const isHomeCard = Math.random() > 0.5;
      const squad = isHomeCard ? home.squad : away.squad;
      if (squad.length > 0) {
        const offender = squad[Math.floor(Math.random() * squad.length)];
        let redProb = 0.05;
        if (offender.aggressiveness === 'High') redProb = 0.20;
        if (offender.aggressiveness === 'Low') redProb = 0.01;
        
        if (Math.random() < redProb) {
          narrative.push(`[${minute}'] CARTÃO VERMELHO DIRETO! ${offender.name} expulso após entrada duríssima!`);
        } else {
          narrative.push(`[${minute}'] Cartão Amarelo para ${offender.name}.`);
        }
      }
    }
  }
  
  if (narrative.length === 0) narrative.push("Jogo muito disputado a meio campo, sem grandes oportunidades.");

  return { homeGoals, awayGoals, narrative };
}

module.exports = {
  simulateMatch,
  getTeamSquad
};
