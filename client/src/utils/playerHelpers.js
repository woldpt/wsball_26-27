import { AGG_TIERS } from "../constants/index.js";

export function getPlayerStat(player, keys, fallback = 0) {
  for (const key of keys) {
    const value = player?.[key];
    if (value !== undefined && value !== null) return value;
  }
  return fallback;
}

export function isPlayerAvailable(player, currentMatchweek = 1) {
  const suspensionUntil = player?.suspension_until_matchweek || 0;
  const injuryUntil = player?.injury_until_matchweek || 0;
  return currentMatchweek > suspensionUntil && currentMatchweek > injuryUntil;
}

export function buildAutoPositions(
  squad = [],
  formation = "4-4-2",
  currentMatchweek = 1,
) {
  const availablePlayers = squad.filter((player) =>
    isPlayerAvailable(player, currentMatchweek),
  );
  if (!availablePlayers.length) return {};

  const getOverall = (p) => {
    const gk = Number(p?.gk ?? p?.skill ?? 1);
    const defesa = Number(p?.defesa ?? p?.skill ?? 1);
    const passe = Number(p?.passe ?? p?.skill ?? 1);
    const finalizacao = Number(p?.finalizacao ?? p?.skill ?? 1);
    const form = Number(p?.form ?? 50);
    return ((gk + defesa + passe + finalizacao) / 4) * (0.8 + form / 500);
  };
  const sortedPlayers = [...availablePlayers].sort(
    (a, b) => getOverall(b) - getOverall(a),
  );

  const formationParts = String(formation || "4-4-2").split("-");
  const requiredByPosition = {
    GR: 1,
    DEF: parseInt(formationParts[0], 10) || 0,
    MED: parseInt(formationParts[1], 10) || 0,
    ATA: parseInt(formationParts[2], 10) || 0,
  };
  const usedByPosition = { GR: 0, DEF: 0, MED: 0, ATA: 0 };
  const lineup = [];

  // Passe 1: preencher cada slot com jogadores da posição nativa (melhor primeiro)
  for (const player of sortedPlayers) {
    const playerPosition = player.position;
    if (usedByPosition[playerPosition] < requiredByPosition[playerPosition]) {
      lineup.push(player);
      usedByPosition[playerPosition] += 1;
    }
  }

  // Passe 2: se alguma posição obrigatória ficou sem jogadores (ex: todos os GRs
  // suspensos/lesionados), preencher com os melhores restantes de qualquer posição
  for (const pos of ["GR", "DEF", "MED", "ATA"]) {
    while (usedByPosition[pos] < requiredByPosition[pos]) {
      const best = sortedPlayers.find((p) => !lineup.includes(p));
      if (!best) break;
      lineup.push(best);
      usedByPosition[pos] += 1;
    }
  }

  // Passe 3: completar até 11 jogadores com os restantes disponíveis
  if (lineup.length < 11) {
    for (const player of sortedPlayers) {
      if (lineup.includes(player)) continue;
      lineup.push(player);
      if (lineup.length === 11) break;
    }
  }

  const positions = Object.fromEntries(
    lineup.slice(0, 11).map((player) => [player.id, "Titular"]),
  );

  // Pick suplentes: garantir 1 suplente por posição (GR, DEF, MED, ATA) se disponível,
  // depois preencher os restantes slots (máx 5) com os melhores restantes.
  const remaining = sortedPlayers.filter((p) => !lineup.includes(p));
  const subs = [];
  const usedInSubs = new Set();
  for (const pos of ["GR", "DEF", "MED", "ATA"]) {
    if (subs.length >= 5) break;
    const candidate = remaining.find(
      (p) => p.position === pos && !usedInSubs.has(p.id),
    );
    if (candidate) {
      subs.push(candidate);
      usedInSubs.add(candidate.id);
    }
  }
  // preencher slots restantes com os melhores ainda não escolhidos
  // Não adicionar um 2º GR suplente
  const grSubsCount = subs.filter((p) => p.position === "GR").length;
  for (const p of remaining) {
    if (subs.length >= 5) break;
    if (!usedInSubs.has(p.id)) {
      // Skip GR if already have 1 GR substitute
      if (p.position === "GR" && grSubsCount >= 1) continue;
      subs.push(p);
      usedInSubs.add(p.id);
    }
  }
  subs.forEach((p) => {
    positions[p.id] = "Suplente";
  });

  return positions;
}

