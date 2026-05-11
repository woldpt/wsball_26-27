import { useState } from "react";
import { TabJogo, TabLineup, TabAdversario, TabIntervencao } from "./MatchTabs.jsx";

export function MatchPage({
  mode,
  onClose,
  fixture,
  liveMinute,
  teams,
  isCupMatch,
  cupMatchRoundName,
  _currentJornada,
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
  injuredHalftimeIds,
  matchAction,
  injuryCountdown,
  onResolveAction,
}) {
  const getDefaultTab = (m) =>
    m === "action" || m === "halftime" ? "intervencao" : "jogo";
  const [activeTab, setActiveTab] = useState(() => getDefaultTab(mode));
  // Padrão React: setState durante o render quando a prop muda — evita o
  // cascading render do useEffect.
  const [prevMode, setPrevMode] = useState(mode);
  if (mode !== prevMode) {
    setPrevMode(mode);
    setActiveTab(getDefaultTab(mode));
  }

  const tabs = mode === "halftime"
    ? [
        { key: "jogo", label: "Jogo" },
        { key: "adversario", label: "Adversário" },
        { key: "intervencao", label: "Intervenção" },
      ]
    : [
        { key: "jogo", label: "Jogo" },
        { key: "lineup", label: "Lineup" },
        { key: "adversario", label: "Adversário" },
        { key: "intervencao", label: "Intervenção" },
      ];

  const isCupContext = isCupMatch || cupPreMatch;
  const canContinue = !isCupContext || myTeamInCup;

  if (!fixture && mode !== "action" && mode !== "halftime") {
    return (
      <div className="fixed inset-y-0 lg:left-64 z-120 flex flex-col bg-[#0d0d14]">
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm font-bold text-zinc-500">
            Sem dados do jogo disponíveis
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-y-0 lg:left-64 z-120 flex flex-col bg-[#0d0d14]">
      {/* Header */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-3 border-b border-zinc-800 bg-zinc-950/80">
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white flex items-center justify-center transition-colors"
        >
          ←
        </button>
        <div className="flex-1 flex items-center gap-2">
          <span className="text-sm font-black text-white truncate">
            {fixture?.homeTeamId === myTeamId
              ? teams.find((t) => t.id === fixture?.homeTeamId)?.name || "Casa"
              : teams.find((t) => t.id === fixture?.awayTeamId)?.name || "Fora"}
            {" vs "}
            {fixture?.awayTeamId === myTeamId
              ? teams.find((t) => t.id === fixture?.awayTeamId)?.name || "Fora"
              : teams.find((t) => t.id === fixture?.homeTeamId)?.name || "Casa"}
          </span>
          {isCupMatch && (
            <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-amber-500/20 text-amber-400">
              {cupMatchRoundName || "Taça"}
            </span>
          )}
        </div>
        {isPlayingMatch && (
          <span className="text-[10px] font-black text-primary animate-pulse">
            {liveMinute}'
          </span>
        )}
      </div>

      {/* Tab navigation */}
      <div className="shrink-0 flex border-b border-zinc-800 bg-zinc-950/60">
        {tabs.map((tab) => {
          const disabled = tab.key === "intervencao" && mode !== "action" && mode !== "halftime";
          return (
            <button
              key={tab.key}
              onClick={() => !disabled && setActiveTab(tab.key)}
              disabled={disabled}
              className={`flex-1 py-2 text-[10px] font-black uppercase tracking-widest transition-colors border-b-2 ${
                activeTab === tab.key
                  ? "text-white border-primary bg-primary/5"
                  : disabled
                    ? "text-zinc-700 cursor-not-allowed border-transparent"
                    : "text-zinc-500 hover:text-zinc-300 border-transparent"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {activeTab === "jogo" && (
          <TabJogo fixture={fixture} liveMinute={liveMinute} teams={teams} />
        )}
        {activeTab === "lineup" && (
          mode === "detail"
            ? <TabAdversario fixture={fixture} myTeamId={fixture?.homeTeamId} teams={teams} />
            : <TabLineup fixture={fixture} liveMinute={liveMinute} teams={teams} />
        )}
        {activeTab === "adversario" && (
          mode === "detail"
            ? <TabAdversario fixture={fixture} myTeamId={fixture?.awayTeamId} teams={teams} />
            : <TabAdversario fixture={fixture} myTeamId={myTeamId} teams={teams} />
        )}
        {activeTab === "intervencao" && mode !== "detail" && (
          <TabIntervencao
            mode={mode}
            matchAction={matchAction}
            injuryCountdown={injuryCountdown}
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
            injuredHalftimeIds={injuredHalftimeIds}
            onResolveAction={onResolveAction}
          />
        )}
        {activeTab === "intervencao" && mode === "detail" && (
          <div className="flex-1 flex items-center justify-center text-zinc-600 text-sm font-bold">
            Sem intervenção disponível neste modo
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      {mode === "halftime" && (
        <button
          onClick={canContinue ? onReady : undefined}
          disabled={!canContinue || isReady}
          className={`shrink-0 w-full py-3.5 text-sm font-black uppercase tracking-widest transition-all border-t border-zinc-800 ${
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
              ? "⏳ A AGUARDAR OUTRO TREINADOR..."
              : cupPreMatch
                ? "▶ INICIAR JOGO — TAÇA"
                : isCupMatch
                  ? "▶ 2ª PARTE — TAÇA"
                  : "▶ INICIAR 2ª PARTE"}
        </button>
      )}
      {mode === "action" && matchAction?.type === "user_substitution" && (
        <button
          onClick={() => onResolveAction(null)}
          className="shrink-0 w-full py-3.5 text-sm font-black uppercase tracking-widest bg-primary hover:brightness-110 text-on-primary transition-all border-t border-zinc-800"
        >
          ▶ CONTINUAR
        </button>
      )}
      {mode === "detail" && (
        <button
          onClick={onClose}
          className="shrink-0 w-full py-3 text-sm font-black uppercase tracking-widest bg-zinc-900 hover:bg-zinc-800 text-zinc-300 transition-all border-t border-zinc-800"
        >
          Fechar
        </button>
      )}
    </div>
  );
}
