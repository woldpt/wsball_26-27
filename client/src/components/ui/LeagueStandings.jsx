import { useState } from "react";
import { PlayerLink } from "../shared/PlayerLink.jsx";

const DIVISION_NAMES = {
  1: "Primeira Liga",
  2: "Segunda Liga",
  3: "Liga 3",
  4: "Campeonato de Portugal",
};

const TOTAL_MATCHWEEKS = 14;

// Returns "01", "02", ... "10", "11"
function padPos(n) {
  return String(n).padStart(2, "0");
}

// Renders 5 colored dots for form (most recent last = rightmost)
function FormDots({ form = "" }) {
  // form is a string like "VVDEL" (V=win, D=draw, others=loss)
  const chars = form.split("").slice(-5);
  // pad to 5
  while (chars.length < 5) chars.unshift(null);
  return (
    <div className="flex justify-end gap-0.75">
      {chars.map((r, i) => {
        let cls = "w-2 h-2 rounded-full ";
        if (r === "V") cls += "bg-emerald-500";
        else if (r === "E") cls += "bg-zinc-500";
        else if (r === null) cls += "bg-zinc-800";
        else cls += "bg-red-500"; // D = derrota
        return <span key={i} className={cls} />;
      })}
    </div>
  );
}

function DivisionTable({
  div,
  teams,
  teamForms,
  myTeamId,
  humanTeamIds,
  coachNames,
  onTeamClick,
}) {
  const divTeams = teams
    .filter((t) => t.division === div)
    .sort(
      (a, b) =>
        (b.points || 0) - (a.points || 0) ||
        (b.goals_for || 0) -
          (b.goals_against || 0) -
          ((a.goals_for || 0) - (a.goals_against || 0)) ||
        (b.goals_for || 0) - (a.goals_for || 0) ||
        String(a.name || "").localeCompare(String(b.name || "")),
    );

  if (!divTeams.length) return null;

  const myDivision = divTeams.some((t) => String(t.id) === String(myTeamId));
  const divLabel = DIVISION_NAMES[div] || `Divisão ${div}`;

  return (
    <section className="bg-surface-container rounded-md overflow-hidden flex flex-col">
      {/* Header */}
      <div className="px-4 py-2.5 bg-surface-container-high flex justify-between items-center border-b border-outline-variant/20">
        <h3 className="font-headline font-black text-xs tracking-tight uppercase text-tertiary">
          {divLabel}
        </h3>
        {myDivision && (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-primary/10 text-primary text-[9px] font-black uppercase rounded-sm border border-primary/30">
            <span className="w-1.5 h-1.5 rounded-full bg-primary" />A tua
            divisão
          </span>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-[10px] sm:text-xs md:text-sm text-left border-separate border-spacing-y-px">
          <thead>
            <tr className="text-[8px] sm:text-[9px] uppercase text-on-surface-variant/50 font-bold bg-surface-container-low/60">
              <th className="pl-4 pr-2 py-1.5 w-8">Pos</th>
              <th className="px-2 py-1.5">Clube</th>
              <th className="px-1 py-1.5 text-center w-6">J</th>
              <th className="px-1 py-1.5 text-center w-6 hidden sm:table-cell">
                V
              </th>
              <th className="px-1 py-1.5 text-center w-6 hidden sm:table-cell">
                E
              </th>
              <th className="px-1 py-1.5 text-center w-6 hidden sm:table-cell">
                D
              </th>
              <th className="px-1 py-1.5 text-center w-8 hidden sm:table-cell">
                DG
              </th>
              <th className="px-1 py-1.5 text-center w-8 text-tertiary/70">
                Pts
              </th>
              <th className="pr-4 pl-2 py-1.5 text-right w-17">Forma</th>
            </tr>
          </thead>
          <tbody>
            {divTeams.map((t, idx) => {
              const isMe = String(t.id) === String(myTeamId);
              const isHuman = humanTeamIds.has(String(t.id));
              const gd = (t.goals_for || 0) - (t.goals_against || 0);
              const played = (t.wins || 0) + (t.draws || 0) + (t.losses || 0);
              const isPromo = div > 1 && idx < 2;
              const isRelegate = idx >= divTeams.length - 2;

              const leftBorder = isPromo
                ? "border-l-2 border-l-emerald-500"
                : isRelegate
                  ? "border-l-2 border-l-red-500"
                  : "border-l-2 border-l-transparent";

              const rowBg = isMe
                ? "bg-primary/10 hover:bg-primary/15"
                : isHuman
                  ? "bg-amber-500/5 hover:bg-amber-500/10"
                  : "bg-surface-container-lowest hover:bg-surface-container-high/60";

              return (
                <tr
                  key={t.id}
                  onClick={() => onTeamClick(t)}
                  className={`cursor-pointer transition-colors ${rowBg} ${leftBorder}`}
                >
                  {/* Position */}
                  <td
                    className={`pl-4 pr-2 py-2 font-black text-[10px] sm:text-[11px] ${
                      isPromo
                        ? "text-emerald-400"
                        : isRelegate
                          ? "text-red-400"
                          : isMe
                            ? "text-primary"
                            : div === 1 && idx === 0
                              ? "text-tertiary"
                              : "text-on-surface-variant/50"
                    }`}
                  >
                    {padPos(idx + 1)}
                  </td>

                  {/* Team */}
                  <td className="px-2 py-2">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="shrink-0 w-2 h-2 rounded-full"
                        style={{ backgroundColor: t.color_primary || "#666" }}
                      />
                      <span
                        className={`font-bold truncate max-w-22 sm:max-w-32 md:max-w-none ${isRelegate && !isPromo ? "opacity-60" : ""} ${isMe ? "text-primary" : isHuman ? "text-amber-300" : "text-on-surface"}`}
                      >
                        {t.name}
                      </span>
                      {isMe && (
                        <span className="shrink-0 px-1 py-px bg-tertiary text-on-tertiary text-[8px] font-black rounded-sm leading-tight">
                          TU
                        </span>
                      )}
                      {!isMe && isHuman && (
                        <span
                          className="shrink-0 text-amber-400 text-[8px]"
                          title={coachNames?.[t.id] || "Treinador humano"}
                        >
                          👤
                        </span>
                      )}
                    </div>
                  </td>

                  {/* J */}
                  <td className="px-1 py-2 text-center text-on-surface-variant/60">
                    {played}
                  </td>
                  {/* V */}
                  <td className="px-1 py-2 text-center text-on-surface-variant/60 hidden sm:table-cell">
                    {t.wins || 0}
                  </td>
                  {/* E */}
                  <td className="px-1 py-2 text-center text-on-surface-variant/60 hidden sm:table-cell">
                    {t.draws || 0}
                  </td>
                  {/* D */}
                  <td className="px-1 py-2 text-center text-on-surface-variant/60 hidden sm:table-cell">
                    {t.losses || 0}
                  </td>
                  {/* DG */}
                  <td
                    className={`px-1 py-2 text-center font-bold hidden sm:table-cell ${gd > 0 ? "text-emerald-400" : gd < 0 ? "text-red-400" : "text-on-surface-variant/40"}`}
                  >
                    {gd > 0 ? `+${gd}` : gd}
                  </td>
                  {/* Pts */}
                  <td className="px-1 py-2 text-center font-black font-headline text-on-surface">
                    {t.points || 0}
                  </td>
                  {/* Form */}
                  <td className="pr-4 pl-2 py-2">
                    <FormDots form={teamForms[t.id] || ""} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="flex gap-4 px-4 py-1.5 border-t border-outline-variant/10 bg-surface-container-low/30">
        {div > 1 && (
          <span className="flex items-center gap-1 text-[9px] text-on-surface-variant/40 font-bold uppercase tracking-wide">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/70 inline-block" />
            Subida
          </span>
        )}
        <span className="flex items-center gap-1 text-[9px] text-on-surface-variant/40 font-bold uppercase tracking-wide">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500/60 inline-block" />
          Descida
        </span>
      </div>
    </section>
  );
}

function MatchweekResults({ allMatchResults, completedJornada, teams }) {
  const matchweeks = Object.keys(allMatchResults)
    .map(Number)
    .filter((mw) => mw <= completedJornada)
    .sort((a, b) => b - a);

  if (!matchweeks.length) return null;

  const teamMap = {};
  teams.forEach((t) => {
    teamMap[t.id] = t;
  });

  return (
    <section className="bg-surface-container rounded-md overflow-hidden">
      <div className="px-4 py-2.5 bg-surface-container-high border-b border-outline-variant/20 flex items-center gap-2">
        <span className="text-on-surface-variant/60">📋</span>
        <h3 className="font-headline font-black text-xs tracking-tight uppercase text-on-surface-variant/60">
          Resultados das Jornadas
        </h3>
      </div>
      <div className="divide-y divide-outline-variant/10">
        {matchweeks.map((mw) => (
          <MatchweekRow
            key={mw}
            matchweek={mw}
            matches={allMatchResults[mw]}
            teamMap={teamMap}
          />
        ))}
      </div>
    </section>
  );
}

function MatchweekRow({ matchweek, matches, teamMap }) {
  const [expanded, setExpanded] = useState(false);

  // Agrupar jogos por divisão
  const byDivision = {};
  matches.forEach((match) => {
    const div = teamMap[match.homeTeamId]?.division ?? teamMap[match.awayTeamId]?.division ?? 0;
    if (!byDivision[div]) byDivision[div] = [];
    byDivision[div].push(match);
  });
  const divisionOrder = Object.keys(byDivision).map(Number).sort((a, b) => a - b);

  return (
    <div className="transition-colors hover:bg-surface-container-high/40">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-left"
      >
        <div className="flex items-center gap-3">
          <span className="text-on-surface-variant/40 text-[10px] font-black uppercase tracking-widest">
            J{matchweek}
          </span>
          <span className="text-[10px] text-on-surface-variant/30 font-bold">
            {matches.length} jogos
          </span>
        </div>
        <span
          className={`text-[10px] text-on-surface-variant/30 transition-transform ${expanded ? "rotate-90" : ""}`}
        >
          ▶
        </span>
      </button>
      {expanded && (
        <div className="pb-2.5">
          {divisionOrder.map((div) => (
            <div key={div}>
              <div className="px-4 py-1 bg-surface-container-low/50 border-y border-outline-variant/10">
                <span className="text-[8px] font-black uppercase tracking-widest text-on-surface-variant/40">
                  {DIVISION_NAMES[div] || `Divisão ${div}`}
                </span>
              </div>
              <div className="px-4 space-y-0.5 pt-1">
                {byDivision[div].map((match, idx) => {
                  const homeTeam = teamMap[match.homeTeamId];
                  const awayTeam = teamMap[match.awayTeamId];
                  const homeGoals = match.homeGoals ?? match.finalHomeGoals ?? 0;
                  const awayGoals = match.awayGoals ?? match.finalAwayGoals ?? 0;
                  const homeWin = homeGoals > awayGoals;
                  const draw = homeGoals === awayGoals;

                  return (
                    <div
                      key={idx}
                      className="flex items-center gap-2 text-[10px] py-1.5 border-b border-outline-variant/5 last:border-b-0"
                    >
                      <span
                        className={`flex-1 truncate text-right font-bold ${
                          homeWin ? "text-emerald-400" : draw ? "text-zinc-400" : "text-on-surface-variant/50"
                        }`}
                      >
                        {homeTeam?.name || "?"}
                      </span>
                      <span className="px-2 py-px bg-surface-bright rounded-sm font-black text-[11px] text-on-surface min-w-[3.5rem] text-center">
                        {homeGoals}-{awayGoals}
                      </span>
                      <span
                        className={`flex-1 truncate font-bold ${
                          awayGoals > homeGoals ? "text-emerald-400" : draw ? "text-zinc-400" : "text-on-surface-variant/50"
                        }`}
                      >
                        {awayTeam?.name || "?"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function GoldenBootSidebar({ topScorers, myTeamId }) {
  if (!topScorers?.length) return null;

  return (
    <section className="bg-surface-container rounded-md overflow-hidden">
      <div className="px-4 py-2.5 bg-tertiary/20 border-b border-tertiary/20 flex items-center gap-2">
        <span className="text-tertiary text-sm">⚽</span>
        <h3 className="font-headline font-black text-xs tracking-tight uppercase text-tertiary">
          Corrida ao Título de Goleador
        </h3>
      </div>
      <div className="divide-y divide-outline-variant/10">
        {topScorers.slice(0, 10).map((s, i) => {
          const isMe = String(s.team_id) === String(myTeamId);
          return (
            <div
              key={s.id}
              className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${
                isMe
                  ? "bg-primary-container/20 border-l-2 border-primary"
                  : "hover:bg-surface-container-high/50"
              }`}
            >
              {/* Rank badge */}
              <span
                className={`shrink-0 w-5 h-5 flex items-center justify-center text-[9px] font-black rounded-sm ${
                  i === 0
                    ? "bg-tertiary text-on-tertiary"
                    : isMe
                      ? "bg-primary text-on-primary"
                      : "bg-surface-bright text-on-surface"
                }`}
              >
                {i + 1}
              </span>

              {/* Team colour dot */}
              <span
                className="shrink-0 w-2 h-2 rounded-full"
                style={{ backgroundColor: s.color_primary || "#666" }}
              />

              {/* Name + team */}
              <div className="flex-1 min-w-0">
                <div
                  className={`text-[10px] font-bold uppercase truncate ${isMe ? "text-primary/70" : "text-on-surface-variant/50"}`}
                >
                  {s.team_name}
                </div>
                <div
                  className={`text-[11px] font-bold truncate ${isMe ? "text-primary" : "text-on-surface"}`}
                >
                  <PlayerLink playerId={s.id}>{s.name}</PlayerLink>
                </div>
              </div>

              {/* Goals */}
              <div className="text-right shrink-0">
                <div
                  className={`text-lg font-black font-headline leading-none ${
                    i === 0
                      ? "text-tertiary"
                      : isMe
                        ? "text-primary"
                        : "text-on-surface"
                  }`}
                >
                  {s.goals}
                </div>
                <div className="text-[8px] uppercase opacity-40">golos</div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function AllTimeChampions({ allChampions }) {
  if (!allChampions?.length) return null;

  const bySeasons = {};
  allChampions.forEach((c) => {
    if (!bySeasons[c.season]) bySeasons[c.season] = [];
    bySeasons[c.season].push(c);
  });

  return (
    <section className="bg-surface-container rounded-md overflow-hidden">
      <div className="px-4 py-2.5 bg-surface-container-high border-b border-outline-variant/20 flex items-center gap-2">
        <span className="text-tertiary">🏆</span>
        <h3 className="font-headline font-black text-xs tracking-tight uppercase text-on-surface">
          Palco de Honra — Todos os Campeões
        </h3>
      </div>
      <div className="p-4 space-y-3">
        {Object.keys(bySeasons)
          .sort((a, b) => Number(a) - Number(b))
          .map((season) => (
            <div
              key={season}
              className="bg-surface border border-outline-variant/15 rounded-sm px-4 py-2.5"
            >
              <p className="text-[9px] text-on-surface-variant font-black uppercase tracking-widest mb-2">
                {season}
              </p>
              <div className="flex flex-wrap gap-2">
                {bySeasons[season].map((c, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-sm text-[10px] font-black bg-surface-bright border border-outline-variant/30"
                  >
                    <span
                      className={
                        c.achievement === "Campeão Nacional" ||
                        c.achievement === "Vencedor da Taça de Portugal"
                          ? "text-tertiary"
                          : "text-on-surface"
                      }
                    >
                      {c.team_name}
                    </span>
                    <span className="text-on-surface-variant">
                      {" "}
                      — {c.achievement}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          ))}
      </div>
    </section>
  );
}

/**
 * @param {{
 *   teams: Array,
 *   teamForms: Object,
 *   topScorers: Array,
 *   myTeamId: number|string,
 *   completedJornada: number,
 *   matchweekCount: number,
 *   palmares: { allChampions: Array },
 *   onTeamClick: Function,
 *   allMatchResults: Record<number, Array>,
 * }} props
 */
export function LeagueStandings({
  teams,
  teamForms,
  topScorers,
  myTeamId,
  completedJornada,
  matchweekCount,
  palmares,
  onTeamClick,
  players = [],
  allMatchResults = {},
}) {
  const humanTeamIds = new Set(
    players.filter((p) => p.teamId != null).map((p) => String(p.teamId)),
  );
  const coachNames = {};
  if (teams?.length) {
    teams.forEach((t) => {
      if (t.coach_name) coachNames[t.id] = t.coach_name;
    });
  }

  return (
    <div className="space-y-4">
      {/* Page header */}
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-xl font-headline font-black tracking-tight uppercase text-on-surface">
            Classificações
          </h2>
          <p className="text-xs text-on-surface-variant font-medium mt-0.5">
            {completedJornada > 0
              ? `Jornada ${completedJornada} de ${TOTAL_MATCHWEEKS} concluída`
              : "Época ainda não iniciada"}
          </p>
        </div>
        {matchweekCount > 0 && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-primary/10 text-primary text-[10px] font-black uppercase rounded-sm border-l-2 border-primary">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            Época em curso
          </span>
        )}
      </div>

      {/* Main layout: tables (left) + sidebar (right) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        {/* Division tables */}
        <div className="xl:col-span-9 grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((div) => (
            <DivisionTable
              key={div}
              div={div}
              teams={teams}
              teamForms={teamForms}
              myTeamId={myTeamId}
              humanTeamIds={humanTeamIds}
              coachNames={coachNames}
              onTeamClick={onTeamClick}
            />
          ))}
        </div>

        {/* Sidebar */}
        <div className="xl:col-span-3 flex flex-col gap-4">
          <GoldenBootSidebar topScorers={topScorers} myTeamId={myTeamId} />

          {/* Form legend */}
          <div className="bg-surface-container rounded-md p-4 space-y-2">
            <h4 className="font-headline font-black text-[10px] uppercase tracking-widest text-on-surface-variant/60 mb-3">
              Legenda — Forma
            </h4>
            {[
              { color: "bg-emerald-500", label: "Vitória" },
              { color: "bg-zinc-500", label: "Empate" },
              { color: "bg-red-500", label: "Derrota" },
            ].map(({ color, label }) => (
              <div key={label} className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${color}`} />
                <span className="text-[10px] text-on-surface-variant/60 font-bold">
                  {label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Matchweek results */}
      <MatchweekResults
        allMatchResults={allMatchResults}
        completedJornada={completedJornada}
        teams={teams}
      />

      {/* All-time champions */}
      {palmares?.allChampions?.length > 0 && (
        <AllTimeChampions allChampions={palmares.allChampions} />
      )}
    </div>
  );
}
