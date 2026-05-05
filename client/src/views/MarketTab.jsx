import { AggBadge } from "../components/shared/AggBadge.jsx";
import { PlayerLink } from "../components/shared/PlayerLink.jsx";
import {
  POSITION_TEXT_CLASS,
  POSITION_BORDER_CLASS,
  POSITION_LABEL_MAP,
  FLAG_TO_COUNTRY,
} from "../constants/index.js";
import { formatCurrency } from "../utils/formatters.js";
import { getPlayerStat } from "../utils/playerHelpers.js";

/**
 * @param {{
 *   teamInfo: object|null,
 *   filteredMarketPlayers: object[],
 *   marketPositionFilter: string,
 *   setMarketPositionFilter: (v: string) => void,
 *   marketSort: string,
 *   setMarketSort: (v: string) => void,
 * }} props
 */
export function MarketTab({
  teamInfo,
  filteredMarketPlayers,
  marketPositionFilter,
  setMarketPositionFilter,
  marketSort,
  setMarketSort,
  matchweekCount = 0,
}) {
  return (
    <div className="bg-surface-container rounded-lg shadow-sm overflow-hidden">
      <div className="border-b border-outline-variant/20 bg-surface/40 p-4 md:p-5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-[10px] uppercase tracking-widest text-zinc-500 font-black mb-2">
              Posição
            </label>
            <select
              className="w-full bg-surface border border-outline-variant rounded-sm px-3 py-3 text-sm font-bold text-on-surface focus:ring-2 focus:ring-primary"
              value={marketPositionFilter}
              onChange={(e) => setMarketPositionFilter(e.target.value)}
            >
              <option value="all">Todas</option>
              <option value="GR">Guarda-Redes</option>
              <option value="DEF">Defesa</option>
              <option value="MED">Médio</option>
              <option value="ATA">Avançado</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-widest text-zinc-500 font-black mb-2">
              Ordenar por
            </label>
            <select
              className="w-full bg-surface border border-outline-variant rounded-sm px-3 py-3 text-sm font-bold text-on-surface focus:ring-2 focus:ring-primary"
              value={marketSort}
              onChange={(e) => setMarketSort(e.target.value)}
            >
              <option value="quality-desc">Qualidade (maior primeiro)</option>
              <option value="quality-asc">Qualidade (menor primeiro)</option>
              <option value="price-asc">Preço (mais barato)</option>
              <option value="price-desc">Preço (mais caro)</option>
            </select>
          </div>
          <div className="flex flex-col justify-end gap-1">
            <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-black">
              Caixa disponível
            </div>
            <div className="text-sm font-black text-emerald-400">
              €{(teamInfo?.budget ?? 0).toLocaleString("pt-PT")}
            </div>
            <div className="text-xs text-zinc-500">
              {filteredMarketPlayers.length} jogadores
            </div>
          </div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-190 text-left text-xs md:text-sm">
          <thead>
            <tr className="bg-surface/50 text-on-surface-variant uppercase text-[10px] md:text-[11px] border-b border-outline-variant/20">
              <th className="px-4 py-2.5 font-black">Pos</th>
              <th className="px-4 py-2.5 font-black"></th>
              <th className="px-4 py-2.5 font-black">Nome</th>
              <th className="px-4 py-2.5 font-black">Clube</th>
              <th className="px-4 py-2.5 font-black text-center">Qual</th>
              <th className="px-4 py-2.5 font-black text-center">Agr.</th>
              <th className="px-4 py-2.5 font-black text-center">Resist</th>
              <th className="px-4 py-2.5 font-black text-center">Forma</th>
              <th className="px-4 py-2.5 font-black text-center">Golos</th>
              <th className="px-4 py-2.5 font-black text-center">Vermelhos</th>
              <th className="px-4 py-2.5 font-black text-center">Lesões</th>
              <th className="px-4 py-2.5 font-black text-right">Preço</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/10 font-medium">
            {filteredMarketPlayers.map((player) => {
              const isListed =
                player.transfer_status && player.transfer_status !== "none";
              const price = player.marketPrice;
              return (
                <tr
                  key={player.id}
                  className="hover:bg-surface-bright/20 transition-colors"
                >
                  <td className="px-4 py-2 text-center">
                    <span
                      className={`px-2 py-0.5 bg-surface-bright rounded-sm text-[10px] font-black border-l-2 ${POSITION_BORDER_CLASS[player.position] || "border-zinc-500"} ${POSITION_TEXT_CLASS[player.position] || "text-zinc-300"}`}
                    >
                      {POSITION_LABEL_MAP[player.position] || player.position}
                    </span>
                  </td>
                  <td
                    className="px-4 py-2 text-center text-lg"
                    title={
                      FLAG_TO_COUNTRY[player.nationality] ||
                      player.nationality ||
                      "—"
                    }
                  >
                    {player.nationality || "—"}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-white text-sm leading-tight">
                        <PlayerLink playerId={player.id}>
                          {player.name}
                        </PlayerLink>
                        {!!player.is_star &&
                          (player.position === "MED" ||
                            player.position === "ATA") && (
                            <span
                              className="ml-1 text-amber-400 font-black"
                              title="Craque"
                            >
                              *
                            </span>
                          )}
                      </p>
                      {isListed && (
                        <span
                          className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${player.transfer_status === "auction" ? "bg-primary text-on-primary" : "bg-sky-500 text-zinc-950"}`}
                        >
                          {player.transfer_status === "auction"
                            ? "Leilão"
                            : "Lista"}
                        </span>
                      )}
                      {(player.suspension_until_matchweek ?? 0) > matchweekCount && (
                        <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-error-container/60 text-error border border-error/20 tracking-widest whitespace-nowrap">
                          🟥 {player.suspension_until_matchweek - matchweekCount + 1}J
                        </span>
                      )}
                      {(player.injury_until_matchweek ?? 0) > matchweekCount && (
                        <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-amber-900/30 text-amber-400 border border-amber-700/30 tracking-widest whitespace-nowrap">
                          🩹 {player.injury_until_matchweek - matchweekCount + 1}J
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2 font-bold text-zinc-400">
                    {player.team_name || "Sem clube"}
                  </td>
                  <td className="px-4 py-2 text-center">
                    <span className="bg-surface text-on-surface font-headline font-black px-2 py-1 rounded-sm text-sm border border-outline-variant/30 tabular-nums">
                      {player.skill}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-center">
                    <AggBadge value={player.aggressiveness} />
                  </td>
                  <td className="px-4 py-2 text-center">
                    {player.resistance != null && (
                      <span className="text-[12px] text-cyan-400/70">
                        🛡️ {player.resistance}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-center">
                    {(() => {
                      const form = player.form || 100;
                      const formColor =
                        form >= 115
                          ? "text-emerald-400"
                          : form <= 85
                            ? "text-rose-400"
                            : "text-on-surface-variant/30";
                      const formArrow =
                        form >= 115 ? "💪" : form <= 85 ? "😩" : "👍";
                      return (
                        <span className={`text-[10px] font-bold ${formColor}`}>
                          {formArrow}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="px-4 py-2 text-center font-black text-emerald-400">
                    {getPlayerStat(player, ["goals"])}{" "}
                    <span className="text-zinc-500 text-xs font-normal">
                      ({getPlayerStat(player, ["career_goals"])})
                    </span>
                  </td>
                  <td className="px-4 py-2 text-center font-black text-red-400">
                    {getPlayerStat(player, ["red_cards"])}{" "}
                    <span className="text-zinc-500 text-xs font-normal">
                      ({getPlayerStat(player, ["career_reds"])})
                    </span>
                  </td>
                  <td className="px-4 py-2 text-center font-black text-orange-400">
                    {getPlayerStat(player, ["injuries"])}{" "}
                    <span className="text-zinc-500 text-xs font-normal">
                      ({getPlayerStat(player, ["career_injuries"])})
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-zinc-300 text-sm md:text-base">
                    {formatCurrency(price)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
