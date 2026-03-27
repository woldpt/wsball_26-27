import React, {
  useEffect,
  useLayoutEffect,
  useState,
  useMemo,
  useCallback,
} from "react";
import { socket } from "./socket";
import AdminPanel from "./AdminPanel.jsx";

const DIVISION_NAMES = {
  1: "I Liga",
  2: "II Liga",
  3: "Liga 3",
  4: "Campeonato de Portugal",
  5: "Distritais",
};

const POSITION_SHORT_LABELS = {
  GK: "G",
  DEF: "D",
  MID: "M",
  ATK: "A",
};

// Enable row background color per position
const ENABLE_ROW_BG = true;

// Text color classes for each position (soft palette)
const POSITION_TEXT_CLASS = {
  GK: "text-yellow-500",
  DEF: "text-blue-500",
  MID: "text-emerald-500",
  ATK: "text-rose-500",
};

// Background color classes for each position (soft, subtle)
const POSITION_BG_CLASS = {
  GK: "bg-yellow-500/8",
  DEF: "bg-blue-500/8",
  MID: "bg-emerald-500/8",
  ATK: "bg-rose-500/8",
};

const MAX_MATCH_SUBS = 5;
const ADMIN_SESSION_KEY = "cashballAdminSession";

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
    GK: 1,
    DEF: parseInt(formationParts[0], 10) || 0,
    MID: parseInt(formationParts[1], 10) || 0,
    ATK: parseInt(formationParts[2], 10) || 0,
  };
  const usedByPosition = { GK: 0, DEF: 0, MID: 0, ATK: 0 };
  const lineup = [];

  for (const player of sortedPlayers) {
    const playerPosition = player.position;
    if (usedByPosition[playerPosition] < requiredByPosition[playerPosition]) {
      lineup.push(player);
      usedByPosition[playerPosition] += 1;
    }
  }

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

  // Pick 5 suplentes from the best remaining available players
  const subs = sortedPlayers.filter((p) => !lineup.includes(p)).slice(0, 5);
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
  });

  return { active, offPlayers, subPlayers };
}

