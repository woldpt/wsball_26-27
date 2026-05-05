import { useState } from "react";
// eslint-disable-next-line no-unused-vars
import { motion, AnimatePresence } from "framer-motion";
import { getEffectiveLineup } from "../../utils/playerHelpers.js";
import {
  POSITION_TEXT_CLASS,
  POSITION_SHORT_LABELS,
  POSITION_BORDER_CLASS,
  MAX_MATCH_SUBS,
} from "../../constants/index.js";
import { PlayerLink } from "../shared/PlayerLink.jsx";

const POS_ORDER = { GR: 0, DEF: 1, MED: 2, ATA: 3 };
const _sortByPos = (arr) =>
  [...arr].sort(
    (a, b) =>
      (POS_ORDER[a.position] ?? 9) - (POS_ORDER[b.position] ?? 9) ||
      (b.skill ?? 0) - (a.skill ?? 0),
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

// ── Tab: Jogo (events + weather) ────────────────────────────────────────────

function TabJogo({ fixture, liveMinute, teams }) {
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
        ].includes(e.type),
    )
    .sort((a, b) => (a.minute ?? 0) - (b.minute ?? 0));

  const ref = fixture.referee;
  const refBalance = ref?.balance ?? 50;

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-3">
      {/* Meta */}
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

      {/* Events */}
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
    </div>
  );
}

// ── Tab: Escalações ──────────────────────────────────────────────────────────

