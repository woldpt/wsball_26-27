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
  _onReady,
  _isReady,
  _cupPreMatch,
  _myTeamInCup,
  myTeamId,
  redCardedHalftimeIds,
  injuredHalftimeIds,
  matchAction,
  injuryCountdown,
  onResolveAction,
}) {
  const [activeTab, setActiveTab] = useState(mode === "action" ? "intervencao" : "jogo");

React.useEffect(() => {
  if (mode === "action" || mode === "halftime") {
    setActiveTab("intervencao");
  }
}, [mode]);

  const tabs = [
    { key: "jogo", label: "Jogo" },
    { key: "lineup", label: "Lineup" },
    { key: "adversario", label: "Adversário" },
    { key: "intervencao", label: "Intervenção" },
  ];

  return (
    <div className="fixed inset-0 z-120 flex flex-col bg-[#0d0d14]">
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
              ? teams.find((t) => t.id === fixture.homeTeamId)?.name || "Casa"
              : teams.find((t) => t.id === fixture.awayTeamId)?.name || "Fora"}
            {" vs "}
            {fixture?.awayTeamId === myTeamId
              ? teams.find((t) => t.id === fixture.awayTeamId)?.name || "Fora"
              : teams.find((t) => t.id === fixture.homeTeamId)?.name || "Casa"}
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
          <TabLineup fixture={fixture} liveMinute={liveMinute} teams={teams} />
        )}
        {activeTab === "adversario" && (
          <TabAdversario fixture={fixture} myTeamId={myTeamId} teams={teams} />
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
    </div>
  );
}
