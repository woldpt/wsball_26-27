import React, {
  useEffect,
  useLayoutEffect,
  useState,
  useMemo,
  useCallback,
  useRef,
} from "react";
import { socket } from "./socket";
import estadio5000 from "./assets/estadio5000.jpg";
import estadio15000 from "./assets/estadio15000.jpg";
import estadio30000 from "./assets/estadio30000.jpg";
import estadio50000 from "./assets/estadio50000.jpg";
import { COUNTRY_FLAGS } from "./countryFlags.js";
// ── Extracted components ───────────────────────────────────────────────────
import { PlayerLink } from "./components/shared/PlayerLink.jsx";
// eslint-disable-next-line no-unused-vars
import { motion, AnimatePresence } from "framer-motion";
import { WelcomeModal } from "./components/modals/WelcomeModal.jsx";
import { DismissalModal } from "./components/modals/DismissalModal.jsx";
import { SeasonEndModal } from "./components/modals/SeasonEndModal.jsx";
import { JobOfferModal } from "./components/modals/JobOfferModal.jsx";
import { PlayerHistoryModal } from "./components/modals/PlayerHistoryModal.jsx";
import { CupDrawPopup } from "./components/modals/CupDrawPopup.jsx";
import { PenaltySuspensePopup } from "./components/modals/PenaltySuspensePopup.jsx";
import { PenaltyShootoutPopup } from "./components/modals/PenaltyShootoutPopup.jsx";
import { MatchPanel } from "./components/modals/MatchPanel.jsx";
import { RefereePopup } from "./components/modals/RefereePopup.jsx";
import { GameDialog } from "./components/shared/GameDialog.jsx";
import { TeamSquadModal } from "./components/modals/TeamSquadModal.jsx";
import { TransferProposalModal } from "./components/modals/TransferProposalModal.jsx";
import { AuctionNotification } from "./components/ui/AuctionNotification.jsx";
import { NewsTicker } from "./components/ui/NewsTicker.jsx";
import { ChatWidget } from "./components/chat/ChatWidget.jsx";
// ── Utils & Constants ──────────────────────────────────────────────────────
import {
  DIVISION_NAMES,
  POSITION_SHORT_LABELS,
  POSITION_TEXT_CLASS,
  POSITION_BORDER_CLASS,
  MAX_MATCH_SUBS,
  DEFAULT_TACTIC,
} from "./constants/index.js";
import {
  playNotification,
  playGoalSound,
  playVarSound,
} from "./utils/audio.js";
import { formatCurrency } from "./utils/formatters.js";
import {
  loadSavedSession,
  hasSeenWelcome,
  hasSeenWelcomeThisSession,
  markWelcomeSeen as _markWelcomeSeen,
  markWelcomeSeenThisSession as _markWelcomeSeenThisSession,
} from "./utils/localStorage.js";
import {
  getPlayerStat,
  isPlayerAvailable,
  buildAutoPositions,
  getEffectiveLineup as _getEffectiveLineup,
  getMatchLastEventText,
  getFormationRequirements,
  getAvailablePositionCounts,
  isFormationAvailable,
} from "./utils/playerHelpers.js";
import {
  normalizeTeamId,
  isSameTeamId,
} from "./utils/teamHelpers.js";
import { useSocketListeners } from "./hooks/useSocketListeners.js";
// ── Extracted views ────────────────────────────────────────────────────────
import { StandingsTab } from "./views/StandingsTab.jsx";
import { BracketTab } from "./views/BracketTab.jsx";
import { TrainingTab } from "./views/TrainingTab.jsx";
import { CupTab } from "./views/CupTab.jsx";
import { CalendarioTab } from "./views/CalendarioTab.jsx";
import { ClubTab } from "./views/ClubTab.jsx";
import { FinancesTab } from "./views/FinancesTab.jsx";
import { PlayersTab } from "./views/PlayersTab.jsx";
import { MarketTab } from "./views/MarketTab.jsx";
// ── App-level constants ────────────────────────────────────────────────────
const TACTIC_FORMATIONS = [
  { value: "4-4-2", label: "4-4-2 Clássico" },
  { value: "4-3-3", label: "4-3-3 Ofensivo" },
  { value: "3-5-2", label: "3-5-2 Controlo" },
  { value: "5-3-2", label: "5-3-2 Autocarro" },
  { value: "4-5-1", label: "4-5-1 Catenaccio" },
  { value: "3-4-3", label: "3-4-3 Total" },
  { value: "4-2-4", label: "4-2-4 Avassalador" },
  { value: "5-4-1", label: "5-4-1 Ferrolho" },
];

if (window.location.search) {
  window.history.replaceState({}, "", window.location.pathname);
}