function TabLineup({ fixture, liveMinute, teams }) {
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

// ── Tab: Adversário (halftime) ───────────────────────────────────────────────

/**
 * Mostra a escalação e táctica do adversário no intervalo.
 * @param {{ fixture: object, myTeamId: number, teams: object[] }} props
 */
function TabAdversario({ fixture, myTeamId, teams }) {
  if (!fixture?.homeLineup || !fixture?.awayLineup) return null;

  const isHome = fixture.homeTeamId === myTeamId;
  const oppLineup = isHome ? fixture.awayLineup : fixture.homeLineup;
  const oppTeamId = isHome ? fixture.awayTeamId : fixture.homeTeamId;
  const oppInfo = teams.find((t) => t.id === oppTeamId);

  // Táctica do adversário vem nos campos _t1 (home) / _t2 (away) do fixture
  const oppTactic = isHome ? fixture._t2 : fixture._t1;
  const formation = oppTactic?.formation || null;
  const styleLabel =
    oppTactic?.style === "ofensivo"
      ? "Ofensivo"
      : oppTactic?.style === "defensivo"
        ? "Defensivo"
        : oppTactic?.style === "equilibrado"
          ? "Equilibrado"
          : null;

  const starters = _sortByPos(oppLineup.filter((p) => p.is_starter !== false && p.starter !== false).slice(0, 11));
  const bench = oppLineup.filter((p) => !starters.find((s) => s.id === p.id));

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-3">
      {/* Cabeçalho equipa adversária */}
      <div className="flex items-center gap-2 pb-1 border-b border-zinc-800">
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

      {/* Titulares */}
      <div>
        <p className="text-[9px] font-black uppercase tracking-widest text-zinc-500 mb-1">
          Titulares
        </p>
        <div className="space-y-0.5">
          {starters.map((p) => (
            <div key={p.id ?? p.name} className="flex items-center gap-1.5 py-0.5">
              <span
                className={`w-6 text-[10px] font-black shrink-0 ${POSITION_TEXT_CLASS[p.position] || "text-zinc-400"}`}
              >
                {POSITION_SHORT_LABELS[p.position] || "?"}
              </span>
              <span
                className={`flex-1 truncate text-xs font-bold text-zinc-200 ${POSITION_BORDER_CLASS[p.position] ? "" : ""}`}
              >
                {p.name}
                {!!p.is_star && (p.position === "MED" || p.position === "ATA") && (
                  <span className="ml-0.5 text-amber-400 font-black">*</span>
                )}
              </span>
              {p.skill != null && (
                <span className="text-[10px] font-black tabular-nums text-zinc-500 shrink-0">
                  {p.skill}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Banco */}
      {bench.length > 0 && (
        <div>
          <p className="text-[9px] font-black uppercase tracking-widest text-zinc-500 mb-1">
            Banco
          </p>
          <div className="space-y-0.5">
            {_sortByPos(bench).map((p) => (
              <div key={p.id ?? p.name} className="flex items-center gap-1.5 py-0.5 opacity-60">
                <span
                  className={`w-6 text-[10px] font-black shrink-0 ${POSITION_TEXT_CLASS[p.position] || "text-zinc-400"}`}
                >
                  {POSITION_SHORT_LABELS[p.position] || "?"}
                </span>
                <span className="flex-1 truncate text-xs font-bold text-zinc-400">
                  {p.name}
                  {!!p.is_star && (p.position === "MED" || p.position === "ATA") && (
                    <span className="ml-0.5 text-amber-400 font-black">*</span>
                  )}
                </span>
                {p.skill != null && (
                  <span className="text-[10px] font-black tabular-nums text-zinc-500 shrink-0">
                    {p.skill}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tab: Substituições (halftime) ────────────────────────────────────────────

function TabSubs({
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
}) {
  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      {/* Confirmed subs strip */}
      {confirmedSubs.length > 0 && (
        <div className="shrink-0 px-3 py-2 bg-surface-container/60 border-b border-outline-variant/20 flex flex-wrap gap-1.5">
          {confirmedSubs.map((sub) => {
            const outP = annotatedSquad.find((p) => p.id === sub.out);
            const inP = annotatedSquad.find((p) => p.id === sub.in);
            return (
              <div
                key={`${sub.out}-${sub.in}`}
                className="flex items-center gap-1 bg-zinc-800 rounded-full pl-2 pr-2.5 py-0.5 text-[10px] font-bold"
              >
                <span className="text-zinc-600 shrink-0">🔄</span>
                <span className="text-red-400 truncate max-w-22">
                  {outP?.name ?? "?"}
                </span>
                <span className="text-zinc-600 shrink-0 mx-0.5">→</span>
                <span className="text-emerald-400 truncate max-w-22">
                  {inP?.name ?? "?"}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Mentality */}
      <div className="shrink-0 px-3 py-2 bg-surface-container/60 border-b border-outline-variant/20">
        <span className="block text-[9px] font-black uppercase tracking-widest text-zinc-500 mb-1.5">
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
              onClick={() => onUpdateTactic({ style: value })}
              className={`flex-1 py-1.5 rounded text-[10px] font-black uppercase tracking-wide transition-colors ${
                tactic.style === value
                  ? value === "Defensive"
                    ? "bg-blue-600 text-white"
                    : value === "Offensive"
                      ? "bg-amber-500 text-zinc-950"
                      : "bg-primary text-on-primary"
                  : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Two-column player list */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Em Campo */}
        <div className="flex flex-col min-w-0 border-r border-zinc-800 flex-1 overflow-hidden">
          <div className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-surface-container/40 border-b border-outline-variant/20">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
            <span className="text-[9px] font-black uppercase tracking-widest text-emerald-500">
              Em Campo
            </span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {annotatedSquad
              .filter(
                (p) =>
                  tactic.positions[p.id] === "Titular" &&
                  !subbedOut.includes(p.id) &&
                  !redCardedHalftimeIds.has(p.id),
              )
              .map((p) => {
                const grAvailableOnBench = annotatedSquad.some(
                  (bp) =>
                    tactic.positions[bp.id] === "Suplente" &&
                    bp.position === "GR" &&
                    !subbedOut.includes(bp.id),
                );
                const noGrReplacement =
                  p.position === "GR" && !grAvailableOnBench;
                const canSelectOut =
                  subsMade < MAX_MATCH_SUBS && !noGrReplacement;
                return (
                  <div
                    key={p.id}
                    onClick={() => canSelectOut && onSelectOut(p.id)}
                    title={
                      noGrReplacement
                        ? "Não há GR no banco para substituir"
                        : undefined
                    }
                    className={`flex items-center gap-2 px-2 py-1.5 border-b border-zinc-800/40 select-none transition-all border-l-2 ${
                      swapSource === p.id
                        ? "bg-red-500/15 border-l-red-500"
                        : canSelectOut
                          ? "cursor-pointer hover:bg-zinc-800/50 border-l-transparent"
                          : "opacity-40 cursor-not-allowed border-l-transparent"
                    }`}
                  >
                    <span
                      className={`shrink-0 px-1 py-0.5 rounded-sm text-[8px] font-black border-l-2 ${
                        swapSource === p.id
                          ? "bg-red-500/20 text-red-300 border-l-red-400"
                          : `bg-surface-bright ${POSITION_BORDER_CLASS[p.position] || "border-zinc-500"} ${POSITION_TEXT_CLASS[p.position]}`
                      }`}
                    >
                      {POSITION_SHORT_LABELS[p.position]}
                    </span>
                    <span
                      className={`flex-1 truncate text-[11px] font-bold ${swapSource === p.id ? "text-red-200" : "text-zinc-200"}`}
                    >
                      {p.name}
                      {!!p.is_star &&
                        (p.position === "MED" || p.position === "ATA") && (
                          <span className="ml-0.5 text-amber-400 font-black">
                            *
                          </span>
                        )}
                    </span>
                    <div className="shrink-0 grid grid-cols-3 items-center gap-x-2 text-right">
                      <span
                        className={`text-[12px] font-black tabular-nums ${swapSource === p.id ? "text-red-400" : "text-zinc-400"}`}
                      >
                        {p.skill}
                      </span>
                      <span className="text-[10px] text-cyan-400/70 tabular-nums">
                        🛡️{p.resistance ?? "–"}
                      </span>
                      <FormBadge form={p.form} />
                    </div>
                  </div>
                );
              })}
          </div>
        </div>

        {/* Banco */}
        <div className="flex flex-col min-w-0 flex-1 overflow-hidden">
          <div className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-surface-container/40 border-b border-outline-variant/20">
            <span className="w-1.5 h-1.5 rounded-full bg-zinc-600 shrink-0" />
            <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500">
              Banco
            </span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {annotatedSquad
              .filter((p) => tactic.positions[p.id] === "Suplente")
              .map((p) => {
                const alreadyUsed = subbedOut.includes(p.id);
                const sourcePlayer = swapSource
                  ? annotatedSquad.find((sp) => sp.id === swapSource)
                  : null;
                const positionMismatch =
                  !!swapSource &&
                  !!sourcePlayer &&
                  (sourcePlayer.position === "GR") !== (p.position === "GR");
                const disabled =
                  alreadyUsed || subsMade >= MAX_MATCH_SUBS || positionMismatch;
                return (
                  <div
                    key={p.id}
                    onClick={() => !disabled && onSelectIn(p.id)}
                    className={`flex items-center gap-2 px-2 py-1.5 border-b border-zinc-800/40 select-none transition-all border-l-2 ${
                      alreadyUsed
                        ? "opacity-20 cursor-not-allowed border-l-transparent"
                        : swapTarget === p.id
                          ? "bg-emerald-500/15 border-l-emerald-500 cursor-pointer"
                          : disabled
                            ? "opacity-40 cursor-not-allowed border-l-transparent"
                            : "cursor-pointer hover:bg-zinc-800/50 border-l-transparent"
                    }`}
                  >
                    <span
                      className={`shrink-0 px-1 py-0.5 rounded-sm text-[8px] font-black border-l-2 ${
                        alreadyUsed
                          ? "bg-zinc-800/40 text-zinc-700 border-zinc-700"
                          : swapTarget === p.id
                            ? "bg-emerald-500/20 text-emerald-300 border-l-emerald-400"
                            : `bg-surface-bright ${POSITION_BORDER_CLASS[p.position] || "border-zinc-500"} ${POSITION_TEXT_CLASS[p.position]}`
                      }`}
                    >
                      {POSITION_SHORT_LABELS[p.position]}
                    </span>
                    <span
                      className={`flex-1 truncate text-[11px] font-bold ${
                        alreadyUsed
                          ? "text-zinc-700 line-through"
                          : swapTarget === p.id
                            ? "text-emerald-200"
                            : "text-zinc-200"
                      }`}
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
                        className={`text-[10px] font-black tabular-nums ${
                          alreadyUsed
                            ? "text-zinc-700"
                            : swapTarget === p.id
                              ? "text-emerald-400"
                              : "text-zinc-600"
                        }`}
                      >
                        {alreadyUsed ? "—" : p.skill}
                      </span>
                      {!alreadyUsed && p.resistance != null && (
                        <span className="text-[12px] text-cyan-400/70 tabular-nums">
                          🛡️{p.resistance}
                        </span>
                      )}
                      {!alreadyUsed && <FormBadge form={p.form} />}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      </div>

      {/* Swap action bar */}
      {swapSource || swapTarget ? (
        <div className="shrink-0 flex items-center gap-2 px-3 py-2.5 border-t border-outline-variant/30 bg-surface-container">
          <div className="flex-1 flex items-center gap-2 min-w-0">
            {swapSource ? (
              <span className="bg-red-950 text-red-300 border border-red-800/60 text-[10px] font-black px-2 py-0.5 rounded truncate max-w-[40%]">
                {annotatedSquad.find((p) => p.id === swapSource)?.name ?? "?"}
              </span>
            ) : (
              <span className="text-zinc-600 text-[10px] italic">
                escolhe em campo…
              </span>
            )}
            <span className="text-zinc-500 shrink-0 font-black text-sm">→</span>
            {swapTarget ? (
              <span className="bg-emerald-950 text-emerald-300 border border-emerald-800/60 text-[10px] font-black px-2 py-0.5 rounded truncate max-w-[40%]">
                {annotatedSquad.find((p) => p.id === swapTarget)?.name ?? "?"}
              </span>
            ) : (
              <span className="text-zinc-600 text-[10px] italic">
                escolhe do banco…
              </span>
            )}
          </div>
          <button
            onClick={onResetSub}
            className="shrink-0 w-6 h-6 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-500 hover:text-white text-[10px] flex items-center justify-center transition-colors"
          >
            ✕
          </button>
          <button
            onClick={onConfirmSub}
            disabled={!swapSource || !swapTarget}
            className={`shrink-0 px-3 py-1.5 rounded text-[10px] font-black uppercase tracking-wide transition-colors ${
              swapSource && swapTarget
                ? "bg-emerald-600 hover:bg-emerald-500 text-white"
                : "bg-zinc-800 text-zinc-600 cursor-not-allowed"
            }`}
          >
            Substituir
          </button>
        </div>
      ) : subsMade < MAX_MATCH_SUBS ? (
        <div className="shrink-0 border-t border-zinc-800/60 px-4 py-1.5 text-center">
          <span className="text-[9px] text-zinc-700 font-bold uppercase tracking-wide">
            Toca num jogador em campo ou no banco para substituir
          </span>
        </div>
      ) : null}

      {confirmedSubs.length > 0 && (
        <div className="shrink-0 border-t border-zinc-800/30 px-4 py-1.5 flex justify-center">
          <button
            onClick={onResetAllSubs}
            className="text-[9px] font-black uppercase tracking-widest text-red-400 hover:text-red-600 transition-colors"
          >
            ↺ Anular todas as substituições
          </button>
        </div>
      )}
    </div>
  );
}

// ── Tab: Ação urgente ────────────────────────────────────────────────────────

function TabAction({
  matchAction,
  injuryCountdown,
  swapSource,
  swapTarget,
  onSelectOut,
  onSelectIn,
  onResolveAction,
}) {
  if (!matchAction) return null;

  if (matchAction.type === "user_substitution") {
    const posOrder = { GR: 0, DEF: 1, MED: 2, ATA: 3 };
    const sortPlayers = (arr) =>
      [...arr].sort(
        (a, b) =>
          (posOrder[a.position] ?? 9) - (posOrder[b.position] ?? 9) ||
          (b.skill ?? 0) - (a.skill ?? 0),
      );
    const onPitchSorted = sortPlayers(matchAction.onPitch || []);
    const benchSorted = sortPlayers(matchAction.benchPlayers || []);

    return (
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
        <div className="flex flex-1 gap-4 p-4 min-h-0 overflow-hidden">
          <div className="flex-1 flex flex-col gap-2 overflow-hidden">
            <h3 className="text-zinc-300 font-bold text-center text-xs uppercase tracking-wider shrink-0">
              Em campo (sai)
            </h3>
            <div className="space-y-2 overflow-y-auto pr-1">
              {onPitchSorted.map((player) => (
                <button
                  key={`out-${player.id}`}
                  onClick={() => onSelectOut(player)}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded border transition-colors text-left ${swapSource?.id === player.id ? "border-primary bg-primary/20" : "border-outline-variant/20 bg-surface hover:bg-surface-bright"}`}
                >
                  <span className="font-bold text-white truncate text-sm">
                    {player.name}
                  </span>
                  <span className="text-[11px] font-black uppercase tracking-widest text-zinc-400 flex items-center gap-1 shrink-0">
                    {player.position} · {player.skill}
                    {player.resistance != null && (
                      <>
                        {" "}
                        ·{" "}
                        <span className="text-cyan-400/70">
                          🛡️{player.resistance}
                        </span>
                      </>
                    )}
                    {player.form != null && (
                      <>
                        {" "}
                        · <FormBadge form={player.form} />
                      </>
                    )}
                  </span>
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 flex flex-col gap-2 overflow-hidden">
            <h3 className="text-zinc-300 font-bold text-center text-xs uppercase tracking-wider shrink-0">
              No banco (entra)
            </h3>
            <div className="space-y-2 overflow-y-auto pr-1">
              {benchSorted.map((player) => (
                <button
                  key={`in-${player.id}`}
                  onClick={() => onSelectIn(player)}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded border transition-colors text-left ${swapTarget?.id === player.id ? "border-primary bg-primary/20" : "border-outline-variant/20 bg-surface hover:bg-surface-bright"}`}
                >
                  <span className="font-bold text-white truncate text-sm">
                    {player.name}
                  </span>
                  <span className="text-[11px] font-black uppercase tracking-widest text-zinc-400 flex items-center gap-1 shrink-0">
                    {player.position} · {player.skill}
                    {player.resistance != null && (
                      <>
                        {" "}
                        ·{" "}
                        <span className="text-cyan-400/70">
                          🛡️{player.resistance}
                        </span>
                      </>
                    )}
                    {player.form != null && (
                      <>
                        {" "}
                        · <FormBadge form={player.form} />
                      </>
                    )}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Injury or penalty
  const candidates =
    matchAction.type === "injury"
      ? matchAction.benchPlayers || []
      : matchAction.takerCandidates || [];

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden p-4">
      <p className="text-zinc-300 font-black mb-1 text-sm uppercase tracking-widest text-center">
        {matchAction.type === "injury"
          ? `Jogador lesionado: ${matchAction.injuredPlayer?.name || "?"}${matchAction.injuredPlayer?.position ? ` · ${matchAction.injuredPlayer.position}` : ""}`
          : "Escolhe o jogador para marcar o penalty"}
      </p>
      {matchAction.type === "injury" && injuryCountdown !== null && (
        <p className="text-center text-amber-400 font-black text-xs mb-3 tracking-wide">
          Auto-substituição em {injuryCountdown}s
        </p>
      )}
      <div className="flex-1 overflow-y-auto space-y-2">
        {candidates.map((player) => (
          <button
            key={player.id}
            onClick={() => onResolveAction(player.id)}
            className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded border border-outline-variant/20 bg-surface hover:bg-surface-bright transition-colors text-left"
          >
            <span className="font-bold text-white truncate">{player.name}</span>
            <span className="text-xs font-black uppercase tracking-widest text-zinc-400">
              {player.position} · {player.skill}
            </span>
          </button>
        ))}
        {candidates.length === 0 && (
          <p className="text-center text-zinc-500 font-bold text-sm py-8">
            Sem opções disponíveis. O sistema escolherá automaticamente.
          </p>
        )}
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

/**
 * @param {{
 *   mode: "halftime"|"action"|"detail"|null,
 *   onClose: function,
 *   fixture: object|null,
 *   liveMinute: number,
 *   teams: Array,
 *   isCupMatch: boolean,
 *   cupMatchRoundName: string,
 *   currentJornada: number,
 *   isPlayingMatch: boolean,
 *   tactic: object,
 *   onUpdateTactic: function,
 *   annotatedSquad: Array,
 *   subbedOut: Array,
 *   confirmedSubs: Array,
 *   subsMade: number,
 *   swapSource: any,
 *   swapTarget: any,
 *   onSelectOut: function,
 *   onSelectIn: function,
 *   onConfirmSub: function,
 *   onResetSub: function,
 *   onResetAllSubs: function,
 *   onReady: function,
 *   isReady: boolean,
 *   cupPreMatch: boolean,
 *   myTeamInCup: boolean,
 *   redCardedHalftimeIds: Set,
 *   matchAction: object|null,
 *   injuryCountdown: number|null,
 *   onResolveAction: function,
 * }} props
 */
export function MatchPanel({
  mode,
  onClose,
  fixture,
  liveMinute,
  teams,
  isCupMatch,
  cupMatchRoundName,
  currentJornada,
  isPlayingMatch,
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
  onReady,
  isReady,
  cupPreMatch,
  myTeamInCup,
  myTeamId,
  redCardedHalftimeIds,
  matchAction,
  injuryCountdown,
  onResolveAction,
}) {
  const getDefaultTab = (m) =>
    m === "halftime" ? "subs" : m === "action" ? "action" : "lineup";

  const [activeTab, setActiveTab] = useState(() => getDefaultTab(mode));

  const isOpen = !!mode;

  const hInfo = fixture ? teams.find((t) => t.id === fixture.homeTeamId) : null;
  const aInfo = fixture ? teams.find((t) => t.id === fixture.awayTeamId) : null;
  const evts = fixture?.events || [];
  const visibleEvts = evts.filter((e) => e.minute <= liveMinute);

  const homeGoals = visibleEvts.filter(
    (e) =>
      (e.type === "goal" || e.type === "penalty_goal") && e.team === "home",
  ).length;
  const awayGoals = visibleEvts.filter(
    (e) =>
      (e.type === "goal" || e.type === "penalty_goal") && e.team === "away",
  ).length;

  const displayHomeGoals =
    fixture?.finalHomeGoals ?? matchAction?.currentScore?.home ?? homeGoals;
  const displayAwayGoals =
    fixture?.finalAwayGoals ?? matchAction?.currentScore?.away ?? awayGoals;

  const tabs =
    mode === "halftime"
      ? [
          { id: "subs", label: "Substituições" },
          { id: "adversario", label: "Adversário" },
          { id: "jogo", label: "Jogo" },
        ]
      : mode === "action"
        ? [
            {
              id: "action",
              label:
                matchAction?.type === "injury"
                  ? "Lesão"
                  : matchAction?.type === "penalty"
                    ? "Penálti"
                    : "Substituição",
            },
            { id: "jogo", label: "Jogo" },
          ]
        : [
            { id: "lineup", label: "Escalações" },
            { id: "jogo", label: "Jogo" },
          ];

  // Derived tab: falls back to mode's default if current tab not valid (e.g. mode changed)
  const validTabIds = tabs.map((t) => t.id);
  const effectiveTab = validTabIds.includes(activeTab)
    ? activeTab
    : getDefaultTab(mode);

  const modeBadgeLabel =
    mode === "halftime"
      ? cupPreMatch
        ? "Pré-Jogo"
        : liveMinute >= 90
          ? "Antes do Extra · Taça"
          : isCupMatch
            ? "Intervalo · Taça"
            : "Intervalo"
      : mode === "action"
        ? "URGENTE"
        : null;

  const competitionLabel = isCupMatch
    ? `🏆 ${cupMatchRoundName}`
    : `Jornada ${currentJornada}`;

  const isCupContext = isCupMatch || cupPreMatch;
  const canContinue = !isCupContext || myTeamInCup;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="matchpanel-backdrop"
          className="fixed inset-0 z-120 bg-zinc-950/90 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={mode === "detail" ? onClose : undefined}
        >
          <motion.div
            className="w-full sm:max-w-lg bg-surface-container border border-outline-variant/30 rounded-t-2xl sm:rounded-lg shadow-2xl flex flex-col max-h-[92vh]"
            initial={{ y: 40, opacity: 0.8 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: "spring", stiffness: 340, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* ── Header ── */}
            <div className="shrink-0 flex items-center gap-2 px-3 py-2.5 bg-zinc-950 border-b border-zinc-800 rounded-t-2xl sm:rounded-t-lg">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                {isPlayingMatch && mode === "detail" && (
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
                )}
                <span className="text-amber-500 font-black text-sm tabular-nums shrink-0">
                  {mode === "action" && matchAction
                    ? `${matchAction.minute ?? liveMinute}'`
                    : `${liveMinute}'`}
                </span>
                {modeBadgeLabel ? (
                  <span
                    className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full shrink-0 ${
                      mode === "action"
                        ? "bg-red-900/60 text-red-400 animate-pulse"
                        : "bg-zinc-800 text-zinc-400"
                    }`}
                  >
                    {modeBadgeLabel}
                  </span>
                ) : (
                  <span className="text-amber-500 font-black text-xs uppercase tracking-widest shrink-0">
                    {competitionLabel}
                  </span>
                )}
              </div>

              {mode === "halftime" && (
                <div className="flex items-center gap-1.5 shrink-0">
                  {Array.from({ length: MAX_MATCH_SUBS }).map((_, i) => (
                    <span
                      key={i}
                      className={`w-2 h-2 rounded-full transition-colors ${i < subsMade ? "bg-primary" : "bg-zinc-700"}`}
                    />
                  ))}
                  <span className="ml-1 text-[10px] font-bold text-zinc-500 tabular-nums">
                    {MAX_MATCH_SUBS - subsMade}/{MAX_MATCH_SUBS}
                  </span>
                </div>
              )}
              {mode === "action" && injuryCountdown !== null && (
                <span className="shrink-0 text-amber-400 font-black text-sm tabular-nums">
                  {injuryCountdown}s ⏱
                </span>
              )}
              {mode === "detail" && (
                <button
                  onClick={onClose}
                  className="shrink-0 text-zinc-500 hover:text-white transition-colors text-sm font-black px-2 py-1"
                  aria-label="Fechar"
                >
                  ✕
                </button>
              )}
            </div>

            {/* ── Score banner ── */}
            {(fixture || matchAction) && (
              <div className="shrink-0 flex items-stretch border-b border-zinc-800">
                <div
                  className="flex-1 text-center py-2 px-3 font-black text-xs uppercase truncate"
                  style={{
                    backgroundColor: hInfo?.color_primary || "#18181b",
                    color: hInfo?.color_secondary || "#fff",
                  }}
                >
                  {hInfo?.name || "Casa"}
                </div>
                <div className="flex items-center justify-center gap-2 px-5 bg-zinc-950 text-white font-black text-xl tracking-widest">
                  <span>{displayHomeGoals}</span>
                  <span className="text-zinc-600 text-base">—</span>
                  <span>{displayAwayGoals}</span>
                </div>
                <div
                  className="flex-1 text-center py-2 px-3 font-black text-xs uppercase truncate"
                  style={{
                    backgroundColor: aInfo?.color_primary || "#18181b",
                    color: aInfo?.color_secondary || "#fff",
                  }}
                >
                  {aInfo?.name || "Fora"}
                </div>
              </div>
            )}

            {/* ── Tab bar ── */}
            <div className="shrink-0 flex border-b border-zinc-800 bg-zinc-950/50">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 py-2 text-[10px] font-black uppercase tracking-widest transition-colors ${
                    effectiveTab === tab.id
                      ? "text-amber-500 border-b-2 border-amber-500"
                      : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* ── Tab content ── */}
            <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
              {effectiveTab === "jogo" && (
                <TabJogo
                  fixture={fixture}
                  liveMinute={liveMinute}
                  teams={teams}
                />
              )}
              {effectiveTab === "subs" && mode === "halftime" && (
                <TabSubs
                  tactic={tactic}
                  onUpdateTactic={onUpdateTactic}
                  annotatedSquad={annotatedSquad}
                  subbedOut={subbedOut}
                  confirmedSubs={confirmedSubs}
                  subsMade={subsMade}
                  swapSource={swapSource}
                  swapTarget={swapTarget}
                  onSelectOut={onSelectOut}
                  onSelectIn={onSelectIn}
                  onConfirmSub={onConfirmSub}
                  onResetSub={onResetSub}
                  onResetAllSubs={onResetAllSubs}
                  redCardedHalftimeIds={redCardedHalftimeIds}
                />
              )}
              {effectiveTab === "adversario" && mode === "halftime" && (
                <TabAdversario
                  fixture={fixture}
                  myTeamId={myTeamId}
                  teams={teams}
                />
              )}
              {effectiveTab === "lineup" && mode === "detail" && (
                <TabLineup
                  fixture={fixture}
                  liveMinute={liveMinute}
                  teams={teams}
                />
              )}
              {effectiveTab === "action" && mode === "action" && (
                <TabAction
                  matchAction={matchAction}
                  injuryCountdown={injuryCountdown}
                  swapSource={swapSource}
                  swapTarget={swapTarget}
                  onSelectOut={onSelectOut}
                  onSelectIn={onSelectIn}
                  onResolveAction={onResolveAction}
                />
              )}
            </div>

            {/* ── Footer ── */}
            {mode === "halftime" && (
              <>
                <button
                  onClick={canContinue ? onReady : undefined}
                  disabled={!canContinue || isReady}
                  className={`shrink-0 w-full py-3.5 text-sm font-black uppercase tracking-widest transition-all ${
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
                    ? "⏳ A AGUARDAR JOGO DA TAÇA..."
                    : isReady
                      ? "⏳ A AGUARDAR..."
                      : cupPreMatch
                        ? "▶ INICIAR JOGO — TAÇA"
                        : isCupMatch
                          ? "▶ 2ª PARTE — TAÇA"
                          : "▶ INICIAR 2ª PARTE"}
                </button>
              </>
            )}
            {mode === "action" && (
              <div className="shrink-0 flex gap-3 px-4 pb-4 pt-2">
                {matchAction?.type === "user_substitution" ? (
                  <>
                    <button
                      onClick={() => onResolveAction(null)}
                      className="flex-1 py-3.5 rounded-sm text-sm font-black uppercase tracking-widest transition-all border border-outline-variant/40 hover:bg-surface-bright text-zinc-300"
                    >
                      Cancelar
                    </button>
                    <button
                      disabled={!swapSource || !swapTarget}
                      onClick={() =>
                        onResolveAction({
                          playerOut: swapSource.id,
                          playerIn: swapTarget.id,
                        })
                      }
                      className="flex-1 py-3.5 rounded-sm text-sm font-black uppercase tracking-widest transition-all bg-primary hover:brightness-110 text-on-primary disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Confirmar
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => onResolveAction(null)}
                    className="flex-1 py-3.5 rounded-sm text-sm font-black uppercase tracking-widest transition-all bg-primary hover:brightness-110 text-on-primary"
                  >
                    Escolha automática
                  </button>
                )}
              </div>
            )}
            {mode === "detail" && (
              <div className="shrink-0 px-4 py-3 border-t border-zinc-800">
                <button
                  onClick={onClose}
                  className="w-full py-2.5 rounded-xl text-sm font-black uppercase tracking-widest bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors"
                >
                  ◀ Voltar à partida
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
