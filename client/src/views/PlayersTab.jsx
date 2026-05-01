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
 *   mySquad: object[],
 *   annotatedSquad: object[],
 *   totalWeeklyWage: number,
 *   currentBudget: number,
 *   teamInfo: object|null,
 *   matchweekCount: number,
 *   isPlayingMatch: boolean,
 *   showHalftimePanel: boolean,
 *   renewPlayerContract: (player: object) => void,
 *   listPlayerAuction: (player: object) => void,
 *   listPlayerFixed: (player: object) => void,
 *   removeFromTransferList: (player: object) => void,
 * }} props
 */
export function PlayersTab({
  mySquad,
  annotatedSquad,
  totalWeeklyWage,
  currentBudget,
  teamInfo,
  matchweekCount,
  isPlayingMatch,
  showHalftimePanel,
  renewPlayerContract,
  listPlayerAuction,
  listPlayerFixed,
  removeFromTransferList,
}) {
  const wageByPos = { GR: 0, DEF: 0, MED: 0, ATA: 0 };
  mySquad.forEach((p) => {
    if (wageByPos[p.position] !== undefined)
      wageByPos[p.position] += p.wage || 0;
  });
  const maxPosWage = Math.max(...Object.values(wageByPos), 1);
  const posColorHex = {
    GR: "#eab308",
    DEF: "#3b82f6",
    MED: "#10b981",
    ATA: "#f43f5e",
  };

  return (
    <div className="space-y-4">
      {/* ── Summary widgets ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-surface-container-low p-5 rounded-md flex flex-col justify-between h-28 border-l-4 border-primary">
          <span className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
            Massa Salarial Semanal
          </span>
          <span className="text-3xl font-black font-headline tracking-tighter text-on-surface">
            {formatCurrency(totalWeeklyWage)}
          </span>
        </div>
        <div
          className={`bg-surface-container-low p-5 rounded-md flex flex-col justify-between h-28 border-l-4 ${currentBudget >= 0 ? "border-tertiary" : "border-error"}`}
        >
          <span className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
            Orçamento Disponível
          </span>
          <span
            className={`text-3xl font-black font-headline tracking-tighter ${currentBudget >= 0 ? "text-tertiary" : "text-error"}`}
          >
            {formatCurrency(currentBudget)}
          </span>
        </div>
        {(() => {
          const morale = teamInfo?.morale ?? 75;
          const moraleColor =
            morale >= 70
              ? "text-emerald-400"
              : morale >= 40
                ? "text-tertiary"
                : "text-error";
          const moraleBorder =
            morale >= 70
              ? "border-emerald-500"
              : morale >= 40
                ? "border-tertiary"
                : "border-error";
          const moraleLabel =
            morale >= 70 ? "Boa" : morale >= 40 ? "Razoável" : "Má";
          return (
            <div
              className={`bg-surface-container-low p-5 rounded-md flex flex-col justify-between h-28 border-l-4 ${moraleBorder}`}
            >
              <span className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                Moral da Equipa
              </span>
              <div className="flex items-baseline gap-2">
                <span
                  className={`text-3xl font-black font-headline tracking-tighter ${moraleColor}`}
                >
                  {morale}%
                </span>
                <span className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">
                  {moraleLabel}
                </span>
              </div>
            </div>
          );
        })()}
      </div>

      {/* ── Contract table ── */}
      <div className="bg-surface-container rounded-md overflow-hidden">
        <div className="px-5 py-4 flex items-center justify-between bg-surface-container-high/50">
          <h2 className="text-base font-black font-headline tracking-tight text-tertiary uppercase">
            Gestão Contratual do Plantel
          </h2>
          <span className="text-[10px] text-on-surface-variant font-black uppercase tracking-widest">
            {mySquad.length} jogadores
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-260 text-left border-separate border-spacing-y-0.5 px-2 pb-2">
            <thead>
              <tr className="text-[10px] uppercase tracking-widest text-on-surface-variant font-black">
                <th className="py-3 px-3 text-center w-14">Pos</th>
                <th className="py-3 px-3">Jogador</th>
                <th className="py-3 px-3 text-center w-12">País</th>
                <th className="py-3 px-3 text-center w-16">Qual</th>
                <th className="py-3 px-3 text-center">Agr</th>
                <th className="py-3 px-3 text-center">Resist</th>
                <th className="py-3 px-3 text-center">Forma</th>
                <th className="py-3 px-3 text-center">Ordenado/sem</th>
                <th className="py-3 px-3 text-center hidden sm:table-cell">
                  Valor Estimado
                </th>
                <th className="py-3 px-3 text-center">Jog</th>
                <th className="py-3 px-3 text-center">Gol</th>
                <th className="py-3 px-3 text-center">Verm</th>
                <th className="py-3 px-3 text-center">Les</th>
                <th className="py-3 px-3 text-right hidden">Ações</th>
              </tr>
            </thead>
            <tbody className="text-sm font-medium">
              {annotatedSquad.map((player) => {
                const canAct =
                  !player.isJunior &&
                  player.signed_season !== Math.ceil((matchweekCount + 1) / 14);
                const alreadyAuctionedThisWeek =
                  matchweekCount > 0 &&
                  (player.last_auctioned_matchweek || 0) > matchweekCount;
                return (
                  <tr
                    key={player.id}
                    className={`transition-all ${player.isUnavailable ? "bg-red-950/40 hover:bg-red-900/30 opacity-70" : "bg-surface-container-low hover:bg-primary-container/15"}`}
                  >
                    {/* Pos */}
                    <td className="py-2.5 px-3 text-center">
                      <span
                        className={`px-2 py-0.5 bg-surface-bright rounded-sm text-[10px] font-black border-l-2 ${POSITION_BORDER_CLASS[player.position] || "border-zinc-500"} ${POSITION_TEXT_CLASS[player.position] || "text-zinc-300"}`}
                      >
                        {POSITION_LABEL_MAP[player.position] || player.position}
                      </span>
                    </td>
                    {/* Jogador */}
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-1.5">
                        <span className="font-black font-headline text-sm tracking-tight uppercase text-on-surface">
                          <PlayerLink playerId={player.id}>
                            {player.name}
                          </PlayerLink>
                        </span>
                        {player.isJunior && (
                          <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                            🎓 Juniores
                          </span>
                        )}
                        {!!player.is_star &&
                          (player.position === "MED" ||
                            player.position === "ATA") && (
                            <span
                              className="text-amber-400 font-black text-xs"
                              title="Craque"
                            >
                              ★
                            </span>
                          )}
                        {player.transfer_status &&
                          player.transfer_status !== "none" &&
                          (() => {
                            const seasonEnd =
                              Math.ceil(
                                Math.max(1, matchweekCount) / 14,
                              ) * 14;
                            const isContractRenewed =
                              player.contract_until_matchweek === seasonEnd;
                            return isContractRenewed ? (
                              <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">
                                Contrato renovado
                              </span>
                            ) : (
                              <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                À venda
                              </span>
                            );
                          })()}
                        {player.isUnavailable &&
                          (() => {
                            const susp =
                              player.suspension_until_matchweek || 0;
                            const inj = player.injury_until_matchweek || 0;
                            const cooldown =
                              player.transfer_cooldown_until_matchweek || 0;
                            const isSuspended = susp > matchweekCount;
                            const isInjured = inj > matchweekCount;
                            const isCooldown =
                              !isSuspended &&
                              !isInjured &&
                              cooldown >= matchweekCount;
                            if (isCooldown) {
                              return (
                                <span
                                  className="text-red-400 text-xs font-bold"
                                  title="Em viagem — disponível na próxima jornada"
                                >
                                  ✈️ (1)
                                </span>
                              );
                            }
                            const gamesLeft = isSuspended
                              ? susp - matchweekCount
                              : inj - matchweekCount;
                            return (
                              <span
                                className="text-red-400 text-xs font-bold"
                                title={`Indisponível até jornada ${Math.max(inj, susp) + 1}`}
                              >
                                {`${isSuspended ? "🟥" : "🩹"} (${gamesLeft})`}
                              </span>
                            );
                          })()}
                      </div>
                    </td>
                    {/* País */}
                    <td
                      className="py-2.5 px-3 text-center text-on-surface-variant text-sm"
                      title={
                        FLAG_TO_COUNTRY[player.nationality] ||
                        player.nationality
                      }
                    >
                      {player.nationality}
                    </td>
                    {/* Qual */}
                    <td className="py-2.5 px-3 text-center">
                      {player.prev_skill != null &&
                        player.prev_skill !== player.skill && (
                          <span
                            className={`mr-1 text-[10px] font-black ${player.skill > player.prev_skill ? "text-emerald-400" : "text-red-400"}`}
                          >
                            {player.skill > player.prev_skill ? "▲" : "▼"}
                          </span>
                        )}
                      <span className="inline-flex items-center justify-center bg-surface text-on-surface px-2 py-0.5 rounded-sm text-sm border border-outline-variant/30 font-headline font-black tabular-nums">
                        {player.skill}
                      </span>
                    </td>
                    {/* Agressividade */}
                    <td className="py-2.5 px-3 text-center">
                      <AggBadge value={player.aggressiveness} />
                    </td>
                    {/* Resistência */}
                    <td className="py-2.5 px-3 text-center">
                      {player.resistance != null && (
                        <span className="text-[12px] text-cyan-400/70">
                          🛡️ {player.resistance}
                        </span>
                      )}
                    </td>
                    {/* Forma */}
                    <td className="py-2.5 px-3 text-center">
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
                    {/* Ordenado */}
                    <td className="py-2.5 px-3 text-center font-mono text-on-surface-variant text-xs">
                      {formatCurrency(player.wage || 0)}
                      <span className="text-[10px] opacity-40 ml-0.5">/sem</span>
                    </td>
                    {/* Valor de Mercado */}
                    <td className="py-2.5 px-3 text-center font-mono text-emerald-400 text-xs hidden sm:table-cell">
                      {formatCurrency(player.value || 0)}
                    </td>
                    {/* Jogos */}
                    <td className="py-2.5 px-3 text-center font-black text-zinc-300 text-xs">
                      {getPlayerStat(player, ["games_played"])}{" "}
                      <span className="text-zinc-600 font-normal">
                        ({getPlayerStat(player, ["career_games"])})
                      </span>
                    </td>
                    {/* Golos */}
                    <td className="py-2.5 px-3 text-center font-black text-emerald-400 text-xs">
                      {getPlayerStat(player, ["goals"])}{" "}
                      <span className="text-zinc-600 font-normal">
                        ({getPlayerStat(player, ["career_goals"])})
                      </span>
                    </td>
                    {/* Vermelhos */}
                    <td className="py-2.5 px-3 text-center font-black text-red-400 text-xs">
                      {getPlayerStat(player, ["red_cards"])}{" "}
                      <span className="text-zinc-600 font-normal">
                        ({getPlayerStat(player, ["career_reds"])})
                      </span>
                    </td>
                    {/* Lesões */}
                    <td className="py-2.5 px-3 text-center font-black text-orange-400 text-xs">
                      {getPlayerStat(player, ["injuries"])}{" "}
                      <span className="text-zinc-600 font-normal">
                        ({getPlayerStat(player, ["career_injuries"])})
                      </span>
                    </td>
                    {/* Ações */}
                    <td className="py-2.5 px-3 text-right hidden">
                      {canAct ? (
                        <div className="flex justify-end gap-1.5 flex-wrap">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              renewPlayerContract(player);
                            }}
                            className="px-3 py-1.5 bg-primary text-on-primary hover:brightness-110 text-[10px] uppercase font-black rounded-sm transition-all"
                          >
                            Renovar
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              listPlayerAuction(player);
                            }}
                            disabled={
                              isPlayingMatch ||
                              showHalftimePanel ||
                              alreadyAuctionedThisWeek
                            }
                            title={
                              isPlayingMatch || showHalftimePanel
                                ? "Disponível após as partidas"
                                : alreadyAuctionedThisWeek
                                  ? "Já foi a leilão nesta jornada"
                                  : "Vender em Leilão"
                            }
                            className="px-3 py-1.5 bg-secondary-container hover:bg-surface-bright disabled:opacity-30 text-on-surface text-[10px] uppercase font-black rounded-sm transition-all"
                          >
                            Leilão
                          </button>
                          {player.transfer_status === "fixed" ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                removeFromTransferList(player);
                              }}
                              title="Retirar da lista de transferências"
                              className="px-3 py-1.5 bg-error-container text-on-error-container hover:brightness-110 text-[10px] uppercase font-black rounded-sm transition-all"
                            >
                              ✕ Retirar
                            </button>
                          ) : (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                listPlayerFixed(player);
                              }}
                              title="Listar no Mercado"
                              className="px-3 py-1.5 bg-secondary-container hover:bg-surface-bright text-on-surface text-[10px] uppercase font-black rounded-sm transition-all"
                            >
                              Listar
                            </button>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-zinc-600 uppercase">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Wage distribution chart ── */}
      <div className="bg-surface-container-low p-5 rounded-md">
        <h3 className="text-[10px] font-black uppercase tracking-widest text-primary mb-4">
          Distribuição Salarial por Posição
        </h3>
        <div className="flex items-end gap-3" style={{ height: "80px" }}>
          {["GR", "DEF", "MED", "ATA"].map((pos) => {
            const pct =
              maxPosWage > 0 ? (wageByPos[pos] / maxPosWage) * 100 : 0;
            return (
              <div
                key={pos}
                className="flex-1 flex flex-col items-center gap-1 h-full justify-end"
              >
                <div
                  className="w-full bg-primary/10 rounded-t-sm relative"
                  style={{ height: "60px" }}
                >
                  <div
                    className="absolute inset-x-0 bottom-0 rounded-t-sm transition-all duration-700"
                    style={{
                      height: `${pct}%`,
                      backgroundColor: posColorHex[pos],
                      opacity: 0.75,
                    }}
                  />
                </div>
                <span
                  className={`text-[10px] font-black uppercase ${POSITION_TEXT_CLASS[pos] || "text-zinc-400"}`}
                >
                  {pos}
                </span>
                <span className="text-[9px] text-on-surface-variant tabular-nums">
                  {formatCurrency(wageByPos[pos])}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
