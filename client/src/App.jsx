import React, { useEffect, useState, useMemo, useCallback } from "react";
import { socket } from "./socket";

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

function App() {
  const [teams, setTeams] = useState([]);
  const [players, setPlayers] = useState([]);
  const [mySquad, setMySquad] = useState([]);
  const [me, setMe] = useState(null);

  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [isNewRoom, setIsNewRoom] = useState(true);
  const [availableSaves, setAvailableSaves] = useState([]);
  const [joining, setJoining] = useState(false);
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
  const [activeTab, setActiveTab] = useState("dashboard");
  const [topScorers, setTopScorers] = useState([]);
  const [marketPairs, setMarketPairs] = useState([]);
  const [tactic, setTactic] = useState({
    formation: "4-4-2",
    style: "Balanced",
  });
  const [liveMinute, setLiveMinute] = useState(90);
  const [isPlayingMatch, setIsPlayingMatch] = useState(false);
  const [showHalftimePanel, setShowHalftimePanel] = useState(false);
  const [matchAction, setMatchAction] = useState(null);
  const [subsMade, setSubsMade] = useState(0);
  const [swapSource, setSwapSource] = useState(null);
  const [subbedOut, setSubbedOut] = useState([]); // Track players who left the pitch
  const meRef = React.useRef(null);

  const backendUrl =
    (typeof import.meta !== "undefined" && import.meta.env?.VITE_BACKEND_URL) ||
    "";

  // Re-fetch this coach's saved rooms whenever the name changes while in "Carregar" mode.
  useEffect(() => {
    if (!isNewRoom && name) {
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
    } else if (!isNewRoom && !name) {
      // No name entered yet — show all saves so the dropdown is populated
      fetch(`${backendUrl}/saves`)
        .then((r) => r.json())
        .then((data) => {
          setAvailableSaves(data);
          if (data.length > 0 && !roomCode) setRoomCode(data[0]);
        })
        .catch(() => {});
    }
  }, [name, isNewRoom]); // eslint-disable-line react-hooks/exhaustive-deps

  // BUG-07 FIX: All socket listeners in a single effect with [] dep so they're
  // registered exactly once and cleaned up correctly on unmount.
  useEffect(() => {
    socket.on("teamsData", (data) => setTeams(data));
    socket.on("playerListUpdate", (data) => {
      setPlayers(data);
    });
    socket.on("mySquad", (data) => setMySquad(data));
    socket.on("marketUpdate", (data) => setMarketPairs(data));
    socket.on("topScorers", (data) => setTopScorers(data));
    socket.on("systemMessage", (msg) => addToast(msg));
    socket.on("joinError", (msg) => {
      setJoinError(msg);
      setJoining(false);
      setMe(null);
      if (joinTimerRef.current) clearTimeout(joinTimerRef.current);
    });

    socket.on("gameState", (data) => {
      if (data.matchweek) setMatchweekCount(data.matchweek - 1);
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
      playWhistle();
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
      playWhistle();
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
      socket.off("systemMessage");
      socket.off("joinError");
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

  const handleResolveMatchAction = (playerId) => {
    if (!matchAction || !me?.teamId) return;
    socket.emit("resolveMatchAction", {
      actionId: matchAction.actionId,
      teamId: me.teamId,
      playerId,
    });
    setMatchAction(null);
  };

  const buyPlayer = (playerId) => {
    if (
      confirm(
        "Fazer proposta de transferência por este jogador? (+20% prémio de assinatura)",
      )
    ) {
      socket.emit("buyPlayer", playerId);
    }
  };

  const updateTactic = useCallback((updates) => {
    setTactic((prev) => {
      const newTactic = { ...prev, ...updates };
      socket.emit("setTactic", newTactic);
      return newTactic;
    });
  }, []);

  const handleAutoPick = useCallback(
    (formationStr = tactic.formation) => {
      const sorted = [...mySquad].sort(
        (a, b) => b.skill * (b.form / 100) - a.skill * (a.form / 100),
      );
      const parts = formationStr.split("-");
      const req = {
        GK: 1,
        DEF: parseInt(parts[0]),
        MID: parseInt(parts[1]),
        ATK: parseInt(parts[2]),
      };
      const filled = { GK: 0, DEF: 0, MID: 0, ATK: 0 };

      const newPos = {};
      let bench = 5;

      sorted.forEach((p) => {
        if (filled[p.position] < req[p.position]) {
          newPos[p.id] = "Titular";
          filled[p.position]++;
        } else if (bench > 0) {
          newPos[p.id] = "Suplente";
          bench--;
        } else {
          newPos[p.id] = "Reserva";
        }
      });

      const tits = Object.values(newPos).filter((v) => v === "Titular").length;
      if (tits < 11) {
        sorted.forEach((p) => {
          if (
            newPos[p.id] !== "Titular" &&
            Object.values(newPos).filter((v) => v === "Titular").length < 11
          ) {
            newPos[p.id] = "Titular";
          }
        });
      }
      updateTactic({ formation: formationStr, positions: newPos });
    },
    [mySquad, tactic.formation, updateTactic],
  );

  useEffect(() => {
    if (mySquad.length > 0 && !tactic.positions) {
      handleAutoPick();
    }
  }, [mySquad, tactic.positions, handleAutoPick]);

  const handleSubSwap = (playerId) => {
    if (activeTab === "live" && subbedOut.includes(playerId)) {
      return; // Cannnot select a player that already left the pitch
    }

    if (!swapSource) {
      setSwapSource(playerId);
    } else {
      if (swapSource === playerId) {
        setSwapSource(null);
      } else {
        if (activeTab === "live" && subsMade >= 3) {
          addToast("Já fizeste as 3 substituições permitidas!");
          setSwapSource(null);
          return;
        }

        const currentSourceStatus = tactic.positions[swapSource] || "Reserva";
        const currentTargetStatus = tactic.positions[playerId] || "Reserva";

        if (activeTab === "live") {
          const goingOutId =
            currentSourceStatus === "Titular"
              ? swapSource
              : currentTargetStatus === "Titular"
                ? playerId
                : null;
          if (goingOutId) {
            setSubbedOut((prev) => [...prev, goingOutId]);
          }
          setSubsMade((s) => s + 1);
        }

        const newPos = { ...tactic.positions };
        const temp = newPos[swapSource];
        newPos[swapSource] = newPos[playerId];
        newPos[playerId] = temp;

        updateTactic({ positions: newPos });
        setSwapSource(null);
      }
    }
  };

  const annotatedSquad = useMemo(() => {
    if (!tactic.positions)
      return [...mySquad].map((p) => ({ ...p, status: "Reserva" }));
    const mapped = mySquad.map((p) => {
      const isOut = activeTab === "live" && subbedOut.includes(p.id);
      return {
        ...p,
        status: isOut ? "Out" : tactic.positions[p.id] || "Reserva",
        isSubbedOut: isOut,
      };
    });
    const s = { Titular: 1, Suplente: 2, Reserva: 3, Out: 4 };
    return mapped.sort((a, b) => s[a.status] - s[b.status]);
  }, [mySquad, tactic.positions, activeTab, subbedOut]);

  if (!me || !me.teamId) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 p-8 flex flex-col items-center justify-center font-sans">
        <h1 className="text-6xl font-black text-amber-500 mb-8 drop-shadow-xl tracking-tighter">
          CashBall <span className="text-zinc-100">26/27</span>
        </h1>
        <div className="bg-zinc-900 p-8 rounded-3xl w-full max-w-md border border-zinc-800 relative overflow-hidden shadow-2xl">
          <div className="absolute top-0 inset-x-0 h-1 bg-linear-to-r from-amber-600 via-amber-400 to-amber-600"></div>

          <div className="flex gap-2 mb-6">
            <button
              onClick={() => setIsNewRoom(true)}
              className={`flex-1 py-3 text-sm font-black uppercase rounded-xl transition-all ${isNewRoom ? "bg-amber-500 text-zinc-950" : "bg-zinc-800 text-zinc-400"}`}
            >
              Nova Sala
            </button>
            <button
              onClick={() => setIsNewRoom(false)}
              className={`flex-1 py-3 text-sm font-black uppercase rounded-xl transition-all ${!isNewRoom ? "bg-amber-500 text-zinc-950" : "bg-zinc-800 text-zinc-400"}`}
            >
              Carregar
            </button>
          </div>

          <div className="mb-5">
            <label className="block text-[10px] text-base uppercase text-zinc-500 mb-2 font-bold">
              O teu nome de Treinador
            </label>
            <input
              type="text"
              className="w-full bg-zinc-950 border border-zinc-800 p-4 rounded-xl text-white text-lg font-black outline-none transition-all placeholder:text-zinc-700 focus:ring-2 focus:ring-amber-500"
              value={name}
              placeholder="Ex: Amorim"
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="mb-5">
            <label className="block text-[10px] text-base uppercase text-zinc-500 mb-2 font-bold">
              Palavra-passe
            </label>
            <input
              type="password"
              className="w-full bg-zinc-950 border border-zinc-800 p-4 rounded-xl text-white text-lg font-black outline-none transition-all placeholder:text-zinc-700 focus:ring-2 focus:ring-amber-500"
              value={password}
              placeholder="••••••••"
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleJoin();
              }}
            />
            <p className="text-xs text-zinc-600 mt-1 font-bold">
              Na primeira vez cria a tua conta. Depois usa sempre a mesma
              palavra-passe.
            </p>
          </div>

          {isNewRoom ? (
            <div className="mb-8">
              <label className="block text-[10px] text-base uppercase text-zinc-500 mb-2 font-bold">
                Nome do Novo Jogo (SALA)
              </label>
              <input
                type="text"
                className="w-full bg-zinc-950 border border-zinc-800 p-4 rounded-xl text-white text-lg font-black outline-none transition-all placeholder:text-zinc-700 focus:ring-2 focus:ring-amber-500 uppercase"
                value={roomCode}
                placeholder="INVERNO"
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              />
              <p className="text-sm font-bold text-amber-500 mt-3 text-center bg-amber-500/10 p-2 rounded-lg">
                Ficarás com um clube mágico da 4ª Divisão!
              </p>
            </div>
          ) : (
            <div className="mb-8">
              <label className="block text-[10px] text-base uppercase text-zinc-500 mb-2 font-bold">
                As tuas Salas Gravadas
              </label>
              <select
                className="w-full bg-zinc-950 border border-zinc-800 p-4 rounded-xl text-white text-lg font-black outline-none focus:ring-2 focus:ring-amber-500 uppercase"
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
                  {name
                    ? "Nenhum save encontrado para este treinador."
                    : "Insere o teu nome para ver os teus saves."}
                </p>
              )}
            </div>
          )}

          <button
            onClick={handleJoin}
            disabled={!name || !password || !roomCode || joining}
            className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:bg-zinc-800 disabled:text-zinc-600 text-zinc-950 py-5 rounded-xl font-black text-xl transition-all active:scale-95 border-b-4 border-emerald-700 active:border-b-0"
          >
            {joining ? "A GERAR CONTRATO..." : "ASSINAR CONTRATO"}
          </button>
          {joinError && (
            <p className="text-red-400 text-sm text-center mt-3 font-bold">
              ⚠️ {joinError}
            </p>
          )}
          {!joinError && disconnected && (
            <p className="text-red-400 text-sm text-center mt-3 font-bold">
              ⚠️ Sem ligação ao servidor. Tenta novamente.
            </p>
          )}
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
          background: `linear-gradient(90deg, ${teamInfo?.color_primary || "#18181b"} 0%, ${teamInfo?.color_secondary || "#27272a"} 100%)`,
        }
      : undefined;

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
            <h1 className="text-xl md:text-3xl font-black text-white tracking-tighter">
              CashBall <span className="text-zinc-100/90">26/27</span>
            </h1>
            <p className="text-sm md:text-base font-bold text-zinc-100/90 uppercase">
              | SALA: {me.roomCode} | Jornada {matchweekCount + 1}
            </p>
          </div>
          {isDesktopLayout && (
            <div className="relative z-10 flex items-center gap-4">
              <div className="text-right">
                <p className="font-bold text-sm md:text-base text-white">
                  {me.name}
                </p>
                <p className="text-sm md:text-base text-zinc-100 font-black tracking-widest">
                  {teamInfo?.name}
                </p>
              </div>
            </div>
          )}
        </div>
      </header>

      <div className="max-w-350 mx-auto p-4 md:p-8">
        <div className="flex gap-3 mb-5 border-b border-zinc-800 pb-px overflow-x-auto">
          {[
            "dashboard",
            "live",
            "standings",
            "squad",
            "market",
            "finances",
          ].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2.5 font-bold text-sm md:text-base uppercase transition-colors border-b-4 ${activeTab === tab ? "border-amber-500 text-white" : "border-transparent text-zinc-500 hover:text-zinc-300"}`}
            >
              {tab === "dashboard"
                ? "Geral"
                : tab === "live"
                  ? "Jornada"
                  : tab === "standings"
                    ? "Tabela"
                    : tab === "squad"
                      ? "Plantel"
                      : tab === "market"
                        ? "Mercado"
                        : "Finanças"}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,3fr)_260px] gap-6">
          <div>
            {activeTab === "dashboard" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-zinc-900 p-4 rounded-xl border border-zinc-800 shadow-sm flex flex-col items-center justify-center text-center">
                      <p className="text-xs text-zinc-500 uppercase font-black tracking-widest mb-1">
                        Clube
                      </p>
                      <p className="text-xl font-black">{teamInfo?.name}</p>
                      <p className="text-sm font-semibold text-amber-500 mt-1">
                        Divisão {teamInfo?.division}
                      </p>
                    </div>
                    <div className="bg-amber-500 p-4 rounded-xl border border-amber-400 text-zinc-950 flex flex-col justify-center items-center">
                      <p className="text-xs uppercase font-black tracking-widest opacity-80 mb-1">
                        Classificação
                      </p>
                      <p className="text-4xl font-black">
                        {(() => {
                          const divTeams = teams
                            .filter((t) => t.division === teamInfo?.division)
                            .sort(
                              (a, b) =>
                                (b.points || 0) - (a.points || 0) ||
                                (b.goals_for || 0) -
                                  (b.goals_against || 0) -
                                  ((a.goals_for || 0) - (a.goals_against || 0)),
                            );
                          const pos =
                            divTeams.findIndex((t) => t.id === me.teamId) + 1;
                          return pos > 0 ? `${pos}º` : "-";
                        })()}
                      </p>
                    </div>
                  </div>

                  {myMatch && (
                    <div className="bg-zinc-900 rounded-xl border border-zinc-800 shadow-sm overflow-hidden">
                      <div className="bg-zinc-800/50 p-3 border-b border-zinc-800 flex justify-between">
                        <h3 className="font-bold text-white text-sm tracking-widest uppercase">
                          Último Jogo
                        </h3>
                      </div>
                      <div className="p-4">
                        <div className="flex items-center justify-center gap-4">
                          <div className="text-lg font-black flex-1 text-right truncate">
                            {
                              teams.find((t) => t.id === myMatch.homeTeamId)
                                ?.name
                            }
                          </div>
                          <div className="px-4 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-3xl font-black text-white shadow-inner flex gap-2">
                            <span>{myMatch.finalHomeGoals ?? 0}</span>
                            <span className="text-zinc-700">-</span>
                            <span>{myMatch.finalAwayGoals ?? 0}</span>
                          </div>
                          <div className="text-lg font-black flex-1 text-left truncate">
                            {
                              teams.find((t) => t.id === myMatch.awayTeamId)
                                ?.name
                            }
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4 shadow-sm max-h-100 overflow-y-auto">
                  <h3 className="text-amber-500 font-black mb-3 uppercase tracking-widest text-sm border-b border-zinc-800 pb-2 flex items-center gap-2">
                    🏆 Melhores Marcadores
                  </h3>
                  {topScorers.length === 0 ? (
                    <p className="text-sm text-zinc-500 font-bold">
                      Nenhum golo marcado ainda.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {topScorers.map((scorer, i) => (
                        <li
                          key={scorer.id}
                          className="flex justify-between items-center text-sm p-2 rounded-lg bg-zinc-950 border border-zinc-800/50"
                        >
                          <span className="font-bold text-white w-48 truncate">
                            {i + 1}. {scorer.name}
                          </span>
                          {isDesktopLayout && (
                            <span className="text-[10px] text-zinc-500 uppercase truncate max-w-25">
                              {scorer.team_name || "Ag. Livre"}
                            </span>
                          )}
                          <span className="text-emerald-400 font-black text-base">
                            {scorer.goals}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}

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
                      (Restam: {3 - subsMade})
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
                  <span className="text-3xl font-mono font-black">
                    {Math.min(liveMinute, 90)}'
                  </span>
                </div>
                <h2 className="text-2xl font-black text-amber-500 mb-8 pb-4 border-b border-zinc-800">
                  Jornada em Direto{" "}
                  {liveMinute === 45 && !isPlayingMatch ? "(INTERVALO)" : ""}
                </h2>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {[1, 2, 3, 4].map((div) => (
                    <div key={div}>
                      <h3 className="text-zinc-500 font-black uppercase text-xs mb-2 border-b border-zinc-800/50">
                        {div}ª Divisão
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

                            return (
                              <div
                                key={idx}
                                className={`flex items-center gap-2 text-[11px] font-bold bg-zinc-950 rounded border ${isMyMatch ? "border-amber-500 bg-amber-500/10 ring-1 ring-amber-500" : "border-zinc-800"}`}
                              >
                                <div
                                  style={{
                                    backgroundColor: hInfo?.color_primary,
                                    color: hInfo?.color_secondary,
                                  }}
                                  className="w-32 md:w-40 uppercase truncate font-black text-right px-2 py-1 rounded-l"
                                >
                                  {hInfo?.name}
                                </div>
                                <div className="px-2 py-1 bg-zinc-900 text-white text-center font-black min-w-10">
                                  {currentHome.length} - {currentAway.length}
                                </div>
                                <div
                                  style={{
                                    backgroundColor: aInfo?.color_primary,
                                    color: aInfo?.color_secondary,
                                  }}
                                  className="w-32 md:w-40 uppercase truncate font-black text-left px-2 py-1 rounded-r"
                                >
                                  {aInfo?.name}
                                </div>
                                <div className="ml-1 flex-1 min-w-0 px-1 py-1 text-zinc-400 truncate opacity-80">
                                  {lastEventText}
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === "standings" && (
              <div className="bg-zinc-900 text-zinc-100 font-sans p-4 rounded-xl border border-zinc-800 shadow-sm relative overflow-hidden">
                <h2 className="text-xl font-black text-amber-500 mb-4 pb-2 border-b border-zinc-800">
                  Classificação Geral (Jornada {matchweekCount})
                </h2>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-4">
                  {[1, 2, 3, 4].map((div) => (
                    <div key={div}>
                      <h3 className="text-zinc-500 font-black uppercase text-sm mb-4">
                        {div}ª Divisão
                      </h3>
                      <div className="bg-zinc-950 border border-zinc-800 rounded-lg overflow-hidden">
                        <table className="w-full text-[11px] font-bold text-right border-collapse">
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
                                    style={{
                                      backgroundColor:
                                        t.color_primary || "#18181b",
                                      color: t.color_secondary || "#ffffff",
                                    }}
                                    className={`transition-colors ${isMe ? "ring-2 ring-inset ring-amber-500" : ""}`}
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

            {activeTab === "squad" && (
              <div className="space-y-6">
                <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-6 flex flex-col md:flex-row justify-between gap-4">
                  <div className="flex gap-4">
                    <select
                      className="bg-zinc-950 border border-zinc-700 rounded-lg px-4 py-3 text-base font-bold text-white focus:ring-2 focus:ring-amber-500"
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
                      className="bg-zinc-950 border border-zinc-700 rounded-lg px-4 py-3 text-base font-bold text-emerald-400 focus:ring-2 focus:ring-amber-500"
                      value={tactic.style}
                      onChange={(e) => updateTactic({ style: e.target.value })}
                    >
                      <option value="Balanced">Equilibrado</option>
                      <option value="Offensive">Ofensivo (+15% Atk)</option>
                      <option value="Defensive">Defensivo (+20% Def)</option>
                    </select>
                  </div>
                  <p className="text-zinc-500 text-sm font-bold max-w-sm mt-3 md:mt-0 leading-tight">
                    Clica nos jogadores em qualquer momento para escolheres os
                    teus Titulares manualmente (Máx 3 Substituições durante o
                    Intervalo do jogo).
                  </p>
                </div>

                <div className="bg-zinc-900 rounded-3xl border border-zinc-800 shadow-sm overflow-hidden">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="bg-zinc-950/50 text-zinc-400 uppercase text-[11px] tracking-widest border-b border-zinc-800">
                        <th className="px-4 py-3 font-black">Seleção</th>
                        <th className="px-4 py-3 font-black">Pos</th>
                        <th className="px-4 py-3 font-black">Nome</th>
                        <th className="px-4 py-3 font-black text-center w-12">
                          Nac
                        </th>
                        <th className="px-4 py-3 font-black text-center w-12">
                          Qual
                        </th>
                        <th className="px-4 py-3 font-black text-center w-12">
                          Golos
                        </th>
                        <th className="px-4 py-3 font-black text-center w-16">
                          Vermelhos
                        </th>
                        <th className="px-4 py-3 font-black text-center w-16">
                          Lesões
                        </th>
                        <th className="px-4 py-3 font-black w-32 text-center">
                          Forma
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/50 font-medium">
                      {annotatedSquad.map((player) => (
                        <tr
                          key={player.id}
                          onClick={() => handleSubSwap(player.id)}
                          className={`cursor-pointer hover:bg-zinc-800/50 transition-colors group select-none ${player.status === "Titular" ? "bg-amber-500/5" : ""} ${swapSource === player.id ? "ring-2 ring-inset ring-amber-500 bg-amber-500/20" : ""} ${player.isSubbedOut ? "opacity-30 grayscale cursor-not-allowed" : ""}`}
                        >
                          <td className="px-4 py-2.5">
                            <span
                              className={`text-xs px-2 py-1 rounded font-black tracking-widest uppercase shadow-sm ${player.status === "Titular" ? "bg-amber-500 text-zinc-950" : player.isSubbedOut ? "bg-zinc-900 line-through text-zinc-500 border border-zinc-800" : player.status === "Suplente" ? "bg-zinc-700 text-white" : "text-zinc-600 border border-zinc-800"}`}
                            >
                              {player.isSubbedOut
                                ? "SUBSTITUÍDO"
                                : player.status}
                            </span>
                          </td>
                          <td
                            className={`px-4 py-2.5 font-black text-sm tracking-wider ${player.position === "GK" ? "text-yellow-500" : player.position === "DEF" ? "text-blue-500" : "text-green-500"}`}
                          >
                            {player.position}
                          </td>
                          <td className="px-4 py-2.5 font-bold text-white text-sm md:text-base">
                            {player.name}
                          </td>
                          <td className="px-4 py-2.5 text-center text-zinc-400 font-bold">
                            {player.nationality}
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
                            {getPlayerStat(player, [
                              "reds",
                              "red_cards",
                              "reds_count",
                              "expulsions",
                            ])}
                          </td>
                          <td className="px-4 py-2.5 text-center font-black text-orange-400">
                            {getPlayerStat(player, [
                              "injuries",
                              "injury_count",
                              "lesoes",
                              "lesions",
                            ])}
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-3">
                              <div className="flex-1 bg-zinc-950 rounded-full h-2.5 overflow-hidden">
                                <div
                                  className={`h-2.5 rounded-full ${player.form > 90 ? "bg-emerald-500" : player.form > 70 ? "bg-amber-500" : "bg-red-500"}`}
                                  style={{ width: `${player.form}%` }}
                                ></div>
                              </div>
                              <span className="text-xs font-bold tracking-wider text-zinc-400 w-8">
                                {player.form}
                              </span>
                            </div>
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
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="bg-zinc-950/50 text-zinc-500 uppercase text-[11px] border-b border-zinc-800">
                      <th className="px-4 py-3 font-black">Pos</th>
                      <th className="px-4 py-3 font-black">Nome / Origem</th>
                      <th className="px-4 py-3 font-black text-center">Qual</th>
                      <th className="px-4 py-3 font-black text-right">
                        Cláusula Rescisão
                      </th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/50 font-medium">
                    {marketPairs
                      .filter((p) => p.team_id !== me.teamId)
                      .map((player) => {
                        const price = player.value * 1.2;
                        const canAfford = teamInfo?.budget >= price;
                        return (
                          <tr
                            key={player.id}
                            className="hover:bg-zinc-800/50 transition-colors"
                          >
                            <td className="px-4 py-3 font-black text-xs">
                              {player.position}
                            </td>
                            <td className="px-4 py-3">
                              <p className="font-bold text-white text-sm md:text-base leading-tight">
                                {player.name}
                              </p>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className="bg-emerald-950 text-emerald-400 font-black px-2 py-1.5 rounded text-sm">
                                {player.skill}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-zinc-300 text-sm md:text-base">
                              {formatCurrency(price)}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <button
                                onClick={() => buyPlayer(player.id)}
                                disabled={!canAfford}
                                className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-30 disabled:hover:bg-emerald-600 text-white font-black uppercase text-[11px] px-4 py-2 rounded"
                              >
                                {canAfford ? "Comprar" : "Sem Gito"}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}

            {activeTab === "finances" && (
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
                        +2.000 Lugares Estádio
                      </p>
                      <button
                        onClick={() => socket.emit("buildStadium")}
                        className="w-full bg-amber-600 hover:bg-amber-500 text-zinc-950 font-black py-3 rounded-lg text-sm transition-all uppercase"
                      >
                        Expandir (250.000€)
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
            )}
          </div>

          <div className="space-y-6">
            <div className="bg-zinc-900 p-5 rounded-3xl border border-zinc-800 flex flex-col items-center sticky top-23">
              {disconnected && (
                <p className="text-red-400 text-xs font-bold mb-3 text-center">
                  ⚠️ Desligado — a reconectar...
                </p>
              )}
              <button
                onClick={
                  showHalftimePanel && !isPlayingMatch
                    ? handleHalftimeReady
                    : handleReady
                }
                className={`w-full py-5 font-black rounded-2xl text-xl transition-all uppercase tracking-widest relative overflow-hidden border-b-6 active:border-b-0 active:translate-y-1.5 ${players.find((p) => p.name === me.name)?.ready ? "bg-zinc-800 text-zinc-500 border-zinc-950" : "bg-emerald-500 text-zinc-950 hover:bg-emerald-400 border-emerald-700"}`}
              >
                {players.find((p) => p.name === me.name)?.ready
                  ? "A AGUARDAR OUTROS"
                  : showHalftimePanel && !isPlayingMatch
                    ? "2ª PARTE"
                    : "JOGAR JORNADA"}
              </button>
              <p className="text-xs font-bold text-zinc-500 mt-4 text-center leading-relaxed">
                Se jogas com amigos, a jornada só avança quando TODOS clicarem.
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
        </div>
      </div>
    </div>
  );
}

export default App;
