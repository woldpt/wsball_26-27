import { useMemo, useState } from "react";
import { PlayerAvatar } from "../shared/PlayerAvatar.jsx";
import { AggBadge } from "../shared/AggBadge.jsx";

/** @param {number} value */
function fmt(value) {
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

/** @param {string} pos */
function posLabel(pos) {
  return (
    {
      GR: "Guarda-Redes",
      DEF: "Defesa",
      MED: "Médio",
      ATA: "Avançado",
    }[pos] || pos
  );
}

/** @param {string} pos */
function posRingClass(pos) {
  return (
    {
      GR: "ring-yellow-400/60 border-yellow-400/35",
      DEF: "ring-blue-400/60 border-blue-400/35",
      MED: "ring-emerald-400/60 border-emerald-400/35",
      ATA: "ring-rose-400/60 border-rose-400/35",
    }[pos] || "ring-zinc-400/50 border-zinc-500/35"
  );
}

/** @param {string} status */
function statusConfig(status) {
  if (status === "auction") {
    return {
      label: "Leilão",
      cls: "bg-primary/20 text-primary border border-primary/35",
    };
  }
  if (status === "fixed") {
    return {
      label: "À Venda",
      cls: "bg-rose-500/20 text-rose-300 border border-rose-500/30",
    };
  }
  return {
    label: "Sem Lista",
    cls: "bg-zinc-700/20 text-zinc-400 border border-zinc-600/30",
  };
}

function MarketCard({
  player,
  budget,
  me,
  isSameTeamId,
  isFlipped,
  onFlip,
  onOpenDetails,
  onBuy,
  onBid,
}) {
  const price = player.marketPrice ?? 0;
  const affordable = budget >= price;
  const status = statusConfig(player.transfer_status);
  const isAuction = player.transfer_status === "auction";
  const isFixed = player.transfer_status === "fixed";
  const isListed = isAuction || isFixed;
  const isMyAuction = isSameTeamId(player.auction_seller_team_id, me?.teamId);

  return (
    <div className="[perspective:1200px]">
      <div
        className="block w-full text-left"
        onClick={onFlip}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onFlip();
          }
        }}
        role="button"
        tabIndex={0}
        aria-label={`Virar card de ${player.name}`}
        aria-expanded={isFlipped}
      >
        <div
          className={`relative h-[360px] w-full transition-transform duration-500 [transform-style:preserve-3d] ${isFlipped ? "[transform:rotateY(180deg)]" : ""}`}
        >
          <article
            className={`absolute inset-0 rounded-xl border bg-surface-container-low/95 p-4 shadow-xl ring-1 ${posRingClass(player.position)} [backface-visibility:hidden] overflow-hidden`}
          >
            <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.06),transparent_65%)]" />
            <div className="relative flex h-full flex-col">
              <div className="flex items-start justify-between gap-2">
                <span
                  className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-sm tracking-widest ${status.cls}`}
                >
                  {status.label}
                </span>
                <span className="text-[10px] text-zinc-400 font-black uppercase tracking-wider">
                  {player.position}
                </span>
              </div>

              <div className="mt-3 flex items-center justify-between gap-3">
                <PlayerAvatar seed={player.id} position={player.position} />
                <div className="text-right min-w-0">
                  <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-black">
                    Qualidade
                  </p>
                  <p className="font-headline font-black text-4xl leading-none text-primary tabular-nums">
                    {player.skill ?? 0}
                  </p>
                </div>
              </div>

              <div className="mt-4 min-w-0">
                <p className="font-headline font-black uppercase text-base leading-tight text-on-surface truncate">
                  {player.name}
                  {!!player.is_star &&
                    (player.position === "MED" || player.position === "ATA") && (
                      <span className="ml-1 text-amber-400">★</span>
                    )}
                </p>
                <p className="text-[11px] text-zinc-400 truncate mt-0.5">
                  {posLabel(player.position)}
                  {player.nationality ? ` · ${player.nationality}` : ""}
                </p>
                <p className="text-[11px] text-zinc-500 truncate">
                  {player.team_name || "Sem clube"}
                </p>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <div className="rounded-md border border-outline-variant/20 bg-surface-container p-2">
                  <p className="text-[9px] uppercase tracking-widest text-zinc-500 font-black">
                    Agr
                  </p>
                  <div className="mt-1">
                    <AggBadge value={player.aggressiveness} />
                  </div>
                </div>
                <div className="rounded-md border border-outline-variant/20 bg-surface-container p-2">
                  <p className="text-[9px] uppercase tracking-widest text-zinc-500 font-black">
                    Golos
                  </p>
                  <p className="font-headline font-black text-lg leading-none text-emerald-400">
                    {player.goals ?? 0}
                  </p>
                </div>
              </div>

              <div className="mt-auto pt-4 flex items-end justify-between gap-2">
                <div>
                  <p className="text-[9px] uppercase tracking-widest text-zinc-500 font-black">
                    Preço
                  </p>
                  <p
                    className={`font-mono font-black text-sm tabular-nums ${affordable ? "text-zinc-100" : "text-rose-400"}`}
                  >
                    {fmt(price)}
                  </p>
                </div>
                <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">
                  tocar para virar
                </span>
              </div>
            </div>
          </article>

          <article className="absolute inset-0 rounded-xl border border-outline-variant/25 bg-surface-container-low p-4 shadow-xl [transform:rotateY(180deg)] [backface-visibility:hidden] overflow-hidden">
            <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_bottom_left,rgba(255,255,255,0.05),transparent_65%)]" />
            <div className="relative flex h-full flex-col">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-headline font-black uppercase text-sm text-on-surface truncate">
                    {player.name}
                  </p>
                  <p className="text-[10px] text-zinc-400 truncate">
                    {player.team_name || "Sem clube"}
                  </p>
                </div>
                <span
                  className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-sm tracking-widest ${status.cls}`}
                >
                  {status.label}
                </span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-md bg-surface-container p-2 border border-outline-variant/20">
                  <p className="text-[9px] uppercase tracking-widest text-zinc-500 font-black">
                    Qualidade
                  </p>
                  <p className="font-headline font-black text-lg text-primary">
                    {player.skill ?? 0}
                  </p>
                </div>
                <div className="rounded-md bg-surface-container p-2 border border-outline-variant/20">
                  <p className="text-[9px] uppercase tracking-widest text-zinc-500 font-black">
                    Agressividade
                  </p>
                  <div className="mt-1">
                    <AggBadge value={player.aggressiveness} />
                  </div>
                </div>
                <div className="rounded-md bg-surface-container p-2 border border-outline-variant/20">
                  <p className="text-[9px] uppercase tracking-widest text-zinc-500 font-black">
                    Golos
                  </p>
                  <p className="font-black text-emerald-400">{player.goals ?? 0}</p>
                </div>
                <div className="rounded-md bg-surface-container p-2 border border-outline-variant/20">
                  <p className="text-[9px] uppercase tracking-widest text-zinc-500 font-black">
                    Carreira
                  </p>
                  <p className="font-black text-zinc-200">{player.career_goals ?? 0} G</p>
                </div>
              </div>

              <div className="mt-4 rounded-md bg-surface-container p-3 border border-outline-variant/20">
                <div className="flex justify-between text-[11px]">
                  <span className="text-zinc-500">Preço</span>
                  <span
                    className={`font-mono font-black tabular-nums ${affordable ? "text-zinc-100" : "text-rose-400"}`}
                  >
                    {fmt(price)}
                  </span>
                </div>
                <div className="flex justify-between text-[11px] mt-1">
                  <span className="text-zinc-500">Ordenado</span>
                  <span className="font-mono font-black text-zinc-300 tabular-nums">
                    {fmt(player.contract_requested_wage || player.wage || 0)}
                  </span>
                </div>
              </div>

              <div className="mt-auto grid grid-cols-1 gap-2 pt-4">
                {isListed ? (
                  isAuction ? (
                    isMyAuction ? (
                      <div className="py-2 text-center text-zinc-500 text-[10px] font-black uppercase tracking-widest border border-outline-variant/20 rounded-md">
                        O teu leilão
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onBid(player);
                        }}
                        disabled={!affordable}
                        className="w-full py-2.5 bg-primary hover:brightness-110 disabled:opacity-30 text-on-primary font-headline font-black tracking-[0.14em] rounded-md transition-all uppercase text-[10px]"
                      >
                        {affordable ? "Licitar" : "Saldo insuficiente"}
                      </button>
                    )
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onBuy(player);
                      }}
                      disabled={!affordable}
                      className="w-full py-2.5 bg-primary hover:brightness-110 disabled:opacity-30 text-on-primary font-headline font-black tracking-[0.14em] rounded-md transition-all uppercase text-[10px]"
                    >
                      {affordable ? "Comprar" : "Saldo insuficiente"}
                    </button>
                  )
                ) : (
                  <div className="py-2 text-center text-zinc-500 text-[10px] font-black uppercase tracking-widest border border-outline-variant/20 rounded-md">
                    Sem transferência
                  </div>
                )}

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenDetails(player);
                  }}
                  className="w-full py-2.5 bg-surface-container-high hover:bg-surface-bright text-on-surface font-black tracking-[0.14em] rounded-md transition-all uppercase text-[10px] border border-outline-variant/25"
                >
                  Ver detalhes
                </button>
              </div>
            </div>
          </article>
        </div>
      </div>
    </div>
  );
}

