import { getEffectiveLineup } from "../../utils/playerHelpers.js";
import {
  POSITION_TEXT_CLASS,
  POSITION_SHORT_LABELS,
  POSITION_BORDER_CLASS,
  MAX_MATCH_SUBS,
} from "../../constants/index.js";
import { PlayerLink } from "../shared/PlayerLink.jsx";

const POS_ORDER = { GR: 0, DEF: 1, MED: 2, ATA: 3 };

export function TabJogo({ fixture, liveMinute, teams }) {
  if (!fixture) return null;
  const hInfo = teams.find((t) => t.id === fixture.homeTeamId);
  const aInfo = teams.find((t) => t.id === fixture.awayTeamId);
  const evts = fixture.events || [];
  const weatherEvent = evts.find((e) => e.type === "weather");
  const visibleEvts = evts
    .filter(
      (e) =>
        e.minute <= liveMinute &&
        [
          "goal",
          "penalty_goal",
          "own_goal",
          "penalty_miss",
          "yellow",
          "red",
          "injury",
          "substitution",
          "phase_start",
        ].includes(e.type),
    )
    .sort((a, b) => (a.minute ?? 0) - (b.minute ?? 0));

  const ref = fixture.referee;
  const refBalance = ref?.balance ?? 50;

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-3">
      {(fixture.attendance || ref?.refereeName) && (
        <div className="flex flex-wrap items-center gap-3">
          {fixture.attendance ? (
            <span className="text-zinc-400 text-[11px] font-bold">
              {hInfo?.stadium_name ? `${hInfo.stadium_name} ` : ""}🏟{" "}
              {fixture.attendance.toLocaleString("pt-PT")} adeptos
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
          {weatherEvent && (
            <span className="text-zinc-400 text-[11px] flex items-center gap-1">
              <span>{weatherEvent.emoji}</span>
              <span>{WEATHER_LABELS[weatherEvent.emoji] || ""}</span>
            </span>
          )}
        </div>
      )}

      {fixture.homePossession != null && (
        <div className="bg-surface-bright/40 rounded-sm px-3 py-2">
          <div className="flex justify-between items-center mb-1.5">
            <span className="text-[11px] font-black text-zinc-300 tabular-nums">
              {fixture.homePossession}%
            </span>
            <span className="text-[8px] font-black uppercase tracking-widest text-zinc-600">
              Posse de Bola
            </span>
            <span className="text-[11px] font-black text-zinc-300 tabular-nums">
              {fixture.awayPossession}%
            </span>
          </div>
          <div className="flex h-1.5 rounded-full overflow-hidden bg-zinc-800">
            <div
              className="bg-primary transition-all duration-500"
              style={{ width: `${fixture.homePossession}%` }}
            />
            <div className="bg-zinc-500 flex-1 transition-all duration-500" />
          </div>
        </div>
      )}

      {visibleEvts.length === 0 ? (
        <p className="text-zinc-600 text-xs text-center py-4 font-bold">
          Sem eventos a mostrar
        </p>
      ) : (
        <div className="space-y-0.5">
          {visibleEvts.map((e, i) => {
            const isHome = e.team === "home";
            const evtTeam = isHome ? hInfo : aInfo;
            const icon =
              e.emoji ||
              (e.type === "goal" || e.type === "penalty_goal"
                ? "⚽"
                : e.type === "own_goal"
                  ? "⚽🔙"
                  : e.type === "yellow"
                    ? "🟨"
                    : e.type === "red"
                      ? "🟥"
                      : e.type === "injury"
                        ? "🤕"
                        : e.type === "substitution"
                          ? "🔄"
                          : "");
            return (
              <div key={i} className="flex items-center gap-2 text-[11px]">
                <span className="text-zinc-600 font-black w-8 shrink-0 text-right">
                  {e.minute != null ? `${e.minute}'` : ""}
                </span>
                <span className="w-4 shrink-0 text-center">{icon}</span>
                <span
                  className="flex-1 truncate font-bold"
                  style={{ color: evtTeam?.color_primary || "#d4d4d8" }}
                >
                  <PlayerLink playerId={e.playerId}>
                    {e.playerName || e.player_name || ""}
                  </PlayerLink>
                </span>
                <span
                  className="text-[9px] font-black uppercase tracking-widest shrink-0"
                  style={{ color: evtTeam?.color_primary || "#71717a" }}
                >
                  {evtTeam?.name || ""}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {(() => {
        const commentary = evts
          .filter((e) => e.minute <= liveMinute && e.text)
          .sort((a, b) => (b.minute ?? 0) - (a.minute ?? 0));
        if (commentary.length === 0) return null;
        return (
          <div>
            <p className="text-[9px] font-black uppercase tracking-widest text-zinc-600 mb-1.5">
              Narração
            </p>
            <div className="space-y-1">
              {commentary.map((e, i) => {
                const phrase = e.text
                  .replace(/^\[(?:\d+'|HT)\]\s*\S*\s*/, "")
                  .trim();
                if (!phrase) return null;
                return (
                  <div
                    key={i}
                    className="flex items-start gap-2 px-2 py-1.5 rounded bg-surface-container-high/40 border border-outline-variant/10"
                  >
                    <span className="text-zinc-600 font-black text-[10px] w-7 shrink-0 text-right pt-px">
                      {e.minute != null ? `${e.minute}'` : ""}
                    </span>
                    <span className="w-4 shrink-0 text-center text-[11px]">
                      {e.emoji || ""}
                    </span>
                    <span className="flex-1 text-[11px] text-zinc-400 leading-snug">
                      {phrase}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

const WEATHER_LABELS = {
  "☀️": "Sol",
  "🌧️": "Chuva",
  "⛈️": "Chuva forte",
  "💨": "Vento",
  "🥶": "Frio",
  "🌫️": "Nevoeiro",
  "❄️": "Neve",
};

function FormBadge({ form }) {
  const f = form ?? 100;
  return (
    <span
      className={`text-[10px] font-black ${f >= 115 ? "text-emerald-400" : f <= 85 ? "text-rose-400" : "text-zinc-400"}`}
    >
      {f >= 115 ? "💪" : f <= 85 ? "😩" : "👍"}
    </span>
  );
}

export function TabLineup({ fixture, liveMinute, teams }) {
  if (!fixture?.homeLineup || !fixture?.awayLineup) return null;
  const hInfo = teams.find((t) => t.id === fixture.homeTeamId);
  const aInfo = teams.find((t) => t.id === fixture.awayTeamId);
  const evts = fixture.events || [];
  const homeLineup = getEffectiveLineup(
    fixture.homeLineup,
    evts,
    liveMinute,
    "home",
  );
  const awayLineup = getEffectiveLineup(
    fixture.awayLineup,
    evts,
    liveMinute,
    "away",
  );

  const renderPlayer = (p, opts = {}) => {
    const { isOff = false, offReason = null } = opts;
    const label = isOff
      ? offReason === "red"
        ? "🟥"
        : offReason === "injury"
          ? "🚑"
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
          <PlayerLink playerId={p.id}>{p.name}</PlayerLink>
          {!!p.is_star && (p.position === "MED" || p.position === "ATA") && (
            <span className="ml-0.5 text-amber-400 font-black">*</span>
          )}
        </span>
        {!isOff && p.skill != null && (
          <span className="text-[10px] font-black tabular-nums text-zinc-500 shrink-0">
            {p.skill}
          </span>
        )}
        {label ? <span className="text-[10px] shrink-0">{label}</span> : null}
      </div>
    );
  };

  const sortedLineup = (arr) =>
    [...arr].sort(
      (a, b) => (POS_ORDER[a.position] ?? 9) - (POS_ORDER[b.position] ?? 9),
    );

  return (
    <div className="flex divide-x divide-zinc-800 flex-1 overflow-hidden min-h-0">
      {[
        { info: hInfo, lineup: homeLineup },
        { info: aInfo, lineup: awayLineup },
      ].map(({ info, lineup }, idx) => (
        <div key={idx} className="flex-1 flex flex-col min-w-0 overflow-y-auto">
          <p
            className="text-[9px] font-black uppercase tracking-widest px-2.5 py-1 border-b border-zinc-800 shrink-0"
            style={{ color: info?.color_primary || "#f59e0b" }}
          >
            {info?.name || "—"}
          </p>
          <div className="px-2.5 py-1">
            {sortedLineup(lineup.active).map((p) => renderPlayer(p))}
            {lineup.offPlayers.map((p) =>
              renderPlayer(p, { isOff: true, offReason: p.reason }),
            )}
          </div>
          {lineup.subPlayers.length > 0 && (
            <>
              <p className="text-[9px] font-black uppercase tracking-widest px-2.5 pt-1 text-zinc-600 shrink-0">
                Entrou
              </p>
              <div className="px-2.5 pb-1">
                {lineup.subPlayers.map((p) => (
                  <div
                    key={p.id ?? p.name}
                    className="flex items-center gap-1.5 py-0.5"
                  >
                    <span className="w-3.5 text-[10px] font-black text-emerald-500 shrink-0">
                      ↑
                    </span>
                    <span className="flex-1 truncate text-xs font-bold text-zinc-300">
                      <PlayerLink playerId={p.id}>{p.name}</PlayerLink>
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
  );
}

export function TabAdversario({ fixture, myTeamId, teams }) {
  if (!fixture?.homeLineup || !fixture?.awayLineup) return null;

  const isHome = fixture.homeTeamId === myTeamId;
  const oppLineup = isHome ? fixture.awayLineup : fixture.homeLineup;
  const oppTeamId = isHome ? fixture.awayTeamId : fixture.homeTeamId;
  const oppInfo = teams.find((t) => t.id === oppTeamId);

  const oppTactic = isHome ? fixture._t2 : fixture._t1;
  const formation = oppTactic?.formation || null;
  const styleRaw = oppTactic?.style?.toUpperCase?.() || null;
  const styleLabel =
    styleRaw === "OFENSIVO"
      ? "Ofensivo"
      : styleRaw === "DEFENSIVO"
        ? "Defensivo"
        : styleRaw === "EQUILIBRADO"
          ? "Equilibrado"
          : null;

  const starters = _sortByPos(
    oppLineup.filter((p) => p.is_starter === true).slice(0, 11),
  );

  const bench = _sortByPos(oppLineup.filter((p) => p.is_starter === false));

  const rows = {
    ATA: starters.filter((p) => p.position === "ATA"),
    MED: starters.filter((p) => p.position === "MED"),
    DEF: starters.filter((p) => p.position === "DEF"),
    GR: starters.filter((p) => p.position === "GR"),
  };

  const posColors = {
    GR: "bg-amber-500 text-zinc-950",
    DEF: "bg-sky-500 text-zinc-950",
    MED: "bg-emerald-500 text-zinc-950",
    ATA: "bg-rose-500 text-white",
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3 bg-[radial-gradient(circle_at_top,#0f1320_0%,#0d0d14_55%,#09090f_100%)]">
      <div className="flex items-center gap-2 pb-1 border-b border-zinc-800/80">
        <span
          className="text-xs font-black uppercase tracking-widest truncate"
          style={{ color: oppInfo?.color_primary || "#f59e0b" }}
        >
          {oppInfo?.name || "Adversário"}
        </span>
        {(formation || styleLabel) && (
          <span className="ml-auto text-[10px] font-black text-zinc-400 shrink-0">
            {[formation, styleLabel].filter(Boolean).join(" · ")}
          </span>
        )}
      </div>

      {starters.length === 0 ? (
        <p className="text-center text-zinc-500 text-xs font-bold py-6">
          Sem dados da escalação do adversário
        </p>
      ) : (
        <div className="flex gap-3 flex-1 min-h-0">
          <div className="flex-1 relative rounded-md overflow-hidden border border-emerald-900/60 bg-[linear-gradient(180deg,#05430e_0%,#0b5e1a_50%,#05430e_100%)]" style={{ aspectRatio: "9/16", maxHeight: "420px" }}>
            <svg className="absolute inset-0 w-full h-full" viewBox="0 0 315 560" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
              <rect x="10" y="10" width="295" height="540" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" rx="2" />
              <line x1="10" y1="280" x2="305" y2="280" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
              <circle cx="157" cy="280" r="50" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
              <circle cx="157" cy="280" r="3" fill="rgba(255,255,255,0.18)" />
              <rect x="25" y="10" width="265" height="150" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
              <rect x="85" y="10" width="145" height="40" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
              <rect x="25" y="400" width="265" height="150" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
              <rect x="85" y="510" width="145" height="40" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
            </svg>

            {["GR", "DEF", "MED", "ATA"].map((key) => {
              const rowPlayers = rows[key] || [];
              if (rowPlayers.length === 0) return null;
              return (
                <div
                  key={key}
                  className="absolute w-full flex justify-evenly items-start px-3"
                  style={{ top: key === "GR" ? "8%" : key === "DEF" ? "31%" : key === "MED" ? "56%" : "81%" }}
                >
                  {rowPlayers.map((player) => (
                    <div
                      key={player.id ?? player.name}
                      className="flex flex-col items-center gap-0.5"
                      style={{ maxWidth: "90px" }}
                    >
                      <div
                        className={`w-9 h-9 rounded-full flex items-center justify-center font-black text-[10px] border border-white/30 shadow-lg ${posColors[player.position] || "bg-zinc-500 text-white"}`}
                      >
                        {POSITION_SHORT_LABELS[player.position] || "?"}
                      </div>
                      <div
                        className="bg-black/65 backdrop-blur-sm px-1.5 py-0.5 rounded text-[9px] font-black text-white text-center truncate"
                        style={{ maxWidth: "85px" }}
                      >
                        {player.name}
                        {!!player.is_star &&
                          (player.position === "MED" ||
                            player.position === "ATA") && (
                            <span className="ml-0.5 text-amber-400">*</span>
                          )}
                      </div>
                      <span className="text-[9px] font-black text-amber-200 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
                        {player.skill ?? "-"}
                      </span>
                    </div>
                  ))}
                </div>
              );
            })}

            <div className="absolute inset-0 pointer-events-none bg-linear-to-t from-black/35 to-transparent" />
          </div>

          <div className="flex-1 flex flex-col">
            <p className="text-[9px] font-black uppercase tracking-widest text-zinc-600 mb-1.5">
              Banco
            </p>
            <div className="flex-1 overflow-y-auto">
              {bench.map((player) => (
                <div
                  key={player.id ?? player.name}
                  className="flex items-center gap-1.5 py-1 px-1.5 rounded bg-surface-container-high/30"
                >
                  <span
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-[8px] font-black border border-white/20 shrink-0 ${posColors[player.position] || "bg-zinc-500 text-white"}`}
                  >
                    {POSITION_SHORT_LABELS[player.position] || "?"}
                  </span>
                  <span className="flex-1 truncate text-[10px] font-bold text-zinc-300">
                    {player.name}
                    {!!player.is_star &&
                      (player.position === "MED" || player.position === "ATA") && (
                        <span className="ml-0.5 text-amber-400 font-black">*</span>
                      )}
                  </span>
                  <span className="text-[9px] font-black tabular-nums text-zinc-500 shrink-0">
                    {player.skill ?? "—"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const _sortByPos = (arr) =>
  [...arr].sort(
    (a, b) =>
      (POS_ORDER[a.position] ?? 9) - (POS_ORDER[b.position] ?? 9) ||
      (b.skill ?? 0) - (a.skill ?? 0),
  );

export function TabIntervencao({
  mode,
  matchAction,
  injuryCountdown,
  tactic,
  onUpdateTactic,
  annotatedSquad,
  subbedOut,
  confirmedSubs,
  subsMade,
  swapSource,
  swapTarget,
  onSelectOut,
  onSelectIn,
  onConfirmSub,
  onResetSub,
  onResetAllSubs,
  redCardedHalftimeIds,
  injuredHalftimeIds,
  onResolveAction,
}) {
  const shouldReduceMotion = false;
  const actionType = matchAction?.type || null;
  const isHalftime = mode === "halftime";
  const isActionMode = mode === "action";
  const isPenalty = actionType === "penalty";
  const isForcedSwap = actionType === "injury" || actionType === "gk_red_card";
  const isActionSub = actionType === "user_substitution";

  const selectedOutId =
    typeof swapSource === "object" && swapSource !== null
      ? swapSource.id
      : swapSource;
  const selectedInId =
    typeof swapTarget === "object" && swapTarget !== null
      ? swapTarget.id
      : swapTarget;

  const forceOutPlayer =
    matchAction?.injuredPlayer ||
    matchAction?.sentOffPlayer ||
    matchAction?.dismissedPlayer ||
    null;

  const sortPlayers = (arr = []) =>
    [...arr].sort(
      (a, b) =>
        (POS_ORDER[a.position] ?? 9) - (POS_ORDER[b.position] ?? 9) ||
        (b.skill ?? 0) - (a.skill ?? 0),
    );

  const onPitchPlayers = isHalftime
    ? sortPlayers(
        annotatedSquad.filter(
          (p) =>
            tactic.positions[p.id] === "Titular" &&
            !subbedOut.includes(p.id) &&
            !redCardedHalftimeIds.has(p.id) &&
            !injuredHalftimeIds?.has(p.id),
        ),
      )
    : isPenalty
      ? sortPlayers(matchAction?.takerCandidates || [])
      : isActionSub
        ? sortPlayers(matchAction?.onPitch || [])
        : forceOutPlayer
          ? [forceOutPlayer]
          : [];

  const benchPlayers = isHalftime
    ? sortPlayers(
        annotatedSquad
          .filter((p) => tactic.positions[p.id] === "Suplente")
          .filter((p) => !injuredHalftimeIds?.has(p.id)),
      )
    : isPenalty
      ? []
      : sortPlayers(matchAction?.benchPlayers || []);

  const playerById = (id) =>
    annotatedSquad.find((p) => p.id === id) ||
    onPitchPlayers.find((p) => p.id === id) ||
    benchPlayers.find((p) => p.id === id) ||
    null;

  const effectiveOutId =
    selectedOutId || (isForcedSwap ? forceOutPlayer?.id : null);
  const sourcePlayer = playerById(effectiveOutId);

  const handlePickOut = (player) => {
    if (!player) return;
    onSelectOut(isActionMode ? player : player.id);
  };

  const handlePickIn = (player) => {
    if (!player) return;
    onSelectIn(isActionMode ? player : player.id);
  };

  const canConfirmSwap =
    !!effectiveOutId &&
    !!selectedInId &&
    (!isHalftime || subsMade < MAX_MATCH_SUBS);

  const actionTheme = isPenalty
    ? "from-amber-600/20 via-amber-500/5 to-transparent"
    : isForcedSwap
      ? "from-red-700/20 via-orange-500/10 to-transparent"
      : isActionSub
        ? "from-cyan-500/20 via-blue-500/10 to-transparent"
        : "from-emerald-500/15 via-primary/10 to-transparent";

  const titleText = isHalftime
    ? "Gestão da Equipa"
    : isPenalty
      ? "Escolhe o marcador"
      : isForcedSwap
        ? `Substituição obrigatória · ${forceOutPlayer?.name || "jogador"}`
        : "Pausa para substituição";

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden bg-[linear-gradient(170deg,#0d0d14_0%,#11111b_45%,#0e1018_100%)]">
      {confirmedSubs.length > 0 && isHalftime && (
        <div className="shrink-0 px-3 py-2 border-b border-cyan-900/40 bg-cyan-950/20 flex flex-wrap gap-1.5">
          {confirmedSubs.map((sub) => {
            const outP = annotatedSquad.find((p) => p.id === sub.out);
            const inP = annotatedSquad.find((p) => p.id === sub.in);
            return (
              <div
                key={`${sub.out}-${sub.in}`}
                className="flex items-center gap-1 rounded-full pl-2 pr-2.5 py-0.5 text-[10px] font-bold border border-cyan-800/40 bg-zinc-950/80"
              >
                <span className="text-cyan-400 shrink-0">🔄</span>
                <span className="text-rose-300 truncate max-w-22">
                  {outP?.name ?? "?"}
                </span>
                <span className="text-zinc-600 shrink-0 mx-0.5">→</span>
                <span className="text-emerald-300 truncate max-w-22">
                  {inP?.name ?? "?"}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {isHalftime && (
        <div className="shrink-0 px-3 py-2 border-b border-zinc-800 bg-zinc-950/65">
          <span className="block text-[9px] font-black uppercase tracking-[0.22em] text-zinc-500 mb-1.5">
            Mentalidade
          </span>
          <div className="grid grid-cols-3 gap-1.5">
            {[
              { value: "Defensive", label: "Defensivo" },
              { value: "Balanced", label: "Equilibrado" },
              { value: "Offensive", label: "Ofensivo" },
            ].map(({ value, label }) => (
              <button
                key={value}
                onClick={() => onUpdateTactic({ style: value })}
                className={`py-1.5 rounded text-[10px] font-black uppercase tracking-wide transition-all border ${
                  tactic.style === value
                    ? value === "Defensive"
                      ? "bg-blue-600/90 border-blue-400/70 text-white shadow-[0_0_16px_rgba(37,99,235,0.35)]"
                      : value === "Offensive"
                        ? "bg-amber-500/90 border-amber-300/70 text-zinc-950 shadow-[0_0_16px_rgba(245,158,11,0.35)]"
                        : "bg-primary border-primary/60 text-on-primary shadow-[0_0_16px_rgba(99,102,241,0.35)]"
                    : "bg-zinc-900/80 border-zinc-700/60 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div
        className={`shrink-0 px-3 py-2 border-b border-zinc-800 bg-gradient-to-r ${actionTheme}`}
      >
        <p className="text-[11px] font-black uppercase tracking-[0.2em] text-zinc-100 text-center truncate">
          {titleText}
        </p>
        {isForcedSwap && injuryCountdown !== null && (
          <p className="text-center text-amber-300 font-black text-[10px] mt-1 tracking-wide animate-pulse">
            Auto-substituição em {injuryCountdown}s
          </p>
        )}
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden flex-col md:flex-row">
        <div className="flex flex-col min-w-0 flex-1 overflow-hidden border-b md:border-b-0 md:border-r border-zinc-800/90">
          <div className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-zinc-950/70 border-b border-zinc-800/90">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
            <span className="text-[9px] font-black uppercase tracking-[0.2em] text-emerald-300">
              Em Campo
            </span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {onPitchPlayers.map((p, i) => {
              const grAvailableOnBench = benchPlayers.some(
                (bp) => bp.position === "GR" && !subbedOut.includes(bp.id),
              );
              const noGrReplacement =
                isHalftime && p.position === "GR" && !grAvailableOnBench;
              const isLockedForced =
                isForcedSwap && !!forceOutPlayer && p.id !== forceOutPlayer.id;
              const disabled =
                noGrReplacement ||
                isLockedForced ||
                (isHalftime && subsMade >= MAX_MATCH_SUBS) ||
                (isPenalty &&
                  !(matchAction?.takerCandidates || []).find(
                    (c) => c.id === p.id,
                  ));
              const selected = effectiveOutId === p.id;
              return (
                <motion.button
                  key={p.id}
                  onClick={() => !disabled && handlePickOut(p)}
                  title={
                    noGrReplacement
                      ? "Não há GR no banco para substituir"
                      : undefined
                  }
                  initial={
                    shouldReduceMotion
                      ? false
                      : { opacity: 0, x: -10, filter: "blur(2px)" }
                  }
                  animate={
                    shouldReduceMotion
                      ? undefined
                      : { opacity: 1, x: 0, filter: "blur(0px)" }
                  }
                  transition={
                    shouldReduceMotion
                      ? undefined
                      : { duration: 0.2, delay: Math.min(i, 6) * 0.02 }
                  }
                  className={`w-full flex items-center gap-2 px-2 py-2 border-b border-zinc-800/50 text-left select-none transition-all border-l-2 ${
                    selected
                      ? "bg-rose-500/15 border-l-rose-400 shadow-[inset_0_0_20px_rgba(244,63,94,0.18)]"
                      : disabled
                        ? "opacity-40 cursor-not-allowed border-l-transparent"
                        : "cursor-pointer hover:bg-zinc-800/55 border-l-transparent"
                  }`}
                >
                  <span
                    className={`shrink-0 px-1 py-0.5 rounded-sm text-[8px] font-black border-l-2 ${
                      selected
                        ? "bg-rose-500/20 text-rose-200 border-l-rose-400"
                        : `bg-surface-bright ${POSITION_BORDER_CLASS[p.position] || "border-zinc-500"} ${POSITION_TEXT_CLASS[p.position]}`
                    }`}
                  >
                    {POSITION_SHORT_LABELS[p.position]}
                  </span>
                  <span
                    className={`flex-1 truncate text-[11px] font-bold ${selected ? "text-rose-100" : "text-zinc-100"}`}
                  >
                    {p.name}
                    {!!p.is_star &&
                      (p.position === "MED" || p.position === "ATA") && (
                        <span className="ml-0.5 text-amber-400 font-black">
                          *
                        </span>
                      )}
                  </span>
                  <div className="shrink-0 grid grid-cols-3 items-center gap-x-1.5 text-right">
                    <span
                      className={`text-[11px] font-black tabular-nums ${selected ? "text-rose-300" : "text-zinc-400"}`}
                    >
                      {p.skill ?? "—"}
                    </span>
                    <span className="text-[10px] text-cyan-400/70 tabular-nums">
                      🛡️{p.resistance ?? "–"}
                    </span>
                    <FormBadge form={p.form} />
                  </div>
                </motion.button>
              );
            })}
            {onPitchPlayers.length === 0 && (
              <p className="text-center text-zinc-600 text-xs font-bold py-6">
                Sem opções em campo
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-col min-w-0 flex-1 overflow-hidden">
          <div className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-zinc-950/70 border-b border-zinc-800/90">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0" />
            <span className="text-[9px] font-black uppercase tracking-[0.2em] text-cyan-300">
              {isPenalty ? "Escolha" : "Banco"}
            </span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {isPenalty ? (
              <p className="text-center text-zinc-500 text-xs font-bold py-8 px-4">
                Seleciona o marcador na coluna "Em Campo".
              </p>
            ) : (
              benchPlayers.map((p, i) => {
                const alreadyUsed = isHalftime && subbedOut.includes(p.id);
                const positionMismatch =
                  !!sourcePlayer &&
                  (sourcePlayer.position === "GR") !== (p.position === "GR");
                const disabled =
                  alreadyUsed ||
                  positionMismatch ||
                  (isHalftime && subsMade >= MAX_MATCH_SUBS);
                const selected = selectedInId === p.id;
                return (
                  <motion.button
                    key={p.id}
                    onClick={() => !disabled && handlePickIn(p)}
                    initial={
                      shouldReduceMotion
                        ? false
                        : { opacity: 0, x: 10, filter: "blur(2px)" }
                    }
                    animate={
                      shouldReduceMotion
                      ? undefined
                      : { opacity: 1, x: 0, filter: "blur(0px)" }
                    }
                    transition={
                      shouldReduceMotion
                        ? undefined
                        : { duration: 0.2, delay: Math.min(i, 6) * 0.02 }
                    }
                    className={`w-full flex items-center gap-2 px-2 py-2 border-b border-zinc-800/50 text-left select-none transition-all border-l-2 ${
                      alreadyUsed
                        ? "opacity-25 cursor-not-allowed border-l-transparent"
                        : selected
                          ? "bg-emerald-500/15 border-l-emerald-400 shadow-[inset_0_0_20px_rgba(16,185,129,0.2)]"
                          : disabled
                            ? "opacity-40 cursor-not-allowed border-l-transparent"
                            : "cursor-pointer hover:bg-zinc-800/55 border-l-transparent"
                    }`}
                  >
                    <span
                      className={`shrink-0 px-1 py-0.5 rounded-sm text-[8px] font-black border-l-2 ${
                        alreadyUsed
                          ? "bg-zinc-900 text-zinc-700 border-zinc-700"
                          : selected
                            ? "bg-emerald-500/20 text-emerald-200 border-l-emerald-400"
                            : `bg-surface-bright ${POSITION_BORDER_CLASS[p.position] || "border-zinc-500"} ${POSITION_TEXT_CLASS[p.position]}`
                      }`}
                    >
                      {POSITION_SHORT_LABELS[p.position]}
                    </span>
                    <span
                      className={`flex-1 truncate text-[11px] font-bold ${selected ? "text-emerald-100" : "text-zinc-100"}`}
                    >
                      {p.name}
                      {!alreadyUsed &&
                        !!p.is_star &&
                        (p.position === "MED" || p.position === "ATA") && (
                          <span className="ml-0.5 text-amber-400 font-black">
                            *
                          </span>
                        )}
                    </span>
                    <div className="shrink-0 flex items-center gap-1">
                      <span
                        className={`text-[11px] font-black tabular-nums ${selected ? "text-emerald-300" : "text-zinc-500"}`}
                      >
                        {alreadyUsed ? "—" : (p.skill ?? "—")}
                      </span>
                      {!alreadyUsed && p.resistance != null && (
                        <span className="text-[10px] text-cyan-400/70 tabular-nums">
                          🛡️{p.resistance}
                        </span>
                      )}
                      {!alreadyUsed && <FormBadge form={p.form} />}
                    </div>
                  </motion.button>
                );
              })
            )}
            {!isPenalty && benchPlayers.length === 0 && (
              <p className="text-center text-zinc-600 text-xs font-bold py-6">
                Sem opções no banco
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="shrink-0 border-t border-zinc-800/80 bg-zinc-950/80 px-3 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex-1 flex items-center gap-2 min-w-0">
            <span className="text-[10px] text-zinc-600 shrink-0">Sai</span>
            <span className="bg-rose-950/90 text-rose-200 border border-rose-800/70 text-[10px] font-black px-2 py-0.5 rounded truncate max-w-[38%]">
              {effectiveOutId ? playerById(effectiveOutId)?.name || "?" : "—"}
            </span>
            {!isPenalty && (
              <>
                <span className="text-zinc-500 shrink-0 font-black text-sm">
                  →
                </span>
                <span className="text-[10px] text-zinc-600 shrink-0">
                  Entra
                </span>
                <span className="bg-emerald-950/90 text-emerald-200 border border-emerald-800/70 text-[10px] font-black px-2 py-0.5 rounded truncate max-w-[38%]">
                  {selectedInId ? playerById(selectedInId)?.name || "?" : "—"}
                </span>
              </>
            )}
          </div>

          {isHalftime ? (
            <>
              <button
                onClick={onResetSub}
                className="shrink-0 w-7 h-7 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-500 hover:text-white text-[10px] flex items-center justify-center transition-colors"
              >
                ✕
              </button>
              <button
                onClick={onConfirmSub}
                disabled={!canConfirmSwap}
                className={`shrink-0 px-3 py-1.5 rounded text-[10px] font-black uppercase tracking-wide transition-all ${
                  canConfirmSwap
                    ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-[0_0_20px_rgba(16,185,129,0.35)]"
                    : "bg-zinc-800 text-zinc-600 cursor-not-allowed"
                }`}
              >
                Substituir
              </button>
            </>
          ) : (
            <>
              <button
                disabled={isPenalty ? !effectiveOutId : !canConfirmSwap}
                onClick={() =>
                  isPenalty
                    ? onResolveAction(effectiveOutId || null)
                    : onResolveAction({
                        playerOut: effectiveOutId,
                        playerIn: selectedInId,
                      })
                }
                className="shrink-0 px-3 py-1.5 rounded text-[10px] font-black uppercase tracking-wide bg-primary hover:brightness-110 text-on-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Substituir
              </button>
            </>
          )}
        </div>
      </div>

      {isHalftime && confirmedSubs.length > 0 && (
        <div className="shrink-0 border-t border-zinc-800/30 px-4 py-1.5 flex justify-center bg-zinc-950/70">
          <button
            onClick={onResetAllSubs}
            className="text-[9px] font-black uppercase tracking-widest text-rose-400 hover:text-rose-300 transition-colors"
          >
            ↺ Anular todas as substituições
          </button>
        </div>
      )}
    </div>
  );
}
