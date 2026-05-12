import { AggBadge } from "../components/shared/AggBadge.jsx";
import { PlayerAvatar } from "../components/shared/PlayerAvatar.jsx";
import { PlayerLink } from "../components/shared/PlayerLink.jsx";
import {
  POSITION_TEXT_CLASS,
  POSITION_BORDER_CLASS,
  POSITION_LABEL_MAP,
  FLAG_TO_COUNTRY,
} from "../constants/index.js";
import { formatCurrency } from "../utils/formatters.js";
import { getPlayerStat } from "../utils/playerHelpers.js";

const POSITION_GLOW = {
  GR: "hover:border-amber-400/70 hover:shadow-amber-400/30",
  DEF: "hover:border-blue-400/70 hover:shadow-blue-400/30",
  MED: "hover:border-emerald-400/70 hover:shadow-emerald-400/30",
  ATA: "hover:border-rose-400/70 hover:shadow-rose-400/30",
};

const POSITION_BAR = {
  GR: "from-amber-300 via-amber-400 to-amber-600",
  DEF: "from-blue-300 via-blue-400 to-blue-600",
  MED: "from-emerald-300 via-emerald-400 to-emerald-600",
  ATA: "from-rose-300 via-rose-400 to-rose-600",
};

const POSITION_BG_GRADIENT = {
  GR: "from-amber-500/8",
  DEF: "from-blue-500/8",
  MED: "from-emerald-500/8",
  ATA: "from-rose-500/8",
};