/**
 * @param {{
 *   players: Array,
 *   budget: number,
 *   me: object,
 *   marketPositionFilter: string,
 *   setMarketPositionFilter: function,
 *   marketSort: string,
 *   setMarketSort: function,
 *   isSameTeamId: function,
 *   buyPlayer: function,
 *   openAuctionBid: function,
 *   onOpenPlayerHistory: function,
 * }} props
 */
export function TransferHub({
  players,
  budget,
  me,
  marketPositionFilter,
  setMarketPositionFilter,
  marketSort,
  setMarketSort,
  isSameTeamId,
  buyPlayer,
  openAuctionBid,
  onOpenPlayerHistory,
}) {
  const [search, setSearch] = useState("");
  const [flippedId, setFlippedId] = useState(null);

  const visible = useMemo(() => {
    if (!search.trim()) return players;
    const q = search.trim().toLowerCase();
    return players.filter(
      (p) =>
        p.name?.toLowerCase().includes(q) ||
        p.team_name?.toLowerCase().includes(q) ||
        p.nationality?.toLowerCase().includes(q),
    );
  }, [players, search]);

  return (
    <section className="bg-surface-container rounded-lg shadow-sm overflow-hidden border border-outline-variant/20">
      <div className="border-b border-outline-variant/20 bg-surface/40 p-4 md:p-5">
        <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
          <div>
            <h2 className="font-headline text-2xl font-black tracking-tighter uppercase text-on-surface leading-none">
              Mercado de Transferências
            </h2>
            <p className="text-[10px] text-zinc-500 font-bold mt-0.5">
              {visible.length} jogadores disponíveis
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-[9px] text-zinc-500 uppercase font-black tracking-widest">
              Caixa
            </p>
            <p className="text-sm font-black text-primary font-headline">
              {fmt(budget)}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <div className="relative md:col-span-2">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm select-none pointer-events-none">
              search
            </span>
            <input
              type="text"
              className="w-full bg-surface border border-outline-variant/30 rounded-sm pl-9 pr-4 py-2.5 text-xs font-medium focus:ring-1 focus:ring-primary focus:outline-none placeholder:text-zinc-600 text-on-surface"
              placeholder="Pesquisar jogador, clube ou nacionalidade…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="bg-surface border border-outline-variant/30 rounded-sm px-3 py-2.5 text-[11px] font-bold text-on-surface focus:ring-1 focus:ring-primary focus:outline-none"
            value={marketPositionFilter}
            onChange={(e) => setMarketPositionFilter(e.target.value)}
          >
            <option value="all">Posição: Todas</option>
            <option value="GR">Guarda-Redes</option>
            <option value="DEF">Defesa</option>
            <option value="MED">Médio</option>
            <option value="ATA">Avançado</option>
          </select>
          <select
            className="bg-surface border border-outline-variant/30 rounded-sm px-3 py-2.5 text-[11px] font-bold text-on-surface focus:ring-1 focus:ring-primary focus:outline-none"
            value={marketSort}
            onChange={(e) => setMarketSort(e.target.value)}
          >
            <option value="quality-desc">Qualidade ↓</option>
            <option value="quality-asc">Qualidade ↑</option>
            <option value="price-asc">Preço ↑</option>
            <option value="price-desc">Preço ↓</option>
          </select>
        </div>
      </div>

      <div className="p-4 md:p-5">
        {visible.length === 0 ? (
          <div className="py-20 text-center text-zinc-600 text-sm font-bold uppercase tracking-widest">
            Nenhum jogador disponível
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
            {visible.map((player) => (
              <MarketCard
                key={player.id}
                player={player}
                budget={budget}
                me={me}
                isSameTeamId={isSameTeamId}
                isFlipped={flippedId === player.id}
                onFlip={() =>
                  setFlippedId((prev) => (prev === player.id ? null : player.id))
                }
                onOpenDetails={onOpenPlayerHistory}
                onBuy={buyPlayer}
                onBid={openAuctionBid}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
