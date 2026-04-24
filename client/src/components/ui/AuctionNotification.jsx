import { useState, useEffect } from "react";
import { AggBadge } from "../shared/AggBadge.jsx";
import { formatCurrency } from "../../utils/formatters.js";
import { FLAG_TO_COUNTRY } from "../../constants/index.js";

/* ── Position accent colours ─────────────────────────────────────────────── */
const POS_ACCENT = {
  GR: { border: "#eab308", text: "#eab308" },
  DEF: { border: "#3b82f6", text: "#3b82f6" },
  MED: { border: "#10b981", text: "#10b981" },
  ATA: { border: "#f43f5e", text: "#f43f5e" },
};
const DEFAULT_ACCENT = { border: "#d97706", text: "#d97706" };

/* ── Reusable info card ───────────────────────────────────────────────────── */
function InfoCard({ icon, label, children }) {
  return (
    <div
      className="rounded-md p-3.5 flex items-center gap-3"
      style={{ background: "#18181f", border: "1px solid #26263a" }}
    >
      <span
        className="material-symbols-outlined text-xl shrink-0 leading-none"
        style={{ color: "#d97706" }}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold leading-tight">
          {label}
        </p>
        <div className="font-black text-white text-sm leading-snug truncate">
          {children}
        </div>
      </div>
    </div>
  );
}

/* ── Stat block ───────────────────────────────────────────────────────────── */
function StatBlock({ icon, label, value }) {
  return (
    <div
      className="rounded-md p-3 flex flex-col gap-1.5"
      style={{ background: "#18181f", border: "1px solid #26263a" }}
    >
      <span
        className="material-symbols-outlined text-base leading-none"
        style={{ color: "#52525b" }}
      >
        {icon}
      </span>
      <p className="text-[9px] text-zinc-500 uppercase tracking-widest font-bold">
        {label}
      </p>
      <p className="font-black text-white text-xl leading-none">{value}</p>
    </div>
  );
}

/**
 * @param {{
 *   selectedAuctionPlayer: object|null,
 *   isAuctionExpanded: boolean,
 *   setIsAuctionExpanded: function,
 *   auctionResult: object|null,
 *   myAuctionBid: number|null,
 *   auctionBid: string,
 *   setAuctionBid: function,
 *   closeAuctionBid: function,
 *   submitAuctionBid: function,
 *   teams: Array,
 *   me: object|null,
 *   teamInfo: object|null,
 * }} props
 */
