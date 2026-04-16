import { getEffectiveLineup } from "../../utils/playerHelpers.js";
import {
  POSITION_TEXT_CLASS,
  POSITION_SHORT_LABELS,
} from "../../constants/index.js";
import { PlayerLink } from "../shared/PlayerLink.jsx";
// eslint-disable-next-line no-unused-vars
import { motion, AnimatePresence } from "framer-motion";

/**
 * @param {{
 *   showMatchDetail: boolean,
 *   matchDetailFixture: object|null,
 *   me: object|null,
 *   teams: Array,
 *   liveMinute: number,
 *   isPlayingMatch: boolean,
 *   isCupMatch: boolean,
 *   cupMatchRoundName: string,
 *   currentJornada: number,
 *   setShowMatchDetail: function
 * }} props
 */
export function MatchDetailModal({
  showMatchDetail,
  matchDetailFixture,
  teams,
  liveMinute,
  isPlayingMatch,
  isCupMatch,
  cupMatchRoundName,
  currentJornada,
  setShowMatchDetail,
}) {
  const fx = matchDetailFixture;
  const hInfo = teams.find((t) => t.id === fx?.homeTeamId);
  const aInfo = teams.find((t) => t.id === fx?.awayTeamId);
  const evts = fx?.events || [];
  const visibleEvts = evts.filter((e) => e.minute <= liveMinute);
  const homeGoals = visibleEvts.filter(
    (e) =>
      (e.type === "goal" || e.type === "penalty_goal") && e.team === "home",
  ).length;
  const awayGoals = visibleEvts.filter(
    (e) =>
      (e.type === "goal" || e.type === "penalty_goal") && e.team === "away",
  ).length;

  const homeLineup = getEffectiveLineup(
    fx?.homeLineup || [],
    evts,
    liveMinute,
    "home",
  );
  const awayLineup = getEffectiveLineup(
    fx?.awayLineup || [],
    evts,
    liveMinute,
    "away",
  );

  const ref = fx?.referee;
  const refBalance = ref?.balance ?? 50;

  const posOrder = { GR: 0, DEF: 1, MED: 2, ATA: 3 };
  const sortLineup = (arr) =>
    [...arr].sort(
      (a, b) => (posOrder[a.position] ?? 9) - (posOrder[b.position] ?? 9),
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

  return (
    <AnimatePresence>
      {showMatchDetail && matchDetailFixture && (
        <motion.div
          key="matchdetail-backdrop"
          className="fixed inset-0 z-120 bg-zinc-950/90 backdrop-blur-sm flex items-center justify-center p-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={() => setShowMatchDetail(false)}
        >
          <motion.div
            className="w-full max-w-lg bg-surface-container border border-outline-variant/30 rounded-lg shadow-2xl flex flex-col overflow-hidden max-h-[92vh]"
            initial={{ scale: 0.93, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.93, y: 20 }}
            transition={{ type: "spring", stiffness: 340, damping: 28 }}
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
              {fx?.attendance ? (
                <span className="text-zinc-400 text-[11px] font-bold">
                  🏟 {fx?.attendance.toLocaleString("pt-PT")} adeptos
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
                        "yellow",
                        "red",
                        "injury",
                        "substitution",
                      ].includes(e.type),
                    )
                    .map((e, i) => {
                      const isHome = e.team === "home";
                      const evtTeamInfo = isHome ? hInfo : aInfo;
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
                              color: evtTeamInfo?.color_primary || "#d4d4d8",
                            }}
                          >
                            <PlayerLink playerId={e.playerId}>
                              {e.playerName || e.player_name || ""}
                            </PlayerLink>
                          </span>
                          <span
                            className="text-[9px] font-black uppercase tracking-widest shrink-0"
                            style={{
                              color: evtTeamInfo?.color_primary || "#71717a",
                            }}
                          >
                            {evtTeamInfo?.name || ""}
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
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
