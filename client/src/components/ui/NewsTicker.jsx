import { useState, useEffect, useCallback } from "react";
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

const pickFillerItem = () => {
  const sources = [
    { lines: LOL_LINES, prefix: "" },
    { lines: CMTV_LINES, prefix: "ALERTA CM: " },
    { lines: REDCARPET_LINES, prefix: "" },
  ];
  const src = sources[Math.floor(Math.random() * sources.length)];
  const line = src.lines[Math.floor(Math.random() * src.lines.length)];
  return {
    id: Date.now() + Math.random(),
    text: src.prefix + line,
    playerId: null,
    playerName: null,
    teamId: null,
  };
};

/**
 * @param {{ newsTickerItems: Array }} props
 */
export function NewsTicker({ newsTickerItems }) {
  const [loopKey, setLoopKey] = useState(0);
  const [extraItems, setExtraItems] = useState([]);

  // When real news changes, restart from scratch (no filler yet)
  useEffect(() => {
    setExtraItems([]);
    setLoopKey((k) => k + 1);
  }, [newsTickerItems]);

  const handleAnimationEnd = useCallback(() => {
    setExtraItems([pickFillerItem()]);
    setLoopKey((k) => k + 1);
  }, []);

  const allItems = [...newsTickerItems, ...extraItems];

  if (!allItems.length) return null;

  const duration = Math.max(15, allItems.length * 8);

  return (
    <div className="fixed bottom-16 lg:bottom-0 left-0 right-0 z-50 h-8 flex items-stretch bg-zinc-950 border-t border-zinc-700 overflow-hidden">
      <div className="shrink-0 bg-red-600 text-white text-xs font-black px-3 flex items-center uppercase tracking-widest select-none">
        Notícias
      </div>
      <div className="overflow-hidden flex-1 relative">
        <style>{`@keyframes tickerScroll { 0% { transform: translateX(100vw); } 100% { transform: translateX(-100%); } }`}</style>
        <div
          key={loopKey}
          className="absolute whitespace-nowrap flex items-center h-full gap-8 text-xs text-zinc-200"
          style={{ animation: `tickerScroll ${duration}s linear` }}
          onAnimationEnd={handleAnimationEnd}
        >
          {allItems.map((item) => {
            const dotColor = getTeamColor(item.teamId);
            if (!item.playerId || !item.playerName) {
              return (
                <span key={item.id}>
                  <span className="mr-2" style={{ color: dotColor }}>
                    ◆
                  </span>
                  {item.text}
                </span>
              );
            }
            const parts = item.text.split(item.playerName);
            return (
              <span key={item.id}>
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
