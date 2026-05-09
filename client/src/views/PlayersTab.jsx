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
  GR: "hover:border-amber-400/70 hover:shadow-amber-400/40",
  DEF: "hover:border-blue-400/70 hover:shadow-blue-400/40",
  MED: "hover:border-emerald-400/70 hover:shadow-emerald-400/40",
  ATA: "hover:border-rose-400/70 hover:shadow-rose-400/40",
};

const POSITION_STRIPE = {
  GR: "from-amber-400/0 via-amber-400 to-amber-400/0",
  DEF: "from-blue-400/0 via-blue-400 to-blue-400/0",
  MED: "from-emerald-400/0 via-emerald-400 to-emerald-400/0",
  ATA: "from-rose-400/0 via-rose-400 to-rose-400/0",
};

const POSITION_BG_GRADIENT = {
  GR: "from-amber-500/10",
  DEF: "from-blue-500/10",
  MED: "from-emerald-500/10",
  ATA: "from-rose-500/10",
};

const SHIMMER_STYLE = {
  background:
    "linear-gradient(110deg, transparent 30%, rgba(240, 195, 48, 0.32) 48%, rgba(255, 232, 142, 0.5) 50%, rgba(240, 195, 48, 0.32) 52%, transparent 70%)",
  backgroundSize: "220% 100%",
  animation: "shimmer 3s linear infinite",
};

function StatTile({ label, children, accent = "border-outline-variant/15" }) {
  return (
    <div
      className={`flex flex-col items-center justify-center bg-surface/50 rounded-md px-1 py-1.5 border ${accent}`}
    >
      <div className="text-[8px] uppercase tracking-widest text-zinc-600 font-black mb-1">
        {label}
      </div>
      <div className="leading-none flex items-center justify-center min-h-4">
        {children}
      </div>
    </div>
  );
}

