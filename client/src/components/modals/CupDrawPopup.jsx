import { socket } from "../../socket.js";

/**
 * @param {{ cupDraw: object|null, cupDrawRevealIdx: number, me: object, players: object[], showCupDrawPopup: boolean, setShowCupDrawPopup: function }} props
 */
export function CupDrawPopup({
  cupDraw,
  cupDrawRevealIdx,
  me,
  players = [],
  showCupDrawPopup,
  setShowCupDrawPopup,
}) {
  if (!showCupDrawPopup || !cupDraw) return null;

  const totalPairs = (cupDraw.fixtures || []).length;
  const fullyRevealed = cupDrawRevealIdx >= totalPairs * 2;

  const coachOf = (teamId) =>
    players.find((p) => p.teamId === teamId)?.name ?? null;

  return (
    <div className="fixed inset-0 z-140 bg-zinc-950/97 backdrop-blur-sm flex flex-col items-center p-4 overflow-y-auto">
      {/* Header */}
      <div className="w-full text-center mb-6 shrink-0 pt-4 px-2">
        <p className="text-xs text-amber-400 uppercase font-black tracking-widest sm:tracking-[0.3em] mb-2">
          Taça de Portugal · Temporada {cupDraw.season}
        </p>
        <h1 className="text-2xl sm:text-3xl font-black text-primary uppercase tracking-tight">
          Sorteio — {cupDraw.roundName}
        </h1>
      </div>

      {/* Fixtures — two columns on sm+ screens */}
      <div className="w-full max-w-3xl grid grid-cols-1 sm:grid-cols-2 gap-2">
        {(cupDraw.fixtures || []).map((fixture, pairIdx) => {
          const homeIdx = pairIdx * 2;
          const awayIdx = pairIdx * 2 + 1;
          const homeRevealed = cupDrawRevealIdx > homeIdx;
          const awayRevealed = cupDrawRevealIdx > awayIdx;
          const isMyPair =
            awayRevealed &&
            (fixture.homeTeam?.id === me?.teamId ||
              fixture.awayTeam?.id === me?.teamId);

          const homeCoach = homeRevealed ? coachOf(fixture.homeTeam?.id) : null;
          const awayCoach = awayRevealed ? coachOf(fixture.awayTeam?.id) : null;

          return (
            <div
              key={pairIdx}
              className={`relative flex items-center gap-3 rounded-xl border px-4 py-3 transition-all duration-300 ${
                isMyPair
                  ? "border-amber-500/60 bg-amber-950/30"
                  : "border-white/8 bg-white/4"
              }`}
            >
              {isMyPair && (
                <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-amber-500 rounded-full text-[9px] font-black text-black uppercase tracking-widest whitespace-nowrap">
                  O seu jogo
                </span>
              )}

              {/* Home team */}
              <div
                className={`flex-1 flex items-center justify-end gap-2 transition-all duration-300 ${
                  homeRevealed ? "opacity-100" : "opacity-0"
                }`}
              >
                <div className="text-right min-w-0">
                  <span
                    className="block font-black text-xs truncate"
                    style={{
                      color: homeRevealed
                        ? fixture.homeTeam?.color_primary || "#fff"
                        : "transparent",
                    }}
                  >
                    {homeRevealed ? fixture.homeTeam?.name || "?" : "·····"}
                  </span>
                  {homeCoach && (
                    <span className="block text-[9px] text-amber-400 font-bold truncate">
                      {homeCoach}
                    </span>
                  )}
                </div>
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center font-black text-xs shrink-0 border border-white/10"
                  style={{
                    background: homeRevealed
                      ? fixture.homeTeam?.color_primary || "#333"
                      : "#27272a",
                    color: fixture.homeTeam?.color_secondary || "#fff",
                  }}
                >
                  {homeRevealed ? fixture.homeTeam?.name?.[0] || "?" : ""}
                </div>
              </div>

              {/* VS badge */}
              <div className="shrink-0 w-7 h-7 rounded-full bg-zinc-800 border border-white/10 flex items-center justify-center">
                <span className="text-zinc-500 text-[9px] font-black uppercase">
                  vs
                </span>
              </div>

              {/* Away team */}
              <div
                className={`flex-1 flex items-center gap-2 transition-all duration-300 ${
                  awayRevealed ? "opacity-100" : "opacity-0"
                }`}
              >
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center font-black text-xs shrink-0 border border-white/10"
                  style={{
                    background: awayRevealed
                      ? fixture.awayTeam?.color_primary || "#333"
                      : "#27272a",
                    color: fixture.awayTeam?.color_secondary || "#fff",
                  }}
                >
                  {awayRevealed ? fixture.awayTeam?.name?.[0] || "?" : ""}
                </div>
                <div className="min-w-0">
                  <span
                    className="block font-black text-xs truncate"
                    style={{
                      color: awayRevealed
                        ? fixture.awayTeam?.color_primary || "#fff"
                        : "transparent",
                    }}
                  >
                    {awayRevealed ? fixture.awayTeam?.name || "?" : "·····"}
                  </span>
                  {awayCoach && (
                    <span className="block text-[9px] text-amber-400 font-bold truncate">
                      {awayCoach}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {!fullyRevealed && (
          <div className="text-center py-3 col-span-full">
            <span className="animate-pulse text-primary text-xs font-black uppercase tracking-widest">
              A sortear…
            </span>
          </div>
        )}
      </div>

      {/* Continue button */}
      {cupDraw.humanInCup && fullyRevealed && (
        <div className="mt-6 w-full max-w-xl shrink-0 pb-4">
          <button
            onClick={() => {
              setShowCupDrawPopup(false);
              socket.emit("cupDrawAcknowledged");
            }}
            className="w-full rounded-sm bg-primary px-4 py-3 font-black uppercase tracking-widest text-on-primary hover:brightness-110 transition-all"
          >
            Continuar →
          </button>
        </div>
      )}
    </div>
  );
}
