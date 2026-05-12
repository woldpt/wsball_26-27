import { formatCurrency } from "../../utils/formatters.js";
import { AggBadge } from "../shared/AggBadge.jsx";
import { PlayerAvatar } from "../shared/PlayerAvatar.jsx";
import { aggLabel } from "../../utils/playerHelpers.js";

// Position config
const POS_LABEL = { GR: "GR", DEF: "DEF", MED: "MED", ATA: "ATA" };
const POS_FULL = {
  GR: "Guarda-redes",
  DEF: "Defesa",
  MED: "Médio",
  ATA: "Avançado",
};
const POS_BORDER = {
  GR: "border-yellow-500",
  DEF: "border-blue-500",
  MED: "border-emerald-500",
  ATA: "border-rose-500",
};
const POS_TEXT = {
  GR: "text-yellow-400",
  DEF: "text-blue-400",
  MED: "text-emerald-400",
  ATA: "text-rose-400",
};
const POS_BAR = {
  GR: "#eab308",
  DEF: "#3b82f6",
  MED: "#10b981",
  ATA: "#f43f5e",
};

function SkillBar({ label, value, maxValue = 50, color }) {
  const pct = Math.min(100, Math.round((value / maxValue) * 100));
  return (
    <div>
      <div className="flex justify-between items-end mb-1.5">
        <span className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
          {label}
        </span>
        <span className="font-black font-headline text-base" style={{ color }}>
          {value}
        </span>
      </div>
      <div className="h-1 w-full bg-surface-container-highest rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, backgroundColor: color, opacity: 0.85 }}
        />
      </div>
    </div>
  );
}

function StatCard({ label, value, color = "text-on-surface" }) {
  return (
    <div className="bg-surface-container rounded-lg p-3 flex flex-col items-center gap-1">
      <span className={`font-black font-headline text-xl ${color}`}>
        {value}
      </span>
      <span className="text-[9px] font-black uppercase tracking-widest text-on-surface-variant text-center leading-tight">
        {label}
      </span>
    </div>
  );
}

/**
 * @param {{
 *   playerHistoryModal: object|null,
 *   setPlayerHistoryModal: function,
 *   myTeamId?: number|string,
 *   matchweekCount?: number,
 *   isPlayingMatch?: boolean,
 *   showHalftimePanel?: boolean,
 *   renewPlayerContract?: function,
 *   listPlayerAuction?: function,
 *   listPlayerFixed?: function,
 *   removeFromTransferList?: function,
 *   buyPlayer?: function,
 *   openAuctionBid?: function,
 *   myBudget?: number,
 *   setGameDialog?: function,
 * }} props
 */
