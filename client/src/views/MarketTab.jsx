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

// Halo dinâmico por posição - classes estáticas para o Tailwind detectar.
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

function PlayerCard({ player, matchweekCount }) {
  const isListed =
    player.transfer_status && player.transfer_status !== "none";
  const isAuction = player.transfer_status === "auction";
  const isSuspended =
    (player.suspension_until_matchweek ?? 0) > matchweekCount;
  const isInjured = (player.injury_until_matchweek ?? 0) > matchweekCount;
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

  const stripe = POSITION_STRIPE[player.position] || POSITION_STRIPE.GR;
  const glow = POSITION_GLOW[player.position] || "";
  const bgGrad =
    POSITION_BG_GRADIENT[player.position] || "from-zinc-500/5";
  const posText = POSITION_TEXT_CLASS[player.position] || "text-zinc-300";
  const posBorder =
    POSITION_BORDER_CLASS[player.position] || "border-zinc-500";

  return (
    <div
      className={`relative group rounded-xl overflow-hidden border border-outline-variant/25 bg-gradient-to-br ${bgGrad} via-surface-container/80 to-surface/40 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl ${glow} shadow-md shadow-black/30`}
    >
      {/* Faixa de posição no topo - brilho a esbater nos extremos */}
      <div className={`h-[3px] bg-gradient-to-r ${stripe}`} />

      {/* Reflexo de "vidro" no canto superior - subtil */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-white/5 to-transparent" />

      {/* Linha dourada superior para leilões */}
      {isAuction && (
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-[3px]"
          style={SHIMMER_STYLE}
        />
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

          {/* Nome / clube / badges */}
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
              <p className="font-black text-white text-sm leading-tight truncate">
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
            <p className="text-[11px] text-zinc-500 font-bold truncate mt-0.5">
              {player.team_name || "Sem clube"}
            </p>

            <div className="flex flex-wrap gap-1 mt-1.5">
              {isAuction && (
                <span
                  className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-gradient-to-r from-amber-600 via-yellow-300 to-amber-600 text-zinc-950 tracking-widest shadow-sm shadow-amber-500/50"
                  style={{ backgroundSize: "200% 100%" }}
                >
                  ⚡ Leilão
                </span>
              )}
              {isListed && !isAuction && (
                <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-sky-400 text-zinc-950 tracking-widest">
                  Lista
                </span>
              )}
              {isSuspended && (
                <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-error-container/60 text-error border border-error/30 tracking-widest whitespace-nowrap">
                  🟥 {player.suspension_until_matchweek - matchweekCount + 1}J
                </span>
              )}
              {isInjured && (
                <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-amber-900/30 text-amber-400 border border-amber-700/30 tracking-widest whitespace-nowrap">
                  🩹 {player.injury_until_matchweek - matchweekCount + 1}J
                </span>
              )}
            </div>
          </div>

          {/* Qualidade - número grande à direita */}
          <div className="flex flex-col items-center justify-center shrink-0 px-1">
            <div
              className={`text-3xl font-black font-headline tabular-nums leading-none ${posText}`}
              style={{ textShadow: "0 0 12px currentColor" }}
            >
              {player.skill}
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
          <StatTile label="Gol">
            <span className="font-black text-emerald-400 text-[12px] tabular-nums">
              {getPlayerStat(player, ["goals"])}
              <span className="text-zinc-600 text-[9px] font-normal ml-0.5">
                /{getPlayerStat(player, ["career_goals"])}
              </span>
            </span>
          </StatTile>
        </div>

        {/* Discplina e lesões em mini-rodapé */}
        <div className="mt-2 flex justify-around items-center text-[10px] font-bold text-zinc-500 px-1">
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
          <span
            title="Lesões: época / carreira"
            className="tabular-nums"
          >
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

      {/* Rodapé do preço - dourado animado para leilão, esmeralda para o resto */}
      <div
        className={`relative px-3.5 py-2 border-t overflow-hidden ${
          isAuction
            ? "border-amber-500/40 bg-gradient-to-r from-amber-900/50 via-amber-700/40 to-amber-900/50"
            : "border-outline-variant/20 bg-surface/50"
        }`}
      >
        {isAuction && (
          <div
            className="pointer-events-none absolute inset-0"
            style={SHIMMER_STYLE}
          />
        )}
        <div className="relative flex justify-between items-center">
          <span className="text-[9px] uppercase tracking-[0.2em] text-zinc-400 font-black">
            {isAuction ? "Lance actual" : "Preço"}
          </span>
          <span
            className={`font-headline font-black text-base tabular-nums ${
              isAuction ? "text-amber-200" : "text-emerald-400"
            }`}
            style={
              isAuction
                ? { textShadow: "0 0 10px rgba(240, 195, 48, 0.7)" }
                : undefined
            }
          >
            {formatCurrency(player.marketPrice)}
          </span>
        </div>
      </div>
    </div>
  );
}

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

      <div className="p-3 md:p-4">
        {filteredMarketPlayers.length === 0 ? (
          <div className="py-12 text-center text-zinc-500 text-sm">
            <div className="text-3xl mb-2 opacity-50">📭</div>
            <p className="font-bold">Sem jogadores no mercado</p>
            <p className="text-xs mt-1">
              Ajusta os filtros ou aguarda novas listagens.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3 md:gap-4">
            {filteredMarketPlayers.map((player) => (
              <PlayerCard
                key={player.id}
                player={player}
                matchweekCount={matchweekCount}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
