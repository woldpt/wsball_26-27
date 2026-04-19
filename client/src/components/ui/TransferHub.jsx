import { useState, useMemo, useCallback } from "react";
import { PlayerLink } from "../shared/PlayerLink.jsx";
import { AggBadge } from "../shared/AggBadge.jsx";

/** @param {number} value */
function fmt(value) {
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

function getPlayerStat(player, keys, fallback = 0) {
  for (const key of keys) {
    if (player[key] !== undefined && player[key] !== null) return player[key];
  }
  return fallback;
}

/** Position badge with left coloured border */
function PosBadge({ pos }) {
  const colours = {
    GR: "border-yellow-400 text-yellow-400",
    DEF: "border-blue-400 text-blue-400",
    MED: "border-emerald-400 text-emerald-400",
    ATA: "border-rose-400 text-rose-400",
  };
  return (
    <span
      className={`px-2 py-0.5 rounded-sm bg-surface-bright text-[10px] font-black border-l-2 uppercase tracking-wide ${colours[pos] ?? "border-zinc-400 text-zinc-400"}`}
    >
      {pos}
    </span>
  );
}

/** Status pill */
function StatusBadge({ status }) {
  if (!status || status === "none") return null;
  const map = {
    auction: {
      label: "Leilão",
      cls: "bg-primary/20 text-primary border border-primary/30",
    },
    fixed: {
      label: "À Venda",
      cls: "bg-rose-500/20 text-rose-300 border border-rose-500/30",
    },
  };
  const cfg = map[status] ?? {
    label: status,
    cls: "bg-zinc-700 text-zinc-300",
  };
  return (
    <span
      className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-sm tracking-wider ${cfg.cls}`}
    >
      {cfg.label}
    </span>
  );
}

/** Compact stat card */
function StatCard({ label, value, accent = false }) {
  return (
    <div className="bg-surface-container p-3 rounded-md">
      <p className="text-[9px] text-zinc-500 uppercase font-black tracking-widest mb-1">
        {label}
      </p>
      <p
        className={`text-2xl font-black font-headline leading-none ${accent ? "text-primary" : "text-on-surface"}`}
      >
        {value}
      </p>
    </div>
  );
}

/**
 * @param {{
 *   players: Array,
 *   budget: number,
 *   me: object,
 *   teams: Array,
 *   marketPositionFilter: string,
 *   setMarketPositionFilter: function,
 *   marketSort: string,
 *   setMarketSort: function,
 *   isSameTeamId: function,
 *   buyPlayer: function,
 *   openAuctionBid: function,
 * }} props
 */
export function TransferHub({
  players,
  budget,
  me,
  // teams, -- reserved for future use
  marketPositionFilter,
  setMarketPositionFilter,
  marketSort,
  setMarketSort,
  isSameTeamId,
  buyPlayer,
  openAuctionBid,
}) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);

  /** When the user selects a player from the list, show details on the right */
  const selectPlayer = useCallback(
    (player) => setSelected((prev) => (prev?.id === player.id ? null : player)),
    [],
  );

  /** Filter/search on top of what App.jsx already filtered */
  const visible = useMemo(() => {
    if (!search.trim()) return players;
    const q = search.trim().toLowerCase();
    return players.filter(
      (p) =>
        p.name?.toLowerCase().includes(q) ||
        p.team_name?.toLowerCase().includes(q),
    );
  }, [players, search]);

  /** Keep selected in sync when the list changes */
  const selectedPlayer = useMemo(
    () =>
      selected ? (players.find((p) => p.id === selected.id) ?? selected) : null,
    [selected, players],
  );

  const canAfford = useCallback((price) => budget >= price, [budget]);

  // ── Actions ────────────────────────────────────────────────────────────────
  const handleBuy = useCallback(
    (player) => {
      buyPlayer(player.id);
    },
    [buyPlayer],
  );

  const handleBid = useCallback(
    (player) => {
      openAuctionBid(player);
    },
    [openAuctionBid],
  );

  return (
    <div
      className="flex overflow-hidden rounded-lg bg-surface-container-low border border-outline-variant/15 shadow-lg"
      style={{ height: "calc(100dvh - 10rem)" }}
    >
      {/* ── Left: list panel ────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header + search + filters */}
        <div className="shrink-0 px-5 pt-5 pb-3 border-b border-outline-variant/15 space-y-3">
          <div className="flex items-end justify-between gap-3">
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

          {/* Search */}
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm select-none pointer-events-none">
              search
            </span>
            <input
              type="text"
              className="w-full bg-surface border border-outline-variant/30 rounded-sm pl-9 pr-4 py-2 text-xs font-medium focus:ring-1 focus:ring-primary focus:outline-none placeholder:text-zinc-600 text-on-surface"
              placeholder="Pesquisar jogador ou clube…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Filters row */}
          <div className="flex gap-2 flex-wrap">
            <select
              className="bg-surface border border-outline-variant/30 rounded-sm px-3 py-1.5 text-[11px] font-bold text-on-surface focus:ring-1 focus:ring-primary focus:outline-none"
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
              className="bg-surface border border-outline-variant/30 rounded-sm px-3 py-1.5 text-[11px] font-bold text-on-surface focus:ring-1 focus:ring-primary focus:outline-none"
              value={marketSort}
              onChange={(e) => setMarketSort(e.target.value)}
            >
              <option value="quality-desc">Qual ↓ (melhor)</option>
              <option value="quality-asc">Qual ↑ (menor)</option>
              <option value="price-asc">Preço ↑</option>
              <option value="price-desc">Preço ↓</option>
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-y-auto hide-scrollbar">
          <table className="w-full text-left border-separate border-spacing-y-0.5 px-3 pt-2">
            <thead className="sticky top-0 z-10">
              <tr className="bg-surface-container-low">
                <th className="py-2 px-3 text-[9px] font-black text-zinc-600 uppercase tracking-widest">
                  Jogador
                </th>
                <th className="py-2 px-3 text-[9px] font-black text-zinc-600 uppercase tracking-widest">
                  Pos
                </th>
                <th className="py-2 px-3 text-[9px] font-black text-zinc-600 uppercase tracking-widest text-center">
                  Qual
                </th>
                <th className="py-2 px-3 text-[9px] font-black text-zinc-600 uppercase tracking-widest text-center hidden sm:table-cell">
                  Agr
                </th>
                <th className="py-2 px-3 text-[9px] font-black text-zinc-600 uppercase tracking-widest text-center hidden md:table-cell">
                  Golos
                </th>
                <th className="py-2 px-3 text-[9px] font-black text-zinc-600 uppercase tracking-widest">
                  Preço
                </th>
                <th className="py-2 px-3 text-[9px] font-black text-zinc-600 uppercase tracking-widest">
                  Estado
                </th>
                <th className="py-2 px-3 text-[9px] font-black text-zinc-600 uppercase tracking-widest text-right">
                  Acção
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((player) => {
                const isSelected = selectedPlayer?.id === player.id;
                const price = player.marketPrice;
                const affordable = canAfford(price);
                const isMyAuction = isSameTeamId(
                  // eslint-disable-line no-unused-vars
                  player.auction_seller_team_id,
                  me?.teamId,
                );
                return (
                  <tr
                    key={player.id}
                    onClick={() => selectPlayer(player)}
                    className={`group cursor-pointer transition-colors rounded-sm ${
                      isSelected
                        ? "bg-primary/10 ring-1 ring-primary/30"
                        : "hover:bg-surface-bright/20"
                    }`}
                  >
                    {/* Player name + nationality */}
                    <td className="py-2.5 px-3 first:rounded-l-sm">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="text-sm leading-none shrink-0"
                          title={player.nationality}
                        >
                          {player.nationality || ""}
                        </span>
                        <div className="min-w-0">
                          <p className="font-headline font-bold text-on-surface text-xs leading-tight truncate">
                            <PlayerLink playerId={player.id}>
                              {player.name}
                            </PlayerLink>
                            {!!player.is_star &&
                              (player.position === "MED" ||
                                player.position === "ATA") && (
                                <span
                                  className="ml-1 text-amber-400 text-[10px]"
                                  title="Craque"
                                >
                                  ★
                                </span>
                              )}
                          </p>
                          <p className="text-[10px] text-zinc-500 truncate">
                            {player.team_name || "Sem clube"}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Position */}
                    <td className="py-2.5 px-3">
                      <PosBadge pos={player.position} />
                    </td>

                    {/* Quality */}
                    <td className="py-2.5 px-3 text-center">
                      <span className="font-headline font-black text-base text-primary tabular-nums">
                        {player.skill}
                      </span>
                    </td>

                    {/* Aggressiveness */}
                    <td className="py-2.5 px-3 text-center hidden sm:table-cell">
                      <AggBadge value={player.aggressiveness} />
                    </td>

                    {/* Goals */}
                    <td className="py-2.5 px-3 text-center hidden md:table-cell">
                      <span className="font-black text-emerald-400 text-xs tabular-nums">
                        {getPlayerStat(player, ["goals"])}
                      </span>
                      <span className="text-zinc-600 text-[10px] font-normal ml-0.5">
                        ({getPlayerStat(player, ["career_goals"])})
                      </span>
                    </td>

                    {/* Price */}
                    <td className="py-2.5 px-3">
                      <span
                        className={`font-mono text-xs font-bold tabular-nums ${affordable ? "text-zinc-200" : "text-zinc-600"}`}
                      >
                        {fmt(price)}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="py-2.5 px-3">
                      <StatusBadge status={player.transfer_status} />
                    </td>

                    {/* Action chevron */}
                    <td className="py-2.5 px-3 text-right last:rounded-r-sm">
                      <span
                        className={`material-symbols-outlined text-sm transition-colors ${isSelected ? "text-primary" : "text-zinc-600 group-hover:text-zinc-400"}`}
                      >
                        chevron_right
                      </span>
                    </td>
                  </tr>
                );
              })}
              {visible.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="py-16 text-center text-zinc-600 text-sm font-bold uppercase tracking-widest"
                  >
                    Nenhum jogador disponível
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Right: detail panel ─────────────────────────────────────── */}
      <aside
        className={`transition-all duration-300 bg-surface-container shrink-0 flex flex-col border-l border-outline-variant/15 overflow-y-auto hide-scrollbar ${
          selectedPlayer ? "w-80 xl:w-96" : "w-0 overflow-hidden"
        }`}
      >
        {selectedPlayer && (
          <PlayerDetailPanel
            player={selectedPlayer}
            budget={budget}
            me={me}
            isSameTeamId={isSameTeamId}
            onBuy={handleBuy}
            onBid={handleBid}
            onClose={() => setSelected(null)}
          />
        )}
      </aside>
    </div>
  );
}

/** ── Right panel sub-component ──────────────────────────────────────────── */
function PlayerDetailPanel({
  player,
  budget,
  me,
  isSameTeamId,
  onBuy,
  onBid,
  onClose,
}) {
  const price = player.marketPrice;
  const affordable = budget >= price;
  const isAuction = player.transfer_status === "auction";
  const isFixed = player.transfer_status === "fixed";
  const isMyAuction = isSameTeamId(player.auction_seller_team_id, me?.teamId);
  const isListed = isAuction || isFixed;

  const posFullName =
    {
      GR: "Guarda-Redes",
      DEF: "Defesa",
      MED: "Médio",
      ATA: "Avançado",
    }[player.position] ?? player.position;

  return (
    <>
      {/* Hero header */}
      <div className="relative bg-surface-container-lowest shrink-0">
        {/* Gradient backdrop using position colour */}
        <div className="h-36 flex items-end bg-linear-to-br from-surface-container-lowest via-surface-container to-surface-container-low relative overflow-hidden">
          {/* Ambient glow */}
          <div className="absolute inset-0 opacity-20 bg-[radial-gradient(ellipse_at_top_right,#95D4B3_0%,transparent_70%)]" />
          <button
            onClick={onClose}
            className="absolute top-3 right-3 text-zinc-500 hover:text-zinc-300 transition-colors z-10"
            aria-label="Fechar painel"
          >
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
          <div className="relative z-10 p-5 pb-4">
            {isListed && (
              <span className="text-[9px] font-black bg-primary text-on-primary px-2 py-0.5 rounded-sm uppercase tracking-widest mb-2 inline-block">
                {isAuction ? "Em Leilão" : "À Venda"}
              </span>
            )}
            {!!player.is_star &&
              (player.position === "MED" || player.position === "ATA") && (
                <span className="ml-2 text-[9px] font-black bg-amber-500/20 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-sm uppercase tracking-widest mb-2 inline-block">
                  ★ Craque
                </span>
              )}
            <h3 className="font-headline text-xl font-black tracking-tighter uppercase leading-tight text-on-surface">
              {player.name}
            </h3>
            <p className="text-tertiary font-bold text-[11px] tracking-tight mt-0.5">
              {posFullName} • {player.team_name || "Sem clube"}
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-5 space-y-5 flex-1">
        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-2">
          <StatCard label="Qualidade" value={player.skill} accent />
          <div className="bg-surface-container p-3 rounded-md">
            <p className="text-[9px] text-zinc-500 uppercase font-black tracking-widest mb-1">
              Agressividade
            </p>
            <AggBadge value={player.aggressiveness} />
          </div>
          <StatCard
            label="Golos (época)"
            value={getPlayerStat(player, ["goals"])}
            accent
          />
          <StatCard
            label="Assists (época)"
            value={getPlayerStat(player, ["assists"])}
          />
          <StatCard
            label="Vermelho(s)"
            value={getPlayerStat(player, ["red_cards"])}
          />
          <StatCard
            label="Lesão(ões)"
            value={getPlayerStat(player, ["injuries"])}
          />
        </div>

        {/* Finance info */}
        <div className="bg-surface-container-high rounded-md p-4 space-y-2">
          <h4 className="font-headline font-bold uppercase text-xs tracking-tight text-on-surface mb-3">
            Informação Financeira
          </h4>
          <div className="flex justify-between text-xs">
            <span className="text-zinc-500 font-medium">Preço de Mercado</span>
            <span className="font-black text-on-surface font-mono tabular-nums">
              {fmt(price)}
            </span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-zinc-500 font-medium">Ordenado Semanal</span>
            <span className="font-black text-on-surface font-mono tabular-nums">
              {fmt(player.contract_requested_wage || player.wage || 0)}
            </span>
          </div>
          {isAuction && player.auction_starting_price > 0 && (
            <div className="flex justify-between text-xs">
              <span className="text-zinc-500 font-medium">Lance Base</span>
              <span className="font-black text-primary font-mono tabular-nums">
                {fmt(player.auction_starting_price)}
              </span>
            </div>
          )}
          <div className="flex justify-between text-xs pt-1 border-t border-outline-variant/20">
            <span className="text-zinc-500 font-medium">Caixa Disponível</span>
            <span
              className={`font-black font-mono tabular-nums ${affordable ? "text-emerald-400" : "text-rose-400"}`}
            >
              {fmt(budget)}
            </span>
          </div>
        </div>

        {/* Career stats */}
        <div className="text-xs space-y-1">
          <p className="text-[9px] font-black text-zinc-600 uppercase tracking-widest mb-2">
            Estatísticas de Carreira
          </p>
          <div className="flex justify-between">
            <span className="text-zinc-500">Golos</span>
            <span className="font-bold text-zinc-300 tabular-nums">
              {getPlayerStat(player, ["career_goals"])}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-500">Vermelhos</span>
            <span className="font-bold text-zinc-300 tabular-nums">
              {getPlayerStat(player, ["career_reds"])}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-500">Lesões</span>
            <span className="font-bold text-zinc-300 tabular-nums">
              {getPlayerStat(player, ["career_injuries"])}
            </span>
          </div>
        </div>

        {/* Action button */}
        {isListed ? (
          isAuction ? (
            isMyAuction ? (
              <div className="py-3 text-center text-zinc-600 text-[11px] font-bold uppercase tracking-widest border border-outline-variant/20 rounded-md">
                O teu leilão
              </div>
            ) : (
              <button
                onClick={() => onBid(player)}
                disabled={!affordable}
                className="w-full py-3.5 bg-primary hover:brightness-110 disabled:opacity-30 text-on-primary font-headline font-black tracking-[0.15em] rounded-md transition-all uppercase text-xs active:scale-[0.98]"
              >
                {affordable ? "Licitar no Leilão" : "Saldo Insuficiente"}
              </button>
            )
          ) : (
            <button
              onClick={() => onBuy(player)}
              disabled={!affordable}
              className="w-full py-3.5 bg-primary hover:brightness-110 disabled:opacity-30 text-on-primary font-headline font-black tracking-[0.15em] rounded-md transition-all uppercase text-xs active:scale-[0.98]"
            >
              {affordable ? "Comprar Jogador" : "Saldo Insuficiente"}
            </button>
          )
        ) : (
          <div className="py-3 text-center text-zinc-600 text-[11px] font-bold uppercase tracking-widest border border-outline-variant/20 rounded-md">
            Não disponível para transferência
          </div>
        )}
      </div>
    </>
  );
}