function App() {
  const savedSessionRef = React.useRef(loadSavedSession());
  const savedSession = savedSessionRef.current;
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
  const [sessionDisplaced, setSessionDisplaced] = useState(false);
  const [joinError, setJoinError] = useState("");
  const [toasts, setToasts] = useState([]);
  const [_lockedCoaches, setLockedCoaches] = useState([]);
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
  const [seasonYear, setSeasonYear] = useState(2026);
  const [activeTab, setActiveTab] = useState("club");
  const [topScorers, setTopScorers] = useState([]);
  const [marketPairs, setMarketPairs] = useState([]);
  const [marketPositionFilter, setMarketPositionFilter] = useState("all");
  const [marketSort, setMarketSort] = useState("quality-desc");
  const [selectedAuctionPlayer, setSelectedAuctionPlayer] = useState(null);
  const [isAuctionExpanded, setIsAuctionExpanded] = useState(false);
  const [auctionBid, setAuctionBid] = useState("");
  const [myAuctionBid, setMyAuctionBid] = useState(null); // sealed bid confirmation
  const [auctionResult, setAuctionResult] = useState(null); // result after auction closes
  const [nextMatchSummary, setNextMatchSummary] = useState(null);
  const [nextMatchSummaryLoading, setNextMatchSummaryLoading] = useState(false);
  const [refereePopup, setRefereePopup] = useState(null);
  const [gameDialog, setGameDialog] = useState(null);
  // Cup state
  const [cupDraw, setCupDraw] = useState(null); // { round, roundName, fixtures, humanInCup, season }
  const [showCupDrawPopup, setShowCupDrawPopup] = useState(false);
  const [cupDrawRevealIdx, setCupDrawRevealIdx] = useState(0); // how many teams revealed so far
  const [cupRoundResults, setCupRoundResults] = useState(null); // last cup round results
  const [, setShowCupResults] = useState(false);
  const [cupResultsFilter, setCupResultsFilter] = useState("all"); // "all" | "mine"
  const [cupPenaltyPopup, setCupPenaltyPopup] = useState(null); // shootout data
  const [cupPenaltyKickIdx, setCupPenaltyKickIdx] = useState(0); // how many kicks revealed
  const [pendingCupRoundResults, setPendingCupRoundResults] = useState(null); // held until penalty popup closes
  const [welcomeModal, setWelcomeModal] = useState(null); // { teamName }
  const [jobOfferModal, setJobOfferModal] = useState(null); // null | { fromTeam, toTeam, expiresAtMatchweek }
  const [dismissalModal, setDismissalModal] = useState(null); // null | { reason, teamName }
  const [seasonEndModal, setSeasonEndModal] = useState(null); // seasonEnd payload
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
  const [financeData, setFinanceData] = useState(null); // { totalTicketRevenue, totalTransferIncome, totalTransferExpenses, sponsorRevenue, homeMatchesPlayed, transferInList, transferOutList }
  const [showTransferSales, setShowTransferSales] = useState(false);
  const [showTransferPurchases, setShowTransferPurchases] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [selectedTeamSquad, setSelectedTeamSquad] = useState([]);
  const [selectedTeamLoading, setSelectedTeamLoading] = useState(false);
  const [transferProposalModal, setTransferProposalModal] = useState(null); // { player, suggestedPrice }
  const [cupBracketData, setCupBracketData] = useState(null);
  const [calendarData, setCalendarData] = useState(null);
  const [calFilter, setCalFilter] = useState("all"); // "all" | "league" | "cup"
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
  const [dragOverPlayerId, setDragOverPlayerId] = useState(null);
  const dragPlayerIdRef = useRef(null);
  const dragPlayerStatusRef = useRef(null);
  const [penaltySuspense, setPenaltySuspense] = useState(null); // { playerName, result, team }
  // Match detail modal (non-blocking overlay during live match)
  const [showMatchDetail, setShowMatchDetail] = useState(false);
  const [matchDetailFixture, setMatchDetailFixture] = useState(null);

  // Chat state
  const [chatOpen, setChatOpen] = useState(false);
  const [activeChatTab, setActiveChatTab] = useState("room");
  const [roomMessages, setRoomMessages] = useState([]);
  const [globalMessages, setGlobalMessages] = useState([]);
  const [globalPlayers, setGlobalPlayers] = useState([]);
  const [unreadRoom, setUnreadRoom] = useState(0);
  const [unreadGlobal, setUnreadGlobal] = useState(0);
  const [chatInput, setChatInput] = useState("");
  const chatMessagesRef = React.useRef(null);
  // Online players dropdown (header widget)
  const [showOnlineDropdown, setShowOnlineDropdown] = useState(false);
  const onlineDropdownRef = React.useRef(null);
  const [mobileSubMenu, setMobileSubMenu] = React.useState(null); // null | "gestao" | "competicao"
  // Sidebar collapsed state — persisted in localStorage, auto-collapses during Live matches
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(
    () => localStorage.getItem("sidebarCollapsed") === "true",
  );
  // Track user's preferred state before Live auto-collapse
  const sidebarUserPrefRef = React.useRef(sidebarCollapsed);

  const meRef = React.useRef(null);
  const isPlayingMatchRef = React.useRef(false);
  const isCupDrawRef = React.useRef(false);
  const teamsRef = React.useRef([]);
  const isLiveSimulationRef = React.useRef(false);
  const isCupExtraTimeRef = React.useRef(false);
  const pendingDismissalRef = React.useRef(null);
  // matchReplayActiveRef: true between receiving matchReplay and matchResults
  // Used to prevent gameState from resetting isPlayingMatch after a mid-match reconnect
  const matchReplayActiveRef = React.useRef(false);
  // liveMinuteRef: keeps a ref-copy of liveMinute for use inside socket closures
  const liveMinuteRef = React.useRef(0);
  const selectedTeamRef = React.useRef(null);
  const marketPairsRef = React.useRef([]);
  const mySquadRef = React.useRef([]);
  const tacticRef = React.useRef({ positions: {} });
  // goalFlashRef: { [key]: timestamp } – key = `${homeId}_${awayId}_home|away`
  const goalFlashRef = React.useRef({});
  const _formationSelectRef = React.useRef(null);

  const backendUrl =
    (typeof import.meta !== "undefined" && import.meta.env?.VITE_BACKEND_URL) ||
    "";
  const appCommitSha =
    (typeof import.meta !== "undefined" &&
      import.meta.env?.VITE_APP_COMMIT_SHA) ||
    "unknown";
  const appCommitCount =
    (typeof import.meta !== "undefined" &&
      import.meta.env?.VITE_APP_COMMIT_COUNT) ||
    "0";

  // Re-fetch this coach's saved rooms whenever the name changes while in "saved-game" mode.
  useEffect(() => {
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
      setAvailableSaves([]);
    }
  }, [name, joinMode]); // eslint-disable-line react-hooks/exhaustive-deps

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
    isCupExtraTimeRef.current = isCupExtraTime;
  }, [isCupExtraTime]);

  useEffect(() => {
    liveMinuteRef.current = liveMinute;
  }, [liveMinute]);

  useEffect(() => {
    teamsRef.current = teams;
  }, [teams]);

  // BUG-07 FIX: All socket listeners extracted to useSocketListeners hook.
  useSocketListeners(
    {
      setCalendarData,
      setTeams,
      setTeamForms,
      setPlayers,
      setMySquad,
      setMarketPairs,
      setSelectedAuctionPlayer,
      setIsAuctionExpanded,
      setAuctionBid,
      setMyAuctionBid,
      setAuctionResult,
      setNewsTickerItems,
      setTopScorers,
      setSeasonEndModal,
      setSeasonYear,
      setMatchweekCount,
      setSelectedTeamSquad,
      setSelectedTeamLoading,
      setNextMatchSummary,
      setNextMatchSummaryLoading,
      setCupDraw,
      setCupDrawRevealIdx,
      setShowCupDrawPopup,
      setCupRoundResults,
      setPendingCupRoundResults,
      setMatchResults,
      setLiveMinute,
      setSubsMade,
      setSubbedOut,
      setConfirmedSubs,
      setSwapSource,
      setSwapTarget,
      setIsCupMatch,
      setCupPreMatch,
      setCupMatchRoundName,
      setCupExtraTimeBadge,
      setCupActiveTeamIds,
      setActiveTab,
      setIsPlayingMatch,
      setIsLiveSimulation,
      setShowHalftimePanel,
      setIsCupExtraTime,
      setTactic,
      setIsMatchActionPending,
      setMatchAction,
      setPenaltySuspense,
      setInjuryCountdown,
      setCupPenaltyPopup,
      setCupPenaltyKickIdx,
      setCupBracketData,
      setPalmares,
      setPalmaresTeamId,
      setClubNews,
      setPlayerHistoryModal,
      setFinanceData,
      setLockedCoaches,
      setAwaitingCoaches,
      setRefereePopup,
      setGameDialog,
      setWelcomeModal,
      setJobOfferModal,
      setDismissalModal,
      setTransferProposalModal,
      setMe,
      setRoomCode,
      setJoinError,
      setJoining,
      setDisconnected,
      setSessionDisplaced,
      setRoomMessages,
      setGlobalMessages,
      setGlobalPlayers,
      setUnreadRoom,
      setUnreadGlobal,
      addToast,
      pushTickerItem,
    },
    {
      isPlayingMatchRef,
      isCupDrawRef,
      meRef,
      teamsRef,
      mySquadRef,
      tacticRef,
      liveMinuteRef,
      isLiveSimulationRef,
      isCupExtraTimeRef,
      pendingDismissalRef,
      matchReplayActiveRef,
      selectedTeamRef,
      marketPairsRef,
      injuryCountdownRef,
      goalFlashRef,
      forceGoalFlashRender,
      players,
    }
  );


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
    if (joinTimerRef.current) clearTimeout(joinTimerRef.current);
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
        if (["goal", "penalty_goal", "var_goal_pending"].includes(e.type)) {
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
        const hasGoal = events.some((e) =>
          ["goal", "penalty_goal", "var_goal_pending"].includes(e.type),
        );
        const hasVar = events.some((e) => e.type === "var_disallowed");
        const hasOtherEvent = events.some((e) =>
          ["red", "injury"].includes(e.type),
        );
        if (hasGoal) playGoalSound();
        else if (hasVar) playVarSound();
        else if (hasOtherEvent) playNotification();
      }
    });
    if (didFlashGoal) {
      forceGoalFlashRender((value) => value + 1);
    }
  }, [liveMinute, matchResults]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!mySquad.length) return;
    if (tactic.positions && Object.keys(tactic.positions).length > 0) return;

    const availableCounts = getAvailablePositionCounts(
      mySquad,
      matchweekCount + 1,
    );
    const fallbackFormation = isFormationAvailable(
      tactic.formation,
      availableCounts,
    )
      ? tactic.formation
      : TACTIC_FORMATIONS.find((f) =>
          isFormationAvailable(f.value, availableCounts),
        )?.value;
    if (!fallbackFormation) return;

    const autoPositions = buildAutoPositions(
      mySquad,
      fallbackFormation,
      matchweekCount + 1,
    );
    if (Object.keys(autoPositions).length === 0) return;

    setTactic((prev) => {
      if (prev.positions && Object.keys(prev.positions).length > 0) return prev;
      const next = {
        ...prev,
        formation: fallbackFormation,
        positions: autoPositions,
      };
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
    // Limpar refs de jogo activo para evitar estado residual ao mudar de sala
    matchReplayActiveRef.current = false;
    isLiveSimulationRef.current = false;
    isCupExtraTimeRef.current = false;
    if (injuryCountdownRef.current) {
      clearInterval(injuryCountdownRef.current);
      injuryCountdownRef.current = null;
    }
    setInjuryCountdown(null);
    setTeams([]);
    setTeamForms({});
    setPlayers([]);
    setMySquad([]);
    setMarketPairs([]);
    setTopScorers([]);
    setMatchResults(null);
    setMatchweekCount(0);
    setActiveTab("club");
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
    setDismissalModal(null);
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
    setCalendarData(null);
    setCalFilter("all");
    setCupBracketData(null);
    setSeasonYear(2026);
    setClubNews([]);
    setNewsTickerItems([]);
    setFinanceData(null);
    setJobOfferModal(null);
    setSeasonEndModal(null);
    setPenaltySuspense(null);
    setShowMatchDetail(false);
    setMatchDetailFixture(null);
    setRoomMessages([]);
    setGlobalMessages([]);
    setGlobalPlayers([]);
    setGameDialog(null);
    setUnreadRoom(0);
    setUnreadGlobal(0);
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
    window.location.reload();
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

  // Auto-close draw popup when no human is in the cup at all (fully NPC round)
  useEffect(() => {
    if (!showCupDrawPopup || !cupDraw || cupDraw.humanInCup) return;
    const totalTeams = (cupDraw.fixtures || []).length * 2;
    if (cupDrawRevealIdx >= totalTeams) {
      // Give enough time to read before auto-closing for NPC-only rounds
      const timer = setTimeout(() => {
        setShowCupDrawPopup(false);
        socket.emit("cupDrawAcknowledged");
      }, 8000);
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

  // After the penalty popup closes, apply any cup round results that arrived while it was open.
  useEffect(() => {
    if (cupPenaltyPopup !== null) return;
    if (!pendingCupRoundResults) return;
    setPendingCupRoundResults(null);
    setShowCupResults(false);
    setActiveTab("cup");
    setIsCupMatch(false);
    setCupPreMatch(false);
    setIsCupExtraTime(false);
    setCupExtraTimeBadge(false);
    setIsPlayingMatch(false);
    setMatchResults(null);
  }, [cupPenaltyPopup, pendingCupRoundResults]);

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

  // Close online dropdown when clicking outside
  useEffect(() => {
    if (!showOnlineDropdown) return;
    const close = (e) => {
      if (
        onlineDropdownRef.current &&
        !onlineDropdownRef.current.contains(e.target)
      ) {
        setShowOnlineDropdown(false);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [showOnlineDropdown]);

  const handleResolveMatchAction = (playerIdOrChoice) => {
    if (!matchAction) return;
    const payload = {
      actionId: matchAction.actionId,
      teamId: matchAction.teamId,
    };
    if (typeof playerIdOrChoice === "object" && playerIdOrChoice !== null) {
      payload.choice = playerIdOrChoice;
    } else {
      payload.playerId = playerIdOrChoice;
    }
    socket.emit("resolveMatchAction", payload);
    setMatchAction(null);
    setIsMatchActionPending(false);

    if (
      matchAction.type === "user_substitution" &&
      typeof playerIdOrChoice === "object" &&
      playerIdOrChoice !== null
    ) {
      const { playerOut, playerIn } = playerIdOrChoice;
      setTactic((prev) => {
        const newPositions = { ...prev.positions };
        delete newPositions[playerOut];
        newPositions[playerIn] = "Titular";
        const next = { ...prev, positions: newPositions };
        socket.emit("setTactic", next);
        return next;
      });
    }
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
      const availableCounts = getAvailablePositionCounts(
        mySquad,
        matchweekCount + 1,
      );
      if (!isFormationAvailable(formation, availableCounts)) return;

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
  const handleSelectOut = useCallback(
    (playerId) => {
      setSwapSource((prev) => (prev === playerId ? null : playerId));
      // Only clear target if we're not in bench-first mode (swapTarget already set, swapSource not yet)
      if (swapSource !== null) setSwapTarget(null);
    },
    [swapSource],
  );

  // Step 2: click a Suplente to mark as IN (can also be Step 1 — bench-first selection)
  const handleSelectIn = useCallback((playerId) => {
    setSwapTarget((prev) => (prev === playerId ? null : playerId));
  }, []);

  // Confirm the pending swap
  const handleConfirmSub = useCallback(() => {
    if (!swapSource || !swapTarget || subsMade >= MAX_MATCH_SUBS) return;
    // Prevent GR ↔ non-GR swaps
    const srcPlayer = mySquad.find((p) => p.id === swapSource);
    const tgtPlayer = mySquad.find((p) => p.id === swapTarget);
    if (
      srcPlayer &&
      tgtPlayer &&
      (srcPlayer.position === "GR") !== (tgtPlayer.position === "GR")
    )
      return;
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
  }, [swapSource, swapTarget, subsMade, mySquad]);

  // Reset pending selection without applying
  const handleResetSub = useCallback(() => {
    setSwapSource(null);
    setSwapTarget(null);
  }, []);

  // Reset ALL halftime substitutions (undo confirmed swaps + clear selection)
  const handleResetAllSubs = useCallback(() => {
    setTactic((prevTactic) => {
      const newPositions = { ...prevTactic.positions };
      // Revert each confirmed sub: out-player goes back to Titular, in-player to Suplente
      confirmedSubs.forEach(({ out: outId, in: inId }) => {
        newPositions[outId] = "Titular";
        newPositions[inId] = "Suplente";
      });
      const next = { ...prevTactic, positions: newPositions };
      socket.emit("setTactic", next);
      return next;
    });
    setSubbedOut([]);
    setConfirmedSubs([]);
    setSubsMade(0);
    setSwapSource(null);
    setSwapTarget(null);
  }, [confirmedSubs]);

  // ── SQUAD STATUS PICKER ───────────────────────────────────────────────────
  const handleSetPlayerStatus = useCallback(
    (playerId, status) => {
      setTactic((prev) => {
        const newPositions = { ...prev.positions };

        // Block: junior GRs cannot have their status changed
        const player = mySquad.find((p) => p.id === playerId);
        if (player?.isJunior) return prev;

        // Block: injured or suspended players cannot be convoked
        if (status === "Titular" || status === "Suplente") {
          if (player && !isPlayerAvailable(player, matchweekCount + 1))
            return prev;
        }

        // Block: no more than 11 titulares
        if (status === "Titular") {
          const currentTitulares = Object.entries(newPositions).filter(
            ([id, s]) => s === "Titular" && Number(id) !== playerId,
          ).length;
          if (currentTitulares >= 11) return prev; // silently ignore
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

  const handleSwapPlayerStatuses = useCallback(
    (draggedId, targetId) => {
      setTactic((prev) => {
        const newPositions = { ...prev.positions };
        const draggedStatus = newPositions[draggedId] ?? "Excluído";
        const targetStatus = newPositions[targetId] ?? "Excluído";

        // Block: junior GRs cannot be involved in swaps
        const draggedPlayer = mySquad.find((p) => p.id === draggedId);
        const targetPlayer = mySquad.find((p) => p.id === targetId);
        if (draggedPlayer?.isJunior || targetPlayer?.isJunior) return prev;

        // Titular swaps only allowed between same-position players
        if (draggedStatus === "Titular" || targetStatus === "Titular") {
          if (!draggedPlayer || !targetPlayer) return prev;
          if (draggedPlayer.position !== targetPlayer.position) return prev;
        }
        // Block injured/suspended from becoming Titular or Suplente
        if (targetStatus === "Titular" || targetStatus === "Suplente") {
          if (
            draggedPlayer &&
            !isPlayerAvailable(draggedPlayer, matchweekCount + 1)
          )
            return prev;
        }
        if (draggedStatus === "Titular" || draggedStatus === "Suplente") {
          if (
            targetPlayer &&
            !isPlayerAvailable(targetPlayer, matchweekCount + 1)
          )
            return prev;
        }
        newPositions[draggedId] = targetStatus;
        newPositions[targetId] = draggedStatus;
        return { ...prev, positions: newPositions };
      });
      setDragOverPlayerId(null);
      dragPlayerIdRef.current = null;
      dragPlayerStatusRef.current = null;
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
    setGameDialog({
      mode: "prompt",
      title: `Renovar Contrato — ${player.name}`,
      description: `Proposta de salário semanal (€/semana). Posição: ${player.position} · Skill: ${player.skill}`,
      defaultValue: String(defaultWage),
      confirmLabel: "Renovar",
      onConfirm: (val) => {
        const offeredWage = Number(val);
        if (!Number.isFinite(offeredWage) || offeredWage <= 0) return;
        socket.emit("renewContract", { playerId: player.id, offeredWage });
      },
      onCancel: () => {},
    });
  }, []);

  const listPlayerAuction = useCallback((player) => {
    const defaultPrice = Math.round((player.value || 0) * 0.8);
    setGameDialog({
      mode: "prompt",
      title: `Leilão — ${player.name}`,
      description: `Valor base de licitação (€). O jogador será leiloado ao melhor oferente.`,
      defaultValue: String(defaultPrice),
      confirmLabel: "Colocar em Leilão",
      onConfirm: (val) => {
        const price = Number(val);
        if (!Number.isFinite(price) || price <= 0) return;
        socket.emit("listPlayerForTransfer", {
          playerId: player.id,
          mode: "auction",
          startingPrice: price,
        });
      },
      onCancel: () => {},
    });
  }, []);

  const listPlayerFixed = useCallback((player) => {
    const defaultPrice = Math.round((player.value || 0) * 1.1);
    setGameDialog({
      mode: "prompt",
      title: `Venda Directa — ${player.name}`,
      description: `Preço fixo de transferência (€). Qualquer clube pode comprar imediatamente por este valor.`,
      defaultValue: String(defaultPrice),
      confirmLabel: "Colocar à Venda",
      onConfirm: (val) => {
        const fixedPrice = Number(val);
        if (!Number.isFinite(fixedPrice) || fixedPrice <= 0) return;
        socket.emit("listPlayerForTransfer", {
          playerId: player.id,
          mode: "fixed",
          price: fixedPrice,
        });
      },
      onCancel: () => {},
    });
  }, []);

  const removeFromTransferList = useCallback((player) => {
    setGameDialog({
      mode: "confirm",
      title: `Retirar da Lista`,
      description: `Tens a certeza que queres retirar ${player.name} da lista de transferências?`,
      confirmLabel: "Retirar",
      danger: true,
      onConfirm: () => socket.emit("removeFromTransferList", player.id),
      onCancel: () => {},
    });
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

    const myBudget = teams.find((t) => t.id == me?.teamId)?.budget ?? 0;

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

  const isMatchInProgress =
    isPlayingMatch || showHalftimePanel || !!matchAction;

  // Auto-collapse sidebar during Live; restore user preference when Live ends
  React.useEffect(() => {
    if (isMatchInProgress) {
      sidebarUserPrefRef.current = sidebarCollapsed;
      setSidebarCollapsed(true);
    } else {
      setSidebarCollapsed(sidebarUserPrefRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMatchInProgress]);

  if (!me || !me.teamId) {
    if (me && !me.teamId) {
      return (
        <>
          <div className="min-h-screen bg-surface text-on-surface flex flex-col items-center justify-center p-6 pb-24">
            <h1 className="text-5xl font-headline font-black text-primary mb-6 tracking-tight">
              CashBall <span className="text-on-surface">26/27</span>
            </h1>
            <div className="bg-surface-container p-8 rounded-md w-full max-w-md relative overflow-hidden shadow-2xl text-center">
              <div className="absolute top-0 inset-x-0 h-0.5 bg-linear-to-r from-primary via-primary to-transparent"></div>
              <p className="text-[10px] uppercase tracking-[0.35em] text-on-surface-variant font-bold mb-3">
                A entrar na sala
              </p>
              <p className="text-2xl font-headline font-black text-on-surface mb-1">
                A reconectar...
              </p>
              <p className="text-xs text-on-surface-variant font-medium tracking-wide">
                {me.name} · {me.roomCode?.toUpperCase()}
              </p>
            </div>
          </div>
        </>
      );
    }

    const registerPasswordMismatch =
      confirmPassword !== "" && password !== confirmPassword;

    return (
      <>
        <div className="min-h-screen bg-surface text-on-surface flex flex-col relative overflow-hidden pb-16">
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
                        placeholder="Ex: Cobra"
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
                    <button
                      onClick={() => {
                        setConfirmPassword("");
                        setAuthError("");
                        setJoinError("");
                        setAuthPhase("register");
                      }}
                      className="w-full border border-outline-variant/60 bg-surface-container hover:border-primary/40 text-on-surface py-3 rounded font-black text-xs uppercase tracking-[0.2em] transition-all"
                    >
                      Criar conta
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
                  <div className="p-6 space-y-5">
                    {/* Header: name + account actions */}
                    <div className="space-y-3">
                      <div className="text-center">
                        <p className="text-[10px] text-on-surface-variant uppercase font-black tracking-[0.4em] mb-1">
                          Sessão autenticada
                        </p>
                        <h2 className="text-xl font-headline font-black text-on-surface tracking-tight">
                          Olá, <span className="text-primary">{name}</span>
                        </h2>
                        <p className="text-xs text-on-surface-variant mt-0.5">
                          Como queres jogar hoje?
                        </p>
                      </div>
                      <div className="flex items-center justify-center gap-3">
                        <button
                          onClick={resetAuthFlow}
                          className="flex items-center gap-1 text-[10px] text-on-surface-variant hover:text-on-surface font-black uppercase tracking-widest px-3 py-1.5 rounded-full border border-outline-variant/30 hover:border-outline-variant transition-colors"
                        >
                          <span className="material-symbols-outlined text-[13px] leading-none">
                            swap_horiz
                          </span>
                          Trocar conta
                        </button>
                        <button
                          onClick={handleLogout}
                          className="flex items-center gap-1 text-[10px] text-error/60 hover:text-error font-black uppercase tracking-widest px-3 py-1.5 rounded-full border border-error/20 hover:border-error/40 transition-colors"
                          title="Terminar sessão completamente"
                        >
                          <span className="material-symbols-outlined text-[13px] leading-none">
                            logout
                          </span>
                          Sair
                        </button>
                      </div>
                    </div>

                    {/* Mode selector — stacked on mobile, row on sm+ */}
                    <div className="flex flex-col sm:flex-row gap-2">
                      {[
                        {
                          mode: "new-game",
                          icon: "add_circle",
                          label: "Novo Jogo",
                          sub: "Começa do zero",
                        },
                        {
                          mode: "saved-game",
                          icon: "history",
                          label: "Continuar",
                          sub: "Época guardada",
                        },
                        {
                          mode: "friend-room",
                          icon: "group_add",
                          label: "Amigos",
                          sub: "Código de sala",
                        },
                      ].map(({ mode, icon, label, sub }) => (
                        <button
                          key={mode}
                          onClick={() => selectJoinMode(mode)}
                          className={`flex-1 flex items-center sm:flex-col sm:items-start gap-3 sm:gap-1 rounded-xl border px-4 py-3 sm:p-4 text-left transition-all ${
                            joinMode === mode
                              ? "border-primary bg-primary/10"
                              : "border-outline-variant/20 bg-surface hover:border-outline-variant/50"
                          }`}
                        >
                          <span
                            className={`material-symbols-outlined text-[22px] shrink-0 leading-none ${joinMode === mode ? "text-primary" : "text-on-surface-variant"}`}
                          >
                            {icon}
                          </span>
                          <div className="min-w-0">
                            <p
                              className={`text-sm font-black leading-tight ${joinMode === mode ? "text-primary" : "text-on-surface"}`}
                            >
                              {label}
                            </p>
                            <p className="text-[10px] text-on-surface-variant leading-tight mt-0.5 hidden sm:block">
                              {sub}
                            </p>
                          </div>
                          {joinMode === mode && (
                            <span className="ml-auto sm:hidden material-symbols-outlined text-primary text-[18px] leading-none">
                              check_circle
                            </span>
                          )}
                        </button>
                      ))}
                    </div>

                    {/* Sub-panels */}
                    {joinMode === "new-game" && (
                      <div className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
                        <label className="block text-[10px] uppercase text-on-surface-variant font-bold tracking-[0.3em]">
                          Nome do novo jogo
                        </label>
                        <input
                          type="text"
                          className="w-full bg-surface border border-outline-variant p-3.5 rounded-lg text-on-surface text-base font-black outline-none transition-all placeholder:text-on-surface-variant/40 focus:ring-2 focus:ring-primary uppercase"
                          value={roomCode}
                          placeholder="INVERNO"
                          onChange={(e) =>
                            setRoomCode(e.target.value.toUpperCase())
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleJoin();
                          }}
                        />
                        <p className="text-xs text-on-surface-variant/70">
                          Recebes um clube aleatório da 4ª Divisão.
                        </p>
                      </div>
                    )}

                    {joinMode === "saved-game" && (
                      <div className="space-y-3 rounded-xl border border-outline-variant/20 bg-surface-container p-4">
                        <label className="block text-[10px] uppercase text-cyan-300 font-bold tracking-[0.3em]">
                          As tuas Salas Gravadas
                        </label>
                        {availableSaves.length === 0 ? (
                          <p className="text-on-surface-variant text-sm py-2">
                            {name
                              ? "Nenhum save encontrado para este treinador."
                              : "Introduz o teu nome para ver as tuas salas."}
                          </p>
                        ) : (
                          <div className="space-y-2 max-h-48 overflow-y-auto">
                            {availableSaves.map((save) => (
                              <div
                                key={save.code}
                                onClick={() => setRoomCode(save.code)}
                                className={`flex items-center justify-between gap-3 px-4 py-3 rounded-lg border cursor-pointer transition-all ${
                                  roomCode === save.code
                                    ? "border-cyan-500 bg-cyan-500/15 text-white"
                                    : "border-outline-variant/20 bg-surface text-on-surface-variant hover:border-outline-variant hover:text-on-surface"
                                }`}
                              >
                                <div className="flex flex-col flex-1 min-w-0">
                                  <span className="font-black text-sm uppercase tracking-widest truncate">
                                    {save.name}
                                  </span>
                                  <span className="text-[10px] text-on-surface-variant/60 font-mono">
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
                                        body: JSON.stringify({
                                          name,
                                          password,
                                        }),
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
                                            data.error ||
                                              "Erro ao apagar sala.",
                                          );
                                        }
                                      })
                                      .catch(() =>
                                        alert("Erro de ligação ao servidor."),
                                      );
                                  }}
                                  className="shrink-0 text-on-surface-variant/40 hover:text-error transition-colors p-1.5 rounded"
                                  title="Apagar sala"
                                >
                                  <span className="material-symbols-outlined text-[16px] leading-none">
                                    delete
                                  </span>
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {joinMode === "friend-room" && (
                      <div className="space-y-3 rounded-xl border border-outline-variant/20 bg-surface-container p-4">
                        <label className="block text-[10px] uppercase text-emerald-300 font-bold tracking-[0.3em]">
                          Código da Sala
                        </label>
                        <input
                          type="text"
                          className="w-full bg-surface border border-outline-variant p-3.5 rounded-lg text-on-surface text-base font-black outline-none transition-all placeholder:text-on-surface-variant/40 focus:ring-2 focus:ring-primary uppercase tracking-widest"
                          value={roomCode}
                          placeholder="INVERNO"
                          onChange={(e) =>
                            setRoomCode(e.target.value.toUpperCase())
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleJoin();
                          }}
                        />
                        <p className="text-xs text-on-surface-variant/70">
                          Pede o código ao teu amigo que criou a sala.
                        </p>
                      </div>
                    )}

                    {joinMode && (
                      <button
                        onClick={handleJoin}
                        disabled={!roomCode || joining}
                        className={`w-full disabled:bg-surface-container disabled:text-on-surface-variant py-4 rounded-lg font-black text-sm uppercase tracking-[0.2em] transition-all active:scale-95 ${
                          joinMode === "saved-game"
                            ? "bg-cyan-500 hover:bg-cyan-400 text-zinc-950"
                            : "bg-primary hover:brightness-110 text-on-primary"
                        }`}
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
                v1.0a-TESTING · commit #{appCommitCount} ({appCommitSha}) © 2026
                by Fábio Silva
              </span>
            </div>
          </footer>
        </div>
      </>
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

  // ── MATCH PANEL ──────────────────────────────────────────────────────────
  const panelMode = matchAction
    ? "action"
    : showHalftimePanel && !isPlayingMatch
      ? "halftime"
      : showMatchDetail
        ? "detail"
        : null;
  const panelFixture = showMatchDetail ? matchDetailFixture : myMatch || null;
  const panelIsReady = !!players.find((p) => p.name === me?.name)?.ready;

  const titulares = mySquad.filter((p) => tactic.positions[p.id] === "Titular");
  const availablePositionCounts = getAvailablePositionCounts(
    mySquad,
    matchweekCount + 1,
  );
  const formationAvailabilityByValue = Object.fromEntries(
    TACTIC_FORMATIONS.map(({ value }) => [
      value,
      isFormationAvailable(value, availablePositionCounts),
    ]),
  );
  const isLineupComplete =
    titulares.filter((p) => p.position === "GR").length === 1 &&
    titulares.filter((p) => p.position !== "GR").length === 10;

  const nextMatchOpponent = nextMatchSummary?.opponent || null;
  const nextMatchReferee = nextMatchSummary?.referee || null;

  // ── SEASON / YEAR HELPERS ────────────────────────────────────────────────
  // seasonYear is set from the server's game.year field (received in gameState).
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

  return (
    <div className="min-h-dvh bg-surface text-on-surface font-body tracking-tight">
      {sessionDisplaced && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 9999 }}
          className="flex flex-col items-center justify-center bg-black/90 gap-6 p-8"
        >
          <p className="text-5xl">📱</p>
          <h2 className="text-xl font-bold text-white text-center">
            Sessão aberta noutro dispositivo
          </h2>
          <p className="text-gray-400 text-sm text-center max-w-xs leading-relaxed">
            A tua sessão foi assumida por outro dispositivo ou janela.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-2 px-6 py-2 rounded-lg bg-yellow-500 text-black font-bold text-sm"
          >
            Retomar aqui
          </button>
        </div>
      )}
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
        className="fixed top-0 left-0 right-0 h-14 z-160 flex items-center"
        style={{
          background: teamInfo?.color_primary || "#131313",
          borderBottom: "1px solid #201f1f",
        }}
      >
        <div className="relative flex items-center justify-between w-full px-4 lg:px-6">
          {/* Left: brand + session info */}
          <div className="flex items-center gap-3">
            <h1
              className="text-base font-headline font-black tracking-tighter uppercase"
              style={{ color: teamInfo?.color_secondary || "#e5e2e1" }}
            >
              CashBall <span style={{ opacity: 0.55 }}>26/27</span>
            </h1>
            <span
              className="hidden md:block text-[10px] font-bold uppercase tracking-[0.2em]"
              style={{
                color: teamInfo?.color_secondary || "#e5e2e1",
                opacity: 0.7,
              }}
            >
              {seasonYear} · J{currentJornada} · {me.roomName || me.roomCode}
            </span>
          </div>

          {/* Center: live clock (absolute so it's always centered) */}
          {isMatchInProgress && (
            <div className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-none">
              {isPlayingMatch ? (
                <>
                  <span
                    className="text-xl font-headline font-black tabular-nums leading-none"
                    style={{ color: teamInfo?.color_secondary || "#e5e2e1" }}
                  >
                    {liveMinute}'
                  </span>
                  <span
                    className="text-[8px] font-bold uppercase tracking-widest"
                    style={{
                      color: teamInfo?.color_secondary || "#e5e2e1",
                      opacity: 0.55,
                    }}
                  >
                    {liveMinute > 90
                      ? "Prolongamento"
                      : liveMinute > 45
                        ? "2ª Parte"
                        : "1ª Parte"}
                  </span>
                </>
              ) : liveMinute === 45 && !isCupMatch ? (
                <span
                  className="text-xs font-black uppercase tracking-widest"
                  style={{
                    color: teamInfo?.color_secondary || "#e5e2e1",
                    opacity: 0.7,
                  }}
                >
                  Intervalo
                </span>
              ) : isCupMatch ? (
                <span
                  className="text-[10px] font-black uppercase tracking-widest"
                  style={{
                    color: teamInfo?.color_secondary || "#e5e2e1",
                    opacity: 0.7,
                  }}
                >
                  🏆 {cupMatchRoundName}
                  {cupPreMatch
                    ? " · Pré-Jogo"
                    : cupExtraTimeBadge
                      ? " · Prol."
                      : ""}
                </span>
              ) : null}
            </div>
          )}

          {/* Right: unified widget — sala + chat + sair */}
          <div className="flex items-center gap-1" ref={onlineDropdownRef}>
            {/* Manager identity (lg only) */}
            <div className="hidden lg:flex flex-col items-end mr-2">
              <span
                className="text-sm font-bold leading-tight"
                style={{ color: teamInfo?.color_secondary || "#e5e2e1" }}
              >
                {me.name}
              </span>
              <span
                className="text-xs leading-tight opacity-70"
                style={{ color: teamInfo?.color_secondary || "#e5e2e1" }}
              >
                {teamInfo?.name}
              </span>
            </div>

            {/* Online players button */}
            <div className="relative">
              <button
                onClick={() => {
                  setChatOpen(false);
                  setShowOnlineDropdown((v) => !v);
                }}
                title="Jogadores online"
                className="relative flex items-center justify-center w-9 h-9 rounded-lg hover:bg-white/10 transition-colors"
              >
                <span
                  className="material-symbols-outlined text-[20px] leading-none"
                  style={{ color: teamInfo?.color_secondary || "#e5e2e1" }}
                >
                  groups
                </span>
                {players.length > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 rounded-full bg-emerald-500 text-white text-[9px] font-black leading-none flex items-center justify-center px-1">
                    {players.length}
                  </span>
                )}
              </button>

              {/* Dropdown panel */}
              {showOnlineDropdown && (
                <div
                  className="absolute top-full right-0 mt-2 w-64 rounded-xl shadow-2xl border border-outline-variant/30 overflow-hidden z-50"
                  style={{ background: "#1a1a1a" }}
                >
                  <div
                    className="px-4 py-2.5 flex flex-col gap-1.5 border-b border-outline-variant/20"
                    style={{ background: "#111" }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase tracking-widest font-black text-on-surface-variant truncate">
                        {me.roomName || me.roomCode}
                      </span>
                      <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest shrink-0 ml-2">
                        {players.length} online
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-xs font-black text-primary tracking-widest">
                        {me.roomCode?.toUpperCase()}
                      </span>
                      <button
                        onClick={() => {
                          navigator.clipboard
                            .writeText(me.roomCode?.toUpperCase() || "")
                            .then(() => addToast("Código copiado!"))
                            .catch(() => {});
                        }}
                        className="text-[9px] font-black uppercase tracking-widest text-zinc-500 hover:text-primary transition-colors px-1.5 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700"
                        title="Copiar código de convite"
                      >
                        Copiar
                      </button>
                    </div>
                  </div>
                  <div className="divide-y divide-outline-variant/10 max-h-80 overflow-y-auto">
                    {[
                      ...players.map((p) => ({
                        name: p.name,
                        teamId: p.teamId,
                        online: true,
                        submitted: p.ready,
                      })),
                      ...awaitingCoaches
                        .filter((n) => !players.some((p) => p.name === n))
                        .map((n) => ({
                          name: n,
                          teamId: null,
                          online: false,
                          submitted: false,
                        })),
                    ].map((coach, i) => {
                      const coachTeam = coach.teamId
                        ? teams.find((t) => t.id == coach.teamId)
                        : null;
                      const statusLabel = !coach.online
                        ? "Offline"
                        : coach.submitted
                          ? "Vamos! ⚡"
                          : "Queimando neurónios 🧠";
                      const statusColor = !coach.online
                        ? "text-on-surface-variant/40"
                        : coach.submitted
                          ? "text-emerald-400"
                          : "text-amber-400";
                      return (
                        <div
                          key={coach.name || i}
                          className="flex items-center gap-3 px-4 py-2.5"
                        >
                          <span
                            className={`w-2 h-2 rounded-full shrink-0 ${
                              coach.online
                                ? coach.submitted
                                  ? "bg-emerald-400"
                                  : "bg-amber-400"
                                : "bg-surface-bright"
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
                          <span
                            className={`shrink-0 text-[10px] font-black ${statusColor}`}
                          >
                            {statusLabel}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Chat button */}
            <button
              onClick={() => {
                setShowOnlineDropdown(false);
                setChatOpen((v) => !v);
              }}
              title="Chat"
              className="relative flex items-center justify-center w-9 h-9 rounded-lg hover:bg-white/10 transition-colors"
            >
              <span
                className="material-symbols-outlined text-[20px] leading-none"
                style={{ color: teamInfo?.color_secondary || "#e5e2e1" }}
              >
                chat
              </span>
              {unreadRoom + unreadGlobal > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 rounded-full bg-rose-500 text-white text-[9px] font-black leading-none flex items-center justify-center px-1">
                  {unreadRoom + unreadGlobal > 9
                    ? "9+"
                    : unreadRoom + unreadGlobal}
                </span>
              )}
            </button>

            {/* Divider */}
            <div className="w-px h-5 bg-white/15 mx-1" />

            {/* SAIR */}
            <button
              onClick={() => {
                resetGameState();
                setMe(null);
                setAuthPhase("mode");
              }}
              title="Voltar à escolha de sala"
              className="flex items-center gap-1.5 hover:bg-white/10 transition-colors rounded-lg px-2 py-2 text-xs font-black uppercase tracking-widest"
              style={{ color: teamInfo?.color_secondary || "#e5e2e1" }}
            >
              <span className="material-symbols-outlined text-[18px] leading-none">
                logout
              </span>
              <span className="hidden md:block">Sair</span>
            </button>
          </div>
        </div>
      </header>

      {/* ── LEFT SIDEBAR ─────────────────────────────────────────────────── */}
      <nav
        className={`hidden lg:flex fixed left-0 top-14 bottom-0 bg-surface-container-low flex-col z-10 transition-all duration-200 ${sidebarCollapsed ? "w-14" : "w-64"}`}
      >
        {/* Toggle button */}
        <button
          onClick={() => {
            const next = !sidebarCollapsed;
            setSidebarCollapsed(next);
            sidebarUserPrefRef.current = next;
            try {
              localStorage.setItem("sidebarCollapsed", String(next));
            } catch {
              /* ignore */
            }
          }}
          title={sidebarCollapsed ? "Expandir sidebar" : "Recolher sidebar"}
          className="shrink-0 flex items-center justify-center h-10 border-b border-outline-variant/20 text-on-surface-variant hover:text-on-surface hover:bg-surface-bright transition-colors"
        >
          <span className="material-symbols-outlined text-[18px] leading-none">
            {sidebarCollapsed ? "chevron_right" : "chevron_left"}
          </span>
        </button>
        <div className="flex-1 px-2 py-2 space-y-0.5 overflow-y-auto overflow-x-hidden">
          <motion.div
            initial="hidden"
            animate="visible"
            variants={{
              hidden: {},
              visible: { transition: { staggerChildren: 0.055 } },
            }}
          >
            {[
              { key: "club", label: "Clube", icon: "groups_3" },
              { key: "finances", label: "Finanças", icon: "payments" },
              { key: "players", label: "Plantel", icon: "group" },
              { key: "training", label: "Treino", icon: "fitness_center" },
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
              {
                key: "bracket",
                label: "Taça",
                icon: "emoji_events",
              },
              { key: "market", label: "Mercado", icon: "swap_horiz" },
            ].map(({ key, label, icon }) => (
              <motion.button
                key={key}
                variants={{
                  hidden: { opacity: 0, x: -12 },
                  visible: {
                    opacity: 1,
                    x: 0,
                    transition: { duration: 0.2 },
                  },
                }}
                onClick={() => {
                  if (isMatchInProgress) return;
                  setActiveTab(key);
                  if (key === "bracket") socket.emit("requestCupBracket");
                  window.scrollTo(0, 0);
                }}
                title={sidebarCollapsed ? label : undefined}
                className={`w-full flex items-center gap-3 px-2 py-3 text-sm font-bold transition-all text-left ${sidebarCollapsed ? "justify-center" : ""} ${
                  isMatchInProgress
                    ? "text-on-surface-variant/25 cursor-not-allowed"
                    : activeTab === key
                      ? "bg-primary-container/20 text-primary border-l-4 border-primary"
                      : "text-on-surface-variant hover:bg-surface-bright hover:text-on-surface"
                }`}
              >
                <span className="material-symbols-outlined text-[20px] shrink-0 leading-none">
                  {icon}
                </span>
                {!sidebarCollapsed && <span>{label}</span>}
              </motion.button>
            ))}
          </motion.div>
          <div className="pt-2">
            <button
              onClick={() => {
                if (isMatchInProgress) return;
                setActiveTab("tactic");
                window.scrollTo(0, 0);
              }}
              title={
                sidebarCollapsed
                  ? isMatchInProgress
                    ? "AO VIVO"
                    : "JOGAR"
                  : undefined
              }
              className={`w-full flex items-center gap-3 px-2 py-3.5 text-sm font-black uppercase tracking-widest transition-all rounded-sm ${sidebarCollapsed ? "justify-center" : ""} ${
                isMatchInProgress
                  ? "bg-red-500/15 text-red-400 border border-red-500/30 cursor-not-allowed"
                  : activeTab === "tactic"
                    ? "bg-primary text-on-primary shadow-lg"
                    : "bg-primary/10 text-primary border border-primary/40 hover:bg-primary/20"
              }`}
            >
              <span className="material-symbols-outlined text-[20px] shrink-0 leading-none">
                {isMatchInProgress ? "sensors" : "strategy"}
              </span>
              {!sidebarCollapsed && (
                <>
                  <span className="flex-1 text-left">
                    {isMatchInProgress ? "AO VIVO" : "JOGAR"}
                  </span>
                  <span className="relative flex h-2 w-2 shrink-0">
                    <span
                      className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isMatchInProgress ? "bg-red-500" : activeTab === "tactic" ? "bg-on-primary/40" : "bg-primary"}`}
                    />
                    <span
                      className={`relative inline-flex rounded-full h-2 w-2 ${isMatchInProgress ? "bg-red-500" : activeTab === "tactic" ? "bg-on-primary/60" : "bg-primary"}`}
                    />
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      </nav>

      {/* ── MOBILE BOTTOM NAV ────────────────────────────────────────────── */}
      {/* ── Mobile bottom nav (< lg) ─────────────────────────────── */}
      {!isMatchInProgress && (
        <>
          {/* Overlay to close flyup when tapping outside */}
          {mobileSubMenu && (
            <div
              className="lg:hidden fixed inset-0 z-38"
              onClick={() => setMobileSubMenu(null)}
            />
          )}

          {/* Flyup sub-menu panel */}
          {mobileSubMenu && (
            <div className="lg:hidden fixed bottom-24 left-0 right-0 z-39 px-3">
              <div className="bg-surface-container-high border border-outline-variant/30 rounded-xl shadow-2xl overflow-hidden">
                {mobileSubMenu === "gestao" && (
                  <div className="flex">
                    {[
                      { key: "finances", label: "Finanças", icon: "payments" },
                      { key: "players", label: "Plantel", icon: "group" },
                      {
                        key: "training",
                        label: "Treino",
                        icon: "fitness_center",
                      },
                    ].map(({ key, label, icon }) => (
                      <button
                        key={key}
                        onClick={() => {
                          setActiveTab(key);
                          setMobileSubMenu(null);
                          window.scrollTo(0, 0);
                        }}
                        className={`flex-1 flex flex-col items-center justify-center gap-1 py-4 transition-colors ${
                          activeTab === key
                            ? "text-primary bg-primary/10"
                            : "text-on-surface-variant hover:bg-surface-bright"
                        }`}
                      >
                        <span className="material-symbols-outlined text-[24px] leading-none">
                          {icon}
                        </span>
                        <span className="text-[10px] font-black uppercase tracking-wider">
                          {label}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {mobileSubMenu === "competicao" && (
                  <div className="flex">
                    {[
                      {
                        key: "standings",
                        label: "Classif.",
                        icon: "leaderboard",
                      },
                      {
                        key: "calendario",
                        label: "Calendário",
                        icon: "calendar_month",
                      },
                      {
                        key: "bracket",
                        label: "Taça",
                        icon: "emoji_events",
                      },
                    ].map(({ key, label, icon }) => (
                      <button
                        key={key}
                        onClick={() => {
                          setActiveTab(key);
                          if (key === "bracket")
                            socket.emit("requestCupBracket");
                          setMobileSubMenu(null);
                          window.scrollTo(0, 0);
                        }}
                        className={`flex-1 flex flex-col items-center justify-center gap-1 py-4 transition-colors ${
                          activeTab === key
                            ? "text-primary bg-primary/10"
                            : "text-on-surface-variant hover:bg-surface-bright"
                        }`}
                      >
                        <span className="material-symbols-outlined text-[24px] leading-none">
                          {icon}
                        </span>
                        <span className="text-[10px] font-black uppercase tracking-wider">
                          {label}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Main nav bar — 5 buttons */}
          <nav className="lg:hidden fixed bottom-8 left-0 right-0 h-16 bg-surface-container-low/95 backdrop-blur-sm border-t border-outline-variant/30 z-40 flex">
            {/* Clube */}
            {(() => {
              const isActive = activeTab === "club";
              return (
                <motion.button
                  whileTap={{ scale: 0.88 }}
                  onClick={() => {
                    setActiveTab("club");
                    setMobileSubMenu(null);
                    window.scrollTo(0, 0);
                  }}
                  className={`flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-bold uppercase tracking-wider transition-colors relative ${
                    isActive ? "text-primary" : "text-on-surface-variant"
                  }`}
                >
                  {isActive && (
                    <motion.span
                      layoutId="mobileTabIndicator"
                      className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-primary rounded-b-full"
                      transition={{
                        type: "spring",
                        stiffness: 500,
                        damping: 35,
                      }}
                    />
                  )}
                  <span className="material-symbols-outlined text-[22px] leading-none">
                    groups_3
                  </span>
                  <span>Clube</span>
                </motion.button>
              );
            })()}

            {/* Gestão (Finanças + Plantel) */}
            {(() => {
              const isChildActive = ["finances", "players"].includes(activeTab);
              const isOpen = mobileSubMenu === "gestao";
              return (
                <motion.button
                  whileTap={{ scale: 0.88 }}
                  onClick={() => setMobileSubMenu(isOpen ? null : "gestao")}
                  className={`flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-bold uppercase tracking-wider transition-colors relative ${
                    isChildActive || isOpen
                      ? "text-primary"
                      : "text-on-surface-variant"
                  }`}
                >
                  {(isChildActive || isOpen) && (
                    <motion.span
                      layoutId="mobileTabIndicator"
                      className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-primary rounded-b-full"
                      transition={{
                        type: "spring",
                        stiffness: 500,
                        damping: 35,
                      }}
                    />
                  )}
                  <span className="material-symbols-outlined text-[22px] leading-none">
                    manage_accounts
                  </span>
                  <span>Gestão</span>
                </motion.button>
              );
            })()}

            {/* Competição (Classificações + Calendário) */}
            {(() => {
              const isChildActive = ["standings", "calendario"].includes(
                activeTab,
              );
              const isOpen = mobileSubMenu === "competicao";
              return (
                <motion.button
                  whileTap={{ scale: 0.88 }}
                  onClick={() => setMobileSubMenu(isOpen ? null : "competicao")}
                  className={`flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-bold uppercase tracking-wider transition-colors relative ${
                    isChildActive || isOpen
                      ? "text-primary"
                      : "text-on-surface-variant"
                  }`}
                >
                  {(isChildActive || isOpen) && (
                    <motion.span
                      layoutId="mobileTabIndicator"
                      className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-primary rounded-b-full"
                      transition={{
                        type: "spring",
                        stiffness: 500,
                        damping: 35,
                      }}
                    />
                  )}
                  <span className="material-symbols-outlined text-[22px] leading-none">
                    emoji_events
                  </span>
                  <span>Compet.</span>
                </motion.button>
              );
            })()}

            {/* Mercado */}
            {(() => {
              const isActive = activeTab === "market";
              return (
                <motion.button
                  whileTap={{ scale: 0.88 }}
                  onClick={() => {
                    setActiveTab("market");
                    setMobileSubMenu(null);
                    window.scrollTo(0, 0);
                  }}
                  className={`flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-bold uppercase tracking-wider transition-colors relative ${
                    isActive ? "text-primary" : "text-on-surface-variant"
                  }`}
                >
                  {isActive && (
                    <motion.span
                      layoutId="mobileTabIndicator"
                      className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-primary rounded-b-full"
                      transition={{
                        type: "spring",
                        stiffness: 500,
                        damping: 35,
                      }}
                    />
                  )}
                  <span className="material-symbols-outlined text-[22px] leading-none">
                    swap_horiz
                  </span>
                  <span>Mercado</span>
                </motion.button>
              );
            })()}

            {/* JOGAR */}
            {(() => {
              const isActive = activeTab === "tactic";
              const goldColor = "#d4af37";
              return (
                <motion.button
                  whileTap={{ scale: 0.88 }}
                  onClick={() => {
                    setActiveTab("tactic");
                    setMobileSubMenu(null);
                    window.scrollTo(0, 0);
                  }}
                  className="flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-black uppercase tracking-wider transition-colors relative"
                  style={{
                    color: isActive ? goldColor : goldColor,
                    opacity: isActive ? 1 : 0.75,
                  }}
                >
                  {isActive && (
                    <motion.span
                      layoutId="mobileTabIndicator"
                      style={{ backgroundColor: goldColor }}
                      className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-b-full"
                      transition={{
                        type: "spring",
                        stiffness: 500,
                        damping: 35,
                      }}
                    />
                  )}
                  <span className="material-symbols-outlined text-[22px] leading-none">
                    strategy
                  </span>
                  <span>JOGAR!</span>
                </motion.button>
              );
            })()}
          </nav>
        </>
      )}

      {/* LIVE bar during match (mobile) */}
      {isMatchInProgress && !showHalftimePanel && (
        <div className="lg:hidden fixed bottom-0 left-0 right-0 h-10 z-40 flex items-center justify-center bg-red-500/10 border-t border-red-500/30 backdrop-blur-sm">
          <span className="material-symbols-outlined text-red-400 text-[18px] leading-none mr-1.5 animate-pulse">
            sensors
          </span>
          <span className="text-red-400 text-[10px] font-black uppercase tracking-widest">
            AO VIVO
          </span>
        </div>
      )}

      <main
        className={`pt-14 pb-24 lg:pb-12 transition-all duration-200 ${sidebarCollapsed ? "lg:ml-14" : "lg:ml-64"}`}
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
                      <div>
                        <p className="text-white font-black text-lg leading-tight">
                          vs {nextMatchOpponent.name}
                        </p>
                        {(() => {
                          const coach = players.find(
                            (p) => p.teamId === nextMatchOpponent.id,
                          );
                          return coach ? (
                            <p className="text-[10px] text-amber-400 font-bold">
                              Treinador: {coach.name}
                            </p>
                          ) : null;
                        })()}
                      </div>
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
                  {/* Último confronto */}
                  {nextMatchOpponent.lastConfrontation &&
                    (() => {
                      const lc = nextMatchOpponent.lastConfrontation;
                      const resultClass =
                        lc.result === "V"
                          ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                          : lc.result === "E"
                            ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
                            : "bg-red-500/15 text-red-400 border-red-500/30";
                      const venueClass =
                        lc.venue === "Casa"
                          ? "bg-emerald-500/20 text-emerald-400"
                          : "bg-sky-500/20 text-sky-400";
                      const dateLabel =
                        lc.competition === "league"
                          ? `Época ${lc.season} · J${lc.matchweek}`
                          : `Época ${lc.season} · Taça (${lc.cupRoundName ?? `Ronda ${lc.cupRound}`})`;
                      const tieBreaker = lc.penalties
                        ? `(p.p. ${lc.penalties.goalsFor}–${lc.penalties.goalsAgainst})`
                        : lc.extraTime
                          ? `(a.p. ${lc.goalsFor + lc.extraTime.goalsFor}–${lc.goalsAgainst + lc.extraTime.goalsAgainst})`
                          : null;
                      return (
                        <div className="shrink-0">
                          <p className="text-[10px] uppercase tracking-widest text-on-surface-variant font-black mb-1">
                            Último Confronto
                          </p>
                          <div className="flex items-center gap-2">
                            <span
                              className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black border ${resultClass}`}
                            >
                              {lc.result}
                            </span>
                            <div className="flex flex-col leading-tight">
                              <div className="flex items-center gap-1.5">
                                <span className="text-on-surface font-black text-sm tabular-nums">
                                  {lc.goalsFor}–{lc.goalsAgainst}
                                </span>
                                <span
                                  className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded ${venueClass}`}
                                >
                                  {lc.venue}
                                </span>
                                {lc.competition === "cup" && (
                                  <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400">
                                    Taça
                                  </span>
                                )}
                              </div>
                              <span className="text-[10px] text-on-surface-variant font-bold">
                                {dateLabel}
                                {tieBreaker ? ` ${tieBreaker}` : ""}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  {/* Weather Forecast */}
                  {nextMatchSummary?.weatherForecast && (
                    <div className="shrink-0">
                      <p className="text-[10px] uppercase tracking-widest text-on-surface-variant font-black mb-1">
                        Previsão Meteo
                      </p>
                      <div className="flex items-center gap-1.5 px-3 py-2 rounded-md border border-outline-variant/30 bg-surface/60">
                        <span className="text-lg">
                          {nextMatchSummary.weatherForecast.emoji}
                        </span>
                        <span className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                          {nextMatchSummary.weatherForecast.condition === "sol"
                            ? "Sol"
                            : nextMatchSummary.weatherForecast.condition ===
                                "chuva"
                              ? "Chuva"
                              : nextMatchSummary.weatherForecast.condition ===
                                  "chuva_forte"
                                ? "Chuva forte"
                                : nextMatchSummary.weatherForecast.condition ===
                                    "vento"
                                  ? "Vento"
                                  : nextMatchSummary.weatherForecast
                                        .condition === "frio"
                                    ? "Frio"
                                    : nextMatchSummary.weatherForecast
                                          .condition === "nevoeiro"
                                      ? "Nevoeiro"
                                      : nextMatchSummary.weatherForecast
                                            .condition === "neve"
                                        ? "Neve"
                                        : "—"}
                        </span>
                      </div>
                    </div>
                  )}
                  {/* Referee */}
                  <div className="shrink-0">
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
          <div className="grid grid-cols-1 gap-6">
            <div>
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={activeTab}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{
                    duration: 0.22,
                    ease: [0.25, 0.46, 0.45, 0.94],
                  }}
                >
                  {activeTab === "live" && (matchResults || matchAction) && (
                    <div
                      className={`bg-surface-container text-on-surface font-body p-3 sm:p-6 border border-outline-variant/20 shadow-sm relative overflow-hidden${isMatchInProgress ? " rounded-lg" : " min-h-150 rounded-lg"}`}
                    >
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
                          const weatherEvent = matchEvents.find(
                            (e) => e.type === "weather",
                          );
                          const WEATHER_LABELS = {
                            "☀️": "Sol",
                            "🌧️": "Chuva",
                            "⛈️": "Chuva forte",
                            "💨": "Vento",
                            "🥶": "Frio",
                            "🌫️": "Nevoeiro",
                            "❄️": "Neve",
                          };

                          // If ET is running for other fixtures but my match was decided at 90', hide this block
                          if (isCupExtraTime) {
                            const reg90Home = matchEvents.filter(
                              (e) =>
                                e.minute <= 90 &&
                                e.type === "goal" &&
                                e.team === "home",
                            ).length;
                            const reg90Away = matchEvents.filter(
                              (e) =>
                                e.minute <= 90 &&
                                e.type === "goal" &&
                                e.team === "away",
                            ).length;
                            if (reg90Home !== reg90Away) return null;
                          }

                          const homeGoals = matchEvents.filter(
                            (e) =>
                              e.minute <= liveMinute &&
                              (e.type === "goal" ||
                                e.type === "penalty_goal") &&
                              e.team === "home",
                          );
                          const awayGoals = matchEvents.filter(
                            (e) =>
                              e.minute <= liveMinute &&
                              (e.type === "goal" ||
                                e.type === "penalty_goal") &&
                              e.team === "away",
                          );
                          const maxMinute = isCupExtraTime ? 120 : 90;
                          const progress = Math.min(
                            100,
                            (liveMinute / maxMinute) * 100,
                          );

                          return (
                            <div className="relative overflow-hidden mb-4 rounded-lg bg-surface-container-low border border-outline-variant/10">
                              {/* Stadium radial glow */}
                              <div
                                className="absolute inset-0 pointer-events-none"
                                style={{
                                  background: `radial-gradient(ellipse 90% 50% at 50% 0%, ${hInfo?.color_primary || "#333"}18 0%, transparent 70%)`,
                                }}
                              />

                              <div className="relative z-10 flex flex-col items-center px-4 pt-5 pb-4">
                                {/* Match label */}
                                <div className="flex items-center justify-between w-full mb-5">
                                  <div className="flex items-center gap-2">
                                    {isPlayingMatch && (
                                      <span className="w-2 h-2 rounded-full bg-error animate-pulse shrink-0" />
                                    )}
                                    <span className="text-[10px] uppercase tracking-[0.2em] text-on-surface-variant/50 font-black">
                                      {isCupMatch
                                        ? `Taça · ${cupMatchRoundName}`
                                        : `${DIVISION_NAMES[hInfo?.division] || ""} · Jornada ${matchResults.matchweek}`}
                                    </span>
                                  </div>
                                  {isPlayingMatch && !isMatchActionPending && (
                                    <button
                                      onClick={() =>
                                        socket.emit("request_substitution")
                                      }
                                      className="text-[10px] font-black uppercase tracking-widest bg-surface-container-high hover:bg-surface-bright text-zinc-300 px-3 py-1.5 rounded-sm border border-outline-variant/20 transition-colors flex items-center gap-1.5"
                                    >
                                      <span className="material-symbols-outlined text-[14px]">
                                        pause
                                      </span>
                                      Pausa / Sub
                                    </button>
                                  )}
                                </div>

                                {/* Stadium + attendance — above teams/score */}
                                {myMatch.attendance && (
                                  <div className="flex items-center justify-center gap-1 text-[10px] text-on-surface-variant/50 mb-3">
                                    <span className="text-zinc-400 text-[11px] font-bold">
                                      {hInfo?.stadium_name
                                        ? `${hInfo.stadium_name} `
                                        : ""}
                                      🏟{" "}
                                      {myMatch.attendance.toLocaleString(
                                        "pt-PT",
                                      )}{" "}
                                      adeptos
                                    </span>
                                  </div>
                                )}

                                {/* Weather badge */}
                                {weatherEvent && (
                                  <div className="flex items-center justify-center gap-1 text-[10px] text-on-surface-variant/50 mb-3">
                                    <span>{weatherEvent.emoji}</span>
                                    <span>
                                      {WEATHER_LABELS[weatherEvent.emoji] || ""}
                                    </span>
                                  </div>
                                )}

                                {/* Teams + Score row */}
                                <div className="flex justify-center items-start gap-4 sm:gap-10 w-full max-w-xl">
                                  {/* Home team */}
                                  <div className="flex flex-col items-center gap-2 flex-1 min-w-0">
                                    <div className="relative mb-1">
                                      <span
                                        className={`w-14 h-14 sm:w-20 sm:h-20 rounded-xl flex items-center justify-center text-base sm:text-xl font-black border-2 ${myMatch.homeTeamId === me.teamId ? "border-primary" : "border-outline-variant/20"}`}
                                        style={{
                                          backgroundColor:
                                            hInfo?.color_primary || "#333",
                                          color:
                                            hInfo?.color_secondary || "#fff",
                                        }}
                                      >
                                        {(hInfo?.name || "")
                                          .substring(0, 3)
                                          .toUpperCase()}
                                      </span>
                                      {myMatch.homeTeamId === me.teamId && (
                                        <div className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 bg-primary text-on-primary px-2 py-0.5 rounded-sm font-black text-[8px] tracking-widest uppercase whitespace-nowrap shadow-lg">
                                          {me.name}
                                        </div>
                                      )}
                                    </div>
                                    <h2 className="text-sm sm:text-base font-headline font-black tracking-tighter uppercase leading-none text-center mt-2 truncate w-full px-1">
                                      {hInfo?.name}
                                    </h2>
                                    {/* Home events */}
                                    <div className="flex flex-col items-start w-full gap-0.5">
                                      {matchEvents
                                        .filter(
                                          (e) =>
                                            e.minute <= liveMinute &&
                                            e.team === "home" &&
                                            [
                                              "goal",
                                              "penalty_goal",
                                              "own_goal",
                                              "var_disallowed",
                                              "var_goal_pending",
                                              "yellow",
                                              "red",
                                              "injury",
                                              "substitution",
                                              "halftime_sub",
                                            ].includes(e.type),
                                        )
                                        .sort((a, b) => a.minute - b.minute)
                                        .map((e, i) => {
                                          const isSub =
                                            e.type === "substitution" ||
                                            e.type === "halftime_sub";
                                          const icon =
                                            e.type === "goal" ||
                                            e.type === "penalty_goal" ||
                                            e.type === "var_goal_pending"
                                              ? "⚽"
                                              : e.type === "own_goal"
                                                ? "⚽🔙"
                                                : e.type === "var_disallowed"
                                                  ? "🚩"
                                                  : e.type === "yellow"
                                                    ? "🟨"
                                                    : e.type === "red"
                                                      ? "🟥"
                                                      : e.type === "injury"
                                                        ? "🚑"
                                                        : isSub
                                                          ? "🔁"
                                                          : "";
                                          const subOutName =
                                            e.type === "halftime_sub"
                                              ? e.outPlayerName
                                              : null;
                                          const name =
                                            e.playerName ||
                                            e.player_name ||
                                            e.player ||
                                            "?";
                                          const minuteLabel =
                                            e.type === "halftime_sub"
                                              ? "HT"
                                              : `${e.minute}'`;
                                          return (
                                            <div
                                              key={`${e.minute}-${e.type}-${e.playerId || name}-${i}`}
                                              className="flex items-center gap-1 text-[9px] leading-tight w-full"
                                            >
                                              <span className="text-on-surface-variant/40 tabular-nums shrink-0">
                                                {minuteLabel}
                                              </span>
                                              <span className="shrink-0">
                                                {icon}
                                              </span>
                                              <span
                                                className={`font-bold truncate min-w-0 ${e.type === "goal" || e.type === "penalty_goal" || e.type === "var_goal_pending" ? "text-primary" : e.type === "own_goal" ? "text-orange-400" : e.type === "var_disallowed" ? "text-amber-400/60 line-through" : e.type === "red" ? "text-red-400" : isSub ? "text-emerald-400/80" : "text-on-surface-variant/70"}`}
                                              >
                                                {isSub && subOutName ? (
                                                  <span className="opacity-60 line-through mr-0.5">
                                                    {subOutName}
                                                  </span>
                                                ) : null}
                                                <PlayerLink
                                                  playerId={e.playerId}
                                                >
                                                  {name}
                                                </PlayerLink>
                                              </span>
                                            </div>
                                          );
                                        })}
                                    </div>
                                  </div>

                                  {/* Score */}
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
                                      <button
                                        onClick={() => {
                                          setMatchDetailFixture(myMatch);
                                          setShowMatchDetail(true);
                                        }}
                                        className="flex flex-col items-center gap-1 shrink-0 cursor-pointer"
                                      >
                                        <div className="font-headline text-5xl sm:text-7xl font-black tracking-tighter flex items-center gap-3">
                                          <span
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
                                          <span className="text-on-surface/20 text-3xl sm:text-5xl">
                                            :
                                          </span>
                                          <span
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
                                        </div>
                                      </button>
                                    );
                                  })()}

                                  {/* Away team */}
                                  <div className="flex flex-col items-center gap-2 flex-1 min-w-0">
                                    <div className="relative mb-1">
                                      <span
                                        className={`w-14 h-14 sm:w-20 sm:h-20 rounded-xl flex items-center justify-center text-base sm:text-xl font-black border-2 ${myMatch.awayTeamId === me.teamId ? "border-primary" : "border-outline-variant/20"}`}
                                        style={{
                                          backgroundColor:
                                            aInfo?.color_primary || "#333",
                                          color:
                                            aInfo?.color_secondary || "#fff",
                                        }}
                                      >
                                        {(aInfo?.name || "")
                                          .substring(0, 3)
                                          .toUpperCase()}
                                      </span>
                                      {myMatch.awayTeamId === me.teamId && (
                                        <div className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 bg-primary text-on-primary px-2 py-0.5 rounded-sm font-black text-[8px] tracking-widest uppercase whitespace-nowrap shadow-lg">
                                          {me.name}
                                        </div>
                                      )}
                                    </div>
                                    <h2 className="text-sm sm:text-base font-headline font-black tracking-tighter uppercase leading-none text-center mt-2 truncate w-full px-1">
                                      {aInfo?.name}
                                    </h2>
                                    {/* Away events */}
                                    <div className="flex flex-col items-end w-full gap-0.5">
                                      {matchEvents
                                        .filter(
                                          (e) =>
                                            e.minute <= liveMinute &&
                                            e.team === "away" &&
                                            [
                                              "goal",
                                              "penalty_goal",
                                              "own_goal",
                                              "var_disallowed",
                                              "var_goal_pending",
                                              "yellow",
                                              "red",
                                              "injury",
                                              "substitution",
                                              "halftime_sub",
                                            ].includes(e.type),
                                        )
                                        .sort((a, b) => a.minute - b.minute)
                                        .map((e, i) => {
                                          const isSub =
                                            e.type === "substitution" ||
                                            e.type === "halftime_sub";
                                          const icon =
                                            e.type === "penalty_goal"
                                              ? "⚽(Pen)"
                                              : e.type === "goal" ||
                                                  e.type === "var_goal_pending"
                                                ? "⚽"
                                                : e.type === "own_goal"
                                                  ? "⚽🔙"
                                                  : e.type === "var_disallowed"
                                                    ? "🚩"
                                                    : e.type === "yellow"
                                                      ? "🟨"
                                                      : e.type === "red"
                                                        ? "🟥"
                                                        : e.type === "injury"
                                                          ? "🚑"
                                                          : isSub
                                                            ? "🔁"
                                                            : "";
                                          const subOutName =
                                            e.type === "halftime_sub"
                                              ? e.outPlayerName
                                              : null;
                                          const name =
                                            e.playerName ||
                                            e.player_name ||
                                            e.player ||
                                            "?";
                                          const minuteLabel =
                                            e.type === "halftime_sub"
                                              ? "HT"
                                              : `${e.minute}'`;
                                          return (
                                            <div
                                              key={`${e.minute}-${e.type}-${e.playerId || name}-${i}`}
                                              className="flex items-center gap-1 text-[9px] leading-tight w-full justify-end"
                                            >
                                              <span
                                                className={`font-bold truncate min-w-0 ${e.type === "goal" || e.type === "penalty_goal" || e.type === "var_goal_pending" ? "text-primary" : e.type === "own_goal" ? "text-orange-400" : e.type === "var_disallowed" ? "text-amber-400/60 line-through" : e.type === "red" ? "text-red-400" : isSub ? "text-emerald-400/80" : "text-on-surface-variant/70"}`}
                                              >
                                                {isSub && subOutName ? (
                                                  <span className="opacity-60 line-through mr-0.5">
                                                    {subOutName}
                                                  </span>
                                                ) : null}
                                                <PlayerLink
                                                  playerId={e.playerId}
                                                >
                                                  {name}
                                                </PlayerLink>
                                              </span>
                                              <span className="shrink-0">
                                                {icon}
                                              </span>
                                              <span className="text-on-surface-variant/40 tabular-nums shrink-0">
                                                {minuteLabel}
                                              </span>
                                            </div>
                                          );
                                        })}
                                    </div>
                                  </div>
                                </div>

                                {/* Progress bar + attendance */}
                                <div className="w-full max-w-xs sm:max-w-sm mt-5 space-y-1.5">
                                  <div className="relative h-1 bg-outline-variant/20 rounded-full overflow-hidden">
                                    <div
                                      className="h-full bg-primary transition-all duration-1000"
                                      style={{ width: `${progress}%` }}
                                    />
                                    {matchEvents
                                      .filter(
                                        (e) =>
                                          e.minute <= liveMinute &&
                                          [
                                            "goal",
                                            "penalty_goal",
                                            "own_goal",
                                            "red",
                                            "penalty_miss",
                                          ].includes(e.type),
                                      )
                                      .map((e, i) => {
                                        const isHomeEvent = e.team === "home";
                                        const dotColor =
                                          e.type === "goal" ||
                                          e.type === "penalty_goal" ||
                                          e.type === "own_goal"
                                            ? isHomeEvent
                                              ? hInfo?.color_primary || "#fff"
                                              : aInfo?.color_primary || "#aaa"
                                            : e.type === "red"
                                              ? "#ef4444"
                                              : "#a855f7"; // penalty_miss → purple
                                        return (
                                          <span
                                            key={`${e.minute}-${e.type}-${e.playerId || i}`}
                                            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2"
                                            style={{
                                              left: `${Math.min(98, Math.max(2, (e.minute / maxMinute) * 100))}%`,
                                            }}
                                          >
                                            <span
                                              className="block w-1.5 h-1.5 rounded-full"
                                              style={{
                                                backgroundColor: dotColor,
                                              }}
                                            />
                                          </span>
                                        );
                                      })}
                                  </div>
                                  <div className="flex justify-between text-[14px] text-on-surface-variant/30">
                                    <span>0'</span>
                                    <span className="font-bold text-primary/60">
                                      {liveMinute}'
                                    </span>
                                    <span>
                                      {isCupExtraTime ? "120'" : "90'"}
                                    </span>
                                  </div>
                                  {/* ── Commentary phrase ── */}
                                  {(() => {
                                    const latestWithText = [...matchEvents]
                                      .filter(
                                        (e) => e.minute <= liveMinute && e.text,
                                      )
                                      .sort((a, b) => b.minute - a.minute)[0];
                                    if (!latestWithText) return null;
                                    // Strip leading "[NN']" or "[HT]" prefix plus optional emoji
                                    const phrase = latestWithText.text
                                      .replace(/^\[(?:\d+'|HT)\]\s*\S*\s*/, "")
                                      .trim();
                                    if (!phrase) return null;
                                    const isGoal =
                                      latestWithText.type === "goal" ||
                                      latestWithText.type === "penalty_goal";
                                    return (
                                      <div
                                        key={`${latestWithText.minute}-${latestWithText.type}`}
                                        className="w-full text-center pt-3 pb-0.5 px-2"
                                        style={{
                                          animation:
                                            "commentaryFadeIn 0.6s ease",
                                        }}
                                      >
                                        <p
                                          className={`text-[11px] sm:text-[16px] leading-snug italic font-medium tracking-wide ${
                                            isGoal
                                              ? "text-primary/90"
                                              : "text-on-surface-variant/55"
                                          }`}
                                          style={{
                                            fontFamily:
                                              "Georgia, 'Times New Roman', serif",
                                          }}
                                        >
                                          "{phrase}"
                                        </p>
                                      </div>
                                    );
                                  })()}
                                </div>
                              </div>
                            </div>
                          );
                        })()}

                      {/* ── MULTIVIEW GRID ─────────────────────── */}
                      {!isCupMatch && (
                        <div className="overflow-x-auto mt-2">
                          <div className="grid grid-cols-2 sm:grid-cols-2 xl:grid-cols-4 gap-2 sm:gap-4 min-w-[360px]">
                            {[1, 2, 3, 4].map((div) => {
                              const myDiv = teams.find(
                                (t) => t.id === me.teamId,
                              )?.division;
                              const isMyDiv = myDiv === div;
                              const divMatches = matchResults.results
                                .filter(
                                  (m) =>
                                    teams.find((t) => t.id === m.homeTeamId)
                                      ?.division === div,
                                )
                                .filter(
                                  (m) =>
                                    m.homeTeamId !== me.teamId &&
                                    m.awayTeamId !== me.teamId,
                                );
                              return (
                                <div key={div} className="flex flex-col gap-2">
                                  {/* Division header */}
                                  <div
                                    className={`px-3 py-2 rounded-t-md border-b-2 bg-surface-container-high ${isMyDiv ? "border-primary" : "border-outline-variant/20"}`}
                                  >
                                    <h3
                                      className={`font-headline font-extrabold text-[9px] sm:text-[10px] lg:text-[11px] tracking-tighter uppercase ${isMyDiv ? "text-primary" : "text-on-surface/50"}`}
                                    >
                                      {DIVISION_NAMES[div] || `Div ${div}`}
                                    </h3>
                                  </div>
                                  {/* Match cards */}
                                  <div className="flex flex-col gap-1.5">
                                    {divMatches.length === 0 && (
                                      <div className="text-[10px] text-on-surface-variant/30 px-3 py-2 text-center italic">
                                        Sem jogos
                                      </div>
                                    )}
                                    {divMatches.map((match, idx) => {
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
                                      const lastHomeEvent =
                                        getMatchLastEventText(
                                          matchEvents,
                                          liveMinute,
                                          "home",
                                        );
                                      const lastAwayEvent =
                                        getMatchLastEventText(
                                          matchEvents,
                                          liveMinute,
                                          "away",
                                        );
                                      return (
                                        <button
                                          key={idx}
                                          onClick={() => {
                                            setMatchDetailFixture(match);
                                            setShowMatchDetail(true);
                                          }}
                                          className={`w-full text-left rounded-md overflow-hidden transition-colors ${isHumanMatch ? "bg-primary-container/10 border-l-2 border-primary/60" : "bg-surface-container hover:bg-surface-bright"}`}
                                        >
                                          <div className="flex justify-between items-center px-3 py-2">
                                            <span className="flex items-center gap-1.5 flex-1 min-w-0 pr-1">
                                              <span
                                                className="w-2 h-2 rounded-sm shrink-0"
                                                style={{
                                                  background:
                                                    hInfo?.color_primary ||
                                                    "#555",
                                                }}
                                              />
                                              <span className="flex flex-col min-w-0">
                                                <span
                                                  className={`text-[9px] sm:text-[10px] lg:text-[11px] font-bold truncate ${isHumanMatch && players.some((p) => p.teamId === match.homeTeamId) ? "text-primary" : "text-on-surface/80"}`}
                                                >
                                                  {hInfo?.name}
                                                </span>
                                                {(() => {
                                                  const c = players.find(
                                                    (p) =>
                                                      p.teamId ===
                                                      match.homeTeamId,
                                                  );
                                                  return c ? (
                                                    <span className="text-[8px] sm:text-[9px] text-amber-400 font-bold truncate leading-none">
                                                      {c.name}
                                                    </span>
                                                  ) : null;
                                                })()}
                                              </span>
                                            </span>
                                            <span className="font-headline font-black text-xs sm:text-sm shrink-0 flex items-center gap-1 px-1">
                                              <span
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
                                              <span className="text-on-surface/20 text-xs">
                                                -
                                              </span>
                                              <span
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
                                            </span>
                                            <span className="flex items-center gap-1.5 flex-1 min-w-0 pl-1 justify-end">
                                              <span className="flex flex-col min-w-0 items-end">
                                                <span
                                                  className={`text-[9px] sm:text-[10px] lg:text-[11px] font-bold truncate ${isHumanMatch && players.some((p) => p.teamId === match.awayTeamId) ? "text-primary" : "text-on-surface/80"}`}
                                                >
                                                  {aInfo?.name}
                                                </span>
                                                {(() => {
                                                  const c = players.find(
                                                    (p) =>
                                                      p.teamId ===
                                                      match.awayTeamId,
                                                  );
                                                  return c ? (
                                                    <span className="text-[8px] sm:text-[9px] text-amber-400 font-bold truncate leading-none">
                                                      {c.name}
                                                    </span>
                                                  ) : null;
                                                })()}
                                              </span>
                                              <span
                                                className="w-2 h-2 rounded-sm shrink-0"
                                                style={{
                                                  background:
                                                    aInfo?.color_primary ||
                                                    "#555",
                                                }}
                                              />
                                            </span>
                                          </div>
                                          {(lastHomeEvent || lastAwayEvent) && (
                                            <div className="flex px-3 pb-1.5 gap-1">
                                              <span className="flex-1 text-[8px] sm:text-[9px] text-on-surface-variant/40 truncate">
                                                {lastHomeEvent}
                                              </span>
                                              <span className="flex-1 text-[8px] sm:text-[9px] text-on-surface-variant/40 truncate text-right">
                                                {lastAwayEvent}
                                              </span>
                                            </div>
                                          )}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* ── CUP MULTIVIEW (single list, no division groups) ── */}
                      {isCupMatch && matchResults?.results && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
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
                                      <span className="text-sm font-bold text-on-surface truncate">
                                        {hInfo?.name}
                                      </span>
                                    </div>
                                    <button
                                      onClick={() => {
                                        setMatchDetailFixture(match);
                                        setShowMatchDetail(true);
                                      }}
                                      title="Ver detalhes da partida"
                                      className="px-3 py-1.5 bg-surface-container hover:bg-surface-bright text-on-surface text-center font-headline min-w-13 flex gap-1 items-center justify-center text-sm leading-none transition-colors cursor-pointer"
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
                                      <span className="text-sm font-bold text-on-surface truncate">
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
                                        {me.name}
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
                    <StandingsTab
                      teams={teams}
                      teamForms={teamForms}
                      topScorers={topScorers}
                      myTeamId={me.teamId}
                      completedJornada={completedJornada}
                      matchweekCount={matchweekCount}
                      palmares={palmares}
                      onTeamClick={handleOpenTeamSquad}
                      players={players}
                    />
                  )}

                  {activeTab === "bracket" && (
                    <BracketTab
                      bracketData={cupBracketData}
                      me={me}
                      players={players}
                    />
                  )}

                  {activeTab === "cup" && (
                    <CupTab
                      cupRoundResults={cupRoundResults}
                      cupDraw={cupDraw}
                      me={me}
                      teams={teams}
                      cupResultsFilter={cupResultsFilter}
                      setCupResultsFilter={setCupResultsFilter}
                    />
                  )}

                  {activeTab === "calendario" &&
                    <CalendarioTab
                      calendarData={calendarData}
                      me={me}
                      teams={teams}
                      seasonYear={seasonYear}
                      calFilter={calFilter}
                      setCalFilter={setCalFilter}
                      matchweekCount={matchweekCount}
                      handleOpenTeamSquad={handleOpenTeamSquad}
                    />}
                  {activeTab === "club" && (
                    <ClubTab
                      teamInfo={teamInfo}
                      seasonYear={seasonYear}
                      me={me}
                      currentBudget={currentBudget}
                      totalWeeklyWage={totalWeeklyWage}
                      loanAmount={loanAmount}
                      palmaresTeamId={palmaresTeamId}
                      palmares={palmares}
                      clubNews={clubNews}
                    />
                  )}

                  {activeTab === "finances" &&
                    <FinancesTab
                      financeData={financeData}
                      totalWeeklyWage={totalWeeklyWage}
                      completedJornada={completedJornada}
                      loanInterestPerWeek={loanInterestPerWeek}
                      loanAmount={loanAmount}
                      currentBudget={currentBudget}
                      seasonYear={seasonYear}
                      capacityRevPerGame={capacityRevPerGame}
                      mySquad={mySquad}
                      showTransferSales={showTransferSales}
                      setShowTransferSales={setShowTransferSales}
                      showTransferPurchases={showTransferPurchases}
                      setShowTransferPurchases={setShowTransferPurchases}
                      setGameDialog={setGameDialog}
                      teamInfo={teamInfo}
                    />}

                  {activeTab === "players" &&
                    <PlayersTab
                      mySquad={mySquad}
                      annotatedSquad={annotatedSquad}
                      totalWeeklyWage={totalWeeklyWage}
                      currentBudget={currentBudget}
                      teamInfo={teamInfo}
                      matchweekCount={matchweekCount}
                      isPlayingMatch={isPlayingMatch}
                      showHalftimePanel={showHalftimePanel}
                      renewPlayerContract={renewPlayerContract}
                      listPlayerAuction={listPlayerAuction}
                      listPlayerFixed={listPlayerFixed}
                      removeFromTransferList={removeFromTransferList}
                    />}

                  {activeTab === "training" && (
                    <TrainingTab
                      me={me}
                      players={players}
                      matchweekCount={matchweekCount}
                    />
                  )}

                  {activeTab === "tactic" && (
                    <div>
                      {/* Warnings full-width */}
                      {disconnected && (
                        <div className="mb-3 px-4 py-2 text-red-400 text-[10px] font-bold text-center bg-red-500/5 border border-red-500/20 rounded-lg">
                          ⚠️ Desligado — a reconectar...
                        </div>
                      )}
                      {nextMatchSummary?.isCup && !nextMatchOpponent ? (
                        <div className="bg-surface-container rounded-lg flex flex-col items-center gap-4 py-8 text-center px-6">
                          <p className="text-5xl">🏆</p>
                          <p className="text-on-surface-variant font-bold text-sm leading-relaxed">
                            Já foste eliminado desta ronda da Taça.
                            <br />
                            Avança para observar os jogos e seguir em frente.
                          </p>
                          {(() => {
                            const isReady = players.find(
                              (p) => p.name === me?.name,
                            )?.ready;
                            return (
                              <button
                                onClick={handleReady}
                                disabled={!!isReady}
                                className={`mt-2 px-8 py-3.5 font-headline font-black rounded-sm text-base uppercase tracking-widest transition-all ${
                                  isReady
                                    ? "bg-surface-bright text-on-surface-variant cursor-not-allowed opacity-60"
                                    : "bg-primary text-on-primary hover:brightness-110"
                                }`}
                              >
                                {isReady
                                  ? "⏳ A aguardar..."
                                  : "Ver jogos da Taça"}
                              </button>
                            );
                          })()}
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 xl:grid-cols-[220px_minmax(0,0.8fr)_minmax(0,0.8fr)_320px] gap-4 items-start">
                          {/* ── COL 1: CONTROLO ── */}
                          <div className="bg-surface-container rounded-lg overflow-hidden">
                            {/* Header */}
                            <div className="px-5 py-3 border-b border-outline-variant/20 flex items-center justify-between">
                              <span className="font-headline text-xs font-black tracking-[0.2em] uppercase text-on-surface-variant">
                                Formação
                              </span>
                              <button
                                className="text-[9px] uppercase tracking-widest font-black text-on-surface-variant/50 hover:text-error transition-colors"
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
                                Limpar
                              </button>
                            </div>

                            {/* Moral bar */}
                            {(() => {
                              const morale = teamInfo?.morale ?? 75;
                              const mc =
                                morale > 75
                                  ? "bg-primary"
                                  : morale >= 50
                                    ? "bg-tertiary"
                                    : "bg-error";
                              const ml =
                                morale > 75
                                  ? "Boa"
                                  : morale >= 50
                                    ? "Média"
                                    : "Baixa";
                              const tc =
                                morale > 75
                                  ? "text-primary"
                                  : morale >= 50
                                    ? "text-tertiary"
                                    : "text-error";
                              return (
                                <div className="px-4 py-2 border-b border-outline-variant/15 flex items-center gap-2">
                                  <span className="text-[9px] uppercase tracking-[0.2em] font-black text-on-surface-variant shrink-0">
                                    Moral
                                  </span>
                                  <div className="flex-1 bg-surface-bright rounded-full h-1.5 overflow-hidden">
                                    <div
                                      className={`h-full rounded-full transition-all duration-500 ${mc}`}
                                      style={{ width: `${morale}%` }}
                                    />
                                  </div>
                                  <span
                                    className={`text-[10px] font-black shrink-0 ${tc}`}
                                  >
                                    {ml}
                                  </span>
                                </div>
                              );
                            })()}

                            {/* Formation pill buttons */}
                            {(() => {
                              const hasLineup = titulares.length > 0;
                              const lastLabel = TACTIC_FORMATIONS.find(
                                (f) => f.value === tactic.formation,
                              )?.label;
                              return (
                                <div className="px-5 py-3 border-b border-outline-variant/15 flex flex-col gap-2">
                                  <div className="flex flex-wrap gap-2">
                                    {TACTIC_FORMATIONS.map(
                                      ({ value, label }) => {
                                        const isAvailable =
                                          formationAvailabilityByValue[
                                            value
                                          ] === true;
                                        return (
                                          <button
                                            key={value}
                                            disabled={!isAvailable}
                                            title={
                                              isAvailable
                                                ? undefined
                                                : "Indisponível: faltam jogadores aptos por posição"
                                            }
                                            onClick={() =>
                                              isAvailable &&
                                              handleAutoPick(value)
                                            }
                                            className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-widest transition-all rounded-sm ${
                                              !isAvailable
                                                ? "bg-surface-container-high text-on-surface-variant/35 border border-outline-variant/10 cursor-not-allowed"
                                                : hasLineup &&
                                                    tactic.formation === value
                                                  ? "bg-primary text-on-primary"
                                                  : "bg-surface-container-high hover:bg-surface-bright text-on-surface-variant hover:text-on-surface border border-outline-variant/20"
                                            }`}
                                          >
                                            {label}
                                          </button>
                                        );
                                      },
                                    )}
                                  </div>
                                  {!hasLineup && lastLabel && (
                                    <p className="text-[9px] text-on-surface-variant/40 font-bold uppercase tracking-widest">
                                      Última: {lastLabel}
                                    </p>
                                  )}
                                </div>
                              );
                            })()}

                            {/* Mentalidade strip */}
                            <div className="px-4 py-3 border-b border-outline-variant/15 bg-surface-container-high/20">
                              <span className="block text-[9px] uppercase tracking-[0.2em] font-black text-on-surface-variant mb-2">
                                Mentalidade
                              </span>
                              <div className="flex gap-1.5">
                                {[
                                  ["Defensive", "🛡️", "Defensivo"],
                                  ["Balanced", "⚖️", "Equilibrado"],
                                  ["Offensive", "⚔️", "Ofensivo"],
                                ].map(([val, icon, lbl]) => (
                                  <button
                                    key={val}
                                    onClick={() => updateTactic({ style: val })}
                                    className={`flex-1 flex flex-col items-center gap-0.5 py-2 rounded transition-all ${
                                      tactic.style === val
                                        ? "bg-primary text-on-primary shadow-md"
                                        : "bg-surface-container-high hover:bg-surface-bright text-on-surface-variant border border-outline-variant/20"
                                    }`}
                                  >
                                    <span className="text-base leading-none">
                                      {icon}
                                    </span>
                                    <span className="text-[9px] font-black uppercase tracking-wide leading-none">
                                      {lbl}
                                    </span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>
                          {/* ── COL 2: TITULARES ── */}
                          <div className="bg-surface-container rounded-lg overflow-hidden">
                            <div className="px-4 py-2.5 flex items-center justify-between bg-surface-container-high/60 border-b border-outline-variant/10">
                              <span className="text-[9px] uppercase tracking-[0.2em] font-black text-on-surface-variant">
                                Titulares
                              </span>
                              <span className="text-[9px] font-black">
                                <span
                                  className={
                                    annotatedSquad.filter(
                                      (p) => p.status === "Titular",
                                    ).length === 11
                                      ? "text-primary"
                                      : "text-emerald-400"
                                  }
                                >
                                  {
                                    annotatedSquad.filter(
                                      (p) => p.status === "Titular",
                                    ).length
                                  }
                                </span>
                                <span className="text-on-surface-variant">
                                  /11
                                </span>
                              </span>
                            </div>
                            <div className="divide-y divide-outline-variant/10">
                              {annotatedSquad
                                .filter((p) => p.status === "Titular")
                                .map((player) => (
                                  <div
                                    key={player.id}
                                    draggable={!player.isJunior}
                                    onDragStart={() => {
                                      if (player.isJunior) return;
                                      dragPlayerIdRef.current = player.id;
                                      dragPlayerStatusRef.current = "Titular";
                                    }}
                                    onDragOver={(e) => {
                                      e.preventDefault();
                                      setDragOverPlayerId(player.id);
                                    }}
                                    onDragLeave={() =>
                                      setDragOverPlayerId(null)
                                    }
                                    onDrop={(e) => {
                                      e.preventDefault();
                                      if (
                                        dragPlayerIdRef.current &&
                                        dragPlayerIdRef.current !== player.id
                                      )
                                        handleSwapPlayerStatuses(
                                          dragPlayerIdRef.current,
                                          player.id,
                                        );
                                      else {
                                        setDragOverPlayerId(null);
                                        dragPlayerIdRef.current = null;
                                      }
                                    }}
                                    onDragEnd={() => {
                                      setDragOverPlayerId(null);
                                      dragPlayerIdRef.current = null;
                                    }}
                                    className={`relative flex items-center gap-3 px-4 py-2.5 hover:bg-primary/5 transition-colors select-none ${player.isJunior ? "cursor-default" : "cursor-grab active:cursor-grabbing"} ${player.isUnavailable ? "opacity-50" : ""} ${dragOverPlayerId === player.id && dragPlayerIdRef.current !== player.id ? "bg-primary/10 ring-1 ring-primary/40" : ""}`}
                                  >
                                    <span
                                      className={`shrink-0 px-1.5 py-0.5 bg-surface-bright rounded-sm text-[9px] font-black border-l-2 ${POSITION_BORDER_CLASS[player.position] || "border-zinc-500"} ${POSITION_TEXT_CLASS[player.position] || "text-zinc-300"}`}
                                    >
                                      {POSITION_SHORT_LABELS[player.position]}
                                    </span>
                                    <span className="flex-1 text-sm font-bold text-on-surface truncate">
                                      <PlayerLink playerId={player.id}>
                                        {player.name}
                                      </PlayerLink>
                                      {!!player.is_star &&
                                        (player.position === "MED" ||
                                          player.position === "ATA") && (
                                          <span className="ml-1 text-amber-400 text-[10px]">
                                            ★
                                          </span>
                                        )}
                                      {player.isUnavailable &&
                                        (() => {
                                          const susp =
                                            player.suspension_until_matchweek ||
                                            0;
                                          const inj =
                                            player.injury_until_matchweek || 0;
                                          const cooldown =
                                            player.transfer_cooldown_until_matchweek ||
                                            0;
                                          const isSusp = susp > matchweekCount;
                                          const isInj = inj > matchweekCount;
                                          const isCooldown =
                                            !isSusp &&
                                            !isInj &&
                                            cooldown >= matchweekCount;
                                          if (isCooldown) {
                                            return (
                                              <span
                                                className="ml-1 text-xs"
                                                title="Em viagem — disponível na próxima jornada"
                                              >
                                                ✈️ (1)
                                              </span>
                                            );
                                          }
                                          const left = isSusp
                                            ? susp - matchweekCount
                                            : inj - matchweekCount;
                                          return (
                                            <span className="ml-1 text-xs">
                                              {isSusp ? "🟥" : "🩹"} ({left})
                                            </span>
                                          );
                                        })()}
                                    </span>
                                    <div className="shrink-0 grid grid-cols-3 items-center gap-x-2 text-right">
                                      <span className="text-sm font-black text-primary tabular-nums">
                                        {player.prev_skill != null &&
                                          player.prev_skill !==
                                            player.skill && (
                                            <span
                                              className={`mr-0.5 text-[9px] ${player.skill > player.prev_skill ? "text-emerald-400" : "text-red-400"}`}
                                            >
                                              {player.skill > player.prev_skill
                                                ? "▲"
                                                : "▼"}
                                            </span>
                                          )}
                                        {player.skill}
                                      </span>
                                      <span className="text-[12px] text-cyan-400/70 font-black tabular-nums">
                                        🛡️{player.resistance ?? "–"}
                                      </span>
                                      {(() => {
                                        const f = player.form ?? 100;
                                        return (
                                          <span
                                            className={`text-[9px] font-black ${
                                              f >= 115
                                                ? "text-emerald-400"
                                                : f <= 85
                                                  ? "text-rose-400"
                                                  : "text-on-surface-variant/40"
                                            }`}
                                          >
                                            {f >= 115
                                              ? "💪"
                                              : f <= 85
                                                ? "😩"
                                                : "👍"}
                                          </span>
                                        );
                                      })()}
                                    </div>
                                    {!player.isJunior && (
                                      <span
                                        className="shrink-0 w-6 h-6 rounded-full bg-emerald-500/15 flex items-center justify-center text-sm cursor-pointer"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setOpenStatusPickerId((prev) =>
                                            prev === player.id
                                              ? null
                                              : player.id,
                                          );
                                        }}
                                      >
                                        🟢
                                      </span>
                                    )}
                                    {!player.isJunior &&
                                      openStatusPickerId === player.id &&
                                      (() => {
                                        const subCount = Object.entries(
                                          tactic.positions,
                                        ).filter(
                                          ([id, s]) =>
                                            s === "Suplente" &&
                                            Number(id) !== player.id,
                                        ).length;
                                        const titCount = Object.entries(
                                          tactic.positions,
                                        ).filter(
                                          ([id, s]) =>
                                            s === "Titular" &&
                                            Number(id) !== player.id,
                                        ).length;
                                        const subsFull = subCount >= 5;
                                        const titularesFull = titCount >= 11;
                                        return (
                                          <div
                                            className="absolute right-4 top-full z-50 bg-surface-container-high border border-outline-variant/40 rounded-md shadow-xl p-1 flex flex-col gap-0.5 min-w-35"
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            {[
                                              ["Titular", "🟢", "Titular"],
                                              ["Suplente", "🟡", "Suplente"],
                                              [
                                                "Excluído",
                                                "⚫️",
                                                "Não convocado",
                                              ],
                                            ].map(([status, emoji, label]) => {
                                              const unavail =
                                                player.isUnavailable &&
                                                (status === "Titular" ||
                                                  status === "Suplente");
                                              const disabled =
                                                unavail ||
                                                (status === "Titular" &&
                                                  titularesFull &&
                                                  player.status !==
                                                    "Titular") ||
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
                                                  className={`px-3 py-2 rounded text-xs font-bold flex items-center gap-2 text-left ${disabled ? "opacity-40 cursor-not-allowed" : player.status === status ? "bg-surface-bright text-on-surface" : "hover:bg-surface-bright/60 text-on-surface-variant"}`}
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
                              {annotatedSquad.filter(
                                (p) => p.status === "Titular",
                              ).length === 0 && (
                                <p className="px-4 py-6 text-center text-[11px] text-on-surface-variant/40 font-bold">
                                  Nenhum titular designado
                                </p>
                              )}
                            </div>
                          </div>

                          {/* ── COL 3: SUPLENTES + NÃO CONVOCADOS ── */}
                          <div className="bg-surface-container rounded-lg overflow-hidden">
                            <div className="px-4 py-2.5 flex items-center justify-between bg-surface-container-high/60 border-b border-outline-variant/10">
                              <span className="text-[9px] uppercase tracking-[0.2em] font-black text-on-surface-variant">
                                Suplentes
                              </span>
                              <span className="text-[9px] font-black">
                                <span className="text-amber-400">
                                  {
                                    annotatedSquad.filter(
                                      (p) =>
                                        p.status === "Suplente" &&
                                        !p.isUnavailable,
                                    ).length
                                  }
                                </span>
                                <span className="text-on-surface-variant">
                                  /5
                                </span>
                              </span>
                            </div>
                            <div className="divide-y divide-outline-variant/10">
                              {annotatedSquad
                                .filter(
                                  (p) =>
                                    p.status === "Suplente" && !p.isUnavailable,
                                )
                                .map((player) => (
                                  <div
                                    key={player.id}
                                    draggable={!player.isJunior}
                                    onDragStart={() => {
                                      if (player.isJunior) return;
                                      dragPlayerIdRef.current = player.id;
                                      dragPlayerStatusRef.current = "Suplente";
                                    }}
                                    onDragOver={(e) => {
                                      e.preventDefault();
                                      setDragOverPlayerId(player.id);
                                    }}
                                    onDragLeave={() =>
                                      setDragOverPlayerId(null)
                                    }
                                    onDrop={(e) => {
                                      e.preventDefault();
                                      if (
                                        dragPlayerIdRef.current &&
                                        dragPlayerIdRef.current !== player.id
                                      )
                                        handleSwapPlayerStatuses(
                                          dragPlayerIdRef.current,
                                          player.id,
                                        );
                                      else {
                                        setDragOverPlayerId(null);
                                        dragPlayerIdRef.current = null;
                                      }
                                    }}
                                    onDragEnd={() => {
                                      setDragOverPlayerId(null);
                                      dragPlayerIdRef.current = null;
                                    }}
                                    className={`relative flex items-center gap-3 px-4 py-2.5 hover:bg-primary/5 transition-colors select-none ${player.isJunior ? "cursor-default" : "cursor-grab active:cursor-grabbing"} ${player.isUnavailable ? "opacity-35" : ""} ${dragOverPlayerId === player.id && dragPlayerIdRef.current !== player.id ? "bg-amber-500/10 ring-1 ring-amber-500/40" : ""}`}
                                  >
                                    <span
                                      className={`shrink-0 px-1.5 py-0.5 bg-surface-bright rounded-sm text-[9px] font-black border-l-2 ${POSITION_BORDER_CLASS[player.position] || "border-zinc-500"} ${POSITION_TEXT_CLASS[player.position] || "text-zinc-300"}`}
                                    >
                                      {POSITION_SHORT_LABELS[player.position]}
                                    </span>
                                    <span className="flex-1 text-sm font-medium text-on-surface truncate">
                                      <PlayerLink playerId={player.id}>
                                        {player.name}
                                      </PlayerLink>
                                      {!!player.is_star &&
                                        (player.position === "MED" ||
                                          player.position === "ATA") && (
                                          <span className="ml-1 text-amber-400 text-[10px]">
                                            ★
                                          </span>
                                        )}
                                      {player.isUnavailable &&
                                        (() => {
                                          const susp =
                                            player.suspension_until_matchweek ||
                                            0;
                                          const inj =
                                            player.injury_until_matchweek || 0;
                                          const cooldown =
                                            player.transfer_cooldown_until_matchweek ||
                                            0;
                                          const isSusp = susp > matchweekCount;
                                          const isInj = inj > matchweekCount;
                                          const isCooldown =
                                            !isSusp &&
                                            !isInj &&
                                            cooldown >= matchweekCount;
                                          if (isCooldown) {
                                            return (
                                              <span
                                                className="ml-1 text-xs"
                                                title="Em viagem — disponível na próxima jornada"
                                              >
                                                ✈️ (1)
                                              </span>
                                            );
                                          }
                                          const left = isSusp
                                            ? susp - matchweekCount
                                            : inj - matchweekCount;
                                          return (
                                            <span className="ml-1 text-xs">
                                              {isSusp ? "🟥" : "🩹"} ({left})
                                            </span>
                                          );
                                        })()}
                                    </span>
                                    <div className="shrink-0 grid grid-cols-3 items-center gap-x-2 text-right">
                                      <span className="text-sm font-black text-primary tabular-nums">
                                        {player.prev_skill != null &&
                                          player.prev_skill !==
                                            player.skill && (
                                            <span
                                              className={`mr-0.5 text-[9px] ${player.skill > player.prev_skill ? "text-emerald-400" : "text-red-400"}`}
                                            >
                                              {player.skill > player.prev_skill
                                                ? "▲"
                                                : "▼"}
                                            </span>
                                          )}
                                        {player.skill}
                                      </span>
                                      <span className="text-[12px] text-cyan-400/70 font-black tabular-nums">
                                        🛡️{player.resistance ?? "–"}
                                      </span>
                                      {(() => {
                                        const f = player.form ?? 100;
                                        return (
                                          <span
                                            className={`text-[9px] font-black ${
                                              f >= 115
                                                ? "text-emerald-400"
                                                : f <= 85
                                                  ? "text-rose-400"
                                                  : "text-on-surface-variant/40"
                                            }`}
                                          >
                                            {f >= 115
                                              ? "💪"
                                              : f <= 85
                                                ? "😩"
                                                : "👍"}
                                          </span>
                                        );
                                      })()}
                                    </div>
                                    {!player.isJunior && (
                                      <span
                                        className="shrink-0 w-6 h-6 rounded-full bg-amber-500/15 flex items-center justify-center text-sm cursor-pointer"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setOpenStatusPickerId((prev) =>
                                            prev === player.id
                                              ? null
                                              : player.id,
                                          );
                                        }}
                                      >
                                        🟡
                                      </span>
                                    )}
                                    {!player.isJunior &&
                                      openStatusPickerId === player.id &&
                                      (() => {
                                        const titCount = Object.entries(
                                          tactic.positions,
                                        ).filter(
                                          ([id, s]) =>
                                            s === "Titular" &&
                                            Number(id) !== player.id,
                                        ).length;
                                        const subCount = Object.entries(
                                          tactic.positions,
                                        ).filter(
                                          ([id, s]) =>
                                            s === "Suplente" &&
                                            Number(id) !== player.id,
                                        ).length;
                                        const titularesFull = titCount >= 11;
                                        const subsFull = subCount >= 5;
                                        return (
                                          <div
                                            className="absolute right-4 top-full z-50 bg-surface-container-high border border-outline-variant/40 rounded-md shadow-xl p-1 flex flex-col gap-0.5 min-w-35"
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            {[
                                              ["Titular", "🟢", "Titular"],
                                              ["Suplente", "🟡", "Suplente"],
                                              [
                                                "Excluído",
                                                "⚫️",
                                                "Não convocado",
                                              ],
                                            ].map(([status, emoji, label]) => {
                                              const disabled =
                                                (status === "Titular" &&
                                                  titularesFull &&
                                                  player.status !==
                                                    "Titular") ||
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
                                                  className={`px-3 py-2 rounded text-xs font-bold flex items-center gap-2 ${disabled ? "opacity-40 cursor-not-allowed" : player.status === status ? "bg-surface-bright text-on-surface" : "hover:bg-surface-bright/60 text-on-surface-variant"}`}
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
                              {annotatedSquad.filter(
                                (p) => p.status === "Suplente",
                              ).length === 0 && (
                                <p className="px-4 py-4 text-center text-[11px] text-on-surface-variant/40 font-bold">
                                  Nenhum suplente
                                </p>
                              )}
                            </div>
                            {annotatedSquad.filter(
                              (p) =>
                                !p.isJunior &&
                                (p.isUnavailable ||
                                  (p.status !== "Titular" &&
                                    p.status !== "Suplente")),
                            ).length > 0 && (
                              <>
                                <div className="px-4 py-1.5 bg-surface-container-lowest/80 text-[8px] font-black uppercase tracking-[0.2em] text-on-surface-variant/40 border-t border-outline-variant/10">
                                  Não convocados
                                </div>
                                {annotatedSquad
                                  .filter(
                                    (p) =>
                                      !p.isJunior &&
                                      (p.isUnavailable ||
                                        (p.status !== "Titular" &&
                                          p.status !== "Suplente")),
                                  )
                                  .map((player) => (
                                    <div
                                      key={player.id}
                                      draggable
                                      onDragStart={() => {
                                        dragPlayerIdRef.current = player.id;
                                        dragPlayerStatusRef.current =
                                          "Excluído";
                                      }}
                                      onDragOver={(e) => {
                                        e.preventDefault();
                                        setDragOverPlayerId(player.id);
                                      }}
                                      onDragLeave={() =>
                                        setDragOverPlayerId(null)
                                      }
                                      onDrop={(e) => {
                                        e.preventDefault();
                                        if (
                                          dragPlayerIdRef.current &&
                                          dragPlayerIdRef.current !== player.id
                                        )
                                          handleSwapPlayerStatuses(
                                            dragPlayerIdRef.current,
                                            player.id,
                                          );
                                        else {
                                          setDragOverPlayerId(null);
                                          dragPlayerIdRef.current = null;
                                        }
                                      }}
                                      onDragEnd={() => {
                                        setDragOverPlayerId(null);
                                        dragPlayerIdRef.current = null;
                                      }}
                                      className={`relative flex items-center gap-3 px-4 py-2 select-none transition-all cursor-grab active:cursor-grabbing ${dragOverPlayerId === player.id && dragPlayerIdRef.current !== player.id ? "opacity-100 bg-zinc-700/40 ring-1 ring-zinc-500/40" : player.isUnavailable ? "bg-red-950/50 hover:bg-red-900/40 opacity-80" : "opacity-40 hover:opacity-70"}`}
                                    >
                                      <span
                                        className={`shrink-0 w-5.5 text-center text-[10px] font-black ${
                                          player.position === "GR"
                                            ? "text-amber-400"
                                            : player.position === "DEF"
                                              ? "text-sky-400"
                                              : player.position === "MED"
                                                ? "text-primary"
                                                : "text-red-400"
                                        }`}
                                      >
                                        {POSITION_SHORT_LABELS[player.position]}
                                      </span>
                                      <span className="flex-1 text-sm font-medium text-on-surface-variant truncate">
                                        {player.name}
                                        {!!player.is_star &&
                                          (player.position === "MED" ||
                                            player.position === "ATA") && (
                                            <span className="ml-1 text-amber-400 text-[10px]">
                                              ★
                                            </span>
                                          )}
                                      </span>
                                      <div className="shrink-0 grid grid-cols-3 items-center gap-x-2 text-right">
                                        <span className="text-xs font-bold text-on-surface-variant tabular-nums">
                                          {player.skill}
                                        </span>
                                        <span className="text-[12px] text-cyan-400/70 font-black tabular-nums">
                                          🛡️{player.resistance ?? "–"}
                                        </span>
                                        {(() => {
                                          const f = player.form ?? 100;
                                          return (
                                            <span
                                              className={`text-[9px] font-black ${
                                                f >= 115
                                                  ? "text-emerald-400"
                                                  : f <= 85
                                                    ? "text-rose-400"
                                                    : "text-on-surface-variant/40"
                                              }`}
                                            >
                                              {f >= 115
                                                ? "💪"
                                                : f <= 85
                                                  ? "😩"
                                                  : "👍"}
                                            </span>
                                          );
                                        })()}
                                      </div>
                                      <span
                                        className="shrink-0 w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center text-sm cursor-pointer"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setOpenStatusPickerId((prev) =>
                                            prev === player.id
                                              ? null
                                              : player.id,
                                          );
                                        }}
                                      >
                                        ⚫️
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
                                          const titCount = Object.entries(
                                            tactic.positions,
                                          ).filter(
                                            ([id, s]) =>
                                              s === "Titular" &&
                                              Number(id) !== player.id,
                                          ).length;
                                          const subsFull = subCount >= 5;
                                          const titularesFull = titCount >= 11;
                                          return (
                                            <div
                                              className="absolute right-4 bottom-full mb-1 z-50 bg-surface-container-high border border-outline-variant/40 rounded-md shadow-xl p-1 flex flex-col gap-0.5 min-w-35"
                                              onClick={(e) =>
                                                e.stopPropagation()
                                              }
                                            >
                                              {[
                                                ["Titular", "🟢", "Titular"],
                                                ["Suplente", "🟡", "Suplente"],
                                                [
                                                  "Excluído",
                                                  "⚫️",
                                                  "Não convocado",
                                                ],
                                              ].map(
                                                ([status, emoji, label]) => {
                                                  const unavail =
                                                    player.isUnavailable &&
                                                    (status === "Titular" ||
                                                      status === "Suplente");
                                                  const disabled =
                                                    unavail ||
                                                    (status === "Titular" &&
                                                      titularesFull) ||
                                                    (status === "Suplente" &&
                                                      subsFull);
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
                                                      className={`px-3 py-2 rounded text-xs font-bold flex items-center gap-2 ${disabled ? "opacity-40 cursor-not-allowed" : "hover:bg-surface-bright/60 text-on-surface-variant"}`}
                                                    >
                                                      {emoji} {label}
                                                    </button>
                                                  );
                                                },
                                              )}
                                            </div>
                                          );
                                        })()}
                                    </div>
                                  ))}
                              </>
                            )}
                          </div>

                          {/* ── COL 4: CAMPO + JOGAR ── */}
                          <div className="flex flex-col gap-3">
                            {/* JOGAR button */}
                            <div className="bg-surface-container rounded-lg p-4">
                              {(() => {
                                const isReady = players.find(
                                  (p) => p.name === me.name,
                                )?.ready;
                                const isHalftime =
                                  showHalftimePanel && !isPlayingMatch;
                                const isEliminatedCupSpectator =
                                  nextMatchSummary?.isCup && !nextMatchOpponent;
                                const isDisabled = isEliminatedCupSpectator
                                  ? !!isReady
                                  : !isHalftime &&
                                    !isReady &&
                                    !isLineupComplete;
                                return (
                                  <>
                                    <button
                                      onClick={
                                        isHalftime
                                          ? handleHalftimeReady
                                          : handleReady
                                      }
                                      disabled={isDisabled}
                                      className={`w-full py-3.5 font-headline font-black rounded-sm text-base uppercase tracking-widest transition-all ${
                                        isReady
                                          ? "bg-surface-bright text-on-surface-variant"
                                          : isDisabled
                                            ? "bg-surface-bright text-on-surface-variant cursor-not-allowed opacity-40"
                                            : "bg-primary text-on-primary hover:brightness-110"
                                      }`}
                                    >
                                      {isReady
                                        ? "⏳ A aguardar..."
                                        : isEliminatedCupSpectator
                                          ? "Avançar para Taça"
                                          : isHalftime && isCupMatch
                                            ? "2ª Parte — Taça"
                                            : isHalftime
                                              ? "2ª Parte"
                                              : "Jogar Jornada"}
                                    </button>
                                    {isDisabled &&
                                      !isEliminatedCupSpectator &&
                                      !isReady && (
                                        <p className="text-[10px] font-bold text-red-400 mt-2 text-center">
                                          Faltam titulares: 1 GR + 10 de campo
                                        </p>
                                      )}
                                    {!isDisabled && !isReady && (
                                      <p className="text-[10px] text-zinc-600 mt-2 text-center">
                                        A jornada avança quando todos clicarem.
                                      </p>
                                    )}
                                  </>
                                );
                              })()}
                            </div>
                            {/* Campo mini */}
                            <div className="bg-surface-container rounded-lg overflow-hidden">
                              {/* 2D Pitch */}
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
                                const rowYs = ["7%", "30%", "55%", "79%"];
                                const posColors = {
                                  GR: "bg-amber-500 text-zinc-900",
                                  DEF: "bg-sky-500 text-zinc-900",
                                  MED: "bg-primary text-on-primary",
                                  ATA: "bg-red-500 text-white",
                                };
                                return (
                                  <div
                                    className="relative w-full"
                                    style={{
                                      aspectRatio: "9/12",
                                      background:
                                        "linear-gradient(180deg, #05430e 0%, #0b5e1a 50%, #05430e 100%)",
                                    }}
                                  >
                                    <svg
                                      className="absolute inset-0 w-full h-full"
                                      viewBox="0 0 560 315"
                                      preserveAspectRatio="none"
                                      aria-hidden="true"
                                    >
                                      <rect
                                        x="10"
                                        y="10"
                                        width="540"
                                        height="295"
                                        fill="none"
                                        stroke="rgba(255,255,255,0.18)"
                                        strokeWidth="1.5"
                                        rx="2"
                                      />
                                      <line
                                        x1="10"
                                        y1="157"
                                        x2="550"
                                        y2="157"
                                        stroke="rgba(255,255,255,0.15)"
                                        strokeWidth="1"
                                      />
                                      <circle
                                        cx="280"
                                        cy="157"
                                        r="50"
                                        fill="none"
                                        stroke="rgba(255,255,255,0.12)"
                                        strokeWidth="1"
                                      />
                                      <circle
                                        cx="280"
                                        cy="157"
                                        r="3"
                                        fill="rgba(255,255,255,0.18)"
                                      />
                                      <rect
                                        x="168"
                                        y="10"
                                        width="224"
                                        height="70"
                                        fill="none"
                                        stroke="rgba(255,255,255,0.12)"
                                        strokeWidth="1"
                                      />
                                      <rect
                                        x="224"
                                        y="10"
                                        width="112"
                                        height="26"
                                        fill="none"
                                        stroke="rgba(255,255,255,0.1)"
                                        strokeWidth="1"
                                      />
                                      <rect
                                        x="168"
                                        y="235"
                                        width="224"
                                        height="70"
                                        fill="none"
                                        stroke="rgba(255,255,255,0.12)"
                                        strokeWidth="1"
                                      />
                                      <rect
                                        x="224"
                                        y="289"
                                        width="112"
                                        height="26"
                                        fill="none"
                                        stroke="rgba(255,255,255,0.1)"
                                        strokeWidth="1"
                                      />
                                    </svg>
                                    {rows.map((rowPlayers, ri) =>
                                      rowPlayers.length > 0 ? (
                                        <div
                                          key={ri}
                                          className="absolute w-full flex justify-evenly items-start px-4"
                                          style={{ top: rowYs[ri] }}
                                        >
                                          {rowPlayers.map((player) => (
                                            <div
                                              key={player.id}
                                              className="flex flex-col items-center gap-0.5"
                                              style={{ maxWidth: "80px" }}
                                            >
                                              <div
                                                className={`w-11 h-11 rounded-full flex items-center justify-center font-black text-xs border-2 border-white/20 shrink-0 relative shadow-lg group-hover:scale-110 transition-transform ${posColors[player.position] || "bg-zinc-500 text-white"} ${player.isUnavailable ? "opacity-50 ring-2 ring-red-500" : ""}`}
                                              >
                                                {POSITION_SHORT_LABELS[
                                                  player.position
                                                ] || "?"}
                                                {player.isUnavailable && (
                                                  <span className="absolute -top-1 -right-1 text-[9px] leading-none">
                                                    {(player.suspension_until_matchweek ||
                                                      0) > matchweekCount
                                                      ? "🟥"
                                                      : (player.injury_until_matchweek ||
                                                            0) > matchweekCount
                                                        ? "🩹"
                                                        : "✈️"}
                                                  </span>
                                                )}
                                              </div>
                                              <div
                                                className="bg-black/70 backdrop-blur-sm px-1.5 py-0.5 rounded text-[9px] font-black text-white text-center cursor-pointer hover:text-primary transition-colors"
                                                style={{
                                                  maxWidth: "72px",
                                                  whiteSpace: "nowrap",
                                                  overflow: "hidden",
                                                  textOverflow: "ellipsis",
                                                }}
                                                onClick={() =>
                                                  socket.emit(
                                                    "requestPlayerHistory",
                                                    { playerId: player.id },
                                                  )
                                                }
                                              >
                                                {player.name.split(" ").pop()}
                                              </div>
                                              <span
                                                className="text-[9px] font-black"
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
                                          className="text-zinc-300 text-sm font-bold text-center px-8 leading-relaxed"
                                          style={{
                                            textShadow:
                                              "0 1px 4px rgba(0,0,0,0.9)",
                                          }}
                                        >
                                          Escolhe uma formação para ver os
                                          jogadores em campo
                                        </p>
                                      </div>
                                    )}
                                    <div className="absolute inset-0 bg-linear-to-t from-black/30 to-transparent pointer-events-none" />
                                  </div>
                                );
                              })()}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {activeTab === "market" && (
                    <MarketTab
                      teamInfo={teamInfo}
                      filteredMarketPlayers={filteredMarketPlayers}
                      marketPositionFilter={marketPositionFilter}
                      setMarketPositionFilter={setMarketPositionFilter}
                      marketSort={marketSort}
                      setMarketSort={setMarketSort}
                    />
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
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
        myBudget={teamInfo?.budget ?? 0}
        currentMatchweek={matchweekCount + 1}
      />

      <TransferProposalModal
        transferProposalModal={transferProposalModal}
        setTransferProposalModal={setTransferProposalModal}
      />

      {/* ── Auction notification (persiana) ───────────────────────────────── */}
      <div
        className={`fixed top-14 left-0 right-0 z-130 transition-all duration-300 ${
          selectedAuctionPlayer ? "translate-y-0" : "-translate-y-full"
        } ${sidebarCollapsed ? "lg:left-14" : "lg:left-64"}`}
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

      <GameDialog dialog={gameDialog} onClose={() => setGameDialog(null)} />

      <PenaltySuspensePopup penaltySuspense={penaltySuspense} />

      <CupDrawPopup
        showCupDrawPopup={showCupDrawPopup}
        cupDraw={cupDraw}
        cupDrawRevealIdx={cupDrawRevealIdx}
        me={me}
        players={players}
        setShowCupDrawPopup={setShowCupDrawPopup}
      />

      <PenaltyShootoutPopup
        cupPenaltyPopup={cupPenaltyPopup}
        cupPenaltyKickIdx={cupPenaltyKickIdx}
        teams={teams}
        setCupPenaltyPopup={setCupPenaltyPopup}
        setCupPenaltyKickIdx={setCupPenaltyKickIdx}
      />

      <MatchPanel
        mode={panelMode}
        onClose={() => setShowMatchDetail(false)}
        fixture={panelFixture}
        liveMinute={liveMinute}
        teams={teams}
        isCupMatch={isCupMatch}
        cupMatchRoundName={cupMatchRoundName}
        currentJornada={currentJornada}
        isPlayingMatch={isPlayingMatch}
        tactic={tactic}
        onUpdateTactic={updateTactic}
        annotatedSquad={annotatedSquad}
        subbedOut={subbedOut}
        confirmedSubs={confirmedSubs}
        subsMade={subsMade}
        swapSource={swapSource}
        swapTarget={swapTarget}
        onSelectOut={
          matchAction ? (player) => setSwapSource(player) : handleSelectOut
        }
        onSelectIn={
          matchAction ? (player) => setSwapTarget(player) : handleSelectIn
        }
        onConfirmSub={handleConfirmSub}
        onResetSub={handleResetSub}
        onResetAllSubs={handleResetAllSubs}
        onReady={handleHalftimeReady}
        isReady={panelIsReady}
        cupPreMatch={cupPreMatch}
        myTeamInCup={myTeamInCup}
        redCardedHalftimeIds={redCardedHalftimeIds}
        matchAction={matchAction}
        injuryCountdown={injuryCountdown}
        onResolveAction={handleResolveMatchAction}
      />

      <DismissalModal
        dismissalModal={dismissalModal}
        onContinue={() => setDismissalModal(null)}
      />

      <WelcomeModal
        welcomeModal={dismissalModal ? null : welcomeModal}
        me={me}
        setWelcomeModal={setWelcomeModal}
      />

      <JobOfferModal
        jobOfferModal={jobOfferModal}
        setJobOfferModal={setJobOfferModal}
      />

      <SeasonEndModal
        data={seasonEndModal}
        teams={teams}
        me={me}
        onClose={() => setSeasonEndModal(null)}
      />

      <NewsTicker
        newsTickerItems={newsTickerItems}
        hidden={isMatchInProgress}
      />

      <PlayerHistoryModal
        playerHistoryModal={playerHistoryModal}
        setPlayerHistoryModal={setPlayerHistoryModal}
        myTeamId={me?.teamId}
        matchweekCount={matchweekCount}
        isPlayingMatch={isPlayingMatch}
        showHalftimePanel={showHalftimePanel}
        renewPlayerContract={renewPlayerContract}
        listPlayerAuction={listPlayerAuction}
        listPlayerFixed={listPlayerFixed}
        removeFromTransferList={removeFromTransferList}
        buyPlayer={buyPlayer}
        openAuctionBid={openAuctionBid}
        myBudget={teamInfo?.budget ?? 0}
        setGameDialog={setGameDialog}
      />

      <ChatWidget
        me={me}
        chatOpen={chatOpen}
        setChatOpen={setChatOpen}
        activeChatTab={activeChatTab}
        setActiveChatTab={setActiveChatTab}
        roomMessages={roomMessages}
        globalMessages={globalMessages}
        globalPlayers={globalPlayers}
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
