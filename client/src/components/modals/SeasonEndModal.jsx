import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

const DIVISION_NAMES = {
  1: "Primeira Liga",
  2: "Segunda Liga",
  3: "Liga 3",
  4: "Campeonato de Portugal",
  5: "Distritais",
};

function fmt(value) {
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

function TeamBadge({ teamId, teamName, teams }) {
  const team = teams?.find((t) => t.id === teamId || t.id === Number(teamId));
  return (
    <div
      className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black shrink-0"
      style={{
        background: team?.color_primary || "#27272a",
        color: team?.color_secondary || "#fff",
      }}
    >
      {teamName?.[0] || "?"}
    </div>
  );
}

/**
 * @param {{ data: object|null, teams: array, me: object, onClose: function }} props
 */
export function SeasonEndModal({ data, teams, me, onClose }) {
  // Identidade do `data` para o qual o reveal já disparou — evita o reset
  // síncrono dentro do useEffect (cascading render). Quando `data` muda,
  // revealedFor ainda aponta para o valor anterior → revealed fica false.
  const [revealedFor, setRevealedFor] = useState(null);

  useEffect(() => {
    if (!data) return;
    const t = setTimeout(() => setRevealedFor(data), 250);
    return () => clearTimeout(t);
  }, [data]);

  const revealed = revealedFor === data;

  const myTeamId = me?.teamId;

  const isMyTeam = (teamId) =>
    teamId === myTeamId ||
    teamId === Number(myTeamId) ||
    String(teamId) === String(myTeamId);

  const myPromotion = data?.promotions?.find((p) => isMyTeam(p.teamId));
  const isPromotion = myPromotion && myPromotion.toDiv < myPromotion.fromDiv;

  // Ocultar apenas movimentos dentro da Div 5 (NPC internos);
  // mostrar descidas do Campeonato de Portugal (Div 4 → 5) e tudo o resto.
  const visiblePromotions = (data?.promotions || []).filter(
    (p) => p.toDiv !== 5 || p.fromDiv === 4,
  );

  const displayYear = data?.year ?? 0;
  const handleContinue = () => {
    onClose();
    window.location.reload();
  };

  return (
    <AnimatePresence>
      {data && (
        <motion.div
          key="season-end-backdrop"
          className="fixed inset-0 z-200 bg-zinc-950/97 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <motion.div
            className="w-full max-w-lg my-8"
            initial={{ scale: 0.92, y: 32 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.92, y: 32 }}
            transition={{ type: "spring", stiffness: 320, damping: 26 }}
          >
            {/* ── Header ─────────────────────────────────────────────────── */}
            <div className="text-center mb-6">
              <motion.span
                className="material-symbols-outlined text-amber-400 block mb-3"
                style={{
                  fontSize: 56,
                  filter: "drop-shadow(0 0 18px rgba(245,158,11,0.65))",
                }}
                initial={{ scale: 0.4, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.15, type: "spring", stiffness: 280 }}
              >
                emoji_events
              </motion.span>
              <motion.p
                className="text-amber-400/70 text-[10px] font-black uppercase tracking-[0.3em] mb-1"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.25 }}
              >
                Temporada {displayYear}
              </motion.p>
              <motion.h1
                className="text-3xl font-headline font-black text-on-surface"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
              >
                Fim de Época
              </motion.h1>
              <motion.p
                className="text-on-surface-variant/45 text-sm mt-1"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.35 }}
              >
                Prémios e galardões entregues
              </motion.p>
            </div>

            {/* ── Awards card ─────────────────────────────────────────────── */}
            <div className="bg-surface-container rounded-2xl border border-outline-variant/20 overflow-hidden divide-y divide-outline-variant/15">
              {/* Division Champions */}
              {data.divisionChampions?.length > 0 && (
                <div className="p-4 space-y-2">
                  <p className="text-[9px] font-black uppercase tracking-widest text-on-surface-variant/40 mb-3">
                    Campeões das Divisões
                  </p>
                  {data.divisionChampions.map((champ, i) => (
                    <motion.div
                      key={champ.divId}
                      className={`flex items-center gap-3 rounded-lg px-3 py-2.5 ${
                        isMyTeam(champ.teamId)
                          ? "bg-amber-500/10 border border-amber-500/30"
                          : "bg-surface-container-high"
                      }`}
                      initial={{ opacity: 0, x: -16 }}
                      animate={{
                        opacity: revealed ? 1 : 0,
                        x: revealed ? 0 : -16,
                      }}
                      transition={{ delay: 0.1 + i * 0.07 }}
                    >
                      <span
                        className="material-symbols-outlined text-amber-400 shrink-0"
                        style={{ fontSize: 20 }}
                      >
                        {champ.divId === 1
                          ? "workspace_premium"
                          : "military_tech"}
                      </span>
                      <TeamBadge
                        teamId={champ.teamId}
                        teamName={champ.teamName}
                        teams={teams}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-black text-sm text-on-surface truncate">
                          {champ.teamName}
                        </p>
                        <p className="text-[10px] text-on-surface-variant/50 font-bold">
                          {champ.divName}
                        </p>
                      </div>
                      <span className="text-[11px] font-black text-amber-400 shrink-0">
                        +{fmt(champ.prize)}
                      </span>
                    </motion.div>
                  ))}
                </div>
              )}

              {/* Cup Winner */}
              {data.cupWinner && (
                <div className="p-4">
                  <p className="text-[9px] font-black uppercase tracking-widest text-on-surface-variant/40 mb-3">
                    Taça de Portugal
                  </p>
                  <motion.div
                    className={`flex items-center gap-3 rounded-lg px-3 py-2.5 ${
                      isMyTeam(data.cupWinner.teamId)
                        ? "bg-amber-500/10 border border-amber-500/30"
                        : "bg-surface-container-high"
                    }`}
                    initial={{ opacity: 0, x: -16 }}
                    animate={{
                      opacity: revealed ? 1 : 0,
                      x: revealed ? 0 : -16,
                    }}
                    transition={{ delay: 0.42 }}
                  >
                    <span
                      className="material-symbols-outlined text-amber-400 shrink-0"
                      style={{ fontSize: 20 }}
                    >
                      emoji_events
                    </span>
                    <TeamBadge
                      teamId={data.cupWinner.teamId}
                      teamName={data.cupWinner.teamName}
                      teams={teams}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-sm text-on-surface truncate">
                        {data.cupWinner.teamName}
                      </p>
                      <p className="text-[10px] text-on-surface-variant/50 font-bold">
                        Vencedor da Taça
                      </p>
                    </div>
                    <span className="text-[11px] font-black text-amber-400 shrink-0">
                      +{fmt(data.cupWinner.prize)}
                    </span>
                  </motion.div>
                </div>
              )}

              {/* Top Scorer */}
              {data.topScorer && (
                <div className="p-4">
                  <p className="text-[9px] font-black uppercase tracking-widest text-on-surface-variant/40 mb-3">
                    Melhor Marcador
                  </p>
                  <motion.div
                    className={`flex items-center gap-3 rounded-lg px-3 py-2.5 ${
                      isMyTeam(data.topScorer.teamId)
                        ? "bg-emerald-500/10 border border-emerald-500/30"
                        : "bg-surface-container-high"
                    }`}
                    initial={{ opacity: 0, x: -16 }}
                    animate={{
                      opacity: revealed ? 1 : 0,
                      x: revealed ? 0 : -16,
                    }}
                    transition={{ delay: 0.52 }}
                  >
                    <span
                      className="material-symbols-outlined text-emerald-400 shrink-0"
                      style={{ fontSize: 20 }}
                    >
                      sports_soccer
                    </span>
                    <TeamBadge
                      teamId={data.topScorer.teamId}
                      teamName={data.topScorer.teamName}
                      teams={teams}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-sm text-on-surface truncate">
                        {data.topScorer.name}
                      </p>
                      <p className="text-[10px] text-on-surface-variant/50 font-bold">
                        {data.topScorer.teamName} · {data.topScorer.goals} golos
                      </p>
                    </div>
                    <span className="text-[11px] font-black text-emerald-400 shrink-0">
                      +{fmt(data.topScorer.prize)}
                    </span>
                  </motion.div>
                </div>
              )}

              {/* Promotions / Relegations */}
              {visiblePromotions.length > 0 && (
                <div className="p-4">
                  <p className="text-[9px] font-black uppercase tracking-widest text-on-surface-variant/40 mb-3">
                    Subidas e Descidas
                  </p>
                  <div className="space-y-1.5">
                    {visiblePromotions.map((p, i) => {
                      const goingUp = p.toDiv < p.fromDiv;
                      const isMe = isMyTeam(p.teamId);
                      const team = teams?.find(
                        (t) => t.id === p.teamId || t.id === Number(p.teamId),
                      );
                      return (
                        <motion.div
                          key={i}
                          className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg ${
                            isMe
                              ? goingUp
                                ? "bg-emerald-500/10 border border-emerald-500/25 text-emerald-400"
                                : "bg-rose-500/10 border border-rose-500/25 text-rose-400"
                              : goingUp
                                ? "bg-surface-container-high text-emerald-400/70"
                                : "bg-surface-container-high text-rose-400/60"
                          }`}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: revealed ? 1 : 0 }}
                          transition={{ delay: 0.6 + i * 0.04 }}
                        >
                          <span
                            className="material-symbols-outlined shrink-0"
                            style={{ fontSize: 14 }}
                          >
                            {goingUp ? "arrow_upward" : "arrow_downward"}
                          </span>
                          <div
                            className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black shrink-0"
                            style={{
                              background: team?.color_primary || "#27272a",
                              color: team?.color_secondary || "#fff",
                            }}
                          >
                            {p.teamName?.[0] || "?"}
                          </div>
                          <span className="font-bold flex-1 truncate">
                            {p.teamName}
                          </span>
                          <span className="text-[9px] shrink-0 opacity-60">
                            {DIVISION_NAMES[p.fromDiv] || `Div. ${p.fromDiv}`}
                            {" → "}
                            {DIVISION_NAMES[p.toDiv] || `Div. ${p.toDiv}`}
                          </span>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* ── My team movement highlight ──────────────────────────────── */}
            {myPromotion && (
              <motion.div
                className={`mt-3 rounded-xl px-4 py-3 text-center border ${
                  isPromotion
                    ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-300"
                    : "bg-rose-500/10 border-rose-500/40 text-rose-300"
                }`}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{
                  opacity: revealed ? 1 : 0,
                  scale: revealed ? 1 : 0.95,
                }}
                transition={{ delay: 0.75 }}
              >
                <p className="font-black text-sm">
                  {isPromotion
                    ? "🎉 O teu clube sobe de divisão!"
                    : "😔 O teu clube desce de divisão."}
                </p>
                <p className="text-[10px] opacity-60 mt-0.5">
                  {DIVISION_NAMES[myPromotion.toDiv] ||
                    `Divisão ${myPromotion.toDiv}`}{" "}
                  na próxima época
                </p>
              </motion.div>
            )}

            {/* ── Continue button ─────────────────────────────────────────── */}
            <motion.button
              onClick={handleContinue}
              className="mt-4 w-full bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-black font-black text-sm py-4 rounded-xl transition-colors shadow-lg shadow-amber-500/25 uppercase tracking-widest"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: revealed ? 1 : 0, y: revealed ? 0 : 16 }}
              transition={{ delay: 0.85 }}
            >
              Continuar para a Época {(data?.year ?? 0) + 1}
            </motion.button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
