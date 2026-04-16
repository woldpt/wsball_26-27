import { AggBadge } from "../shared/AggBadge.jsx";
import { formatCurrency } from "../../utils/formatters.js";
import { FLAG_TO_COUNTRY } from "../../constants/index.js";

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

  const statusLabel = auctionResult
    ? auctionResult.sold
      ? "Leilão Finalizado"
      : "Leilão Finalizado"
    : "Leilão em Curso";

  return (
    <div
      className="w-full shadow-2xl overflow-hidden"
      style={{ background: "#0f0f17", borderBottom: "2px solid #d97706" }}
    >
      {/* ── Collapsed strip — always visible ── */}
      <button
        type="button"
        className="w-full flex items-center gap-3 px-4 py-2.5 text-left"
        style={{
          background: "linear-gradient(90deg, #1a1a2e 0%, #0f0f17 100%)",
        }}
        onClick={() => setIsAuctionExpanded((v) => !v)}
      >
        <span
          className="text-xs font-black uppercase tracking-widest px-2 py-0.5 rounded shrink-0 animate-pulse"
          style={{ background: "#d97706", color: "#0f0f17" }}
        >
          Leilão
        </span>
        <span className="font-black text-amber-100 truncate">
          {selectedAuctionPlayer.name}
        </span>
        <span className="text-xs text-zinc-400 shrink-0">
          {selectedAuctionPlayer.position} · {selectedAuctionPlayer.skill}
        </span>
        <span className="font-black text-amber-400 text-sm shrink-0 ml-auto">
          {formatCurrency(startingPrice)}
        </span>
        {auctionResult ? (
          <span
            className="text-xs font-black px-2 py-0.5 rounded shrink-0"
            style={{
              background: auctionResult.sold ? "#16a34a" : "#7f1d1d",
              color: "#fff",
            }}
          >
            {auctionResult.sold
              ? `Vendido · ${auctionResult.buyerTeamName} · ${formatCurrency(auctionResult.finalBid)}`
              : "Sem licitações"}
          </span>
        ) : myAuctionBid != null ? (
          <span
            className="text-xs font-black uppercase px-2 py-0.5 rounded shrink-0"
            style={{ background: "#059669", color: "#fff" }}
          >
            Lance: {formatCurrency(myAuctionBid)}
          </span>
        ) : null}
        <span className="text-zinc-500 text-sm shrink-0 ml-1">
          {isAuctionExpanded ? "▲" : "▼"}
        </span>
        {!auctionResult && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              closeAuctionBid();
            }}
            className="text-zinc-500 hover:text-zinc-200 font-bold text-base leading-none px-1 shrink-0 transition-colors"
          >
            ✕
          </button>
        )}
      </button>

      {/* ── Expanded panel ── */}
      {isAuctionExpanded && (
        <div style={{ background: "#0f0f17", borderTop: "1px solid #292929" }}>
          {/* ── Header: status + player name ── */}
          <div className="px-5 pt-5 pb-4">
            <p
              className="text-xs font-black uppercase tracking-[0.2em] mb-1"
              style={{ color: "#d97706" }}
            >
              {statusLabel}
            </p>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className="font-black text-2xl leading-tight text-white">
                {selectedAuctionPlayer.name}
              </h2>
              <span
                className="text-sm font-black px-2 py-0.5 rounded"
                style={{
                  background: "#292929",
                  color: "#d97706",
                  border: "1px solid #d97706",
                }}
              >
                {selectedAuctionPlayer.position}
              </span>
              <span
                className="text-sm font-black px-2 py-0.5 rounded"
                style={{ background: "#292929", color: "#f4f4f5" }}
              >
                {selectedAuctionPlayer.skill}
              </span>
              {selectedAuctionPlayer.is_star && (
                <span
                  className="text-amber-400 font-black text-lg"
                  title="Craque"
                >
                  ★
                </span>
              )}
            </div>
          </div>

          {/* ── Info cards row ── */}
          <div className="px-5 pb-4 grid grid-cols-3 gap-3">
            {/* Nationality */}
            <div
              className="rounded-lg p-3 flex flex-col gap-1"
              style={{
                background: "#1a1a2e",
                borderBottom: "2px solid #d97706",
              }}
            >
              <p className="text-xs text-zinc-500 uppercase tracking-widest font-semibold">
                Nacionalidade
              </p>
              <p
                className="font-black text-white text-base leading-tight"
                title={FLAG_TO_COUNTRY[selectedAuctionPlayer.nationality] || ""}
              >
                {selectedAuctionPlayer.nationality || "—"}
              </p>
            </div>
            {/* Team */}
            <div
              className="rounded-lg p-3 flex flex-col gap-1"
              style={{
                background: "#1a1a2e",
                borderBottom: "2px solid #d97706",
              }}
            >
              <p className="text-xs text-zinc-500 uppercase tracking-widest font-semibold">
                Equipa
              </p>
              <p className="font-black text-white text-sm leading-tight uppercase truncate">
                {selectedAuctionPlayer.team_name || "Sem clube"}
              </p>
            </div>
            {/* Skill */}
            <div
              className="rounded-lg p-3 flex flex-col gap-1"
              style={{
                background: "#1a1a2e",
                borderBottom: "2px solid #d97706",
              }}
            >
              <p className="text-xs text-zinc-500 uppercase tracking-widest font-semibold">
                Força
              </p>
              <p className="font-black text-white text-xl leading-tight">
                {selectedAuctionPlayer.skill}
              </p>
            </div>
          </div>

          {/* ── Financial row ── */}
          <div className="px-5 pb-4">
            <div
              className="rounded-lg grid grid-cols-2 divide-x"
              style={{
                background: "#1a1a2e",
                borderBottom: "2px solid #d97706",
                divideColor: "#292929",
              }}
            >
              <div className="p-3">
                <p className="text-xs text-zinc-500 uppercase tracking-widest font-semibold mb-0.5">
                  Salário Pretendido
                </p>
                <p className="font-black text-white text-base">
                  {formatCurrency(selectedAuctionPlayer.wage || 0)}
                  <span className="text-xs text-zinc-400 font-normal">
                    {" "}
                    /sem
                  </span>
                </p>
              </div>
              <div className="p-3">
                <p className="text-xs text-zinc-500 uppercase tracking-widest font-semibold mb-0.5">
                  Preço Base
                </p>
                <p className="font-black text-white text-base">
                  {formatCurrency(startingPrice)}
                </p>
              </div>
            </div>
          </div>

          {/* ── Historial ── */}
          <div className="px-5 pb-5">
            <p className="text-xs font-black uppercase tracking-[0.15em] text-zinc-400 mb-2">
              Historial
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                {
                  icon: "⚽",
                  label: "Jogos",
                  value: selectedAuctionPlayer.games_played || 0,
                },
                {
                  icon: "🥅",
                  label: "Golos",
                  value: selectedAuctionPlayer.goals || 0,
                },
                {
                  icon: "🟥",
                  label: "Vermelhos",
                  value: selectedAuctionPlayer.red_cards || 0,
                },
                {
                  icon: "🩹",
                  label: "Lesões",
                  value: selectedAuctionPlayer.injuries || 0,
                },
              ].map(({ icon, label, value }) => (
                <div
                  key={label}
                  className="rounded-lg p-3 flex items-center gap-3"
                  style={{ background: "#1a1a2e" }}
                >
                  <span className="text-xl leading-none">{icon}</span>
                  <div>
                    <p className="text-xs text-zinc-500 font-medium leading-tight">
                      {label}
                    </p>
                    <p className="font-black text-white text-lg leading-tight">
                      {value}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            {selectedAuctionPlayer.aggressiveness != null && (
              <div className="mt-2 flex items-center gap-2 px-1">
                <span className="text-xs text-zinc-500 font-medium">
                  Agressividade:
                </span>
                <AggBadge value={selectedAuctionPlayer.aggressiveness} />
              </div>
            )}
          </div>

          {/* ── Bottom CTA: bid / result / seller ── */}
          {auctionResult ? (
            <div
              className="px-5 py-4 text-center"
              style={{
                background: auctionResult.sold
                  ? "linear-gradient(90deg, #c2410c 0%, #ea580c 50%, #c2410c 100%)"
                  : "linear-gradient(90deg, #1c1917 0%, #292524 50%, #1c1917 100%)",
                borderTop: "1px solid #292929",
              }}
            >
              {auctionResult.sold ? (
                <p className="font-black text-lg text-white uppercase tracking-wider">
                  Vendido ao {auctionResult.buyerTeamName} por{" "}
                  {formatCurrency(auctionResult.finalBid)}
                </p>
              ) : (
                <p className="font-black text-lg text-zinc-300 uppercase tracking-wider">
                  Sem licitações — saiu do leilão
                </p>
              )}
              <p className="text-xs text-white/50 mt-1">
                A fechar automaticamente…
              </p>
            </div>
          ) : myAuctionBid != null ? (
            <div
              className="px-5 py-4 text-center"
              style={{
                background:
                  "linear-gradient(90deg, #065f46 0%, #059669 50%, #065f46 100%)",
                borderTop: "1px solid #292929",
              }}
            >
              <p className="text-xs font-black uppercase tracking-widest text-emerald-200 mb-1">
                Lance Registado
              </p>
              <p className="font-black text-2xl text-white">
                {formatCurrency(myAuctionBid)}
              </p>
              <p className="text-xs text-emerald-300/60 mt-1">
                A aguardar o resultado do leilão…
              </p>
            </div>
          ) : isSeller ? (
            <div
              className="px-5 py-4 text-center"
              style={{
                background:
                  "linear-gradient(90deg, #065f46 0%, #059669 50%, #065f46 100%)",
                borderTop: "1px solid #292929",
              }}
            >
              <p className="text-xs font-black uppercase tracking-widest text-emerald-200 mb-1">
                O teu jogador
              </p>
              <p className="font-black text-2xl text-white">Em Leilão</p>
              <p className="text-xs text-emerald-300/60 mt-1">
                A aguardar as licitações dos outros treinadores…
              </p>
            </div>
          ) : (
            <div
              className="px-5 py-4"
              style={{ background: "#1a1a2e", borderTop: "1px solid #292929" }}
            >
              <p className="text-xs font-black uppercase tracking-widest text-zinc-400 mb-2">
                Fazer Oferta
              </p>
              <div className="flex items-center gap-2 mb-2">
                <input
                  type="number"
                  min="0"
                  value={auctionBid}
                  onChange={(e) => setAuctionBid(e.target.value)}
                  placeholder={String(startingPrice)}
                  className="flex-1 min-w-0 bg-white border-2 border-zinc-300 rounded-lg px-3 py-2 text-zinc-950 font-mono text-lg outline-none focus:border-amber-500"
                  autoFocus
                />
                <button
                  onClick={submitAuctionBid}
                  className="shrink-0 bg-emerald-500 hover:bg-emerald-400 text-white font-black uppercase text-sm px-5 py-2.5 rounded-lg flex items-center gap-1.5"
                >
                  <span>✓</span> OK
                </button>
              </div>
              <p className="text-xs text-red-200 font-medium">
                Caixa: {formatCurrency(teamInfo?.budget || 0)}
                <span className="mx-1.5 opacity-50">·</span>
                Lance mais alto vence.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
