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
      className="w-full overflow-hidden"
      style={{
        background: "#0d0d14",
        borderTop: `2px solid ${accent.border}`,
        boxShadow: `0 4px 32px 0 ${accent.border}55, 0 2px 8px 0 #000a`,
      }}
    >
      {/* ── Collapsed strip — always visible ──────────────────────────── */}
      <button
        type="button"
        className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-all hover:brightness-125"
        style={{
          background: `linear-gradient(90deg, ${accent.border}18 0%, #13131f 40%, #0d0d14 100%)`,
        }}
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
          <span
            className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-sm shrink-0 animate-pulse"
            style={{ background: accent.border, color: "#0d0d14" }}
          >
            Leilão
          </span>
        )}

        {/* Name + pos + skill */}
        <span className="font-headline font-black text-white truncate">
          {selectedAuctionPlayer.name}
        </span>
        <span
          className="text-[10px] font-black shrink-0 px-1.5 py-0.5 rounded-sm"
          style={{
            background: "#1e1e2e",
            color: accent.text,
            border: `1px solid ${accent.border}40`,
          }}
        >
          {pos}
        </span>
        <span className="text-xs text-zinc-500 shrink-0 tabular-nums">
          {selectedAuctionPlayer.skill}
        </span>

        {/* Price / result pill */}
        <span className="font-mono font-black text-amber-400 text-sm shrink-0 ml-auto tabular-nums">
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
            color: "#52525b",
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
            className="text-zinc-600 hover:text-zinc-300 font-bold shrink-0 transition-colors leading-none"
            aria-label="Fechar"
          >
            <span className="material-symbols-outlined text-base">close</span>
          </button>
        )}
      </button>

      {/* ── Expanded panel ────────────────────────────────────────────────── */}
      {isAuctionExpanded && (
        <div style={{ borderTop: "1px solid #1e1e2e" }}>
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
            <p
              className="text-[10px] font-black uppercase tracking-[0.25em] mb-2"
              style={{ color: accent.text }}
            >
              {statusLabel}
            </p>
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
                {selectedAuctionPlayer.skill}
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
          <div className="px-5 pb-4 grid grid-cols-3 gap-2">
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
            <InfoCard icon="bolt" label="Força">
              <span style={{ color: accent.text }} className="text-2xl">
                {selectedAuctionPlayer.skill}
              </span>
            </InfoCard>
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
