import { useState, useEffect, useCallback } from "react";
import { formatCurrency } from "../utils/formatters.js";
import { FLAG_TO_COUNTRY } from "../constants/index.js";
import { AggBadge } from "../components/shared/AggBadge.jsx";
import { PlayerAvatar } from "../components/shared/PlayerAvatar.jsx";

/* ── Position accent colours ─────────────────────────────────────────────── */
const POS_ACCENT = {
  GR: "#eab308",
  DEF: "#3b82f6",
  MED: "#10b981",
  ATA: "#f43f5e",
};
const DEFAULT_ACCENT = "#d97706";

function posAccent(pos) {
  return POS_ACCENT[pos] || DEFAULT_ACCENT;
}

/* ── Countdown hook ───────────────────────────────────────────────────────── */
function useCountdown(endsAt) {
  const [secs, setSecs] = useState(null);
  useEffect(() => {
    if (!endsAt) return;
    const tick = () => setSecs(Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [endsAt]);
  return secs;
}

/* ── Time ago helper ──────────────────────────────────────────────────────── */
function getTimeAgo(ts) {
  const diff = Date.now() - ts;
  if (diff < 60000) return `${Math.floor(diff / 1000)}s`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
  return `${Math.floor(diff / 3600000)}h`;
}

/* ── Small stat block ─────────────────────────────────────────────────────── */
function StatBlock({ icon, label, value }) {
  return (
    <div
      className="rounded-md p-2.5 flex flex-col gap-1"
      style={{ background: "#111118", border: "1px solid #26263a" }}
    >
      <span
        className="material-symbols-outlined text-sm leading-none"
        style={{ color: "#52525b" }}
      >
        {icon}
      </span>
      <p className="text-[8px] text-zinc-500 uppercase tracking-widest font-bold">
        {label}
      </p>
      <p className="font-black text-white text-lg leading-none">{value}</p>
    </div>
  );
}

/* ── Single auction card (flip) ───────────────────────────────────────────── */
/**
 * @param {{
 *   auction: object,
 *   me: object|null,
 *   teams: Array,
 *   teamInfo: object|null,
 *   matchweekCount: number,
 *   socket: object,
 * }} props
 */
function AuctionCard({ auction, me, teams, teamInfo, matchweekCount, socket }) {
  const [flipped, setFlipped] = useState(false);
  const [bidInput, setBidInput] = useState("");
  const [bidError, setBidError] = useState("");
  const [bidSuccess, setBidSuccess] = useState(false);

  const secs = useCountdown(auction.closed || auction.paused ? null : auction.endsAt);
  const accent = posAccent(auction.position);
  const countryName = FLAG_TO_COUNTRY?.[auction.nationality] || auction.nationality || "—";

  const isSeller = auction.sellerTeamId === me?.teamId;
  const isLeader = auction.currentHighBidTeamId === me?.teamId;
  const isClosed = !!auction.closed;
  const isPaused = !isClosed && !!auction.paused;

  const highBidTeam = auction.currentHighBidTeamId
    ? teams.find((t) => t.id === auction.currentHighBidTeamId)
    : null;

  // Pre-fill bid input with minimum bid
  const minBid = auction.currentHighBid > 0
    ? auction.currentHighBid + 50000
    : auction.startingPrice;

  useEffect(() => {
    setBidInput(String(minBid));
  }, [minBid]);

  const handleBid = useCallback(() => {
    const amount = Number(bidInput);
    if (!Number.isFinite(amount) || amount < minBid) {
      setBidError(`Lance mínimo: ${formatCurrency(minBid)}`);
      return;
    }
    if (teamInfo && amount > (teamInfo.budget || 0)) {
      setBidError("Orçamento insuficiente.");
      return;
    }
    setBidError("");
    socket.emit("placeAuctionBid", { playerId: auction.playerId, bidAmount: amount });
    setBidSuccess(true);
    setTimeout(() => setBidSuccess(false), 3000);
  }, [bidInput, minBid, auction.playerId, teamInfo, socket]);

  return (
    <div
      className="relative select-none cursor-pointer hover:scale-[1.04] transition-transform duration-300"
      style={{ perspective: "1000px", minHeight: 380 }}
      onClick={() => setFlipped(!flipped)}
    >
      {/* Card wrapper with flip transform */}
      <div
        style={{
          transition: "transform 0.55s cubic-bezier(0.4,0,0.2,1)",
          transformStyle: "preserve-3d",
          transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
          position: "relative",
          minHeight: 380,
        }}
      >
        {/* ── FRENTE ────────────────────────────────────────────────────── */}
        <div
          className="absolute inset-0 rounded-xl overflow-hidden flex flex-col"
          style={{
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
            background: "#0d0d14",
            border: `2px solid ${isClosed || isPaused ? "#333" : accent}`,
            boxShadow: isClosed || isPaused ? "none" : `0 0 24px 0 ${accent}33`,
          }}
        >
          {/* Header */}
          <div
            className="px-4 pt-4 pb-3 flex items-start gap-3"
            style={{
              background: `linear-gradient(135deg, ${accent}18 0%, transparent 100%)`,
              borderBottom: `1px solid ${accent}22`,
            }}
          >
            {/* Avatar */}
            <PlayerAvatar
              seed={auction.playerId}
              position={auction.position}
              teamColor={accent}
              size="md"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span
                  className="text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-sm"
                  style={{ background: `${accent}22`, color: accent }}
                >
                  {auction.position}
                </span>
                {!!auction.is_star && (auction.position === "MED" || auction.position === "ATA") && (
                  <span className="text-amber-400 font-black text-base" title="Craque">★</span>
                )}
                {(auction.suspension_until_matchweek ?? 0) > matchweekCount && (
                  <span className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded-sm bg-red-900/40 text-red-400 border border-red-800/40 tracking-widest">
                    Suspenso
                  </span>
                )}
                {(auction.injury_until_matchweek ?? 0) > matchweekCount && (
                  <span className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded-sm bg-red-900/30 text-red-400 border border-red-800/30 tracking-widest">
                    Lesionado
                  </span>
                )}
              </div>
              <p className="font-headline font-black text-white text-xl leading-tight truncate">
                {auction.name}
              </p>
              <p className="text-[10px] text-zinc-500 truncate">
                {auction.team_name || "Sem clube"}
              </p>
            </div>
            <div className="flex flex-col items-end shrink-0 gap-1">
              <span
                className="font-black text-2xl leading-none tabular-nums"
                style={{ color: accent }}
              >
                {auction.skill}
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setFlipped(true);
                }}
                className="text-[9px] font-bold uppercase tracking-wide text-zinc-500 hover:text-zinc-300 transition-colors flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-xs leading-none">info</span>
                Stats
              </button>
            </div>
          </div>

          {/* Timer + high bid */}
          <div className="px-4 py-3 flex items-center gap-3" style={{ borderBottom: "1px solid #1e1e2e" }}>
            {isClosed ? (
              <span className="text-[10px] font-black uppercase text-zinc-500">Leilão encerrado</span>
            ) : isPaused ? (
              <span className="text-[10px] font-black uppercase text-zinc-500 flex items-center gap-1">
                <span className="material-symbols-outlined text-xs leading-none">pause_circle</span>
                Em Pausa
              </span>
            ) : (
              <>
                <span
                  className="font-mono font-black text-2xl tabular-nums leading-none"
                  style={{ color: secs != null && secs <= 15 ? "#f87171" : accent }}
                >
                  {secs != null ? `${secs}s` : "—"}
                </span>
                <span className="text-zinc-700 text-xs">restantes</span>
              </>
            )}
            <div className="ml-auto text-right">
              <p className="text-[9px] text-zinc-600 uppercase font-bold">
                {isClosed ? (auction.result?.sold ? "Vendido" : "Sem lances") : "Bid mais alto"}
              </p>
              {isClosed && auction.result?.sold ? (
                <>
                  <p className="font-mono font-black text-sm text-emerald-400 tabular-nums">
                    {formatCurrency(auction.result.finalBid)}
                  </p>
                  <p className="text-[9px] text-zinc-500">{auction.result.buyerTeamName}</p>
                </>
              ) : isClosed ? (
                <p className="font-mono font-black text-sm text-zinc-500">—</p>
              ) : auction.currentHighBid > 0 ? (
                <>
                  <p className="font-mono font-black text-sm text-white tabular-nums">
                    {formatCurrency(auction.currentHighBid)}
                  </p>
                  <p className="text-[9px] text-zinc-500 truncate max-w-[100px]">
                    {highBidTeam?.name || `Equipa ${auction.currentHighBidTeamId}`}
                  </p>
                </>
              ) : (
                <p className="font-mono font-black text-sm text-zinc-500">
                  {formatCurrency(auction.startingPrice)} <span className="text-[9px] text-zinc-600">base</span>
                </p>
              )}
            </div>
          </div>

          {/* Bid history */}
          {!isClosed && !isPaused && auction.auction_bid_history && auction.auction_bid_history.length > 1 && (
            <div
              className="px-4 py-2 border-y"
              style={{ borderBottom: "1px solid #1e1e2e", borderTop: "1px solid #1e1e2e" }}
            >
              <p className="text-[8px] font-black uppercase tracking-widest text-zinc-600 mb-1.5">
                Lances ({auction.auction_bid_history.length})
              </p>
              <div className="space-y-1 max-h-24 overflow-y-auto">
                {auction.auction_bid_history
                  .sort((a, b) => b.amount - a.amount)
                  .map((bid, i) => {
                    const isLeader = bid.teamId === auction.auction_high_bid_team_id;
                    const teamName = teams.find(t => t.id == bid.teamId)?.name || `Equipa ${bid.teamId}`;
                    const timeAgo = bid.timestamp ? getTimeAgo(bid.timestamp) : "";
                    return (
                      <div
                        key={i}
                        className={`flex items-center justify-between text-[10px] py-1 rounded px-1.5 ${isLeader ? "bg-emerald-400/10" : ""}`}
                      >
                        <span className={`font-semibold truncate ${isLeader ? "text-emerald-400" : "text-on-surface-variant"}`}>
                          {teamName}
                        </span>
                        <span className="font-mono font-black text-white tabular-nums ml-2">
                          {formatCurrency(bid.amount)}
                        </span>
                        {timeAgo && (
                          <span className="text-[8px] text-zinc-600 ml-1.5 shrink-0">
                            {timeAgo}
                          </span>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Bid area */}
          <div className="px-4 py-3 flex-1 flex flex-col justify-end">
            {isClosed ? (
              <div className="text-center py-2">
                {auction.result?.sold ? (
                  <p className="font-headline font-black text-emerald-400 text-sm uppercase">
                    Vendido a {auction.result.buyerTeamName}
                  </p>
                ) : (
                  <p className="font-headline font-black text-zinc-500 text-sm uppercase">
                    Sem licitações
                  </p>
                )}
              </div>
            ) : isPaused ? (
              <div
                className="rounded-lg py-3 text-center"
                style={{ background: "#1a1a2333", border: "1px solid #3f3f5533" }}
              >
                <span className="material-symbols-outlined text-zinc-500 text-xl">pause_circle</span>
                <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mt-1">
                  Pausado durante o jogo
                </p>
                <p className="text-[9px] text-zinc-600 mt-0.5">Retoma após o apito final</p>
              </div>
            ) : isSeller ? (
              <div
                className="rounded-lg py-3 text-center"
                style={{ background: "#1e1b4b33", border: "1px solid #312e8133" }}
              >
                <p className="text-[10px] font-black uppercase tracking-widest text-indigo-400">O teu jogador</p>
                <p className="font-headline font-black text-white text-sm mt-0.5">Em Leilão</p>
              </div>
            ) : isLeader ? (
              <div
                className="rounded-lg py-3 text-center"
                style={{ background: "#064e3b33", border: "1px solid #10b98133" }}
              >
                <p className="text-[10px] font-black uppercase tracking-widest text-emerald-400">A liderar</p>
                <p className="font-mono font-black text-white text-base tabular-nums mt-0.5">
                  {formatCurrency(auction.currentHighBid)}
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <div
                  className="flex items-center rounded-lg overflow-hidden"
                  style={{ border: `1px solid ${accent}50`, background: "#111118" }}
                >
                  <span
                    className="material-symbols-outlined text-sm px-3 shrink-0"
                    style={{ color: accent }}
                  >
                    currency_exchange
                  </span>
                  <input
                    type="number"
                    min={minBid}
                    value={bidInput}
                    onChange={(e) => {
                      setBidInput(e.target.value);
                      setBidError("");
                    }}
                    onKeyDown={(e) => e.key === "Enter" && handleBid()}
                    onClick={(e) => e.stopPropagation()}
                    className="flex-1 min-w-0 bg-transparent py-2.5 pr-3 text-white font-mono text-sm outline-none"
                  />
                </div>
                {bidError && (
                  <p className="text-[10px] text-red-400 font-bold">{bidError}</p>
                )}
                {bidSuccess && (
                  <p className="text-[10px] text-emerald-400 font-bold">Lance registado!</p>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleBid();
                  }}
                  className="w-full py-2.5 rounded-lg font-headline font-black uppercase text-sm tracking-wide transition-all active:scale-95 hover:brightness-110"
                  style={{ background: accent, color: "#0d0d14" }}
                >
                  Licitar
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── VERSO ─────────────────────────────────────────────────────── */}
        <div
          className="absolute inset-0 rounded-xl overflow-hidden flex flex-col"
          style={{
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
            background: "#0d0d14",
            border: `2px solid ${accent}`,
          }}
        >
          <div
            className="px-4 pt-4 pb-3 flex items-center gap-3"
            style={{
              background: `linear-gradient(135deg, ${accent}18 0%, transparent 100%)`,
              borderBottom: `1px solid ${accent}22`,
            }}
          >
            <PlayerAvatar
              seed={auction.playerId}
              position={auction.position}
              teamColor={accent}
              size="sm"
            />
            <div className="min-w-0 flex-1">
              <p className="font-headline font-black text-white text-base leading-tight truncate">
                {auction.name}
              </p>
              <p className="text-[9px] text-zinc-500">{countryName}</p>
            </div>
            <button
              type="button"
              onClick={() => setFlipped(false)}
              className="text-zinc-500 hover:text-zinc-300 transition-colors"
              aria-label="Voltar"
            >
              <span className="material-symbols-outlined text-lg">arrow_back</span>
            </button>
          </div>
          <div className="px-4 py-3 flex-1 overflow-y-auto">
            {/* Stats grid */}
            <p className="text-[8px] font-black uppercase tracking-widest text-zinc-600 mb-2">Historial</p>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <StatBlock icon="sports_soccer" label="Jogos" value={auction.games_played ?? 0} />
              <StatBlock icon="stat_3" label="Golos" value={auction.goals ?? 0} />
              <StatBlock icon="square" label="Vermelhos" value={auction.red_cards ?? 0} />
              <StatBlock icon="personal_injury" label="Lesões" value={auction.injuries ?? 0} />
            </div>
            {auction.aggressiveness != null && (
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[9px] text-zinc-600 uppercase font-bold tracking-wide">Agressividade</span>
                <AggBadge value={auction.aggressiveness} />
              </div>
            )}
            {/* Financial */}
            <p className="text-[8px] font-black uppercase tracking-widest text-zinc-600 mb-2">Financeiro</p>
            <div
              className="rounded-md grid grid-cols-2 mb-2"
              style={{ background: "#111118", border: "1px solid #26263a" }}
            >
              <div className="p-3 border-r border-zinc-800">
                <p className="text-[8px] text-zinc-500 uppercase tracking-widest font-bold mb-1">Salário</p>
                <p className="font-black text-white text-sm font-mono tabular-nums">
                  {formatCurrency(auction.wage || 0)}
                  <span className="text-[9px] text-zinc-500 font-normal"> /sem</span>
                </p>
              </div>
              <div className="p-3">
                <p className="text-[8px] text-zinc-500 uppercase tracking-widest font-bold mb-1">Preço Base</p>
                <p className="font-black text-sm font-mono tabular-nums" style={{ color: accent }}>
                  {formatCurrency(auction.startingPrice)}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────────── */
/**
 * @param {{
 *   activeAuctions: Array,
 *   me: object|null,
 *   teams: Array,
 *   teamInfo: object|null,
 *   matchweekCount: number,
 *   socket: object,
 * }} props
 */
export function AuctionsPage({ activeAuctions = [], me, teams, teamInfo, matchweekCount = 0, socket }) {
  const live = activeAuctions.filter((a) => !a.closed);
  const closed = activeAuctions.filter((a) => a.closed);

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <span className="material-symbols-outlined text-3xl" style={{ color: "#d97706" }}>
          gavel
        </span>
        <div>
          <h1 className="font-headline font-black text-2xl text-white leading-tight">Leilões</h1>
          <p className="text-xs text-zinc-500">
            {live.length === 0
              ? "Sem leilões a decorrer"
              : `${live.length} leilão${live.length !== 1 ? "s" : ""} a decorrer`}
          </p>
        </div>
        <div className="ml-auto text-right">
          <p className="text-[9px] text-zinc-600 uppercase font-bold tracking-wide">Caixa disponível</p>
          <p className="font-mono font-black text-lg text-white tabular-nums">
            {formatCurrency(teamInfo?.budget || 0)}
          </p>
        </div>
      </div>

      {/* Live auctions */}
      {live.length > 0 && (
        <section className="mb-8">
          <p className="text-[9px] font-black uppercase tracking-widest text-zinc-600 mb-3">
            Em curso
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {live.map((auction) => (
              <AuctionCard
                key={auction.playerId}
                auction={auction}
                me={me}
                teams={teams}
                teamInfo={teamInfo}
                matchweekCount={matchweekCount}
                socket={socket}
              />
            ))}
          </div>
        </section>
      )}

      {/* Closed auctions (result visible) */}
      {closed.length > 0 && (
        <section>
          <p className="text-[9px] font-black uppercase tracking-widest text-zinc-600 mb-3">
            Recentes
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {closed.map((auction) => (
              <AuctionCard
                key={auction.playerId}
                auction={auction}
                me={me}
                teams={teams}
                teamInfo={teamInfo}
                matchweekCount={matchweekCount}
                socket={socket}
              />
            ))}
          </div>
        </section>
      )}

      {/* Empty state */}
      {live.length === 0 && closed.length === 0 && (
        <div
          className="rounded-xl flex flex-col items-center justify-center py-20 gap-4"
          style={{ background: "#0d0d14", border: "1px solid #1e1e2e" }}
        >
          <span className="material-symbols-outlined text-5xl text-zinc-700">gavel</span>
          <div className="text-center">
            <p className="font-headline font-black text-zinc-500 text-lg">Sem leilões ativos</p>
            <p className="text-zinc-700 text-sm mt-1">
              Quando um clube colocar um jogador em leilão, aparece aqui.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
