import { useMemo } from "react";
import { socket } from "../../socket.js";
import { getTeamColor } from "../../utils/teamHelpers.js";
import rawLol from "./LOL.md?raw";
import rawCmtv from "./CMTV.md?raw";
import rawRedcarpet from "./REDCARPET.md?raw";

const parseLines = (raw) =>
  raw
    .split(/\n\n+/)
    .map((s) => s.trim())
    .filter(Boolean);

const LOL_LINES = parseLines(rawLol);
const CMTV_LINES = parseLines(rawCmtv);
const REDCARPET_LINES = parseLines(rawRedcarpet);

const ALL_SOURCES = [
  { lines: LOL_LINES, prefix: "" },
  { lines: CMTV_LINES, prefix: "ÚLTIMA HORA: " },
  { lines: REDCARPET_LINES, prefix: "" },
];

function randomFiller(seed) {
  const src = ALL_SOURCES[Math.floor(Math.random() * ALL_SOURCES.length)];
  const line = src.lines[Math.floor(Math.random() * src.lines.length)];
  return {
    id: `filler-${seed}-${Math.random()}`,
    text: src.prefix + line,
    playerId: null,
    playerName: null,
    teamId: null,
  };
}

/**
 * Builds the ticker playlist: each real news item is followed by one filler
 * line from the .md files. When there are no real news, uses pure filler.
 */
function buildPlaylist(newsItems) {
  if (!newsItems.length) {
    return Array.from({ length: 14 }, (_, i) => randomFiller(i));
  }
  return newsItems.flatMap((item, i) => [item, randomFiller(i)]);
}

/**
 * @param {{ newsTickerItems: Array }} props
 */
export function NewsTicker({ newsTickerItems }) {
  // Rebuild playlist whenever real news changes.
  // useMemo keeps the filler stable between unrelated re-renders.
  const playlist = useMemo(
    () => buildPlaylist(newsTickerItems),
    [newsTickerItems],
  );

  if (!playlist.length) return null;

  // Technique: render content twice and animate translateX(0) → translateX(-50%).
  // Because -50% = exactly one copy's width, the CSS `infinite` loop is seamless.
  // No JS timing, no onAnimationEnd, no state changes during scroll.
  const doubled = [...playlist, ...playlist];

  // ~25 s per item in the playlist (one pass). Minimum 80 s so short lists feel slow.
  const duration = Math.max(80, playlist.length * 25);

  return (
    <div className="fixed bottom-0 left-0 right-0 z-30 lg:z-50 h-8 flex items-stretch bg-zinc-950 border-t border-zinc-700 overflow-hidden">
      <div className="shrink-0 bg-red-600 text-white text-xs font-black px-3 flex items-center uppercase tracking-widest select-none">
        Alerta CM
      </div>
      <div className="overflow-hidden flex-1 relative">
        <style>{`
          @keyframes tickerScroll {
            0%   { transform: translateX(0); }
            100% { transform: translateX(-50%); }
          }
        `}</style>
        <div
          key={newsTickerItems.length}
          className="absolute whitespace-nowrap flex items-center h-full text-xs text-zinc-200"
          style={{
            gap: "5rem",
            animation: `tickerScroll ${duration}s linear infinite`,
          }}
        >
          {doubled.map((item, idx) => {
            const dotColor = getTeamColor(item.teamId);
            if (!item.playerId || !item.playerName) {
              return (
                <span key={`${item.id}-${idx}`} className="shrink-0">
                  <span className="mr-2" style={{ color: dotColor }}>
                    ◆
                  </span>
                  {item.text}
                </span>
              );
            }
            const parts = item.text.split(item.playerName);
            return (
              <span key={`${item.id}-${idx}`} className="shrink-0">
                <span className="mr-2" style={{ color: dotColor }}>
                  ◆
                </span>
                {parts[0]}
                <button
                  type="button"
                  className="text-amber-400 hover:text-amber-300 underline underline-offset-2 cursor-pointer font-semibold"
                  onClick={() =>
                    socket.emit("requestPlayerHistory", {
                      playerId: item.playerId,
                    })
                  }
                >
                  {item.playerName}
                </button>
                {parts.slice(1).join(item.playerName)}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}
