import React, {
  useEffect,
  useLayoutEffect,
  useState,
  useMemo,
  useCallback,
} from "react";
import { socket } from "./socket";
import AdminPanel from "./AdminPanel.jsx";
import { COUNTRY_FLAGS } from "./countryFlags.js";
// ── Extracted components ───────────────────────────────────────────────────
import { AggBadge } from "./components/shared/AggBadge.jsx";
import { PlayerLink } from "./components/shared/PlayerLink.jsx";
import { WelcomeModal } from "./components/modals/WelcomeModal.jsx";
import { JobOfferModal } from "./components/modals/JobOfferModal.jsx";
import { PlayerHistoryModal } from "./components/modals/PlayerHistoryModal.jsx";
import { CupDrawPopup } from "./components/modals/CupDrawPopup.jsx";
import { PenaltySuspensePopup } from "./components/modals/PenaltySuspensePopup.jsx";
import { PenaltyShootoutPopup } from "./components/modals/PenaltyShootoutPopup.jsx";
import { MatchDetailModal } from "./components/modals/MatchDetailModal.jsx";
import { RefereePopup } from "./components/modals/RefereePopup.jsx";
import { TeamSquadModal } from "./components/modals/TeamSquadModal.jsx";
import { TransferProposalModal } from "./components/modals/TransferProposalModal.jsx";
import { AuctionNotification } from "./components/ui/AuctionNotification.jsx";
import { NewsTicker } from "./components/ui/NewsTicker.jsx";
import { LeagueStandings } from "./components/ui/LeagueStandings.jsx";
import { ChatWidget } from "./components/chat/ChatWidget.jsx";

const FLAG_TO_COUNTRY = {};
COUNTRY_FLAGS.forEach(({ flag, label }) => {
  FLAG_TO_COUNTRY[flag] = label.replace(/^\S+\s/, "");
});
const DIVISION_NAMES = {
  1: "Primeira Liga",
  2: "Segunda Liga",
  3: "Liga 3",
  4: "Campeonato de Portugal",
  5: "Distritais",
};

const POSITION_SHORT_LABELS = {
  GR: "G",
  DEF: "D",
  MED: "M",
  ATA: "A",
};

// Enable row background color per position
const ENABLE_ROW_BG = true;

// Text color classes for each position (soft palette)
const POSITION_TEXT_CLASS = {
  GR: "text-yellow-500",
  DEF: "text-blue-500",
  MED: "text-emerald-500",
  ATA: "text-rose-500",
};

// Background color classes for each position (soft, subtle)
const POSITION_BG_CLASS = {
  GR: "bg-yellow-500/8",
  DEF: "bg-blue-500/8",
  MED: "bg-emerald-500/8",
  ATA: "bg-rose-500/8",
};

const MAX_MATCH_SUBS = 3;
const ADMIN_SESSION_KEY = "cashballAdminSession";

// ── SEASON CALENDAR ───────────────────────────────────────────────────────────
const SEASON_CALENDAR = [
  { type: "league", matchweek: 1, calendarIndex: 0 },
  { type: "league", matchweek: 2, calendarIndex: 1 },
  { type: "league", matchweek: 3, calendarIndex: 2 },
  { type: "cup", round: 1, roundName: "16 avos de final", calendarIndex: 3 },
  { type: "league", matchweek: 4, calendarIndex: 4 },
  { type: "league", matchweek: 5, calendarIndex: 5 },
  { type: "league", matchweek: 6, calendarIndex: 6 },
  { type: "cup", round: 2, roundName: "Oitavos de final", calendarIndex: 7 },
  { type: "league", matchweek: 7, calendarIndex: 8 },
  { type: "league", matchweek: 8, calendarIndex: 9 },
  { type: "league", matchweek: 9, calendarIndex: 10 },
  { type: "cup", round: 3, roundName: "Quartos de final", calendarIndex: 11 },
  { type: "league", matchweek: 10, calendarIndex: 12 },
  { type: "league", matchweek: 11, calendarIndex: 13 },
  { type: "cup", round: 4, roundName: "Meias-finais", calendarIndex: 14 },
  { type: "league", matchweek: 12, calendarIndex: 15 },
  { type: "league", matchweek: 13, calendarIndex: 16 },
  { type: "league", matchweek: 14, calendarIndex: 17 },
  { type: "cup", round: 5, roundName: "Final", calendarIndex: 18 },
];

// Round-robin fixture generator (mirrors server engine.ts).
// When myTeamId is provided, applies a swap-correction so that team's
// home/away assignment alternates throughout the season (never two
// consecutive home or away games in the league).
function generateLeagueFixtures(teamsInDivision, matchweek, myTeamId) {
  const sorted = [...teamsInDivision].sort((a, b) => a.id - b.id);
  const n = sorted.length;
  if (n < 2) return [];
  const totalRounds = n - 1;
  const totalMatchweeks = totalRounds * 2;
  const normMw = ((matchweek - 1) % totalMatchweeks) + 1;
  const isSecondLeg = normMw > totalRounds;
  const round = isSecondLeg ? normMw - totalRounds - 1 : normMw - 1;
  const rotating = sorted.slice(1);
  const rotated = rotating.map(
    (_, i) => rotating[(i + round) % rotating.length],
  );
  const allTeams = [sorted[0], ...rotated];
  const fixtures = [];
  for (let i = 0; i < Math.floor(n / 2); i++) {
    let home = allTeams[i];
    let away = allTeams[n - 1 - i];
    if (isSecondLeg) [home, away] = [away, home];
    fixtures.push({ homeTeamId: home.id, awayTeamId: away.id });
  }

  if (myTeamId) {
    // Build a swap map: for each first-leg round r, should we swap the
    // fixture involving myTeam so it alternates H/A?
    const swapMap = {};
    let prevCorrectedHome = null;
    for (let r = 0; r < totalRounds; r++) {
      const rot = rotating.map((_, i) => rotating[(i + r) % rotating.length]);
      const all = [sorted[0], ...rot];
      let rawIsHome = null;
      for (let i = 0; i < Math.floor(n / 2); i++) {
        if (all[i].id === myTeamId) {
          rawIsHome = true;
          break;
        }
        if (all[n - 1 - i].id === myTeamId) {
          rawIsHome = false;
          break;
        }
      }
      if (rawIsHome === null) continue;
      const needsSwap =
        prevCorrectedHome !== null && rawIsHome === prevCorrectedHome;
      swapMap[r] = needsSwap;
      prevCorrectedHome = needsSwap ? !rawIsHome : rawIsHome;
    }
    if (swapMap[round]) {
      const idx = fixtures.findIndex(
        (f) => f.homeTeamId === myTeamId || f.awayTeamId === myTeamId,
      );
      if (idx >= 0) {
        const f = fixtures[idx];
        [f.homeTeamId, f.awayTeamId] = [f.awayTeamId, f.homeTeamId];
      }
    }
  }

  return fixtures;
}
const DEFAULT_TACTIC = { formation: "4-4-2", style: "Balanced", positions: {} };

function loadAdminSession() {
  try {
    const raw = window.localStorage.getItem(ADMIN_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.token || !parsed?.username) return null;
    if (parsed.expiresAt && Number(parsed.expiresAt) <= Date.now()) {
      window.localStorage.removeItem(ADMIN_SESSION_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function saveAdminSession(session) {
  try {
    window.localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(session));
  } catch {
    // Ignore storage failures.
  }
}

function clearAdminSession() {
  try {
    window.localStorage.removeItem(ADMIN_SESSION_KEY);
  } catch {
    // Ignore storage failures.
  }
}

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

function normalizeTeamId(teamId) {
  if (teamId === null || teamId === undefined) return null;
  const raw = String(teamId).trim();
  if (!raw) return null;
  const numeric = Number(raw);
  return Number.isNaN(numeric) ? raw : numeric;
}

function isSameTeamId(left, right) {
  const normalizedLeft = normalizeTeamId(left);
  const normalizedRight = normalizeTeamId(right);
  if (normalizedLeft === null || normalizedRight === null) return false;
  return normalizedLeft === normalizedRight;
}

function getPlayerStat(player, keys, fallback = 0) {
  for (const key of keys) {
    const value = player?.[key];
    if (value !== undefined && value !== null) return value;
  }
  return fallback;
}

function isPlayerAvailable(player, currentMatchweek = 1) {
  const suspensionUntil = player?.suspension_until_matchweek || 0;
  const injuryUntil = player?.injury_until_matchweek || 0;
  return currentMatchweek > suspensionUntil && currentMatchweek > injuryUntil;
}

function buildAutoPositions(
  squad = [],
  formation = "4-4-2",
  currentMatchweek = 1,
) {
  const availablePlayers = squad.filter((player) =>
    isPlayerAvailable(player, currentMatchweek),
  );
  if (!availablePlayers.length) return {};

  const sortedPlayers = [...availablePlayers].sort(
    (a, b) => b.skill * b.form - a.skill * a.form,
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
function getEffectiveLineup(
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
      // player coming out is already removed (injury) or is being swapped for tactical reasons
      const idx = active.findIndex(
        (p) => p.name === e.playerName || p.id === e.playerId,
      );
      if (idx !== -1) {
        offPlayers.push({ ...active[idx], reason: "sub" });
        active.splice(idx, 1);
      }
      // player coming in — we don't always have their id in the event so just record the name
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
      // Remove outgoing player from active
      const outIdx = active.findIndex(
        (p) => p.id === e.outPlayerId || p.name === e.outPlayerName,
      );
      if (outIdx !== -1) {
        offPlayers.push({ ...active[outIdx], reason: "sub" });
        active.splice(outIdx, 1);
      }
      // Add incoming player to subPlayers
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

function getMatchLastEventText(events = [], liveMinute = 90, side = null) {
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

function loadSavedSession() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem("cashballSession");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.name || !parsed?.password || !parsed?.roomCode) return null;
    return parsed;
  } catch {
    return null;
  }
}

function hasSeenWelcome(coachName, roomCode) {
  try {
    return (
      window.localStorage.getItem(
        `cashball_welcome:${coachName}:${roomCode}`,
      ) === "1"
    );
  } catch {
    return false;
  }
}

function markWelcomeSeen(coachName, roomCode) {
  try {
    window.localStorage.setItem(
      `cashball_welcome:${coachName}:${roomCode}`,
      "1",
    );
  } catch {
    // Ignore storage failures.
  }
}

function hasSeenWelcomeThisSession(coachName, roomCode) {
  try {
    return (
      window.sessionStorage.getItem(
        `cashball_welcome_session:${coachName}:${roomCode}`,
      ) === "1"
    );
  } catch {
    return false;
  }
}

function markWelcomeSeenThisSession(coachName, roomCode) {
  try {
    window.sessionStorage.setItem(
      `cashball_welcome_session:${coachName}:${roomCode}`,
      "1",
    );
  } catch {
    // Ignore storage failures.
  }
}

const playNotification = () => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [880, 1100].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.13);
      gain.gain.setValueAtTime(0.07, ctx.currentTime + i * 0.13);
      gain.gain.exponentialRampToValueAtTime(
        0.001,
        ctx.currentTime + i * 0.13 + 0.22,
      );
      osc.start(ctx.currentTime + i * 0.13);
      osc.stop(ctx.currentTime + i * 0.13 + 0.22);
    });
  } catch {
    // ignore
  }
};

