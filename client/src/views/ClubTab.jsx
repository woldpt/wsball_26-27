import estadio5000 from "../assets/estadio5000.jpg";
import estadio15000 from "../assets/estadio15000.jpg";
import estadio30000 from "../assets/estadio30000.jpg";
import estadio50000 from "../assets/estadio50000.jpg";
import { DIVISION_NAMES } from "../constants/index.js";
import { formatCurrency } from "../utils/formatters.js";

/**
 * @param {{
 *   teamInfo: object,
 *   seasonYear: number,
 *   me: object,
 *   currentBudget: number,
 *   totalWeeklyWage: number,
 *   loanAmount: number,
 *   palmaresTeamId: number|null,
 *   palmares: { trophies: Array },
 *   clubNews: Array,
 * }} props
 */
export function ClubTab({
  teamInfo,
  seasonYear,
  me,
  currentBudget,
  totalWeeklyWage,
  loanAmount,
  palmaresTeamId,
  palmares,
  clubNews,
}) {
  return (
    <div className="space-y-5 relative">
      {/* Ambient glow blobs */}
      <div
        className="pointer-events-none absolute -top-8 -left-8 w-72 h-72 rounded-full blur-[100px] opacity-10"
        style={{
          background: teamInfo?.color_primary || "#95d4b3",
        }}
      />
      <div
        className="pointer-events-none absolute top-40 -right-12 w-48 h-48 rounded-full blur-[80px] opacity-5"
        style={{
          background: teamInfo?.color_secondary || "#e9c349",
        }}
      />

      {/* ── HERO + BUDGET WIDGET ─────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Club hero card (2/3) */}
        <div className="lg:col-span-2 bg-surface-container rounded-lg overflow-hidden relative">
          <div
            className="absolute inset-0"
            style={{
              background: teamInfo?.color_primary
                ? `linear-gradient(to right, ${teamInfo.color_primary}28, transparent)`
                : "linear-gradient(to right, #2d6a4f28, transparent)",
            }}
          />
          <div className="relative p-6 flex flex-col sm:flex-row gap-5 items-start sm:items-center">
            {/* Badge */}
            <div
              className="w-20 h-20 rounded-xl flex items-center justify-center text-4xl font-black shrink-0 shadow-lg"
              style={{
                background:
                  teamInfo?.color_primary || "#201f1f",
                color: teamInfo?.color_secondary || "#fff",
              }}
            >
              {teamInfo?.name?.[0] || "?"}
            </div>
            <div className="flex-1 min-w-0">
              <h1
                className="font-headline text-3xl font-black tracking-tighter leading-none mb-1 truncate"
                style={{
                  color: teamInfo?.color_primary || "#fff",
                }}
              >
                {teamInfo?.name || "—"}
              </h1>
              <div className="flex flex-wrap items-center gap-3 mb-4">
                <span className="text-on-surface-variant text-sm font-bold">
                  {DIVISION_NAMES[teamInfo?.division] ||
                    `Divisão ${teamInfo?.division}`}
                </span>
                <span className="w-1 h-1 bg-outline-variant rounded-full" />
                <span className="text-on-surface-variant text-sm">
                  {seasonYear}
                </span>
              </div>
              {/* Moral bar */}
              <div className="max-w-xs">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] uppercase tracking-widest text-on-surface-variant font-black">
                    Moral do Plantel
                  </span>
                  <span
                    className={`text-[10px] font-black ${
                      (teamInfo?.morale || 75) >= 70
                        ? "text-primary"
                        : (teamInfo?.morale || 75) >= 40
                          ? "text-tertiary"
                          : "text-error"
                    }`}
                  >
                    {(teamInfo?.morale || 75) >= 70
                      ? "ELEVADO"
                      : (teamInfo?.morale || 75) >= 40
                        ? "ESTÁVEL"
                        : "BAIXO"}
                  </span>
                </div>
                <div className="w-full bg-surface-container-high h-2 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      (teamInfo?.morale || 75) >= 70
                        ? "bg-linear-to-r from-primary/60 to-primary"
                        : (teamInfo?.morale || 75) >= 40
                          ? "bg-linear-to-r from-tertiary/60 to-tertiary"
                          : "bg-linear-to-r from-error/60 to-error"
                    }`}
                    style={{
                      width: `${teamInfo?.morale || 75}%`,
                    }}
                  />
                </div>
                <p className="text-[10px] text-on-surface-variant/60 uppercase tracking-widest mt-1.5">
                  Índice de confiança do plantel
                </p>
              </div>
            </div>
            {/* Manager */}
            <div className="shrink-0 text-right hidden sm:block">
              <p className="text-[10px] uppercase tracking-widest text-on-surface-variant font-bold mb-1">
                Manager
              </p>
              <p className="font-headline font-black text-on-surface text-lg tracking-tight">
                {me?.name}
              </p>
            </div>
          </div>
        </div>

        {/* Budget widget (1/3) */}
        <div
          className="bg-surface-container-high rounded-lg p-5 flex flex-col justify-between border-t-2"
          style={{
            borderColor: teamInfo?.color_primary || "#95d4b3",
          }}
        >
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-on-surface-variant font-black mb-1.5">
                Saldo Disponível
              </p>
              <p
                className={`font-headline text-2xl font-black ${
                  currentBudget >= 0
                    ? "text-on-surface"
                    : "text-error"
                }`}
              >
                {formatCurrency(currentBudget)}
              </p>
            </div>
            <span
              className="material-symbols-outlined text-3xl"
              style={{
                color: teamInfo?.color_primary || "#95d4b3",
              }}
            >
              payments
            </span>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between text-xs">
              <span className="text-on-surface-variant">
                Salários / jornada
              </span>
              <span className="font-mono font-bold text-on-surface">
                {formatCurrency(totalWeeklyWage)}
              </span>
            </div>
            <div className="w-full bg-surface-container-lowest h-1 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.min(100, (totalWeeklyWage / 500000) * 100)}%`,
                  background:
                    teamInfo?.color_primary || "#95d4b3",
                }}
              />
            </div>
            <div className="flex justify-between text-[10px] pt-1">
              <span
                className={`font-black ${
                  currentBudget >= 0
                    ? "text-primary"
                    : "text-error"
                }`}
              >
                {currentBudget >= 0 ? "ESTÁVEL" : "DÉFICE"}
              </span>
              {loanAmount > 0 && (
                <span className="text-error/70">
                  Dívida: {formatCurrency(loanAmount)}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── ESTÁDIO + PALMARÉS ────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Estádio */}
        <div className="bg-surface-container rounded-lg overflow-hidden flex flex-col">
          <div
            className="h-32 relative flex items-end"
            style={{
              backgroundImage: `url(${
                (teamInfo?.stadium_capacity || 0) >= 50000
                  ? estadio50000
                  : (teamInfo?.stadium_capacity || 0) >= 30000
                    ? estadio30000
                    : (teamInfo?.stadium_capacity || 0) >= 15000
                      ? estadio15000
                      : estadio5000
              })`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          >
            {/* dark gradient so text is always legible */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
            <div className="relative px-5 pb-4">
              <h3 className="font-headline text-lg font-black text-white leading-tight drop-shadow">
                {teamInfo?.stadium_name || "Estádio Municipal"}
              </h3>
              <p
                className="text-xs font-bold drop-shadow"
                style={{
                  color: teamInfo?.color_primary || "#95d4b3",
                }}
              >
                Recinto Principal
              </p>
            </div>
          </div>
          <div className="p-5 grid grid-cols-2 gap-3">
            <div className="bg-surface-container-low p-3 rounded-lg text-center">
              <p className="text-[10px] uppercase tracking-tight text-on-surface-variant font-bold mb-1">
                Capacidade
              </p>
              <p className="font-headline font-black text-on-surface text-lg">
                {(
                  teamInfo?.stadium_capacity || 10000
                ).toLocaleString("pt-PT")}
              </p>
            </div>
            <div className="bg-surface-container-low p-3 rounded-lg text-center">
              <p className="text-[10px] uppercase tracking-tight text-on-surface-variant font-bold mb-1">
                Divisão
              </p>
              <p className="font-headline font-black text-primary text-sm leading-tight mt-0.5">
                {DIVISION_NAMES[teamInfo?.division] || "Liga"}
              </p>
            </div>
          </div>
        </div>

        {/* Palmarés */}
        <div className="bg-surface-container rounded-lg p-5 flex flex-col">
          <div className="flex justify-between items-center mb-5">
            <h3 className="font-headline text-sm font-black uppercase tracking-widest text-on-surface">
              Palmarés
            </h3>
            <span
              className="material-symbols-outlined text-tertiary"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              military_tech
            </span>
          </div>
          {palmaresTeamId === me?.teamId &&
          palmares.trophies?.length > 0 ? (
            <div className="flex flex-wrap gap-3">
              {palmares.trophies.map((trophy, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-3 px-4 py-3 rounded-lg bg-tertiary/8 border border-tertiary/20"
                >
                  <span
                    className="material-symbols-outlined text-tertiary text-xl"
                    style={{
                      fontVariationSettings: "'FILL' 1",
                    }}
                  >
                    emoji_events
                  </span>
                  <div>
                    <p className="text-tertiary font-black text-sm">
                      {trophy.achievement}
                    </p>
                    <p className="text-on-surface-variant text-xs font-bold">
                      {trophy.season}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center border border-dashed border-outline-variant/20 rounded-lg bg-surface-container-low/50 p-8">
              <span
                className="material-symbols-outlined text-on-surface-variant/30 text-5xl mb-3"
                style={{ fontVariationSettings: "'FILL' 0" }}
              >
                trophy
              </span>
              <p className="text-sm text-on-surface-variant font-bold text-center">
                Nenhum título conquistado.
              </p>
              <p className="text-[10px] text-on-surface-variant/40 uppercase tracking-widest mt-1 text-center">
                Constrói o teu legado hoje
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── JORNAL DO CLUBE ──────────────── */}
      <div className="bg-surface-container rounded-lg overflow-hidden">
        <div className="bg-surface-container-high px-5 py-4 flex justify-between items-center">
          <h3 className="font-headline text-sm font-black uppercase tracking-widest text-on-surface">
            Jornal do Clube
          </h3>
          {clubNews?.some(
            (n) =>
              n.type === "transfer_in" ||
              n.type === "transfer_out",
          ) && (
            <span className="text-[10px] text-tertiary font-black tracking-[0.2em] uppercase">
              Foco em Transferências
            </span>
          )}
        </div>
        {clubNews && clubNews.length > 0 ? (
          <>
            <div className="divide-y divide-surface-container-low">
              {clubNews.slice(0, 8).map((news, idx) => (
                <div
                  key={news.id || idx}
                  className="px-5 py-3.5 flex items-center gap-4 hover:bg-surface-bright/30 transition-colors"
                >
                  {/* Icon container */}
                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                      news.type === "transfer_in"
                        ? "bg-primary/15"
                        : news.type === "transfer_out"
                          ? "bg-error/15"
                          : "bg-surface-container-high"
                    }`}
                  >
                    <span
                      className={`material-symbols-outlined text-sm ${
                        news.type === "transfer_in"
                          ? "text-primary"
                          : news.type === "transfer_out"
                            ? "text-error"
                            : "text-on-surface-variant"
                      }`}
                    >
                      {news.type === "transfer_in"
                        ? "trending_up"
                        : news.type === "transfer_out"
                          ? "trending_down"
                          : "info"}
                    </span>
                  </div>
                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-on-surface truncate">
                      {news.title}
                    </p>
                    <p className="text-xs text-on-surface-variant truncate">
                      {news.related_team_name &&
                      (news.type === "transfer_in" ||
                        news.type === "transfer_out")
                        ? `${
                            news.type === "transfer_in"
                              ? "de"
                              : "para"
                          } ${news.related_team_name}`
                        : `Jornada ${news.matchweek || "?"}${
                            news.year ? ` · ${news.year}` : ""
                          }`}
                    </p>
                  </div>
                  {/* Amount */}
                  {news.amount > 0 && (
                    <div className="text-right shrink-0">
                      <p
                        className={`font-headline font-black text-sm ${
                          news.type === "transfer_out"
                            ? "text-primary"
                            : "text-error"
                        }`}
                      >
                        {news.type === "transfer_out"
                          ? "+"
                          : "-"}
                        {formatCurrency(news.amount)}
                      </p>
                      <p className="text-[10px] text-on-surface-variant uppercase tracking-wider">
                        {news.type === "transfer_out"
                          ? "Venda"
                          : news.type === "transfer_in"
                            ? "Compra"
                            : ""}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
            {clubNews.length > 8 && (
              <div className="p-4 text-center bg-surface-container-low/50 border-t border-outline-variant/10">
                <p className="text-[10px] font-black tracking-widest text-on-surface-variant uppercase">
                  + {clubNews.length - 8} entradas no arquivo
                </p>
              </div>
            )}
          </>
        ) : (
          <div className="p-8 text-center">
            <span className="material-symbols-outlined text-on-surface-variant/30 text-4xl block mb-3">
              newspaper
            </span>
            <p className="text-on-surface-variant font-bold text-sm">
              Nenhuma notícia ainda.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
