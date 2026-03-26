import React, { useEffect, useState, useMemo, useCallback } from "react";
import { socket } from "./socket";

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

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
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
    const nameMatch = latest.text?.match(/VERMELHO!\s*(.*)$/i);
    return `${minuteText} 🟥 ${nameMatch?.[1] || "Jogador"}`;
  }

  if (latest.type === "yellow") {
    const nameMatch = latest.text?.match(/Amarelo para\s*(.*)$/i);
    return `${minuteText} 🟨 ${nameMatch?.[1] || "Jogador"}`;
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
  const [subsMade, setSubsMade] = useState(0);
  const [swapSource, setSwapSource] = useState(null);
  const [subbedOut, setSubbedOut] = useState([]); // Track players who left the pitch
  const [openStatusPickerId, setOpenStatusPickerId] = useState(null);
  const meRef = React.useRef(null);
  const selectedTeamRef = React.useRef(null);
  const marketPairsRef = React.useRef([]);
  // goalFlashRef: { [key]: timestamp } – key = `${homeId}_${awayId}_home|away`
  const goalFlashRef = React.useRef({});

  const backendUrl =
    (typeof import.meta !== "undefined" && import.meta.env?.VITE_BACKEND_URL) ||
    "";

  // Re-fetch this coach's saved rooms whenever the name changes while in "saved-game" mode.
  useEffect(() => {
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
  }, [name, joinMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // BUG-07 FIX: All socket listeners in a single effect with [] dep so they're
  // registered exactly once and cleaned up correctly on unmount.
  useEffect(() => {
    socket.on("teamsData", (data) => setTeams(data));
    socket.on("playerListUpdate", (data) => {
      setPlayers(data);
    });
    socket.on("mySquad", (data) => setMySquad(data));
    socket.on("marketUpdate", (data) => setMarketPairs(data));
    socket.on("auctionUpdate", (auction) => {
      const marketPlayer = marketPairsRef.current.find(
        (p) => p.id === auction.playerId,
      );
      if (marketPlayer) {
        setSelectedAuctionPlayer({ ...marketPlayer, ...auction });
      } else {
        setSelectedAuctionPlayer((prev) =>
          prev?.id === auction.playerId ? { ...prev, ...auction } : prev,
        );
      }
    });
    socket.on("auctionClosed", ({ playerId }) => {
      setSelectedAuctionPlayer((prev) => (prev?.id === playerId ? null : prev));
      setAuctionBid("");
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
      setCupDraw(data);
      setCupDrawRevealIdx(0);
      setShowCupDrawPopup(true);
    });
    socket.on("cupRoundResults", (data) => {
      setCupRoundResults(data);
      setShowCupResults(true);
    });
    socket.on("cupPenaltyShootout", (data) => {
      setCupPenaltyPopup(data);
    });
    socket.on("palmaresData", (data) => {
      setPalmares(data);
      setPalmaresTeamId(data.teamId);
    });
    socket.on("systemMessage", (msg) => addToast(msg));
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
    });

    socket.on("halfTimeResults", (data) => {
      setMatchResults(data);
      setLiveMinute(0);
      setSubsMade(0);
      setSubbedOut([]); // Reset substituted-out players for the new match
      setSwapSource(null);
      setShowHalftimePanel(true);
      setIsPlayingMatch(true);
      setActiveTab("live");
    });

    socket.on("matchActionRequired", (data) => {
      if (!meRef.current || data.teamId === meRef.current.teamId) {
        setMatchAction(data);
        setActiveTab("live");
      }
    });

    socket.on("matchActionResolved", () => {
      setMatchAction(null);
    });

    // BUG-11 FIX: matchResults clears showHalftimePanel (2nd half replay)
    socket.on("matchResults", (data) => {
      setMatchResults(data);
      setMatchweekCount(data.matchweek);
      setShowHalftimePanel(false);
      setLiveMinute(45);
      setIsPlayingMatch(true);
      setActiveTab("live");
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
      socket.off("joinError");
      socket.off("teamSquadData");
      socket.off("nextMatchSummary");
      socket.off("cupDrawStart");
      socket.off("cupRoundResults");
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
    selectedTeamRef.current = selectedTeam;
  }, [selectedTeam]);

  useEffect(() => {
    marketPairsRef.current = marketPairs;
  }, [marketPairs]);

  useEffect(() => {
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
  }, [me]);

  useEffect(() => {
    if (!savedSession || me?.teamId) return;
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
  }, [savedSession, me?.teamId]);

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
      const isSecondHalfReplay = !showHalftimePanel;

      if (
        liveMinute < 45 ||
        (liveMinute >= 45 && liveMinute < 90 && isSecondHalfReplay)
      ) {
        const timer = setTimeout(() => {
          setLiveMinute((m) => m + 1);
        }, 1000);
        return () => clearTimeout(timer);
      } else if (liveMinute === 45 && !isSecondHalfReplay) {
        setIsPlayingMatch(false);
      } else if (liveMinute >= 90) {
        const timer = setTimeout(() => {
          setIsPlayingMatch(false);
          setActiveTab("standings");
        }, 3000);
        return () => clearTimeout(timer);
      }
    }
  }, [isPlayingMatch, liveMinute, matchResults, showHalftimePanel]);

  // Detect per-minute events: flash goal score & play notification for human matches
  useEffect(() => {
    if (!isPlayingMatch || !matchResults?.results || liveMinute < 1) return;
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
  const handleSubSwap = useCallback(
    (playerId) => {
      if (subsMade >= MAX_MATCH_SUBS) return;
      setSwapSource((currentSource) => {
        if (!currentSource) {
          // First click – select the player going out (must be Titular or Suplente)
          return playerId;
        }
        if (currentSource === playerId) {
          // Deselect
          return null;
        }
        // Second click – execute swap
        setTactic((prevTactic) => {
          const prevPositions = prevTactic.positions || {};
          const sourceStatus = prevPositions[currentSource] || "Reserva";
          const targetStatus = prevPositions[playerId] || "Reserva";
          // Only proceed if swapping Titular ↔ non-Titular
          if (sourceStatus !== "Titular" && targetStatus !== "Titular") {
            return prevTactic; // nothing to do
          }
          const newPositions = { ...prevPositions };
          newPositions[currentSource] =
            targetStatus === "Suplente" ? "Suplente" : "Excluído";
          newPositions[playerId] = "Titular";
          const outgoingId =
            sourceStatus === "Titular" ? currentSource : playerId;
          setSubbedOut((prev) => [...prev, outgoingId]);
          setSubsMade((n) => n + 1);
          const next = { ...prevTactic, positions: newPositions };
          socket.emit("setTactic", next);
          return next;
        });
        return null;
      });
    },
    [subsMade], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // ── SQUAD STATUS PICKER ───────────────────────────────────────────────────
  const handleSetPlayerStatus = useCallback(
    (playerId, status) => {
      setTactic((prev) => {
        const newPositions = { ...prev.positions };

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
    [mySquad],
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
    if (!player || player.transfer_status !== "auction") return;
    setSelectedAuctionPlayer(player);
    const currentBid = Number(
      player.auction_highest_bid ||
        player.transfer_price ||
        player.value * 0.75,
    );
    setAuctionBid(
      String(currentBid + Math.max(1000, Math.round(currentBid * 0.05))),
    );
  }, []);

  const closeAuctionBid = useCallback(() => {
    setSelectedAuctionPlayer(null);
    setAuctionBid("");
  }, []);

  const submitAuctionBid = useCallback(() => {
    setSelectedAuctionPlayer((prev) => {
      if (!prev) return prev;
      const amount = Number(auctionBid);
      if (!Number.isFinite(amount) || amount <= 0) return prev;
      socket.emit("placeAuctionBid", { playerId: prev.id, bidAmount: amount });
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
              CashBall{" "}
              <span className="opacity-80">
                {String(seasonYear).slice(2)}/{String(seasonYear + 1).slice(2)}
              </span>
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
                {Math.min(liveMinute, 90)}'
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
            <button
              onClick={handleLogout}
              title="Terminar sessão"
              className="text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors rounded-lg px-3 py-2 text-xs font-black uppercase tracking-widest border border-zinc-700 hover:border-zinc-500"
            >
              Sair
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-350 mx-auto p-4 md:p-8">
        <div className="flex gap-3 mb-5 border-b border-zinc-800 pb-px overflow-x-auto justify-between">
          <div className="flex gap-3 overflow-x-auto">
            {["club", "standings", "market", "squad"].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2.5 font-bold text-sm md:text-base uppercase transition-colors border-b-4 whitespace-nowrap ${activeTab === tab ? "border-amber-500 text-white" : "border-transparent text-zinc-500 hover:text-zinc-300"}`}
              >
                {tab === "club"
                  ? "Clube"
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
            Jornada
          </button>
        </div>

        <div
          className={`grid grid-cols-1 gap-6 ${activeTab === "squad" ? "xl:grid-cols-[minmax(0,3fr)_260px]" : ""}`}
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
                    <p className="text-center text-zinc-300 font-black mb-5 text-sm uppercase tracking-widest">
                      {matchAction.type === "injury"
                        ? `Jogador lesionado: ${matchAction.injuredPlayer?.name || "?"}`
                        : "Escolhe o jogador para marcar o penalty"}
                    </p>

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
                  <div className="absolute inset-0 bg-zinc-950/95 z-50 p-6 flex flex-col backdrop-blur-sm">
                    <h2 className="text-3xl font-black text-amber-500 mb-2 tracking-widest text-center uppercase">
                      INTERVALO
                    </h2>
                    <p className="text-center text-zinc-400 font-bold mb-5 text-sm">
                      Seleciona na Esquerda e na Direita para Substituir
                      (Restam: {MAX_MATCH_SUBS - subsMade})
                    </p>

                    <div className="flex-1 overflow-y-auto mb-5 grid grid-cols-2 gap-4 bg-zinc-900/50 p-4 rounded-2xl border border-zinc-800">
                      <div>
                        <h3 className="text-emerald-500 font-black mb-3 uppercase tracking-widest text-center text-sm">
                          Em Campo (Titulares)
                        </h3>
                        <div className="space-y-1.5">
                          {annotatedSquad
                            .filter((p) => p.status === "Titular")
                            .map((p) => (
                              <div
                                key={p.id}
                                onClick={() => handleSubSwap(p.id)}
                                className={`px-3 py-2 rounded-lg border cursor-pointer font-bold text-sm transition-all flex justify-between select-none ${swapSource === p.id ? "bg-amber-500 text-zinc-950 border-amber-400 scale-[1.01]" : "bg-zinc-950 border-zinc-800 hover:border-emerald-500 hover:bg-zinc-800"}`}
                              >
                                <span>
                                  {p.name}{" "}
                                  <span className="text-[10px] opacity-70 ml-2">
                                    {p.position}
                                  </span>
                                </span>
                                <span className="opacity-50">{p.skill}</span>
                              </div>
                            ))}
                        </div>
                      </div>
                      <div>
                        <h3 className="text-zinc-500 font-black mb-3 uppercase tracking-widest text-center text-sm">
                          Banco (Suplentes)
                        </h3>
                        <div className="space-y-1.5">
                          {annotatedSquad
                            .filter((p) => p.status !== "Titular")
                            .map((p) => (
                              <div
                                key={p.id}
                                onClick={() => handleSubSwap(p.id)}
                                className={`px-3 py-2 rounded-lg border font-bold text-sm transition-all flex justify-between select-none ${p.isSubbedOut ? "opacity-30 cursor-not-allowed bg-zinc-950 border-zinc-800 grayscale" : swapSource === p.id ? "bg-amber-500 text-zinc-950 border-amber-400 scale-[1.01] cursor-pointer" : "bg-zinc-950 border-zinc-800 hover:border-zinc-500 hover:bg-zinc-800 cursor-pointer"}`}
                              >
                                <span>
                                  {p.name}{" "}
                                  <span className="text-[10px] opacity-70 ml-2">
                                    {p.position}
                                  </span>
                                </span>
                                <span
                                  className={`opacity-80 ${p.status === "Suplente" ? "text-emerald-400" : "text-zinc-600"}`}
                                >
                                  {p.isSubbedOut
                                    ? "SUBSTITUÍDO"
                                    : `${p.status} ${p.skill}`}
                                </span>
                              </div>
                            ))}
                        </div>
                      </div>
                    </div>

                    {/* BUG-06 FIX: Use handleHalftimeReady which always sends true */}
                    <button
                      onClick={handleHalftimeReady}
                      className={`w-full py-4 rounded-2xl text-lg font-black uppercase tracking-widest transition-all shadow-[0_0_30px_rgba(217,119,6,0.3)] ${players.find((p) => p.name === me.name)?.ready ? "bg-zinc-800 text-zinc-500" : "bg-amber-600 hover:bg-amber-500 text-zinc-950"}`}
                    >
                      {players.find((p) => p.name === me.name)?.ready
                        ? "A AGUARDAR ADVERSÁRIOS..."
                        : "CONFIRMAR E IR PARA A 2ª PARTE"}
                    </button>
                  </div>
                )}

                <div className="absolute top-6 right-6 flex items-center gap-3">
                  {isPlayingMatch && (
                    <div className="w-4 h-4 rounded-full bg-red-600 animate-pulse"></div>
                  )}
                </div>
                <h2 className="text-2xl font-black text-amber-500 mb-8 pb-4 border-b border-zinc-800">
                  Jornada em Direto{" "}
                  {liveMinute === 45 && !isPlayingMatch ? "(INTERVALO)" : ""}
                </h2>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {[1, 2, 3, 4].map((div) => (
                    <div key={div}>
                      <h3 className="text-zinc-500 font-black uppercase text-xs mb-2 border-b border-zinc-800/50">
                        {DIVISION_NAMES[div] || `Div ${div}`}
                      </h3>
                      <div className="space-y-1">
                        {matchResults.results
                          .filter(
                            (m) =>
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
                              flashHome && now - flashHome < 3500;
                            const awayFlashing =
                              flashAway && now - flashAway < 3500;

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
                                  <div className="px-3 py-1 bg-zinc-900 text-white text-center font-normal min-w-16 flex gap-0.5 items-center justify-center text-2xl">
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
                                          : "color 2.5s ease, font-weight 2.5s ease",
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
                                          : "color 2.5s ease, font-weight 2.5s ease",
                                      }}
                                    >
                                      {currentAway.length}
                                    </span>
                                  </div>
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
                                {/* Line 2: last event */}
                                <div className="px-2 py-0.5 text-zinc-400 truncate text-center border-t border-zinc-800/60 min-h-5">
                                  {lastEventText}
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
                <div className="bg-zinc-900 p-8 rounded-3xl border border-zinc-800 shadow-sm">
                  <h2 className="text-2xl font-black mb-8 text-emerald-400">
                    Resumo Financeiro
                  </h2>
                  <div className="space-y-6 text-lg">
                    <div className="flex justify-between border-b border-zinc-800 pb-4">
                      <span className="text-zinc-400 font-bold">
                        Orçamento Atual:
                      </span>
                      <span className="font-mono text-white text-2xl font-black">
                        {formatCurrency(teamInfo?.budget || 0)}
                      </span>
                    </div>
                    <div className="flex justify-between border-b border-zinc-800 pb-4">
                      <span className="text-zinc-400 font-bold">
                        Salários Activos (Semanais):
                      </span>
                      <span className="font-mono text-red-400 font-bold">
                        -{" "}
                        {formatCurrency(
                          mySquad.reduce((acc, p) => acc + p.wage, 0),
                        )}
                      </span>
                    </div>
                    <div className="flex justify-between border-b border-zinc-800 pb-4">
                      <span className="text-zinc-400 font-bold">
                        Bilheteiras (10€ \ lugar):
                      </span>
                      <span className="font-mono text-emerald-400 font-bold">
                        +{" "}
                        {formatCurrency(
                          (teamInfo?.stadium_capacity || 5000) * 10,
                        )}
                      </span>
                    </div>

                    <div className="flex justify-between border-b border-zinc-800 pb-4">
                      <span className="text-zinc-400 font-bold">
                        Lotação do Estádio:
                      </span>
                      <span className="font-mono text-white text-xl font-bold">
                        {teamInfo?.stadium_capacity?.toLocaleString() || 5000}{" "}
                        Lugares
                      </span>
                    </div>

                    <div className="flex justify-between pb-4">
                      <span className="text-zinc-400 font-bold">
                        Dívida ao Banco:
                      </span>
                      <span className="font-mono text-red-500 text-xl font-bold">
                        {formatCurrency(teamInfo?.loan_amount || 0)}{" "}
                        <span className="text-sm">(5% juros/sem)</span>
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8 pt-4 border-t border-zinc-800">
                      <div className="bg-zinc-950 p-4 rounded-xl border border-emerald-900 border-opacity-30">
                        <p className="text-sm font-bold text-amber-500 mb-3 uppercase tracking-widest">
                          +5.000 Lugares Estádio
                        </p>
                        <button
                          onClick={() => socket.emit("buildStadium")}
                          className="w-full bg-amber-600 hover:bg-amber-500 text-zinc-950 font-black py-3 rounded-lg text-sm transition-all uppercase"
                        >
                          Expandir (150.000€)
                        </button>
                      </div>

                      <div className="bg-zinc-950 p-4 rounded-xl border border-red-900 border-opacity-30">
                        <p className="text-sm font-bold text-red-500 mb-3 uppercase tracking-widest">
                          Apoio Bancário
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => socket.emit("takeLoan")}
                            className="flex-1 bg-red-900 hover:bg-red-800 text-white font-black py-3 rounded-lg text-xs transition-all uppercase"
                          >
                            Pedir +500K
                          </button>
                          <button
                            onClick={() => socket.emit("payLoan")}
                            className="flex-1 bg-emerald-900 hover:bg-emerald-800 text-white font-black py-3 rounded-lg text-xs transition-all uppercase"
                          >
                            Pagar -500K
                          </button>
                        </div>
                      </div>
                    </div>
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
                        <th className="px-3 py-3 text-center w-14 font-normal">
                          FORMA
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
                          className={`transition-colors group select-none ${ENABLE_ROW_BG ? POSITION_BG_CLASS[player.position] : ""} hover:bg-zinc-800/50`}
                        >
                          <td
                            className="px-3 py-2.5 text-center text-lg leading-none relative"
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
                                  : "❌"}
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
                                      ["Excluído", "❌"],
                                    ].map(([status, emoji]) => {
                                      const disabled =
                                        status === "Suplente" &&
                                        subsFull &&
                                        player.status !== "Suplente";
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
                                            disabled
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
                            className={`px-3 py-2.5 text-center text-sm tracking-wider ${POSITION_TEXT_CLASS[player.position] || "text-zinc-300"}`}
                          >
                            {POSITION_SHORT_LABELS[player.position] ||
                              player.position}
                          </td>
                          <td className="px-3 py-2.5 text-white text-sm md:text-base whitespace-nowrap">
                            {player.name}
                            {player.is_star &&
                              (player.position === "MID" ||
                                player.position === "ATK") && (
                                <span
                                  className="ml-1 text-amber-400 font-black text-xs"
                                  title="Craque"
                                >
                                  ★
                                </span>
                              )}
                          </td>
                          <td className="px-3 py-2.5 text-center text-zinc-100 font-normal">
                            <span className="inline-flex items-center justify-center bg-zinc-950 text-white px-2 py-1 rounded text-sm border border-zinc-800 font-normal">
                              {player.skill}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <div className="flex items-center gap-3">
                              <div className="flex-1 bg-zinc-950 rounded-full h-2.5 overflow-hidden">
                                <div
                                  className={`h-2.5 rounded-full ${player.form > 90 ? "bg-emerald-500" : player.form > 70 ? "bg-amber-500" : "bg-red-500"}`}
                                  style={{ width: `${player.form}%` }}
                                ></div>
                              </div>
                              <span className="text-xs font-normal tracking-wider text-zinc-400 w-8">
                                {player.form}
                              </span>
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-center text-emerald-400 font-normal">
                            {getPlayerStat(player, ["goals"])}
                          </td>
                          <td className="px-3 py-2.5 text-center text-red-400 font-normal">
                            {getPlayerStat(player, [
                              "reds",
                              "red_cards",
                              "reds_count",
                              "expulsions",
                            ])}
                          </td>
                          <td className="px-3 py-2.5 text-center text-orange-400 font-normal">
                            {getPlayerStat(player, [
                              "injuries",
                              "injury_count",
                              "lesoes",
                              "lesions",
                            ])}
                          </td>
                          <td className="px-3 py-2.5 text-center text-zinc-400 text-sm">
                            {player.nationality}
                          </td>
                          <td className="px-3 py-2.5 text-center font-mono text-zinc-300 text-xs md:text-sm">
                            {formatCurrency(player.wage || 0)}
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            {player.status === "Titular" ||
                            player.status === "Suplente" ? (
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
                                  title="Vender em Leilão"
                                  aria-label="Vender em Leilão"
                                  className="px-2 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-zinc-950 text-[10px] font-normal uppercase leading-none"
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
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-zinc-500 text-[10px] uppercase tracking-widest font-black">
                              Últimos 5
                            </p>
                            <div className="flex gap-1.5 font-black tracking-[0.35em] text-xs">
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
                          </div>
                          <p className="text-xs text-zinc-500 font-bold">
                            {nextMatchOpponent.last5 || "Sem histórico ainda."}
                          </p>
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

              <div className="bg-zinc-900 p-5 rounded-3xl border border-zinc-800">
                <h2 className="text-sm font-black mb-5 text-zinc-400 uppercase flex justify-between">
                  <span>Liga Activa</span>
                  <span className="text-amber-500">({players.length}/8)</span>
                </h2>
                <ul className="space-y-3">
                  {players.map((p, i) => (
                    <li
                      key={i}
                      className="flex justify-between items-center bg-zinc-950 border border-zinc-800/50 p-3 rounded-2xl"
                    >
                      <div className="min-w-0 pr-2">
                        <p className="font-bold text-sm text-white truncate">
                          {p.name}
                        </p>
                        <p className="text-xs font-bold uppercase text-zinc-500 truncate">
                          {teams.find((t) => t.id == p.teamId)?.name}
                        </p>
                      </div>
                      <div
                        className={`px-3 py-1 rounded border text-[10px] font-black uppercase ${p.ready ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "text-zinc-600 border-zinc-800"}`}
                      >
                        {p.ready ? "PRONTO" : "ESPERA"}
                      </div>
                    </li>
                  ))}
                </ul>
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
                      <th className="px-4 py-3 font-black text-center">
                        Forma
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {selectedTeamSquad.length === 0 ? (
                      <tr>
                        <td
                          colSpan="8"
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
                            {player.is_star &&
                              (player.position === "MID" ||
                                player.position === "ATK") && (
                                <span
                                  className="ml-1 text-amber-400 font-black text-xs"
                                  title="Craque"
                                >
                                  ★
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
                          <td className="px-4 py-2.5 text-center">
                            <div className="flex items-center gap-3">
                              <div className="flex-1 bg-zinc-950 rounded-full h-2.5 overflow-hidden">
                                <div
                                  className={`h-2.5 rounded-full ${player.form > 90 ? "bg-emerald-500" : player.form > 70 ? "bg-amber-500" : "bg-red-500"}`}
                                  style={{ width: `${player.form}%` }}
                                />
                              </div>
                              <span className="text-xs font-bold tracking-wider text-zinc-400 w-8">
                                {player.form}
                              </span>
                            </div>
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
          onClick={closeAuctionBid}
        >
          <div
            className="w-full max-w-xl bg-zinc-900 border border-amber-500/30 rounded-3xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 bg-linear-to-r from-amber-600 to-orange-500 text-zinc-950 flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.3em] font-black opacity-80">
                  Leilão em Curso
                </p>
                <h3 className="text-2xl font-black leading-tight">
                  {selectedAuctionPlayer.name}
                </h3>
                <p className="text-sm font-bold opacity-90">
                  {selectedAuctionPlayer.team_name || "Sem clube"} ·{" "}
                  {selectedAuctionPlayer.position}
                </p>
              </div>
              <button
                onClick={closeAuctionBid}
                className="shrink-0 px-4 py-2 rounded-xl bg-zinc-950/10 text-zinc-950 font-black uppercase text-sm hover:bg-zinc-950/20"
              >
                Fechar
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm font-bold">
                <div className="bg-zinc-950 rounded-2xl border border-zinc-800 p-4">
                  <div className="text-zinc-500 uppercase text-[11px] mb-1">
                    Lance actual
                  </div>
                  <div className="text-2xl font-black text-amber-400 font-mono">
                    {formatCurrency(
                      selectedAuctionPlayer.auction_highest_bid ||
                        selectedAuctionPlayer.transfer_price ||
                        0,
                    )}
                  </div>
                </div>
                <div className="bg-zinc-950 rounded-2xl border border-zinc-800 p-4">
                  <div className="text-zinc-500 uppercase text-[11px] mb-1">
                    Incremento mínimo
                  </div>
                  <div className="text-2xl font-black text-white font-mono">
                    {formatCurrency(
                      selectedAuctionPlayer.auction_min_increment || 0,
                    )}
                  </div>
                </div>
              </div>

              <div className="bg-zinc-950 rounded-2xl border border-zinc-800 p-4 space-y-3">
                <label className="block text-[11px] uppercase tracking-widest text-zinc-500 font-black">
                  Novo lance
                </label>
                <input
                  type="number"
                  min="0"
                  value={auctionBid}
                  onChange={(e) => setAuctionBid(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-white font-mono text-lg outline-none focus:border-amber-500"
                />
                <button
                  onClick={submitAuctionBid}
                  className="w-full bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black uppercase text-sm py-3 rounded-xl"
                >
                  Enviar lance
                </button>
              </div>

              <div className="text-xs text-zinc-400 font-medium leading-relaxed">
                O leilão termina automaticamente quando o tempo acabar. O melhor
                lance vence.
              </div>
            </div>
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
                const isMyPair =
                  fixture.homeTeam?.id ===
                    parseInt(
                      teams.find(
                        (t) => t.id === parseInt(window._myTeamId || 0),
                      )?.id || 0,
                    ) ||
                  fixture.homeTeam?.id === me?.teamId ||
                  fixture.awayTeam?.id === me?.teamId;

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
        <div
          className="fixed inset-0 z-150 bg-zinc-950/92 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setCupPenaltyPopup(null)}
        >
          <div
            className="w-full max-w-sm rounded-3xl border border-zinc-800 bg-zinc-900 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
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
                <span className="text-2xl font-black text-white px-3 py-1 bg-zinc-950 border border-zinc-800 rounded-xl">
                  {cupPenaltyPopup.homeGoals} – {cupPenaltyPopup.awayGoals}
                </span>
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
              {(cupPenaltyPopup.kicks || []).map((kick, idx) => (
                <div
                  key={idx}
                  className={`flex items-center gap-3 text-xs font-bold rounded-lg px-3 py-1.5 ${kick.team === "home" ? "bg-zinc-800/60" : "bg-zinc-950/60"}`}
                >
                  <span className="text-base">{kick.scored ? "⚽" : "❌"}</span>
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
            </div>
            <div className="px-6 pb-6 pt-2">
              <button
                onClick={() => setCupPenaltyPopup(null)}
                className="w-full rounded-2xl bg-amber-500 px-4 py-3 font-black uppercase tracking-widest text-zinc-950 hover:bg-amber-400"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