function SquadRow({ player, matchweekCount, onOpenPlayerHistory }) {
  const star =
    !!player.is_star &&
    (player.position === "MED" || player.position === "ATA");

  const form = player.form || 100;
  const formArrow = form >= 115 ? "💪" : form <= 85 ? "😩" : "👍";
  const formColor =
    form >= 115
      ? "text-emerald-400"
      : form <= 85
        ? "text-rose-400"
        : "text-zinc-400";

  const seasonEnd = Math.ceil(Math.max(1, matchweekCount) / 14) * 14;
  const isContractRenewed = player.contract_until_matchweek === seasonEnd;
  const isListed =
    player.transfer_status && player.transfer_status !== "none";

  const susp = player.suspension_until_matchweek || 0;
  const inj = player.injury_until_matchweek || 0;
  const cooldown = player.transfer_cooldown_until_matchweek || 0;
  const isSuspended = susp > matchweekCount;
  const isInjured = inj > matchweekCount;
  const isCooldown =
    !isSuspended && !isInjured && cooldown > 0 && cooldown >= matchweekCount;

  const skillDelta =
    player.prev_skill != null && player.prev_skill !== player.skill
      ? player.skill - player.prev_skill
      : 0;

  const bar = POSITION_BAR[player.position] || "from-zinc-500 to-zinc-600";
  const glow = POSITION_GLOW[player.position] || "";
  const bgGrad =
    POSITION_BG_GRADIENT[player.position] || "from-zinc-500/4";
  const posText = POSITION_TEXT_CLASS[player.position] || "text-zinc-300";
  const posBorder =
    POSITION_BORDER_CLASS[player.position] || "border-zinc-500";

  const dim = player.isUnavailable ? "opacity-65 saturate-50" : "";
  const renewedShine = isContractRenewed && !isListed;

  return (
    <div
      onClick={() => onOpenPlayerHistory && onOpenPlayerHistory(player)}
      className={`relative group flex items-stretch rounded-lg overflow-hidden border border-outline-variant/25 bg-gradient-to-r ${bgGrad} via-surface-container/70 to-surface/30 transition-all duration-200 hover:-translate-y-px hover:shadow-lg ${glow} ${dim} shadow-sm shadow-black/30 cursor-pointer`}
    >
      {/* Faixa lateral da posição */}
      <div className={`shrink-0 w-1 bg-gradient-to-b ${bar}`} />

      {/* Avatar mini com chip de posição */}
      <div className="relative shrink-0 self-center pl-2 py-1.5">
        <PlayerAvatar
          seed={player.id}
          position={player.position}
          size="md"
        />
        <span
          className={`absolute bottom-0.5 -right-1 px-1 py-px bg-surface-container border-l-2 ${posBorder} ${posText} text-[8px] font-black rounded-sm shadow-md shadow-black/50 tracking-wider`}
        >
          {POSITION_LABEL_MAP[player.position] || player.position}
        </span>
      </div>

      {/* Nome + flag + badges (cresce para preencher) */}
      <div className="flex-1 min-w-0 self-center px-3 py-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span
            className="text-base shrink-0 leading-none"
            title={
              FLAG_TO_COUNTRY[player.nationality] ||
              player.nationality ||
              "—"
            }
          >
            {player.nationality || "—"}
          </span>
          <p className="font-black font-headline text-sm leading-tight uppercase tracking-tight text-on-surface truncate">
            <PlayerLink playerId={player.id}>{player.name}</PlayerLink>
            {star && (
              <span
                className="ml-1 text-amber-400 font-black"
                title="Craque"
              >
                ★
              </span>
            )}
          </p>
          {player.isJunior && (
            <span className="text-[9px] font-black uppercase px-1.5 py-px rounded bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 tracking-widest">
              🎓 Jr
            </span>
          )}
          {renewedShine && (
            <span className="relative overflow-hidden text-[9px] font-black uppercase px-1.5 py-px rounded bg-gradient-to-r from-amber-700/60 via-yellow-500/60 to-amber-700/60 text-amber-100 border border-amber-500/40 tracking-widest shadow-sm shadow-amber-500/30">
              ✓ Renovado
            </span>
          )}
          {isListed && !isContractRenewed && (
            <span className="text-[9px] font-black uppercase px-1.5 py-px rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 tracking-widest">
              À venda
            </span>
          )}
          {isCooldown && (
            <span
              className="text-[9px] font-black uppercase px-1.5 py-px rounded bg-sky-500/15 text-sky-300 border border-sky-500/30 tracking-widest"
              title="Em viagem — disponível na próxima jornada"
            >
              ✈️ 1J
            </span>
          )}
          {isSuspended && (
            <span
              className="text-[9px] font-black uppercase px-1.5 py-px rounded bg-error-container/60 text-error border border-error/30 tracking-widest whitespace-nowrap"
              title={`Suspenso até jornada ${susp + 1}`}
            >
              🟥 {susp - matchweekCount + 1}J
            </span>
          )}
          {isInjured && (
            <span
              className="text-[9px] font-black uppercase px-1.5 py-px rounded bg-amber-900/30 text-amber-400 border border-amber-700/30 tracking-widest whitespace-nowrap"
              title={`Lesionado até jornada ${inj + 1}`}
            >
              🩹 {inj - matchweekCount + 1}J
            </span>
          )}
        </div>
      </div>

      {/* Qualidade - número grande com delta */}
      <div className="shrink-0 self-center flex items-center justify-center px-2 min-w-14">
        <div className="flex items-baseline gap-0.5">
          {skillDelta !== 0 && (
            <span
              className={`text-[10px] font-black ${skillDelta > 0 ? "text-emerald-400" : "text-red-400"}`}
            >
              {skillDelta > 0 ? "▲" : "▼"}
            </span>
          )}
          <div
            className={`text-2xl font-black font-headline tabular-nums leading-none ${posText}`}
            style={{ textShadow: "0 0 10px currentColor" }}
          >
            {player.skill}
          </div>
        </div>
      </div>

      {/* Atributos primários (Agr / Res / For) */}
      <div className="hidden md:flex items-center gap-2 shrink-0 self-center px-2 border-l border-outline-variant/15 ml-1">
        <div className="flex flex-col items-center justify-center min-w-9">
          <AggBadge value={player.aggressiveness} />
          <div className="text-[8px] uppercase tracking-widest text-zinc-600 font-black mt-0.5">
            Agr
          </div>
        </div>
        <div className="flex flex-col items-center justify-center min-w-9">
          {player.resistance != null ? (
            <span className="text-cyan-400 font-black text-[12px]">
              🛡️{player.resistance}
            </span>
          ) : (
            <span className="text-zinc-600 text-xs">—</span>
          )}
          <div className="text-[8px] uppercase tracking-widest text-zinc-600 font-black mt-0.5">
            Res
          </div>
        </div>
        <div className="flex flex-col items-center justify-center min-w-9">
          <span className={`font-black text-sm ${formColor}`}>{formArrow}</span>
          <div className="text-[8px] uppercase tracking-widest text-zinc-600 font-black mt-0.5">
            For
          </div>
        </div>
      </div>

      {/* Stats inline (Jogos / Golos / Verm / Lesões - época / carreira) */}
      <div className="hidden xl:flex items-center gap-3 shrink-0 self-center px-2 border-l border-outline-variant/15 ml-1 text-[10px] tabular-nums">
        <span title="Jogos: época / carreira" className="flex flex-col items-center min-w-12">
          <span className="text-zinc-300 font-black">
            {getPlayerStat(player, ["games_played"])}
            <span className="text-zinc-600 font-normal">
              /{getPlayerStat(player, ["career_games"])}
            </span>
          </span>
          <span className="text-[8px] uppercase tracking-widest text-zinc-600 font-black">
            Jog
          </span>
        </span>
        <span title="Golos: época / carreira" className="flex flex-col items-center min-w-12">
          <span className="text-emerald-400 font-black">
            ⚽{getPlayerStat(player, ["goals"])}
            <span className="text-zinc-600 font-normal">
              /{getPlayerStat(player, ["career_goals"])}
            </span>
          </span>
          <span className="text-[8px] uppercase tracking-widest text-zinc-600 font-black">
            Gol
          </span>
        </span>
        <span title="Cartões vermelhos: época / carreira" className="flex flex-col items-center min-w-10">
          <span className="text-red-400 font-black">
            🟥{getPlayerStat(player, ["red_cards"])}
            <span className="text-zinc-600 font-normal">
              /{getPlayerStat(player, ["career_reds"])}
            </span>
          </span>
          <span className="text-[8px] uppercase tracking-widest text-zinc-600 font-black">
            Vrm
          </span>
        </span>
        <span title="Lesões: época / carreira" className="flex flex-col items-center min-w-10">
          <span className="text-orange-400 font-black">
            🩹{getPlayerStat(player, ["injuries"])}
            <span className="text-zinc-600 font-normal">
              /{getPlayerStat(player, ["career_injuries"])}
            </span>
          </span>
          <span className="text-[8px] uppercase tracking-widest text-zinc-600 font-black">
            Les
          </span>
        </span>
      </div>

      {/* Ordenado + Valor (omitido em mobile) */}
      <div className="hidden md:flex shrink-0 self-stretch flex items-center px-3 border-l">
        <div className="relative flex flex-col items-end justify-center gap-0.5 min-w-22">
          <div className="flex items-baseline gap-1">
            <span className="font-headline font-black text-sm tabular-nums text-on-surface">
              {formatCurrency(player.wage || 0)}
            </span>
            <span className="text-[8px] text-zinc-500 font-black uppercase tracking-widest">
              /sem
            </span>
          </div>
          <span className="font-headline font-black text-[12px] tabular-nums text-emerald-400/90">
            ≈ {formatCurrency(player.value || 0)}
          </span>
        </div>
      </div>
    </div>
  );
}

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
 *   onOpenPlayerHistory: (player: object) => void,
 * }} props
 */