// Reconstructs effective lineup at a given liveMinute by applying events.
// initialLineup: [{id, name, position, is_star, skill}]
// events: match event array (includes substitution, red, injury events)
// side: "home" | "away" — filters events to the right team
export function getEffectiveLineup(
  initialLineup = [],
  events = [],
  liveMinute = 90,
  side = null,
) {
  const active = initialLineup.map((p) => ({ ...p, goals: 0, cards: [] }));
  const offPlayers = []; // { id, name, reason: "red"|"injury" }
  const subPlayers = []; // { id, name, position, goals: 0 } who came on

  const relevantEvents = side
    ? events.filter((e) => e.minute <= liveMinute && e.team === side)
    : events.filter((e) => e.minute <= liveMinute);

  // First pass: annotate goals
  relevantEvents.forEach((e) => {
    if (e.type === "goal" || e.type === "penalty_goal") {
      const scorer = active.find((p) => p.id === e.playerId);
      if (scorer) scorer.goals += 1;
      else {
        const sub = subPlayers.find((p) => p.id === e.playerId);
        if (sub) sub.goals += 1;
      }
    }
  });

  // Second pass: removals (red cards, injuries) and substitutions
  relevantEvents.forEach((e) => {
    if (e.type === "red") {
      const idx = active.findIndex((p) => p.id === e.playerId);
      if (idx !== -1) {
        offPlayers.push({ ...active[idx], reason: "red" });
        active.splice(idx, 1);
      }
    }
    if (e.type === "injury") {
      const idx = active.findIndex((p) => p.id === e.playerId);
      if (idx !== -1) {
        offPlayers.push({ ...active[idx], reason: "injury" });
        active.splice(idx, 1);
      }
    }
    if (e.type === "substitution") {
      const idx = active.findIndex(
        (p) => p.name === e.playerName || p.id === e.playerId,
      );
      if (idx !== -1) {
        offPlayers.push({ ...active[idx], reason: "sub" });
        active.splice(idx, 1);
      }
      if (e.playerName && !active.find((p) => p.name === e.playerName)) {
        subPlayers.push({
          id: e.playerId || null,
          name: e.playerName,
          position: null,
          goals: 0,
        });
      }
    }
    if (e.type === "halftime_sub") {
      const outIdx = active.findIndex(
        (p) => p.id === e.outPlayerId || p.name === e.outPlayerName,
      );
      if (outIdx !== -1) {
        offPlayers.push({ ...active[outIdx], reason: "sub" });
        active.splice(outIdx, 1);
      }
      if (e.playerId && !active.find((p) => p.id === e.playerId)) {
        subPlayers.push({
          id: e.playerId,
          name: e.playerName,
          position: e.position || null,
          goals: 0,
        });
      }
    }
  });

  return { active, offPlayers, subPlayers };
}

export function getMatchLastEventText(
  events = [],
  liveMinute = 90,
  side = null,
) {
  const filtered = side ? events.filter((e) => e.team === side) : events;
  let latest = null;
  filtered.forEach((event, index) => {
    if ((event.minute ?? -1) > liveMinute) return;
    if (
      !latest ||
      (event.minute ?? -1) > (latest.minute ?? -1) ||
      ((event.minute ?? -1) === (latest.minute ?? -1) && index > latest.index)
    ) {
      latest = { ...event, index };
    }
  });

  if (!latest) return "";

  const minuteText = latest.minute != null ? `[${latest.minute}']` : "";
  const playerName = latest.playerName || latest.player_name;
  const emoji = latest.emoji || "";

  if (playerName) {
    return `${minuteText} ${emoji} ${playerName}`.trim();
  }

  if (latest.type === "goal") {
    const nameMatch = latest.text?.match(/GOLO!\s*(.*)$/i);
    return `${minuteText} ⚽ ${nameMatch?.[1] || "Jogador"}`;
  }

  if (latest.type === "red") {
    const name =
      latest.playerName ||
      latest.text?.match(/Vermelho!\s*(.*)$/i)?.[1] ||
      "Jogador";
    return `${minuteText} 🟥 Vermelho! ${name}`;
  }

  return minuteText ? `${minuteText} ${latest.text || ""}` : latest.text || "";
}

export function aggLabel(value) {
  if (typeof value === "number") {
    const tiers = [
      "Cordeirinho",
      "Cavalheiro",
      "Fair Play",
      "Caneleiro",
      "Caceteiro",
    ];
    const idx = Math.max(0, Math.min(4, Math.round(value) - 1));
    return tiers[idx];
  }
  return AGG_TIERS[value] ? value : "Fair Play";
}
