import { useState, useEffect, useRef } from "react";
import { formatCurrency } from "../../utils/formatters.js";

/* ── Position accent colours ─────────────────────────────────────────────── */
const POS_ACCENT = {
  GR: "#eab308",
  DEF: "#3b82f6",
  MED: "#10b981",
  ATA: "#f43f5e",
};
const DEFAULT_ACCENT = "#d97706";

/**
 * Toast simples que aparece quando um novo leilão é iniciado.
 * Não aparece se o coach já estiver na página Leilões.
 * Desaparece automaticamente ao fim de 10s ou ao clicar em "Ver Leilão".
 *
 * @param {{
 *   activeAuctions: Array,
 *   currentPage: string,
 *   onNavigateToAuctions: function,
 * }} props
 */
export function AuctionNotification({
  activeAuctions = [],
  currentPage,
  onNavigateToAuctions,
}) {
  const [currentToast, setCurrentToast] = useState(null);
  const queueRef = useRef([]);
  const seenRef = useRef(new Set());
  const timerRef = useRef(null);
  const showingRef = useRef(false);

  const showNext = () => {
    if (showingRef.current) return;
    if (queueRef.current.length === 0) return;
    const next = queueRef.current.shift();
    showingRef.current = true;
    setCurrentToast(next);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      showingRef.current = false;
      setCurrentToast(null);
      setTimeout(showNext, 400);
    }, 10000);
  };

  const dismiss = () => {
    clearTimeout(timerRef.current);
    showingRef.current = false;
    setCurrentToast(null);
    setTimeout(showNext, 400);
  };

  // Detect new auctions and enqueue
  useEffect(() => {
    if (currentPage === "leiloes") {
      clearTimeout(timerRef.current);
      showingRef.current = false;
      queueRef.current = [];
      return;
    }
    const newOnes = activeAuctions.filter(
      (a) => !a.closed && !seenRef.current.has(a.playerId)
    );
    if (newOnes.length === 0) return;
    newOnes.forEach((a) => seenRef.current.add(a.playerId));
    queueRef.current.push(...newOnes);
    showNext();

    return () => {
      clearTimeout(timerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAuctions, currentPage]);

  if (!currentToast || currentPage === "leiloes") return null;

  const accent = POS_ACCENT[currentToast.position] || DEFAULT_ACCENT;

  return (
    <div
      className="fixed bottom-4 left-3 right-3 sm:left-auto sm:right-4 sm:bottom-6 sm:w-80 z-[200] pointer-events-auto"
    >
      <div
        className="rounded-xl overflow-hidden shadow-2xl"
        style={{
          background: "#0d0d14",
          border: `2px solid ${accent}`,
          boxShadow: `0 8px 32px 0 ${accent}44`,
        }}
      >
        {/* Header bar */}
        <div
          className="px-4 py-2 flex items-center gap-2"
          style={{
            background: `linear-gradient(90deg, ${accent}22 0%, ${accent}08 100%)`,
            borderBottom: `1px solid ${accent}30`,
          }}
        >
          <span
            className="text-[10px] font-black uppercase tracking-widest animate-pulse"
            style={{ color: accent }}
          >
            Novo Leilão
          </span>
          <span
            className="text-[10px] font-black px-1.5 py-0.5 rounded-sm ml-1"
            style={{ background: `${accent}22`, color: accent }}
          >
            {currentToast.position}
          </span>
          <button
            type="button"
            onClick={dismiss}
            className="ml-auto opacity-50 hover:opacity-100 transition-opacity"
            aria-label="Fechar notificação"
          >
            <span className="material-symbols-outlined text-base text-zinc-400">
              close
            </span>
          </button>
        </div>

        {/* Body */}
        <div className="px-4 py-3">
          <p className="font-headline font-black text-white text-lg leading-tight truncate">
            {currentToast.name}
          </p>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-sm font-bold" style={{ color: accent }}>
              Força {currentToast.skill}
            </span>
            <span className="text-xs text-zinc-500">
              {currentToast.team_name || "Sem clube"}
            </span>
            <span className="font-mono text-sm font-black text-zinc-300 ml-auto">
              {formatCurrency(currentToast.startingPrice)}
            </span>
          </div>
        </div>

        {/* CTA */}
        <div className="px-4 pb-3">
          <button
            type="button"
            onClick={() => {
              dismiss();
              onNavigateToAuctions?.();
            }}
            className="w-full py-2.5 rounded-lg font-headline font-black uppercase text-sm tracking-wide transition-all active:scale-95 hover:brightness-110"
            style={{ background: accent, color: "#0d0d14" }}
          >
            Ver Leilão
          </button>
        </div>

        {/* Countdown bar */}
        <div className="h-1.5 w-full bg-white/5">
          <div
            key={currentToast.playerId}
            className="h-full rounded-r-full"
            style={{
              background: `linear-gradient(90deg, ${accent}88, ${accent})`,
              animation: `auctionCountdown 10s linear forwards`,
            }}
          />
        </div>

        <style>{`
          @keyframes auctionCountdown {
            from { width: 100%; }
            to   { width: 0%; }
          }
        `}</style>
      </div>
    </div>
  );
}