export function PlayerHistoryModal({
  playerHistoryModal,
  setPlayerHistoryModal,
  myTeamId,
  matchweekCount = 0,
  isPlayingMatch = false,
  showHalftimePanel = false,
  renewPlayerContract,
  listPlayerAuction,
  listPlayerFixed,
  removeFromTransferList,
  buyPlayer,
  openAuctionBid,
  myBudget = 0,
  setGameDialog,
}) {
  if (!playerHistoryModal) return null;

  const { player, transfers: rawTransfers } = playerHistoryModal;
  const transfers = rawTransfers || [];
  if (!player) return null;

  const pos = player.position;
  const barColor = POS_BAR[pos] || "#95d4b3";
  const isStar = player.is_star === 1;
  const skill = player.skill ?? 0;

  // Aggressiveness
  const aggKey = aggLabel(player.aggressiveness);

  // Season stats
  const sGames = player.games_played ?? 0;
  const sGoals = player.goals ?? 0;
  const sReds = player.red_cards ?? 0;
  const sInjuries = player.injuries ?? 0;

  // Career totals (prior seasons + current)
  const cGames = (player.career_games ?? 0) + sGames;
  const cGoals = (player.career_goals ?? 0) + sGoals;
  const cReds = (player.career_reds ?? 0) + sReds;
  const cInjuries = (player.career_injuries ?? 0) + sInjuries;

  // Contract management — only shown for own team
  const isMyPlayer =
    myTeamId != null &&
    player.team_id != null &&
    Number(myTeamId) === Number(player.team_id);
  const currentSeason = Math.ceil((matchweekCount + 1) / 14);
  const canAct = isMyPlayer && player.signed_season !== currentSeason;
  const matchInProgress = isPlayingMatch || showHalftimePanel;
  const alreadyAuctionedThisWeek =
    matchweekCount > 0 &&
    (player.last_auctioned_matchweek || 0) > matchweekCount;

  // Market purchase — only when player belongs to *another* team and is listed
  const isListedInMarket =
    !isMyPlayer &&
    (player.transfer_status === "auction" ||
      player.transfer_status === "fixed");
  const marketPrice = player.marketPrice ?? player.value ?? 0;
  const canAfford = myBudget >= marketPrice;

  // Availability badge
  let availBadge = null;
  if ((player.suspension_until_matchweek ?? 0) > matchweekCount) {
    const jLeft = player.suspension_until_matchweek - matchweekCount + 1;
    availBadge = (
      <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-sm bg-error-container/50 text-error border border-error/20 tracking-widest">
        🟥 Suspenso · {jLeft}J
      </span>
    );
  } else if ((player.injury_until_matchweek ?? 0) > matchweekCount) {
    const jLeft = player.injury_until_matchweek - matchweekCount + 1;
    availBadge = (
      <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-sm bg-error-container/30 text-error border border-error/20 tracking-widest">
        🩹 Lesionado · {jLeft}J
      </span>
    );
  }

  return (
    <div
      className="fixed inset-0 z-200 flex items-center justify-center bg-black/75 p-3 sm:p-6"
      onClick={() => setPlayerHistoryModal(null)}
    >
      <div
        className="bg-surface-container-low border border-outline-variant/20 rounded-xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col"
        style={{ maxHeight: "90vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── IDENTITY HEADER ── */}
        <div className="relative bg-surface-container overflow-hidden">
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: `radial-gradient(ellipse at top left, ${barColor}18 0%, transparent 70%)`,
            }}
          />
          <div className="relative flex items-start gap-3 sm:gap-4 px-4 sm:px-6 pt-4 sm:pt-6 pb-3 sm:pb-5">
            <PlayerAvatar seed={player.id} position={pos} teamColor={player.team_color_primary || player.color_primary || null} size="lg" />
            <div className="shrink-0 mt-0.5 sm:mt-1">
              <div
                className={`px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-sm bg-surface-bright border-l-2 ${POS_BORDER[pos] || "border-zinc-500"} ${POS_TEXT[pos] || "text-zinc-300"} text-[10px] sm:text-xs font-black uppercase tracking-wider`}
              >
                {POS_LABEL[pos] || pos}
              </div>
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                <h2 className="font-black font-headline text-lg sm:text-2xl tracking-tight text-on-surface uppercase leading-none">
                  {player.name}
                </h2>
                {isStar && (
                  <span className="text-amber-400 text-sm" title="Craque">
                    ★
                  </span>
                )}
                {availBadge}
              </div>
              <p className="text-on-surface-variant text-xs font-medium mt-1 tracking-wide">
                {POS_FULL[pos] || pos}
                {player.nationality ? ` · ${player.nationality}` : ""}
              </p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-on-surface-variant text-xs">Clube:</span>
                <span className="font-bold text-tertiary text-xs">
                  {player.team_name || "Sem clube"}
                </span>
                {aggKey && (
                  <>
                    <span className="text-outline-variant/40 text-xs">·</span>
                    <AggBadge value={player.aggressiveness} />
                  </>
                )}
                {player.resistance != null && (
                  <>
                    <span className="text-outline-variant/40 text-xs">·</span>
                    <span className="text-[12px] text-cyan-400/70 font-black">
                      🛡️ {player.resistance}
                    </span>
                  </>
                )}
                {player.form != null && (
                  <>
                    <span className="text-outline-variant/40 text-xs">·</span>
                    <span
                      className={`text-[9px] font-black ${
                        (player.form || 100) >= 115
                          ? "text-emerald-400"
                          : (player.form || 100) <= 85
                            ? "text-rose-400"
                            : "text-on-surface-variant/30"
                      }`}
                    >
                      {(player.form || 100) >= 115
                        ? "💪"
                        : (player.form || 100) <= 85
                          ? "😩"
                          : "👍"}{" "}
                    </span>
                  </>
                )}
              </div>
            </div>

            <button
              type="button"
              className="shrink-0 text-on-surface-variant hover:text-on-surface text-lg leading-none transition-colors"
              onClick={() => setPlayerHistoryModal(null)}
            >
              ✕
            </button>
          </div>
        </div>

        {/* ── SCROLLABLE BODY ── */}
        <div className="overflow-y-auto flex-1">
          {/* ── 2-COLUMN LAYOUT (md+) ── */}
          <div className="md:grid md:grid-cols-2 md:divide-x md:divide-outline-variant/10">
            {/* LEFT COLUMN: Financial + Contract */}
            <div className="flex flex-col">
              {/* Value / Wage */}
              <div className="px-6 py-5 border-b border-outline-variant/10">
                <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-4">
                  Financeiro
                </p>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                      Valor de mercado
                    </p>
                    <p className="font-black font-headline text-lg tracking-tighter text-tertiary truncate">
                      {formatCurrency(player.value || 0)}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                      Ordenado/sem
                    </p>
                    <p className="font-bold font-mono text-sm text-on-surface truncate">
                      {formatCurrency(player.wage || 0)}
                    </p>
                  </div>
                </div>
                <SkillBar label="Qualidade" value={skill} color={barColor} />
              </div>

              {/* Market purchase — for players from other teams listed in the market */}
              {isListedInMarket && (
                <div className="px-6 py-5 border-b border-outline-variant/10">
                  <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-3">
                    Mercado
                  </p>
                  <div className="flex justify-between text-xs mb-3">
                    <span className="text-on-surface-variant font-medium">
                      Preço
                    </span>
                    <span className="font-black text-on-surface font-mono tabular-nums">
                      {formatCurrency(marketPrice)}
                    </span>
                  </div>
                  {player.transfer_status === "auction" ? (
                    <button
                      onClick={() => {
                        openAuctionBid?.(player);
                        setPlayerHistoryModal(null);
                      }}
                      disabled={!canAfford}
                      className="w-full px-4 py-2.5 bg-primary text-on-primary hover:brightness-110 disabled:opacity-30 text-[10px] uppercase font-black rounded-sm transition-all"
                    >
                      {canAfford
                        ? "🔨 Licitar no Leilão"
                        : "Saldo Insuficiente"}
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        if (!canAfford) return;
                        setGameDialog?.({
                          mode: "confirm",
                          title: `Comprar ${player.name}`,
                          description: `${player.position} · Qualidade ${player.skill} · Preço: ${formatCurrency(marketPrice)}`,
                          confirmLabel: "Confirmar Compra",
                          onConfirm: () => buyPlayer?.(player.id),
                          onCancel: () => {},
                        });
                        setPlayerHistoryModal(null);
                      }}
                      disabled={!canAfford}
                      className="w-full px-4 py-2.5 bg-primary text-on-primary hover:brightness-110 disabled:opacity-30 text-[10px] uppercase font-black rounded-sm transition-all"
                    >
                      {canAfford ? "💰 Comprar Jogador" : "Saldo Insuficiente"}
                    </button>
                  )}
                </div>
              )}

              {/* Contract management */}
              {isMyPlayer && (
                <div className="px-6 py-5 border-b border-outline-variant/10 md:border-b-0 flex-1">
                  <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-3">
                    Gestão Contratual
                  </p>
                  {canAct ? (
                    <div className="flex flex-col gap-2">
                      <button
                        onClick={() => {
                          renewPlayerContract?.(player);
                          setPlayerHistoryModal(null);
                        }}
                        className="w-full px-4 py-2.5 bg-primary text-on-primary hover:brightness-110 text-[10px] uppercase font-black rounded-sm transition-all"
                      >
                        📝 Renovar Contrato
                      </button>
                      <button
                        onClick={() => {
                          listPlayerAuction?.(player);
                          setPlayerHistoryModal(null);
                        }}
                        disabled={matchInProgress || alreadyAuctionedThisWeek}
                        title={
                          matchInProgress
                            ? "Disponível após as partidas"
                            : alreadyAuctionedThisWeek
                              ? "Já foi a leilão nesta jornada"
                              : "Vender em Leilão"
                        }
                        className="w-full px-4 py-2.5 bg-secondary-container hover:bg-surface-bright disabled:opacity-30 text-on-surface text-[10px] uppercase font-black rounded-sm transition-all"
                      >
                        🔨 Vender em Leilão
                      </button>
                      {player.transfer_status === "fixed" ? (
                        <button
                          onClick={() => {
                            removeFromTransferList?.(player);
                            setPlayerHistoryModal(null);
                          }}
                          className="w-full px-4 py-2.5 bg-error-container text-on-error-container hover:brightness-110 text-[10px] uppercase font-black rounded-sm transition-all"
                        >
                          ✕ Retirar da Lista
                        </button>
                      ) : (
                        <button
                          onClick={() => {
                            listPlayerFixed?.(player);
                            setPlayerHistoryModal(null);
                          }}
                          className="w-full px-4 py-2.5 bg-secondary-container hover:bg-surface-bright text-on-surface text-[10px] uppercase font-black rounded-sm transition-all"
                        >
                          🏷️ Listar para Transferência
                        </button>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-on-surface-variant italic">
                      Gestão contratual indisponível — jogador contratado nesta
                      época.
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* RIGHT COLUMN: Stats */}
            <div className="flex flex-col">
              {/* Season stats */}
              <div className="px-6 py-5 border-b border-outline-variant/10">
                <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-4">
                  Época Actual
                </p>
                <div className="grid grid-cols-4 gap-2">
                  <StatCard label="Jogos" value={sGames} />
                  <StatCard
                    label="Golos"
                    value={sGoals}
                    color="text-tertiary"
                  />
                  <StatCard
                    label="Vermelhos"
                    value={sReds}
                    color={sReds > 0 ? "text-error" : "text-on-surface"}
                  />
                  <StatCard
                    label="Lesões"
                    value={sInjuries}
                    color={sInjuries > 0 ? "text-amber-400" : "text-on-surface"}
                  />
                </div>
              </div>

              {/* Career stats */}
              <div className="px-6 py-5">
                <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-4">
                  Carreira Total
                </p>
                <div className="grid grid-cols-4 gap-2">
                  <StatCard label="Jogos" value={cGames} />
                  <StatCard
                    label="Golos"
                    value={cGoals}
                    color="text-tertiary"
                  />
                  <StatCard
                    label="Vermelhos"
                    value={cReds}
                    color={cReds > 0 ? "text-error" : "text-on-surface"}
                  />
                  <StatCard
                    label="Lesões"
                    value={cInjuries}
                    color={cInjuries > 0 ? "text-amber-400" : "text-on-surface"}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* ── TRANSFER HISTORY (full width below) ── */}
          <div className="px-6 py-5 border-t border-outline-variant/10">
            <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-4">
              Historial de Transferências
            </p>
            {transfers.length === 0 ? (
              <p className="text-on-surface-variant text-sm italic">
                Sem transferências registadas.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-[9px] font-black uppercase tracking-widest text-on-surface-variant bg-surface-container-high/50">
                      <th className="px-3 py-2">Época</th>
                      <th className="px-3 py-2">De</th>
                      <th className="px-3 py-2">Para</th>
                      <th className="px-3 py-2 text-right">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transfers.map((t, i) => (
                      <tr
                        key={`${t.year ?? "?"}-${t.matchweek ?? "?"}-${t.related_team_name ?? "?"}-${t.team_name ?? "?"}-${i}`}
                        className="border-t border-outline-variant/10 hover:bg-primary-container/10 transition-colors text-sm"
                      >
                        <td className="px-3 py-2.5 text-on-surface-variant text-xs tabular-nums">
                          {t.year ?? "—"}
                          {t.matchweek ? (
                            <span className="opacity-50"> J{t.matchweek}</span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2.5 text-on-surface-variant text-xs truncate max-w-22.5">
                          {t.related_team_name || "—"}
                        </td>
                        <td className="px-3 py-2.5 font-bold text-on-surface truncate max-w-22.5">
                          {t.team_name || "?"}
                        </td>
                        <td className="px-3 py-2.5 text-right text-tertiary font-black text-xs tabular-nums">
                          {t.amount > 0 ? formatCurrency(t.amount) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