function SquadCard({ player, matchweekCount }) {
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
    !isSuspended && !isInjured && cooldown >= matchweekCount;

  const skillDelta =
    player.prev_skill != null && player.prev_skill !== player.skill
      ? player.skill - player.prev_skill
      : 0;

  const stripe = POSITION_STRIPE[player.position] || POSITION_STRIPE.GR;
  const glow = POSITION_GLOW[player.position] || "";
  const bgGrad =
    POSITION_BG_GRADIENT[player.position] || "from-zinc-500/5";
  const posText = POSITION_TEXT_CLASS[player.position] || "text-zinc-300";
  const posBorder =
    POSITION_BORDER_CLASS[player.position] || "border-zinc-500";

  const dim = player.isUnavailable ? "opacity-65 saturate-50" : "";
  const renewedShine = isContractRenewed && !isListed;

  return (
    <div
      className={`relative group rounded-xl overflow-hidden border border-outline-variant/25 bg-gradient-to-br ${bgGrad} via-surface-container/80 to-surface/40 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl ${glow} ${dim} shadow-md shadow-black/30`}
    >
      {/* Faixa de posição no topo */}
      <div className={`h-[3px] bg-gradient-to-r ${stripe}`} />

      {/* Reflexo de "vidro" no canto superior */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-white/5 to-transparent" />

      {/* Linha dourada superior para contratos renovados */}
      {renewedShine && (
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-[3px]"
          style={SHIMMER_STYLE}
        />
      )}

      {/* Tarja vermelha lateral para indisponíveis */}
      {player.isUnavailable && (
        <div className="absolute inset-y-0 left-0 w-[3px] bg-red-500/60" />
      )}

      <div className="p-3 md:p-3.5">
        <div className="flex items-start gap-3">
          {/* Avatar com badge de posição flutuante */}
          <div className="relative shrink-0">
            <div
              className={`absolute -inset-1 rounded-full bg-gradient-to-br ${bgGrad} to-transparent blur-md opacity-0 group-hover:opacity-100 transition-opacity`}
            />
            <div className="relative">
              <PlayerAvatar
                seed={player.id}
                position={player.position}
                size="lg"
              />
            </div>
            <span
              className={`absolute -bottom-1 -right-1 px-1.5 py-0.5 bg-surface-container border-l-2 ${posBorder} ${posText} text-[9px] font-black rounded-sm shadow-md shadow-black/40 tracking-wider`}
            >
              {POSITION_LABEL_MAP[player.position] || player.position}
            </span>
          </div>

          {/* Nome / nacionalidade / badges */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span
                className="text-base shrink-0"
                title={
                  FLAG_TO_COUNTRY[player.nationality] ||
                  player.nationality ||
                  "—"
                }
              >
                {player.nationality || "—"}
              </span>
              <p className="font-black font-headline text-sm leading-tight truncate uppercase tracking-tight text-on-surface">
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
            </div>

            <div className="flex flex-wrap gap-1 mt-1.5">
              {player.isJunior && (
                <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 tracking-widest">
                  🎓 Juniores
                </span>
              )}
              {renewedShine && (
                <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-gradient-to-r from-amber-700/60 via-yellow-500/60 to-amber-700/60 text-amber-100 border border-amber-500/40 tracking-widest shadow-sm shadow-amber-500/30">
                  ✓ Renovado
                </span>
              )}
              {isListed && !isContractRenewed && (
                <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 tracking-widest">
                  À venda
                </span>
              )}
              {isCooldown && (
                <span
                  className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-300 border border-sky-500/30 tracking-widest"
                  title="Em viagem — disponível na próxima jornada"
                >
                  ✈️ 1J
                </span>
              )}
              {isSuspended && (
                <span
                  className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-error-container/60 text-error border border-error/30 tracking-widest whitespace-nowrap"
                  title={`Suspenso até jornada ${susp + 1}`}
                >
                  🟥 {susp - matchweekCount + 1}J
                </span>
              )}
              {isInjured && (
                <span
                  className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-amber-900/30 text-amber-400 border border-amber-700/30 tracking-widest whitespace-nowrap"
                  title={`Lesionado até jornada ${inj + 1}`}
                >
                  🩹 {inj - matchweekCount + 1}J
                </span>
              )}
            </div>
          </div>

          {/* Qualidade - número grande à direita com delta */}
          <div className="flex flex-col items-center justify-center shrink-0 px-1">
            <div className="flex items-baseline gap-0.5">
              {skillDelta !== 0 && (
                <span
                  className={`text-[10px] font-black ${skillDelta > 0 ? "text-emerald-400" : "text-red-400"}`}
                >
                  {skillDelta > 0 ? "▲" : "▼"}
                </span>
              )}
              <div
                className={`text-3xl font-black font-headline tabular-nums leading-none ${posText}`}
                style={{ textShadow: "0 0 12px currentColor" }}
              >
                {player.skill}
              </div>
            </div>
            <div className="text-[8px] uppercase tracking-[0.18em] text-zinc-500 font-black mt-1">
              qual
            </div>
          </div>
        </div>

        {/* Atributos primários */}
        <div className="mt-3 grid grid-cols-4 gap-1.5">
          <StatTile label="Agr">
            <AggBadge value={player.aggressiveness} />
          </StatTile>
          <StatTile label="Res">
            {player.resistance != null ? (
              <span className="text-cyan-400 font-black text-[12px]">
                🛡️{player.resistance}
              </span>
            ) : (
              <span className="text-zinc-600 text-xs">—</span>
            )}
          </StatTile>
          <StatTile label="For">
            <span className={`font-black text-[12px] ${formColor}`}>
              {formArrow}
            </span>
          </StatTile>
          <StatTile label="Jog">
            <span className="font-black text-zinc-300 text-[12px] tabular-nums">
              {getPlayerStat(player, ["games_played"])}
              <span className="text-zinc-600 text-[9px] font-normal ml-0.5">
                /{getPlayerStat(player, ["career_games"])}
              </span>
            </span>
          </StatTile>
        </div>

        {/* Mini-rodapé golos / vermelhos / lesões */}
        <div className="mt-2 flex justify-around items-center text-[10px] font-bold text-zinc-500 px-1">
          <span title="Golos: época / carreira" className="tabular-nums">
            ⚽{" "}
            <span className="text-emerald-400 font-black">
              {getPlayerStat(player, ["goals"])}
            </span>
            <span className="text-zinc-600">
              /{getPlayerStat(player, ["career_goals"])}
            </span>
          </span>
          <span
            title="Cartões vermelhos: época / carreira"
            className="tabular-nums"
          >
            🟥{" "}
            <span className="text-red-400 font-black">
              {getPlayerStat(player, ["red_cards"])}
            </span>
            <span className="text-zinc-600">
              /{getPlayerStat(player, ["career_reds"])}
            </span>
          </span>
          <span title="Lesões: época / carreira" className="tabular-nums">
            🩹{" "}
            <span className="text-orange-400 font-black">
              {getPlayerStat(player, ["injuries"])}
            </span>
            <span className="text-zinc-600">
              /{getPlayerStat(player, ["career_injuries"])}
            </span>
          </span>
        </div>
      </div>

      {/* Rodapé: ordenado + valor estimado */}
      <div
        className={`relative px-3.5 py-2 border-t overflow-hidden ${
          renewedShine
            ? "border-amber-500/40 bg-gradient-to-r from-amber-900/50 via-amber-700/40 to-amber-900/50"
            : isListed
              ? "border-emerald-500/30 bg-gradient-to-r from-emerald-900/40 via-emerald-700/20 to-emerald-900/40"
              : "border-outline-variant/20 bg-surface/50"
        }`}
      >
        {renewedShine && (
          <div
            className="pointer-events-none absolute inset-0"
            style={SHIMMER_STYLE}
          />
        )}
        <div className="relative flex justify-between items-center gap-2">
          <div className="flex flex-col">
            <span className="text-[9px] uppercase tracking-[0.2em] text-zinc-400 font-black">
              Ordenado
            </span>
            <span
              className={`font-headline font-black text-sm tabular-nums ${
                renewedShine ? "text-amber-200" : "text-on-surface"
              }`}
              style={
                renewedShine
                  ? { textShadow: "0 0 8px rgba(240, 195, 48, 0.6)" }
                  : undefined
              }
            >
              {formatCurrency(player.wage || 0)}
              <span className="text-[9px] opacity-50 ml-0.5 font-normal">
                /sem
              </span>
            </span>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-[9px] uppercase tracking-[0.2em] text-zinc-400 font-black">
              Valor
            </span>
            <span className="font-headline font-black text-sm tabular-nums text-emerald-400">
              {formatCurrency(player.value || 0)}
            </span>
          </div>
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

      {/* ── Cards do plantel ── */}
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3 md:gap-4">
              {annotatedSquad.map((player) => (
                <SquadCard
                  key={player.id}
                  player={player}
                  matchweekCount={matchweekCount}
                />
              ))}
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