export function AuctionNotification({
  selectedAuctionPlayer,
  isAuctionExpanded,
  setIsAuctionExpanded,
  auctionResult,
  myAuctionBid,
  auctionBid,
  setAuctionBid,
  closeAuctionBid,
  submitAuctionBid,
  me,
  teamInfo,
}) {
  const getPrimaryAttr = (p) => {
    if (!p) return 0;
    if (p.position === "GR") return p.gk ?? p.skill ?? 0;
    if (p.position === "DEF") return p.defesa ?? p.skill ?? 0;
    if (p.position === "MED") return p.passe ?? p.skill ?? 0;
    return p.finalizacao ?? p.skill ?? 0;
  };
  const [secondsLeft, setSecondsLeft] = useState(null);

  useEffect(() => {
    if (!selectedAuctionPlayer || auctionResult) {
      setSecondsLeft(null);
      return;
    }
    const endsAt = selectedAuctionPlayer.endsAt;
    if (!endsAt) return;
    const tick = () =>
      setSecondsLeft(Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [selectedAuctionPlayer, auctionResult]);

  if (!selectedAuctionPlayer) return null;

  const startingPrice =
    selectedAuctionPlayer.startingPrice ||
    selectedAuctionPlayer.transfer_price ||
    0;
  const isSeller = selectedAuctionPlayer.sellerTeamId === me?.teamId;
  const pos = selectedAuctionPlayer.position;
  const accent = POS_ACCENT[pos] || DEFAULT_ACCENT;
  const countryName =
    FLAG_TO_COUNTRY[selectedAuctionPlayer.nationality] ||
    selectedAuctionPlayer.nationality ||
    "—";

  const isFinished = !!auctionResult;
  const statusLabel = isFinished ? "Leilão Finalizado" : "Leilão em Curso";

  return (
    <div
      className="w-full overflow-hidden relative"
      style={{
        background:
          "linear-gradient(90deg, #92681a 0%, #c9950a 30%, #f0c330 50%, #c9950a 70%, #92681a 100%)",
        borderTop: `2px solid #f5d76e`,
        borderBottom: `1px solid #a8730a`,
        boxShadow: `0 4px 32px 0 #d4af3788, 0 2px 12px 0 #f0c33044, 0 0 0 1px #d4af3722`,
      }}
    >
      {/* ── Shimmer overlay ── */}
      <div
        className="absolute inset-0 pointer-events-none overflow-hidden"
        style={{ zIndex: 0 }}
      >
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(105deg, transparent 30%, #fff5 50%, transparent 70%)",
            animation: "shimmer 3s infinite linear",
            backgroundSize: "200% 100%",
          }}
        />
      </div>
      {/* ── Collapsed strip — always visible ──────────────────────────── */}
      <button
        type="button"
        className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-all hover:brightness-110 relative"
        style={{ zIndex: 1 }}
        onClick={() => setIsAuctionExpanded((v) => !v)}
      >
        {/* Live / finished pill */}
        {isFinished ? (
          <span
            className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-sm shrink-0"
            style={{ background: "#292929", color: "#a1a1aa" }}
          >
            Finalizado
          </span>
        ) : (
          <span className="flex items-center gap-1.5 shrink-0">
            <span
              className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-sm animate-pulse"
              style={{ background: "#3b1f00", color: "#f5d76e" }}
            >
              Leilão
            </span>
            {secondsLeft != null && (
              <span
                className="text-[10px] font-black tabular-nums px-1.5 py-0.5 rounded-sm"
                style={{
                  background: secondsLeft <= 10 ? "#7f1d1d" : "#00000030",
                  color: secondsLeft <= 10 ? "#fca5a5" : "#5c3500",
                }}
              >
                {secondsLeft}s
              </span>
            )}
          </span>
        )}

        {/* Name + pos + skill */}
        <span
          className="font-headline font-black truncate"
          style={{ color: "#3b1f00" }}
        >
          {selectedAuctionPlayer.name}
        </span>
        <span
          className="text-[10px] font-black shrink-0 px-1.5 py-0.5 rounded-sm"
          style={{
            background: "#00000030",
            color: "#3b1f00",
            border: `1px solid #00000025`,
          }}
        >
          {pos}
        </span>
        <span
          className="text-xs shrink-0 tabular-nums font-bold"
          style={{ color: "#5c3500" }}
        >
          {getPrimaryAttr(selectedAuctionPlayer)}
        </span>

        {/* Price / result pill */}
        <span
          className="font-mono font-black text-sm shrink-0 ml-auto tabular-nums"
          style={{ color: "#3b1f00" }}
        >
          {formatCurrency(startingPrice)}
        </span>
        {auctionResult ? (
          <span
            className="text-[10px] font-black px-2 py-0.5 rounded-sm shrink-0"
            style={{
              background: auctionResult.sold ? "#15803d" : "#7f1d1d",
              color: "#fff",
            }}
          >
            {auctionResult.sold
              ? `Vendido · ${formatCurrency(auctionResult.finalBid)}`
              : "Sem lances"}
          </span>
        ) : myAuctionBid != null ? (
          <span
            className="text-[10px] font-black uppercase px-2 py-0.5 rounded-sm shrink-0"
            style={{ background: "#059669", color: "#fff" }}
          >
            Lance: {formatCurrency(myAuctionBid)}
          </span>
        ) : null}

        {/* Chevron */}
        <span
          className="material-symbols-outlined text-base shrink-0 transition-transform"
          style={{
            color: "#5c3500",
            transform: isAuctionExpanded ? "rotate(180deg)" : "rotate(0deg)",
          }}
        >
          expand_more
        </span>

        {/* Close (only when live) */}
        {!auctionResult && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              closeAuctionBid();
            }}
            className="font-bold shrink-0 transition-colors leading-none hover:opacity-60"
            style={{ color: "#5c3500" }}
            aria-label="Fechar"
          >
            <span className="material-symbols-outlined text-base">close</span>
          </button>
        )}
      </button>

      {/* ── Expanded panel ────────────────────────────────────────────────── */}
      {isAuctionExpanded && (
        <div
          style={{
            borderTop: "1px solid #a8730a",
            background: "#0d0d14",
            position: "relative",
            zIndex: 1,
          }}
        >
          {/* ── Hero header ── */}
          <div
            className="px-5 pt-6 pb-5 relative overflow-hidden"
            style={{
              background: `linear-gradient(135deg, ${accent.border}22 0%, ${accent.border}08 50%, transparent 100%)`,
            }}
          >
            {/* Glow orb */}
            <div
              className="absolute -top-8 -left-8 w-40 h-40 rounded-full pointer-events-none"
              style={{
                background: `radial-gradient(circle, ${accent.border}30 0%, transparent 70%)`,
              }}
            />
            <div className="flex items-center gap-3 mb-2">
              <p
                className="text-[10px] font-black uppercase tracking-[0.25em]"
                style={{ color: accent.text }}
              >
                {statusLabel}
              </p>
              {!isFinished && secondsLeft != null && (
                <span
                  className="font-mono font-black text-2xl tabular-nums leading-none"
                  style={{ color: secondsLeft <= 10 ? "#f87171" : accent.text }}
                >
                  {secondsLeft}s
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-headline font-black text-3xl leading-tight text-white tracking-tighter">
                {selectedAuctionPlayer.name}
              </h2>
              <span
                className="text-sm font-black px-2 py-0.5 rounded-sm"
                style={{
                  background: `${accent.border}22`,
                  color: accent.text,
                  border: `1px solid ${accent.border}60`,
                }}
              >
                {pos}
              </span>
              <span
                className="text-sm font-black px-2 py-0.5 rounded-sm"
                style={{ background: "#1e1e2e", color: "#e4e4e7" }}
              >
                {getPrimaryAttr(selectedAuctionPlayer)}
              </span>
              {!!selectedAuctionPlayer.is_star &&
                (pos === "MED" || pos === "ATA") && (
                  <span
                    className="text-amber-400 font-black text-lg"
                    title="Craque"
                  >
                    ★
                  </span>
                )}
            </div>
          </div>

          {/* ── Info cards ── */}
          <div className="px-5 pb-4 grid grid-cols-2 gap-2">
            <InfoCard icon="public" label="Nacionalidade">
              <span title={countryName}>
                {selectedAuctionPlayer.nationality || "—"}
              </span>
              <span className="block text-[10px] text-zinc-500 font-medium truncate">
                {countryName}
              </span>
            </InfoCard>
            <InfoCard icon="shield_person" label="Equipa">
              {selectedAuctionPlayer.team_name || "Sem clube"}
            </InfoCard>
          </div>

          {/* ── Attribute grid ── */}
          <div className="px-5 pb-4">
            <div
              className="rounded-md p-3.5 grid grid-cols-3 gap-x-4 gap-y-2.5"
              style={{ background: "#18181f", border: "1px solid #26263a" }}
            >
              {[
                {
                  label: "GR",
                  value: Number(
                    selectedAuctionPlayer.gk ??
                      selectedAuctionPlayer.skill ??
                      1,
                  ),
                  color: "#eab308",
                  hi: pos === "GR",
                },
                {
                  label: "DEF",
                  value: Number(
                    selectedAuctionPlayer.defesa ??
                      selectedAuctionPlayer.skill ??
                      1,
                  ),
                  color: "#3b82f6",
                  hi: pos === "DEF",
                },
                {
                  label: "MED",
                  value: Number(
                    selectedAuctionPlayer.passe ??
                      selectedAuctionPlayer.skill ??
                      1,
                  ),
                  color: "#10b981",
                  hi: pos === "MED",
                },
                {
                  label: "ATA",
                  value: Number(
                    selectedAuctionPlayer.finalizacao ??
                      selectedAuctionPlayer.skill ??
                      1,
                  ),
                  color: "#f43f5e",
                  hi: pos === "ATA",
                },
                {
                  label: "Forma",
                  value: Number(selectedAuctionPlayer.form ?? 25),
                  color: "#a1a1aa",
                  hi: false,
                },
                {
                  label: "Resist.",
                  value: Number(selectedAuctionPlayer.resistencia ?? 25),
                  color: "#a1a1aa",
                  hi: false,
                },
              ].map(({ label, value, color, hi }) => (
                <div key={label} className="flex flex-col gap-0.5">
                  <span
                    className="text-[9px] font-black uppercase tracking-widest leading-none"
                    style={{ color: hi ? color : "#52525b" }}
                  >
                    {label}
                  </span>
                  <span
                    className="text-xl font-black tabular-nums leading-none"
                    style={{ color: hi ? color : "#a1a1aa" }}
                  >
                    {value}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Financial ── */}
          <div className="px-5 pb-4">
            <div
              className="rounded-md grid grid-cols-2"
              style={{ background: "#18181f", border: "1px solid #26263a" }}
            >
              <div className="p-3.5 border-r border-zinc-800">
                <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold mb-1">
                  Salário Pretendido
                </p>
                <p className="font-black text-white text-base font-mono tabular-nums">
                  {formatCurrency(selectedAuctionPlayer.wage || 0)}
                  <span className="text-xs text-zinc-500 font-normal">
                    {" "}
                    /sem
                  </span>
                </p>
              </div>
              <div className="p-3.5">
                <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold mb-1">
                  Preço Base
                </p>
                <p
                  className="font-black text-base font-mono tabular-nums"
                  style={{ color: accent.text }}
                >
                  {formatCurrency(startingPrice)}
                </p>
              </div>
            </div>
          </div>

          {/* ── Historial ── */}
          <div className="px-5 pb-4">
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-600 mb-2.5">
              Historial
            </p>
            <div className="grid grid-cols-4 gap-2">
              <StatBlock
                icon="sports_soccer"
                label="Jogos"
                value={selectedAuctionPlayer.games_played || 0}
              />
              <StatBlock
                icon="stat_3"
                label="Golos"
                value={selectedAuctionPlayer.goals || 0}
              />
              <StatBlock
                icon="square"
                label="Vermelhos"
                value={selectedAuctionPlayer.red_cards || 0}
              />
              <StatBlock
                icon="personal_injury"
                label="Lesões"
                value={selectedAuctionPlayer.injuries || 0}
              />
            </div>
            {selectedAuctionPlayer.aggressiveness != null && (
              <div className="mt-3 flex items-center gap-2">
                <span className="text-[10px] text-zinc-600 uppercase font-bold tracking-wide">
                  Agressividade
                </span>
                <AggBadge value={selectedAuctionPlayer.aggressiveness} />
              </div>
            )}
          </div>

          {/* ── Bottom CTA ── */}
          {auctionResult ? (
            <div
              className="px-5 py-4"
              style={{
                background: auctionResult.sold
                  ? "linear-gradient(90deg, #92400e 0%, #b45309 50%, #92400e 100%)"
                  : "#18181f",
                borderTop: "1px solid #1e1e2e",
              }}
            >
              {auctionResult.sold ? (
                <>
                  <p className="font-headline font-black text-xl text-white uppercase tracking-tight text-center">
                    Vendido ao {auctionResult.buyerTeamName}
                  </p>
                  <p className="text-center font-mono font-black text-amber-200 text-lg tabular-nums">
                    {formatCurrency(auctionResult.finalBid)}
                  </p>
                </>
              ) : (
                <p className="font-headline font-black text-lg text-zinc-400 uppercase tracking-tight text-center">
                  Sem licitações — saiu do leilão
                </p>
              )}
              <p className="text-[10px] text-white/30 mt-1 text-center font-medium">
                A fechar automaticamente…
              </p>
            </div>
          ) : myAuctionBid != null ? (
            <div
              className="px-5 py-4 text-center"
              style={{
                background:
                  "linear-gradient(90deg, #064e3b 0%, #065f46 50%, #064e3b 100%)",
                borderTop: "1px solid #1e1e2e",
              }}
            >
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-400 mb-1">
                Lance Registado
              </p>
              <p className="font-headline font-black text-2xl text-white tabular-nums">
                {formatCurrency(myAuctionBid)}
              </p>
              <p className="text-[10px] text-emerald-700 mt-1 font-medium">
                A aguardar o resultado do leilão…
              </p>
            </div>
          ) : isSeller ? (
            <div
              className="px-5 py-4 text-center"
              style={{
                background:
                  "linear-gradient(90deg, #1e1b4b 0%, #312e81 50%, #1e1b4b 100%)",
                borderTop: "1px solid #1e1e2e",
              }}
            >
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-400 mb-1">
                O teu jogador
              </p>
              <p className="font-headline font-black text-2xl text-white uppercase">
                Em Leilão
              </p>
              <p className="text-[10px] text-indigo-600 mt-1 font-medium">
                A aguardar as licitações dos outros treinadores…
              </p>
            </div>
          ) : (
            <div
              className="px-5 py-5"
              style={{ background: "#13131f", borderTop: "1px solid #1e1e2e" }}
            >
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 mb-3">
                Fazer Oferta
              </p>
              <div className="flex items-stretch gap-2 mb-3">
                <div
                  className="flex-1 min-w-0 flex items-center rounded-md overflow-hidden"
                  style={{
                    border: `1px solid ${accent.border}60`,
                    background: "#0d0d14",
                  }}
                >
                  <span
                    className="material-symbols-outlined text-base px-3 shrink-0"
                    style={{ color: accent.text }}
                  >
                    currency_exchange
                  </span>
                  <input
                    type="number"
                    min="0"
                    value={auctionBid}
                    onChange={(e) => setAuctionBid(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && submitAuctionBid()}
                    placeholder={String(startingPrice)}
                    className="flex-1 min-w-0 bg-transparent py-3 pr-3 text-white font-mono text-base outline-none placeholder:text-zinc-700"
                    autoFocus
                  />
                </div>
                <button
                  onClick={submitAuctionBid}
                  className="shrink-0 font-headline font-black uppercase text-sm px-6 rounded-md transition-all active:scale-95"
                  style={{ background: accent.border, color: "#0d0d14" }}
                >
                  Licitar
                </button>
              </div>
              <div className="flex items-center justify-between text-[10px] font-medium">
                <span className="text-zinc-600">Caixa disponível</span>
                <span className="font-black text-zinc-400 font-mono tabular-nums">
                  {formatCurrency(teamInfo?.budget || 0)}
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