export function PlayersTab({
  mySquad,
  annotatedSquad,
  totalWeeklyWage,
  currentBudget,
  teamInfo,
  matchweekCount,
  // eslint-disable-next-line no-unused-vars
  isPlayingMatch,
  // eslint-disable-next-line no-unused-vars
  showHalftimePanel,
  // eslint-disable-next-line no-unused-vars
  renewPlayerContract,
  // eslint-disable-next-line no-unused-vars
  listPlayerAuction,
  // eslint-disable-next-line no-unused-vars
  listPlayerFixed,
  // eslint-disable-next-line no-unused-vars
  removeFromTransferList,
  onOpenPlayerHistory,
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

      {/* ── Linhas do plantel ── */}
      <div className="bg-surface-container rounded-md overflow-hidden">
        <div className="px-5 py-4 flex items-center justify-between bg-surface-container-high/50">
          <h2 className="text-base font-black font-headline tracking-tight text-tertiary uppercase">
            Gestão Contratual do Plantel
          </h2>
          <span className="text-[10px] text-on-surface-variant font-black uppercase tracking-widest">
            {mySquad.length} jogadores
          </span>
        </div>

        <div className="p-3 md:p-4">
          {annotatedSquad.length === 0 ? (
            <div className="py-12 text-center text-zinc-500 text-sm">
              <div className="text-3xl mb-2 opacity-50">👥</div>
              <p className="font-bold">Sem jogadores no plantel</p>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {(["GR", "DEF", "MED", "ATA"]).map((pos) => {
                const group = annotatedSquad.filter((p) => p.position === pos);
                if (!group.length) return null;
                const posLabel =
                  pos === "GR"
                    ? "Guarda-redes"
                    : pos === "DEF"
                      ? "Defesas"
                      : pos === "MED"
                        ? "Médios"
                        : "Avançados";
                return (
                  <div key={pos}>
                    <div className="flex items-center gap-2 px-1 py-2 mt-1 first:mt-0">
                      <span className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/50">
                        {posLabel}
                      </span>
                      <span className="text-[9px] text-on-surface-variant/30 font-bold">
                        {group.length}
                      </span>
                    </div>
                    {group.map((player) => (
                      <SquadRow
                        key={player.id}
                        player={player}
                        matchweekCount={matchweekCount}
                        onOpenPlayerHistory={onOpenPlayerHistory}
                      />
                    ))}
                  </div>
                );
              })}
            </div>
          )}
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
