export function CupTab({
  cupRoundResults,
  cupDraw,
  me,
  teams,
  cupResultsFilter,
  setCupResultsFilter,
}) {
  return (
    <div className="space-y-6">
      {!cupRoundResults && !cupDraw && (
        <div className="bg-surface-container rounded-lg p-10 text-center">
          <p className="text-4xl mb-3">🏆</p>
          <p className="text-zinc-500 font-bold">
            Sem dados de Taça disponíveis neste momento.
          </p>
        </div>
      )}

      {cupRoundResults &&
        (() => {
          const allResults = cupRoundResults.results || [];
          const myResults = allResults.filter(
            (r) =>
              r.homeTeamId === me.teamId || r.awayTeamId === me.teamId,
          );
          const shown =
            cupResultsFilter === "mine" ? myResults : allResults;
          return (
            <div>
              <div className="flex items-start justify-between mb-5">
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="px-2 py-0.5 bg-primary/20 border border-primary/30 rounded text-primary text-[10px] font-black uppercase tracking-widest">
                      Taça de Portugal
                    </span>
                    <span className="text-zinc-500 text-xs font-semibold">
                      {cupRoundResults.roundName}
                    </span>
                  </div>
                  <h2 className="text-2xl font-black text-white uppercase tracking-tight">
                    Resultados
                  </h2>
                </div>
                {myResults.length > 0 && (
                  <div className="flex rounded-lg border border-outline-variant/20 overflow-hidden text-xs font-black shrink-0">
                    <button
                      onClick={() => setCupResultsFilter("all")}
                      className={`px-3 py-1.5 transition-colors ${cupResultsFilter === "all" ? "bg-primary text-on-primary" : "bg-surface text-zinc-400 hover:bg-surface-container"}`}
                    >
                      Todos
                    </button>
                    <button
                      onClick={() => setCupResultsFilter("mine")}
                      className={`px-3 py-1.5 transition-colors ${cupResultsFilter === "mine" ? "bg-primary text-on-primary" : "bg-surface text-zinc-400 hover:bg-surface-container"}`}
                    >
                      O meu jogo
                    </button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {shown.map((r, idx) => {
                  const hInfo =
                    r.homeTeam || teams.find((t) => t.id === r.homeTeamId);
                  const aInfo =
                    r.awayTeam || teams.find((t) => t.id === r.awayTeamId);
                  const isWinnerHome = r.winnerId === r.homeTeamId;
                  const isMyMatch =
                    r.homeTeamId === me.teamId ||
                    r.awayTeamId === me.teamId;
                  const finalLabel = r.decidedByPenalties
                    ? "Final (Grandes Pénaltis)"
                    : r.wentToET
                      ? "Final (Prolongamento)"
                      : "Final";
                  return (
                    <div
                      key={idx}
                      className={`rounded-xl border overflow-hidden ${isMyMatch ? "border-primary/40" : "border-white/8"}`}
                    >
                      <div
                        className={`flex items-center justify-between px-4 py-2 ${isMyMatch ? "bg-primary/10" : "bg-white/3"}`}
                      >
                        <span className="text-zinc-500 text-[10px] font-bold uppercase tracking-wider">
                          {cupRoundResults.roundName}
                        </span>
                        <span
                          className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded ${cupRoundResults.isFinal ? "bg-amber-500/20 text-amber-400" : "bg-white/8 text-zinc-300"}`}
                        >
                          {finalLabel}
                        </span>
                      </div>

                      <div className="px-4 py-5">
                        <div className="flex items-center gap-3">
                          <div className="flex-1 flex flex-col items-end gap-1.5">
                            <div
                              className="w-12 h-12 rounded-full flex items-center justify-center font-black text-lg border border-white/10"
                              style={{
                                background: hInfo?.color_primary || "#333",
                                color: hInfo?.color_secondary || "#fff",
                              }}
                            >
                              {hInfo?.name?.[0] ?? "?"}
                            </div>
                            <span
                              className="font-black text-sm text-right truncate max-w-25"
                              style={{ color: hInfo?.color_primary || "#fff" }}
                            >
                              {hInfo?.name || r.homeTeamId}
                            </span>
                          </div>

                          <div className="flex flex-col items-center shrink-0 gap-1">
                            <span className="text-3xl font-black text-white tabular-nums tracking-tight">
                              {r.homeGoals}{" "}
                              <span className="text-zinc-600">–</span>{" "}
                              {r.awayGoals}
                            </span>
                            {r.decidedByPenalties && (
                              <span className="text-[10px] text-amber-400 font-bold">
                                ({r.penaltyHomeGoals}–{r.penaltyAwayGoals} g.p.)
                              </span>
                            )}
                            {r.winnerId && (
                              <span className="text-[9px] font-black uppercase tracking-widest text-primary bg-primary/15 px-2 py-0.5 rounded mt-0.5">
                                {cupRoundResults.isFinal
                                  ? "🏆 Campeão"
                                  : isWinnerHome
                                    ? `✓ ${hInfo?.name?.split(" ")[0] || "Casa"}`
                                    : `✓ ${aInfo?.name?.split(" ")[0] || "Fora"}`}
                              </span>
                            )}
                          </div>

                          <div className="flex-1 flex flex-col items-start gap-1.5">
                            <div
                              className="w-12 h-12 rounded-full flex items-center justify-center font-black text-lg border border-white/10"
                              style={{
                                background: aInfo?.color_primary || "#333",
                                color: aInfo?.color_secondary || "#fff",
                              }}
                            >
                              {aInfo?.name?.[0] ?? "?"}
                            </div>
                            <span
                              className="font-black text-sm text-left truncate max-w-25"
                              style={{ color: aInfo?.color_primary || "#fff" }}
                            >
                              {aInfo?.name || r.awayTeamId}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

      {cupDraw &&
        !cupRoundResults &&
        (() => {
          return (
            <div>
              <div className="mb-5">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="px-2 py-0.5 bg-primary/20 border border-primary/30 rounded text-primary text-[10px] font-black uppercase tracking-widest">
                    Taça de Portugal · {cupDraw.season}
                  </span>
                </div>
                <h2 className="text-2xl font-black text-white uppercase tracking-tight">
                  Sorteio — {cupDraw.roundName}
                </h2>
              </div>
              <div className="space-y-3">
                {(cupDraw.fixtures || []).map((fixture, idx) => {
                  const hInfo = fixture.homeTeam;
                  const aInfo = fixture.awayTeam;
                  const isMine =
                    hInfo?.id === me.teamId || aInfo?.id === me.teamId;
                  return (
                    <div
                      key={idx}
                      className={`relative flex items-center gap-4 rounded-xl border px-5 py-3.5 ${isMine ? "border-amber-500/50 bg-amber-950/20" : "border-white/8 bg-white/3"}`}
                    >
                      {isMine && (
                        <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-amber-500 rounded-full text-[10px] font-black text-black uppercase tracking-widest whitespace-nowrap">
                          O seu jogo
                        </span>
                      )}
                      <div className="flex-1 flex items-center justify-end gap-3">
                        <span
                          className="font-black text-sm text-right truncate"
                          style={{ color: hInfo?.color_primary || "#fff" }}
                        >
                          {hInfo?.name || "?"}
                        </span>
                        <div
                          className="w-9 h-9 rounded-full flex items-center justify-center font-black text-sm shrink-0 border border-white/10"
                          style={{
                            background: hInfo?.color_primary || "#333",
                            color: hInfo?.color_secondary || "#fff",
                          }}
                        >
                          {hInfo?.name?.[0] || "?"}
                        </div>
                      </div>
                      <div className="shrink-0 w-8 h-8 rounded-full bg-zinc-800 border border-white/10 flex items-center justify-center">
                        <span className="text-zinc-500 text-[10px] font-black uppercase">vs</span>
                      </div>
                      <div className="flex-1 flex items-center gap-3">
                        <div
                          className="w-9 h-9 rounded-full flex items-center justify-center font-black text-sm shrink-0 border border-white/10"
                          style={{
                            background: aInfo?.color_primary || "#333",
                            color: aInfo?.color_secondary || "#fff",
                          }}
                        >
                          {aInfo?.name?.[0] || "?"}
                        </div>
                        <span
                          className="font-black text-sm text-left truncate"
                          style={{ color: aInfo?.color_primary || "#fff" }}
                        >
                          {aInfo?.name || "?"}
                        </span>
                      </div>
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