function App() {
  const savedSessionRef = React.useRef(loadSavedSession());
  const savedSession = savedSessionRef.current;
  const [adminSession, setAdminSession] = useState(() => loadAdminSession());

  const [teams, setTeams] = useState([]);
  const [teamForms, setTeamForms] = useState({});
  const [players, setPlayers] = useState([]);
  const [mySquad, setMySquad] = useState([]);
  const [me, setMe] = useState(
    savedSession
      ? {
          name: savedSession.name,
          password: savedSession.password,
          roomCode: savedSession.roomCode,
        }
      : null,
  );

  const [name, setName] = useState(savedSession?.name || "");
  const [password, setPassword] = useState(savedSession?.password || "");
  const [roomCode, setRoomCode] = useState(savedSession?.roomCode || "");
  const [authPhase, setAuthPhase] = useState("login");
  const [joinMode, setJoinMode] = useState(null);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [availableSaves, setAvailableSaves] = useState([]);
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [authError, setAuthError] = useState("");
  const [joining, setJoining] = useState(Boolean(savedSession));
  const [disconnected, setDisconnected] = useState(false);
  const [joinError, setJoinError] = useState("");
  const [toasts, setToasts] = useState([]);
  const [lockedCoaches, setLockedCoaches] = useState([]);
  const [awaitingCoaches, setAwaitingCoaches] = useState([]);
  const joinTimerRef = React.useRef(null);

  const addToast = (msg) => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, msg }]);
    setTimeout(
      () => setToasts((prev) => prev.filter((t) => t.id !== id)),
      4000,
    );
  };

  const TICKER_TEAM_COLORS = [
    "#f87171",
    "#fb923c",
    "#facc15",
    "#4ade80",
    "#34d399",
    "#22d3ee",
    "#60a5fa",
    "#a78bfa",
    "#e879f9",
    "#f472b6",
    "#94a3b8",
    "#fbbf24",
    "#86efac",
    "#67e8f9",
    "#c4b5fd",
    "#fda4af",
    "#6ee7b7",
    "#93c5fd",
  ];
  const getTeamColor = (teamId) =>
    teamId ? TICKER_TEAM_COLORS[teamId % TICKER_TEAM_COLORS.length] : "#ef4444";

  const pushTickerItem = (
    text,
    playerId = null,
    playerName = null,
    teamId = null,
  ) => {
    setNewsTickerItems((prev) => [
      ...prev.slice(-49),
      { id: Date.now() + Math.random(), text, playerId, playerName, teamId },
    ]);
  };

  const [matchResults, setMatchResults] = useState(null);
  const [matchweekCount, setMatchweekCount] = useState(0);
  const [activeTab, setActiveTab] = useState("players");
  const [topScorers, setTopScorers] = useState([]);
  const [marketPairs, setMarketPairs] = useState([]);
  const [marketPositionFilter, setMarketPositionFilter] = useState("all");
  const [marketSort, setMarketSort] = useState("quality-desc");
  const [playersPositionFilter, setPlayersPositionFilter] = useState("all");
  const [selectedAuctionPlayer, setSelectedAuctionPlayer] = useState(null);
  const [isAuctionExpanded, setIsAuctionExpanded] = useState(false);
  const [auctionBid, setAuctionBid] = useState("");
  const [myAuctionBid, setMyAuctionBid] = useState(null); // sealed bid confirmation
  const [auctionResult, setAuctionResult] = useState(null); // result after auction closes
  const [nextMatchSummary, setNextMatchSummary] = useState(null);
  const [nextMatchSummaryLoading, setNextMatchSummaryLoading] = useState(false);
  const [refereePopup, setRefereePopup] = useState(null);
  // Cup state
  const [cupDraw, setCupDraw] = useState(null); // { round, roundName, fixtures, humanInCup, season }
  const [showCupDrawPopup, setShowCupDrawPopup] = useState(false);
  const [cupDrawRevealIdx, setCupDrawRevealIdx] = useState(0); // how many teams revealed so far
  const [cupRoundResults, setCupRoundResults] = useState(null); // last cup round results
  const [, setShowCupResults] = useState(false);
  const [cupPenaltyPopup, setCupPenaltyPopup] = useState(null); // shootout data
  const [cupPenaltyKickIdx, setCupPenaltyKickIdx] = useState(0); // how many kicks revealed
  const [welcomeModal, setWelcomeModal] = useState(null); // { teamName }
  const [jobOfferModal, setJobOfferModal] = useState(null); // null | { fromTeam, toTeam, expiresAtMatchweek }
  // Cup match live state
  const [isCupMatch, setIsCupMatch] = useState(false);
  const [cupPreMatch, setCupPreMatch] = useState(false);
  const [cupMatchRoundName, setCupMatchRoundName] = useState("");
  const [cupExtraTimeBadge, setCupExtraTimeBadge] = useState(false);
  const [isCupExtraTime, setIsCupExtraTime] = useState(false);
  const [cupActiveTeamIds, setCupActiveTeamIds] = useState([]); // equipas na ronda actual
  const [palmares, setPalmares] = useState({ trophies: [], allChampions: [] });
  const [palmaresTeamId, setPalmaresTeamId] = useState(null); // last requested team
  const [clubNews, setClubNews] = useState([]);
  const [newsTickerItems, setNewsTickerItems] = useState([]);
  const [playerHistoryModal, setPlayerHistoryModal] = useState(null); // { player, transfers }
  const [financeData, setFinanceData] = useState(null); // { totalTicketRevenue, totalTransferIncome, totalTransferExpenses, sponsorRevenue, homeMatchesPlayed }
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [selectedTeamSquad, setSelectedTeamSquad] = useState([]);
  const [selectedTeamLoading, setSelectedTeamLoading] = useState(false);
  const [transferProposalModal, setTransferProposalModal] = useState(null); // { player, suggestedPrice }
  const [calendarData, setCalendarData] = useState(null);
  const [expandedCalEntries, setExpandedCalEntries] = useState({});
  const [tactic, setTactic] = useState(DEFAULT_TACTIC);
  const [liveMinute, setLiveMinute] = useState(90);
  const [isPlayingMatch, setIsPlayingMatch] = useState(false);
  const [isLiveSimulation, setIsLiveSimulation] = useState(false);
  const [showHalftimePanel, setShowHalftimePanel] = useState(false);
  const [matchAction, setMatchAction] = useState(null);
  const [isMatchActionPending, setIsMatchActionPending] = useState(false);
  const [injuryCountdown, setInjuryCountdown] = useState(null);
  const injuryCountdownRef = React.useRef(null);
  const [subsMade, setSubsMade] = useState(0);
  const [, forceGoalFlashRender] = useState(0);
  const [swapSource, setSwapSource] = useState(null);
  const [swapTarget, setSwapTarget] = useState(null); // player coming IN (Suplente)
  const [subbedOut, setSubbedOut] = useState([]); // Track players who left the pitch
  const [confirmedSubs, setConfirmedSubs] = useState([]); // [{out: id, in: id}]
  const [openStatusPickerId, setOpenStatusPickerId] = useState(null);
  const [penaltySuspense, setPenaltySuspense] = useState(null); // { playerName, result, team }
  // Match detail modal (non-blocking overlay during live match)
  const [showMatchDetail, setShowMatchDetail] = useState(false);
  const [matchDetailFixture, setMatchDetailFixture] = useState(null);

  // Chat state
  const [chatOpen, setChatOpen] = useState(false);
  const [activeChatTab, setActiveChatTab] = useState("room");
  const [roomMessages, setRoomMessages] = useState([]);
  const [globalMessages, setGlobalMessages] = useState([]);
  const [unreadRoom, setUnreadRoom] = useState(0);
  const [unreadGlobal, setUnreadGlobal] = useState(0);
  const [chatInput, setChatInput] = useState("");
  const chatMessagesRef = React.useRef(null);

  const meRef = React.useRef(null);
  const isPlayingMatchRef = React.useRef(false);
  const isCupDrawRef = React.useRef(false);
  const teamsRef = React.useRef([]);
  const isLiveSimulationRef = React.useRef(false);
  const selectedTeamRef = React.useRef(null);
  const marketPairsRef = React.useRef([]);
  const mySquadRef = React.useRef([]);
  const tacticRef = React.useRef({ positions: {} });
  // goalFlashRef: { [key]: timestamp } – key = `${homeId}_${awayId}_home|away`
  const goalFlashRef = React.useRef({});
  const formationSelectRef = React.useRef(null);

  const backendUrl =
    (typeof import.meta !== "undefined" && import.meta.env?.VITE_BACKEND_URL) ||
    "";

  // Re-fetch this coach's saved rooms whenever the name changes while in "saved-game" mode.
  useEffect(() => {
    if (adminSession) return;
    if (joinMode === "saved-game" && name) {
      const timeout = setTimeout(() => {
        fetch(`${backendUrl}/saves?name=${encodeURIComponent(name)}`)
          .then((r) => r.json())
          .then((data) => {
            setAvailableSaves(data);
            if (data.length > 0 && !roomCode) setRoomCode(data[0].code);
          })
          .catch(() => {});
      }, 400);
      return () => clearTimeout(timeout);
    } else if (joinMode === "saved-game" && !name) {
      // No name entered yet — show all saves so the dropdown is populated
      fetch(`${backendUrl}/saves`)
        .then((r) => r.json())
        .then((data) => {
          setAvailableSaves(data);
          if (data.length > 0 && !roomCode) setRoomCode(data[0].code);
        })
        .catch(() => {});
    }
  }, [name, joinMode, adminSession]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep isPlayingMatchRef in sync and force-close auction modal when a match starts.
  useEffect(() => {
    isPlayingMatchRef.current = isPlayingMatch;
    if (isPlayingMatch) {
      setSelectedAuctionPlayer(null);
      setAuctionBid("");
      setMyAuctionBid(null);
      setAuctionResult(null);
    }
  }, [isPlayingMatch]);

  useEffect(() => {
    isLiveSimulationRef.current = isLiveSimulation;
  }, [isLiveSimulation]);

  useEffect(() => {
    teamsRef.current = teams;
  }, [teams]);

  // BUG-07 FIX: All socket listeners in a single effect with [] dep so they're
  // registered exactly once and cleaned up correctly on unmount.
  useEffect(() => {
    socket.on("calendarData", (data) => setCalendarData(data));
    socket.on("teamsData", (data) => setTeams(data));
    socket.on("teamForms", (data) => setTeamForms(data || {}));
    socket.on("playerListUpdate", (data) => {
      setPlayers(data);
    });
    socket.on("mySquad", (data) => setMySquad(data));
    socket.on("marketUpdate", (data) => setMarketPairs(data));
    socket.on("auctionStarted", (auctionData) => {
      // Never open auction notification during an active match or cup draw
      if (isPlayingMatchRef.current || isCupDrawRef.current) return;
      // Skip if starting price exceeds our available budget
      const myTeamId = meRef.current?.teamId;
      const myTeamBudget =
        teamsRef.current.find((t) => t.id == myTeamId)?.budget ?? Infinity;
      if (auctionData.startingPrice > myTeamBudget) return;
      // Auto-open auction notification for all eligible coaches
      setSelectedAuctionPlayer(auctionData);
      setIsAuctionExpanded(false);
      setAuctionBid("");
      setMyAuctionBid(null);
      setAuctionResult(null);
    });
    socket.on("auctionBidConfirmed", ({ playerId, bidAmount }) => {
      setSelectedAuctionPlayer((prev) => {
        if (prev && prev.playerId === playerId) {
          setMyAuctionBid(bidAmount);
        }
        return prev;
      });
    });
    socket.on("auctionClosed", (result) => {
      if (result.sold) {
        pushTickerItem(
          `${result.playerName} transferido para ${result.buyerTeamName} por ${formatCurrency(result.finalBid)}`,
          result.playerId,
          result.playerName,
          result.buyerTeamId,
        );
      } else {
        pushTickerItem(
          `Leilão de ${result.playerName} encerrado sem licitações`,
          result.playerId,
          result.playerName,
          null,
        );
      }
      setSelectedAuctionPlayer((prev) => {
        if (prev && prev.playerId === result.playerId) {
          setAuctionResult(result);
          setTimeout(() => {
            setSelectedAuctionPlayer(null);
            setIsAuctionExpanded(false);
            setAuctionBid("");
            setMyAuctionBid(null);
            setAuctionResult(null);
          }, 5000);
          return prev;
        }
        // Not viewing this auction — just clear if it was stale
        return prev?.playerId === result.playerId ? null : prev;
      });
    });
    socket.on("topScorers", (data) => setTopScorers(data));
    socket.on("seasonEnd", (data) => {
      if (data.champion) {
        pushTickerItem(
          `Campeão: ${data.champion.name}`,
          null,
          null,
          data.champion.id,
        );
      }
      for (const p of data.promotions || []) {
        const teamName =
          teamsRef.current.find((t) => t.id === p.teamId)?.name ||
          `Equipa ${p.teamId}`;
        pushTickerItem(
          `${teamName} promovida/descida para divisão ${p.toDiv}`,
          null,
          null,
          p.teamId,
        );
      }
    });
    socket.on("teamSquadData", ({ teamId, squad }) => {
      if (selectedTeamRef.current && selectedTeamRef.current.id === teamId) {
        setSelectedTeamSquad(squad || []);
        setSelectedTeamLoading(false);
      }
    });
    socket.on("nextMatchSummary", (data) => {
      setNextMatchSummary(data);
      setNextMatchSummaryLoading(false);
    });
    socket.on("cupDrawStart", (data) => {
      // Never open the cup draw popup during an active match
      if (isPlayingMatchRef.current) return;
      isCupDrawRef.current = true;
      // Close any open auction modal to avoid overlap with the draw animation
      setSelectedAuctionPlayer(null);
      setAuctionBid("");
      setMyAuctionBid(null);
      setAuctionResult(null);
      setCupDraw(data);
      setCupDrawRevealIdx(0);
      setShowCupDrawPopup(true);
    });
    socket.on("cupPreMatch", (data) => {
      setMatchResults({ matchweek: data.season, results: [] });
      setShowHalftimePanel(true);
      setIsPlayingMatch(false);
      setLiveMinute(0);
      setSubsMade(0);
      setSubbedOut([]);
      setConfirmedSubs([]);
      setSwapSource(null);
      setSwapTarget(null);
      setIsCupMatch(true);
      setCupPreMatch(true);
      setCupMatchRoundName(data.roundName);
      setCupExtraTimeBadge(false);
      setCupActiveTeamIds(data.cupTeamIds || []);
      setActiveTab("live");
    });
    socket.on("cupHalfTimeResults", (data) => {
      try {
        setIsMatchActionPending(false);
        setIsLiveSimulation(false);
        // Treat the cup halftime exactly like a league halftime:
        // reuse matchResults state so the live tab renders events and score.
        const fixtures = data.fixtures || [];
        setMatchResults({
          matchweek: data.season,
          results: fixtures.map((fx) => ({
            homeTeamId: fx.homeTeam?.id,
            awayTeamId: fx.awayTeam?.id,
            finalHomeGoals: fx.homeGoals,
            finalAwayGoals: fx.awayGoals,
            events: fx.events || [],
            attendance: null,
          })),
        });
        setLiveMinute(45);
        setSubsMade(0);
        setSubbedOut([]);
        setConfirmedSubs([]);
        setSwapSource(null);
        setSwapTarget(null);
        setShowHalftimePanel(true);
        setIsPlayingMatch(true);
        setIsCupMatch(true);
        setCupPreMatch(false);
        setCupMatchRoundName(data.roundName);
        setCupExtraTimeBadge(false);

        // Se o utilizador não está em nenhuma fixture desta ronda (eliminado),
        // auto-ready para não bloquear o servidor que espera por todos.
        const myId = meRef.current?.teamId;
        const userInMatch =
          myId != null &&
          fixtures.some(
            (fx) => fx.homeTeam?.id == myId || fx.awayTeam?.id == myId,
          );
        if (!userInMatch) {
          socket.emit("setReady", true);
        }
      } catch (err) {
        console.error("Error handling cupHalfTimeResults:", err, "data:", data);
      }
    });
    socket.on("cupETHalfTime", (data) => {
      // Gate before extra time — server waits for all coaches to set ready
      try {
        setIsMatchActionPending(false);
        setIsLiveSimulation(false);
        setIsPlayingMatch(false);
        const fixtures = data.fixtures || [];
        setMatchResults({
          matchweek: data.season,
          results: fixtures.map((fx) => ({
            homeTeamId: fx.homeTeam?.id,
            awayTeamId: fx.awayTeam?.id,
            finalHomeGoals: fx.homeGoals,
            finalAwayGoals: fx.awayGoals,
            events: fx.events || [],
            homeLineup: fx.homeLineup || [],
            awayLineup: fx.awayLineup || [],
            attendance: null,
          })),
        });
        setLiveMinute(90);
        setSubsMade(0);
        setSubbedOut([]);
        setConfirmedSubs([]);
        setSwapSource(null);
        setSwapTarget(null);
        setShowHalftimePanel(true);
        setIsCupMatch(true);
        setCupPreMatch(false);
        setCupMatchRoundName(data.roundName);
        setCupExtraTimeBadge(false);

        const myId = meRef.current?.teamId;
        const userInMatch =
          myId != null &&
          fixtures.some(
            (fx) => fx.homeTeam?.id == myId || fx.awayTeam?.id == myId,
          );
        if (!userInMatch) {
          socket.emit("setReady", true);
        }
      } catch (err) {
        console.error("Error handling cupETHalfTime:", err, "data:", data);
      }
    });
    socket.on("cupExtraTimeStart", (data) => {
      // Cup match went to extra time — only animate if the coach's own team is in this fixture
      if (
        data &&
        me.teamId &&
        data.homeTeamId !== me.teamId &&
        data.awayTeamId !== me.teamId
      )
        return;
      setShowHalftimePanel(false);
      setIsCupExtraTime(true);
      setCupExtraTimeBadge(true);
      setLiveMinute(90);
      setIsPlayingMatch(true);
      if (data) {
        setMatchResults((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            results: (prev.results || []).map((r) =>
              r.homeTeamId === data.homeTeamId &&
              r.awayTeamId === data.awayTeamId
                ? {
                    ...r,
                    finalHomeGoals: data.homeGoals,
                    finalAwayGoals: data.awayGoals,
                  }
                : r,
            ),
          };
        });
      }
    });
    socket.on("extraTimeEnded", (data) => {
      // ET is over, prepare for penalties or declare winner
      // Update the score if needed
      if (data) {
        setMatchResults((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            results: (prev.results || []).map((r) =>
              r.homeTeamId === data.homeTeamId &&
              r.awayTeamId === data.awayTeamId
                ? {
                    ...r,
                    finalHomeGoals: data.homeGoals,
                    finalAwayGoals: data.awayGoals,
                  }
                : r,
            ),
          };
        });
      }
    });
    socket.on("extraTimeHalfTime", (data) => {
      // Indicate extra time half-time in the live tab — no ready gate needed
      setCupExtraTimeBadge(true);
      // Update the score for the displayed fixture if we have it
      if (data && data.fixture) {
        setMatchResults((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            results: (prev.results || []).map((r) => {
              if (
                r.homeTeamId === data.fixture.homeTeamId &&
                r.awayTeamId === data.fixture.awayTeamId
              ) {
                return {
                  ...r,
                  finalHomeGoals: data.fixture.homeGoals,
                  finalAwayGoals: data.fixture.awayGoals,
                  events: [...(r.events || []), ...(data.events || [])],
                };
              }
              return r;
            }),
          };
        });
      }
    });
    socket.on("extraTimeSecondHalfStart", (data) => {
      // Second period of extra time — update scores and keep clock running
      if (data && data.fixture) {
        setMatchResults((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            results: (prev.results || []).map((r) =>
              r.homeTeamId === data.fixture.homeTeamId &&
              r.awayTeamId === data.fixture.awayTeamId
                ? {
                    ...r,
                    finalHomeGoals: data.fixture.homeGoals,
                    finalAwayGoals: data.fixture.awayGoals,
                  }
                : r,
            ),
          };
        });
      }
    });
    socket.on("cupRoundResults", (data) => {
      isCupDrawRef.current = false;
      for (const r of data.results || []) {
        const homeName =
          r.homeTeam?.name ||
          teamsRef.current.find((t) => t.id === r.homeTeamId)?.name ||
          "?";
        const awayName =
          r.awayTeam?.name ||
          teamsRef.current.find((t) => t.id === r.awayTeamId)?.name ||
          "?";
        pushTickerItem(
          `Taça: ${homeName} ${r.homeGoals}-${r.awayGoals} ${awayName}`,
          null,
          null,
          r.winnerId || r.homeTeamId,
        );
      }
      setCupRoundResults(data);
      setCupPenaltyPopup(null);
      setShowCupResults(false);
      setActiveTab("cup");
      setIsCupMatch(false);
      setCupPreMatch(false);
      setIsCupExtraTime(false);
      setCupExtraTimeBadge(false);
      setIsPlayingMatch(false);
      setMatchResults(null);
    });
    socket.on("cupSecondHalfStart", (data) => {
      setIsMatchActionPending(false);
      // Identical to matchResults but marks this as a cup second half animation.
      setMatchResults({
        matchweek: data.season,
        results: data.results.map((r) => ({
          homeTeamId: r.homeTeamId,
          awayTeamId: r.awayTeamId,
          finalHomeGoals: r.finalHomeGoals,
          finalAwayGoals: r.finalAwayGoals,
          events: r.events || [],
          attendance: null,
        })),
      });
      setShowHalftimePanel(false);
      setLiveMinute(45);
      setIsPlayingMatch(true);
      setIsCupMatch(true);
      setCupMatchRoundName(data.roundName);
    });
    socket.on("cupPenaltyShootout", (data) => {
      setCupPenaltyPopup(data);
      setCupPenaltyKickIdx(0);
    });
    socket.on("palmaresData", (data) => {
      setPalmares(data);
      setPalmaresTeamId(data.teamId);
    });
    socket.on("clubNewsData", (data) => {
      setClubNews(data.news || []);
    });
    socket.on(
      "clubNewsUpdated",
      ({ teamId, title, playerId, playerName, isAuction }) => {
        // Use meRef (not me) to avoid stale closure — this listener is registered once with [] deps
        const currentMe = meRef.current;
        if (currentMe?.teamId === teamId) {
          socket.emit("requestClubNews", { teamId });
        }
        // Auction transfers are already covered by the auctionClosed handler — skip to avoid duplicates
        if (title && !isAuction) {
          pushTickerItem(
            title,
            playerId || null,
            playerName || null,
            teamId || null,
          );
        }
      },
    );
    socket.on("playerHistoryData", (data) => setPlayerHistoryModal(data));
    socket.on("financeData", (data) => setFinanceData(data));
    socket.on("stadiumBuilt", ({ teamId, teamName, newCapacity }) => {
      pushTickerItem(
        `🏟️ ${teamName} ampliou o estádio para ${newCapacity.toLocaleString("pt-PT")} lugares!`,
        null,
        null,
        teamId,
      );
      // Re-pedir financeData se somos o clube em questão
      const currentMe = meRef.current;
      if (currentMe?.teamId && Number(currentMe.teamId) === Number(teamId)) {
        socket.emit("requestFinanceData", { teamId: currentMe.teamId });
      }
    });
    socket.on("systemMessage", (msg) => addToast(msg));
    socket.on("transferProposalResult", ({ ok, message }) => {
      addToast(message);
      if (ok) setTransferProposalModal(null);
    });
    socket.on("teamAssigned", (data) => {
      const currentMe = meRef.current;
      if (!currentMe?.name || !currentMe?.roomCode) return;
      if (data.isNew) {
        if (!hasSeenWelcome(currentMe.name, currentMe.roomCode)) {
          setWelcomeModal(data);
        }
      } else {
        if (!hasSeenWelcomeThisSession(currentMe.name, currentMe.roomCode)) {
          setWelcomeModal(data);
        }
      }
    });
    socket.on("joinGameSuccess", (data) => {
      const { roomCode, roomName } = data;
      setRoomCode(roomCode);
      setMe((prev) => (prev ? { ...prev, roomCode, roomName } : null));
      if (joinTimerRef.current) clearTimeout(joinTimerRef.current);
    });
    socket.on("joinError", (msg) => {
      setJoinError(msg);
      setJoining(false);
      setMe(null);
      try {
        window.localStorage.removeItem("cashballSession");
      } catch {
        // Ignore storage failures.
      }
      if (joinTimerRef.current) clearTimeout(joinTimerRef.current);
    });

    socket.on("gameState", (data) => {
      setNewsTickerItems([]);
      if (data.matchweek) setMatchweekCount(data.matchweek - 1);
      if (data.tactic) {
        setTactic((prev) => ({
          ...prev,
          ...data.tactic,
          positions: data.tactic.positions || prev.positions || {},
        }));
      }
      if (Array.isArray(data.lockedCoaches)) {
        setLockedCoaches(data.lockedCoaches);
      }
      // Restore match-in-progress state on reconnect
      if (data.matchState === "halftime" && data.lastHalfTimePayload) {
        setMatchResults(data.lastHalfTimePayload);
        setIsPlayingMatch(true);
        setShowHalftimePanel(true);
        setActiveTab("live");
      } else if (
        data.matchState === "running_first_half" ||
        data.matchState === "playing_second_half"
      ) {
        // Match is computing server-side but client has no match data.
        // Keep UI unlocked; halfTimeResults/matchResults will arrive shortly.
        setIsPlayingMatch(false);
        setShowHalftimePanel(false);
        setMatchAction(null);
        setIsMatchActionPending(false);
      } else {
        // Reset match-in-progress flags on (re)join so the sidebar is never
        // stuck hidden after a disconnect/reconnect between matches.
        setIsPlayingMatch(false);
        setShowHalftimePanel(false);
        setMatchAction(null);
        setIsMatchActionPending(false);
      }
    });

    socket.on("roomLocked", ({ coaches }) => {
      setLockedCoaches(coaches || []);
    });

    socket.on("awaitingCoaches", (offline) => {
      setAwaitingCoaches(offline || []);
    });

    socket.on("matchSegmentStart", (data) => {
      setIsMatchActionPending(false);
      setIsLiveSimulation(true);
      setLiveMinute(data.startMin);
      setIsPlayingMatch(true);
      setActiveTab("live");
      // Always sync cup state from the server payload (handles reconnect mid-match)
      if (data.isCup) {
        setIsCupMatch(true);
        if (data.cupRoundName) setCupMatchRoundName(data.cupRoundName);
      } else {
        setIsCupMatch(false);
      }
      if (data.startMin === 1) {
        // First half — set up match UI from scratch
        setShowHalftimePanel(false);
        setSubsMade(0);
        setSubbedOut([]);
        setConfirmedSubs([]);
        setSwapSource(null);
        setSwapTarget(null);
        setMatchResults({
          matchweek: data.matchweek,
          results: (data.fixtures || []).map((f) => ({
            homeTeamId: f.homeTeamId,
            awayTeamId: f.awayTeamId,
            homeTeam: f.homeTeam,
            awayTeam: f.awayTeam,
            finalHomeGoals: f.finalHomeGoals || 0,
            finalAwayGoals: f.finalAwayGoals || 0,
            events: f.events || [],
            attendance: f.attendance || null,
            homeLineup: f.homeLineup || [],
            awayLineup: f.awayLineup || [],
          })),
        });
      } else if (data.startMin === 46) {
        // Second half — dismiss halftime panel, keep existing match data
        setShowHalftimePanel(false);
      }
    });

    socket.on("matchMinuteUpdate", (data) => {
      setLiveMinute(data.minute);
      // Check for penalty suspense events — only show for the player's own match
      const myTeamId = meRef.current?.teamId;
      for (const f of data.fixtures || []) {
        const isMyFixture =
          myTeamId != null &&
          (f.homeTeamId === myTeamId || f.awayTeamId === myTeamId);
        if (!isMyFixture) continue;
        for (const e of f.minuteEvents || []) {
          if (e.penaltySuspense) {
            setPenaltySuspense({
              playerName: e.playerName,
              result: e.penaltyResult,
              team: e.team,
            });
            setTimeout(() => setPenaltySuspense(null), 3000);
          }
        }
      }
      setMatchResults((prev) => {
        if (!prev) return prev;
        const updatedResults = (prev.results || []).map((r) => {
          const update = (data.fixtures || []).find(
            (f) =>
              f.homeTeamId === r.homeTeamId && f.awayTeamId === r.awayTeamId,
          );
          if (!update) return r;
          const existingEvents = r.events || [];
          const newEvents = (update.minuteEvents || []).filter(
            (ne) =>
              !existingEvents.some(
                (ee) =>
                  ee.minute === ne.minute &&
                  ee.type === ne.type &&
                  ee.playerId === ne.playerId,
              ),
          );
          return {
            ...r,
            finalHomeGoals: update.homeGoals,
            finalAwayGoals: update.awayGoals,
            events: [...existingEvents, ...newEvents],
            homeLineup: update.homeLineup?.length
              ? update.homeLineup
              : r.homeLineup,
            awayLineup: update.awayLineup?.length
              ? update.awayLineup
              : r.awayLineup,
          };
        });
        return { ...prev, results: updatedResults };
      });
    });

    socket.on("halfTimeResults", (data) => {
      setIsMatchActionPending(false);
      setIsLiveSimulation(false);
      setMatchResults(data);
      setSubsMade(0);
      setSubbedOut([]); // Reset substituted-out players for the new match
      setConfirmedSubs([]);
      setSwapSource(null);
      setSwapTarget(null);
      setShowHalftimePanel(true);
      setIsPlayingMatch(true);
      setActiveTab("live");
    });

    socket.on("matchActionRequired", (data) => {
      setIsMatchActionPending(true);

      const isTargetCoach = isSameTeamId(data?.teamId, meRef.current?.teamId);
      if (!isTargetCoach) {
        return;
      }

      const normalizedAction = { ...(data || {}) };

      const toCandidate = (player) => {
        if (!player || player.id === undefined || player.id === null) {
          return null;
        }
        return {
          id: player.id,
          name: player.name || "Jogador",
          position: player.position || "MED",
          skill: Number(player.skill || 0),
        };
      };

      const currentSquad = Array.isArray(mySquadRef.current)
        ? mySquadRef.current
        : [];
      const currentPositions = tacticRef.current?.positions || {};

      if (normalizedAction.type === "penalty") {
        const incomingCandidates = (normalizedAction.takerCandidates || [])
          .map(toCandidate)
          .filter(Boolean);

        const titulares = currentSquad.filter(
          (player) => currentPositions[player.id] === "Titular",
        );
        const fallbackBase = titulares.length > 0 ? titulares : currentSquad;
        const fallbackCandidates = fallbackBase
          .map(toCandidate)
          .filter(Boolean);

        normalizedAction.takerCandidates =
          incomingCandidates.length > 0
            ? incomingCandidates
            : fallbackCandidates;
      }

      if (normalizedAction.type === "injury") {
        const incomingBench = (normalizedAction.benchPlayers || [])
          .map(toCandidate)
          .filter(Boolean);

        if (incomingBench.length > 0) {
          normalizedAction.benchPlayers = incomingBench;
        } else {
          // Fallback: use players on the bench in the current tactic
          const suplentes = currentSquad
            .filter((player) => currentPositions[player.id] === "Suplente")
            .map(toCandidate)
            .filter(Boolean);
          normalizedAction.benchPlayers =
            suplentes.length > 0
              ? suplentes
              : currentSquad.map(toCandidate).filter(Boolean);
        }
      }

      setMatchAction(normalizedAction);
      setActiveTab("live");

      clearInterval(injuryCountdownRef.current);
      injuryCountdownRef.current = null;
      setInjuryCountdown(null);

      if (normalizedAction.type === "injury") {
        setInjuryCountdown(60);
        injuryCountdownRef.current = setInterval(() => {
          setInjuryCountdown((prev) => {
            if (prev <= 1) {
              clearInterval(injuryCountdownRef.current);
              injuryCountdownRef.current = null;
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      }
    });

    socket.on("matchActionResolved", () => {
      setIsMatchActionPending(false);
      clearInterval(injuryCountdownRef.current);
      injuryCountdownRef.current = null;
      setInjuryCountdown(null);
      setMatchAction(null);
    });

    // BUG-11 FIX: matchResults clears showHalftimePanel (2nd half replay)
    socket.on("matchResults", (data) => {
      setIsMatchActionPending(false);
      const myTeamId = meRef.current?.teamId;
      const myDivision = teamsRef.current.find(
        (t) => t.id === myTeamId,
      )?.division;
      for (const r of data.results || []) {
        const homeDiv = teamsRef.current.find(
          (t) => t.id === r.homeTeamId,
        )?.division;
        if (myDivision && homeDiv !== myDivision) continue;
        const home =
          r.homeTeam?.name ||
          teamsRef.current.find((t) => t.id === r.homeTeamId)?.name ||
          "?";
        const away =
          r.awayTeam?.name ||
          teamsRef.current.find((t) => t.id === r.awayTeamId)?.name ||
          "?";
        const teamId =
          r.homeTeamId === myTeamId || r.awayTeamId === myTeamId
            ? myTeamId
            : r.homeTeamId;
        pushTickerItem(
          `${home} ${r.finalHomeGoals ?? r.homeGoals ?? "?"}-${r.finalAwayGoals ?? r.awayGoals ?? "?"} ${away}`,
          null,
          null,
          teamId,
        );
      }
      setMatchResults(data);
      setMatchweekCount(data.matchweek);
      setShowHalftimePanel(false);
      setIsCupMatch(false);
      setCupExtraTimeBadge(false);
      setActiveTab("live");

      // If live simulation drove the clock, don't restart a replay.
      // The match is already at minute 90 — just trigger the end-of-match transition.
      if (isLiveSimulationRef.current) {
        setIsLiveSimulation(false);
        setLiveMinute(90);
        setIsPlayingMatch(true);
      } else {
        // Reconnect/fallback: no live simulation was in progress, start a replay
        setLiveMinute(45);
        setIsPlayingMatch(true);
      }

      // Após jogo: todos os jogadores vão a "Não convocado"
      setTactic((prev) => {
        const allExcluded = Object.fromEntries(
          (mySquadRef.current || []).map((p) => [p.id, "Excluído"]),
        );
        const next = { ...prev, positions: allExcluded };
        socket.emit("setTactic", next);
        return next;
      });
    });

    socket.on("coachDismissed", ({ reason, teamName }) => {
      const msg =
        reason === "budget"
          ? `Foste despedido de ${teamName} por insolvência financeira.`
          : `Foste despedido de ${teamName} após má série de resultados.`;
      addToast(msg);
      setJobOfferModal(null);
    });

    socket.on("jobOffer", (data) => setJobOfferModal(data));

    socket.on("chatMessage", (msg) => {
      if (msg.channel === "room") {
        setRoomMessages((prev) => [...prev.slice(-199), msg]);
        setUnreadRoom((prev) =>
          chatOpen && activeChatTab === "room" ? 0 : prev + 1,
        );
      } else if (msg.channel === "global") {
        setGlobalMessages((prev) => [...prev.slice(-199), msg]);
        setUnreadGlobal((prev) =>
          chatOpen && activeChatTab === "global" ? 0 : prev + 1,
        );
      }
    });

    socket.on("chatHistory", ({ channel, messages }) => {
      if (channel === "room") setRoomMessages(messages || []);
      else if (channel === "global") setGlobalMessages(messages || []);
    });

    // BUG-15 FIX: Track socket connection state
    const onConnect = () => {
      setDisconnected(false);
      setJoining(false);
      // Re-join on reconnect using the meRef to avoid stale closure
      const currentMe = meRef.current;
      if (
        currentMe &&
        currentMe.roomCode &&
        currentMe.name &&
        currentMe.password
      ) {
        socket.emit("joinGame", {
          name: currentMe.name,
          password: currentMe.password,
          roomCode: currentMe.roomCode,
        });
      }
    };
    const onDisconnect = () => setDisconnected(true);

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);

    return () => {
      socket.off("teamsData");
      socket.off("teamForms");
      socket.off("playerListUpdate");
      socket.off("mySquad");
      socket.off("marketUpdate");
      socket.off("auctionUpdate");
      socket.off("auctionClosed");
      socket.off("systemMessage");
      socket.off("transferProposalResult");
      socket.off("teamAssigned");
      socket.off("joinGameSuccess");
      socket.off("joinError");
      socket.off("teamSquadData");
      socket.off("nextMatchSummary");
      socket.off("cupDrawStart");
      socket.off("cupPreMatch");
      socket.off("cupHalfTimeResults");
      socket.off("cupETHalfTime");
      socket.off("cupExtraTimeStart");
      socket.off("extraTimeSecondHalfStart");
      socket.off("extraTimeHalfTime");
      socket.off("extraTimeEnded");
      socket.off("cupRoundResults");
      socket.off("cupSecondHalfStart");
      socket.off("cupPenaltyShootout");
      socket.off("palmaresData");
      socket.off("financeData");
      socket.off("stadiumBuilt");
      socket.off("matchSegmentStart");
      socket.off("matchMinuteUpdate");
      socket.off("matchResults");
      socket.off("halfTimeResults");
      socket.off("matchActionRequired");
      socket.off("matchActionResolved");
      socket.off("gameState");
      socket.off("coachDismissed");
      socket.off("jobOffer");
      socket.off("chatMessage");
      socket.off("chatHistory");
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
    };
  }, []); // empty deps — register once only

  // Keep meRef in sync so the onConnect closure above always has the latest me
  useEffect(() => {
    meRef.current = me;
  }, [me]);

  // Auto-scroll chat messages panel
  useEffect(() => {
    if (chatMessagesRef.current) {
      chatMessagesRef.current.scrollTop = chatMessagesRef.current.scrollHeight;
    }
  }, [roomMessages, globalMessages, chatOpen, activeChatTab]);

  // Clear unread when tab is active and chat is open
  useEffect(() => {
    if (!chatOpen) return;
    if (activeChatTab === "room") setUnreadRoom(0);
    else if (activeChatTab === "global") setUnreadGlobal(0);
  }, [chatOpen, activeChatTab]);

  useEffect(() => {
    mySquadRef.current = mySquad;
  }, [mySquad]);

  useEffect(() => {
    tacticRef.current = tactic;
  }, [tactic]);

  useEffect(() => {
    selectedTeamRef.current = selectedTeam;
  }, [selectedTeam]);

  useEffect(() => {
    marketPairsRef.current = marketPairs;
  }, [marketPairs]);

  useEffect(() => {
    if (adminSession) return;
    if (!me?.name || !me?.password || !me?.roomCode) return;
    try {
      window.localStorage.setItem(
        "cashballSession",
        JSON.stringify({
          name: me.name,
          password: me.password,
          roomCode: me.roomCode,
        }),
      );
    } catch {
      // Ignore storage failures.
    }
  }, [me, adminSession]);

  useEffect(() => {
    if (adminSession || !savedSession || me?.teamId) return;
    socket.emit("joinGame", {
      name: savedSession.name,
      password: savedSession.password,
      roomCode: savedSession.roomCode,
    });
    joinTimerRef.current = setTimeout(() => {
      setMe((prev) => (prev && !prev.teamId ? null : prev));
      setJoining(false);
      setJoinError(
        "Sem resposta do servidor. Certifica-te que o servidor está ligado.",
      );
    }, 6000);
    return () => {
      if (joinTimerRef.current) clearTimeout(joinTimerRef.current);
    };
  }, [savedSession, me?.teamId, adminSession]);

  useEffect(() => {
    if (activeTab !== "tactic" || !me?.teamId) return;
    setNextMatchSummaryLoading(true);
    socket.emit("requestNextMatchSummary", { teamId: me.teamId });
  }, [activeTab, me?.teamId, matchweekCount]);

  useEffect(() => {
    if (me && !me.teamId && players.length > 0) {
      const p = players.find((x) => x.name === me.name);
      if (p && p.teamId) {
        // Clear timeout — join succeeded
        if (joinTimerRef.current) clearTimeout(joinTimerRef.current);
        setMe((prev) => ({ ...prev, teamId: p.teamId }));
        setJoining(false);
        setJoinError("");
      }
    }
  }, [players, me]);

  useEffect(() => {
    if (isPlayingMatch) {
      if (isMatchActionPending) return;

      // During live simulation, the server drives liveMinute via matchMinuteUpdate.
      // Don't auto-advance the clock — only handle end-of-match transitions.
      if (isLiveSimulation) {
        if (liveMinute >= 120 && isCupExtraTime) {
          const timer = setTimeout(() => {
            setIsPlayingMatch(false);
            setIsLiveSimulation(false);
            setIsCupExtraTime(false);
            socket.emit("cupExtraTimeDone");
          }, 2000);
          return () => clearTimeout(timer);
        }
        if (liveMinute >= 90 && !isCupExtraTime) {
          const timer = setTimeout(() => {
            setIsPlayingMatch(false);
            setIsLiveSimulation(false);
            if (isCupMatch) {
              socket.emit("cupSecondHalfDone");
            } else {
              socket.emit("leagueAnimDone");
              setActiveTab("standings");
            }
          }, 3000);
          return () => clearTimeout(timer);
        }
        // Otherwise, just wait for the next matchMinuteUpdate from the server
        return;
      }

      // ── Replay mode (reconnect fallback) ──
      const isSecondHalfReplay = !showHalftimePanel;

      if (
        liveMinute < 45 ||
        (liveMinute >= 45 && liveMinute < 90 && isSecondHalfReplay) ||
        (isCupExtraTime && liveMinute >= 90 && liveMinute < 120)
      ) {
        const timer = setTimeout(() => {
          setLiveMinute((m) => m + 1);
        }, 1000);
        return () => clearTimeout(timer);
      } else if (liveMinute === 45 && !isSecondHalfReplay) {
        setIsPlayingMatch(false);
      } else if (liveMinute >= 120 && isCupExtraTime) {
        // Extra time animation finished — notify server
        const timer = setTimeout(() => {
          setIsPlayingMatch(false);
          setIsCupExtraTime(false);
          socket.emit("cupExtraTimeDone");
        }, 2000);
        return () => clearTimeout(timer);
      } else if (liveMinute >= 90 && !isCupExtraTime) {
        const timer = setTimeout(() => {
          setIsPlayingMatch(false);
          if (isCupMatch) {
            socket.emit("cupSecondHalfDone");
          } else {
            socket.emit("leagueAnimDone");
            setActiveTab("standings");
          }
        }, 3000);
        return () => clearTimeout(timer);
      }
    }
  }, [
    isPlayingMatch,
    liveMinute,
    matchResults,
    showHalftimePanel,
    isCupMatch,
    isCupExtraTime,
    isMatchActionPending,
    isLiveSimulation,
  ]);

  // Detect per-minute events: flash goal score & play notification for human matches
  useLayoutEffect(() => {
    if (!isPlayingMatch || !matchResults?.results || liveMinute < 1) return;
    let didFlashGoal = false;
    matchResults.results.forEach((match) => {
      const events = (match.events || []).filter(
        (e) => e.minute === liveMinute,
      );
      if (!events.length) return;
      // Track goal flashes (all matches)
      events.forEach((e) => {
        if (e.type === "goal") {
          const key = `${match.homeTeamId}_${match.awayTeamId}_${e.team}`;
          goalFlashRef.current[key] = Date.now();
          didFlashGoal = true;
        }
      });
      // Sound only for matches involving a human coach
      const hasHuman = players.some(
        (p) => p.teamId === match.homeTeamId || p.teamId === match.awayTeamId,
      );
      if (hasHuman) {
        const notifiable = events.some((e) =>
          ["goal", "red", "injury"].includes(e.type),
        );
        if (notifiable) playNotification();
      }
    });
    if (didFlashGoal) {
      forceGoalFlashRender((value) => value + 1);
    }
  }, [liveMinute]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!mySquad.length) return;
    if (tactic.positions && Object.keys(tactic.positions).length > 0) return;

    const autoPositions = buildAutoPositions(
      mySquad,
      tactic.formation,
      matchweekCount + 1,
    );
    if (Object.keys(autoPositions).length === 0) return;

    setTactic((prev) => {
      if (prev.positions && Object.keys(prev.positions).length > 0) return prev;
      const next = { ...prev, positions: autoPositions };
      socket.emit("setTactic", next);
      return next;
    });
  }, [mySquad, tactic.formation, tactic.positions, matchweekCount]);

  const selectJoinMode = (mode) => {
    setJoinMode(mode);
    setRoomCode("");
    setJoinError("");
  };

  const resetAuthFlow = () => {
    setAuthPhase("login");
    setJoinMode(null);
    setRoomCode("");
    setJoinError("");
    setAuthError("");
    setAuthSubmitting(false);
  };

  const resetGameState = () => {
    setTeams([]);
    setTeamForms({});
    setPlayers([]);
    setMySquad([]);
    setMarketPairs([]);
    setTopScorers([]);
    setMatchResults(null);
    setMatchweekCount(0);
    setActiveTab("players");
    setTactic(DEFAULT_TACTIC);
    setLockedCoaches([]);
    setAwaitingCoaches([]);
    setNextMatchSummary(null);
    setNextMatchSummaryLoading(false);
    setIsPlayingMatch(false);
    setIsLiveSimulation(false);
    setShowHalftimePanel(false);
    setMatchAction(null);
    setIsMatchActionPending(false);
    setLiveMinute(90);
    setSubsMade(0);
    setSwapSource(null);
    setSwapTarget(null);
    setSubbedOut([]);
    setConfirmedSubs([]);
    setRefereePopup(null);
    setCupDraw(null);
    setShowCupDrawPopup(false);
    setCupRoundResults(null);
    setShowCupResults(false);
    setCupPenaltyPopup(null);
    setWelcomeModal(null);
    setIsCupMatch(false);
    setCupPreMatch(false);
    setCupMatchRoundName("");
    setCupExtraTimeBadge(false);
    setIsCupExtraTime(false);
    setCupActiveTeamIds([]);
    setPalmares({ trophies: [], allChampions: [] });
    setPalmaresTeamId(null);
    setSelectedTeam(null);
    setSelectedTeamSquad([]);
    setSelectedTeamLoading(false);
    setSelectedAuctionPlayer(null);
    setAuctionBid("");
    setMyAuctionBid(null);
    setAuctionResult(null);
  };

  const handleAuthenticate = async (mode) => {
    if (!name || !password || authSubmitting) return;

    setAuthSubmitting(true);
    setAuthError("");

    try {
      const response = await fetch(`${backendUrl}/auth/${mode}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: name.trim(),
          password,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setAuthError(data.error || "Não foi possível autenticar a conta.");
        return;
      }

      setName(name.trim());
      setConfirmPassword("");
      setJoinMode(null);
      setRoomCode("");
      setJoinError("");
      setAuthPhase("mode");
    } catch {
      setAuthError("Sem ligação ao servidor. Tenta novamente.");
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleAdminAuthenticate = async () => {
    if (!name || !password || authSubmitting) return;

    setAuthSubmitting(true);
    setAuthError("");

    try {
      const response = await fetch(`${backendUrl}/admin/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: name.trim(),
          password,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setAuthError(data.error || "Não foi possível autenticar o admin.");
        return;
      }

      const session = {
        token: data.token,
        username: data.username,
        expiresAt: Date.now() + Number(data.expiresIn || 0),
      };
      saveAdminSession(session);
      setAdminSession(session);
      setMe(null);
      setJoining(false);
      setJoinMode(null);
      setRoomCode("");
      setJoinError("");
      setAuthPhase("login");
    } catch {
      setAuthError("Sem ligação ao servidor. Tenta novamente.");
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleLogout = () => {
    try {
      window.localStorage.removeItem("cashballSession");
    } catch {
      // ignore
    }
    resetGameState();
    setMe(null);
    setName("");
    setPassword("");
    setConfirmPassword("");
    setRoomCode("");
    setJoining(false);
    setJoinError("");
    resetAuthFlow();
  };

  const handleAdminLogout = () => {
    clearAdminSession();
    setAdminSession(null);
    setName("");
    setPassword("");
    setConfirmPassword("");
    setRoomCode("");
    setJoining(false);
    setJoinError("");
    setAuthError("");
    setAuthPhase("login");
    setJoinMode(null);
  };

  const handleJoin = () => {
    if (name && password && roomCode && !joining) {
      resetGameState();
      setJoinError("");
      setJoining(true);
      socket.emit("joinGame", {
        name,
        password,
        roomCode: joinMode === "new-game" ? "" : roomCode.toUpperCase(),
        roomName: joinMode === "new-game" ? roomCode.toUpperCase() : "",
        joinMode,
      });
      // Temporarily set me name/password. roomCode and roomName will be set in joinGameSuccess.
      setMe({ name, password, roomCode: "" });
      // Timeout: if no roomCode received in 6s, reset and show error
      joinTimerRef.current = setTimeout(() => {
        setMe((prev) => (prev && !prev.teamId ? null : prev));
        setJoining(false);
        setJoinError(
          "Sem resposta do servidor. Certifica-te que o servidor está ligado.",
        );
      }, 6000);
    }
  };

  const handleReady = () => {
    // Normal ready toggle for idle matchState
    const isReady = players.find((p) => p.name === me?.name)?.ready;
    socket.emit("setReady", !isReady);
  };

  const handleHalftimeReady = () => {
    socket.emit("setReady", true);
  };

  const handleOpenTeamSquad = (team) => {
    if (!team) return;
    setSelectedTeam(team);
    setSelectedTeamSquad([]);
    setSelectedTeamLoading(true);
    socket.emit("requestTeamSquad", team.id);
    socket.emit("requestPalmares", { teamId: team.id });
  };

  const handleCloseTeamSquad = () => {
    setSelectedTeam(null);
    setSelectedTeamSquad([]);
    setSelectedTeamLoading(false);
  };

  const closeRefereePopup = () => setRefereePopup(null);

  // Cup draw reveal animation
  useEffect(() => {
    if (!showCupDrawPopup || !cupDraw) return;
    const totalTeams = (cupDraw.fixtures || []).length * 2;
    if (cupDrawRevealIdx >= totalTeams) return;
    const delay = cupDraw.humanInCup ? 700 : 200;
    const timer = setTimeout(() => setCupDrawRevealIdx((i) => i + 1), delay);
    return () => clearTimeout(timer);
  }, [showCupDrawPopup, cupDraw, cupDrawRevealIdx]);

  // Auto-close draw popup when no human in cup
  useEffect(() => {
    if (!showCupDrawPopup || !cupDraw || cupDraw.humanInCup) return;
    const totalTeams = (cupDraw.fixtures || []).length * 2;
    if (cupDrawRevealIdx >= totalTeams) {
      const timer = setTimeout(() => {
        setShowCupDrawPopup(false);
        socket.emit("cupDrawAcknowledged");
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [showCupDrawPopup, cupDraw, cupDrawRevealIdx]);

  // Penalty shootout progressive reveal: one kick every 3.5 s (for suspense)
  useEffect(() => {
    if (!cupPenaltyPopup) return;
    const total = (cupPenaltyPopup.kicks || []).length;
    if (cupPenaltyKickIdx >= total) return;
    const timer = setTimeout(() => setCupPenaltyKickIdx((i) => i + 1), 3500);
    return () => clearTimeout(timer);
  }, [cupPenaltyPopup, cupPenaltyKickIdx]);

  // Load own palmares when Clube or Classificações tab is opened
  useEffect(() => {
    if ((activeTab !== "club" && activeTab !== "standings") || !me?.teamId)
      return;
    socket.emit("requestPalmares", { teamId: me.teamId });
    if (activeTab === "club") {
      socket.emit("requestClubNews", { teamId: me.teamId });
    }
  }, [activeTab, me?.teamId]);

  // Load finance data when Finanças tab is opened
  useEffect(() => {
    if (activeTab !== "finances" || !me?.teamId) return;
    socket.emit("requestFinanceData", { teamId: me.teamId });
  }, [activeTab, me?.teamId, matchweekCount]);

  // Refresh calendar whenever the tab is opened or a matchweek advances
  useEffect(() => {
    if (activeTab !== "calendario") return;
    socket.emit("requestCalendar");
  }, [activeTab, matchweekCount]);

  // Close status picker when clicking anywhere outside
  useEffect(() => {
    if (!openStatusPickerId) return;
    const close = () => setOpenStatusPickerId(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [openStatusPickerId]);

  const handleResolveMatchAction = (playerId) => {
    if (!matchAction) return;
    socket.emit("resolveMatchAction", {
      actionId: matchAction.actionId,
      teamId: matchAction.teamId,
      playerId,
    });
  };

  // ── TACTIC ────────────────────────────────────────────────────────────────
  const updateTactic = useCallback((patch) => {
    setTactic((prev) => {
      const next = { ...prev, ...patch };
      socket.emit("setTactic", next);
      return next;
    });
  }, []);

  const handleAutoPick = useCallback(
    (formation) => {
      const autoPositions = buildAutoPositions(
        mySquad,
        formation,
        matchweekCount + 1,
      );
      setTactic((prev) => {
        const next = { ...prev, formation, positions: autoPositions };
        socket.emit("setTactic", next);
        return next;
      });
    },
    [matchweekCount, mySquad],
  );

  // ── SUBSTITUTION SWAP ─────────────────────────────────────────────────────
  // Step 1: click a Titular to mark as OUT
  const handleSelectOut = useCallback((playerId) => {
    setSwapSource((prev) => (prev === playerId ? null : playerId));
    setSwapTarget(null);
  }, []);

  // Step 2: click a Suplente to mark as IN
  const handleSelectIn = useCallback((playerId) => {
    setSwapTarget((prev) => (prev === playerId ? null : playerId));
  }, []);

  // Confirm the pending swap
  const handleConfirmSub = useCallback(() => {
    if (!swapSource || !swapTarget || subsMade >= MAX_MATCH_SUBS) return;
    setTactic((prevTactic) => {
      const newPositions = { ...prevTactic.positions };
      newPositions[swapSource] = "Suplente";
      newPositions[swapTarget] = "Titular";
      const next = { ...prevTactic, positions: newPositions };
      socket.emit("setTactic", next);
      return next;
    });
    setSubbedOut((prev) => [...prev, swapSource]);
    setConfirmedSubs((prev) => [...prev, { out: swapSource, in: swapTarget }]);
    setSubsMade((n) => n + 1);
    setSwapSource(null);
    setSwapTarget(null);
  }, [swapSource, swapTarget, subsMade]);

  // Reset pending selection without applying
  const handleResetSub = useCallback(() => {
    setSwapSource(null);
    setSwapTarget(null);
  }, []);

  // ── SQUAD STATUS PICKER ───────────────────────────────────────────────────
  const handleSetPlayerStatus = useCallback(
    (playerId, status) => {
      setTactic((prev) => {
        const newPositions = { ...prev.positions };

        // Block: injured or suspended players cannot be convoked
        if (status === "Titular" || status === "Suplente") {
          const player = mySquad.find((p) => p.id === playerId);
          if (player && !isPlayerAvailable(player, matchweekCount + 1))
            return prev;
        }

        // Block: no more than 5 suplentes
        if (status === "Suplente") {
          const currentSubs = Object.entries(newPositions).filter(
            ([id, s]) => s === "Suplente" && Number(id) !== playerId,
          ).length;
          if (currentSubs >= 5) return prev; // silently ignore
        }

        // If setting this player as Titular and they are a GR, demote any other
        // GR who is already Titular to Suplente (only 1 GR Titular allowed).
        if (status === "Titular") {
          const player = mySquad.find((p) => p.id === playerId);
          if (player?.position === "GR") {
            mySquad.forEach((p) => {
              if (
                p.id !== playerId &&
                p.position === "GR" &&
                newPositions[p.id] === "Titular"
              ) {
                newPositions[p.id] = "Suplente";
              }
            });
          }
        }

        newPositions[playerId] = status;
        const next = { ...prev, positions: newPositions };
        socket.emit("setTactic", next);
        return next;
      });
      setOpenStatusPickerId(null);
    },
    [mySquad, matchweekCount],
  );

  // ── MARKET ACTIONS ────────────────────────────────────────────────────────
  const buyPlayer = useCallback((playerId) => {
    socket.emit("buyPlayer", playerId);
  }, []);

  const renewPlayerContract = useCallback((player) => {
    const defaultWage = Math.round(
      Math.max(player.wage || 0, (player.skill || 0) * 70) * 1.15,
    );
    const wage = window.prompt(
      `Novo salário semanal para ${player.name} (€/semana)`,
      String(defaultWage),
    );
    if (wage === null) return;
    const offeredWage = Number(wage);
    if (!Number.isFinite(offeredWage) || offeredWage <= 0) return;
    socket.emit("renewContract", { playerId: player.id, offeredWage });
  }, []);

  const listPlayerAuction = useCallback((player) => {
    const defaultPrice = Math.round((player.value || 0) * 0.8);
    const startingPrice = window.prompt(
      `Valor de licitação base para ${player.name} (€)`,
      String(defaultPrice),
    );
    if (startingPrice === null) return;
    const price = Number(startingPrice);
    if (!Number.isFinite(price) || price <= 0) return;
    socket.emit("listPlayerForTransfer", {
      playerId: player.id,
      mode: "auction",
      startingPrice: price,
    });
  }, []);

  const listPlayerFixed = useCallback((player) => {
    const defaultPrice = Math.round((player.value || 0) * 1.1);
    const price = window.prompt(
      `Preço fixo para ${player.name} (€)`,
      String(defaultPrice),
    );
    if (price === null) return;
    const fixedPrice = Number(price);
    if (!Number.isFinite(fixedPrice) || fixedPrice <= 0) return;
    socket.emit("listPlayerForTransfer", {
      playerId: player.id,
      mode: "fixed",
      price: fixedPrice,
    });
  }, []);

  const removeFromTransferList = useCallback((player) => {
    if (!confirm(`Retirar ${player.name} da lista de transferências?`)) return;
    socket.emit("removeFromTransferList", player.id);
  }, []);

  // ── AUCTION BID ───────────────────────────────────────────────────────────
  const openAuctionBid = useCallback((player) => {
    if (!player) return;
    setSelectedAuctionPlayer(player);
    setIsAuctionExpanded(false);
    setAuctionBid("");
    setMyAuctionBid(null);
    setAuctionResult(null);
  }, []);

  const closeAuctionBid = useCallback(() => {
    setSelectedAuctionPlayer(null);
    setIsAuctionExpanded(false);
    setAuctionBid("");
    setMyAuctionBid(null);
    setAuctionResult(null);
  }, []);

  const submitAuctionBid = useCallback(() => {
    setSelectedAuctionPlayer((prev) => {
      if (!prev) return prev;
      const amount = Number(auctionBid);
      if (!Number.isFinite(amount) || amount <= 0) return prev;
      socket.emit("placeAuctionBid", {
        playerId: prev.playerId || prev.id,
        bidAmount: amount,
      });
      return prev;
    });
  }, [auctionBid]);

  const filteredMarketPlayers = useMemo(() => {
    const marketTeamId = me?.teamId;
    const normalizedPosition = marketPositionFilter;

    const getPlayerPrice = (player) => {
      const isListed =
        player.transfer_status && player.transfer_status !== "none";
      return isListed
        ? player.transfer_price || player.value * 0.75
        : player.value * 1.2;
    };

    const comparePlayers = (a, b) => {
      if (marketSort === "price-asc") {
        return getPlayerPrice(a) - getPlayerPrice(b);
      }
      if (marketSort === "price-desc") {
        return getPlayerPrice(b) - getPlayerPrice(a);
      }
      if (marketSort === "quality-asc") {
        return (a.skill || 0) - (b.skill || 0);
      }
      return (b.skill || 0) - (a.skill || 0);
    };

    const myBudget = teams.find((t) => t.id == me?.teamId)?.budget ?? Infinity;

    return marketPairs
      .filter((player) => player.team_id !== marketTeamId)
      .filter((player) => {
        // Hide auctions whose starting bid exceeds our cash balance
        if (player.transfer_status === "auction") {
          const startingPrice =
            player.auction_starting_price || player.transfer_price || 0;
          if (startingPrice > myBudget) return false;
        }
        return true;
      })
      .filter((player) =>
        normalizedPosition === "all"
          ? true
          : player.position === normalizedPosition,
      )
      .map((player) => ({
        ...player,
        marketPrice: getPlayerPrice(player),
      }))
      .sort(comparePlayers);
  }, [marketPairs, marketPositionFilter, marketSort, me?.teamId, teams]);

  if (adminSession) {
    return (
      <AdminPanel
        token={adminSession.token}
        username={adminSession.username}
        onLogout={handleAdminLogout}
      />
    );
  }

  if (!me || !me.teamId) {
    if (joining && me) {
      return (
        <div className="min-h-screen bg-surface text-on-surface flex flex-col items-center justify-center p-6">
          <h1 className="text-5xl font-headline font-black text-primary mb-6 tracking-tight">
            CashBall <span className="text-on-surface">26/27</span>
          </h1>
          <div className="bg-surface-container p-8 rounded-md w-full max-w-md relative overflow-hidden shadow-2xl text-center">
            <div className="absolute top-0 inset-x-0 h-0.5 bg-linear-to-r from-primary via-primary to-transparent"></div>
            <p className="text-[10px] uppercase tracking-[0.35em] text-on-surface-variant font-bold mb-3">
              Sessão guardada
            </p>
            <p className="text-2xl font-headline font-black text-on-surface mb-1">
              A reconectar...
            </p>
            <p className="text-xs text-on-surface-variant font-medium tracking-wide">
              {me.name} · {me.roomCode?.toUpperCase()}
            </p>
          </div>
        </div>
      );
    }

    const registerPasswordMismatch =
      confirmPassword !== "" && password !== confirmPassword;

    return (
      <div className="min-h-screen bg-surface text-on-surface flex flex-col relative overflow-hidden">
        {/* Background layer */}
        <div className="pointer-events-none fixed inset-0 z-0">
          <div className="absolute inset-0 grid-lines"></div>
          <div className="absolute inset-0 pitch-glow"></div>
          <div className="absolute inset-0 bg-linear-to-b from-transparent via-surface/20 to-surface/70"></div>
        </div>

        {/* Sticky header */}
        <header className="z-10 w-full border-b border-outline-variant/25 bg-surface/80 backdrop-blur-md sticky top-0">
          <div className="max-w-7xl mx-auto px-6 lg:px-10 h-16 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="text-2xl">⚽</span>
              <span className="font-headline font-black text-xl tracking-tighter">
                Cash<span className="text-tertiary">Ball</span>
                <span className="text-on-surface-variant font-bold ml-2 text-sm">
                  26/27
                </span>
              </span>
            </div>
            <div className="flex items-center gap-2 bg-primary/10 border border-primary/20 px-3 py-1.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
              <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary hidden sm:block">
                Época 26/27 · Activa
              </span>
            </div>
          </div>
        </header>

        {/* Hero + Auth card */}
        <div className="relative z-10 flex-1 flex flex-col lg:flex-row items-center justify-center gap-12 lg:gap-16 px-6 sm:px-10 lg:px-16 py-14 max-w-7xl mx-auto w-full">
          {/* Left: Hero copy */}
          <div className="w-full lg:w-1/2 flex flex-col items-start text-left">
            <div className="inline-flex items-center gap-2 border border-outline-variant/40 bg-surface-container px-3 py-1 rounded-full mb-8">
              <span className="text-[10px] font-black uppercase tracking-[0.35em] text-on-surface-variant">
                Gestão de Futebol Multiplayer
              </span>
            </div>
            <h1 className="font-headline font-black leading-none tracking-tighter mb-8">
              <span className="block text-6xl sm:text-7xl lg:text-[5.5rem] text-on-surface">
                TREINA.
              </span>
              <span className="block text-6xl sm:text-7xl lg:text-[5.5rem] text-tertiary drop-shadow-[0_0_32px_rgba(233,195,73,0.2)]">
                PROSPERA.
              </span>
              <span className="block text-6xl sm:text-7xl lg:text-[5.5rem] text-on-surface">
                REPETE.
              </span>
            </h1>
            <p className="text-base text-on-surface-variant leading-relaxed mb-10 max-w-md">
              A evolução moderna da gestão de futebol clássica. Controla as
              tácticas, as finanças e o destino do teu clube em ligas
              multiplayer com até 8 treinadores.
            </p>
            <div className="flex flex-wrap gap-3">
              {[
                { icon: "🏆", label: "Divisões", value: "4 Ligas" },
                { icon: "👥", label: "Treinadores", value: "Até 8" },
                { icon: "⚡", label: "Simulação", value: "Ao vivo" },
              ].map(({ icon, label, value }) => (
                <div
                  key={label}
                  className="flex items-center gap-2.5 bg-surface-container border border-outline-variant/30 px-4 py-2.5 rounded-lg"
                >
                  <span className="text-lg">{icon}</span>
                  <div>
                    <p className="text-[9px] uppercase tracking-wider text-on-surface-variant font-bold leading-none mb-0.5">
                      {label}
                    </p>
                    <p className="text-sm font-black text-on-surface leading-none">
                      {value}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Auth glass card */}
          <div className="w-full lg:w-1/2 flex justify-center lg:justify-end">
            <div className="glass-card rounded-2xl w-full max-w-md relative overflow-hidden shadow-2xl">
              {/* Corner accents */}
              <div className="absolute top-2 right-2 w-12 h-12 border-t border-r border-primary/25 rounded-tr-xl pointer-events-none"></div>
              <div className="absolute bottom-2 left-2 w-12 h-12 border-b border-l border-primary/25 rounded-bl-xl pointer-events-none"></div>
              {/* Top accent bar */}
              <div className="absolute top-0 inset-x-0 h-0.5 bg-linear-to-r from-primary/40 via-primary to-primary/40"></div>

              {/* ─── LOGIN PHASE ───────────────────────── */}
              {authPhase === "login" && (
                <div className="p-8 space-y-5">
                  <div className="space-y-1 text-center mb-4">
                    <p className="text-[10px] text-on-surface-variant uppercase font-black tracking-[0.4em]">
                      Painel do Treinador
                    </p>
                    <h2 className="text-2xl font-headline font-black text-on-surface tracking-tight">
                      Acede à tua conta
                    </h2>
                    <p className="text-xs text-on-surface-variant">
                      Depois escolhes novo jogo, época guardada ou amigos.
                    </p>
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase text-on-surface-variant mb-2 font-bold tracking-wider">
                      Nome de Treinador
                    </label>
                    <input
                      type="text"
                      className="w-full bg-surface border border-outline-variant p-4 rounded-sm text-on-surface text-lg font-black outline-none transition-all placeholder:text-on-surface-variant/40 focus:ring-2 focus:ring-primary"
                      value={name}
                      placeholder="Ex: Amorim"
                      onChange={(e) => {
                        setName(e.target.value);
                        setAuthError("");
                      }}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase text-on-surface-variant mb-2 font-bold tracking-wider">
                      Palavra-passe
                    </label>
                    <input
                      type="password"
                      className="w-full bg-surface border border-outline-variant p-4 rounded-sm text-on-surface text-lg font-black outline-none transition-all placeholder:text-on-surface-variant/40 focus:ring-2 focus:ring-primary"
                      value={password}
                      placeholder="••••••••"
                      onChange={(e) => {
                        setPassword(e.target.value);
                        setAuthError("");
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleAuthenticate("login");
                      }}
                    />
                  </div>
                  <button
                    onClick={() => handleAuthenticate("login")}
                    disabled={!name.trim() || !password || authSubmitting}
                    className="w-full bg-primary hover:brightness-110 disabled:bg-surface-bright disabled:text-on-surface-variant text-on-primary py-4 rounded font-black text-base uppercase tracking-[0.2em] transition-all active:scale-95"
                  >
                    {authSubmitting ? "A VALIDAR..." : "ENTRAR"}
                  </button>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={handleAdminAuthenticate}
                      disabled={!name.trim() || !password || authSubmitting}
                      className="border border-cyan-500/30 bg-cyan-500/10 hover:bg-cyan-500/20 disabled:bg-surface-container disabled:text-on-surface-variant text-cyan-100 py-3 rounded font-black text-xs uppercase tracking-[0.2em] transition-all"
                    >
                      Admin
                    </button>
                    <button
                      onClick={() => {
                        setConfirmPassword("");
                        setAuthError("");
                        setJoinError("");
                        setAuthPhase("register");
                      }}
                      className="border border-outline-variant/60 bg-surface-container hover:border-primary/40 text-on-surface py-3 rounded font-black text-xs uppercase tracking-[0.2em] transition-all"
                    >
                      Criar conta
                    </button>
                  </div>
                  {authError && (
                    <p className="text-red-400 text-sm text-center font-bold">
                      ⚠️ {authError}
                    </p>
                  )}
                  {!authError && disconnected && (
                    <p className="text-red-400 text-sm text-center font-bold">
                      ⚠️ Sem ligação ao servidor. Tenta novamente.
                    </p>
                  )}
                </div>
              )}

              {/* ─── REGISTER PHASE ────────────────────── */}
              {authPhase === "register" && (
                <div className="p-8 space-y-5">
                  <button
                    onClick={resetAuthFlow}
                    className="text-xs text-zinc-500 hover:text-zinc-300 font-black uppercase tracking-widest flex items-center gap-1"
                  >
                    ← Voltar
                  </button>
                  <div className="space-y-1 text-center">
                    <p className="text-[10px] text-on-surface-variant uppercase font-black tracking-[0.4em]">
                      Nova conta
                    </p>
                    <h2 className="text-2xl font-headline font-black text-on-surface tracking-tight">
                      Cria a tua conta de treinador
                    </h2>
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase text-on-surface-variant mb-2 font-bold tracking-wider">
                      Nome de Treinador
                    </label>
                    <input
                      type="text"
                      className="w-full bg-surface border border-outline-variant p-4 rounded-sm text-on-surface text-lg font-black outline-none transition-all placeholder:text-on-surface-variant/40 focus:ring-2 focus:ring-primary"
                      value={name}
                      placeholder="Ex: Amorim"
                      onChange={(e) => {
                        setName(e.target.value);
                        setAuthError("");
                      }}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase text-on-surface-variant mb-2 font-bold tracking-wider">
                      Palavra-passe
                    </label>
                    <input
                      type="password"
                      className="w-full bg-surface border border-outline-variant p-4 rounded-sm text-on-surface text-lg font-black outline-none transition-all placeholder:text-on-surface-variant/40 focus:ring-2 focus:ring-primary"
                      value={password}
                      placeholder="••••••••"
                      onChange={(e) => {
                        setPassword(e.target.value);
                        setAuthError("");
                      }}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase text-on-surface-variant mb-2 font-bold tracking-wider">
                      Confirmar Palavra-passe
                    </label>
                    <input
                      type="password"
                      className={`w-full bg-surface border p-4 rounded-sm text-on-surface text-lg font-black outline-none transition-all placeholder:text-on-surface-variant/40 focus:ring-2 ${registerPasswordMismatch ? "border-red-500 focus:ring-red-500" : "border-outline-variant focus:ring-primary"}`}
                      value={confirmPassword}
                      placeholder="••••••••"
                      onChange={(e) => {
                        setConfirmPassword(e.target.value);
                        setAuthError("");
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !registerPasswordMismatch) {
                          handleAuthenticate("register");
                        }
                      }}
                    />
                    {registerPasswordMismatch && (
                      <p className="text-red-400 text-xs mt-1 font-bold">
                        As palavras-passe não coincidem.
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => handleAuthenticate("register")}
                    disabled={
                      !name.trim() ||
                      !password ||
                      authSubmitting ||
                      registerPasswordMismatch
                    }
                    className="w-full bg-primary hover:brightness-110 disabled:bg-surface-container disabled:text-on-surface-variant text-on-primary py-4 rounded font-black text-base uppercase tracking-[0.2em] transition-all active:scale-95"
                  >
                    {authSubmitting ? "A CRIAR CONTA..." : "CRIAR CONTA"}
                  </button>
                  {authError && (
                    <p className="text-red-400 text-sm text-center font-bold">
                      ⚠️ {authError}
                    </p>
                  )}
                  {!authError && disconnected && (
                    <p className="text-red-400 text-sm text-center font-bold">
                      ⚠️ Sem ligação ao servidor. Tenta novamente.
                    </p>
                  )}
                </div>
              )}

              {/* ─── MODE PHASE ────────────────────────── */}
              {authPhase === "mode" && (
                <div className="p-8 space-y-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-[10px] text-on-surface-variant uppercase font-black tracking-[0.4em] mb-1">
                        Sessão autenticada
                      </p>
                      <h2 className="text-2xl font-headline font-black text-on-surface tracking-tight">
                        Escolhe como jogar
                      </h2>
                      <p className="text-sm text-zinc-400 font-medium mt-1">
                        {name} já está autenticado.
                      </p>
                    </div>
                    <button
                      onClick={resetAuthFlow}
                      className="shrink-0 text-xs text-on-surface-variant hover:text-on-surface font-black uppercase tracking-widest"
                    >
                      Trocar conta
                    </button>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <button
                      onClick={() => selectJoinMode("new-game")}
                      className={`rounded-lg border p-4 text-left transition-all ${joinMode === "new-game" ? "border-primary bg-primary/10" : "border-outline-variant/20 bg-surface hover:border-outline-variant"}`}
                    >
                      <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded bg-primary/15 text-primary">
                        ✦
                      </div>
                      <p className="text-[10px] uppercase tracking-[0.3em] text-primary font-black mb-0.5">
                        Novo jogo
                      </p>
                      <p className="text-sm font-black text-white">Novo jogo</p>
                      <p className="mt-1 text-xs text-on-surface-variant leading-relaxed">
                        Começa do zero e recebe uma nova sala.
                      </p>
                    </button>

                    <button
                      onClick={() => selectJoinMode("saved-game")}
                      className={`rounded-lg border p-4 text-left transition-all ${joinMode === "saved-game" ? "border-primary bg-primary/10" : "border-outline-variant/20 bg-surface hover:border-outline-variant"}`}
                    >
                      <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded bg-primary/15 text-primary">
                        ⟲
                      </div>
                      <p className="text-[10px] uppercase tracking-[0.3em] text-primary font-black mb-0.5">
                        Save
                      </p>
                      <p className="text-sm font-black text-white">
                        Continuar jogo
                      </p>
                      <p className="mt-1 text-xs text-on-surface-variant leading-relaxed">
                        Reabre uma época guardada.
                      </p>
                    </button>

                    <button
                      onClick={() => selectJoinMode("friend-room")}
                      className={`rounded-lg border p-4 text-left transition-all ${joinMode === "friend-room" ? "border-primary bg-primary/10" : "border-outline-variant/20 bg-surface hover:border-outline-variant"}`}
                    >
                      <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded bg-primary/15 text-primary">
                        ↗
                      </div>
                      <p className="text-[10px] uppercase tracking-[0.3em] text-primary font-black mb-0.5">
                        Amigos
                      </p>
                      <p className="text-sm font-black text-white">
                        Juntar a amigos
                      </p>
                      <p className="mt-1 text-xs text-on-surface-variant leading-relaxed">
                        Junta-te com um código de sala.
                      </p>
                    </button>
                  </div>

                  {joinMode === "new-game" && (
                    <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/8 p-4">
                      <label className="block text-[10px] uppercase text-on-surface-variant mb-2 font-bold tracking-[0.3em]">
                        Nome do novo jogo
                      </label>
                      <input
                        type="text"
                        className="w-full bg-surface border border-outline-variant p-4 rounded-sm text-on-surface text-lg font-black outline-none transition-all placeholder:text-on-surface-variant/40 focus:ring-2 focus:ring-primary uppercase"
                        value={roomCode}
                        placeholder="INVERNO"
                        onChange={(e) =>
                          setRoomCode(e.target.value.toUpperCase())
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleJoin();
                        }}
                      />
                      <p className="text-sm font-bold text-on-surface-variant/80">
                        Ficarás com um clube mágico da 4ª Divisão.
                      </p>
                    </div>
                  )}

                  {joinMode === "saved-game" && (
                    <div className="space-y-3 rounded-lg border border-primary/20 bg-surface-container p-4">
                      <label className="block text-[10px] uppercase text-cyan-300 mb-2 font-bold tracking-[0.3em]">
                        As tuas Salas Gravadas
                      </label>
                      {availableSaves.length === 0 ? (
                        <p className="text-on-surface-variant text-sm mt-2">
                          Nenhum save encontrado para este treinador.
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {availableSaves.map((save) => (
                            <div
                              key={save.code}
                              onClick={() => setRoomCode(save.code)}
                              className={`flex items-center justify-between gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-all ${
                                roomCode === save.code
                                  ? "border-cyan-500 bg-cyan-500/15 text-white"
                                  : "border-outline-variant/20 bg-surface text-on-surface-variant hover:border-outline-variant hover:text-on-surface"
                              }`}
                            >
                              <div className="flex flex-col flex-1 min-w-0">
                                <span className="font-black text-sm uppercase tracking-widest">
                                  {save.name}
                                </span>
                                <span className="text-xs text-on-surface-variant/60">
                                  {save.code}
                                </span>
                              </div>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (
                                    !window.confirm(
                                      `Apagar a sala "${save.name}" permanentemente?`,
                                    )
                                  )
                                    return;
                                  fetch(
                                    `${backendUrl}/saves/${encodeURIComponent(save.code)}`,
                                    {
                                      method: "DELETE",
                                      headers: {
                                        "Content-Type": "application/json",
                                      },
                                      body: JSON.stringify({ name, password }),
                                    },
                                  )
                                    .then((r) => r.json())
                                    .then((data) => {
                                      if (data.ok) {
                                        setAvailableSaves((prev) =>
                                          prev.filter(
                                            (s) => s.code !== save.code,
                                          ),
                                        );
                                        if (roomCode === save.code)
                                          setRoomCode("");
                                      } else {
                                        alert(
                                          data.error || "Erro ao apagar sala.",
                                        );
                                      }
                                    })
                                    .catch(() =>
                                      alert("Erro de ligação ao servidor."),
                                    );
                                }}
                                className="shrink-0 text-on-surface-variant/50 hover:text-error transition-colors p-1"
                                title="Apagar sala"
                              >
                                🗑️
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {joinMode === "friend-room" && (
                    <div className="space-y-3 rounded-lg border border-primary/20 bg-surface-container p-4">
                      <label className="block text-[10px] uppercase text-emerald-300 mb-2 font-bold tracking-[0.3em]">
                        Código da Sala do Amigo
                      </label>
                      <input
                        type="text"
                        className="w-full bg-surface border border-outline-variant p-4 rounded-sm text-on-surface text-lg font-black outline-none transition-all placeholder:text-on-surface-variant/40 focus:ring-2 focus:ring-primary uppercase"
                        value={roomCode}
                        placeholder="INVERNO"
                        onChange={(e) =>
                          setRoomCode(e.target.value.toUpperCase())
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleJoin();
                        }}
                      />
                    </div>
                  )}

                  {joinMode && (
                    <button
                      onClick={handleJoin}
                      disabled={!roomCode || joining}
                      className={`w-full disabled:bg-surface-container disabled:text-on-surface-variant py-4 rounded font-black text-base uppercase tracking-[0.2em] transition-all active:scale-95 ${joinMode === "new-game" ? "bg-primary hover:brightness-110 text-on-primary" : joinMode === "saved-game" ? "bg-cyan-500 hover:bg-cyan-400 text-zinc-950" : "bg-primary hover:brightness-110 text-on-primary"}`}
                    >
                      {joining
                        ? "A GERAR CONTRATO..."
                        : joinMode === "new-game"
                          ? "CRIAR JOGO"
                          : joinMode === "saved-game"
                            ? "CONTINUAR JOGO"
                            : "JUNTAR A AMIGOS"}
                    </button>
                  )}
                  {joinError && (
                    <p className="text-red-400 text-sm text-center font-bold">
                      ⚠️ {joinError}
                    </p>
                  )}
                  {!joinError && disconnected && (
                    <p className="text-red-400 text-sm text-center font-bold">
                      ⚠️ Sem ligação ao servidor. Tenta novamente.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Features strip */}
        <div className="relative z-10 w-full border-t border-outline-variant/20 bg-surface-container/50 backdrop-blur-sm">
          <div className="max-w-7xl mx-auto px-6 lg:px-10 py-10">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
              {[
                {
                  icon: "🌍",
                  label: "4 Divisões",
                  desc: "Primeira Liga, Segunda, Liga 3 e Campeonato de Portugal com promoção e descida.",
                },
                {
                  icon: "👥",
                  label: "Até 8 Treinadores",
                  desc: "Multiplayer assíncrono — submete as tácticas quando quiseres, simula em grupo.",
                },
                {
                  icon: "💰",
                  label: "Finanças & Contratos",
                  desc: "Gere o orçamento, renegocia contratos e evita a falência do clube.",
                },
                {
                  icon: "⚡",
                  label: "Simulação ao Vivo",
                  desc: "Eventos em tempo real. Acompanhe os jogos e notícias à medida que acontecem.",
                },
              ].map(({ icon, label, desc }) => (
                <div
                  key={label}
                  className="bg-surface border border-outline-variant/20 hover:border-tertiary/30 rounded-xl p-5 transition-all group"
                >
                  <div className="w-10 h-10 flex items-center justify-center text-xl bg-surface-container-high rounded-lg mb-4 group-hover:bg-tertiary/10 transition-colors">
                    {icon}
                  </div>
                  <p className="font-headline font-black text-sm text-on-surface mb-1.5 tracking-tight">
                    {label}
                  </p>
                  <p className="text-xs text-on-surface-variant leading-relaxed">
                    {desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="relative z-10 border-t border-outline-variant/20 bg-surface py-5">
          <div className="max-w-7xl mx-auto px-6 lg:px-10 flex items-center justify-between">
            <span className="text-xs text-on-surface-variant font-bold">
              ⚽ CashBall 26/27
            </span>
            <span className="text-xs text-on-surface-variant/40">
              v1.0a © 2026 by Fábio Silva
            </span>
          </div>
        </footer>
      </div>
    );
  }

  const teamInfo = teams.find((t) => t.id == me.teamId);
  const myMatch = matchResults?.results.find(
    (r) => r.homeTeamId === me.teamId || r.awayTeamId === me.teamId,
  );
  // Jogadores expulsos no meu jogo (para filtrar do painel de intervalo)
  const mySideInHalftime = myMatch?.homeTeamId === me.teamId ? "home" : "away";
  const redCardedHalftimeIds = new Set(
    (myMatch?.events || [])
      .filter((e) => e.type === "red" && e.team === mySideInHalftime)
      .map((e) => e.playerId)
      .filter(Boolean),
  );
  // Indica se o coach está na ronda actual da Taça
  const myTeamInCup =
    cupActiveTeamIds.length === 0 ||
    cupActiveTeamIds.includes(me.teamId) ||
    cupActiveTeamIds.includes(Number(me.teamId)) ||
    cupActiveTeamIds.includes(String(me.teamId));
  const annotatedSquad = mySquad
    .map((p) => {
      const isOut = activeTab === "live" && subbedOut.includes(p.id);
      return {
        ...p,
        status: isOut ? "Out" : tactic.positions[p.id] || "Excluído",
        isSubbedOut: isOut,
        isUnavailable: !isPlayerAvailable(p, matchweekCount + 1),
      };
    })
    .sort((a, b) => {
      const posOrder = { GR: 1, DEF: 2, MED: 3, ATA: 4 };
      const aPos = posOrder[a.position] || 5;
      const bPos = posOrder[b.position] || 5;
      if (aPos !== bPos) return aPos - bPos;
      return a.name.localeCompare(b.name);
    });

  const titulares = mySquad.filter((p) => tactic.positions[p.id] === "Titular");
  const isLineupComplete =
    titulares.filter((p) => p.position === "GR").length === 1 &&
    titulares.filter((p) => p.position !== "GR").length === 10;

  const nextMatchOpponent = nextMatchSummary?.opponent || null;
  const nextMatchReferee = nextMatchSummary?.referee || null;

  // ── SEASON / YEAR HELPERS ────────────────────────────────────────────────
  // matchweekCount is the global (cumulative) matchweek counter.
  // Each season has 14 matchweeks, starting from year 2026.
  const seasonYear = 2026 + Math.floor(matchweekCount / 14);
  // Within-season jornada for the NEXT match to be played (1-14)
  const currentJornada = (matchweekCount % 14) + 1;
  // Within-season jornada for the LAST completed match (0 = none played yet)
  const completedJornada =
    matchweekCount > 0 ? ((matchweekCount - 1) % 14) + 1 : 0;

  // ── FINANCIAL PROJECTIONS ─────────────────────────────────────────────────
  // All values are estimates based on current season data (no historical log).
  const totalWeeklyWage = mySquad.reduce((acc, p) => acc + (p.wage || 0), 0);
  const capacityRevPerGame = (teamInfo?.stadium_capacity || 10000) * 15;
  const loanAmount = teamInfo?.loan_amount || 0;
  const loanInterestPerWeek = Math.round(loanAmount * 0.025);
  const currentBudget = teamInfo?.budget || 0;

  // Oculta o menu e expande a janela de jogo durante a simulação
  const isMatchInProgress =
    isPlayingMatch || showHalftimePanel || !!matchAction;

  return (
    <div className="min-h-screen bg-surface text-on-surface font-body tracking-tight">
      {/* Toast notifications */}
      <div className="fixed top-16 right-4 z-100 flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="bg-surface-container border border-outline-variant/60 text-on-surface text-sm font-bold px-5 py-3 rounded-md shadow-2xl toast-slide-in"
          >
            {t.msg}
          </div>
        ))}
      </div>
      <header
        className="fixed top-0 left-0 right-0 h-14 z-20 flex items-center"
        style={{
          background: teamInfo?.color_primary || "#131313",
          borderBottom: "1px solid #201f1f",
        }}
      >
        <div className="flex items-center justify-between w-full px-4 lg:px-6">
          {/* Left: brand + session info */}
          <div className="flex items-center gap-3">
            <h1
              className="text-base font-headline font-black tracking-tighter uppercase"
              style={{ color: teamInfo?.color_secondary || "#e5e2e1" }}
            >
              CashBall <span style={{ opacity: 0.55 }}>26/27</span>
            </h1>
            <span className="hidden md:block text-[10px] font-bold text-on-surface-variant uppercase tracking-[0.2em]">
              {seasonYear} · J{currentJornada} · {me.roomName || me.roomCode}
            </span>
          </div>
          {/* Center: live match timer */}
          {activeTab === "live" && isPlayingMatch && (
            <p
              className="absolute left-1/2 -translate-x-1/2 text-2xl md:text-4xl font-headline font-black tracking-widest"
              style={{ color: teamInfo?.color_secondary || "#e5e2e1" }}
            >
              {Math.min(liveMinute, 120)}'
            </p>
          )}
          {/* Right: manager info + coach panel + logout */}
          <div className="flex items-center gap-3">
            <div className="hidden lg:flex flex-col items-end">
              <span
                className="text-sm font-bold leading-tight"
                style={{ color: teamInfo?.color_secondary || "#e5e2e1" }}
              >
                {me.name}
              </span>
              <span
                className="text-xs leading-tight"
                style={{ color: teamInfo?.color_secondary || "#e5e2e1" }}
              >
                {teamInfo?.name}
              </span>
            </div>
            <button
              onClick={handleLogout}
              title="Terminar sessão"
              className="text-on-surface-variant hover:text-on-surface hover:bg-surface-bright transition-colors rounded px-3 py-2 text-xs font-black uppercase tracking-widest"
            >
              Sair
            </button>
          </div>
        </div>
      </header>

      {/* ── LEFT SIDEBAR ─────────────────────────────────────────────────── */}
      <nav className="hidden lg:flex fixed left-0 top-14 bottom-0 w-64 bg-surface-container-low flex-col z-10">
        <div className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {isMatchInProgress && (
            <div className="flex items-center gap-2 px-4 py-2 mb-1 rounded bg-primary/10 border border-primary/20">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
              <span className="text-[10px] font-black uppercase tracking-widest text-primary">
                Em Jogo
              </span>
            </div>
          )}
          {[
            { key: "club", label: "Clube", icon: "groups_3" },
            { key: "finances", label: "Finanças", icon: "payments" },
            { key: "players", label: "Plantel", icon: "group" },
            {
              key: "calendario",
              label: "Calendário",
              icon: "calendar_month",
            },
            {
              key: "standings",
              label: "Classificações",
              icon: "leaderboard",
            },
            { key: "market", label: "Mercado", icon: "swap_horiz" },
          ].map(({ key, label, icon }) => (
            <button
              key={key}
              onClick={() => {
                if (isMatchInProgress) return;
                setActiveTab(key);
                window.scrollTo(0, 0);
              }}
              disabled={isMatchInProgress}
              className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-bold transition-all text-left ${
                isMatchInProgress
                  ? "text-on-surface-variant/30 cursor-not-allowed"
                  : activeTab === key
                    ? "bg-primary-container/20 text-primary border-l-4 border-primary"
                    : "text-on-surface-variant hover:bg-surface-bright hover:text-on-surface"
              }`}
            >
              <span className="material-symbols-outlined text-[20px] shrink-0 leading-none">
                {icon}
              </span>
              <span>{label}</span>
            </button>
          ))}
          <div className="pt-2">
            <button
              onClick={() => {
                if (isMatchInProgress) return;
                setActiveTab("tactic");
                window.scrollTo(0, 0);
              }}
              disabled={isMatchInProgress}
              className={`w-full flex items-center gap-3 px-4 py-3.5 text-sm font-black uppercase tracking-widest transition-all rounded-sm ${
                isMatchInProgress
                  ? "bg-primary/5 text-primary/30 cursor-not-allowed border border-primary/10"
                  : activeTab === "tactic"
                    ? "bg-primary text-on-primary shadow-lg"
                    : "bg-primary/10 text-primary border border-primary/40 hover:bg-primary/20"
              }`}
            >
              <span className="material-symbols-outlined text-[20px] shrink-0 leading-none">
                strategy
              </span>
              <span className="flex-1 text-left">JOGAR</span>
              <span className="relative flex h-2 w-2 shrink-0">
                <span
                  className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${activeTab === "tactic" ? "bg-on-primary/40" : "bg-primary"}`}
                />
                <span
                  className={`relative inline-flex rounded-full h-2 w-2 ${activeTab === "tactic" ? "bg-on-primary/60" : "bg-primary"}`}
                />
              </span>
            </button>
          </div>
        </div>
        <div className="border-t border-outline-variant/20 pt-3 pb-4 px-3">
          {players.length > 0 && (
            <div className="bg-surface-container rounded-md overflow-hidden">
              <div className="px-4 py-2 flex items-center justify-between border-b border-outline-variant/20">
                <span className="text-[9px] uppercase tracking-widest font-black text-on-surface-variant">
                  Sala {me.roomName || me.roomCode}
                </span>
                <span className="text-[9px] font-black text-emerald-400 uppercase tracking-widest">
                  {players.length} online
                </span>
              </div>
              <div className="divide-y divide-outline-variant/10">
                {[
                  ...players.map((p) => ({
                    name: p.name,
                    teamId: p.teamId,
                    online: true,
                    submitted: lockedCoaches.includes(p.name) || p.ready,
                  })),
                  ...awaitingCoaches
                    .filter((n) => !players.some((p) => p.name === n))
                    .map((n) => ({
                      name: n,
                      teamId: null,
                      online: false,
                      submitted: true,
                    })),
                ].map((coach, i) => {
                  const coachTeam = coach.teamId
                    ? teams.find((t) => t.id == coach.teamId)
                    : null;
                  return (
                    <div key={i} className="flex items-center gap-3 px-4 py-2">
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          coach.online ? "bg-primary" : "bg-surface-bright"
                        }`}
                      />
                      <div className="flex-1 min-w-0">
                        <p
                          className={`text-xs font-black truncate ${
                            coach.online
                              ? "text-on-surface"
                              : "text-on-surface-variant"
                          }`}
                        >
                          {coach.name}
                          {coach.name === me.name && (
                            <span className="ml-1.5 text-[9px] font-bold text-on-surface-variant">
                              (tu)
                            </span>
                          )}
                        </p>
                        {coachTeam && (
                          <p
                            className="text-[10px] truncate"
                            style={{
                              color: coachTeam.color_primary || "#71717a",
                            }}
                          >
                            {coachTeam.name}
                          </p>
                        )}
                      </div>
                      {coach.submitted ? (
                        <span className="shrink-0 text-[10px] font-black text-primary uppercase tracking-wide">
                          ✓
                        </span>
                      ) : (
                        <span className="shrink-0 text-[10px] font-black text-tertiary uppercase tracking-wide">
                          ⏳
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </nav>

      {/* ── MOBILE BOTTOM NAV ────────────────────────────────────────────── */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 h-16 bg-surface-container-low/95 backdrop-blur-sm border-t border-outline-variant/30 z-10 flex overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        {[
          { key: "club", label: "Clube", icon: "groups_3" },
          { key: "finances", label: "Finanças", icon: "payments" },
          { key: "players", label: "Plantel", icon: "group" },
          { key: "calendario", label: "Calendário", icon: "calendar_month" },
          { key: "standings", label: "Classif.", icon: "leaderboard" },
          { key: "market", label: "Mercado", icon: "swap_horiz" },
          { key: "tactic", label: "Jogar", icon: "strategy" },
        ].map(({ key, label, icon }) => (
          <button
            key={key}
            onClick={() => {
              if (isMatchInProgress) return;
              setActiveTab(key);
              window.scrollTo(0, 0);
            }}
            disabled={isMatchInProgress}
            className={`flex-1 shrink-0 min-w-[72px] flex flex-col items-center justify-center gap-0.5 text-[10px] font-bold uppercase tracking-wider transition-colors relative ${
              isMatchInProgress
                ? "text-on-surface-variant/25 cursor-not-allowed"
                : activeTab === key
                  ? "text-primary"
                  : "text-on-surface-variant"
            }`}
          >
            {activeTab === key && !isMatchInProgress && (
              <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-primary rounded-b-full" />
            )}
            <span className="material-symbols-outlined text-[22px] leading-none">
              {icon}
            </span>
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <main
        className={`pt-14 lg:pb-12${newsTickerItems.length > 0 ? " pb-28" : " pb-20"} lg:ml-64`}
      >
        <div className="p-4 lg:p-6">
          {/* ─── TACTIC: HORIZONTAL ADVERSARY BANNER ──────────────────── */}
          {activeTab === "tactic" && (
            <div className="mb-4 rounded-md border border-outline-variant/20 bg-surface-container-low">
              {nextMatchOpponent ? (
                <div className="flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-4">
                  {/* Jornada + VS */}
                  <div className="shrink-0">
                    <p className="text-[10px] uppercase tracking-[0.35em] text-on-surface-variant font-black mb-0.5">
                      {nextMatchSummary?.isCup
                        ? `Taça · ${nextMatchSummary.cupRoundName}`
                        : `Jornada ${nextMatchSummary?.matchweek ?? "—"}`}
                    </p>
                    <div className="flex items-center gap-2 flex-wrap">
                      {nextMatchSummary?.isCup && (
                        <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-amber-500/20 text-amber-400">
                          TAÇA
                        </span>
                      )}
                      <span
                        className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${nextMatchSummary?.venue === "Casa" ? "bg-emerald-500/20 text-emerald-400" : "bg-sky-500/20 text-sky-400"}`}
                      >
                        {nextMatchSummary?.venue ?? "-"}
                      </span>
                      <p className="text-white font-black text-lg leading-tight">
                        vs {nextMatchOpponent.name}
                      </p>
                    </div>
                  </div>
                  {/* Standings */}
                  <div className="shrink-0 text-center">
                    <p className="text-[10px] uppercase tracking-widest text-on-surface-variant font-black mb-0.5">
                      Posição
                    </p>
                    <p className="text-base font-black">
                      <span className="text-primary">
                        {nextMatchSummary?.team?.position
                          ? `${nextMatchSummary.team.position}º`
                          : "—"}
                      </span>
                      <span className="text-zinc-600 mx-1.5">vs</span>
                      <span className="text-amber-400">
                        {nextMatchOpponent.position
                          ? `${nextMatchOpponent.position}º`
                          : "—"}
                      </span>
                    </p>
                  </div>
                  {/* Opponent pts */}
                  <div className="shrink-0 text-center">
                    <p className="text-[10px] uppercase tracking-widest text-on-surface-variant font-black mb-0.5">
                      Pts Adv.
                    </p>
                    <p className="text-on-surface font-headline font-black text-base">
                      {nextMatchOpponent.points ?? "—"}
                    </p>
                  </div>
                  {/* GM / GS */}
                  <div className="shrink-0 text-center">
                    <p className="text-[10px] uppercase tracking-widest text-on-surface-variant font-black mb-0.5">
                      GM / GS Adv.
                    </p>
                    <p className="text-sm font-black">
                      <span className="text-primary">
                        {nextMatchOpponent.goalsFor ?? "—"}
                      </span>
                      <span className="text-on-surface-variant/40 mx-1">/</span>
                      <span className="text-error">
                        {nextMatchOpponent.goalsAgainst ?? "—"}
                      </span>
                    </p>
                  </div>
                  {/* Opponent form */}
                  <div className="shrink-0">
                    <p className="text-[10px] uppercase tracking-widest text-on-surface-variant font-black mb-1">
                      Forma Adv.
                    </p>
                    <div className="flex items-center gap-1">
                      {(nextMatchOpponent.last5 || "-----")
                        .split("")
                        .slice(0, 5)
                        .reverse()
                        .map((r, i) => (
                          <span
                            key={`adv-${r}-${i}`}
                            className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black border ${r === "V" ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" : r === "E" ? "bg-amber-500/15 text-amber-400 border-amber-500/30" : r === "D" ? "bg-red-500/15 text-red-400 border-red-500/30" : "bg-surface text-on-surface-variant border-outline-variant/20"}`}
                          >
                            {r}
                          </span>
                        ))}
                    </div>
                  </div>
                  {/* Referee */}
                  <div className="ml-auto shrink-0">
                    <p className="text-[10px] uppercase tracking-widest text-on-surface-variant font-black mb-1">
                      Árbitro
                    </p>
                    <button
                      type="button"
                      onClick={() => setRefereePopup(nextMatchReferee)}
                      className="flex items-center gap-2 rounded-md border border-outline-variant/30 bg-surface px-3 py-2 hover:border-tertiary/40 transition-colors"
                    >
                      <span className="font-black text-white text-sm">
                        {nextMatchReferee?.name || "A definir"}
                      </span>
                      <span className="text-[10px] uppercase tracking-widest font-black text-tertiary">
                        Ver balança
                      </span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="px-5 py-4 text-sm font-bold text-on-surface-variant">
                  {nextMatchSummaryLoading
                    ? "A carregar próximo jogo…"
                    : "Sem jogo disponível."}
                </div>
              )}
            </div>
          )}
          <div
            className={`grid grid-cols-1 gap-6 ${activeTab === "tactic" ? "xl:grid-cols-[minmax(0,3fr)_320px]" : ""}`}
          >
            <div>
              {activeTab === "live" && (matchResults || matchAction) && (
                <div className="bg-surface-container text-on-surface font-body p-6 border border-outline-variant/20 shadow-sm relative overflow-hidden min-h-150 rounded-lg">
                  {matchAction && (
                    <div className="fixed inset-0 z-[150] bg-surface/95 backdrop-blur-sm p-6 flex flex-col justify-center">
                      <h2 className="text-3xl font-black text-amber-500 mb-2 tracking-widest text-center uppercase">
                        {matchAction.type === "injury" ? "LESÃO" : "PENÁLTI"}
                      </h2>
                      <p className="text-center text-zinc-400 font-bold mb-2 text-sm">
                        Minuto {matchAction.minute}'{" "}
                        {matchAction.currentScore
                          ? `| ${matchAction.currentScore.home} - ${matchAction.currentScore.away}`
                          : ""}
                      </p>
                      <p className="text-center text-zinc-300 font-black mb-2 text-sm uppercase tracking-widest">
                        {matchAction.type === "injury"
                          ? `Jogador lesionado: ${matchAction.injuredPlayer?.name || "?"}${matchAction.injuredPlayer?.position ? ` · ${matchAction.injuredPlayer.position}` : ""}`
                          : "Escolhe o jogador para marcar o penalty"}
                      </p>
                      {matchAction.type === "injury" &&
                        injuryCountdown !== null && (
                          <p className="text-center text-amber-400 font-black text-sm mb-4 tracking-wide">
                            Auto-substituição em {injuryCountdown}s
                          </p>
                        )}

                      <div className="flex-1 overflow-y-auto bg-surface-container/40 border border-outline-variant/20 rounded p-4 mb-5">
                        <div className="space-y-2">
                          {(matchAction.type === "injury"
                            ? matchAction.benchPlayers || []
                            : matchAction.takerCandidates || []
                          ).map((player) => (
                            <button
                              key={player.id}
                              onClick={() =>
                                handleResolveMatchAction(player.id)
                              }
                              className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded border border-outline-variant/20 bg-surface hover:bg-surface-bright transition-colors text-left"
                            >
                              <span className="font-bold text-white truncate">
                                {player.name}
                              </span>
                              <span className="text-xs font-black uppercase tracking-widest text-zinc-400">
                                {player.position} · {player.skill}
                              </span>
                            </button>
                          ))}
                          {((matchAction.type === "injury" &&
                            (!matchAction.benchPlayers ||
                              matchAction.benchPlayers.length === 0)) ||
                            (matchAction.type === "penalty" &&
                              (!matchAction.takerCandidates ||
                                matchAction.takerCandidates.length === 0))) && (
                            <p className="text-center text-zinc-500 font-bold text-sm py-8">
                              Sem opções disponíveis. O sistema escolherá
                              automaticamente.
                            </p>
                          )}
                        </div>
                      </div>

                      <button
                        onClick={() => handleResolveMatchAction(null)}
                        className="w-full py-4 rounded-sm text-lg font-black uppercase tracking-widest transition-all bg-primary hover:brightness-110 text-on-primary"
                      >
                        Escolha automática
                      </button>
                    </div>
                  )}

                  {/* BUG-11 FIX: showHalftimePanel (not liveMinute===45) controls this overlay */}
                  {showHalftimePanel &&
                    !isPlayingMatch &&
                    (() => {
                      const myMatch = matchResults?.results?.find(
                        (m) =>
                          m.homeTeamId === me.teamId ||
                          m.awayTeamId === me.teamId,
                      );
                      const hInfo = myMatch
                        ? teams.find((t) => t.id === myMatch.homeTeamId)
                        : null;
                      const aInfo = myMatch
                        ? teams.find((t) => t.id === myMatch.awayTeamId)
                        : null;
                      const matchEvents = myMatch?.events || [];
                      const htEvents = matchEvents.filter(
                        (e) =>
                          (e.minute <= 45 || e.minute <= liveMinute) &&
                          [
                            "goal",
                            "penalty_goal",
                            "own_goal",
                            "yellow",
                            "red",
                          ].includes(e.type),
                      );
                      const homeGoals = matchEvents.filter(
                        (e) =>
                          (e.minute <= 45 || e.minute <= liveMinute) &&
                          e.type === "goal" &&
                          e.team === "home",
                      );
                      const awayGoals = matchEvents.filter(
                        (e) =>
                          (e.minute <= 45 || e.minute <= liveMinute) &&
                          e.type === "goal" &&
                          e.team === "away",
                      );

                      // Build formation rows: ATA → MED → DEF → GR
                      const onFieldPlayers = annotatedSquad.filter(
                        (p) =>
                          tactic.positions[p.id] === "Titular" &&
                          !subbedOut.includes(p.id) &&
                          !redCardedHalftimeIds.has(p.id),
                      );
                      const fmParts = tactic.formation.split("-").map(Number);
                      const pitchRows = [
                        onFieldPlayers
                          .filter((p) => p.position === "ATA")
                          .slice(0, fmParts[2] || 2),
                        onFieldPlayers
                          .filter((p) => p.position === "MED")
                          .slice(0, fmParts[1] || 4),
                        onFieldPlayers
                          .filter((p) => p.position === "DEF")
                          .slice(0, fmParts[0] || 4),
                        onFieldPlayers
                          .filter((p) => p.position === "GR")
                          .slice(0, 1),
                      ];

                      // BUG-06 FIX: Use handleHalftimeReady which always sends true
                      // BUG: only gate on myTeamInCup when it's actually a cup match
                      const isCupContext = isCupMatch || cupPreMatch;
                      const canContinue = !isCupContext || myTeamInCup;
                      const isReady = !!players.find((p) => p.name === me.name)
                        ?.ready;

                      return (
                        <div className="fixed inset-0 bg-zinc-950/95 backdrop-blur-sm z-[100] flex flex-col overflow-hidden">
                          {/* ── Top bar ── */}
                          <div className="shrink-0 flex items-center justify-between px-5 py-3 bg-surface-container border-b border-outline-variant/20">
                            <div className="flex items-center gap-3">
                              <span className="text-[10px] font-black uppercase tracking-widest text-tertiary">
                                {cupPreMatch
                                  ? "PRÉ-JOGO"
                                  : liveMinute >= 90
                                    ? "ANTES DO TEMPO EXTRA"
                                    : "INTERVALO"}
                              </span>
                              <div className="h-3 w-px bg-outline-variant/30" />
                              <span className="text-[10px] font-bold text-on-surface-variant">
                                {isCupMatch
                                  ? `🏆 ${cupMatchRoundName}`
                                  : `Jornada ${matchResults?.matchweek ?? "—"}`}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              {Array.from({ length: MAX_MATCH_SUBS }).map(
                                (_, i) => (
                                  <span
                                    key={i}
                                    className={`w-2 h-2 rounded-full transition-colors ${i < subsMade ? "bg-primary" : "bg-surface-bright"}`}
                                  />
                                ),
                              )}
                              <span className="ml-1 text-[10px] font-bold text-on-surface-variant tabular-nums">
                                {MAX_MATCH_SUBS - subsMade}/{MAX_MATCH_SUBS}{" "}
                                subs
                              </span>
                            </div>
                          </div>

                          {/* ── 3-column grid ── */}
                          <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-[280px_1fr_280px]">
                            {/* ── LEFT: score + events + mentality ── */}
                            <div className="hidden lg:flex flex-col bg-surface-container-low border-r border-outline-variant/15 overflow-hidden">
                              {myMatch && (
                                <div className="p-5 border-b border-outline-variant/15 relative overflow-hidden">
                                  <div className="absolute top-0 left-0 w-1 h-full bg-tertiary" />
                                  <div className="flex justify-between items-center mb-5">
                                    <div className="text-center flex-1">
                                      <p className="text-[9px] text-on-surface-variant uppercase font-bold tracking-widest mb-1">
                                        Casa
                                      </p>
                                      <h2
                                        className="text-2xl font-black font-headline leading-none"
                                        style={{
                                          color:
                                            hInfo?.color_primary || "#e5e2e1",
                                        }}
                                      >
                                        {(hInfo?.name || "")
                                          .slice(0, 4)
                                          .toUpperCase()}
                                      </h2>
                                    </div>
                                    <div className="px-4 py-2 rounded-full bg-surface-bright flex items-center gap-3 shrink-0">
                                      <span className="text-3xl font-black font-headline text-tertiary">
                                        {homeGoals.length}
                                      </span>
                                      <span className="text-on-surface-variant font-bold">
                                        -
                                      </span>
                                      <span className="text-3xl font-black font-headline">
                                        {awayGoals.length}
                                      </span>
                                    </div>
                                    <div className="text-center flex-1">
                                      <p className="text-[9px] text-on-surface-variant uppercase font-bold tracking-widest mb-1">
                                        Fora
                                      </p>
                                      <h2
                                        className="text-2xl font-black font-headline leading-none opacity-60"
                                        style={{
                                          color:
                                            aInfo?.color_primary || "#e5e2e1",
                                        }}
                                      >
                                        {(aInfo?.name || "")
                                          .slice(0, 4)
                                          .toUpperCase()}
                                      </h2>
                                    </div>
                                  </div>
                                  {/* Events */}
                                  <div className="space-y-2 max-h-36 overflow-y-auto">
                                    {htEvents
                                      .sort((a, b) => a.minute - b.minute)
                                      .map((e, i) => {
                                        const icon =
                                          e.type === "goal" ||
                                          e.type === "penalty_goal"
                                            ? "⚽"
                                            : e.type === "own_goal"
                                              ? "⚽🔙"
                                              : e.type === "yellow"
                                                ? "🟨"
                                                : "🟥";
                                        const name =
                                          e.playerName || e.player_name || "?";
                                        return (
                                          <div
                                            key={i}
                                            className="flex items-center gap-2 text-xs"
                                          >
                                            <span className="text-on-surface-variant font-bold w-6 shrink-0 tabular-nums">
                                              {e.minute}'
                                            </span>
                                            <span className="shrink-0">
                                              {icon}
                                            </span>
                                            <span
                                              className={`font-medium truncate flex-1 ${e.type === "goal" || e.type === "penalty_goal" ? "text-primary" : e.type === "red" ? "text-red-400" : "text-on-surface-variant"}`}
                                            >
                                              <PlayerLink playerId={e.playerId}>
                                                {name}
                                              </PlayerLink>
                                            </span>
                                            <span className="text-[9px] text-on-surface-variant/40 shrink-0">
                                              {e.team === "home"
                                                ? hInfo?.name?.slice(0, 3)
                                                : aInfo?.name?.slice(0, 3)}
                                            </span>
                                          </div>
                                        );
                                      })}
                                    {htEvents.length === 0 && (
                                      <p className="text-[10px] text-on-surface-variant/40 font-bold">
                                        Sem eventos até ao intervalo
                                      </p>
                                    )}
                                  </div>
                                </div>
                              )}

                              {/* Mentality */}
                              <div className="p-4 border-b border-outline-variant/15">
                                <span className="block text-[9px] font-black uppercase tracking-widest text-on-surface-variant mb-2">
                                  Mentalidade
                                </span>
                                <div className="flex gap-1.5">
                                  {[
                                    { value: "Defensive", label: "Defensivo" },
                                    { value: "Balanced", label: "Equilibrado" },
                                    { value: "Offensive", label: "Ofensivo" },
                                  ].map(({ value, label }) => (
                                    <button
                                      key={value}
                                      onClick={() =>
                                        updateTactic({ style: value })
                                      }
                                      className={`flex-1 py-1.5 rounded text-[10px] font-black uppercase tracking-wide transition-colors ${
                                        tactic.style === value
                                          ? value === "Defensive"
                                            ? "bg-blue-600 text-white"
                                            : value === "Offensive"
                                              ? "bg-amber-500 text-zinc-950"
                                              : "bg-primary text-on-primary"
                                          : "bg-surface-bright text-on-surface-variant hover:text-on-surface"
                                      }`}
                                    >
                                      {label}
                                    </button>
                                  ))}
                                </div>
                              </div>

                              {/* Confirmed subs */}
                              {confirmedSubs.length > 0 && (
                                <div className="p-4 border-b border-outline-variant/15">
                                  <span className="block text-[9px] font-black uppercase tracking-widest text-on-surface-variant mb-2">
                                    Substituições
                                  </span>
                                  <div className="space-y-1.5">
                                    {confirmedSubs.map((sub, i) => {
                                      const outP = mySquad.find(
                                        (p) => p.id === sub.out,
                                      );
                                      const inP = mySquad.find(
                                        (p) => p.id === sub.in,
                                      );
                                      return (
                                        <div
                                          key={i}
                                          className="flex items-center gap-1.5 text-[11px] font-bold"
                                        >
                                          <span className="text-red-400 truncate">
                                            {outP?.name ?? "?"}
                                          </span>
                                          <span className="text-zinc-500 shrink-0">
                                            →
                                          </span>
                                          <span className="text-emerald-400 truncate">
                                            {inP?.name ?? "?"}
                                          </span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}

                              <div className="flex-1" />
                            </div>

                            {/* ── CENTER: formation pitch ── */}
                            <div className="flex flex-col overflow-hidden bg-surface">
                              {/* Pitch area */}
                              <div className="flex-1 relative overflow-hidden p-4">
                                <div
                                  className="absolute inset-0 pointer-events-none opacity-10"
                                  style={{
                                    backgroundImage:
                                      "repeating-linear-gradient(90deg, transparent, transparent 10%, rgba(149,212,179,0.12) 10%, rgba(149,212,179,0.12) 20%)",
                                  }}
                                />
                                <div className="absolute inset-4 border border-on-surface-variant/10 rounded-sm pointer-events-none" />
                                <div className="absolute top-1/2 left-0 w-full h-px bg-on-surface-variant/10 pointer-events-none" />
                                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 border border-on-surface-variant/10 rounded-full pointer-events-none" />

                                <div className="relative h-full flex flex-col justify-around py-2">
                                  {pitchRows.map((group, rowIdx) => (
                                    <div
                                      key={rowIdx}
                                      className="flex justify-center items-center gap-3 md:gap-6"
                                    >
                                      {group.map((p) => (
                                        <div
                                          key={p.id}
                                          className="relative flex flex-col items-center gap-1"
                                        >
                                          <button
                                            onClick={() =>
                                              subsMade < MAX_MATCH_SUBS &&
                                              handleSelectOut(p.id)
                                            }
                                            className={`w-10 h-10 md:w-12 md:h-12 rounded-full border-2 flex flex-col items-center justify-center transition-all hover:scale-110 shadow-lg ${
                                              swapSource === p.id
                                                ? "border-red-500 bg-red-500/20 scale-110"
                                                : p.position === "GR"
                                                  ? "border-tertiary bg-surface-bright"
                                                  : "border-primary/60 bg-surface-bright"
                                            } ${subsMade < MAX_MATCH_SUBS ? "cursor-pointer" : "cursor-not-allowed opacity-60"}`}
                                          >
                                            <span className="text-[8px] font-black text-tertiary leading-none">
                                              {p.skill}
                                            </span>
                                            <span
                                              className={`text-[8px] font-black leading-none ${POSITION_TEXT_CLASS[p.position]}`}
                                            >
                                              {
                                                POSITION_SHORT_LABELS[
                                                  p.position
                                                ]
                                              }
                                            </span>
                                          </button>
                                          <span className="text-[8px] font-bold text-on-surface-variant bg-surface-container px-1.5 py-0.5 rounded whitespace-nowrap max-w-16 truncate text-center">
                                            {p.name.split(" ").pop()}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  ))}
                                </div>
                              </div>

                              {/* Mobile: mentality */}
                              <div className="lg:hidden shrink-0 px-4 py-2 bg-surface-container border-t border-outline-variant/15">
                                <div className="flex gap-1.5">
                                  {[
                                    { value: "Defensive", label: "Def." },
                                    { value: "Balanced", label: "Equil." },
                                    { value: "Offensive", label: "Ofens." },
                                  ].map(({ value, label }) => (
                                    <button
                                      key={value}
                                      onClick={() =>
                                        updateTactic({ style: value })
                                      }
                                      className={`flex-1 py-1.5 rounded text-[10px] font-black uppercase tracking-wide transition-colors ${
                                        tactic.style === value
                                          ? value === "Defensive"
                                            ? "bg-blue-600 text-white"
                                            : value === "Offensive"
                                              ? "bg-amber-500 text-zinc-950"
                                              : "bg-primary text-on-primary"
                                          : "bg-surface-bright text-on-surface-variant"
                                      }`}
                                    >
                                      {label}
                                    </button>
                                  ))}
                                </div>
                              </div>

                              {/* CTA bar */}
                              <div className="shrink-0 p-4 bg-surface border-t border-outline-variant/15">
                                {swapSource && (
                                  <div className="flex items-center gap-2 mb-3 p-2 rounded bg-surface-container border border-outline-variant/20">
                                    <div className="flex-1 flex items-center gap-2 min-w-0">
                                      <span className="bg-red-950 text-red-300 border border-red-800/60 text-[10px] font-black px-2 py-0.5 rounded truncate">
                                        {annotatedSquad.find(
                                          (p) => p.id === swapSource,
                                        )?.name ?? "?"}
                                      </span>
                                      <span className="text-zinc-500 font-black shrink-0">
                                        →
                                      </span>
                                      {swapTarget ? (
                                        <span className="bg-emerald-950 text-emerald-300 border border-emerald-800/60 text-[10px] font-black px-2 py-0.5 rounded truncate">
                                          {annotatedSquad.find(
                                            (p) => p.id === swapTarget,
                                          )?.name ?? "?"}
                                        </span>
                                      ) : (
                                        <span className="text-zinc-600 text-[10px] italic">
                                          escolhe do banco →
                                        </span>
                                      )}
                                    </div>
                                    <button
                                      onClick={handleResetSub}
                                      className="shrink-0 w-6 h-6 rounded-full bg-zinc-800 hover:bg-zinc-700 text-[10px] text-zinc-500 hover:text-white flex items-center justify-center transition-colors"
                                    >
                                      ✕
                                    </button>
                                    <button
                                      onClick={handleConfirmSub}
                                      disabled={!swapTarget}
                                      className={`shrink-0 px-3 py-1.5 rounded text-[10px] font-black uppercase tracking-wide transition-colors ${swapTarget ? "bg-emerald-600 hover:bg-emerald-500 text-white" : "bg-zinc-800 text-zinc-600 cursor-not-allowed"}`}
                                    >
                                      Substituir
                                    </button>
                                  </div>
                                )}
                                {!swapSource && subsMade < MAX_MATCH_SUBS && (
                                  <p className="text-[9px] text-zinc-700 font-bold uppercase tracking-wide text-center mb-2">
                                    Clica num jogador em campo para substituir
                                  </p>
                                )}
                                <button
                                  onClick={
                                    canContinue
                                      ? handleHalftimeReady
                                      : undefined
                                  }
                                  disabled={!canContinue || isReady}
                                  className={`w-full py-4 text-sm font-black uppercase tracking-widest transition-all rounded flex items-center justify-center gap-3 ${
                                    !canContinue
                                      ? "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                                      : isReady
                                        ? "bg-zinc-800 text-zinc-500"
                                        : cupPreMatch
                                          ? "bg-green-600 hover:bg-green-500 text-zinc-950"
                                          : "bg-primary hover:brightness-110 text-on-primary"
                                  }`}
                                >
                                  {!canContinue
                                    ? "⏳ A aguardar jogo da Taça…"
                                    : isReady
                                      ? "⏳ A aguardar…"
                                      : cupPreMatch
                                        ? "▶ Iniciar jogo — Taça"
                                        : isCupMatch
                                          ? "▶ 2.ª Parte — Taça"
                                          : "▶ Iniciar 2.ª Parte"}
                                </button>
                              </div>
                            </div>

                            {/* ── RIGHT: squad + bench ── */}
                            <div className="hidden lg:flex flex-col border-l border-outline-variant/15 bg-surface-container-low overflow-hidden">
                              <div className="px-4 py-3 border-b border-outline-variant/15 flex items-center justify-between shrink-0">
                                <span className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                                  Em Campo
                                </span>
                                <span className="bg-primary/10 text-primary text-[10px] px-2 py-0.5 rounded font-bold">
                                  {onFieldPlayers.length} activos
                                </span>
                              </div>
                              <div className="flex-1 overflow-y-auto divide-y divide-outline-variant/10">
                                {annotatedSquad
                                  .filter(
                                    (p) =>
                                      tactic.positions[p.id] === "Titular" &&
                                      !subbedOut.includes(p.id) &&
                                      !redCardedHalftimeIds.has(p.id),
                                  )
                                  .map((p) => (
                                    <div
                                      key={p.id}
                                      onClick={() =>
                                        subsMade < MAX_MATCH_SUBS &&
                                        handleSelectOut(p.id)
                                      }
                                      className={`px-4 py-3 transition-colors ${
                                        swapSource === p.id
                                          ? "bg-red-500/10"
                                          : subsMade < MAX_MATCH_SUBS
                                            ? "hover:bg-surface-bright cursor-pointer"
                                            : "opacity-50 cursor-not-allowed"
                                      }`}
                                    >
                                      <div className="flex items-center justify-between mb-1.5">
                                        <div className="flex items-center gap-2">
                                          <span
                                            className={`text-[10px] font-bold w-4 ${POSITION_TEXT_CLASS[p.position]}`}
                                          >
                                            {POSITION_SHORT_LABELS[p.position]}
                                          </span>
                                          <span className="text-sm font-bold truncate max-w-28">
                                            {p.name}
                                          </span>
                                          {!!p.is_star && (
                                            <span className="text-amber-400 text-[10px]">
                                              ★
                                            </span>
                                          )}
                                        </div>
                                        <div className="text-[10px] font-black px-2 py-0.5 rounded bg-primary/20 text-primary">
                                          {p.skill}
                                        </div>
                                      </div>
                                      <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-1.5 flex-1 max-w-28">
                                          <div className="h-1 flex-1 bg-surface-bright rounded-full overflow-hidden">
                                            <div
                                              className="h-full bg-primary"
                                              style={{
                                                width: `${Math.min(100, (p.form || 5) * 10)}%`,
                                              }}
                                            />
                                          </div>
                                          <span className="text-[9px] font-bold text-on-surface-variant shrink-0 tabular-nums">
                                            {p.form ?? "—"}
                                          </span>
                                        </div>
                                        {subsMade < MAX_MATCH_SUBS && (
                                          <span className="text-[9px] font-black uppercase tracking-widest text-on-surface-variant group-hover:text-primary border border-outline-variant/30 px-2 py-0.5 rounded ml-2">
                                            Trocar
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                              </div>

                              {/* Bench */}
                              <div className="shrink-0 bg-surface-container p-4 border-t border-outline-variant/15">
                                <h5 className="text-[9px] font-black uppercase tracking-widest text-tertiary mb-2">
                                  Banco
                                </h5>
                                <div className="space-y-2">
                                  {annotatedSquad
                                    .filter(
                                      (p) =>
                                        tactic.positions[p.id] === "Suplente",
                                    )
                                    .map((p) => {
                                      const alreadyUsed = subbedOut.includes(
                                        p.id,
                                      );
                                      const disabled =
                                        alreadyUsed ||
                                        !swapSource ||
                                        subsMade >= MAX_MATCH_SUBS;
                                      return (
                                        <div
                                          key={p.id}
                                          onClick={() =>
                                            !disabled && handleSelectIn(p.id)
                                          }
                                          className={`flex items-center justify-between gap-2 text-xs transition-colors ${
                                            alreadyUsed
                                              ? "opacity-25 cursor-not-allowed"
                                              : swapTarget === p.id
                                                ? "text-emerald-400 cursor-pointer"
                                                : disabled
                                                  ? "opacity-50 cursor-not-allowed"
                                                  : "hover:text-on-surface cursor-pointer text-on-surface-variant"
                                          }`}
                                        >
                                          <div className="flex items-center gap-2 min-w-0">
                                            <span
                                              className={`text-[9px] font-bold w-4 shrink-0 ${POSITION_TEXT_CLASS[p.position]}`}
                                            >
                                              {
                                                POSITION_SHORT_LABELS[
                                                  p.position
                                                ]
                                              }
                                            </span>
                                            <span
                                              className={`font-medium truncate ${alreadyUsed ? "line-through text-zinc-700" : ""}`}
                                            >
                                              {p.name}
                                            </span>
                                          </div>
                                          <span
                                            className={`text-[9px] font-bold shrink-0 ${swapTarget === p.id ? "text-emerald-400" : ""}`}
                                          >
                                            {alreadyUsed ? "—" : p.skill}
                                          </span>
                                        </div>
                                      );
                                    })}
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* ── Mobile: vertical player list ── */}
                          <div
                            className="lg:hidden shrink-0 overflow-y-auto border-t border-outline-variant/15 bg-surface-container"
                            style={{ maxHeight: "40vh" }}
                          >
                            {/* Em Campo */}
                            <div className="px-3 py-1.5 bg-surface-container sticky top-0 z-10 flex items-center gap-1.5 border-b border-zinc-800">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                              <span className="text-[9px] font-black uppercase tracking-widest text-emerald-500">
                                Em Campo
                              </span>
                            </div>
                            {annotatedSquad
                              .filter(
                                (p) =>
                                  tactic.positions[p.id] === "Titular" &&
                                  !subbedOut.includes(p.id) &&
                                  !redCardedHalftimeIds.has(p.id),
                              )
                              .map((p) => (
                                <div
                                  key={p.id}
                                  onClick={() =>
                                    subsMade < MAX_MATCH_SUBS &&
                                    handleSelectOut(p.id)
                                  }
                                  className={`flex items-center gap-2 px-3 py-2 border-b border-zinc-800/40 ${swapSource === p.id ? "bg-red-500/15" : subsMade < MAX_MATCH_SUBS ? "cursor-pointer active:bg-zinc-800/60" : "opacity-40"}`}
                                >
                                  <span
                                    className={`w-5 h-5 rounded shrink-0 flex items-center justify-center text-[9px] font-black bg-zinc-800 ${POSITION_TEXT_CLASS[p.position]}`}
                                  >
                                    {POSITION_SHORT_LABELS[p.position]}
                                  </span>
                                  <span className="flex-1 text-[13px] font-bold text-zinc-200 leading-tight">
                                    {p.name}
                                  </span>
                                  <span className="shrink-0 text-xs font-black text-zinc-500 ml-auto">
                                    {p.skill}
                                  </span>
                                  {swapSource === p.id && (
                                    <span className="shrink-0 text-[9px] font-black uppercase text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded">
                                      sai
                                    </span>
                                  )}
                                </div>
                              ))}
                            {/* Banco */}
                            <div className="px-3 py-1.5 bg-surface-container sticky top-0 z-10 flex items-center gap-1.5 border-b border-zinc-800 border-t border-t-zinc-700">
                              <span className="w-1.5 h-1.5 rounded-full bg-zinc-600 shrink-0" />
                              <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500">
                                Banco
                              </span>
                            </div>
                            {annotatedSquad
                              .filter(
                                (p) => tactic.positions[p.id] === "Suplente",
                              )
                              .map((p) => {
                                const alreadyUsed = subbedOut.includes(p.id);
                                const disabled =
                                  alreadyUsed ||
                                  !swapSource ||
                                  subsMade >= MAX_MATCH_SUBS;
                                return (
                                  <div
                                    key={p.id}
                                    onClick={() =>
                                      !disabled && handleSelectIn(p.id)
                                    }
                                    className={`flex items-center gap-2 px-3 py-2 border-b border-zinc-800/40 ${alreadyUsed ? "opacity-20 cursor-not-allowed" : swapTarget === p.id ? "bg-emerald-500/15 cursor-pointer" : disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer active:bg-zinc-800/60"}`}
                                  >
                                    <span
                                      className={`w-5 h-5 rounded shrink-0 flex items-center justify-center text-[9px] font-black bg-zinc-800 ${POSITION_TEXT_CLASS[p.position]}`}
                                    >
                                      {POSITION_SHORT_LABELS[p.position]}
                                    </span>
                                    <span
                                      className={`flex-1 text-[13px] font-bold leading-tight ${alreadyUsed ? "text-zinc-700 line-through" : "text-zinc-200"}`}
                                    >
                                      {p.name}
                                    </span>
                                    <span className="shrink-0 text-xs font-black text-zinc-500 ml-auto">
                                      {alreadyUsed ? "—" : p.skill}
                                    </span>
                                    {swapTarget === p.id && (
                                      <span className="shrink-0 text-[9px] font-black uppercase text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                                        entra
                                      </span>
                                    )}
                                  </div>
                                );
                              })}
                          </div>
                        </div>
                      );
                    })()}

                  {/* ── V2 TOP BAR ─────────────────────── */}
                  <div className="flex items-center justify-center mb-4">
                    {/* ── CENTERED CLOCK ── */}
                    <div className="flex flex-col items-center">
                      {isPlayingMatch ? (
                        <>
                          <span className="text-3xl font-headline font-black text-primary tabular-nums leading-none">
                            {liveMinute}'
                          </span>
                          <span className="text-[9px] font-bold text-primary/60 uppercase tracking-widest mt-0.5">
                            {liveMinute > 45 ? "2ª Parte" : "1ª Parte"}
                          </span>
                        </>
                      ) : liveMinute === 45 && !isCupMatch ? (
                        <span className="text-sm font-black text-tertiary uppercase tracking-wide">
                          Intervalo
                        </span>
                      ) : isCupMatch ? (
                        <span className="text-sm font-black text-on-surface-variant/60 uppercase tracking-wide">
                          🏆 {cupMatchRoundName}
                          {cupPreMatch
                            ? " — Pré-Jogo"
                            : cupExtraTimeBadge
                              ? " — Prolongamento"
                              : ""}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  {/* ── HERO: MY MATCH ─────────────────────── */}
                  {matchResults &&
                    (() => {
                      const myMatch = matchResults.results.find(
                        (m) =>
                          m.homeTeamId === me.teamId ||
                          m.awayTeamId === me.teamId,
                      );
                      if (!myMatch) return null;
                      const hInfo = teams.find(
                        (t) => t.id === myMatch.homeTeamId,
                      );
                      const aInfo = teams.find(
                        (t) => t.id === myMatch.awayTeamId,
                      );
                      const matchEvents = myMatch.events || [];
                      const homeGoals = matchEvents.filter(
                        (e) =>
                          e.minute <= liveMinute &&
                          e.type === "goal" &&
                          e.team === "home",
                      );
                      const awayGoals = matchEvents.filter(
                        (e) =>
                          e.minute <= liveMinute &&
                          e.type === "goal" &&
                          e.team === "away",
                      );
                      const progress = Math.min(100, (liveMinute / 90) * 100);

                      return (
                        <div className="bg-surface-container rounded-md overflow-hidden mb-4 relative">
                          {/* Stadium glow gradient */}
                          <div
                            className="absolute inset-0 pointer-events-none"
                            style={{
                              background: `radial-gradient(ellipse 80% 40% at 50% 0%, ${hInfo?.color_primary || "#333"}22 0%, transparent 70%)`,
                            }}
                          />

                          {/* Matchday label bar */}
                          <div className="relative flex items-center justify-center px-4 py-2 text-[10px] uppercase tracking-widest text-on-surface-variant/50 font-bold">
                            <span>
                              {isCupMatch
                                ? `Taça · ${cupMatchRoundName}`
                                : `${DIVISION_NAMES[hInfo?.division] || ""} · Jornada ${matchResults.matchweek}`}
                            </span>
                          </div>

                          {/* Teams + Score */}
                          <div className="relative flex items-stretch justify-between px-2 sm:px-6 py-4 sm:py-5">
                            {/* Home */}
                            <div className="flex-1 min-w-0 flex flex-col items-center gap-1">
                              <span
                                className="w-10 h-10 rounded-md flex items-center justify-center text-sm font-black shrink-0"
                                style={{
                                  backgroundColor:
                                    hInfo?.color_primary || "#333",
                                  color: hInfo?.color_secondary || "#fff",
                                }}
                              >
                                {(hInfo?.name || "")
                                  .substring(0, 3)
                                  .toUpperCase()}
                              </span>
                              <span className="text-xs font-bold text-on-surface truncate w-full text-center px-1">
                                {hInfo?.name}
                              </span>
                              <div className="flex flex-col items-center mt-1 w-full">
                                {matchEvents
                                  .filter(
                                    (e) =>
                                      e.minute <= liveMinute &&
                                      e.team === "home" &&
                                      [
                                        "goal",
                                        "penalty_goal",
                                        "own_goal",
                                        "yellow",
                                        "red",
                                        "injury",
                                        "substitution",
                                      ].includes(e.type),
                                  )
                                  .sort((a, b) => a.minute - b.minute)
                                  .map((e, i) => {
                                    const icon =
                                      e.type === "goal" ||
                                      e.type === "penalty_goal"
                                        ? "⚽"
                                        : e.type === "own_goal"
                                          ? "⚽🔙"
                                          : e.type === "yellow"
                                            ? "🟨"
                                            : e.type === "red"
                                              ? "🟥"
                                              : e.type === "injury"
                                                ? "🤕"
                                                : e.type === "substitution" ||
                                                    e.type === "halftime_sub"
                                                  ? "🔄"
                                                  : "";
                                    const name =
                                      e.playerName ||
                                      e.player_name ||
                                      e.player ||
                                      "?";
                                    return (
                                      <div
                                        key={i}
                                        className="flex items-center justify-center gap-1 text-[10px] leading-tight w-full"
                                      >
                                        <span className="text-on-surface-variant/40 tabular-nums shrink-0">
                                          {e.minute}'
                                        </span>
                                        <span className="shrink-0">{icon}</span>
                                        <span
                                          className={`font-bold truncate min-w-0 ${e.type === "goal" || e.type === "penalty_goal" ? "text-primary" : e.type === "own_goal" ? "text-orange-400" : e.type === "red" ? "text-red-400" : "text-on-surface-variant/70"}`}
                                        >
                                          <PlayerLink playerId={e.playerId}>
                                            {name}
                                          </PlayerLink>
                                        </span>
                                      </div>
                                    );
                                  })}
                              </div>
                            </div>

                            {/* Score center */}
                            {(() => {
                              const myFlashHome =
                                goalFlashRef.current[
                                  `${myMatch.homeTeamId}_${myMatch.awayTeamId}_home`
                                ];
                              const myFlashAway =
                                goalFlashRef.current[
                                  `${myMatch.homeTeamId}_${myMatch.awayTeamId}_away`
                                ];
                              const nowTs = Date.now();
                              const myHomeFlashing =
                                myFlashHome && nowTs - myFlashHome < 1500;
                              const myAwayFlashing =
                                myFlashAway && nowTs - myFlashAway < 1500;
                              return (
                                <div className="flex flex-col items-center justify-center gap-1 shrink-0 w-[90px] sm:w-[120px]">
                                  <button
                                    onClick={() => {
                                      setMatchDetailFixture(myMatch);
                                      setShowMatchDetail(true);
                                    }}
                                    className="flex items-baseline gap-1.5 cursor-pointer group"
                                  >
                                    <span
                                      className="text-4xl sm:text-5xl font-headline font-black tracking-tighter"
                                      style={{
                                        color: myHomeFlashing
                                          ? "#ff4444"
                                          : undefined,
                                        transition: myHomeFlashing
                                          ? "none"
                                          : "color 1.25s ease",
                                      }}
                                    >
                                      {homeGoals.length}
                                    </span>
                                    <span className="text-xl sm:text-2xl text-on-surface-variant/30 font-headline">
                                      -
                                    </span>
                                    <span
                                      className="text-4xl sm:text-5xl font-headline font-black tracking-tighter"
                                      style={{
                                        color: myAwayFlashing
                                          ? "#ff4444"
                                          : undefined,
                                        transition: myAwayFlashing
                                          ? "none"
                                          : "color 1.25s ease",
                                      }}
                                    >
                                      {awayGoals.length}
                                    </span>
                                  </button>
                                  {/* Enriched progress bar */}
                                  <div className="relative w-full mt-2">
                                    <div className="relative h-1.5 bg-outline-variant/20 rounded-full overflow-hidden">
                                      <div
                                        className="h-full bg-primary transition-all duration-1000"
                                        style={{ width: `${progress}%` }}
                                      />
                                      {/* Event markers on progress bar */}
                                      {matchEvents
                                        .filter(
                                          (e) =>
                                            e.minute <= liveMinute &&
                                            [
                                              "goal",
                                              "penalty_goal",
                                              "own_goal",
                                              "yellow",
                                              "red",
                                              "injury",
                                            ].includes(e.type),
                                        )
                                        .map((e, i) => (
                                          <span
                                            key={i}
                                            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2"
                                            style={{
                                              left: `${Math.min(98, Math.max(2, (e.minute / 90) * 100))}%`,
                                            }}
                                            title={`${e.minute}' ${e.type}`}
                                          >
                                            <span
                                              className={`block w-1.5 h-1.5 rounded-full ${
                                                e.type === "goal" ||
                                                e.type === "penalty_goal"
                                                  ? "bg-primary"
                                                  : e.type === "own_goal"
                                                    ? "bg-orange-400"
                                                    : e.type === "yellow"
                                                      ? "bg-yellow-400"
                                                      : e.type === "red"
                                                        ? "bg-red-500"
                                                        : "bg-blue-400"
                                              }`}
                                            />
                                          </span>
                                        ))}
                                    </div>
                                    <div className="flex justify-between text-[8px] text-on-surface-variant/30 mt-0.5">
                                      <span>0'</span>
                                      <span className="font-bold text-primary/60">
                                        {liveMinute}'
                                      </span>
                                      <span>90'</span>
                                    </div>
                                    {myMatch.attendance && (
                                      <div className="flex items-center justify-center gap-1 mt-1 text-[10px] text-on-surface-variant/50">
                                        <span>🏟️</span>
                                        <span className="font-bold">
                                          {myMatch.attendance.toLocaleString(
                                            "pt-PT",
                                          )}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })()}

                            {/* Away */}
                            <div className="flex-1 min-w-0 flex flex-col items-center gap-1">
                              <span
                                className="w-10 h-10 rounded-md flex items-center justify-center text-sm font-black shrink-0"
                                style={{
                                  backgroundColor:
                                    aInfo?.color_primary || "#333",
                                  color: aInfo?.color_secondary || "#fff",
                                }}
                              >
                                {(aInfo?.name || "")
                                  .substring(0, 3)
                                  .toUpperCase()}
                              </span>
                              <span className="text-xs font-bold text-on-surface truncate w-full text-center px-1">
                                {aInfo?.name}
                              </span>
                              <div className="flex flex-col items-center mt-1 w-full">
                                {matchEvents
                                  .filter(
                                    (e) =>
                                      e.minute <= liveMinute &&
                                      e.team === "away" &&
                                      [
                                        "goal",
                                        "penalty_goal",
                                        "own_goal",
                                        "yellow",
                                        "red",
                                        "injury",
                                        "substitution",
                                      ].includes(e.type),
                                  )
                                  .sort((a, b) => a.minute - b.minute)
                                  .map((e, i) => {
                                    const icon =
                                      e.type === "goal" ||
                                      e.type === "penalty_goal"
                                        ? "⚽"
                                        : e.type === "own_goal"
                                          ? "⚽🔙"
                                          : e.type === "yellow"
                                            ? "🟨"
                                            : e.type === "red"
                                              ? "🟥"
                                              : e.type === "injury"
                                                ? "🤕"
                                                : e.type === "substitution" ||
                                                    e.type === "halftime_sub"
                                                  ? "🔄"
                                                  : "";
                                    const name =
                                      e.playerName ||
                                      e.player_name ||
                                      e.player ||
                                      "?";
                                    return (
                                      <div
                                        key={i}
                                        className="flex items-center justify-center gap-1 text-[10px] leading-tight w-full"
                                      >
                                        <span
                                          className={`font-bold truncate min-w-0 ${e.type === "goal" || e.type === "penalty_goal" ? "text-primary" : e.type === "own_goal" ? "text-orange-400" : e.type === "red" ? "text-red-400" : "text-on-surface-variant/70"}`}
                                        >
                                          <PlayerLink playerId={e.playerId}>
                                            {name}
                                          </PlayerLink>
                                        </span>
                                        <span className="shrink-0">{icon}</span>
                                        <span className="text-on-surface-variant/40 tabular-nums shrink-0">
                                          {e.minute}'
                                        </span>
                                      </div>
                                    );
                                  })}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                  {/* ── MULTIVIEW GRID ─────────────────────── */}
                  {!isCupMatch && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {[1, 2, 3, 4].map((div) => (
                        <div key={div}>
                          <h3 className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40 mb-1.5 mt-2 first:mt-0">
                            {DIVISION_NAMES[div] || `Div ${div}`}
                          </h3>
                          <div className="space-y-1">
                            {matchResults.results
                              .filter(
                                (m) =>
                                  teams.find((t) => t.id === m.homeTeamId)
                                    ?.division === div,
                              )
                              .filter(
                                (m) =>
                                  m.homeTeamId !== me.teamId &&
                                  m.awayTeamId !== me.teamId,
                              )
                              .map((match, idx) => {
                                const hInfo = teams.find(
                                  (t) => t.id === match.homeTeamId,
                                );
                                const aInfo = teams.find(
                                  (t) => t.id === match.awayTeamId,
                                );
                                const matchEvents = match.events || [];
                                const currentHome = matchEvents.filter(
                                  (e) =>
                                    e.minute <= liveMinute &&
                                    e.type === "goal" &&
                                    e.team === "home",
                                );
                                const currentAway = matchEvents.filter(
                                  (e) =>
                                    e.minute <= liveMinute &&
                                    e.type === "goal" &&
                                    e.team === "away",
                                );
                                const isHumanMatch = players.some(
                                  (p) =>
                                    p.teamId === match.homeTeamId ||
                                    p.teamId === match.awayTeamId,
                                );

                                const flashHome =
                                  goalFlashRef.current[
                                    `${match.homeTeamId}_${match.awayTeamId}_home`
                                  ];
                                const flashAway =
                                  goalFlashRef.current[
                                    `${match.homeTeamId}_${match.awayTeamId}_away`
                                  ];
                                const now = Date.now();
                                const homeFlashing =
                                  flashHome && now - flashHome < 1500;
                                const awayFlashing =
                                  flashAway && now - flashAway < 1500;

                                return (
                                  <div
                                    key={idx}
                                    className={`bg-surface-container-low rounded-md overflow-hidden ${isHumanMatch ? "border-l-2 border-l-primary/50" : ""}`}
                                  >
                                    {/* Match card */}
                                    <div className="flex items-center">
                                      <div className="flex-1 flex items-center gap-1.5 px-2.5 py-1.5 min-w-0">
                                        <span
                                          className="w-2 h-2 rounded-full shrink-0"
                                          style={{
                                            backgroundColor:
                                              hInfo?.color_primary || "#666",
                                          }}
                                        />
                                        <span className="text-[11px] font-bold text-on-surface truncate">
                                          {hInfo?.name}
                                        </span>
                                      </div>
                                      <button
                                        onClick={() => {
                                          setMatchDetailFixture(match);
                                          setShowMatchDetail(true);
                                        }}
                                        title="Ver detalhes da partida"
                                        className="px-3 py-1.5 bg-surface-container hover:bg-surface-bright text-on-surface text-center font-headline min-w-[52px] flex gap-1 items-center justify-center text-sm leading-none transition-colors cursor-pointer"
                                      >
                                        <span
                                          className="font-black"
                                          style={{
                                            color: homeFlashing
                                              ? "#ff4444"
                                              : undefined,
                                            transition: homeFlashing
                                              ? "none"
                                              : "color 1.25s ease",
                                          }}
                                        >
                                          {currentHome.length}
                                        </span>
                                        <span className="text-on-surface-variant/30 text-xs">
                                          -
                                        </span>
                                        <span
                                          className="font-black"
                                          style={{
                                            color: awayFlashing
                                              ? "#ff4444"
                                              : undefined,
                                            transition: awayFlashing
                                              ? "none"
                                              : "color 1.25s ease",
                                          }}
                                        >
                                          {currentAway.length}
                                        </span>
                                      </button>
                                      <div className="flex-1 flex items-center gap-1.5 px-2.5 py-1.5 min-w-0 justify-end">
                                        <span className="text-[11px] font-bold text-on-surface truncate">
                                          {aInfo?.name}
                                        </span>
                                        <span
                                          className="w-2 h-2 rounded-full shrink-0"
                                          style={{
                                            backgroundColor:
                                              aInfo?.color_primary || "#666",
                                          }}
                                        />
                                      </div>
                                    </div>
                                    {/* Last event */}
                                    <div className="flex text-[9px] text-on-surface-variant/40 px-2.5 pb-1">
                                      <span className="flex-1 truncate">
                                        {getMatchLastEventText(
                                          matchEvents,
                                          liveMinute,
                                          "home",
                                        )}
                                      </span>
                                      {isHumanMatch && (
                                        <span className="text-primary/40 font-bold text-[8px] uppercase">
                                          Humano
                                        </span>
                                      )}
                                      <span className="flex-1 truncate text-right">
                                        {getMatchLastEventText(
                                          matchEvents,
                                          liveMinute,
                                          "away",
                                        )}
                                      </span>
                                    </div>
                                  </div>
                                );
                              })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* ── CUP MULTIVIEW (single list, no division groups) ── */}
                  {isCupMatch && matchResults?.results && (
                    <div className="space-y-1">
                      {matchResults.results
                        .filter(
                          (m) =>
                            m.homeTeamId !== me.teamId &&
                            m.awayTeamId !== me.teamId,
                        )
                        .filter((m) => {
                          // After 90', only show games still in extra time (score tied at 90)
                          if (liveMinute <= 90) return true;
                          const goals90Home = (m.events || []).filter(
                            (e) =>
                              e.minute <= 90 &&
                              e.type === "goal" &&
                              e.team === "home",
                          ).length;
                          const goals90Away = (m.events || []).filter(
                            (e) =>
                              e.minute <= 90 &&
                              e.type === "goal" &&
                              e.team === "away",
                          ).length;
                          return goals90Home === goals90Away;
                        })
                        .map((match, idx) => {
                          const hInfo = teams.find(
                            (t) => t.id === match.homeTeamId,
                          );
                          const aInfo = teams.find(
                            (t) => t.id === match.awayTeamId,
                          );
                          const matchEvents = match.events || [];
                          const currentHome = matchEvents.filter(
                            (e) =>
                              e.minute <= liveMinute &&
                              e.type === "goal" &&
                              e.team === "home",
                          );
                          const currentAway = matchEvents.filter(
                            (e) =>
                              e.minute <= liveMinute &&
                              e.type === "goal" &&
                              e.team === "away",
                          );
                          const isHumanMatch = players.some(
                            (p) =>
                              p.teamId === match.homeTeamId ||
                              p.teamId === match.awayTeamId,
                          );
                          const flashHome =
                            goalFlashRef.current[
                              `${match.homeTeamId}_${match.awayTeamId}_home`
                            ];
                          const flashAway =
                            goalFlashRef.current[
                              `${match.homeTeamId}_${match.awayTeamId}_away`
                            ];
                          const now = Date.now();
                          const homeFlashing =
                            flashHome && now - flashHome < 1500;
                          const awayFlashing =
                            flashAway && now - flashAway < 1500;

                          return (
                            <div
                              key={idx}
                              className={`bg-surface-container-low rounded-md overflow-hidden ${isHumanMatch ? "border-l-2 border-l-primary/50" : ""}`}
                            >
                              <div className="flex items-center">
                                <div className="flex-1 flex items-center gap-1.5 px-2.5 py-1.5 min-w-0">
                                  <span
                                    className="w-2 h-2 rounded-full shrink-0"
                                    style={{
                                      backgroundColor:
                                        hInfo?.color_primary || "#666",
                                    }}
                                  />
                                  <span className="text-[11px] font-bold text-on-surface truncate">
                                    {hInfo?.name}
                                  </span>
                                </div>
                                <button
                                  onClick={() => {
                                    setMatchDetailFixture(match);
                                    setShowMatchDetail(true);
                                  }}
                                  title="Ver detalhes da partida"
                                  className="px-3 py-1.5 bg-surface-container hover:bg-surface-bright text-on-surface text-center font-headline min-w-[52px] flex gap-1 items-center justify-center text-sm leading-none transition-colors cursor-pointer"
                                >
                                  <span
                                    className="font-black"
                                    style={{
                                      color: homeFlashing
                                        ? "#ff4444"
                                        : undefined,
                                      transition: homeFlashing
                                        ? "none"
                                        : "color 1.25s ease",
                                    }}
                                  >
                                    {currentHome.length}
                                  </span>
                                  <span className="text-on-surface-variant/30 text-xs">
                                    -
                                  </span>
                                  <span
                                    className="font-black"
                                    style={{
                                      color: awayFlashing
                                        ? "#ff4444"
                                        : undefined,
                                      transition: awayFlashing
                                        ? "none"
                                        : "color 1.25s ease",
                                    }}
                                  >
                                    {currentAway.length}
                                  </span>
                                </button>
                                <div className="flex-1 flex items-center gap-1.5 px-2.5 py-1.5 min-w-0 justify-end">
                                  <span className="text-[11px] font-bold text-on-surface truncate">
                                    {aInfo?.name}
                                  </span>
                                  <span
                                    className="w-2 h-2 rounded-full shrink-0"
                                    style={{
                                      backgroundColor:
                                        aInfo?.color_primary || "#666",
                                    }}
                                  />
                                </div>
                              </div>
                              <div className="flex text-[9px] text-on-surface-variant/40 px-2.5 pb-1">
                                <span className="flex-1 truncate">
                                  {getMatchLastEventText(
                                    matchEvents,
                                    liveMinute,
                                    "home",
                                  )}
                                </span>
                                {isHumanMatch && (
                                  <span className="text-primary/40 font-bold text-[8px] uppercase">
                                    Humano
                                  </span>
                                )}
                                <span className="flex-1 truncate text-right">
                                  {getMatchLastEventText(
                                    matchEvents,
                                    liveMinute,
                                    "away",
                                  )}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>
              )}

              {activeTab === "standings" && (
                <LeagueStandings
                  teams={teams}
                  teamForms={teamForms}
                  topScorers={topScorers}
                  myTeamId={me.teamId}
                  completedJornada={completedJornada}
                  matchweekCount={matchweekCount}
                  palmares={palmares}
                  onTeamClick={handleOpenTeamSquad}
                />
              )}

              {activeTab === "cup" && (
                <div className="space-y-6">
                  {/* ── TAÇA DE PORTUGAL PAGE ─────────────────────────────── */}
                  {!cupRoundResults && !cupDraw && (
                    <div className="bg-surface-container rounded-lg p-10 text-center">
                      <p className="text-4xl mb-3">🏆</p>
                      <p className="text-zinc-500 font-bold">
                        Sem dados de Taça disponíveis neste momento.
                      </p>
                    </div>
                  )}

                  {cupRoundResults && (
                    <div className="bg-surface-container rounded-lg overflow-hidden">
                      <div className="bg-amber-900/20 px-6 py-4 border-b border-amber-800/30">
                        <p className="text-xs text-amber-400 uppercase font-black tracking-widest">
                          Taça de Portugal · Temporada {cupRoundResults.season}
                        </p>
                        <h2 className="text-xl font-black text-white mt-0.5">
                          {cupRoundResults.roundName}
                        </h2>
                      </div>
                      <div className="p-4 space-y-2">
                        {(cupRoundResults.results || []).map((r, idx) => {
                          const hInfo = teams.find(
                            (t) => t.id === r.homeTeamId,
                          );
                          const aInfo = teams.find(
                            (t) => t.id === r.awayTeamId,
                          );
                          const winnerInfo = teams.find(
                            (t) => t.id === r.winnerId,
                          );
                          const isMyMatch =
                            r.homeTeamId === me.teamId ||
                            r.awayTeamId === me.teamId;
                          return (
                            <div
                              key={idx}
                              className={`rounded-md border px-4 py-3 ${isMyMatch ? "border-primary bg-primary/10" : "border-outline-variant/20 bg-surface"}`}
                            >
                              <div className="flex items-center gap-3">
                                <span
                                  className="flex-1 text-right font-black text-sm truncate"
                                  style={{
                                    color: hInfo?.color_primary || "#fff",
                                  }}
                                >
                                  {hInfo?.name || r.homeTeamId}
                                </span>
                                <span className="px-3 py-1 bg-surface border border-outline-variant/20 rounded font-black text-on-surface text-sm">
                                  {r.homeGoals} – {r.awayGoals}
                                  {r.wentToET && !r.decidedByPenalties && (
                                    <span className="ml-1 text-[10px] text-zinc-500 font-semibold">
                                      (p.e.)
                                    </span>
                                  )}
                                  {r.decidedByPenalties && (
                                    <span className="ml-1 text-[10px] text-amber-400 font-semibold">
                                      ({r.penaltyHomeGoals}–{r.penaltyAwayGoals}{" "}
                                      g.p.)
                                    </span>
                                  )}
                                </span>
                                <span
                                  className="flex-1 text-left font-black text-sm truncate"
                                  style={{
                                    color: aInfo?.color_primary || "#fff",
                                  }}
                                >
                                  {aInfo?.name || r.awayTeamId}
                                </span>
                              </div>
                              {winnerInfo && (
                                <p className="text-center text-amber-400 text-xs font-black mt-1">
                                  ✓ Apura-se {winnerInfo.name}
                                  {cupRoundResults.isFinal
                                    ? " 🏆 Vencedor da Taça!"
                                    : ""}
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {cupDraw && !cupRoundResults && (
                    <div className="bg-surface-container rounded-lg overflow-hidden">
                      <div className="bg-surface-container-high/40 px-6 py-4 border-b border-outline-variant/20">
                        <p className="text-xs text-zinc-400 uppercase font-black tracking-widest">
                          Taça de Portugal · Temporada {cupDraw.season}
                        </p>
                        <h2 className="text-xl font-black text-white mt-0.5">
                          Sorteio — {cupDraw.roundName}
                        </h2>
                      </div>
                      <div className="p-4 space-y-2">
                        {(cupDraw.fixtures || []).map((fixture, idx) => {
                          const hInfo = fixture.homeTeam;
                          const aInfo = fixture.awayTeam;
                          const homeId = hInfo?.id;
                          const awayId = aInfo?.id;
                          const hName = hInfo?.name || "?";
                          const aName = aInfo?.name || "?";
                          const isMine =
                            homeId === me.teamId || awayId === me.teamId;
                          return (
                            <div
                              key={idx}
                              className={`rounded-md border px-4 py-3 flex items-center gap-3 ${isMine ? "border-primary bg-primary/10" : "border-outline-variant/20 bg-surface"}`}
                            >
                              <span
                                className="flex-1 text-right font-black text-sm truncate"
                                style={{
                                  color: hInfo?.color_primary || "#fff",
                                }}
                              >
                                {hName}
                              </span>
                              <span className="px-3 py-1 bg-surface border border-outline-variant/20 rounded font-black text-on-surface-variant text-sm">
                                vs
                              </span>
                              <span
                                className="flex-1 text-left font-black text-sm truncate"
                                style={{
                                  color: aInfo?.color_primary || "#fff",
                                }}
                              >
                                {aName}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === "calendario" &&
                (() => {
                  const cal = calendarData;
                  const curIdx = cal?.calendarIndex ?? 0;
                  const calYear = cal?.year ?? seasonYear;
                  const done = Math.min(curIdx, SEASON_CALENDAR.length);
                  const pct = Math.round((done / SEASON_CALENDAR.length) * 100);
                  const myTeamId = me?.teamId;
                  const myTeam = teams.find((t) => t.id === myTeamId);
                  const myDivision = myTeam?.division;
                  const myDivTeams = teams
                    .filter((t) => t.division === myDivision)
                    .sort((a, b) => a.id - b.id);

                  const getStatus = (entry) => {
                    if (entry.calendarIndex < curIdx) return "done";
                    if (entry.calendarIndex === curIdx) return "current";
                    return "future";
                  };

                  const toggleEntry = (idx) =>
                    setExpandedCalEntries((prev) => ({
                      ...prev,
                      [idx]: !prev[idx],
                    }));

                  return (
                    <div className="space-y-4">
                      {/* ── PAGE HEADER ──────────────────────────────────── */}
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h2 className="text-lg font-headline font-black text-on-surface">
                            Calendário
                          </h2>
                          <p className="text-xs text-on-surface-variant mt-0.5">
                            Época {calYear}/{calYear + 1}
                            {cal ? ` · Temporada ${cal.season}` : ""}
                          </p>
                        </div>
                        {/* Progress pill */}
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <span className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                            {done} / {SEASON_CALENDAR.length} semanas
                          </span>
                          <div className="w-36 h-1.5 bg-outline-variant/30 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary rounded-full transition-all duration-500"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      </div>

                      {/* ── LOADING STATE ─────────────────────────────────── */}
                      {!cal && (
                        <div className="bg-surface-container rounded-lg p-10 text-center">
                          <span className="material-symbols-outlined text-4xl text-on-surface-variant/40 block mb-2">
                            calendar_month
                          </span>
                          <p className="text-on-surface-variant font-bold text-sm">
                            A carregar calendário…
                          </p>
                        </div>
                      )}

                      {/* ── CALENDAR ENTRIES ──────────────────────────────── */}
                      {cal && (
                        <div className="space-y-2">
                          {SEASON_CALENDAR.map((entry) => {
                            const status = getStatus(entry);
                            const isCurrent = status === "current";
                            const isDone = status === "done";
                            const isCupEntry = entry.type === "cup";
                            const isExpanded =
                              !!expandedCalEntries[entry.calendarIndex];

                            // ── card style per status ───────────────────
                            const cardClass = isCurrent
                              ? "bg-primary/8 border border-primary/50 rounded-lg overflow-hidden"
                              : isDone
                                ? "bg-surface-container rounded-lg overflow-hidden opacity-80"
                                : "bg-surface-container rounded-lg overflow-hidden opacity-60";

                            // ── CUP ENTRY ────────────────────────────────
                            if (isCupEntry) {
                              const cupFixtures = cal.cupMatches.filter(
                                (m) => m.round === entry.round,
                              );
                              const cupDrawn = cupFixtures.length > 0;
                              const myMatch = cupDrawn
                                ? cupFixtures.find(
                                    (f) =>
                                      f.home_team_id === myTeamId ||
                                      f.away_team_id === myTeamId,
                                  )
                                : null;

                              // check if user was already eliminated from the cup
                              const isEliminated = (() => {
                                const myPlayedCupMatches =
                                  cal.cupMatches.filter(
                                    (m) =>
                                      m.played &&
                                      (m.home_team_id === myTeamId ||
                                        m.away_team_id === myTeamId),
                                  );
                                return myPlayedCupMatches.some((m) => {
                                  const hasPen =
                                    m.home_penalties > 0 ||
                                    m.away_penalties > 0;
                                  if (m.home_team_id === myTeamId) {
                                    const myScore = hasPen
                                      ? m.home_penalties
                                      : m.home_score;
                                    const opScore = hasPen
                                      ? m.away_penalties
                                      : m.away_score;
                                    return myScore < opScore;
                                  } else {
                                    const myScore = hasPen
                                      ? m.away_penalties
                                      : m.away_score;
                                    const opScore = hasPen
                                      ? m.home_penalties
                                      : m.home_score;
                                    return myScore < opScore;
                                  }
                                });
                              })();

                              // status badge
                              const cupBadge = isDone ? (
                                <span className="text-[9px] font-black uppercase tracking-widest bg-surface-bright text-on-surface-variant/60 px-2 py-0.5 rounded">
                                  Concluído
                                </span>
                              ) : isCurrent ? (
                                <span className="text-[9px] font-black uppercase tracking-widest bg-primary/20 text-primary px-2 py-0.5 rounded animate-pulse">
                                  Próximo
                                </span>
                              ) : !cupDrawn ? (
                                isEliminated ? (
                                  <span className="text-[9px] font-black uppercase tracking-widest bg-red-500/15 text-red-400 px-2 py-0.5 rounded">
                                    Eliminado
                                  </span>
                                ) : (
                                  <span className="text-[9px] font-black uppercase tracking-widest bg-amber-500/15 text-amber-400 px-2 py-0.5 rounded">
                                    Aguarda sorteio
                                  </span>
                                )
                              ) : (
                                <span className="text-[9px] font-black uppercase tracking-widest bg-surface-bright text-on-surface-variant/40 px-2 py-0.5 rounded">
                                  Por jogar
                                </span>
                              );

                              return (
                                <div
                                  key={entry.calendarIndex}
                                  className={cardClass}
                                >
                                  {/* Header – clickable to expand all cup matches */}
                                  <div
                                    className={`flex items-center gap-3 px-4 py-2.5 border-b border-amber-800/30 bg-amber-900/15 ${cupDrawn ? "cursor-pointer select-none" : ""}`}
                                    onClick={
                                      cupDrawn
                                        ? () => toggleEntry(entry.calendarIndex)
                                        : undefined
                                    }
                                  >
                                    <span className="shrink-0 text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-amber-500/25 text-amber-400">
                                      Taça
                                    </span>
                                    <span className="font-black text-sm text-on-surface flex-1 truncate">
                                      {entry.roundName}
                                    </span>
                                    {isCurrent && (
                                      <span className="shrink-0 relative flex h-2 w-2">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
                                      </span>
                                    )}
                                    {/* Our cup match preview */}
                                    {myMatch &&
                                      (() => {
                                        const hInfo = teams.find(
                                          (t) => t.id === myMatch.home_team_id,
                                        );
                                        const aInfo = teams.find(
                                          (t) => t.id === myMatch.away_team_id,
                                        );
                                        const hasPen =
                                          myMatch.home_penalties > 0 ||
                                          myMatch.away_penalties > 0;
                                        return (
                                          <div className="flex items-center gap-1.5 text-[11px] font-bold shrink-0">
                                            <span
                                              className={
                                                myMatch.home_team_id ===
                                                myTeamId
                                                  ? "text-primary"
                                                  : "text-on-surface-variant"
                                              }
                                            >
                                              {hInfo?.name ??
                                                myMatch.home_team_id}
                                            </span>
                                            <span className="text-on-surface-variant/50 text-[10px] font-black">
                                              {myMatch.played
                                                ? `${myMatch.home_score}–${myMatch.away_score}${hasPen ? ` (${myMatch.home_penalties}–${myMatch.away_penalties}gp)` : ""}`
                                                : "vs"}
                                            </span>
                                            <span
                                              className={
                                                myMatch.away_team_id ===
                                                myTeamId
                                                  ? "text-primary"
                                                  : "text-on-surface-variant"
                                              }
                                            >
                                              {aInfo?.name ??
                                                myMatch.away_team_id}
                                            </span>
                                          </div>
                                        );
                                      })()}
                                    {!myMatch && !cupDrawn && (
                                      <span className="text-[10px] text-on-surface-variant/40 italic">
                                        Sorteio por realizar
                                      </span>
                                    )}
                                    <div className="flex items-center gap-2 shrink-0">
                                      {cupBadge}
                                      {cupDrawn && (
                                        <span className="material-symbols-outlined text-base text-on-surface-variant/40">
                                          {isExpanded
                                            ? "expand_less"
                                            : "expand_more"}
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  {/* Expanded: all cup fixtures */}
                                  {isExpanded && cupDrawn && (
                                    <div>
                                      {cupFixtures.map((f, fi) => {
                                        const homeInfo = teams.find(
                                          (t) => t.id === f.home_team_id,
                                        );
                                        const awayInfo = teams.find(
                                          (t) => t.id === f.away_team_id,
                                        );
                                        const isMyMatch =
                                          f.home_team_id === myTeamId ||
                                          f.away_team_id === myTeamId;
                                        const hasPenalties =
                                          f.home_penalties > 0 ||
                                          f.away_penalties > 0;
                                        const hasET =
                                          (f.home_et_score > 0 ||
                                            f.away_et_score > 0) &&
                                          !hasPenalties;
                                        return (
                                          <div
                                            key={fi}
                                            className={`flex items-center gap-2 px-4 py-2 border-b border-outline-variant/5 last:border-0 ${
                                              isMyMatch ? "bg-primary/8" : ""
                                            }`}
                                          >
                                            <div className="flex items-center gap-1.5 flex-1 min-w-0 justify-end">
                                              <button
                                                className={`text-[11px] font-bold truncate text-right ${isMyMatch && f.home_team_id === myTeamId ? "text-primary" : f.played && f.winner_team_id !== f.home_team_id ? "text-on-surface-variant/50" : "text-on-surface hover:underline"}`}
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  if (
                                                    f.home_team_id !==
                                                      myTeamId &&
                                                    homeInfo
                                                  )
                                                    handleOpenTeamSquad(
                                                      homeInfo,
                                                    );
                                                }}
                                              >
                                                {homeInfo?.name ??
                                                  f.home_team_id}
                                              </button>
                                              <span
                                                className="shrink-0 w-2 h-2 rounded-full"
                                                style={{
                                                  backgroundColor:
                                                    homeInfo?.color_primary ||
                                                    "#666",
                                                }}
                                              />
                                            </div>
                                            <div className="shrink-0 w-20 text-center">
                                              {f.played ? (
                                                <span className="text-xs font-black font-headline text-on-surface bg-surface border border-outline-variant/20 rounded px-2 py-0.5 whitespace-nowrap">
                                                  {f.home_score}–{f.away_score}
                                                  {hasPenalties && (
                                                    <span className="ml-1 text-[9px] text-amber-400">
                                                      ({f.home_penalties}–
                                                      {f.away_penalties}gp)
                                                    </span>
                                                  )}
                                                  {hasET && (
                                                    <span className="ml-1 text-[9px] text-zinc-500">
                                                      (p.e.)
                                                    </span>
                                                  )}
                                                </span>
                                              ) : (
                                                <span className="text-[10px] font-black text-on-surface-variant/40">
                                                  vs
                                                </span>
                                              )}
                                            </div>
                                            <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                              <span
                                                className="shrink-0 w-2 h-2 rounded-full"
                                                style={{
                                                  backgroundColor:
                                                    awayInfo?.color_primary ||
                                                    "#666",
                                                }}
                                              />
                                              <button
                                                className={`text-[11px] font-bold truncate text-left ${isMyMatch && f.away_team_id === myTeamId ? "text-primary" : f.played && f.winner_team_id !== f.away_team_id ? "text-on-surface-variant/50" : "text-on-surface hover:underline"}`}
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  if (
                                                    f.away_team_id !==
                                                      myTeamId &&
                                                    awayInfo
                                                  )
                                                    handleOpenTeamSquad(
                                                      awayInfo,
                                                    );
                                                }}
                                              >
                                                {awayInfo?.name ??
                                                  f.away_team_id}
                                              </button>
                                            </div>
                                          </div>
                                        );
                                      })}
                                      {/* Cup final winner */}
                                      {entry.round === 5 &&
                                        cupFixtures.some((m) => m.played) &&
                                        (() => {
                                          const finalMatch = cupFixtures.find(
                                            (m) => m.played,
                                          );
                                          const champ = finalMatch
                                            ? teams.find(
                                                (t) =>
                                                  t.id ===
                                                  finalMatch.winner_team_id,
                                              )
                                            : null;
                                          return champ ? (
                                            <div className="px-4 py-2 border-t border-amber-800/30 bg-amber-900/10 flex items-center gap-2">
                                              <span className="text-amber-400 text-sm">
                                                🏆
                                              </span>
                                              <span className="text-xs font-black text-amber-400 uppercase tracking-widest">
                                                Vencedor: {champ.name}
                                              </span>
                                            </div>
                                          ) : null;
                                        })()}
                                    </div>
                                  )}
                                </div>
                              );
                            }

                            // ── LEAGUE ENTRY ─────────────────────────────
                            // For done matchweeks: use actual DB records as the source
                            // of truth (home/away and scores).  For future/current:
                            // use the fixture generator (with swap correction).
                            const divFixtures = isDone
                              ? cal.leagueMatches
                                  .filter(
                                    (m) =>
                                      m.matchweek === entry.matchweek &&
                                      myDivTeams.some(
                                        (t) => t.id === m.home_team_id,
                                      ) &&
                                      myDivTeams.some(
                                        (t) => t.id === m.away_team_id,
                                      ),
                                  )
                                  .map((m) => ({
                                    homeTeamId: m.home_team_id,
                                    awayTeamId: m.away_team_id,
                                    result: m,
                                  }))
                              : generateLeagueFixtures(
                                  myDivTeams,
                                  entry.matchweek,
                                  myTeamId,
                                ).map((f) => ({ ...f, result: null }));

                            const myFixture = divFixtures.find(
                              (f) =>
                                f.homeTeamId === myTeamId ||
                                f.awayTeamId === myTeamId,
                            );
                            const myImHome = myFixture?.homeTeamId === myTeamId;
                            const myHomeInfo = myFixture
                              ? teams.find((t) => t.id === myFixture.homeTeamId)
                              : null;
                            const myAwayInfo = myFixture
                              ? teams.find((t) => t.id === myFixture.awayTeamId)
                              : null;

                            // status badge
                            const leagueBadge = isDone ? (
                              <span className="text-[9px] font-black uppercase tracking-widest bg-surface-bright text-on-surface-variant/60 px-2 py-0.5 rounded shrink-0">
                                Concluído
                              </span>
                            ) : isCurrent ? (
                              <span className="text-[9px] font-black uppercase tracking-widest bg-primary/20 text-primary px-2 py-0.5 rounded animate-pulse shrink-0">
                                Próximo
                              </span>
                            ) : (
                              <span className="text-[9px] font-black uppercase tracking-widest bg-surface-bright text-on-surface-variant/40 px-2 py-0.5 rounded shrink-0">
                                Por jogar
                              </span>
                            );

                            return (
                              <div
                                key={entry.calendarIndex}
                                className={cardClass}
                              >
                                {/* ── CLICKABLE HEADER: week + our match ── */}
                                <div
                                  className={`flex items-center gap-2 px-4 py-2.5 cursor-pointer select-none border-b ${
                                    isCurrent
                                      ? "border-primary/20 bg-primary/5"
                                      : "border-outline-variant/20"
                                  }`}
                                  onClick={() =>
                                    toggleEntry(entry.calendarIndex)
                                  }
                                >
                                  {/* Liga badge + week */}
                                  <span className="shrink-0 text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-primary/20 text-primary">
                                    Liga
                                  </span>
                                  <span className="font-black text-sm text-on-surface shrink-0">
                                    J{entry.matchweek}
                                  </span>
                                  {isCurrent && (
                                    <span className="shrink-0 relative flex h-2 w-2">
                                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                                      <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
                                    </span>
                                  )}

                                  {/* Our team's match – centered, grows to fill */}
                                  {myFixture ? (
                                    <div className="flex items-center gap-1.5 flex-1 min-w-0 justify-center">
                                      <span
                                        className={`shrink-0 text-[8px] font-black uppercase tracking-wider ${myImHome ? "text-emerald-400" : "text-on-surface-variant/50"}`}
                                      >
                                        {myImHome ? "casa" : "fora"}
                                      </span>
                                      <span
                                        className="shrink-0 w-2 h-2 rounded-full"
                                        style={{
                                          backgroundColor:
                                            myHomeInfo?.color_primary || "#666",
                                        }}
                                      />
                                      <span
                                        className={`text-[11px] font-bold truncate ${myFixture.homeTeamId === myTeamId ? "text-primary" : "text-on-surface"}`}
                                      >
                                        {myHomeInfo?.name ??
                                          myFixture.homeTeamId}
                                      </span>
                                      <span className="shrink-0 text-xs font-black font-headline text-on-surface-variant/70 mx-0.5">
                                        {myFixture.result
                                          ? `${myFixture.result.home_score}–${myFixture.result.away_score}`
                                          : "vs"}
                                      </span>
                                      <span
                                        className={`text-[11px] font-bold truncate ${myFixture.awayTeamId === myTeamId ? "text-primary" : "text-on-surface"}`}
                                      >
                                        {myAwayInfo?.name ??
                                          myFixture.awayTeamId}
                                      </span>
                                      <span
                                        className="shrink-0 w-2 h-2 rounded-full"
                                        style={{
                                          backgroundColor:
                                            myAwayInfo?.color_primary || "#666",
                                        }}
                                      />
                                    </div>
                                  ) : (
                                    <div className="flex-1" />
                                  )}

                                  {/* right side: badge + chevron */}
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    {leagueBadge}
                                    <span className="material-symbols-outlined text-base text-on-surface-variant/40">
                                      {isExpanded
                                        ? "expand_less"
                                        : "expand_more"}
                                    </span>
                                  </div>
                                </div>

                                {/* ── EXPANDED: all division fixtures ──── */}
                                {isExpanded && (
                                  <div className="divide-y divide-outline-variant/10">
                                    {divFixtures.map((f, fi) => {
                                      const homeInfo = teams.find(
                                        (t) => t.id === f.homeTeamId,
                                      );
                                      const awayInfo = teams.find(
                                        (t) => t.id === f.awayTeamId,
                                      );
                                      const isMyMatch =
                                        f.homeTeamId === myTeamId ||
                                        f.awayTeamId === myTeamId;
                                      return (
                                        <div
                                          key={fi}
                                          className={`flex items-center px-4 py-1.5 gap-2 ${
                                            isMyMatch ? "bg-primary/8" : ""
                                          }`}
                                        >
                                          {/* Home team */}
                                          <div className="flex items-center gap-1.5 flex-1 min-w-0 justify-end">
                                            {isMyMatch &&
                                              f.homeTeamId === myTeamId && (
                                                <span className="shrink-0 text-[8px] font-black text-emerald-400 uppercase tracking-wider">
                                                  casa
                                                </span>
                                              )}
                                            <button
                                              className={`text-[11px] font-bold truncate text-left ${isMyMatch && f.homeTeamId === myTeamId ? "text-primary" : "text-on-surface hover:underline"}`}
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                if (
                                                  f.homeTeamId !== myTeamId &&
                                                  homeInfo
                                                )
                                                  handleOpenTeamSquad(homeInfo);
                                              }}
                                            >
                                              {homeInfo?.name ?? f.homeTeamId}
                                            </button>
                                            <span
                                              className="shrink-0 w-2 h-2 rounded-full"
                                              style={{
                                                backgroundColor:
                                                  homeInfo?.color_primary ||
                                                  "#666",
                                              }}
                                            />
                                          </div>
                                          {/* Score or VS */}
                                          <div className="shrink-0 w-14 text-center">
                                            {f.result ? (
                                              <span className="text-xs font-black font-headline text-on-surface bg-surface border border-outline-variant/20 rounded px-2 py-0.5">
                                                {f.result.home_score}–
                                                {f.result.away_score}
                                              </span>
                                            ) : (
                                              <span className="text-[10px] font-black text-on-surface-variant/40">
                                                vs
                                              </span>
                                            )}
                                          </div>
                                          {/* Away team */}
                                          <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                            <span
                                              className="shrink-0 w-2 h-2 rounded-full"
                                              style={{
                                                backgroundColor:
                                                  awayInfo?.color_primary ||
                                                  "#666",
                                              }}
                                            />
                                            <button
                                              className={`text-[11px] font-bold truncate text-left ${isMyMatch && f.awayTeamId === myTeamId ? "text-primary" : "text-on-surface hover:underline"}`}
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                if (
                                                  f.awayTeamId !== myTeamId &&
                                                  awayInfo
                                                )
                                                  handleOpenTeamSquad(awayInfo);
                                              }}
                                            >
                                              {awayInfo?.name ?? f.awayTeamId}
                                            </button>
                                            {isMyMatch &&
                                              f.awayTeamId === myTeamId && (
                                                <span className="shrink-0 text-[8px] font-black text-on-surface-variant/50 uppercase tracking-wider">
                                                  fora
                                                </span>
                                              )}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })()}

              {activeTab === "club" && (
                <div className="space-y-5 relative">
                  {/* Ambient glow blobs */}
                  <div
                    className="pointer-events-none absolute -top-8 -left-8 w-72 h-72 rounded-full blur-[100px] opacity-10"
                    style={{ background: teamInfo?.color_primary || "#95d4b3" }}
                  />
                  <div
                    className="pointer-events-none absolute top-40 -right-12 w-48 h-48 rounded-full blur-[80px] opacity-5"
                    style={{
                      background: teamInfo?.color_secondary || "#e9c349",
                    }}
                  />

                  {/* ── HERO + BUDGET WIDGET ─────────── */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                    {/* Club hero card (2/3) */}
                    <div className="lg:col-span-2 bg-surface-container rounded-lg overflow-hidden relative">
                      <div
                        className="absolute inset-0"
                        style={{
                          background: teamInfo?.color_primary
                            ? `linear-gradient(to right, ${teamInfo.color_primary}28, transparent)`
                            : "linear-gradient(to right, #2d6a4f28, transparent)",
                        }}
                      />
                      <div className="relative p-6 flex flex-col sm:flex-row gap-5 items-start sm:items-center">
                        {/* Badge */}
                        <div
                          className="w-20 h-20 rounded-xl flex items-center justify-center text-4xl font-black shrink-0 shadow-lg"
                          style={{
                            background: teamInfo?.color_primary || "#201f1f",
                            color: teamInfo?.color_secondary || "#fff",
                          }}
                        >
                          {teamInfo?.name?.[0] || "?"}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h1
                            className="font-headline text-3xl font-black tracking-tighter leading-none mb-1 truncate"
                            style={{ color: teamInfo?.color_primary || "#fff" }}
                          >
                            {teamInfo?.name || "—"}
                          </h1>
                          <div className="flex flex-wrap items-center gap-3 mb-4">
                            <span className="text-on-surface-variant text-sm font-bold">
                              {DIVISION_NAMES[teamInfo?.division] ||
                                `Divisão ${teamInfo?.division}`}
                            </span>
                            <span className="w-1 h-1 bg-outline-variant rounded-full" />
                            <span className="text-on-surface-variant text-sm">
                              {seasonYear}
                            </span>
                          </div>
                          {/* Moral bar */}
                          <div className="max-w-xs">
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-[10px] uppercase tracking-widest text-on-surface-variant font-black">
                                Moral do Plantel
                              </span>
                              <span
                                className={`text-[10px] font-black ${
                                  (teamInfo?.morale || 75) >= 70
                                    ? "text-primary"
                                    : (teamInfo?.morale || 75) >= 40
                                      ? "text-tertiary"
                                      : "text-error"
                                }`}
                              >
                                {(teamInfo?.morale || 75) >= 70
                                  ? "ELEVADO"
                                  : (teamInfo?.morale || 75) >= 40
                                    ? "ESTÁVEL"
                                    : "BAIXO"}
                              </span>
                            </div>
                            <div className="w-full bg-surface-container-high h-2 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  (teamInfo?.morale || 75) >= 70
                                    ? "bg-linear-to-r from-primary/60 to-primary"
                                    : (teamInfo?.morale || 75) >= 40
                                      ? "bg-linear-to-r from-tertiary/60 to-tertiary"
                                      : "bg-linear-to-r from-error/60 to-error"
                                }`}
                                style={{ width: `${teamInfo?.morale || 75}%` }}
                              />
                            </div>
                            <p className="text-[10px] text-on-surface-variant/60 uppercase tracking-widest mt-1.5">
                              Índice de confiança do plantel
                            </p>
                          </div>
                        </div>
                        {/* Manager */}
                        <div className="shrink-0 text-right hidden sm:block">
                          <p className="text-[10px] uppercase tracking-widest text-on-surface-variant font-bold mb-1">
                            Manager
                          </p>
                          <p className="font-headline font-black text-on-surface text-lg tracking-tight">
                            {me?.name}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Budget widget (1/3) */}
                    <div
                      className="bg-surface-container-high rounded-lg p-5 flex flex-col justify-between border-t-2"
                      style={{
                        borderColor: teamInfo?.color_primary || "#95d4b3",
                      }}
                    >
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <p className="text-[10px] uppercase tracking-widest text-on-surface-variant font-black mb-1.5">
                            Saldo Disponível
                          </p>
                          <p
                            className={`font-headline text-2xl font-black ${
                              currentBudget >= 0
                                ? "text-on-surface"
                                : "text-error"
                            }`}
                          >
                            {formatCurrency(currentBudget)}
                          </p>
                        </div>
                        <span
                          className="material-symbols-outlined text-3xl"
                          style={{
                            color: teamInfo?.color_primary || "#95d4b3",
                          }}
                        >
                          payments
                        </span>
                      </div>
                      <div className="space-y-3">
                        <div className="flex justify-between text-xs">
                          <span className="text-on-surface-variant">
                            Salários / jornada
                          </span>
                          <span className="font-mono font-bold text-on-surface">
                            {formatCurrency(totalWeeklyWage)}
                          </span>
                        </div>
                        <div className="w-full bg-surface-container-lowest h-1 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.min(100, (totalWeeklyWage / 500000) * 100)}%`,
                              background: teamInfo?.color_primary || "#95d4b3",
                            }}
                          />
                        </div>
                        <div className="flex justify-between text-[10px] pt-1">
                          <span
                            className={`font-black ${
                              currentBudget >= 0 ? "text-primary" : "text-error"
                            }`}
                          >
                            {currentBudget >= 0 ? "ESTÁVEL" : "DÉFICE"}
                          </span>
                          {loanAmount > 0 && (
                            <span className="text-error/70">
                              Dívida: {formatCurrency(loanAmount)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* ── ESTÁDIO + PALMARÉS ────────────── */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {/* Estádio */}
                    <div className="bg-surface-container rounded-lg overflow-hidden flex flex-col">
                      <div
                        className="h-24 relative flex items-end"
                        style={{
                          background: teamInfo?.color_primary
                            ? `linear-gradient(135deg, ${teamInfo.color_primary}40 0%, #201f1f 100%)`
                            : "linear-gradient(135deg, #2d6a4f40 0%, #201f1f 100%)",
                        }}
                      >
                        <div
                          className="absolute inset-0 opacity-5"
                          style={{
                            backgroundImage:
                              "radial-gradient(circle, rgba(255,255,255,0.2) 1px, transparent 1px)",
                            backgroundSize: "16px 16px",
                          }}
                        />
                        <div className="relative px-5 pb-4">
                          <h3 className="font-headline text-lg font-black text-on-surface leading-tight">
                            {teamInfo?.stadium_name || "Estádio Municipal"}
                          </h3>
                          <p
                            className="text-xs font-bold"
                            style={{
                              color: teamInfo?.color_primary || "#95d4b3",
                            }}
                          >
                            Recinto Principal
                          </p>
                        </div>
                      </div>
                      <div className="p-5 grid grid-cols-2 gap-3">
                        <div className="bg-surface-container-low p-3 rounded-lg text-center">
                          <p className="text-[10px] uppercase tracking-tight text-on-surface-variant font-bold mb-1">
                            Capacidade
                          </p>
                          <p className="font-headline font-black text-on-surface text-lg">
                            {(
                              teamInfo?.stadium_capacity || 10000
                            ).toLocaleString("pt-PT")}
                          </p>
                        </div>
                        <div className="bg-surface-container-low p-3 rounded-lg text-center">
                          <p className="text-[10px] uppercase tracking-tight text-on-surface-variant font-bold mb-1">
                            Divisão
                          </p>
                          <p className="font-headline font-black text-primary text-sm leading-tight mt-0.5">
                            {DIVISION_NAMES[teamInfo?.division] || "Liga"}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Palmarés */}
                    <div className="bg-surface-container rounded-lg p-5 flex flex-col">
                      <div className="flex justify-between items-center mb-5">
                        <h3 className="font-headline text-sm font-black uppercase tracking-widest text-on-surface">
                          Palmarés
                        </h3>
                        <span
                          className="material-symbols-outlined text-tertiary"
                          style={{ fontVariationSettings: "'FILL' 1" }}
                        >
                          military_tech
                        </span>
                      </div>
                      {palmaresTeamId === me?.teamId &&
                      palmares.trophies?.length > 0 ? (
                        <div className="flex flex-wrap gap-3">
                          {palmares.trophies.map((trophy, idx) => (
                            <div
                              key={idx}
                              className="flex items-center gap-3 px-4 py-3 rounded-lg bg-tertiary/8 border border-tertiary/20"
                            >
                              <span
                                className="material-symbols-outlined text-tertiary text-xl"
                                style={{ fontVariationSettings: "'FILL' 1" }}
                              >
                                emoji_events
                              </span>
                              <div>
                                <p className="text-tertiary font-black text-sm">
                                  {trophy.achievement}
                                </p>
                                <p className="text-on-surface-variant text-xs font-bold">
                                  {trophy.season}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="flex-1 flex flex-col items-center justify-center border border-dashed border-outline-variant/20 rounded-lg bg-surface-container-low/50 p-8">
                          <span
                            className="material-symbols-outlined text-on-surface-variant/30 text-5xl mb-3"
                            style={{ fontVariationSettings: "'FILL' 0" }}
                          >
                            trophy
                          </span>
                          <p className="text-sm text-on-surface-variant font-bold text-center">
                            Nenhum título conquistado.
                          </p>
                          <p className="text-[10px] text-on-surface-variant/40 uppercase tracking-widest mt-1 text-center">
                            Constrói o teu legado hoje
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* ── JORNAL DO CLUBE ──────────────── */}
                  <div className="bg-surface-container rounded-lg overflow-hidden">
                    <div className="bg-surface-container-high px-5 py-4 flex justify-between items-center">
                      <h3 className="font-headline text-sm font-black uppercase tracking-widest text-on-surface">
                        Jornal do Clube
                      </h3>
                      {clubNews?.some(
                        (n) =>
                          n.type === "transfer_in" || n.type === "transfer_out",
                      ) && (
                        <span className="text-[10px] text-tertiary font-black tracking-[0.2em] uppercase">
                          Foco em Transferências
                        </span>
                      )}
                    </div>
                    {clubNews && clubNews.length > 0 ? (
                      <>
                        <div className="divide-y divide-surface-container-low">
                          {clubNews.slice(0, 8).map((news, idx) => (
                            <div
                              key={news.id || idx}
                              className="px-5 py-3.5 flex items-center gap-4 hover:bg-surface-bright/30 transition-colors"
                            >
                              {/* Icon container */}
                              <div
                                className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                                  news.type === "transfer_in"
                                    ? "bg-primary/15"
                                    : news.type === "transfer_out"
                                      ? "bg-error/15"
                                      : "bg-surface-container-high"
                                }`}
                              >
                                <span
                                  className={`material-symbols-outlined text-sm ${
                                    news.type === "transfer_in"
                                      ? "text-primary"
                                      : news.type === "transfer_out"
                                        ? "text-error"
                                        : "text-on-surface-variant"
                                  }`}
                                >
                                  {news.type === "transfer_in"
                                    ? "trending_up"
                                    : news.type === "transfer_out"
                                      ? "trending_down"
                                      : "info"}
                                </span>
                              </div>
                              {/* Content */}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-on-surface truncate">
                                  {news.title}
                                </p>
                                <p className="text-xs text-on-surface-variant truncate">
                                  {news.related_team_name &&
                                  (news.type === "transfer_in" ||
                                    news.type === "transfer_out")
                                    ? `${
                                        news.type === "transfer_in"
                                          ? "de"
                                          : "para"
                                      } ${news.related_team_name}`
                                    : `Jornada ${news.matchweek || "?"}${
                                        news.year ? ` · ${news.year}` : ""
                                      }`}
                                </p>
                              </div>
                              {/* Amount */}
                              {news.amount > 0 && (
                                <div className="text-right shrink-0">
                                  <p
                                    className={`font-headline font-black text-sm ${
                                      news.type === "transfer_out"
                                        ? "text-primary"
                                        : "text-error"
                                    }`}
                                  >
                                    {news.type === "transfer_out" ? "+" : "-"}
                                    {formatCurrency(news.amount)}
                                  </p>
                                  <p className="text-[10px] text-on-surface-variant uppercase tracking-wider">
                                    {news.type === "transfer_out"
                                      ? "Venda"
                                      : news.type === "transfer_in"
                                        ? "Compra"
                                        : ""}
                                  </p>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                        {clubNews.length > 8 && (
                          <div className="p-4 text-center bg-surface-container-low/50 border-t border-outline-variant/10">
                            <p className="text-[10px] font-black tracking-widest text-on-surface-variant uppercase">
                              + {clubNews.length - 8} entradas no arquivo
                            </p>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="p-8 text-center">
                        <span className="material-symbols-outlined text-on-surface-variant/30 text-4xl block mb-3">
                          newspaper
                        </span>
                        <p className="text-on-surface-variant font-bold text-sm">
                          Nenhuma notícia ainda.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === "finances" &&
                (() => {
                  const totalSeasonIncome =
                    (financeData?.totalTicketRevenue || 0) +
                    (financeData?.sponsorRevenue || 0) +
                    (financeData?.totalTransferIncome || 0);
                  const totalSeasonExpenses =
                    totalWeeklyWage * completedJornada +
                    loanInterestPerWeek * completedJornada +
                    (financeData?.totalTransferExpenses || 0) +
                    (financeData?.totalStadiumExpenses || 0);
                  const seasonResult = totalSeasonIncome - totalSeasonExpenses;
                  const loanPct = Math.min(100, (loanAmount / 2500000) * 100);
                  const wageSharePct =
                    totalSeasonIncome > 0
                      ? Math.min(
                          100,
                          Math.round(
                            ((totalWeeklyWage * completedJornada) /
                              totalSeasonIncome) *
                              100,
                          ),
                        )
                      : 0;
                  return (
                    <div className="space-y-4">
                      {/* ── HERO ──────────────────────────────────────────────────────── */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-0.5 bg-outline-variant/10 overflow-hidden rounded-xl">
                        {/* Saldo Actual */}
                        <div className="bg-surface-container p-6 flex flex-col justify-between relative overflow-hidden">
                          <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none select-none">
                            <span className="material-symbols-outlined text-8xl">
                              payments
                            </span>
                          </div>
                          <div>
                            <p className="text-[10px] uppercase tracking-widest text-on-surface-variant mb-1 font-label">
                              Saldo Actual
                            </p>
                            <h2
                              className={`font-headline text-4xl font-bold tracking-tighter ${currentBudget >= 0 ? "text-primary" : "text-error"}`}
                            >
                              {formatCurrency(currentBudget)}
                            </h2>
                          </div>
                          <div className="mt-6 flex items-end gap-2">
                            <div className="flex gap-1 h-8 items-end">
                              <div className="w-1 bg-primary/20 h-2 rounded-t-sm" />
                              <div className="w-1 bg-primary/40 h-4 rounded-t-sm" />
                              <div className="w-1 bg-primary/60 h-3 rounded-t-sm" />
                              <div className="w-1 bg-primary/80 h-6 rounded-t-sm" />
                              <div className="w-1 bg-primary h-8 rounded-t-sm" />
                            </div>
                            <span className="text-[10px] text-primary font-bold font-label">
                              época {seasonYear}/{seasonYear + 1}
                            </span>
                          </div>
                        </div>
                        {/* Resultado da Época */}
                        <div className="bg-surface-container p-6 flex flex-col justify-between">
                          <div>
                            <p className="text-[10px] uppercase tracking-widest text-on-surface-variant mb-1 font-label">
                              Resultado da Época
                            </p>
                            <h2
                              className={`font-headline text-4xl font-bold tracking-tighter ${seasonResult >= 0 ? "text-tertiary" : "text-error"}`}
                            >
                              {seasonResult >= 0 ? "+" : ""}
                              {formatCurrency(seasonResult)}
                            </h2>
                          </div>
                          <div className="mt-6 flex items-center gap-2">
                            <span
                              className={`material-symbols-outlined text-sm ${seasonResult >= 0 ? "text-tertiary" : "text-error"}`}
                            >
                              {seasonResult >= 0
                                ? "trending_up"
                                : "trending_down"}
                            </span>
                            <span className="text-[10px] text-on-surface-variant font-medium font-label uppercase">
                              {completedJornada} / 14 jornadas concluídas
                            </span>
                          </div>
                        </div>
                        {/* Estádio */}
                        <div className="bg-surface-container p-6 flex flex-col justify-between relative overflow-hidden">
                          <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none select-none">
                            <span className="material-symbols-outlined text-8xl">
                              stadium
                            </span>
                          </div>
                          <div>
                            <p className="text-[10px] uppercase tracking-widest text-on-surface-variant mb-1 font-label">
                              Estádio
                            </p>
                            <h2 className="font-headline text-3xl font-bold tracking-tighter text-on-surface">
                              {(
                                teamInfo?.stadium_capacity || 10000
                              ).toLocaleString("pt-PT")}{" "}
                              lug.
                            </h2>
                          </div>
                          <div className="mt-6">
                            <p className="text-[10px] text-on-surface-variant uppercase mb-1">
                              Receita máx./jogo em casa
                            </p>
                            <p className="font-headline text-lg font-bold text-primary">
                              {formatCurrency(capacityRevPerGame)}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* ── RECEITAS / DESPESAS / CONTROLO ────────────────────────────── */}
                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                        {/* Receitas */}
                        <div className="bg-surface-container-low rounded-lg p-5 flex flex-col space-y-3">
                          <div className="flex justify-between items-center pb-2 border-b border-outline-variant/15">
                            <h3 className="font-headline text-base uppercase tracking-tight flex items-center gap-2">
                              <span className="material-symbols-outlined text-primary text-base">
                                arrow_downward
                              </span>
                              Receitas
                            </h3>
                            <span className="font-headline text-primary font-bold text-sm">
                              {formatCurrency(totalSeasonIncome)}
                            </span>
                          </div>
                          <ul className="space-y-3">
                            <li className="flex justify-between items-center">
                              <div>
                                <p className="text-sm text-on-surface-variant">
                                  Bilheteiras
                                </p>
                                <p className="text-[10px] opacity-40 uppercase">
                                  {financeData?.homeMatchesPlayed || 0} jogos em
                                  casa
                                </p>
                              </div>
                              <span className="font-headline text-sm font-bold">
                                {formatCurrency(
                                  financeData?.totalTicketRevenue || 0,
                                )}
                              </span>
                            </li>
                            <li className="flex justify-between items-center">
                              <div>
                                <p className="text-sm text-on-surface-variant">
                                  Patrocinadores
                                </p>
                                <p className="text-[10px] opacity-40 uppercase">
                                  Receita anual por divisão
                                </p>
                              </div>
                              <span className="font-headline text-sm font-bold">
                                {formatCurrency(
                                  financeData?.sponsorRevenue || 0,
                                )}
                              </span>
                            </li>
                            {(financeData?.totalTransferIncome || 0) > 0 && (
                              <li className="flex justify-between items-center">
                                <div>
                                  <p className="text-sm text-on-surface-variant">
                                    Vendas de Jogadores
                                  </p>
                                  <p className="text-[10px] opacity-40 uppercase">
                                    Receitas de transferências
                                  </p>
                                </div>
                                <span className="font-headline text-sm font-bold">
                                  {formatCurrency(
                                    financeData.totalTransferIncome,
                                  )}
                                </span>
                              </li>
                            )}
                          </ul>
                        </div>

                        {/* Despesas */}
                        <div className="bg-surface-container-low rounded-lg p-5 flex flex-col space-y-3">
                          <div className="flex justify-between items-center pb-2 border-b border-outline-variant/15">
                            <h3 className="font-headline text-base uppercase tracking-tight flex items-center gap-2">
                              <span className="material-symbols-outlined text-error text-base">
                                arrow_upward
                              </span>
                              Despesas
                            </h3>
                            <span className="font-headline text-error font-bold text-sm">
                              {formatCurrency(totalSeasonExpenses)}
                            </span>
                          </div>
                          <ul className="space-y-3">
                            <li className="flex justify-between items-center">
                              <div>
                                <p className="text-sm text-on-surface-variant">
                                  Folha Salarial
                                </p>
                                <p className="text-[10px] opacity-40 uppercase">
                                  {mySquad.length} atletas · pago por jornada
                                </p>
                              </div>
                              <span className="font-headline text-sm font-bold">
                                {formatCurrency(
                                  totalWeeklyWage * completedJornada,
                                )}
                              </span>
                            </li>
                            {loanAmount > 0 && (
                              <li className="flex justify-between items-center">
                                <div>
                                  <p className="text-sm text-on-surface-variant">
                                    Juros Bancários
                                  </p>
                                  <p className="text-[10px] opacity-40 uppercase">
                                    2,5% da dívida / jornada
                                  </p>
                                </div>
                                <span className="font-headline text-sm font-bold">
                                  {formatCurrency(
                                    loanInterestPerWeek * completedJornada,
                                  )}
                                </span>
                              </li>
                            )}
                            {(financeData?.totalTransferExpenses || 0) > 0 && (
                              <li className="flex justify-between items-center">
                                <div>
                                  <p className="text-sm text-on-surface-variant">
                                    Compras de Jogadores
                                  </p>
                                  <p className="text-[10px] opacity-40 uppercase">
                                    Despesas com transferências
                                  </p>
                                </div>
                                <span className="font-headline text-sm font-bold">
                                  {formatCurrency(
                                    financeData.totalTransferExpenses,
                                  )}
                                </span>
                              </li>
                            )}
                            {(financeData?.totalStadiumExpenses || 0) > 0 && (
                              <li className="flex justify-between items-center">
                                <div>
                                  <p className="text-sm text-on-surface-variant">
                                    Obras no Estádio
                                  </p>
                                  <p className="text-[10px] opacity-40 uppercase">
                                    300.000€ ×{" "}
                                    {Math.round(
                                      (financeData.totalStadiumExpenses || 0) /
                                        300000,
                                    )}{" "}
                                    obra(s)
                                  </p>
                                </div>
                                <span className="font-headline text-sm font-bold">
                                  {formatCurrency(
                                    financeData.totalStadiumExpenses,
                                  )}
                                </span>
                              </li>
                            )}
                          </ul>
                        </div>

                        {/* Centro de Controlo */}
                        <div className="space-y-4">
                          {/* Folha Salarial */}
                          <div
                            className={`bg-surface-container rounded-lg p-5 border-l-4 ${wageSharePct > 75 ? "border-error" : wageSharePct > 50 ? "border-tertiary" : "border-primary"} relative overflow-hidden`}
                          >
                            <div className="flex justify-between items-start mb-3">
                              <div>
                                <h3 className="font-headline text-xs uppercase tracking-widest text-on-surface-variant">
                                  Folha Salarial
                                </h3>
                                <p className="font-headline text-xl font-bold mt-1">
                                  {formatCurrency(totalWeeklyWage)}{" "}
                                  <span className="text-xs font-normal opacity-50">
                                    / jornada
                                  </span>
                                </p>
                              </div>
                              {wageSharePct > 75 && (
                                <span
                                  className="material-symbols-outlined text-error"
                                  style={{ fontVariationSettings: "'FILL' 1" }}
                                >
                                  warning
                                </span>
                              )}
                            </div>
                            <div className="space-y-1.5">
                              <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider">
                                <span>% das receitas</span>
                                <span
                                  className={
                                    wageSharePct > 75
                                      ? "text-error"
                                      : wageSharePct > 50
                                        ? "text-tertiary"
                                        : "text-primary"
                                  }
                                >
                                  {wageSharePct}%
                                </span>
                              </div>
                              <div className="h-2 w-full bg-surface-bright rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all ${wageSharePct > 75 ? "bg-error" : wageSharePct > 50 ? "bg-tertiary" : "bg-primary"}`}
                                  style={{ width: `${wageSharePct}%` }}
                                />
                              </div>
                              <div className="flex justify-between text-[10px] opacity-50 uppercase">
                                <span>
                                  {formatCurrency(totalWeeklyWage)}/jornada
                                </span>
                                <span>{mySquad.length} atletas</span>
                              </div>
                            </div>
                          </div>

                          {/* Dívida Bancária */}
                          <div className="bg-surface-container rounded-lg p-5 border-t border-outline-variant/10">
                            <h3 className="font-headline text-xs uppercase tracking-widest text-on-surface-variant mb-3">
                              Empréstimos
                            </h3>
                            <div className="mb-4">
                              <p className="text-[10px] opacity-50 uppercase mb-0.5">
                                Dívida Actual
                              </p>
                              <p
                                className={`font-headline text-2xl font-bold tracking-tight ${loanAmount > 0 ? "text-error" : "text-primary"}`}
                              >
                                {formatCurrency(loanAmount)}
                              </p>
                              {loanAmount > 0 && (
                                <p className="text-[10px] text-error font-medium mt-0.5">
                                  JUROS: 2,5% / JORNADA
                                </p>
                              )}
                              <div className="mt-2 h-1.5 w-full bg-surface-bright rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all ${loanPct > 75 ? "bg-error" : loanPct > 40 ? "bg-tertiary" : "bg-amber-400"}`}
                                  style={{ width: `${loanPct}%` }}
                                />
                              </div>
                              <p className="text-[10px] opacity-40 text-right mt-0.5">
                                {loanPct.toFixed(0)}% de 2.500.000€
                              </p>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <button
                                onClick={() => socket.emit("payLoan")}
                                disabled={
                                  loanAmount < 500000 || currentBudget < 500000
                                }
                                className="bg-surface-container-high py-2 text-xs font-headline font-bold uppercase tracking-wider rounded hover:bg-surface-bright disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                              >
                                Pagar -500K
                              </button>
                              <button
                                onClick={() => socket.emit("takeLoan")}
                                disabled={loanAmount >= 2500000}
                                className="bg-surface-bright py-2 text-xs font-headline font-bold uppercase tracking-wider rounded hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition-all border border-outline-variant/30"
                              >
                                Pedir +500K
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* ── ESTÁDIO ───────────────────────────────────────────────────── */}
                      <div className="bg-surface-container-low rounded-lg overflow-hidden">
                        <div className="px-6 py-4 border-b border-outline-variant/10 flex justify-between items-center">
                          <h3 className="font-headline text-xs uppercase tracking-widest flex items-center gap-2">
                            <span className="material-symbols-outlined text-tertiary text-base">
                              stadium
                            </span>
                            Expansão do Estádio
                          </h3>
                        </div>
                        <div className="p-6">
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
                            <div className="bg-surface rounded-md border border-outline-variant/15 p-4 flex flex-col gap-1">
                              <span className="text-on-surface-variant text-[10px] font-black uppercase tracking-wider">
                                Capacidade Actual
                              </span>
                              <span className="text-on-surface font-headline font-bold text-2xl">
                                {(
                                  teamInfo?.stadium_capacity || 10000
                                ).toLocaleString("pt-PT")}
                              </span>
                              <span className="text-on-surface-variant text-[10px]">
                                lugares
                              </span>
                            </div>
                            <div className="bg-surface rounded-md border border-outline-variant/15 p-4 flex flex-col gap-1">
                              <span className="text-on-surface-variant text-[10px] font-black uppercase tracking-wider">
                                Receita máx./jogo
                              </span>
                              <span className="text-primary font-headline font-bold text-xl">
                                {formatCurrency(capacityRevPerGame)}
                              </span>
                              <span className="text-on-surface-variant text-[10px]">
                                15€ × lotação
                              </span>
                            </div>
                            <div className="bg-surface rounded-md border border-outline-variant/15 p-4 flex flex-col gap-1 col-span-2 md:col-span-1">
                              <span className="text-on-surface-variant text-[10px] font-black uppercase tracking-wider">
                                Custo de Expansão
                              </span>
                              <span className="text-tertiary font-headline font-bold text-xl">
                                300.000€
                              </span>
                              <span className="text-on-surface-variant text-[10px]">
                                +5.000 lugares por obra
                              </span>
                            </div>
                          </div>
                          <button
                            onClick={() => socket.emit("buildStadium")}
                            disabled={currentBudget < 300000}
                            className="w-full bg-primary hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed text-on-primary font-headline font-bold py-3 rounded text-sm transition-all uppercase tracking-wide"
                          >
                            Expandir Estádio — 300.000€
                          </button>
                          {currentBudget < 300000 && (
                            <p className="text-on-surface-variant text-[10px] text-center mt-2 uppercase tracking-wider opacity-60">
                              Saldo insuficiente · faltam{" "}
                              {formatCurrency(300000 - currentBudget)}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })()}

              {activeTab === "players" &&
                (() => {
                  const currentSeason = Math.ceil((matchweekCount + 1) / 14);
                  const expiringPlayers = mySquad.filter(
                    (p) =>
                      p.contract_until_matchweek > 0 &&
                      p.contract_until_matchweek <= matchweekCount + 3,
                  );
                  const POSITION_BORDER = {
                    GR: "border-yellow-500",
                    DEF: "border-blue-500",
                    MED: "border-emerald-500",
                    ATA: "border-rose-500",
                  };
                  const POSITION_BAR_COLOR = {
                    GR: "bg-yellow-500",
                    DEF: "bg-blue-500",
                    MED: "bg-emerald-500",
                    ATA: "bg-rose-500",
                  };
                  const filteredSquad = annotatedSquad.filter(
                    (p) =>
                      playersPositionFilter === "all" ||
                      p.position === playersPositionFilter,
                  );
                  const wageByPos = ["GR", "DEF", "MED", "ATA"].map((pos) => ({
                    pos,
                    total: mySquad
                      .filter((p) => p.position === pos)
                      .reduce((s, p) => s + (p.wage || 0), 0),
                    count: mySquad.filter((p) => p.position === pos).length,
                  }));
                  const maxPosWage = Math.max(
                    ...wageByPos.map((w) => w.total),
                    1,
                  );
                  return (
                    <div className="space-y-5">
                      {/* ── SUMMARY WIDGETS ──────────────────────────────── */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* Massa Salarial */}
                        <div className="bg-surface-container-low p-5 rounded-md flex flex-col justify-between h-28 border-l-4 border-primary">
                          <span className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                            Massa Salarial / Semana
                          </span>
                          <div className="flex items-baseline gap-2">
                            <span className="text-3xl font-headline font-black tracking-tighter text-on-surface">
                              {formatCurrency(totalWeeklyWage)}
                            </span>
                            <span className="text-[10px] text-on-surface-variant">
                              {mySquad.length} jogadores
                            </span>
                          </div>
                        </div>
                        {/* Saldo Disponível */}
                        <div className="bg-surface-container-low p-5 rounded-md flex flex-col justify-between h-28 border-l-4 border-tertiary">
                          <span className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                            Saldo Disponível
                          </span>
                          <div className="flex items-baseline gap-2">
                            <span
                              className={`text-3xl font-headline font-black tracking-tighter ${currentBudget >= 0 ? "text-tertiary" : "text-error"}`}
                            >
                              {formatCurrency(currentBudget)}
                            </span>
                            {loanAmount > 0 && (
                              <span className="text-[10px] text-error font-black">
                                Dívida: {formatCurrency(loanAmount)}
                              </span>
                            )}
                          </div>
                        </div>
                        {/* Contratos a Expirar */}
                        <div
                          className={`bg-surface-container-low p-5 rounded-md flex flex-col justify-between h-28 border-l-4 ${expiringPlayers.length > 0 ? "border-error" : "border-outline-variant"}`}
                        >
                          <span className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                            Contratos a Expirar
                          </span>
                          <div className="flex items-baseline gap-2">
                            <span className="text-3xl font-headline font-black tracking-tighter text-on-surface">
                              {String(expiringPlayers.length).padStart(2, "0")}
                            </span>
                            {expiringPlayers.length > 0 ? (
                              <span className="text-xs text-error font-black">
                                Ação necessária
                              </span>
                            ) : (
                              <span className="text-xs text-primary font-black">
                                Tudo OK
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* ── SQUAD CONTRACT TABLE ──────────────────────────── */}
                      <div className="bg-surface-container rounded-md overflow-hidden">
                        {/* Table header */}
                        <div className="px-5 py-4 flex flex-wrap gap-3 justify-between items-center bg-surface-container-high/50">
                          <h2 className="text-base font-headline font-black tracking-tight text-tertiary uppercase">
                            Plantel — Gestão Contratual
                          </h2>
                          <div className="flex gap-2 items-center flex-wrap">
                            <select
                              className="bg-surface-container-lowest border border-outline-variant/20 px-3 py-1.5 rounded-sm text-[10px] font-black uppercase text-on-surface focus:outline-none"
                              value={playersPositionFilter}
                              onChange={(e) =>
                                setPlayersPositionFilter(e.target.value)
                              }
                            >
                              <option value="all">Todas as posições</option>
                              <option value="GR">Guarda-Redes</option>
                              <option value="DEF">Defesa</option>
                              <option value="MED">Médio</option>
                              <option value="ATA">Avançado</option>
                            </select>
                            {expiringPlayers.length > 0 && (
                              <button
                                onClick={() =>
                                  expiringPlayers.forEach((p) =>
                                    renewPlayerContract(p),
                                  )
                                }
                                className="px-3 py-1.5 bg-tertiary text-on-tertiary-container text-[10px] font-black uppercase tracking-widest rounded-sm hover:brightness-110 transition-all"
                              >
                                Renovar todos a expirar
                              </button>
                            )}
                          </div>
                        </div>
                        {/* Table */}
                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-separate border-spacing-y-0.75 px-3 pb-3">
                            <thead>
                              <tr className="text-[10px] uppercase tracking-widest text-on-surface-variant font-black">
                                <th className="py-3 px-3">Jogador</th>
                                <th className="py-3 px-3">Pos</th>
                                <th className="py-3 px-3 text-center">Qual</th>
                                <th className="py-3 px-3">Ordenado/sem</th>
                                <th className="py-3 px-3">Contrato até</th>
                                <th className="py-3 px-3">Estado</th>
                                <th className="py-3 px-3 text-right">Ações</th>
                              </tr>
                            </thead>
                            <tbody>
                              {filteredSquad.map((player) => {
                                const isExpiringSoon =
                                  player.contract_until_matchweek > 0 &&
                                  player.contract_until_matchweek <=
                                    matchweekCount + 3;
                                const wantsRaise =
                                  !!player.contract_request_pending;
                                const canManage =
                                  player.signed_season !== currentSeason;
                                const isStar =
                                  !!player.is_star &&
                                  (player.position === "MED" ||
                                    player.position === "ATA");

                                let statusColor = "text-primary";
                                let dotClass = "bg-primary";
                                let statusLabel = "Estável";
                                if (isExpiringSoon) {
                                  statusColor = "text-error";
                                  dotClass = "bg-error animate-pulse";
                                  statusLabel = "A Expirar";
                                } else if (wantsRaise) {
                                  statusColor = "text-tertiary";
                                  dotClass = "bg-tertiary";
                                  statusLabel = "Quer Aumento";
                                }

                                let playerLabel = "Jogador do plantel";
                                if (isStar) playerLabel = "Craque";
                                else if (player.skill >= 80)
                                  playerLabel = "Titular indiscutível";
                                else if (player.skill >= 65)
                                  playerLabel = "Rotação";

                                const positionBorderClass =
                                  POSITION_BORDER[player.position] ||
                                  "border-primary";
                                const contractMw =
                                  player.contract_until_matchweek;
                                let contractLabel = "—";
                                if (contractMw > 0) {
                                  const cSeason =
                                    2026 + Math.floor((contractMw - 1) / 14);
                                  const cJornada = ((contractMw - 1) % 14) + 1;
                                  contractLabel = `J${cJornada} — ${cSeason}/${cSeason + 1}`;
                                }

                                return (
                                  <tr
                                    key={player.id}
                                    className={`bg-surface-container-low hover:bg-primary-container/20 transition-all ${player.isUnavailable ? "opacity-60" : ""}`}
                                  >
                                    {/* Jogador */}
                                    <td className="py-2.5 px-3">
                                      <div
                                        className={`font-headline font-bold text-sm tracking-tight uppercase ${isExpiringSoon ? "text-error" : isStar ? "text-tertiary" : "text-on-surface"}`}
                                      >
                                        <PlayerLink playerId={player.id}>
                                          {player.name}
                                        </PlayerLink>
                                        {player.isUnavailable &&
                                          (() => {
                                            const isSusp =
                                              (player.suspension_until_matchweek ||
                                                0) > matchweekCount;
                                            const gamesLeft = isSusp
                                              ? (player.suspension_until_matchweek ||
                                                  0) - matchweekCount
                                              : (player.injury_until_matchweek ||
                                                  0) - matchweekCount;
                                            return (
                                              <span className="ml-2 text-[10px] font-black text-red-400 inline-flex items-center gap-0.5">
                                                {isSusp ? "🟥" : "🩹"}
                                                <span className="tabular-nums">
                                                  {gamesLeft}
                                                </span>
                                              </span>
                                            );
                                          })()}
                                        {player.transfer_status &&
                                          player.transfer_status !== "none" && (
                                            <span className="ml-2 text-[10px] font-black px-1.5 py-0.5 rounded-sm bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 normal-case tracking-normal">
                                              À venda
                                            </span>
                                          )}
                                      </div>
                                      <div className="text-[10px] text-on-surface-variant uppercase tracking-wide mt-0.5">
                                        <span
                                          title={
                                            FLAG_TO_COUNTRY[
                                              player.nationality
                                            ] || player.nationality
                                          }
                                        >
                                          {player.nationality}
                                        </span>
                                        {" · "}
                                        {playerLabel}
                                      </div>
                                    </td>
                                    {/* Posição */}
                                    <td className="py-2.5 px-3">
                                      <span
                                        className={`px-2 py-0.5 bg-surface-bright rounded-sm text-[10px] font-black border-l-2 ${positionBorderClass} ${POSITION_TEXT_CLASS[player.position] || ""}`}
                                      >
                                        {POSITION_SHORT_LABELS[
                                          player.position
                                        ] || player.position}
                                      </span>
                                    </td>
                                    {/* Qualidade */}
                                    <td className="py-2.5 px-3 text-center">
                                      <span className="inline-flex items-center justify-center bg-surface text-on-surface px-2 py-0.5 rounded-sm text-sm border border-outline-variant/30 font-headline font-black tabular-nums">
                                        {player.skill}
                                      </span>
                                      {player.prev_skill != null &&
                                        player.prev_skill !== player.skill && (
                                          <span
                                            className={`ml-1 text-[10px] font-black ${player.skill > player.prev_skill ? "text-emerald-400" : "text-red-400"}`}
                                          >
                                            {player.skill > player.prev_skill
                                              ? "▲"
                                              : "▼"}
                                          </span>
                                        )}
                                    </td>
                                    {/* Ordenado */}
                                    <td className="py-2.5 px-3 font-mono text-sm text-on-surface">
                                      {formatCurrency(player.wage || 0)}
                                      <span className="text-[10px] text-on-surface-variant/40 ml-1">
                                        /sem
                                      </span>
                                      {wantsRaise &&
                                        player.contract_requested_wage > 0 && (
                                          <div className="text-[10px] text-tertiary font-black mt-0.5">
                                            Pede{" "}
                                            {formatCurrency(
                                              player.contract_requested_wage,
                                            )}
                                          </div>
                                        )}
                                    </td>
                                    {/* Contrato até */}
                                    <td
                                      className={`py-2.5 px-3 text-sm font-bold ${isExpiringSoon ? "text-error italic" : "text-on-surface"}`}
                                    >
                                      {contractLabel}
                                    </td>
                                    {/* Estado */}
                                    <td className="py-2.5 px-3">
                                      <div
                                        className={`flex items-center gap-1.5 ${statusColor}`}
                                      >
                                        <span
                                          className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotClass}`}
                                        />
                                        <span className="text-[10px] uppercase font-black">
                                          {statusLabel}
                                        </span>
                                      </div>
                                    </td>
                                    {/* Ações */}
                                    <td className="py-2.5 px-3 text-right">
                                      {canManage ? (
                                        <div className="flex justify-end gap-1.5 flex-wrap">
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              renewPlayerContract(player);
                                            }}
                                            className="px-3 py-1.5 bg-primary text-on-primary hover:brightness-110 text-[10px] uppercase font-black rounded-sm transition-all"
                                          >
                                            Renovar
                                          </button>
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              listPlayerAuction(player);
                                            }}
                                            disabled={
                                              isPlayingMatch ||
                                              showHalftimePanel
                                            }
                                            title={
                                              isPlayingMatch ||
                                              showHalftimePanel
                                                ? "Disponível após as partidas"
                                                : "Vender em Leilão"
                                            }
                                            className="px-3 py-1.5 bg-secondary-container hover:bg-surface-bright disabled:opacity-30 text-on-surface text-[10px] uppercase font-black rounded-sm transition-all"
                                          >
                                            Leilão
                                          </button>
                                          {player.transfer_status ===
                                          "fixed" ? (
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                removeFromTransferList(player);
                                              }}
                                              className="px-3 py-1.5 bg-error-container text-on-error-container hover:brightness-110 text-[10px] uppercase font-black rounded-sm transition-all"
                                            >
                                              Retirar
                                            </button>
                                          ) : (
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                listPlayerFixed(player);
                                              }}
                                              className="px-3 py-1.5 bg-surface-bright hover:brightness-110 text-on-surface text-[10px] uppercase font-black rounded-sm transition-all border border-outline-variant/30"
                                            >
                                              Listar
                                            </button>
                                          )}
                                        </div>
                                      ) : (
                                        <span className="text-[10px] text-on-surface-variant/40 uppercase font-bold">
                                          Recente
                                        </span>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* ── WAGE STRUCTURE BAR CHART ──────────────────────── */}
                      <div className="bg-surface-container-low p-5 rounded-md">
                        <h3 className="text-[10px] font-black uppercase tracking-widest text-primary mb-5">
                          Distribuição Salarial por Posição
                        </h3>
                        <div className="flex items-end gap-3 h-20 mb-3">
                          {wageByPos.map(({ pos, total }) => {
                            const pct = Math.round((total / maxPosWage) * 100);
                            const barColor =
                              POSITION_BAR_COLOR[pos] || "bg-primary";
                            return (
                              <div
                                key={pos}
                                className="flex-1 flex flex-col items-center gap-1"
                              >
                                <span className="text-[9px] font-black text-on-surface-variant text-center leading-tight">
                                  {total > 0 ? formatCurrency(total) : "—"}
                                </span>
                                <div className="w-full bg-surface-container-high/60 rounded-t-sm relative h-12">
                                  <div
                                    className={`absolute bottom-0 inset-x-0 rounded-t-sm ${barColor} opacity-75 transition-all`}
                                    style={{ height: `${Math.max(pct, 4)}%` }}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <div className="flex gap-3">
                          {wageByPos.map(({ pos, count }) => (
                            <div key={pos} className="flex-1 text-center">
                              <div
                                className={`text-[10px] font-black uppercase ${POSITION_TEXT_CLASS[pos] || "text-on-surface-variant"}`}
                              >
                                {pos}
                              </div>
                              <div className="text-[9px] text-on-surface-variant/50">
                                {count} jog.
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })()}

              {activeTab === "tactic" && (
                <div>
                  {/* ── COMPACT PLAYER LIST ──────────────────────────── */}
                  <div className="bg-surface-container rounded-lg">
                    <div className="px-4 py-3 border-b border-outline-variant/20 bg-surface/40 rounded-t-lg flex items-center justify-between">
                      <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-black">
                        Plantel
                      </p>
                      <p className="text-[10px] font-black text-zinc-500">
                        <span className="text-emerald-400">
                          {
                            annotatedSquad.filter((p) => p.status === "Titular")
                              .length
                          }
                        </span>
                        /11 titulares ·{" "}
                        <span className="text-amber-400">
                          {
                            annotatedSquad.filter(
                              (p) => p.status === "Suplente",
                            ).length
                          }
                        </span>
                        /5 suplentes
                      </p>
                    </div>
                    <div className="divide-y divide-outline-variant/10">
                      {annotatedSquad.map((player) => (
                        <div
                          key={player.id}
                          className={`flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-bright/20 select-none relative ${player.isUnavailable ? "opacity-60" : ""}`}
                        >
                          <span
                            className={`cursor-pointer text-base leading-none shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-full ${player.status === "Titular" ? "bg-emerald-500/15" : player.status === "Suplente" ? "bg-amber-500/15" : "bg-zinc-900/80"}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenStatusPickerId((prev) =>
                                prev === player.id ? null : player.id,
                              );
                            }}
                          >
                            {player.status === "Titular"
                              ? "🟢"
                              : player.status === "Suplente"
                                ? "🟡"
                                : "⚫️"}
                          </span>
                          <span
                            className={`text-xs font-black w-5 text-center shrink-0 ${POSITION_TEXT_CLASS[player.position] || "text-zinc-400"}`}
                          >
                            {POSITION_SHORT_LABELS[player.position] ||
                              player.position}
                          </span>
                          <span className="flex-1 text-white text-sm font-bold truncate">
                            <PlayerLink playerId={player.id}>
                              {player.name}
                            </PlayerLink>
                            {!!player.is_star &&
                              (player.position === "MED" ||
                                player.position === "ATA") && (
                                <span
                                  className="ml-1 text-amber-400 font-black"
                                  title="Craque"
                                >
                                  *
                                </span>
                              )}
                            {player.isUnavailable && (
                              <span className="ml-1.5 text-xs font-bold text-red-400">
                                {(player.suspension_until_matchweek || 0) >
                                matchweekCount
                                  ? "🟥"
                                  : "🩹"}
                              </span>
                            )}
                          </span>
                          <span className="text-primary font-black text-sm shrink-0">
                            {player.skill}
                            {player.prev_skill !== null &&
                              player.prev_skill !== undefined &&
                              player.prev_skill !== player.skill && (
                                <span
                                  className={`ml-0.5 text-[10px] ${player.skill > player.prev_skill ? "text-emerald-400" : "text-red-400"}`}
                                >
                                  {player.skill > player.prev_skill ? "▲" : "▼"}
                                </span>
                              )}
                          </span>
                          {openStatusPickerId === player.id &&
                            (() => {
                              const subCount = Object.entries(
                                tactic.positions,
                              ).filter(
                                ([id, s]) =>
                                  s === "Suplente" && Number(id) !== player.id,
                              ).length;
                              const subsFull = subCount >= 5;
                              return (
                                <div
                                  className="absolute left-10 top-full z-50 bg-surface-container-high border border-outline-variant/40 rounded-md shadow-xl p-1 flex flex-col gap-0.5 min-w-36"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {[
                                    ["Titular", "🟢", "Convocado"],
                                    ["Suplente", "🟡", "Suplente"],
                                    ["Excluído", "⚫️", "Não convocado"],
                                  ].map(([status, emoji, label]) => {
                                    const unavailable =
                                      player.isUnavailable &&
                                      (status === "Titular" ||
                                        status === "Suplente");
                                    const disabled =
                                      unavailable ||
                                      (status === "Suplente" &&
                                        subsFull &&
                                        player.status !== "Suplente");
                                    return (
                                      <button
                                        key={status}
                                        onClick={() =>
                                          !disabled &&
                                          handleSetPlayerStatus(
                                            player.id,
                                            status,
                                          )
                                        }
                                        title={
                                          unavailable
                                            ? "Jogador indisponível (lesão/suspensão)"
                                            : disabled
                                              ? "Máximo de 5 suplentes atingido"
                                              : undefined
                                        }
                                        className={`px-3 py-2 rounded-md text-xs font-bold flex items-center gap-2 text-left ${
                                          disabled
                                            ? "opacity-40 cursor-not-allowed text-on-surface-variant"
                                            : player.status === status
                                              ? "bg-surface-bright text-on-surface"
                                              : "hover:bg-surface-bright/60 text-on-surface-variant"
                                        }`}
                                      >
                                        {emoji} {label}
                                      </button>
                                    );
                                  })}
                                </div>
                              );
                            })()}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "market" && (
                <div className="bg-surface-container rounded-lg shadow-sm overflow-hidden">
                  <div className="border-b border-outline-variant/20 bg-surface/40 p-4 md:p-5">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[10px] uppercase tracking-widest text-zinc-500 font-black mb-2">
                          Posição
                        </label>
                        <select
                          className="w-full bg-surface border border-outline-variant rounded-sm px-3 py-3 text-sm font-bold text-on-surface focus:ring-2 focus:ring-primary"
                          value={marketPositionFilter}
                          onChange={(e) =>
                            setMarketPositionFilter(e.target.value)
                          }
                        >
                          <option value="all">Todas</option>
                          <option value="GR">Guarda-Redes</option>
                          <option value="DEF">Defesa</option>
                          <option value="MED">Médio</option>
                          <option value="ATA">Avançado</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] uppercase tracking-widest text-zinc-500 font-black mb-2">
                          Ordenar por
                        </label>
                        <select
                          className="w-full bg-surface border border-outline-variant rounded-sm px-3 py-3 text-sm font-bold text-on-surface focus:ring-2 focus:ring-primary"
                          value={marketSort}
                          onChange={(e) => setMarketSort(e.target.value)}
                        >
                          <option value="quality-desc">
                            Qualidade (maior primeiro)
                          </option>
                          <option value="quality-asc">
                            Qualidade (menor primeiro)
                          </option>
                          <option value="price-asc">Preço (mais barato)</option>
                          <option value="price-desc">Preço (mais caro)</option>
                        </select>
                      </div>
                      <div className="flex flex-col justify-end gap-1">
                        <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-black">
                          Caixa disponível
                        </div>
                        <div className="text-sm font-black text-emerald-400">
                          €{(teamInfo?.budget ?? 0).toLocaleString("pt-PT")}
                        </div>
                        <div className="text-xs text-zinc-500">
                          {filteredMarketPlayers.length} jogadores
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[760px] text-left text-xs md:text-sm">
                      <thead>
                        <tr className="bg-surface/50 text-on-surface-variant uppercase text-[10px] md:text-[11px] border-b border-outline-variant/20">
                          <th className="px-4 py-2.5 font-black">Pos</th>
                          <th className="px-4 py-2.5 font-black"></th>
                          <th className="px-4 py-2.5 font-black">Nome</th>
                          <th className="px-4 py-2.5 font-black">Clube</th>
                          <th className="px-4 py-2.5 font-black text-center">
                            Qual
                          </th>
                          <th className="px-4 py-2.5 font-black text-center">
                            Agr.
                          </th>
                          <th className="px-4 py-2.5 font-black text-center">
                            Golos
                          </th>
                          <th className="px-4 py-2.5 font-black text-center">
                            Vermelhos
                          </th>
                          <th className="px-4 py-2.5 font-black text-center">
                            Lesões
                          </th>
                          <th className="px-4 py-2.5 font-black text-right">
                            Preço
                          </th>
                          <th className="px-4 py-2.5 font-black text-right">
                            Ordenado
                          </th>
                          <th className="px-4 py-2.5"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-outline-variant/10 font-medium">
                        {filteredMarketPlayers.map((player) => {
                          const isListed =
                            player.transfer_status &&
                            player.transfer_status !== "none";
                          const price = player.marketPrice;
                          const canAfford = teamInfo?.budget >= price;
                          return (
                            <tr
                              key={player.id}
                              className="hover:bg-surface-bright/20 transition-colors"
                            >
                              <td className="px-4 py-2 font-black text-[11px] md:text-xs">
                                {player.position}
                              </td>
                              <td
                                className="px-4 py-2 text-center text-lg"
                                title={
                                  FLAG_TO_COUNTRY[player.nationality] ||
                                  player.nationality ||
                                  "—"
                                }
                              >
                                {player.nationality || "—"}
                              </td>
                              <td className="px-4 py-2">
                                <div className="flex items-center gap-2">
                                  <p className="font-bold text-white text-sm leading-tight">
                                    <PlayerLink playerId={player.id}>
                                      {player.name}
                                    </PlayerLink>
                                    {!!player.is_star &&
                                      (player.position === "MED" ||
                                        player.position === "ATA") && (
                                        <span
                                          className="ml-1 text-amber-400 font-black"
                                          title="Craque"
                                        >
                                          *
                                        </span>
                                      )}
                                  </p>
                                  {isListed && (
                                    <span
                                      className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${player.transfer_status === "auction" ? "bg-primary text-on-primary" : "bg-sky-500 text-zinc-950"}`}
                                    >
                                      {player.transfer_status === "auction"
                                        ? "Leilão"
                                        : "Lista"}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-2 font-bold text-zinc-400">
                                {player.team_name || "Sem clube"}
                              </td>
                              <td className="px-4 py-2 text-center">
                                <span className="bg-surface text-on-surface font-headline font-black px-2 py-1 rounded-sm text-sm border border-outline-variant/30 tabular-nums">
                                  {player.skill}
                                </span>
                              </td>
                              <td className="px-4 py-2 text-center">
                                <AggBadge value={player.aggressiveness} />
                              </td>
                              <td className="px-4 py-2 text-center font-black text-emerald-400">
                                {getPlayerStat(player, ["goals"])}{" "}
                                <span className="text-zinc-500 text-xs font-normal">
                                  ({getPlayerStat(player, ["career_goals"])})
                                </span>
                              </td>
                              <td className="px-4 py-2 text-center font-black text-red-400">
                                {getPlayerStat(player, ["red_cards"])}{" "}
                                <span className="text-zinc-500 text-xs font-normal">
                                  ({getPlayerStat(player, ["career_reds"])})
                                </span>
                              </td>
                              <td className="px-4 py-2 text-center font-black text-orange-400">
                                {getPlayerStat(player, ["injuries"])}{" "}
                                <span className="text-zinc-500 text-xs font-normal">
                                  ({getPlayerStat(player, ["career_injuries"])})
                                </span>
                              </td>
                              <td className="px-4 py-2 text-right font-mono text-zinc-300 text-sm md:text-base">
                                {formatCurrency(price)}
                              </td>
                              <td className="px-4 py-2 text-right font-mono text-zinc-300 text-xs md:text-sm">
                                {formatCurrency(
                                  player.contract_requested_wage ||
                                    player.wage ||
                                    0,
                                )}
                              </td>
                              <td className="px-4 py-2 text-right">
                                {player.transfer_status === "auction" ? (
                                  isSameTeamId(
                                    player.auction_seller_team_id,
                                    me?.teamId,
                                  ) ? (
                                    <span className="text-zinc-600 text-[10px] font-bold uppercase">
                                      Meu leilão
                                    </span>
                                  ) : (
                                    <button
                                      onClick={() => openAuctionBid(player)}
                                      className="bg-primary hover:brightness-110 text-on-primary font-black uppercase text-[10px] px-3 py-1.5 rounded-md tracking-wide"
                                    >
                                      Licitar
                                    </button>
                                  )
                                ) : (
                                  <button
                                    onClick={() => buyPlayer(player.id)}
                                    disabled={!canAfford}
                                    className="bg-primary hover:brightness-110 disabled:opacity-30 disabled:hover:bg-primary text-on-primary font-black uppercase text-[10px] px-3 py-1.5 rounded-md tracking-wide"
                                  >
                                    {canAfford ? "Comprar" : "Sem dinheiro"}
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {activeTab === "tactic" && (
              <div className="space-y-6">
                <div className="bg-surface-container p-5 rounded-lg flex flex-col items-center sticky top-23">
                  {disconnected && (
                    <p className="text-red-400 text-xs font-bold mb-3 text-center">
                      ⚠️ Desligado — a reconectar...
                    </p>
                  )}
                  {nextMatchSummary?.isCup && !nextMatchOpponent ? (
                    <div className="w-full flex flex-col items-center gap-6 py-6 text-center">
                      <p className="text-5xl">🏆</p>
                      <p className="text-on-surface-variant font-bold text-sm leading-relaxed">
                        Já foste eliminado desta ronda da Taça.
                        <br />
                        Aguarda os resultados dos outros jogos na aba LIVE.
                      </p>
                    </div>
                  ) : (
                    <div className="w-full mb-4 space-y-4">
                      {/* ── 2D PITCH ─────────────────────────────────────── */}
                      {(() => {
                        const titulares = annotatedSquad.filter(
                          (p) => p.status === "Titular",
                        );
                        const grPlayers = titulares.filter(
                          (p) => p.position === "GR",
                        );
                        const defPlayers = titulares.filter(
                          (p) => p.position === "DEF",
                        );
                        const medPlayers = titulares.filter(
                          (p) => p.position === "MED",
                        );
                        const ataPlayers = titulares.filter(
                          (p) => p.position === "ATA",
                        );
                        const rows = [
                          ataPlayers,
                          medPlayers,
                          defPlayers,
                          grPlayers,
                        ];
                        const rowYs = ["10%", "33%", "59%", "82%"];
                        const posColors = {
                          GR: "bg-amber-500 text-zinc-900",
                          DEF: "bg-sky-500 text-zinc-900",
                          MED: "bg-primary text-on-primary",
                          ATA: "bg-red-500 text-white",
                        };
                        return (
                          <div
                            className="relative w-full rounded-md overflow-hidden border border-outline-variant/20"
                            style={{
                              aspectRatio: "3/4",
                              background:
                                "linear-gradient(180deg, #05430e 0%, #0b5e1a 50%, #05430e 100%)",
                            }}
                          >
                            <svg
                              className="absolute inset-0 w-full h-full"
                              viewBox="0 0 300 400"
                              preserveAspectRatio="none"
                              aria-hidden="true"
                            >
                              <rect
                                x="12"
                                y="12"
                                width="276"
                                height="376"
                                fill="none"
                                stroke="rgba(255,255,255,0.18)"
                                strokeWidth="1.5"
                                rx="2"
                              />
                              <line
                                x1="12"
                                y1="200"
                                x2="288"
                                y2="200"
                                stroke="rgba(255,255,255,0.15)"
                                strokeWidth="1"
                              />
                              <circle
                                cx="150"
                                cy="200"
                                r="44"
                                fill="none"
                                stroke="rgba(255,255,255,0.12)"
                                strokeWidth="1"
                              />
                              <circle
                                cx="150"
                                cy="200"
                                r="3"
                                fill="rgba(255,255,255,0.18)"
                              />
                              <rect
                                x="90"
                                y="12"
                                width="120"
                                height="56"
                                fill="none"
                                stroke="rgba(255,255,255,0.12)"
                                strokeWidth="1"
                              />
                              <rect
                                x="120"
                                y="12"
                                width="60"
                                height="22"
                                fill="none"
                                stroke="rgba(255,255,255,0.1)"
                                strokeWidth="1"
                              />
                              <rect
                                x="90"
                                y="332"
                                width="120"
                                height="56"
                                fill="none"
                                stroke="rgba(255,255,255,0.12)"
                                strokeWidth="1"
                              />
                              <rect
                                x="120"
                                y="366"
                                width="60"
                                height="22"
                                fill="none"
                                stroke="rgba(255,255,255,0.1)"
                                strokeWidth="1"
                              />
                            </svg>
                            {rows.map((rowPlayers, ri) =>
                              rowPlayers.length > 0 ? (
                                <div
                                  key={ri}
                                  className="absolute w-full flex justify-evenly items-start px-2"
                                  style={{ top: rowYs[ri] }}
                                >
                                  {rowPlayers.map((player) => (
                                    <div
                                      key={player.id}
                                      className="flex flex-col items-center gap-0.5"
                                      style={{ maxWidth: "64px" }}
                                    >
                                      <div
                                        className={`w-9 h-9 rounded-full flex items-center justify-center font-black text-xs border-2 border-white/20 shrink-0 relative ${posColors[player.position] || "bg-zinc-500 text-white"} ${player.isUnavailable ? "opacity-50 ring-2 ring-red-500" : ""}`}
                                      >
                                        {POSITION_SHORT_LABELS[
                                          player.position
                                        ] || "?"}
                                        {player.isUnavailable && (
                                          <span className="absolute -top-1 -right-1 text-[9px] leading-none">
                                            {(player.suspension_until_matchweek ||
                                              0) > matchweekCount
                                              ? "🟥"
                                              : "🩹"}
                                          </span>
                                        )}
                                      </div>
                                      <span
                                        className="text-white text-[9px] font-bold text-center leading-tight hover:underline underline-offset-2 cursor-pointer"
                                        style={{
                                          textShadow:
                                            "0 1px 4px rgba(0,0,0,0.95), 0 0 8px rgba(0,0,0,0.8)",
                                          maxWidth: "56px",
                                          display: "block",
                                          whiteSpace: "nowrap",
                                          overflow: "hidden",
                                          textOverflow: "ellipsis",
                                        }}
                                        onClick={() =>
                                          socket.emit("requestPlayerHistory", {
                                            playerId: player.id,
                                          })
                                        }
                                      >
                                        {player.name.split(" ").pop()}
                                      </span>
                                      <span
                                        className="text-[9px] font-black leading-none"
                                        style={{
                                          color: "var(--color-primary)",
                                          textShadow:
                                            "0 1px 4px rgba(0,0,0,0.95)",
                                        }}
                                      >
                                        {player.skill}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              ) : null,
                            )}
                            {!tactic.formation && (
                              <div className="absolute inset-0 flex items-center justify-center">
                                <p
                                  className="text-zinc-400 text-sm font-bold text-center px-8 leading-relaxed"
                                  style={{
                                    textShadow: "0 1px 4px rgba(0,0,0,0.9)",
                                  }}
                                >
                                  Escolhe uma formação para ver os jogadores em
                                  campo
                                </p>
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      <div className="p-4 rounded-md border border-outline-variant/20 bg-surface/60">
                        <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-black mb-3">
                          Tática
                        </p>
                        <div className="space-y-3">
                          <select
                            ref={formationSelectRef}
                            className="w-full bg-surface border border-outline-variant rounded-sm px-3 py-3 text-sm font-bold text-on-surface focus:ring-2 focus:ring-primary"
                            value={tactic.formation}
                            onMouseDown={() => {
                              // Reset native value to "" so picking the same formation still fires onChange
                              if (formationSelectRef.current) {
                                formationSelectRef.current.value = "";
                              }
                            }}
                            onChange={(e) => handleAutoPick(e.target.value)}
                          >
                            <option value="" disabled>
                              Escolher formação...
                            </option>
                            <option value="4-4-2">4-4-2 Clássico</option>
                            <option value="4-3-3">4-3-3 Ofensivo</option>
                            <option value="3-5-2">
                              3-5-2 Controlo da Bola
                            </option>
                            <option value="5-3-2">5-3-2 Autocarro</option>
                            <option value="4-5-1">4-5-1 Catenaccio</option>
                            <option value="3-4-3">3-4-3 Ataque Total</option>
                            <option value="4-2-4">4-2-4 Avassalador</option>
                            <option value="5-4-1">5-4-1 Ferrolho</option>
                          </select>
                          <select
                            className="w-full bg-surface border border-outline-variant rounded-sm px-3 py-3 text-sm font-bold text-primary focus:ring-2 focus:ring-primary"
                            value={tactic.style}
                            onChange={(e) =>
                              updateTactic({ style: e.target.value })
                            }
                          >
                            <option value="Balanced">Equilibrado</option>
                            <option value="Offensive">
                              Ofensivo (+15% Atk)
                            </option>
                            <option value="Defensive">
                              Defensivo (+20% Def)
                            </option>
                          </select>
                          <button
                            className="w-full bg-surface-container hover:bg-surface-bright border border-outline-variant/30 rounded px-3 py-2 text-xs font-bold text-on-surface-variant hover:text-on-surface transition-colors"
                            onClick={() => {
                              setTactic((prev) => {
                                const allExcluded = Object.fromEntries(
                                  mySquad.map((p) => [p.id, "Excluído"]),
                                );
                                const next = {
                                  ...prev,
                                  formation: "",
                                  positions: allExcluded,
                                };
                                socket.emit("setTactic", next);
                                return next;
                              });
                            }}
                          >
                            🧹 Limpar Tática
                          </button>
                          {(() => {
                            const morale = teamInfo?.morale ?? 75;
                            const moraleColor =
                              morale > 75
                                ? "bg-primary"
                                : morale >= 50
                                  ? "bg-tertiary"
                                  : "bg-error";
                            const moraleLabel =
                              morale > 75
                                ? "Boa"
                                : morale >= 50
                                  ? "Média"
                                  : "Baixa";
                            return (
                              <div>
                                <p className="text-[10px] uppercase tracking-widest text-on-surface-variant font-black mb-1.5">
                                  Moral da Equipa
                                </p>
                                <div className="flex items-center gap-2">
                                  <div className="flex-1 bg-surface-bright rounded-full h-2 overflow-hidden">
                                    <div
                                      className={`h-2 rounded-full transition-all duration-500 ${moraleColor}`}
                                      style={{ width: `${morale}%` }}
                                    />
                                  </div>
                                  <span
                                    className={`text-xs font-headline font-black tracking-wider w-10 text-right ${
                                      morale > 75
                                        ? "text-primary"
                                        : morale >= 50
                                          ? "text-tertiary"
                                          : "text-error"
                                    }`}
                                  >
                                    {moraleLabel}
                                  </span>
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                  )}
                  {(() => {
                    const isReady = players.find(
                      (p) => p.name === me.name,
                    )?.ready;
                    const isHalftime = showHalftimePanel && !isPlayingMatch;
                    // Eliminado da taça: jornada é de taça mas o utilizador não tem jogo
                    const isEliminatedCupSpectator =
                      nextMatchSummary?.isCup && !nextMatchOpponent;
                    const isDisabled = isEliminatedCupSpectator
                      ? !!isReady
                      : !isHalftime && !isReady && !isLineupComplete;
                    return (
                      <>
                        <button
                          onClick={
                            isHalftime ? handleHalftimeReady : handleReady
                          }
                          disabled={isDisabled}
                          className={`w-full py-5 font-black rounded-sm text-xl transition-all uppercase tracking-widest relative overflow-hidden ${isReady ? "bg-surface-bright text-on-surface-variant" : isDisabled ? "bg-surface-bright text-on-surface-variant cursor-not-allowed opacity-50" : "bg-primary text-on-primary hover:brightness-110"}`}
                        >
                          {isReady
                            ? "A AGUARDAR OUTROS"
                            : isEliminatedCupSpectator
                              ? "AVANÇAR PARA JOGOS DA TAÇA"
                              : isHalftime && isCupMatch
                                ? "2ª PARTE — TAÇA"
                                : isHalftime
                                  ? "2ª PARTE"
                                  : "JOGAR JORNADA"}
                        </button>
                        {isDisabled && !isEliminatedCupSpectator && (
                          <p className="text-xs font-bold text-red-400 mt-2 text-center">
                            Escolhe 1 GR + 10 jogadores de campo como Titular
                          </p>
                        )}
                      </>
                    );
                  })()}
                  <p className="text-xs font-bold text-zinc-500 mt-4 text-center leading-relaxed">
                    Se jogas com amigos, a jornada só avança quando TODOS
                    clicarem.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      <TeamSquadModal
        selectedTeam={selectedTeam}
        selectedTeamSquad={selectedTeamSquad}
        selectedTeamLoading={selectedTeamLoading}
        me={me}
        players={players}
        palmares={palmares}
        palmaresTeamId={palmaresTeamId}
        handleCloseTeamSquad={handleCloseTeamSquad}
        setTransferProposalModal={setTransferProposalModal}
      />

      <TransferProposalModal
        transferProposalModal={transferProposalModal}
        setTransferProposalModal={setTransferProposalModal}
      />

      {/* ── Auction notification (persiana) ───────────────────────────────── */}
      <div
        className={`fixed top-14 left-0 right-0 z-130 transition-transform duration-300 ${
          selectedAuctionPlayer ? "translate-y-0" : "-translate-y-full"
        }`}
      >
        <AuctionNotification
          selectedAuctionPlayer={selectedAuctionPlayer}
          isAuctionExpanded={isAuctionExpanded}
          setIsAuctionExpanded={setIsAuctionExpanded}
          auctionResult={auctionResult}
          myAuctionBid={myAuctionBid}
          auctionBid={auctionBid}
          setAuctionBid={setAuctionBid}
          closeAuctionBid={closeAuctionBid}
          submitAuctionBid={submitAuctionBid}
          teams={teams}
          me={me}
          teamInfo={teamInfo}
        />
      </div>
      <RefereePopup
        refereePopup={refereePopup}
        closeRefereePopup={closeRefereePopup}
        teamInfo={teamInfo}
        nextMatchOpponent={nextMatchOpponent}
      />

      <PenaltySuspensePopup penaltySuspense={penaltySuspense} />

      <CupDrawPopup
        showCupDrawPopup={showCupDrawPopup}
        cupDraw={cupDraw}
        cupDrawRevealIdx={cupDrawRevealIdx}
        me={me}
        setShowCupDrawPopup={setShowCupDrawPopup}
      />

      <PenaltyShootoutPopup
        cupPenaltyPopup={cupPenaltyPopup}
        cupPenaltyKickIdx={cupPenaltyKickIdx}
        teams={teams}
        setCupPenaltyPopup={setCupPenaltyPopup}
        setCupPenaltyKickIdx={setCupPenaltyKickIdx}
      />

      <MatchDetailModal
        showMatchDetail={showMatchDetail}
        matchDetailFixture={matchDetailFixture}
        teams={teams}
        liveMinute={liveMinute}
        isPlayingMatch={isPlayingMatch}
        isCupMatch={isCupMatch}
        cupMatchRoundName={cupMatchRoundName}
        currentJornada={currentJornada}
        setShowMatchDetail={setShowMatchDetail}
      />

      <WelcomeModal
        welcomeModal={welcomeModal}
        me={me}
        setWelcomeModal={setWelcomeModal}
      />

      <JobOfferModal
        jobOfferModal={jobOfferModal}
        setJobOfferModal={setJobOfferModal}
      />

      <NewsTicker newsTickerItems={newsTickerItems} />

      <PlayerHistoryModal
        playerHistoryModal={playerHistoryModal}
        setPlayerHistoryModal={setPlayerHistoryModal}
      />

      <ChatWidget
        me={me}
        chatOpen={chatOpen}
        setChatOpen={setChatOpen}
        activeChatTab={activeChatTab}
        setActiveChatTab={setActiveChatTab}
        roomMessages={roomMessages}
        globalMessages={globalMessages}
        unreadRoom={unreadRoom}
        unreadGlobal={unreadGlobal}
        chatInput={chatInput}
        setChatInput={setChatInput}
        chatMessagesRef={chatMessagesRef}
      />
    </div>
  );
}

export default App;
