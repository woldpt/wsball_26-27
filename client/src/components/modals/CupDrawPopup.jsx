import { socket } from "../../socket.js";

/**
 * @param {{ cupDraw: object|null, cupDrawRevealIdx: number, me: object, showCupDrawPopup: boolean, setShowCupDrawPopup: function }} props
 */
export function CupDrawPopup({
  cupDraw,
  cupDrawRevealIdx,
  me,
  showCupDrawPopup,
  setShowCupDrawPopup,
}) {
  if (!showCupDrawPopup || !cupDraw) return null;

  const totalPairs = (cupDraw.fixtures || []).length;
  const fullyRevealed = cupDrawRevealIdx >= totalPairs * 2;

  return (
    <div className="fixed inset-0 z-140 bg-zinc-950/97 backdrop-blur-sm flex flex-col items-center justify-center p-4 overflow-y-auto">
      {/* Header */}
      <div className="text-center mb-8 shrink-0">
        <p className="text-xs text-amber-400 uppercase font-black tracking-[0.3em] mb-2">
          Taça de Portugal · Temporada {cupDraw.season}
        </p>
        <h1 className="text-3xl sm:text-4xl font-black text-primary uppercase tracking-tight">
          Sorteio — {cupDraw.roundName}
        </h1>
      </div>

      {/* Fixtures */}
      <div className="w-full max-w-xl space-y-3">
        {(cupDraw.fixtures || []).map((fixture, pairIdx) => {
          const homeIdx = pairIdx * 2;
          const awayIdx = pairIdx * 2 + 1;
          const homeRevealed = cupDrawRevealIdx > homeIdx;
          const awayRevealed = cupDrawRevealIdx > awayIdx;
          const isMyPair =
            awayRevealed &&
            (fixture.homeTeam?.id === me?.teamId ||
              fixture.awayTeam?.id === me?.teamId);

          return (
            <div
              key={pairIdx}
              className={`relative flex items-center gap-4 rounded-xl border px-5 py-3.5 transition-all duration-300 ${
                isMyPair
                  ? "border-amber-500/60 bg-amber-950/30"
                  : "border-white/8 bg-white/4"
              }`}
            >
              {isMyPair && (
                <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-amber-500 rounded-full text-[10px] font-black text-black uppercase tracking-widest whitespace-nowrap">
                  O seu jogo
                </span>
              )}

              {/* Home team */}
              <div
                className={`flex-1 flex items-center justify-end gap-3 transition-all duration-300 ${
                  homeRevealed ? "opacity-100" : "opacity-0"
                }`}
              >
                <span
                  className="font-black text-sm text-right truncate"
                  style={{
                    color: homeRevealed
                      ? fixture.homeTeam?.color_primary || "#fff"
                      : "transparent",
                  }}
                >
                  {homeRevealed ? fixture.homeTeam?.name || "?" : "·····"}
                </span>
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center font-black text-sm shrink-0 border border-white/10"
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
              <div className="shrink-0 w-8 h-8 rounded-full bg-zinc-800 border border-white/10 flex items-center justify-center">
                <span className="text-zinc-500 text-[10px] font-black uppercase">
                  vs
                </span>
              </div>

              {/* Away team */}
              <div
                className={`flex-1 flex items-center gap-3 transition-all duration-300 ${
                  awayRevealed ? "opacity-100" : "opacity-0"
                }`}
              >
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center font-black text-sm shrink-0 border border-white/10"
                  style={{
                    background: awayRevealed
                      ? fixture.awayTeam?.color_primary || "#333"
                      : "#27272a",
                    color: fixture.awayTeam?.color_secondary || "#fff",
                  }}
                >
                  {awayRevealed ? fixture.awayTeam?.name?.[0] || "?" : ""}
                </div>
                <span
                  className="font-black text-sm text-left truncate"
                  style={{
                    color: awayRevealed
                      ? fixture.awayTeam?.color_primary || "#fff"
                      : "transparent",
                  }}
                >
                  {awayRevealed ? fixture.awayTeam?.name || "?" : "·····"}
                </span>
              </div>
            </div>
          );
        })}

        {!fullyRevealed && (
          <div className="text-center py-3">
            <span className="animate-pulse text-primary text-xs font-black uppercase tracking-widest">
              A sortear…
            </span>
          </div>
        )}
      </div>

      {/* Continue button */}
      {cupDraw.humanInCup && fullyRevealed && (
        <div className="mt-8 w-full max-w-xl shrink-0">
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