function getMatchLastEventText(events = [], liveMinute = 90) {
  let latest = null;
  events.forEach((event, index) => {
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

const playWhistle = () => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "square";
    osc.frequency.setValueAtTime(1500, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(1200, ctx.currentTime + 0.3);
    gain.gain.setValueAtTime(0.05, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
  } catch (error) {
    console.error(error);
  }
};

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

  const [matchResults, setMatchResults] = useState(null);
  const [matchweekCount, setMatchweekCount] = useState(0);
  const [activeTab, setActiveTab] = useState("squad");
  const [topScorers, setTopScorers] = useState([]);
  const [marketPairs, setMarketPairs] = useState([]);
  const [marketPositionFilter, setMarketPositionFilter] = useState("all");
  const [marketSort, setMarketSort] = useState("quality-desc");
  const [selectedAuctionPlayer, setSelectedAuctionPlayer] = useState(null);
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
  const [showCupResults, setShowCupResults] = useState(false);
  const [cupPenaltyPopup, setCupPenaltyPopup] = useState(null); // shootout data
  const [cupPenaltyKickIdx, setCupPenaltyKickIdx] = useState(0); // how many kicks revealed
  const [welcomeModal, setWelcomeModal] = useState(null); // { teamName }
  // Cup match live state
  const [isCupMatch, setIsCupMatch] = useState(false);
  const [cupMatchRoundName, setCupMatchRoundName] = useState("");
  const [cupExtraTimeBadge, setCupExtraTimeBadge] = useState(false);
  const [isCupExtraTime, setIsCupExtraTime] = useState(false);
  const [palmares, setPalmares] = useState({ trophies: [], allChampions: [] });
  const [palmaresTeamId, setPalmaresTeamId] = useState(null); // last requested team
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [selectedTeamSquad, setSelectedTeamSquad] = useState([]);
  const [selectedTeamLoading, setSelectedTeamLoading] = useState(false);
  const [tactic, setTactic] = useState({
    formation: "4-4-2",
    style: "Balanced",
    positions: {},
  });
  const [liveMinute, setLiveMinute] = useState(90);
  const [isPlayingMatch, setIsPlayingMatch] = useState(false);
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
  // Match detail modal (non-blocking overlay during live match)
  const [showMatchDetail, setShowMatchDetail] = useState(false);
  const [matchDetailFixture, setMatchDetailFixture] = useState(null);
  const meRef = React.useRef(null);
  const isPlayingMatchRef = React.useRef(false);
  const selectedTeamRef = React.useRef(null);
  const marketPairsRef = React.useRef([]);
  const mySquadRef = React.useRef([]);
  const tacticRef = React.useRef({ positions: {} });
  // goalFlashRef: { [key]: timestamp } – key = `${homeId}_${awayId}_home|away`
  const goalFlashRef = React.useRef({});

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
            if (data.length > 0 && !roomCode) setRoomCode(data[0]);
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
          if (data.length > 0 && !roomCode) setRoomCode(data[0]);
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

  // BUG-07 FIX: All socket listeners in a single effect with [] dep so they're
  // registered exactly once and cleaned up correctly on unmount.
  useEffect(() => {
    socket.on("teamsData", (data) => setTeams(data));
    socket.on("playerListUpdate", (data) => {
      setPlayers(data);
    });
    socket.on("mySquad", (data) => setMySquad(data));
    socket.on("marketUpdate", (data) => setMarketPairs(data));
    socket.on("auctionStarted", (auctionData) => {
      // Never open auction modal during an active match
      if (isPlayingMatchRef.current) return;
      // Auto-open auction modal for all coaches with full player card
      setSelectedAuctionPlayer(auctionData);
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
      setSelectedAuctionPlayer((prev) => {
        if (prev && prev.playerId === result.playerId) {
          setAuctionResult(result);
          // Auto-dismiss after 5 seconds
          setTimeout(() => {
            setSelectedAuctionPlayer(null);
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
      setCupDraw(data);
      setCupDrawRevealIdx(0);
      setShowCupDrawPopup(true);
    });
    socket.on("cupHalfTimeResults", (data) => {
      setIsMatchActionPending(false);
      // Treat the cup halftime exactly like a league halftime:
      // reuse matchResults state so the live tab renders events and score.
      setMatchResults({
        matchweek: data.season,
        results: data.fixtures.map((fx) => ({
          homeTeamId: fx.homeTeam?.id,
          awayTeamId: fx.awayTeam?.id,
          finalHomeGoals: fx.homeGoals,
          finalAwayGoals: fx.awayGoals,
          events: fx.events || [],
          attendance: null,
        })),
      });
      setLiveMinute(0);
      setSubsMade(0);
      setSubbedOut([]);
      setConfirmedSubs([]);
      setSwapSource(null);
      setSwapTarget(null);
      setShowHalftimePanel(true);
      setIsPlayingMatch(true);
      setIsCupMatch(true);
      setCupMatchRoundName(data.roundName);
      setCupExtraTimeBadge(false);
      setActiveTab("live");
    });
    socket.on("cupExtraTimeStart", (data) => {
      // Cup match went to extra time — restart the live clock from 90
      setIsCupExtraTime(true);
      setCupExtraTimeBadge(true);
      setLiveMinute(90);
      setIsPlayingMatch(true);
      setActiveTab("live");
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
      setCupRoundResults(data);
      setShowCupResults(true);
      setIsCupMatch(false);
      setIsCupExtraTime(false);
      setCupExtraTimeBadge(false);
      setIsPlayingMatch(false);
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
      setActiveTab("live");
    });
    socket.on("cupPenaltyShootout", (data) => {
      setCupPenaltyPopup(data);
      setCupPenaltyKickIdx(0);
    });
    socket.on("palmaresData", (data) => {
      setPalmares(data);
      setPalmaresTeamId(data.teamId);
    });
    socket.on("systemMessage", (msg) => addToast(msg));
    socket.on("teamAssigned", (data) => {
      const currentMe = meRef.current;
      if (
        currentMe?.name &&
        currentMe?.roomCode &&
        !hasSeenWelcome(currentMe.name, currentMe.roomCode)
      ) {
        setWelcomeModal({ teamName: data.teamName });
      }
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
    });

    socket.on("roomLocked", ({ coaches }) => {
      setLockedCoaches(coaches || []);
    });

    socket.on("awaitingCoaches", (offline) => {
      setAwaitingCoaches(offline || []);
    });

    socket.on("halfTimeResults", (data) => {
      setIsMatchActionPending(false);
      setMatchResults(data);
      setLiveMinute(0);
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

      if (normalizedAction.type === "penalty") {
        const toCandidate = (player) => {
          if (!player || player.id === undefined || player.id === null) {
            return null;
          }
          return {
            id: player.id,
            name: player.name || "Jogador",
            position: player.position || "MID",
            skill: Number(player.skill || 0),
          };
        };

        const incomingCandidates = (normalizedAction.takerCandidates || [])
          .map(toCandidate)
          .filter(Boolean);

        const currentSquad = Array.isArray(mySquadRef.current)
          ? mySquadRef.current
          : [];
        const currentPositions = tacticRef.current?.positions || {};
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
      setMatchResults(data);
      setMatchweekCount(data.matchweek);
      setShowHalftimePanel(false);
      setLiveMinute(45);
      setIsPlayingMatch(true);
      setIsCupMatch(false);
      setCupExtraTimeBadge(false);
      setActiveTab("live");
      setTactic((prev) => ({ ...prev, positions: {} }));
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
      socket.off("playerListUpdate");
      socket.off("mySquad");
      socket.off("marketUpdate");
      socket.off("auctionUpdate");
      socket.off("auctionClosed");
      socket.off("systemMessage");
      socket.off("teamAssigned");
      socket.off("joinError");
      socket.off("teamSquadData");
      socket.off("nextMatchSummary");
      socket.off("cupDrawStart");
      socket.off("cupHalfTimeResults");
      socket.off("cupExtraTimeStart");
      socket.off("extraTimeSecondHalfStart");
      socket.off("extraTimeHalfTime");
      socket.off("cupRoundResults");
      socket.off("cupSecondHalfStart");
      socket.off("cupPenaltyShootout");
      socket.off("palmaresData");
      socket.off("matchResults");
      socket.off("halfTimeResults");
      socket.off("matchActionRequired");
      socket.off("matchActionResolved");
      socket.off("gameState");
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
    };
  }, []); // empty deps — register once only

  // Keep meRef in sync so the onConnect closure above always has the latest me
  useEffect(() => {
    meRef.current = me;
  }, [me]);

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
    if (activeTab !== "squad" || !me?.teamId) return;
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
            // Signal server that the cup 2nd-half animation is done so it can
            // proceed with ET/penalties and then emit cupRoundResults.
            socket.emit("cupSecondHalfDone");
            // Stay on live tab — ET/penalties will follow via extraTimeHalfTime
            // and cupPenaltyShootout events; cupRoundResults shows the final popup.
          } else {
            // Signal server that the league animation is done — if there is a
            // pending cup draw it will now be triggered.
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
      setJoinError("");
      setJoining(true);
      socket.emit("joinGame", {
        name,
        password,
        roomCode: roomCode.toUpperCase(),
      });
      setMe({ name, password, roomCode: roomCode.toUpperCase() });
      // Timeout: if no teamId received in 6s, reset and show error
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

  // BUG-06 FIX: Halftime confirm always sends true.
  // Sending !isReady (a toggle) was broken because the server resets ready=false
  // after halftime, causing the toggle to send false instead of true.
  const handleHalftimeReady = () => {
    if (isCupMatch) {
      socket.emit("cupHalfTimeReady");
    } else {
      socket.emit("setReady", true);
    }
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

  // Penalty shootout progressive reveal: one kick every 2 s
  useEffect(() => {
    if (!cupPenaltyPopup) return;
    const total = (cupPenaltyPopup.kicks || []).length;
    if (cupPenaltyKickIdx >= total) return;
    const timer = setTimeout(() => setCupPenaltyKickIdx((i) => i + 1), 2000);
    return () => clearTimeout(timer);
  }, [cupPenaltyPopup, cupPenaltyKickIdx]);

  // Load own palmares when Clube tab is opened
  useEffect(() => {
    if (activeTab !== "club" || !me?.teamId) return;
    socket.emit("requestPalmares", { teamId: me.teamId });
  }, [activeTab, me?.teamId]);

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
  const updateTactic = useCallback(
    (patch) => {
      setTactic((prev) => {
        const next = { ...prev, ...patch };
        socket.emit("setTactic", next);
        return next;
      });
    },
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );

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
    [matchweekCount, mySquad], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // ── SUBSTITUTION SWAP ─────────────────────────────────────────────────────
  // Step 1: click a Titular to mark as OUT
  const handleSelectOut = useCallback((playerId) => {
    setSwapSource((prev) => (prev === playerId ? null : playerId));
    setSwapTarget(null);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
  }, [swapSource, swapTarget, subsMade]); // eslint-disable-line react-hooks/exhaustive-deps

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

        // If setting this player as Titular and they are a GK, demote any other
        // GK who is already Titular to Suplente (only 1 GK Titular allowed).
        if (status === "Titular") {
          const player = mySquad.find((p) => p.id === playerId);
          if (player?.position === "GK") {
            mySquad.forEach((p) => {
              if (
                p.id !== playerId &&
                p.position === "GK" &&
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
  ); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (confirm(`Enviar ${player.name} para leilão imediato?`)) {
      socket.emit("listPlayerForTransfer", {
        playerId: player.id,
        mode: "auction",
      });
    }
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

  // ── AUCTION BID ───────────────────────────────────────────────────────────
  const openAuctionBid = useCallback((player) => {
    if (!player) return;
    setSelectedAuctionPlayer(player);
    setAuctionBid("");
    setMyAuctionBid(null);
    setAuctionResult(null);
  }, []);

  const closeAuctionBid = useCallback(() => {
    setSelectedAuctionPlayer(null);
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
  }, [auctionBid]); // eslint-disable-line react-hooks/exhaustive-deps

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

    return marketPairs
      .filter((player) => player.team_id !== marketTeamId)
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
  }, [marketPairs, marketPositionFilter, marketSort, me?.teamId]);

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
        <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center p-6 font-sans">
          <h1 className="text-5xl font-black text-amber-500 mb-6 drop-shadow-xl tracking-tighter">
            CashBall <span className="text-zinc-100">26/27</span>
          </h1>
          <div className="bg-zinc-900/95 p-8 rounded-4xl w-full max-w-md border border-zinc-800 relative overflow-hidden shadow-2xl text-center">
            <div className="absolute top-0 inset-x-0 h-1 bg-linear-to-r from-amber-600 via-amber-400 to-amber-600"></div>
            <p className="text-xs text-zinc-500 uppercase font-black tracking-widest mb-2">
              Sessão guardada
            </p>
            <p className="text-2xl font-black text-white mb-2">
              A reconectar...
            </p>
            <p className="text-sm text-zinc-400 font-medium">
              {me.name} · {me.roomCode?.toUpperCase()}
            </p>
          </div>
        </div>
      );
    }

    const registerPasswordMismatch =
      confirmPassword !== "" && password !== confirmPassword;

    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-6 font-sans relative overflow-hidden">
        {/* Decorative background blobs */}
        <div className="pointer-events-none fixed inset-0 z-0">
          <div className="absolute top-[-10%] left-[-5%] w-[40vw] h-[40vw] rounded-full bg-amber-600/8 blur-[80px]"></div>
          <div className="absolute bottom-[-10%] right-[-5%] w-[35vw] h-[35vw] rounded-full bg-zinc-700/20 blur-[80px]"></div>
        </div>

        <div className="relative z-10 w-full max-w-2xl">
          <h1 className="text-5xl font-black text-amber-500 mb-6 drop-shadow-xl tracking-tighter text-center">
            CashBall <span className="text-zinc-100">26/27</span>
          </h1>

          <div className="bg-zinc-900/95 rounded-4xl border border-zinc-800 relative overflow-hidden shadow-2xl backdrop-blur-xl">
            <div className="absolute top-0 inset-x-0 h-1 bg-linear-to-r from-amber-600 via-amber-400 to-amber-600"></div>

            {authPhase === "login" && (
              <div className="p-8 space-y-5">
                <div className="space-y-2 text-center">
                  <p className="text-xs text-zinc-500 uppercase font-black tracking-[0.35em]">
                    Login
                  </p>
                  <h2 className="text-3xl font-black text-white tracking-tight">
                    Entra primeiro na tua conta
                  </h2>
                  <p className="text-sm text-zinc-400 font-medium">
                    Depois escolhes se queres novo jogo, continuar uma época ou
                    juntar-te a amigos.
                  </p>
                </div>
                <div>
                  <label className="block text-[10px] uppercase text-zinc-500 mb-2 font-bold">
                    O teu nome de Treinador
                  </label>
                  <input
                    type="text"
                    className="w-full bg-zinc-950 border border-zinc-800 p-4 rounded-xl text-white text-lg font-black outline-none transition-all placeholder:text-zinc-700 focus:ring-2 focus:ring-amber-500"
                    value={name}
                    placeholder="Ex: Amorim"
                    onChange={(e) => {
                      setName(e.target.value);
                      setAuthError("");
                    }}
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase text-zinc-500 mb-2 font-bold">
                    Palavra-passe
                  </label>
                  <input
                    type="password"
                    className="w-full bg-zinc-950 border border-zinc-800 p-4 rounded-xl text-white text-lg font-black outline-none transition-all placeholder:text-zinc-700 focus:ring-2 focus:ring-amber-500"
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
                  className="w-full bg-amber-500 hover:bg-amber-400 disabled:bg-zinc-800 disabled:text-zinc-600 text-zinc-950 py-5 rounded-xl font-black text-xl transition-all active:scale-95 border-b-4 border-amber-700 active:border-b-0"
                >
                  {authSubmitting ? "A VALIDAR CONTA..." : "ENTRAR"}
                </button>
                <button
                  onClick={handleAdminAuthenticate}
                  disabled={!name.trim() || !password || authSubmitting}
                  className="w-full border border-cyan-500/30 bg-cyan-500/10 hover:bg-cyan-500/20 disabled:bg-zinc-900 disabled:text-zinc-700 text-cyan-100 py-4 rounded-xl font-black text-sm uppercase tracking-[0.25em] transition-all"
                >
                  Entrar como Admin
                </button>
                <button
                  onClick={() => {
                    setConfirmPassword("");
                    setAuthError("");
                    setJoinError("");
                    setAuthPhase("register");
                  }}
                  className="w-full border border-zinc-700 bg-zinc-950 hover:border-zinc-500 text-zinc-100 py-4 rounded-xl font-black text-sm uppercase tracking-[0.25em] transition-all"
                >
                  Criar nova conta
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

            {authPhase === "register" && (
              <div className="p-8 space-y-5">
                <button
                  onClick={resetAuthFlow}
                  className="text-xs text-zinc-500 hover:text-zinc-300 font-black uppercase tracking-widest flex items-center gap-1"
                >
                  ← Voltar
                </button>
                <div className="space-y-2 text-center">
                  <p className="text-xs text-zinc-500 uppercase font-black tracking-[0.35em]">
                    Nova conta
                  </p>
                  <h2 className="text-3xl font-black text-white tracking-tight">
                    Cria a tua conta de treinador
                  </h2>
                </div>
                <div>
                  <label className="block text-[10px] uppercase text-zinc-500 mb-2 font-bold">
                    O teu nome de Treinador
                  </label>
                  <input
                    type="text"
                    className="w-full bg-zinc-950 border border-zinc-800 p-4 rounded-xl text-white text-lg font-black outline-none transition-all placeholder:text-zinc-700 focus:ring-2 focus:ring-amber-500"
                    value={name}
                    placeholder="Ex: Amorim"
                    onChange={(e) => {
                      setName(e.target.value);
                      setAuthError("");
                    }}
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase text-zinc-500 mb-2 font-bold">
                    Palavra-passe
                  </label>
                  <input
                    type="password"
                    className="w-full bg-zinc-950 border border-zinc-800 p-4 rounded-xl text-white text-lg font-black outline-none transition-all placeholder:text-zinc-700 focus:ring-2 focus:ring-amber-500"
                    value={password}
                    placeholder="••••••••"
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setAuthError("");
                    }}
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase text-zinc-500 mb-2 font-bold">
                    Confirmar Palavra-passe
                  </label>
                  <input
                    type="password"
                    className={`w-full bg-zinc-950 border p-4 rounded-xl text-white text-lg font-black outline-none transition-all placeholder:text-zinc-700 focus:ring-2 ${registerPasswordMismatch ? "border-red-500 focus:ring-red-500" : "border-zinc-800 focus:ring-amber-500"}`}
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
                  className="w-full bg-amber-500 hover:bg-amber-400 disabled:bg-zinc-800 disabled:text-zinc-600 text-zinc-950 py-5 rounded-xl font-black text-xl transition-all active:scale-95 border-b-4 border-amber-700 active:border-b-0"
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

            {authPhase === "mode" && (
              <div className="p-8 space-y-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs text-zinc-500 uppercase font-black tracking-[0.35em] mb-2">
                      Sessão autenticada
                    </p>
                    <h2 className="text-3xl font-black text-white tracking-tight">
                      Escolhe como queres jogar
                    </h2>
                    <p className="text-sm text-zinc-400 font-medium mt-2">
                      {name} já está autenticado. Agora escolhe a experiência.
                    </p>
                  </div>
                  <button
                    onClick={resetAuthFlow}
                    className="shrink-0 text-xs text-zinc-500 hover:text-zinc-300 font-black uppercase tracking-widest"
                  >
                    Trocar conta
                  </button>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <button
                    onClick={() => selectJoinMode("new-game")}
                    className={`rounded-3xl border p-5 text-left transition-all ${joinMode === "new-game" ? "border-amber-400 bg-amber-500/10 shadow-[0_0_0_1px_rgba(245,158,11,0.12)]" : "border-zinc-800 bg-zinc-950 hover:border-zinc-700"}`}
                  >
                    <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-300 text-xl">
                      ✦
                    </div>
                    <p className="text-[10px] uppercase tracking-[0.35em] text-amber-300 font-black mb-1">
                      Novo jogo
                    </p>
                    <p className="text-base font-black text-white">Novo jogo</p>
                    <p className="mt-2 text-xs text-zinc-400 leading-relaxed">
                      Começa do zero e recebe uma nova sala.
                    </p>
                  </button>

                  <button
                    onClick={() => selectJoinMode("saved-game")}
                    className={`rounded-3xl border p-5 text-left transition-all ${joinMode === "saved-game" ? "border-cyan-400 bg-cyan-500/10 shadow-[0_0_0_1px_rgba(34,211,238,0.12)]" : "border-zinc-800 bg-zinc-950 hover:border-zinc-700"}`}
                  >
                    <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-cyan-500/15 text-cyan-300 text-xl">
                      ⟲
                    </div>
                    <p className="text-[10px] uppercase tracking-[0.35em] text-cyan-300 font-black mb-1">
                      Save
                    </p>
                    <p className="text-base font-black text-white">
                      Continuar jogo
                    </p>
                    <p className="mt-2 text-xs text-zinc-400 leading-relaxed">
                      Reabre uma época guardada.
                    </p>
                  </button>

                  <button
                    onClick={() => selectJoinMode("friend-room")}
                    className={`rounded-3xl border p-5 text-left transition-all ${joinMode === "friend-room" ? "border-emerald-400 bg-emerald-500/10 shadow-[0_0_0_1px_rgba(16,185,129,0.12)]" : "border-zinc-800 bg-zinc-950 hover:border-zinc-700"}`}
                  >
                    <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-300 text-xl">
                      ↗
                    </div>
                    <p className="text-[10px] uppercase tracking-[0.35em] text-emerald-300 font-black mb-1">
                      Amigos
                    </p>
                    <p className="text-base font-black text-white">
                      Juntar a amigos
                    </p>
                    <p className="mt-2 text-xs text-zinc-400 leading-relaxed">
                      Junta-te a outra equipa com um código.
                    </p>
                  </button>
                </div>

                {joinMode === "new-game" && (
                  <div className="space-y-3 rounded-3xl border border-amber-500/30 bg-amber-500/8 p-5">
                    <label className="block text-[10px] uppercase text-amber-300 mb-2 font-bold tracking-[0.3em]">
                      Nome do novo jogo
                    </label>
                    <input
                      type="text"
                      className="w-full bg-zinc-950 border border-zinc-800 p-4 rounded-xl text-white text-lg font-black outline-none transition-all placeholder:text-zinc-700 focus:ring-2 focus:ring-amber-500 uppercase"
                      value={roomCode}
                      placeholder="INVERNO"
                      onChange={(e) =>
                        setRoomCode(e.target.value.toUpperCase())
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleJoin();
                      }}
                    />
                    <p className="text-sm font-bold text-amber-200/90">
                      Ficarás com um clube mágico da 4ª Divisão.
                    </p>
                  </div>
                )}

                {joinMode === "saved-game" && (
                  <div className="space-y-3 rounded-3xl border border-cyan-500/30 bg-cyan-500/8 p-5">
                    <label className="block text-[10px] uppercase text-cyan-300 mb-2 font-bold tracking-[0.3em]">
                      As tuas Salas Gravadas
                    </label>
                    <select
                      className="w-full bg-zinc-950 border border-zinc-800 p-4 rounded-xl text-white text-lg font-black outline-none focus:ring-2 focus:ring-cyan-500 uppercase"
                      value={roomCode}
                      onChange={(e) => setRoomCode(e.target.value)}
                    >
                      <option value="" disabled>
                        -- Seleciona um Save --
                      </option>
                      {availableSaves.map((save) => (
                        <option key={save} value={save}>
                          {save}
                        </option>
                      ))}
                    </select>
                    {availableSaves.length === 0 && (
                      <p className="text-zinc-500 text-sm mt-2">
                        Nenhum save encontrado para este treinador.
                      </p>
                    )}
                  </div>
                )}

                {joinMode === "friend-room" && (
                  <div className="space-y-3 rounded-3xl border border-emerald-500/30 bg-emerald-500/8 p-5">
                    <label className="block text-[10px] uppercase text-emerald-300 mb-2 font-bold tracking-[0.3em]">
                      Código da Sala do Amigo
                    </label>
                    <input
                      type="text"
                      className="w-full bg-zinc-950 border border-zinc-800 p-4 rounded-xl text-white text-lg font-black outline-none transition-all placeholder:text-zinc-700 focus:ring-2 focus:ring-emerald-500 uppercase"
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
                    className={`w-full disabled:bg-zinc-800 disabled:text-zinc-600 text-zinc-950 py-5 rounded-xl font-black text-xl transition-all active:scale-95 border-b-4 active:border-b-0 ${joinMode === "new-game" ? "bg-amber-500 hover:bg-amber-400 border-amber-700" : joinMode === "saved-game" ? "bg-cyan-500 hover:bg-cyan-400 border-cyan-700" : "bg-emerald-500 hover:bg-emerald-400 border-emerald-700"}`}
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
    );
  }

  const teamInfo = teams.find((t) => t.id == me.teamId);
  const myMatch = matchResults?.results.find(
    (r) => r.homeTeamId === me.teamId || r.awayTeamId === me.teamId,
  );
  const isDesktopLayout =
    typeof window !== "undefined" ? window.innerWidth >= 768 : false;
  const headerStyle =
    teamInfo?.color_primary || teamInfo?.color_secondary
      ? {
          background: teamInfo?.color_primary || "#18181b",
        }
      : undefined;

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
      const posOrder = { GK: 1, DEF: 2, MID: 3, ATK: 4 };
      const aPos = posOrder[a.position] || 5;
      const bPos = posOrder[b.position] || 5;
      if (aPos !== bPos) return aPos - bPos;
      return a.name.localeCompare(b.name);
    });

  const titulares = mySquad.filter((p) => tactic.positions[p.id] === "Titular");
  const isLineupComplete =
    titulares.filter((p) => p.position === "GK").length === 1 &&
    titulares.filter((p) => p.position !== "GK").length === 10;

  const nextMatchOpponent = nextMatchSummary?.opponent || null;
  const nextMatchReferee = nextMatchSummary?.referee || null;
  const refereeBalance = nextMatchReferee?.balance ?? 50;
  const refereePicksTeamA = refereeBalance >= 50;

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
  // Home games: 7 per season (half of 14 matchweeks, balanced schedule)
  const HOME_GAMES_PER_SEASON = 7;
  // Rough estimate of home games played so far (completedJornada / 2)
  const homeGamesPlayed = Math.round(completedJornada / 2);
  const homeGamesRemaining = Math.max(
    0,
    HOME_GAMES_PER_SEASON - homeGamesPlayed,
  );
  const matchweeksRemaining = Math.max(0, 14 - completedJornada);
  const capacityRevPerGame = (teamInfo?.stadium_capacity || 5000) * 10;
  const loanAmount = teamInfo?.loan_amount || 0;
  const loanInterestPerWeek = Math.round(loanAmount * 0.01);
  const currentBudget = teamInfo?.budget || 0;
  const projectedFinalBudget =
    currentBudget +
    capacityRevPerGame * homeGamesRemaining -
    totalWeeklyWage * matchweeksRemaining -
    loanInterestPerWeek * matchweeksRemaining;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans pb-12 tracking-tight">
      {/* Toast notifications */}
      <div className="fixed top-4 right-4 z-100 flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="bg-zinc-800 border border-zinc-700 text-white text-sm font-bold px-5 py-3 rounded-xl shadow-2xl animate-pulse"
          >
            {t.msg}
          </div>
        ))}
      </div>
      <header
        className="sticky top-0 border-b border-zinc-800 shadow-sm z-20"
        style={headerStyle}
      >
        <div className="relative overflow-hidden py-2 px-4 md:px-6 flex items-center justify-between">
          <div className="absolute inset-0 bg-zinc-950/28"></div>
          <div className="relative z-10 flex items-center gap-4">
            <h1
              className="text-xl md:text-3xl font-black tracking-tighter"
              style={{ color: teamInfo?.color_secondary || "#ffffff" }}
            >
              CashBall 26/27
            </h1>
            <p
              className="text-sm md:text-base font-bold uppercase"
              style={{ color: teamInfo?.color_secondary || "#ffffff" }}
            >
              | SALA: {me.roomCode} | {seasonYear} · Jornada {currentJornada}
            </p>
          </div>
          {activeTab === "live" && isPlayingMatch && (
            <div className="absolute z-10 left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2">
              <p
                className="text-2xl md:text-4xl font-black tracking-widest"
                style={{ color: teamInfo?.color_secondary || "#ffffff" }}
              >
                {Math.min(liveMinute, 120)}'
              </p>
            </div>
          )}
          <div className="relative z-10 flex items-center gap-4">
            {isDesktopLayout && (
              <div className="text-right">
                <p
                  className="font-bold text-sm md:text-base"
                  style={{ color: teamInfo?.color_secondary || "#ffffff" }}
                >
                  {me.name}
                </p>
                <p
                  className="text-sm md:text-base font-black tracking-widest"
                  style={{ color: teamInfo?.color_secondary || "#ffffff" }}
                >
                  {teamInfo?.name}
                </p>
              </div>
            )}
            {players.length > 0 && (
              <div className="hidden sm:flex flex-col items-end gap-0.5">
                <div className="flex items-center gap-1">
                  {players.map((p, i) => (
                    <div
                      key={i}
                      title={`${p.name} · ${teams.find((t) => t.id == p.teamId)?.name || "?"} · ${p.ready ? "Pronto" : "A aguardar"}`}
                      className={`w-2 h-2 rounded-full ${p.ready ? "bg-emerald-400" : "bg-zinc-600"}`}
                    />
                  ))}
                  <span
                    className="text-[10px] font-black uppercase tracking-widest ml-1 opacity-70"
                    style={{ color: teamInfo?.color_secondary || "#ffffff" }}
                  >
                    {players.filter((p) => p.ready).length}/{players.length}
                  </span>
                </div>
                {disconnected && (
                  <span className="text-red-400 text-[10px] font-black uppercase tracking-widest">
                    ⚠ Desligado
                  </span>
                )}
                {!disconnected && awaitingCoaches.length > 0 && (
                  <span className="text-amber-400 text-[10px] font-black uppercase tracking-widest">
                    ⏸ {awaitingCoaches.join(", ")}
                  </span>
                )}
              </div>
            )}
            <button
              onClick={handleLogout}
              title="Terminar sessão"
              className="text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors rounded-lg px-3 py-2 text-xs font-black uppercase tracking-widest border border-zinc-700 hover:border-zinc-500"
            >
              Sair do Jogo
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-350 mx-auto p-4 md:p-8">
        <div className="flex gap-3 mb-5 border-b border-zinc-800 pb-px overflow-x-auto justify-between">
          <div className="flex gap-3 overflow-x-auto">
            {["club", "finances", "standings", "market", "squad"].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2.5 font-bold text-sm md:text-base uppercase transition-colors border-b-4 whitespace-nowrap ${activeTab === tab ? "border-amber-500 text-white" : "border-transparent text-zinc-500 hover:text-zinc-300"}`}
              >
                {tab === "club"
                  ? "Clube"
                  : tab === "finances"
                    ? "Finanças"
                    : tab === "standings"
                      ? "Classificações"
                      : tab === "market"
                        ? "Mercado"
                        : "Plantel"}
              </button>
            ))}
          </div>
          <button
            onClick={() => setActiveTab("live")}
            className={`px-4 py-2.5 font-bold text-sm md:text-base uppercase transition-colors border-b-4 whitespace-nowrap ml-auto ${activeTab === "live" ? "border-amber-500 text-white" : "border-transparent text-zinc-500 hover:text-zinc-300"}`}
          >
            Live
          </button>
        </div>

        <div
          className={`grid grid-cols-1 gap-6 ${activeTab === "squad" ? "xl:grid-cols-[minmax(0,3fr)_320px]" : ""}`}
        >
          <div>
            {activeTab === "live" && (matchResults || matchAction) && (
              <div className="bg-zinc-900 min-h-150 text-zinc-100 font-sans p-6 rounded-3xl border border-zinc-800 shadow-sm relative overflow-hidden">
                {matchAction && (
                  <div className="absolute inset-0 z-50 bg-zinc-950/95 backdrop-blur-sm p-6 flex flex-col">
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
                        ? `Jogador lesionado: ${matchAction.injuredPlayer?.name || "?"}`
                        : "Escolhe o jogador para marcar o penalty"}
                    </p>
                    {matchAction.type === "injury" &&
                      injuryCountdown !== null && (
                        <p className="text-center text-amber-400 font-black text-sm mb-4 tracking-wide">
                          Auto-substituição em {injuryCountdown}s
                        </p>
                      )}

                    <div className="flex-1 overflow-y-auto bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4 mb-5">
                      <div className="space-y-2">
                        {(matchAction.type === "injury"
                          ? matchAction.benchPlayers || []
                          : matchAction.takerCandidates || []
                        ).map((player) => (
                          <button
                            key={player.id}
                            onClick={() => handleResolveMatchAction(player.id)}
                            className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-zinc-800 bg-zinc-950 hover:bg-zinc-800 transition-colors text-left"
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
                      className="w-full py-4 rounded-2xl text-lg font-black uppercase tracking-widest transition-all bg-amber-600 hover:bg-amber-500 text-zinc-950"
                    >
                      Escolha automática
                    </button>
                  </div>
                )}

                {/* BUG-11 FIX: showHalftimePanel (not liveMinute===45) controls this overlay */}
                {showHalftimePanel && !isPlayingMatch && (
                  <div className="absolute inset-0 bg-zinc-950 z-50 flex flex-col overflow-y-auto">
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800">
                      <span className="text-amber-500 font-black uppercase tracking-widest text-sm">
                        INTERVALO
                      </span>
                      <span className="text-zinc-500 text-xs font-bold">
                        Subs: {MAX_MATCH_SUBS - subsMade}/{MAX_MATCH_SUBS}
                      </span>
                    </div>

                    {/* Two-column player list */}
                    <div className="flex flex-1 divide-x divide-zinc-800 min-h-0">
                      {/* Em Campo */}
                      <div className="flex-1 flex flex-col min-w-0">
                        <p className="text-[10px] font-black uppercase tracking-widest text-emerald-500 px-3 py-1.5 border-b border-zinc-800">
                          Em Campo
                        </p>
                        {annotatedSquad
                          .filter(
                            (p) =>
                              tactic.positions[p.id] === "Titular" &&
                              !subbedOut.includes(p.id),
                          )
                          .map((p) => (
                            <div
                              key={p.id}
                              onClick={() =>
                                subsMade < MAX_MATCH_SUBS &&
                                handleSelectOut(p.id)
                              }
                              className={`flex items-center gap-2 px-3 py-1.5 border-b border-zinc-800/50 text-xs font-bold select-none transition-colors ${
                                swapSource === p.id
                                  ? "bg-red-500/15 text-red-200"
                                  : subsMade < MAX_MATCH_SUBS
                                    ? "cursor-pointer hover:bg-zinc-800/60"
                                    : "opacity-40 cursor-not-allowed"
                              }`}
                            >
                              <span
                                className={`w-4 shrink-0 font-black ${POSITION_TEXT_CLASS[p.position]}`}
                              >
                                {POSITION_SHORT_LABELS[p.position]}
                              </span>
                              <span className="flex-1 truncate">{p.name}</span>
                              <span className="text-zinc-500 shrink-0">
                                {p.skill}
                              </span>
                            </div>
                          ))}
                      </div>

                      {/* Banco */}
                      <div className="flex-1 flex flex-col min-w-0">
                        <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 px-3 py-1.5 border-b border-zinc-800">
                          Banco
                        </p>
                        {annotatedSquad
                          .filter((p) => tactic.positions[p.id] === "Suplente")
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
                                className={`flex items-center gap-2 px-3 py-1.5 border-b border-zinc-800/50 text-xs font-bold select-none transition-colors ${
                                  alreadyUsed
                                    ? "opacity-25 cursor-not-allowed"
                                    : swapTarget === p.id
                                      ? "bg-emerald-500/15 text-emerald-200 cursor-pointer"
                                      : disabled
                                        ? "opacity-40 cursor-not-allowed"
                                        : "cursor-pointer hover:bg-zinc-800/60"
                                }`}
                              >
                                <span
                                  className={`w-4 shrink-0 font-black ${alreadyUsed ? "text-zinc-600" : POSITION_TEXT_CLASS[p.position]}`}
                                >
                                  {POSITION_SHORT_LABELS[p.position]}
                                </span>
                                <span className="flex-1 truncate">
                                  {p.name}
                                </span>
                                <span
                                  className={`shrink-0 ${alreadyUsed ? "text-zinc-700" : "text-zinc-500"}`}
                                >
                                  {alreadyUsed ? "SAIU" : p.skill}
                                </span>
                              </div>
                            );
                          })}
                      </div>
                    </div>

                    {/* Inline action bar */}
                    {swapSource && (
                      <div className="flex items-center gap-2 px-3 py-2 border-t border-zinc-800 bg-zinc-900">
                        <span className="flex-1 text-xs font-bold truncate">
                          <span className="text-red-400">
                            {annotatedSquad.find((p) => p.id === swapSource)
                              ?.name ?? "?"}
                          </span>
                          <span className="text-zinc-600 mx-1">→</span>
                          {swapTarget ? (
                            <span className="text-emerald-400">
                              {annotatedSquad.find((p) => p.id === swapTarget)
                                ?.name ?? "?"}
                            </span>
                          ) : (
                            <span className="text-zinc-600">
                              escolhe do banco
                            </span>
                          )}
                        </span>
                        <button
                          onClick={handleResetSub}
                          className="px-2 py-1 text-[10px] font-black text-zinc-500 hover:text-zinc-300 transition-colors"
                        >
                          ✕
                        </button>
                        <button
                          onClick={handleConfirmSub}
                          disabled={!swapTarget}
                          className={`px-3 py-1 rounded text-[10px] font-black uppercase transition-colors ${
                            swapTarget
                              ? "bg-emerald-600 hover:bg-emerald-500 text-white"
                              : "bg-zinc-800 text-zinc-600 cursor-not-allowed"
                          }`}
                        >
                          Substituir
                        </button>
                      </div>
                    )}

                    {/* Confirmed subs */}
                    {confirmedSubs.length > 0 && (
                      <div className="px-3 py-1.5 border-t border-zinc-800 flex flex-col gap-0.5">
                        {confirmedSubs.map((sub, i) => {
                          const outP = mySquad.find((p) => p.id === sub.out);
                          const inP = mySquad.find((p) => p.id === sub.in);
                          return (
                            <p
                              key={i}
                              className="text-[10px] font-bold text-zinc-500"
                            >
                              🔄{" "}
                              <span className="text-red-400">
                                {outP?.name ?? "?"}
                              </span>
                              <span className="text-zinc-600"> → </span>
                              <span className="text-emerald-400">
                                {inP?.name ?? "?"}
                              </span>
                            </p>
                          );
                        })}
                      </div>
                    )}

                    {/* BUG-06 FIX: Use handleHalftimeReady which always sends true */}
                    <button
                      onClick={handleHalftimeReady}
                      className={`w-full py-3 text-sm font-black uppercase tracking-widest transition-all ${
                        players.find((p) => p.name === me.name)?.ready
                          ? "bg-zinc-800 text-zinc-500"
                          : isCupMatch
                            ? "bg-amber-500 hover:bg-amber-400 text-zinc-950"
                            : "bg-amber-600 hover:bg-amber-500 text-zinc-950"
                      }`}
                    >
                      {players.find((p) => p.name === me.name)?.ready
                        ? "A AGUARDAR..."
                        : isCupMatch
                          ? "▶ 2ª PARTE — TAÇA"
                          : "▶ INICIAR 2ª PARTE"}
                    </button>
                  </div>
                )}

                <div className="absolute top-6 right-6 flex items-center gap-3">
                  {isPlayingMatch && (
                    <div className="w-4 h-4 rounded-full bg-red-600 animate-pulse"></div>
                  )}
                </div>
                <h2 className="text-2xl font-black text-amber-500 mb-8 pb-4 border-b border-zinc-800">
                  {isCupMatch ? (
                    <>
                      🏆 Taça · {cupMatchRoundName}
                      {cupExtraTimeBadge ? " — Prolongamento" : ""}
                    </>
                  ) : (
                    <>
                      Jornada em Direto{" "}
                      {liveMinute === 45 && !isPlayingMatch
                        ? "(INTERVALO)"
                        : ""}
                    </>
                  )}
                </h2>

                <div
                  className={
                    isCupMatch
                      ? "flex flex-col gap-2"
                      : "grid grid-cols-1 lg:grid-cols-2 gap-6"
                  }
                >
                  {(isCupMatch ? [null] : [1, 2, 3, 4]).map((div) => (
                    <div key={div ?? "cup"}>
                      {!isCupMatch && (
                        <h3 className="text-zinc-500 font-black uppercase text-xs mb-2 border-b border-zinc-800/50">
                          {DIVISION_NAMES[div] || `Div ${div}`}
                        </h3>
                      )}
                      <div className="space-y-1">
                        {matchResults.results
                          .filter(
                            (m) =>
                              isCupMatch ||
                              teams.find((t) => t.id === m.homeTeamId)
                                ?.division === div,
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
                            const lastEventText = getMatchLastEventText(
                              matchEvents,
                              liveMinute,
                            );

                            const isMyMatch =
                              match.homeTeamId === me.teamId ||
                              match.awayTeamId === me.teamId;

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
                                className={`text-base bg-zinc-950 rounded border ${isMyMatch ? "border-amber-500 bg-amber-500/10 ring-1 ring-amber-500" : "border-zinc-800"}`}
                              >
                                {/* Line 1: teams + score */}
                                <div className="flex items-center">
                                  <div
                                    style={{
                                      backgroundColor: hInfo?.color_primary,
                                      color: hInfo?.color_secondary,
                                    }}
                                    className="flex-1 uppercase truncate font-black text-right px-2 py-1 rounded-tl text-sm"
                                  >
                                    {hInfo?.name}
                                  </div>
                                  <button
                                    onClick={() => {
                                      setMatchDetailFixture(match);
                                      setShowMatchDetail(true);
                                    }}
                                    title="Ver detalhes da partida"
                                    className="px-2.5 py-0.5 bg-zinc-900 hover:bg-zinc-800 text-white text-center font-normal min-w-16 flex gap-0.5 items-center justify-center text-lg leading-none transition-colors cursor-pointer group"
                                  >
                                    <span
                                      style={{
                                        color: homeFlashing
                                          ? "#ff4444"
                                          : "white",
                                        fontWeight: homeFlashing
                                          ? "900"
                                          : "normal",
                                        transition: homeFlashing
                                          ? "none"
                                          : "color 1.25s ease, font-weight 1.25s ease",
                                      }}
                                    >
                                      {currentHome.length}
                                    </span>
                                    <span className="mx-0.5">-</span>
                                    <span
                                      style={{
                                        color: awayFlashing
                                          ? "#ff4444"
                                          : "white",
                                        fontWeight: awayFlashing
                                          ? "900"
                                          : "normal",
                                        transition: awayFlashing
                                          ? "none"
                                          : "color 1.25s ease, font-weight 1.25s ease",
                                      }}
                                    >
                                      {currentAway.length}
                                    </span>
                                  </button>
                                  <div
                                    style={{
                                      backgroundColor: aInfo?.color_primary,
                                      color: aInfo?.color_secondary,
                                    }}
                                    className="flex-1 uppercase truncate font-black text-left px-2 py-1 rounded-tr text-sm"
                                  >
                                    {aInfo?.name}
                                  </div>
                                </div>
                                {/* Line 2: attendance + last event */}
                                <div className="px-2 py-0.5 text-zinc-400 truncate text-center border-t border-zinc-800/60 min-h-5 text-xs">
                                  {match.attendance
                                    ? `Lotação: ${match.attendance.toLocaleString("pt-PT")}${lastEventText ? "  |  " + lastEventText : ""}`
                                    : lastEventText}
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Taça de Portugal last results */}
                {cupRoundResults && (
                  <div className="mt-6 bg-zinc-900/60 border border-amber-800/30 rounded-2xl overflow-hidden">
                    <div className="bg-amber-900/20 px-4 py-2 border-b border-amber-800/30 flex items-center justify-between">
                      <h3 className="font-black text-amber-400 uppercase text-xs tracking-widest">
                        🏆 Taça de Portugal — {cupRoundResults.roundName}
                      </h3>
                      <button
                        onClick={() => setShowCupResults(true)}
                        className="text-xs text-amber-400 font-bold hover:text-amber-300 underline"
                      >
                        Ver detalhes
                      </button>
                    </div>
                    <div className="p-3 space-y-1">
                      {(cupRoundResults.results || []).map((r, idx) => {
                        const hInfo = teams.find((t) => t.id === r.homeTeamId);
                        const aInfo = teams.find((t) => t.id === r.awayTeamId);
                        const isMyMatch =
                          r.homeTeamId === me.teamId ||
                          r.awayTeamId === me.teamId;
                        const winnerInfo = teams.find(
                          (t) => t.id === r.winnerId,
                        );
                        return (
                          <div
                            key={idx}
                            className={`flex items-center gap-2 text-[11px] font-bold rounded border px-2 py-1 ${isMyMatch ? "border-amber-500 bg-amber-500/10" : "border-zinc-800 bg-zinc-950"}`}
                          >
                            <span
                              className="w-28 md:w-36 truncate text-right font-black"
                              style={{ color: hInfo?.color_primary || "#fff" }}
                            >
                              {hInfo?.name || r.homeTeamId}
                            </span>
                            <span className="px-2 py-0.5 bg-zinc-900 border border-zinc-800 rounded font-black text-white min-w-12 text-center">
                              {r.homeGoals} - {r.awayGoals}
                            </span>
                            <span
                              className="w-28 md:w-36 truncate text-left font-black"
                              style={{ color: aInfo?.color_primary || "#fff" }}
                            >
                              {aInfo?.name || r.awayTeamId}
                            </span>
                            {winnerInfo && (
                              <span className="ml-auto text-amber-400 text-[10px] font-black shrink-0">
                                ✓ {winnerInfo.name}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === "standings" && (
              <div className="bg-zinc-900 text-zinc-100 font-sans p-4 rounded-xl border border-zinc-800 shadow-sm relative overflow-hidden">
                <h2 className="text-xl font-black text-amber-500 mb-4 pb-2 border-b border-zinc-800">
                  Classificação Geral (Jornada {completedJornada})
                </h2>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-4">
                  {[1, 2, 3, 4].map((div) => (
                    <div key={div}>
                      <h3 className="text-zinc-500 font-black uppercase text-sm mb-4">
                        {DIVISION_NAMES[div] || `Div ${div}`}
                      </h3>
                      <div className="bg-zinc-950 border border-zinc-800 rounded-lg overflow-hidden">
                        <table className="w-full text-[12px] font-bold text-right border-collapse">
                          <thead className="bg-zinc-900 text-zinc-400 border-b border-zinc-800">
                            <tr>
                              <th className="text-left py-1 px-2">Equipa</th>
                              <th className="py-1 px-1 w-6 text-center">J</th>
                              <th className="py-1 px-1 w-6 text-center">V</th>
                              <th className="py-1 px-1 w-6 text-center">E</th>
                              <th className="py-1 px-1 w-6 text-center">D</th>
                              <th className="py-1 px-2 w-12 text-center">G</th>
                              <th className="py-1 px-2 w-8 text-center text-amber-500">
                                Pts
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-black/20">
                            {teams
                              .filter((t) => t.division === div)
                              .sort(
                                (a, b) =>
                                  (b.points || 0) - (a.points || 0) ||
                                  (b.goals_for || 0) -
                                    (b.goals_against || 0) -
                                    ((a.goals_for || 0) -
                                      (a.goals_against || 0)),
                              )
                              .map((t, idx) => {
                                const isMe = t.id == me.teamId;
                                return (
                                  <tr
                                    key={t.id}
                                    onClick={() => handleOpenTeamSquad(t)}
                                    style={{
                                      backgroundColor:
                                        t.color_primary || "#18181b",
                                      color: t.color_secondary || "#ffffff",
                                    }}
                                    className={`transition-colors cursor-pointer hover:brightness-110 ${isMe ? "ring-2 ring-inset ring-amber-500" : ""}`}
                                  >
                                    <td className="text-left uppercase py-0.75 px-2 truncate font-black w-[45%]">
                                      {idx + 1}. {t.name}
                                    </td>
                                    <td className="w-6 text-center py-0.75 px-1 opacity-80">
                                      {(t.wins || 0) +
                                        (t.draws || 0) +
                                        (t.losses || 0)}
                                    </td>
                                    <td className="w-6 text-center py-0.75 px-1 opacity-80">
                                      {t.wins || 0}
                                    </td>
                                    <td className="w-6 text-center py-0.75 px-1 opacity-80">
                                      {t.draws || 0}
                                    </td>
                                    <td className="w-6 text-center py-0.75 px-1 opacity-80">
                                      {t.losses || 0}
                                    </td>
                                    <td className="w-12 text-center py-0.75 px-2 tracking-widest opacity-80">
                                      {t.goals_for || 0}:{t.goals_against || 0}
                                    </td>
                                    <td className="w-8 text-center py-0.75 px-2 font-black">
                                      {t.points || 0}
                                    </td>
                                  </tr>
                                );
                              })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === "club" && (
              <div className="space-y-6">
                {/* Club identity card */}
                <div
                  className="rounded-3xl border border-zinc-800 shadow-sm p-6 relative overflow-hidden"
                  style={{
                    background: teamInfo?.color_primary
                      ? `${teamInfo.color_primary}22`
                      : undefined,
                    borderColor: teamInfo?.color_primary || undefined,
                  }}
                >
                  <div className="flex flex-col md:flex-row md:items-center gap-4">
                    <div
                      className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl font-black shrink-0"
                      style={{
                        background: teamInfo?.color_primary || "#18181b",
                        color: teamInfo?.color_secondary || "#fff",
                      }}
                    >
                      {teamInfo?.name?.[0] || "?"}
                    </div>
                    <div className="flex-1">
                      <h1
                        className="text-2xl font-black tracking-tight"
                        style={{ color: teamInfo?.color_primary || "#fff" }}
                      >
                        {teamInfo?.name || "—"}
                      </h1>
                      <p className="text-zinc-400 text-sm font-bold mt-0.5">
                        {DIVISION_NAMES[teamInfo?.division] ||
                          `Divisão ${teamInfo?.division}`}{" "}
                        · Época {seasonYear}/{seasonYear + 1}
                      </p>
                      <p className="text-zinc-500 text-xs mt-1">
                        Manager:{" "}
                        <strong className="text-zinc-300">{me?.name}</strong>
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="text-zinc-500 text-[10px] font-black uppercase tracking-widest">
                        Moral
                      </span>
                      <div className="flex items-center gap-2">
                        <div className="w-28 h-2 bg-zinc-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${(teamInfo?.morale || 75) >= 70 ? "bg-emerald-500" : (teamInfo?.morale || 75) >= 40 ? "bg-amber-500" : "bg-red-500"}`}
                            style={{ width: `${teamInfo?.morale || 75}%` }}
                          />
                        </div>
                        <span
                          className={`font-black text-sm ${(teamInfo?.morale || 75) >= 70 ? "text-emerald-400" : (teamInfo?.morale || 75) >= 40 ? "text-amber-400" : "text-red-400"}`}
                        >
                          {teamInfo?.morale || 75}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Own team trophies */}
                <div className="bg-zinc-900 rounded-3xl border border-zinc-800 shadow-sm p-6">
                  <h2 className="text-xs text-amber-400 font-black uppercase tracking-widest mb-4 flex items-center gap-2">
                    🏆 Palmarés de {teamInfo?.name}
                  </h2>
                  {palmaresTeamId === me?.teamId &&
                  palmares.trophies?.length > 0 ? (
                    <div className="flex flex-wrap gap-3">
                      {palmares.trophies.map((trophy, idx) => (
                        <div
                          key={idx}
                          className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-900/20 border border-amber-700/40"
                        >
                          <span className="text-2xl">🏆</span>
                          <div>
                            <p className="text-amber-300 font-black text-sm">
                              {trophy.achievement}
                            </p>
                            <p className="text-zinc-500 text-xs font-bold">
                              {trophy.season}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-zinc-500 font-bold text-sm">
                      Ainda sem títulos conquistados.
                    </p>
                  )}
                </div>

                {/* All-time champions by season */}
                {palmares.allChampions?.length > 0 && (
                  <div className="bg-zinc-900 rounded-3xl border border-zinc-800 shadow-sm p-6">
                    <h2 className="text-xs text-zinc-400 font-black uppercase tracking-widest mb-4">
                      Palco de Honra — Todos os Campeões
                    </h2>
                    <div className="space-y-3">
                      {(() => {
                        const bySeasons = {};
                        palmares.allChampions.forEach((c) => {
                          if (!bySeasons[c.season]) bySeasons[c.season] = [];
                          bySeasons[c.season].push(c);
                        });
                        return Object.keys(bySeasons)
                          .sort((a, b) => Number(a) - Number(b))
                          .map((season) => (
                            <div
                              key={season}
                              className="bg-zinc-950 border border-zinc-800 rounded-xl px-5 py-3"
                            >
                              <p className="text-xs text-zinc-500 font-black uppercase tracking-widest mb-2">
                                {season}
                              </p>
                              <div className="flex flex-wrap gap-2">
                                {bySeasons[season].map((c, i) => (
                                  <span
                                    key={i}
                                    className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-black bg-zinc-800 border border-zinc-700"
                                  >
                                    <span
                                      className={
                                        c.achievement === "Campeão Nacional" ||
                                        c.achievement ===
                                          "Vencedor da Taça de Portugal"
                                          ? "text-amber-400"
                                          : "text-white"
                                      }
                                    >
                                      {c.team_name}
                                    </span>
                                    <span className="text-zinc-400">
                                      — {c.achievement}
                                    </span>
                                  </span>
                                ))}
                              </div>
                            </div>
                          ));
                      })()}
                    </div>
                  </div>
                )}

                {/* Finances section */}
                <div className="bg-zinc-900 p-6 rounded-3xl border border-zinc-800 shadow-sm">
                  <h2 className="text-xs text-zinc-400 font-black uppercase tracking-widest mb-4">
                    Estádio
                  </h2>
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-400 font-bold text-sm">
                        Capacidade
                      </span>
                      <span className="font-mono text-white font-black text-lg">
                        🏟️{" "}
                        {(teamInfo?.stadium_capacity || 5000).toLocaleString(
                          "pt-PT",
                        )}{" "}
                        lugares
                      </span>
                    </div>
                    <div className="flex items-center justify-between border-t border-zinc-800 pt-3">
                      <span className="text-zinc-400 font-bold text-sm">
                        Receita Máx./Jogo em Casa
                      </span>
                      <span className="font-mono text-emerald-400 font-bold text-sm">
                        {formatCurrency(capacityRevPerGame)}
                      </span>
                    </div>
                    <p className="text-zinc-500 text-xs mt-1">
                      Para expandir estádio ou gerir empréstimos, vê o separador{" "}
                      <strong className="text-amber-400">Finanças</strong>.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "finances" && (
              <div className="space-y-6">
                {/* ── KPI CARDS ─────────────────────────────────────────────────── */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* Saldo Actual */}
                  <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-5 flex flex-col gap-1">
                    <span className="text-zinc-500 font-black uppercase text-[10px] tracking-widest">
                      Saldo Actual
                    </span>
                    <span
                      className={`font-mono text-xl font-black ${currentBudget >= 0 ? "text-white" : "text-red-400"}`}
                    >
                      {formatCurrency(currentBudget)}
                    </span>
                    <span className="text-zinc-600 text-[10px]">
                      época {seasonYear}/{seasonYear + 1}
                    </span>
                  </div>
                  {/* Progresso do Ano Fiscal */}
                  <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-5 flex flex-col gap-2">
                    <span className="text-zinc-500 font-black uppercase text-[10px] tracking-widest">
                      Ano Fiscal
                    </span>
                    <span className="text-white font-black text-xl">
                      {completedJornada}{" "}
                      <span className="text-zinc-500 font-normal text-sm">
                        / 14 jornadas
                      </span>
                    </span>
                    <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-amber-500 rounded-full transition-all"
                        style={{ width: `${(completedJornada / 14) * 100}%` }}
                      />
                    </div>
                  </div>
                  {/* Receita por Jogo */}
                  <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-5 flex flex-col gap-1">
                    <span className="text-zinc-500 font-black uppercase text-[10px] tracking-widest">
                      Bilheteiras/Jogo em Casa
                    </span>
                    <span className="font-mono text-emerald-400 text-xl font-black">
                      +{formatCurrency(capacityRevPerGame)}
                    </span>
                    <span className="text-zinc-600 text-[10px]">
                      {(teamInfo?.stadium_capacity || 5000).toLocaleString(
                        "pt-PT",
                      )}{" "}
                      lugares × 10€
                    </span>
                  </div>
                  {/* Balanço Final Projetado */}
                  <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-5 flex flex-col gap-1">
                    <span className="text-zinc-500 font-black uppercase text-[10px] tracking-widest">
                      Balanço Proj. Final
                    </span>
                    <span
                      className={`font-mono text-xl font-black ${projectedFinalBudget >= currentBudget ? "text-emerald-400" : "text-red-400"}`}
                    >
                      {formatCurrency(projectedFinalBudget)}
                    </span>
                    <span className="text-zinc-600 text-[10px]">
                      {matchweeksRemaining} jornadas restantes
                    </span>
                  </div>
                </div>

                {/* ── RECEITAS ──────────────────────────────────────────────────── */}
                <div className="bg-zinc-900 rounded-3xl border border-zinc-800 shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-zinc-800 flex items-center gap-3">
                    <span className="text-lg">💰</span>
                    <h2 className="text-xs font-black uppercase tracking-widest text-emerald-400">
                      Receitas
                    </h2>
                  </div>
                  <div className="p-6 space-y-5">
                    {/* Bilheteiras */}
                    <div>
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="text-white font-bold text-sm">
                            Bilheteiras
                          </p>
                          <p className="text-zinc-500 text-xs">
                            10€/lugar × lotação — jornadas em casa
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-emerald-400 font-mono font-black text-base">
                            {formatCurrency(capacityRevPerGame)}
                            <span className="text-zinc-500 text-xs font-normal">
                              {" "}
                              /jogo
                            </span>
                          </p>
                        </div>
                      </div>
                      {/* Home-games progress bar */}
                      <div className="flex items-center gap-2 mt-3">
                        <span className="text-zinc-600 text-[10px] w-20 shrink-0">
                          Em casa
                        </span>
                        <div className="flex-1 flex gap-0.5">
                          {Array.from({ length: HOME_GAMES_PER_SEASON }).map(
                            (_, i) => (
                              <div
                                key={i}
                                className={`flex-1 h-2 rounded-sm ${i < homeGamesPlayed ? "bg-emerald-500" : i === homeGamesPlayed ? "bg-emerald-800 animate-pulse" : "bg-zinc-800"}`}
                              />
                            ),
                          )}
                        </div>
                        <span className="text-zinc-500 text-[10px] w-10 text-right">
                          {homeGamesPlayed}/{HOME_GAMES_PER_SEASON}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── DESPESAS ──────────────────────────────────────────────────── */}
                <div className="bg-zinc-900 rounded-3xl border border-zinc-800 shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-zinc-800 flex items-center gap-3">
                    <span className="text-lg">📤</span>
                    <h2 className="text-xs font-black uppercase tracking-widest text-red-400">
                      Despesas
                    </h2>
                  </div>
                  <div className="p-6 space-y-5">
                    {/* Folha Salarial */}
                    <div>
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-white font-bold text-sm">
                            Folha Salarial
                          </p>
                          <p className="text-zinc-500 text-xs">
                            Pago por jornada · {mySquad.length} atletas
                          </p>
                        </div>
                        <p className="text-red-400 font-mono font-black text-base">
                          -{formatCurrency(totalWeeklyWage)}
                          <span className="text-zinc-500 text-xs font-normal">
                            {" "}
                            /jornada
                          </span>
                        </p>
                      </div>
                    </div>

                    {/* Juros Bancários — só mostra se houver dívida */}
                    {loanAmount > 0 && (
                      <div className="border-t border-zinc-800 pt-4">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="text-white font-bold text-sm">
                              Juros Bancários
                            </p>
                            <p className="text-zinc-500 text-xs">
                              1% da dívida por jornada
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-red-400 font-mono font-black text-base">
                              -{formatCurrency(loanInterestPerWeek)}
                              <span className="text-zinc-500 text-xs font-normal">
                                {" "}
                                /jornada
                              </span>
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* ── DÍVIDA BANCÁRIA ───────────────────────────────────────────── */}
                <div className="bg-zinc-900 rounded-3xl border border-zinc-800 shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-zinc-800 flex items-center gap-3">
                    <span className="text-lg">🏦</span>
                    <h2 className="text-xs font-black uppercase tracking-widest text-orange-400">
                      Empréstimos
                    </h2>
                  </div>
                  <div className="p-6 space-y-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-white font-bold">Dívida Actual</p>
                        <p className="text-zinc-500 text-xs">
                          Taxa de juro: 1% / jornada
                        </p>
                      </div>
                      <p
                        className={`font-mono text-xl font-black ${loanAmount > 0 ? "text-red-400" : "text-emerald-400"}`}
                      >
                        {formatCurrency(loanAmount)}
                      </p>
                    </div>
                    {/* Debt gauge */}
                    <div>
                      <div className="flex justify-between text-[10px] text-zinc-600 mb-1 font-bold">
                        <span>0€</span>
                        <span>Máximo: 2.000.000€</span>
                      </div>
                      <div className="w-full h-3 bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${loanAmount / 2000000 > 0.75 ? "bg-red-500" : loanAmount / 2000000 > 0.4 ? "bg-orange-500" : "bg-amber-400"}`}
                          style={{
                            width: `${Math.min(100, (loanAmount / 2000000) * 100)}%`,
                          }}
                        />
                      </div>
                      <p className="text-zinc-600 text-[10px] text-right mt-1">
                        {((loanAmount / 2000000) * 100).toFixed(0)}% do limite
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-2">
                      <div className="bg-zinc-950 p-4 rounded-xl border border-red-900/30 flex flex-col gap-2">
                        <p className="text-xs font-black text-red-400 uppercase tracking-widest">
                          Pedir Empréstimo
                        </p>
                        <p className="text-zinc-500 text-[10px]">
                          +500.000€ → {formatCurrency(loanAmount + 500000)}{" "}
                          dívida
                        </p>
                        <button
                          onClick={() => socket.emit("takeLoan")}
                          disabled={loanAmount >= 2000000}
                          className="w-full bg-red-900 hover:bg-red-800 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black py-2.5 rounded-lg text-xs transition-all uppercase"
                        >
                          Pedir +500K
                        </button>
                      </div>
                      <div className="bg-zinc-950 p-4 rounded-xl border border-emerald-900/30 flex flex-col gap-2">
                        <p className="text-xs font-black text-emerald-400 uppercase tracking-widest">
                          Pagar Dívida
                        </p>
                        <p className="text-zinc-500 text-[10px]">
                          -500.000€ →{" "}
                          {formatCurrency(Math.max(0, loanAmount - 500000))}{" "}
                          dívida
                        </p>
                        <button
                          onClick={() => socket.emit("payLoan")}
                          disabled={
                            loanAmount < 500000 || currentBudget < 500000
                          }
                          className="w-full bg-emerald-900 hover:bg-emerald-800 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black py-2.5 rounded-lg text-xs transition-all uppercase"
                        >
                          Pagar -500K
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── ESTÁDIO ───────────────────────────────────────────────────── */}
                <div className="bg-zinc-900 rounded-3xl border border-zinc-800 shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-zinc-800 flex items-center gap-3">
                    <span className="text-lg">🏟️</span>
                    <h2 className="text-xs font-black uppercase tracking-widest text-amber-400">
                      Estádio
                    </h2>
                  </div>
                  <div className="p-6 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-zinc-950 rounded-xl border border-zinc-800 p-4 flex flex-col gap-1">
                        <span className="text-zinc-500 text-[10px] font-black uppercase tracking-wider">
                          Capacidade Actual
                        </span>
                        <span className="text-white font-black text-2xl">
                          {(teamInfo?.stadium_capacity || 5000).toLocaleString(
                            "pt-PT",
                          )}
                        </span>
                        <span className="text-zinc-600 text-[10px]">
                          lugares
                        </span>
                      </div>
                      <div className="bg-zinc-950 rounded-xl border border-zinc-800 p-4 flex flex-col gap-1">
                        <span className="text-zinc-500 text-[10px] font-black uppercase tracking-wider">
                          Receita/Jogo em Casa
                        </span>
                        <span className="text-emerald-400 font-mono font-black text-xl">
                          {formatCurrency(capacityRevPerGame)}
                        </span>
                        <span className="text-zinc-600 text-[10px]">
                          10€ × lotação (máx.)
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={() => socket.emit("buildStadium")}
                      disabled={currentBudget < 150000}
                      className="w-full bg-amber-600 hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed text-zinc-950 font-black py-3 rounded-xl text-sm transition-all uppercase tracking-wide"
                    >
                      Expandir Estádio — 150.000€
                    </button>
                    {currentBudget < 150000 && (
                      <p className="text-zinc-600 text-xs text-center">
                        Saldo insuficiente. Precisa de mais{" "}
                        {formatCurrency(150000 - currentBudget)}.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeTab === "squad" && (
              <div className="space-y-6">
                <div className="bg-zinc-900 rounded-3xl border border-zinc-800 shadow-sm overflow-visible">
                  <table className="w-full text-left text-sm font-normal">
                    <thead>
                      <tr className="bg-zinc-950/50 text-zinc-400 uppercase text-[11px] tracking-widest border-b border-zinc-800 font-normal">
                        <th className="px-3 py-3 text-center w-10 font-normal">
                          ☑️
                        </th>
                        <th className="px-3 py-3 text-center w-12 font-normal">
                          POS
                        </th>
                        <th className="px-3 py-3 font-normal">NOME</th>
                        <th className="px-3 py-3 text-center w-14 font-normal">
                          QUAL
                        </th>
                        <th className="px-3 py-3 text-center w-12 font-normal">
                          ⚽
                        </th>
                        <th className="px-3 py-3 text-center w-12 font-normal">
                          🟥
                        </th>
                        <th className="px-3 py-3 text-center w-12 font-normal">
                          🩹
                        </th>
                        <th className="px-3 py-3 text-center w-12 font-normal">
                          NAC
                        </th>
                        <th className="px-3 py-3 text-center w-24 font-normal">
                          ORDENADO
                        </th>
                        <th className="px-3 py-3 text-center w-24 font-normal">
                          AÇÕES
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/50 font-normal">
                      {annotatedSquad.map((player) => (
                        <tr
                          key={player.id}
                          className={`transition-colors group select-none ${ENABLE_ROW_BG ? POSITION_BG_CLASS[player.position] : ""} hover:bg-zinc-800/50 ${player.isUnavailable ? "opacity-50" : ""}`}
                        >
                          <td
                            className="px-3 py-2 text-center text-lg leading-none relative"
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenStatusPickerId((prev) =>
                                prev === player.id ? null : player.id,
                              );
                            }}
                          >
                            <span
                              className={`cursor-pointer inline-flex items-center justify-center rounded-full ${player.status === "Titular" ? "bg-emerald-500/15" : player.status === "Suplente" ? "bg-amber-500/15" : "bg-zinc-900/80"}`}
                            >
                              {player.status === "Titular"
                                ? "✅"
                                : player.status === "Suplente"
                                  ? "🟡"
                                  : "□"}
                            </span>
                            {openStatusPickerId === player.id &&
                              (() => {
                                const subCount = Object.entries(
                                  tactic.positions,
                                ).filter(
                                  ([id, s]) =>
                                    s === "Suplente" &&
                                    Number(id) !== player.id,
                                ).length;
                                const subsFull = subCount >= 5;
                                return (
                                  <div
                                    className="absolute left-0 top-full z-30 bg-zinc-800 border border-zinc-700 rounded-xl shadow-xl p-1 flex flex-col gap-0.5 min-w-32"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {[
                                      ["Titular", "✅"],
                                      ["Suplente", "🟡"],
                                      ["Excluído", "□"],
                                    ].map(([status, emoji]) => {
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
                                          className={`px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-2 text-left ${
                                            disabled
                                              ? "opacity-40 cursor-not-allowed text-zinc-500"
                                              : player.status === status
                                                ? "bg-zinc-700 text-white"
                                                : "hover:bg-zinc-700 text-zinc-300"
                                          }`}
                                        >
                                          {emoji} {status}
                                        </button>
                                      );
                                    })}
                                  </div>
                                );
                              })()}
                          </td>
                          <td
                            className={`px-3 py-2 text-center text-sm tracking-wider ${POSITION_TEXT_CLASS[player.position] || "text-zinc-300"}`}
                          >
                            {POSITION_SHORT_LABELS[player.position] ||
                              player.position}
                          </td>
                          <td className="px-3 py-2 text-white text-sm md:text-base whitespace-nowrap">
                            {player.name}
                            {!!player.is_star &&
                              (player.position === "MID" ||
                                player.position === "ATK") && (
                                <span
                                  className="ml-1 text-amber-400 font-black"
                                  title="Craque"
                                >
                                  *
                                </span>
                              )}
                            {player.isUnavailable && (
                              <span
                                className="ml-2 text-xs font-bold text-red-400"
                                title={`Indisponível até jornada ${player.injury_until_matchweek || player.suspension_until_matchweek}`}
                              >
                                🩹
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-center text-zinc-100 font-normal">
                            <span className="inline-flex items-center justify-center bg-zinc-950 text-white px-2 py-1 rounded text-sm border border-zinc-800 font-normal">
                              {player.skill}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-center text-emerald-400 font-normal">
                            {getPlayerStat(player, ["goals"])}
                          </td>
                          <td className="px-3 py-2 text-center text-red-400 font-normal">
                            {getPlayerStat(player, [
                              "reds",
                              "red_cards",
                              "reds_count",
                              "expulsions",
                            ])}
                          </td>
                          <td className="px-3 py-2 text-center text-orange-400 font-normal">
                            {getPlayerStat(player, [
                              "injuries",
                              "injury_count",
                              "lesoes",
                              "lesions",
                            ])}
                          </td>
                          <td className="px-3 py-2 text-center text-zinc-400 text-sm">
                            {player.nationality}
                          </td>
                          <td className="px-3 py-2 text-center font-mono text-zinc-300 text-xs md:text-sm">
                            {formatCurrency(player.wage || 0)}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {player.signed_season !==
                            Math.ceil((matchweekCount + 1) / 14) ? (
                              <div className="flex flex-nowrap justify-center gap-1">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    renewPlayerContract(player);
                                  }}
                                  title="Renovar"
                                  aria-label="Renovar"
                                  className="px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-normal uppercase leading-none"
                                >
                                  R
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    listPlayerAuction(player);
                                  }}
                                  disabled={isPlayingMatch || showHalftimePanel}
                                  title={
                                    isPlayingMatch || showHalftimePanel
                                      ? "Disponível após as partidas"
                                      : "Vender em Leilão"
                                  }
                                  aria-label="Vender em Leilão"
                                  className="px-2 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-30 disabled:hover:bg-amber-600 text-zinc-950 text-[10px] font-normal uppercase leading-none"
                                >
                                  V
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    listPlayerFixed(player);
                                  }}
                                  title="Listar no Mercado"
                                  aria-label="Listar no Mercado"
                                  className="px-2 py-1 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-white text-[10px] font-normal uppercase leading-none"
                                >
                                  L
                                </button>
                              </div>
                            ) : (
                              <span className="text-xs text-zinc-600 font-normal uppercase">
                                —
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === "market" && (
              <div className="bg-zinc-900 rounded-3xl border border-zinc-800 shadow-sm overflow-hidden">
                <div className="border-b border-zinc-800 bg-zinc-950/40 p-4 md:p-5">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[10px] uppercase tracking-widest text-zinc-500 font-black mb-2">
                        Posição
                      </label>
                      <select
                        className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-3 text-sm font-bold text-white focus:ring-2 focus:ring-amber-500"
                        value={marketPositionFilter}
                        onChange={(e) =>
                          setMarketPositionFilter(e.target.value)
                        }
                      >
                        <option value="all">Todas</option>
                        <option value="GK">Guarda-Redes</option>
                        <option value="DEF">Defesa</option>
                        <option value="MID">Médio</option>
                        <option value="ATK">Avançado</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase tracking-widest text-zinc-500 font-black mb-2">
                        Ordenar por
                      </label>
                      <select
                        className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-3 text-sm font-bold text-white focus:ring-2 focus:ring-amber-500"
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
                    <div className="flex items-end text-sm font-bold text-zinc-500">
                      {filteredMarketPlayers.length} jogadores
                    </div>
                  </div>
                </div>
                <table className="w-full text-left text-xs md:text-sm">
                  <thead>
                    <tr className="bg-zinc-950/50 text-zinc-500 uppercase text-[10px] md:text-[11px] border-b border-zinc-800">
                      <th className="px-4 py-2.5 font-black">Pos</th>
                      <th className="px-4 py-2.5 font-black">Nome</th>
                      <th className="px-4 py-2.5 font-black">Clube</th>
                      <th className="px-4 py-2.5 font-black text-right">
                        Ordenado
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
                      <th className="px-4 py-2.5 font-black text-center">
                        Qual
                      </th>
                      <th className="px-4 py-2.5 font-black text-right">
                        Preço
                      </th>
                      <th className="px-4 py-2.5"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/50 font-medium">
                    {filteredMarketPlayers.map((player) => {
                      const isListed =
                        player.transfer_status &&
                        player.transfer_status !== "none";
                      const price = player.marketPrice;
                      const canAfford = teamInfo?.budget >= price;
                      return (
                        <tr
                          key={player.id}
                          className="hover:bg-zinc-800/50 transition-colors"
                        >
                          <td className="px-4 py-2 font-black text-[11px] md:text-xs">
                            {player.position}
                          </td>
                          <td className="px-4 py-2">
                            <div className="flex items-center gap-2">
                              <p className="font-bold text-white text-sm leading-tight">
                                {player.name}
                                {!!player.is_star &&
                                  (player.position === "MID" ||
                                    player.position === "ATK") && (
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
                                  className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${player.transfer_status === "auction" ? "bg-amber-500 text-zinc-950" : "bg-sky-500 text-zinc-950"}`}
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
                          <td className="px-4 py-2 text-right font-mono text-zinc-300 text-xs md:text-sm">
                            {formatCurrency(
                              player.contract_requested_wage ||
                                player.wage ||
                                0,
                            )}
                          </td>
                          <td className="px-4 py-2 text-center font-black text-emerald-400">
                            {getPlayerStat(player, ["goals"])}
                          </td>
                          <td className="px-4 py-2 text-center font-black text-red-400">
                            {getPlayerStat(player, ["red_cards"])}
                          </td>
                          <td className="px-4 py-2 text-center font-black text-orange-400">
                            {getPlayerStat(player, ["injuries"])}
                          </td>
                          <td className="px-4 py-2 text-center">
                            <span className="bg-emerald-950 text-emerald-400 font-black px-2 py-1 rounded text-sm">
                              {player.skill}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-right font-mono text-zinc-300 text-sm md:text-base">
                            {formatCurrency(price)}
                          </td>
                          <td className="px-4 py-2 text-right">
                            {player.transfer_status === "auction" ? (
                              <button
                                onClick={() => openAuctionBid(player)}
                                className="bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black uppercase text-[10px] px-3 py-1.5 rounded"
                              >
                                Licitar
                              </button>
                            ) : (
                              <button
                                onClick={() => buyPlayer(player.id)}
                                disabled={!canAfford}
                                className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-30 disabled:hover:bg-emerald-600 text-white font-black uppercase text-[10px] px-3 py-1.5 rounded"
                              >
                                {canAfford ? "Comprar" : "Sem Gito"}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {activeTab === "squad" && (
            <div className="space-y-6">
              <div className="bg-zinc-900 p-5 rounded-3xl border border-zinc-800 flex flex-col items-center sticky top-23">
                {disconnected && (
                  <p className="text-red-400 text-xs font-bold mb-3 text-center">
                    ⚠️ Desligado — a reconectar...
                  </p>
                )}
                {activeTab === "squad" && (
                  <div className="w-full mb-4 space-y-4">
                    <div className="p-4 rounded-2xl border border-zinc-800 bg-zinc-950/80">
                      <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-black mb-3">
                        Próximo Jogo
                      </p>
                      {nextMatchSummaryLoading && !nextMatchSummary ? (
                        <div className="text-sm font-bold text-zinc-500 py-2">
                          A carregar resumo...
                        </div>
                      ) : nextMatchOpponent ? (
                        <div className="space-y-3 text-sm">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-zinc-500 text-[10px] uppercase tracking-widest font-black">
                                Adversário
                              </p>
                              <p className="text-white font-black text-base leading-tight">
                                {nextMatchOpponent.name}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-zinc-500 text-[10px] uppercase tracking-widest font-black">
                                Classificação
                              </p>
                              <p className="text-amber-400 font-black text-base">
                                {nextMatchOpponent.position
                                  ? `${nextMatchOpponent.position}º`
                                  : "-"}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center justify-center gap-1.5 font-black tracking-[0.35em] text-xs">
                            {(nextMatchOpponent.last5 || "-----")
                              .split("")
                              .slice(0, 5)
                              .map((result, index) => (
                                <span
                                  key={`${result}-${index}`}
                                  className={`w-7 h-7 rounded-full flex items-center justify-center border ${result === "V" ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" : result === "E" ? "bg-amber-500/15 text-amber-400 border-amber-500/30" : result === "D" ? "bg-red-500/15 text-red-400 border-red-500/30" : "bg-zinc-900 text-zinc-600 border-zinc-800"}`}
                                >
                                  {result}
                                </span>
                              ))}
                          </div>
                          <div className="pt-2 border-t border-zinc-800/80">
                            <p className="text-zinc-500 text-[10px] uppercase tracking-widest font-black mb-2">
                              Árbitro
                            </p>
                            <button
                              type="button"
                              onClick={() => setRefereePopup(nextMatchReferee)}
                              className="flex w-full items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-left hover:border-amber-500/40 transition-colors"
                            >
                              <span className="font-black text-white text-sm">
                                {nextMatchReferee?.name || "A definir"}
                              </span>
                              <span className="text-[10px] uppercase tracking-widest font-black text-amber-400">
                                Ver balança
                              </span>
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="text-sm font-bold text-zinc-500 py-2">
                          Sem resumo disponível.
                        </div>
                      )}
                    </div>

                    <div className="p-4 rounded-2xl border border-zinc-800 bg-zinc-950/80">
                      <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-black mb-3">
                        Tática
                      </p>
                      <div className="space-y-3">
                        <select
                          className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-3 text-sm font-bold text-white focus:ring-2 focus:ring-amber-500"
                          value={tactic.formation}
                          onChange={(e) => handleAutoPick(e.target.value)}
                        >
                          <option value="4-4-2">4-4-2 Clássico</option>
                          <option value="4-3-3">4-3-3 Ofensivo</option>
                          <option value="3-5-2">3-5-2 Controlo da Bola</option>
                          <option value="5-3-2">5-3-2 Autocarro</option>
                          <option value="4-5-1">4-5-1 Catenaccio</option>
                          <option value="3-4-3">3-4-3 Ataque Total</option>
                          <option value="4-2-4">4-2-4 Avassalador</option>
                          <option value="5-4-1">5-4-1 Ferrolho</option>
                        </select>
                        <select
                          className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-3 text-sm font-bold text-emerald-400 focus:ring-2 focus:ring-amber-500"
                          value={tactic.style}
                          onChange={(e) =>
                            updateTactic({ style: e.target.value })
                          }
                        >
                          <option value="Balanced">Equilibrado</option>
                          <option value="Offensive">Ofensivo (+15% Atk)</option>
                          <option value="Defensive">
                            Defensivo (+20% Def)
                          </option>
                        </select>
                        {(() => {
                          const morale = teamInfo?.morale ?? 75;
                          const moraleColor =
                            morale > 75
                              ? "bg-emerald-500"
                              : morale >= 50
                                ? "bg-amber-500"
                                : "bg-red-500";
                          const moraleLabel =
                            morale > 75
                              ? "Boa"
                              : morale >= 50
                                ? "Média"
                                : "Baixa";
                          return (
                            <div>
                              <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-black mb-1.5">
                                Moral da Equipa
                              </p>
                              <div className="flex items-center gap-2">
                                <div className="flex-1 bg-zinc-800 rounded-full h-2.5 overflow-hidden">
                                  <div
                                    className={`h-2.5 rounded-full transition-all duration-500 ${moraleColor}`}
                                    style={{ width: `${morale}%` }}
                                  />
                                </div>
                                <span
                                  className={`text-xs font-black tracking-wider w-10 text-right ${
                                    morale > 75
                                      ? "text-emerald-400"
                                      : morale >= 50
                                        ? "text-amber-400"
                                        : "text-red-400"
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
                  const isDisabled =
                    !isHalftime && !isReady && !isLineupComplete;
                  return (
                    <>
                      <button
                        onClick={isHalftime ? handleHalftimeReady : handleReady}
                        disabled={isDisabled}
                        className={`w-full py-5 font-black rounded-2xl text-xl transition-all uppercase tracking-widest relative overflow-hidden border-b-6 active:border-b-0 active:translate-y-1.5 ${isReady ? "bg-zinc-800 text-zinc-500 border-zinc-950" : isDisabled ? "bg-zinc-800 text-zinc-600 border-zinc-950 cursor-not-allowed opacity-50" : "bg-emerald-500 text-zinc-950 hover:bg-emerald-400 border-emerald-700"}`}
                      >
                        {isReady
                          ? "A AGUARDAR OUTROS"
                          : isHalftime && isCupMatch
                            ? "2ª PARTE — TAÇA"
                            : isHalftime
                              ? "2ª PARTE"
                              : "JOGAR JORNADA"}
                      </button>
                      {isDisabled && (
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

      {selectedTeam && (
        <div
          className="fixed inset-0 z-120 bg-zinc-950/85 backdrop-blur-sm p-4 md:p-8 flex items-center justify-center"
          onClick={handleCloseTeamSquad}
        >
          <div
            className="w-full max-w-5xl max-h-[90vh] overflow-hidden bg-zinc-900 border border-zinc-800 rounded-3xl shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="px-5 py-4 border-b border-zinc-800 flex items-start justify-between gap-4"
              style={{
                background: selectedTeam.color_primary || "#18181b",
              }}
            >
              <div>
                <p
                  className="text-xs uppercase tracking-widest font-black"
                  style={{ color: selectedTeam.color_secondary || "#ffffff" }}
                >
                  Plantel
                </p>
                <h3
                  className="text-2xl md:text-3xl font-black"
                  style={{ color: selectedTeam.color_secondary || "#ffffff" }}
                >
                  {selectedTeam.name}
                </h3>
                <p
                  className="text-sm font-bold"
                  style={{ color: selectedTeam.color_secondary || "#ffffff" }}
                >
                  {DIVISION_NAMES[selectedTeam.division] ||
                    `Divisão ${selectedTeam.division}`}
                </p>
              </div>
              <button
                onClick={handleCloseTeamSquad}
                className="shrink-0 px-4 py-2 rounded-xl bg-zinc-950/40 font-black uppercase text-sm border hover:bg-zinc-950/60"
                style={{
                  color: selectedTeam.color_secondary || "#ffffff",
                  borderColor: selectedTeam.color_secondary || "#ffffff",
                }}
              >
                Fechar
              </button>
            </div>

            {/* Palmarés da equipa */}
            {palmaresTeamId === selectedTeam?.id &&
              palmares.trophies?.length > 0 && (
                <div className="border-t border-zinc-800 px-6 py-4">
                  <h4 className="text-xs text-amber-400 font-black uppercase tracking-widest mb-3 flex items-center gap-2">
                    🏆 Palmarés
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {palmares.trophies.map((trophy, idx) => (
                      <span
                        key={idx}
                        className="px-3 py-1 rounded-full bg-amber-900/30 border border-amber-700/40 text-amber-300 text-xs font-black"
                      >
                        🏆 {trophy.achievement} ({trophy.season})
                      </span>
                    ))}
                  </div>
                </div>
              )}

            <div className="overflow-auto">
              {selectedTeamLoading ? (
                <div className="p-8 text-center text-zinc-400 font-bold">
                  A carregar plantel...
                </div>
              ) : (
                <table className="w-full text-left text-sm border-collapse">
                  <thead className="sticky top-0 bg-zinc-950 text-zinc-400 uppercase text-[11px] tracking-widest border-b border-zinc-800">
                    <tr>
                      <th className="px-4 py-3 font-black">Pos</th>
                      <th className="px-4 py-3 font-black">Nome</th>
                      <th className="px-4 py-3 font-black text-center">Qual</th>
                      <th className="px-4 py-3 font-black text-center">
                        Golos
                      </th>
                      <th className="px-4 py-3 font-black text-center">
                        Vermelhos
                      </th>
                      <th className="px-4 py-3 font-black text-center">
                        Lesões
                      </th>
                      <th className="px-4 py-3 font-black text-center">
                        Susp.
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {selectedTeamSquad.length === 0 ? (
                      <tr>
                        <td
                          colSpan="7"
                          className="px-4 py-8 text-center text-zinc-500 font-bold"
                        >
                          Sem jogadores encontrados.
                        </td>
                      </tr>
                    ) : (
                      selectedTeamSquad.map((player) => (
                        <tr
                          key={player.id}
                          className={`hover:bg-zinc-800/50 transition-colors ${ENABLE_ROW_BG ? POSITION_BG_CLASS[player.position] : ""}`}
                        >
                          <td
                            className={`px-4 py-2.5 font-black text-sm tracking-wider ${POSITION_TEXT_CLASS[player.position] || "text-zinc-300"}`}
                          >
                            {player.position}
                          </td>
                          <td className="px-4 py-2.5 font-bold text-white">
                            {player.name}
                            {!!player.is_star &&
                              (player.position === "MID" ||
                                player.position === "ATK") && (
                                <span
                                  className="ml-1 text-amber-400 font-black"
                                  title="Craque"
                                >
                                  *
                                </span>
                              )}
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            <span className="bg-zinc-950 text-white font-black px-2 py-1.5 rounded text-sm border border-zinc-800">
                              {player.skill}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-center font-black text-emerald-400">
                            {getPlayerStat(player, ["goals"])}
                          </td>
                          <td className="px-4 py-2.5 text-center font-black text-red-400">
                            {getPlayerStat(player, ["red_cards"])}
                          </td>
                          <td className="px-4 py-2.5 text-center font-black text-orange-400">
                            {getPlayerStat(player, ["injuries"])}
                          </td>
                          <td className="px-4 py-2.5 text-center font-black text-amber-400">
                            {getPlayerStat(player, ["suspension_games"])}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {selectedAuctionPlayer && (
        <div
          className="fixed inset-0 z-130 bg-zinc-950/90 backdrop-blur-sm p-4 md:p-8 flex items-center justify-center"
          onClick={auctionResult ? undefined : closeAuctionBid}
        >
          <div
            className="w-full max-w-lg bg-amber-400 border-2 border-amber-600 rounded-2xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Title bar */}
            <div className="px-4 py-2 bg-linear-to-r from-blue-800 to-blue-600 text-white flex items-center justify-between">
              <p className="text-sm font-black tracking-wide">
                Venda de jogador por leilão
              </p>
              {!auctionResult && (
                <button
                  onClick={closeAuctionBid}
                  className="text-white/80 hover:text-white text-lg font-bold leading-none px-1"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Player card — yellow background inspired by PC Futebol */}
            <div className="p-5 space-y-3 text-zinc-950">
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                <div className="flex gap-2">
                  <span className="font-normal text-zinc-700">Equipa</span>
                  <span className="font-black bg-blue-800 text-white px-2 py-0.5 rounded text-xs leading-tight uppercase">
                    {selectedAuctionPlayer.team_name || "Sem clube"}
                  </span>
                </div>
                <div className="flex gap-2">
                  <span className="font-normal text-zinc-700">
                    Nacionalidade
                  </span>
                  <span className="font-bold">
                    {selectedAuctionPlayer.nationality || "—"}
                  </span>
                </div>
                <div className="flex gap-2">
                  <span className="font-normal text-zinc-700">Jogador</span>
                  <span className="font-black text-lg leading-tight">
                    {selectedAuctionPlayer.name}
                  </span>
                </div>
                <div></div>
                <div className="flex gap-2">
                  <span className="font-normal text-zinc-700">Posição</span>
                  <span className="font-bold">
                    {selectedAuctionPlayer.position}
                  </span>
                </div>
                <div className="flex gap-2">
                  <span className="font-normal text-zinc-700">
                    Comportamento
                  </span>
                  <span className="font-bold">
                    {selectedAuctionPlayer.aggressiveness || "Normal"}
                  </span>
                </div>
                <div className="flex gap-2">
                  <span className="font-normal text-zinc-700">Força</span>
                  <span className="font-black text-xl">
                    {selectedAuctionPlayer.skill}
                  </span>
                </div>
                <div className="flex gap-2">
                  <span className="font-normal text-zinc-700">
                    Golos esta época
                  </span>
                  <span className="font-bold">
                    {selectedAuctionPlayer.goals || 0}
                  </span>
                </div>
              </div>

              {/* Historial box */}
              <div className="border border-zinc-700 rounded-lg p-3 bg-amber-300/50 text-sm">
                <p className="font-bold text-zinc-700 mb-1.5">Historial</p>
                <div className="grid grid-cols-2 gap-x-6 gap-y-0.5">
                  <div className="flex justify-between">
                    <span>Jogos</span>
                    <span className="font-bold">
                      {selectedAuctionPlayer.games_played || 0}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Golos</span>
                    <span className="font-bold">
                      {selectedAuctionPlayer.goals || 0}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Cartões vermelhos</span>
                    <span className="font-bold">
                      {selectedAuctionPlayer.red_cards || 0}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Lesões</span>
                    <span className="font-bold">
                      {selectedAuctionPlayer.injuries || 0}
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-x-6 text-sm">
                <div className="flex gap-2">
                  <span className="font-normal text-zinc-700">
                    Salário pretendido
                  </span>
                  <span className="font-bold">
                    {formatCurrency(selectedAuctionPlayer.wage || 0)} /sem
                  </span>
                </div>
                <div></div>
                <div className="flex gap-2">
                  <span className="font-normal text-zinc-700">Preço base</span>
                  <span className="font-black">
                    {formatCurrency(
                      selectedAuctionPlayer.startingPrice ||
                        selectedAuctionPlayer.transfer_price ||
                        0,
                    )}
                  </span>
                </div>
                {selectedAuctionPlayer.is_star ? (
                  <div className="flex items-center gap-1">
                    <span className="text-amber-600 font-black">★</span>
                    <span className="font-bold text-amber-700">Craque</span>
                  </div>
                ) : (
                  <div></div>
                )}
              </div>
            </div>

            {/* Bottom section — bid or result */}
            {auctionResult ? (
              // Result phase
              <div className="px-5 py-4 bg-linear-to-r from-amber-500 to-amber-400 border-t-2 border-amber-600 text-zinc-950">
                {auctionResult.sold ? (
                  <p className="font-black text-lg">
                    Vendido ao{" "}
                    <span className="uppercase">
                      {auctionResult.buyerTeamName}
                    </span>{" "}
                    por {formatCurrency(auctionResult.finalBid)}
                  </p>
                ) : (
                  <p className="font-black text-lg">
                    Não recebeu lances e saiu do leilão.
                  </p>
                )}
                <p className="text-xs text-zinc-700 mt-1 font-medium">
                  A fechar automaticamente...
                </p>
              </div>
            ) : myAuctionBid != null ? (
              // Bid confirmed — waiting for result
              <div className="px-5 py-4 bg-linear-to-r from-emerald-600 to-emerald-500 border-t-2 border-emerald-700 text-white">
                <p className="font-black text-sm uppercase tracking-widest mb-1">
                  Lance registado
                </p>
                <p className="font-black text-2xl font-mono">
                  {formatCurrency(myAuctionBid)}
                </p>
                <p className="text-xs text-emerald-200 mt-1 font-medium">
                  A aguardar o resultado do leilão...
                </p>
              </div>
            ) : (
              // Bidding phase
              <div className="px-5 py-4 bg-linear-to-r from-red-600 to-red-500 border-t-2 border-red-700 text-white">
                <div className="flex items-center gap-3 mb-2">
                  <span className="font-bold text-sm">Oferta (€):</span>
                  <input
                    type="number"
                    min="0"
                    value={auctionBid}
                    onChange={(e) => setAuctionBid(e.target.value)}
                    placeholder={String(
                      selectedAuctionPlayer.startingPrice || 0,
                    )}
                    className="flex-1 bg-white border-2 border-zinc-300 rounded-lg px-3 py-2 text-zinc-950 font-mono text-lg outline-none focus:border-amber-500"
                    autoFocus
                  />
                  <button
                    onClick={submitAuctionBid}
                    className="bg-emerald-500 hover:bg-emerald-400 text-white font-black uppercase text-sm px-6 py-2.5 rounded-lg flex items-center gap-2"
                  >
                    <span>✓</span> OK
                  </button>
                </div>
                <p className="text-xs text-red-200 font-medium">
                  Dinheiro em caixa: {formatCurrency(teamInfo?.budget || 0)} ·
                  Leilão fechado — o lance mais alto vence.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {refereePopup && (
        <div
          className="fixed inset-0 z-130 bg-zinc-950/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={closeRefereePopup}
        >
          <div
            className="w-full max-w-md rounded-3xl border border-zinc-800 bg-zinc-900 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 border-b border-zinc-800 bg-zinc-950/50">
              <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-black mb-2">
                Árbitro
              </p>
              <h3 className="text-2xl font-black text-white">
                {refereePopup.name}
              </h3>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex items-center justify-between text-xs uppercase tracking-widest font-black text-zinc-500">
                <span>{teamInfo?.name || "Equipa A"}</span>
                <span>{nextMatchOpponent?.name || "Equipa B"}</span>
              </div>
              <div className="relative h-4 rounded-full bg-zinc-950 border border-zinc-800 overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 bg-emerald-500/80"
                  style={{ width: `${refereePopup.balance}%` }}
                ></div>
                <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/40"></div>
                <div
                  className="absolute -top-2 h-8 w-1 rounded-full bg-amber-400 shadow-[0_0_0_4px_rgba(251,191,36,0.18)]"
                  style={{ left: `calc(${refereePopup.balance}% - 2px)` }}
                ></div>
              </div>
              <div className="flex items-center justify-between text-sm font-black">
                <span className="text-emerald-400">
                  {refereePopup.balance >= 50
                    ? `${teamInfo?.name || "Equipa A"} ganha vantagem`
                    : `${nextMatchOpponent?.name || "Equipa B"} ganha vantagem`}
                </span>
                <span className="text-zinc-400">{refereePopup.balance}%</span>
              </div>
              <p className="text-sm text-zinc-400 leading-relaxed">
                A balança mostra para que lado este árbitro tende a inclinar a
                partida. Valores acima de 50 favorecem a tua equipa; abaixo de
                50 favorecem o adversário. Isso pode mexer nos cartões e nos
                penaltis assinalados.
              </p>
              <button
                type="button"
                onClick={closeRefereePopup}
                className="w-full rounded-2xl bg-amber-500 px-4 py-3 font-black uppercase tracking-widest text-zinc-950"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── CUP DRAW POPUP ──────────────────────────────────────────────────── */}
      {showCupDrawPopup && cupDraw && (
        <div className="fixed inset-0 z-140 bg-zinc-950/90 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-3xl border border-amber-700/40 bg-zinc-900 shadow-2xl overflow-hidden">
            <div className="bg-linear-to-r from-amber-900/40 to-zinc-900 px-6 py-4 border-b border-amber-700/30">
              <p className="text-xs text-amber-400 uppercase font-black tracking-widest mb-1">
                Taça de Portugal · Temporada {cupDraw.season}
              </p>
              <h2 className="text-2xl font-black text-white">
                Sorteio — {cupDraw.roundName}
              </h2>
            </div>

            <div className="p-6 space-y-3 max-h-[60vh] overflow-y-auto">
              {(cupDraw.fixtures || []).map((fixture, pairIdx) => {
                const homeIdx = pairIdx * 2;
                const awayIdx = pairIdx * 2 + 1;
                const homeRevealed = cupDrawRevealIdx > homeIdx;
                const awayRevealed = cupDrawRevealIdx > awayIdx;
                // Only highlight after both teams are revealed, so the drawn slot isn't
                // visible before the name appears.
                const isMyPair =
                  awayRevealed &&
                  (fixture.homeTeam?.id === me?.teamId ||
                    fixture.awayTeam?.id === me?.teamId);

                return (
                  <div
                    key={pairIdx}
                    className={`flex items-center gap-3 rounded-xl border px-4 py-2 transition-all ${isMyPair ? "border-amber-500 bg-amber-500/10" : "border-zinc-800 bg-zinc-950"}`}
                  >
                    <div
                      className={`flex-1 text-right font-black text-sm transition-all duration-300 ${homeRevealed ? "opacity-100 translate-x-0" : "opacity-0 translate-x-4"}`}
                      style={{
                        color: homeRevealed
                          ? fixture.homeTeam?.color_primary || "#fff"
                          : "transparent",
                      }}
                    >
                      {homeRevealed ? fixture.homeTeam?.name || "?" : "···"}
                    </div>
                    <div className="text-zinc-600 font-black text-xs shrink-0">
                      vs
                    </div>
                    <div
                      className={`flex-1 text-left font-black text-sm transition-all duration-300 ${awayRevealed ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-4"}`}
                      style={{
                        color: awayRevealed
                          ? fixture.awayTeam?.color_primary || "#fff"
                          : "transparent",
                      }}
                    >
                      {awayRevealed ? fixture.awayTeam?.name || "?" : "···"}
                    </div>
                  </div>
                );
              })}

              {cupDrawRevealIdx < (cupDraw.fixtures || []).length * 2 && (
                <div className="text-center py-2">
                  <span className="animate-pulse text-amber-400 text-xs font-black uppercase tracking-widest">
                    A sortear…
                  </span>
                </div>
              )}
            </div>

            {cupDraw.humanInCup &&
              cupDrawRevealIdx >= (cupDraw.fixtures || []).length * 2 && (
                <div className="px-6 pb-6">
                  <button
                    onClick={() => {
                      setShowCupDrawPopup(false);
                      socket.emit("cupDrawAcknowledged");
                    }}
                    className="w-full rounded-2xl bg-amber-500 px-4 py-3 font-black uppercase tracking-widest text-zinc-950 hover:bg-amber-400"
                  >
                    Continuar
                  </button>
                </div>
              )}
          </div>
        </div>
      )}

      {/* ── CUP ROUND RESULTS DETAIL POPUP ─────────────────────────────────── */}
      {showCupResults && cupRoundResults && (
        <div
          className="fixed inset-0 z-140 bg-zinc-950/85 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setShowCupResults(false)}
        >
          <div
            className="w-full max-w-md rounded-3xl border border-zinc-800 bg-zinc-900 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-zinc-800/50 px-6 py-4 border-b border-zinc-800 flex justify-between items-center">
              <div>
                <p className="text-xs text-amber-400 uppercase font-black tracking-widest">
                  Taça de Portugal · Temporada {cupRoundResults.season}
                </p>
                <h2 className="text-xl font-black text-white">
                  {cupRoundResults.roundName}
                </h2>
              </div>
              <button
                onClick={() => setShowCupResults(false)}
                className="text-zinc-500 hover:text-white font-black text-lg"
              >
                ✕
              </button>
            </div>
            <div className="p-4 space-y-2 max-h-[60vh] overflow-y-auto">
              {(cupRoundResults.results || []).map((r, idx) => {
                const hInfo = teams.find((t) => t.id === r.homeTeamId);
                const aInfo = teams.find((t) => t.id === r.awayTeamId);
                const winnerInfo = teams.find((t) => t.id === r.winnerId);
                const isMyMatch =
                  r.homeTeamId === me.teamId || r.awayTeamId === me.teamId;
                return (
                  <div
                    key={idx}
                    className={`rounded-xl border px-4 py-3 ${isMyMatch ? "border-amber-500 bg-amber-500/10" : "border-zinc-800 bg-zinc-950"}`}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className="flex-1 text-right font-black text-sm truncate"
                        style={{ color: hInfo?.color_primary || "#fff" }}
                      >
                        {hInfo?.name}
                      </span>
                      <span className="px-3 py-1 bg-zinc-900 border border-zinc-800 rounded-lg font-black text-white text-sm">
                        {r.homeGoals} – {r.awayGoals}
                      </span>
                      <span
                        className="flex-1 text-left font-black text-sm truncate"
                        style={{ color: aInfo?.color_primary || "#fff" }}
                      >
                        {aInfo?.name}
                      </span>
                    </div>
                    {winnerInfo && (
                      <p className="text-center text-amber-400 text-xs font-black mt-1">
                        ✓ Apura-se {winnerInfo.name}
                        {cupRoundResults.isFinal ? " 🏆 Vencedor da Taça!" : ""}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="px-6 pb-6 pt-2">
              <button
                onClick={() => setShowCupResults(false)}
                className="w-full rounded-2xl bg-zinc-800 px-4 py-2.5 font-black uppercase tracking-widest text-white hover:bg-zinc-700 text-sm"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── PENALTY SHOOTOUT POPUP ───────────────────────────────────────────── */}
      {cupPenaltyPopup && (
        <div className="fixed inset-0 z-150 bg-zinc-950/92 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-3xl border border-zinc-800 bg-zinc-900 shadow-2xl overflow-hidden">
            <div className="bg-zinc-800/60 px-6 py-4 border-b border-zinc-800 text-center">
              <p className="text-xs text-zinc-400 uppercase font-black tracking-widest">
                Taça de Portugal
              </p>
              <h2 className="text-xl font-black text-white mt-1">
                Grandes Penalidades
              </h2>
              <div className="flex items-center justify-center gap-4 mt-3">
                <span
                  className="font-black text-sm"
                  style={{
                    color:
                      teams.find((t) => t.id === cupPenaltyPopup.homeTeamId)
                        ?.color_primary || "#fff",
                  }}
                >
                  {teams.find((t) => t.id === cupPenaltyPopup.homeTeamId)?.name}
                </span>
                {cupPenaltyKickIdx >= (cupPenaltyPopup.kicks || []).length ? (
                  <span className="text-2xl font-black text-white px-3 py-1 bg-zinc-950 border border-zinc-800 rounded-xl">
                    {cupPenaltyPopup.homeGoals} – {cupPenaltyPopup.awayGoals}
                  </span>
                ) : (
                  <span className="text-2xl font-black text-zinc-500 px-3 py-1 bg-zinc-950 border border-zinc-800 rounded-xl animate-pulse">
                    ? – ?
                  </span>
                )}
                <span
                  className="font-black text-sm"
                  style={{
                    color:
                      teams.find((t) => t.id === cupPenaltyPopup.awayTeamId)
                        ?.color_primary || "#fff",
                  }}
                >
                  {teams.find((t) => t.id === cupPenaltyPopup.awayTeamId)?.name}
                </span>
              </div>
            </div>
            <div className="p-4 max-h-72 overflow-y-auto space-y-1">
              {(cupPenaltyPopup.kicks || [])
                .slice(0, cupPenaltyKickIdx)
                .map((kick, idx) => (
                  <div
                    key={idx}
                    className={`flex items-center gap-3 text-xs font-bold rounded-lg px-3 py-1.5 transition-all ${kick.team === "home" ? "bg-zinc-800/60" : "bg-zinc-950/60"}`}
                  >
                    <span className="text-base">
                      {kick.scored ? "⚽" : "❌"}
                    </span>
                    <span
                      className={`${kick.team === "home" ? "text-right flex-1" : "text-left flex-1 order-last"}`}
                    >
                      {kick.playerName}
                    </span>
                    {kick.suddenDeath && (
                      <span className="text-amber-400 text-[10px] font-black shrink-0">
                        SD
                      </span>
                    )}
                  </div>
                ))}
              {cupPenaltyKickIdx < (cupPenaltyPopup.kicks || []).length && (
                <div className="text-center py-2">
                  <span className="animate-pulse text-amber-400 text-xs font-black uppercase tracking-widest">
                    A rematar…
                  </span>
                </div>
              )}
            </div>
            {cupPenaltyKickIdx >= (cupPenaltyPopup.kicks || []).length && (
              <div className="px-6 pb-6 pt-2">
                <button
                  onClick={() => {
                    setCupPenaltyPopup(null);
                    setCupPenaltyKickIdx(0);
                  }}
                  className="w-full rounded-2xl bg-amber-500 px-4 py-3 font-black uppercase tracking-widest text-zinc-950 hover:bg-amber-400"
                >
                  Fechar
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── MATCH DETAIL MODAL ───────────────────────────────────────────────── */}
      {showMatchDetail &&
        matchDetailFixture &&
        (() => {
          const fx = matchDetailFixture;
          const hInfo = teams.find((t) => t.id === fx.homeTeamId);
          const aInfo = teams.find((t) => t.id === fx.awayTeamId);
          const evts = fx.events || [];
          const visibleEvts = evts.filter((e) => e.minute <= liveMinute);
          const homeGoals = visibleEvts.filter(
            (e) =>
              (e.type === "goal" || e.type === "penalty_goal") &&
              e.team === "home",
          ).length;
          const awayGoals = visibleEvts.filter(
            (e) =>
              (e.type === "goal" || e.type === "penalty_goal") &&
              e.team === "away",
          ).length;

          const homeLineup = getEffectiveLineup(
            fx.homeLineup || [],
            evts,
            liveMinute,
            "home",
          );
          const awayLineup = getEffectiveLineup(
            fx.awayLineup || [],
            evts,
            liveMinute,
            "away",
          );

          const ref = fx.referee;
          const refBalance = ref?.balance ?? 50;

          const posOrder = { GK: 0, DEF: 1, MID: 2, ATK: 3 };
          const sortLineup = (arr) =>
            [...arr].sort(
              (a, b) =>
                (posOrder[a.position] ?? 9) - (posOrder[b.position] ?? 9),
            );

          const renderPlayer = (p, opts = {}) => {
            const { isOff = false, offReason = null } = opts;
            const label = isOff
              ? offReason === "red"
                ? "🟥"
                : offReason === "injury"
                  ? "❌"
                  : "🔄"
              : p.goals > 0
                ? Array(p.goals).fill("⚽").join("")
                : "";
            return (
              <div
                key={p.id ?? p.name}
                className={`flex items-center gap-1.5 py-0.5 ${isOff ? "opacity-40" : ""}`}
              >
                <span
                  className={`w-3.5 text-[10px] font-black shrink-0 ${isOff ? "text-zinc-600" : POSITION_TEXT_CLASS[p.position] || "text-zinc-400"}`}
                >
                  {isOff ? "" : POSITION_SHORT_LABELS[p.position] || "?"}
                </span>
                <span
                  className={`flex-1 truncate text-xs font-bold ${isOff ? "text-zinc-600 line-through" : "text-zinc-200"}`}
                >
                  {p.name}
                </span>
                {label ? (
                  <span className="text-[10px] shrink-0">{label}</span>
                ) : null}
              </div>
            );
          };

          return (
            <div
              className="fixed inset-0 z-120 bg-zinc-950/90 backdrop-blur-sm flex items-center justify-center p-3"
              onClick={() => setShowMatchDetail(false)}
            >
              <div
                className="w-full max-w-lg bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden max-h-[92vh]"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800 bg-zinc-950 shrink-0">
                  <div className="flex items-center gap-2">
                    {isPlayingMatch && (
                      <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse inline-block" />
                    )}
                    <span className="text-amber-500 font-black text-xs uppercase tracking-widest">
                      {isCupMatch
                        ? `🏆 ${cupMatchRoundName}`
                        : `Jornada ${currentJornada}`}
                    </span>
                    <span className="text-zinc-500 text-xs font-bold">
                      · {liveMinute}&apos;
                    </span>
                  </div>
                  <button
                    onClick={() => setShowMatchDetail(false)}
                    className="text-zinc-500 hover:text-white transition-colors text-sm font-black px-2 py-1"
                    aria-label="Fechar"
                  >
                    ✕
                  </button>
                </div>

                {/* Score banner */}
                <div className="flex items-stretch shrink-0 border-b border-zinc-800">
                  <div
                    className="flex-1 text-center py-3 px-3 font-black text-sm uppercase truncate"
                    style={{
                      backgroundColor: hInfo?.color_primary || "#18181b",
                      color: hInfo?.color_secondary || "#fff",
                    }}
                  >
                    {hInfo?.name || "Casa"}
                  </div>
                  <div className="flex items-center justify-center gap-2 px-5 bg-zinc-950 text-white font-black text-2xl tracking-widest">
                    <span>{homeGoals}</span>
                    <span className="text-zinc-600 text-lg">—</span>
                    <span>{awayGoals}</span>
                  </div>
                  <div
                    className="flex-1 text-center py-3 px-3 font-black text-sm uppercase truncate"
                    style={{
                      backgroundColor: aInfo?.color_primary || "#18181b",
                      color: aInfo?.color_secondary || "#fff",
                    }}
                  >
                    {aInfo?.name || "Fora"}
                  </div>
                </div>

                {/* Meta: attendance + referee */}
                <div className="flex items-center justify-center gap-4 px-4 py-2 border-b border-zinc-800 bg-zinc-950/50 shrink-0">
                  {fx.attendance ? (
                    <span className="text-zinc-400 text-[11px] font-bold">
                      🏟 {fx.attendance.toLocaleString("pt-PT")} adeptos
                    </span>
                  ) : null}
                  {ref?.refereeName ? (
                    <span className="text-zinc-400 text-[11px] font-bold">
                      👤 {ref.refereeName}
                      <span
                        className={`ml-1.5 font-black ${refBalance >= 60 ? "text-emerald-400" : refBalance <= 40 ? "text-red-400" : "text-zinc-400"}`}
                      >
                        {refBalance}
                      </span>
                    </span>
                  ) : null}
                </div>

                {/* Lineups */}
                <div className="flex divide-x divide-zinc-800 min-h-0 shrink-0">
                  {[
                    { info: hInfo, lineup: homeLineup, side: "home" },
                    { info: aInfo, lineup: awayLineup, side: "away" },
                  ].map(({ info, lineup }) => (
                    <div
                      key={info?.id ?? Math.random()}
                      className="flex-1 flex flex-col min-w-0"
                    >
                      <p
                        className="text-[9px] font-black uppercase tracking-widest px-2.5 py-1 border-b border-zinc-800"
                        style={{ color: info?.color_primary || "#f59e0b" }}
                      >
                        {info?.name || "—"}
                      </p>
                      <div className="px-2.5 py-1 space-y-0">
                        {sortLineup(lineup.active).map((p) => renderPlayer(p))}
                        {lineup.offPlayers.map((p) =>
                          renderPlayer(p, { isOff: true, offReason: p.reason }),
                        )}
                      </div>
                      {lineup.subPlayers.length > 0 && (
                        <>
                          <p className="text-[9px] font-black uppercase tracking-widest px-2.5 pt-1 text-zinc-600">
                            Entrou
                          </p>
                          <div className="px-2.5 pb-1 space-y-0">
                            {lineup.subPlayers.map((p) => (
                              <div
                                key={p.id ?? p.name}
                                className="flex items-center gap-1.5 py-0.5"
                              >
                                <span className="w-3.5 text-[10px] font-black text-emerald-500 shrink-0">
                                  ↑
                                </span>
                                <span className="flex-1 truncate text-xs font-bold text-zinc-300">
                                  {p.name}
                                </span>
                                {p.goals > 0 && (
                                  <span className="text-[10px]">
                                    {Array(p.goals).fill("⚽").join("")}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>

                {/* Events timeline */}
                {visibleEvts.length > 0 && (
                  <div className="border-t border-zinc-800 flex-1 overflow-y-auto min-h-0">
                    <p className="text-[9px] font-black uppercase tracking-widest text-zinc-500 px-3 pt-2 pb-1">
                      Acontecimentos
                    </p>
                    <div className="px-3 pb-2 space-y-0.5">
                      {[...visibleEvts]
                        .sort((a, b) => (a.minute ?? 0) - (b.minute ?? 0))
                        .filter((e) =>
                          [
                            "goal",
                            "penalty_goal",
                            "penalty_miss",
                            "red",
                            "injury",
                            "substitution",
                          ].includes(e.type),
                        )
                        .map((e, i) => {
                          const isHome = e.team === "home";
                          const teamInfo = isHome ? hInfo : aInfo;
                          return (
                            <div
                              key={i}
                              className="flex items-center gap-2 text-[11px]"
                            >
                              <span className="text-zinc-600 font-black w-8 shrink-0 text-right">
                                {e.minute != null ? `${e.minute}'` : ""}
                              </span>
                              <span className="w-4 shrink-0 text-center">
                                {e.emoji || ""}
                              </span>
                              <span
                                className="flex-1 truncate font-bold"
                                style={{
                                  color: teamInfo?.color_primary || "#d4d4d8",
                                }}
                              >
                                {e.playerName || e.player_name || ""}
                              </span>
                              <span
                                className="text-[9px] font-black uppercase tracking-widest shrink-0"
                                style={{
                                  color: teamInfo?.color_primary || "#71717a",
                                }}
                              >
                                {teamInfo?.name || ""}
                              </span>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}

                {/* Back button */}
                <div className="px-4 py-3 border-t border-zinc-800 shrink-0">
                  <button
                    onClick={() => setShowMatchDetail(false)}
                    className="w-full py-2.5 rounded-xl text-sm font-black uppercase tracking-widest bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors"
                  >
                    ◀ Voltar à partida
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

      {/* ── WELCOME / HIRED MODAL ─────────────────────────────────────────────── */}
      {welcomeModal && me?.teamId && (
        <div className="fixed inset-0 z-200 bg-zinc-950/90 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-zinc-900 border border-amber-500/40 rounded-3xl shadow-2xl overflow-hidden">
            <div className="bg-linear-to-r from-amber-900/40 to-zinc-900 px-6 py-5 border-b border-amber-700/30 text-center">
              <p className="text-xs text-amber-400 uppercase font-black tracking-widest mb-2">
                Bem-vindo ao CashBall!
              </p>
              <h2 className="text-3xl font-black text-white">Parabéns! 🎉</h2>
            </div>
            <div className="p-6 text-center space-y-4">
              <p className="text-zinc-300 font-bold text-lg leading-relaxed">
                Foste contratado pelo{" "}
                <span className="text-amber-400 font-black">
                  {welcomeModal.teamName}
                </span>
                !
              </p>
              <p className="text-zinc-500 text-sm">
                Começa a gerir o teu clube e leva-o até ao topo da tabela.
              </p>
              <button
                onClick={() => {
                  markWelcomeSeen(me.name, me.roomCode);
                  setWelcomeModal(null);
                }}
                className="w-full bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black py-4 rounded-2xl text-lg uppercase tracking-widest transition-all active:scale-95 border-b-4 border-amber-700 active:border-b-0"
              >
                Vamos lá!
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
