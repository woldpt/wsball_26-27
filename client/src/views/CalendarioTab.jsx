import { SEASON_CALENDAR } from "../constants/index.js";
import { generateLeagueFixtures } from "../utils/fixtures.js";

export function CalendarioTab({ calendarData, me, teams, seasonYear, calFilter, setCalFilter, matchweekCount, handleOpenTeamSquad }) {
  const cal = calendarData;
  const curIdx = cal?.calendarIndex ?? 0;
  const calYear = cal?.year ?? seasonYear;
  const myTeamId = me?.teamId;
  const myTeam = teams.find((t) => t.id === myTeamId);
  const myDivision = myTeam?.division;
  const myDivTeams = teams
    .filter((t) => t.division === myDivision)
    .sort((a, b) => a.id - b.id);

  const getStatus = (entry) => {
    if (entry.calendarIndex < curIdx) return "done";
    if (entry.calendarIndex === curIdx) return "current";
    return "future";
  };

  // Find the cup round in which my team was eliminated
  const eliminatedCupRound = (() => {
    const cupEntries = SEASON_CALENDAR.filter(
      (e) => e.type === "cup",
    );
    for (const e of cupEntries) {
      const fixtures =
        cal?.cupMatches?.filter(
          (m) => m.round === e.round,
        ) ?? [];
      const myMatch = fixtures.find(
        (f) =>
          f.home_team_id === myTeamId ||
          f.away_team_id === myTeamId,
      );
      if (
        myMatch?.played &&
        myMatch.winner_team_id !== myTeamId
      ) {
        return e.round;
      }
    }
    return null;
  })();

  // Build flat list of MY matches across season
  const calEntries = SEASON_CALENDAR.filter((entry) => {
    if (calFilter === "league")
      return entry.type === "league";
    if (calFilter === "cup") return entry.type === "cup";
    return true;
  })
    .map((entry) => {
      const status = getStatus(entry);
      if (entry.type === "cup") {
        // Rounds after elimination → show eliminated placeholder
        if (
          eliminatedCupRound !== null &&
          entry.round > eliminatedCupRound
        ) {
          return {
            entry,
            status,
            type: "cup",
            eliminated: true,
          };
        }
        const cupFixtures =
          cal?.cupMatches?.filter(
            (m) => m.round === entry.round,
          ) ?? [];
        const myMatch = cupFixtures.find(
          (f) =>
            f.home_team_id === myTeamId ||
            f.away_team_id === myTeamId,
        );
        if (!myMatch && cupFixtures.length > 0) return null; // in cup but not my match drawn yet (show placeholder)
        const opponent = myMatch
          ? teams.find(
              (t) =>
                t.id ===
                (myMatch.home_team_id === myTeamId
                  ? myMatch.away_team_id
                  : myMatch.home_team_id),
            )
          : null;
        const imHome = myMatch?.home_team_id === myTeamId;
        const stadiumTeam = imHome ? myTeam : opponent;
        const hasPen =
          myMatch &&
          (myMatch.home_penalties > 0 ||
            myMatch.away_penalties > 0);
        const myScore = myMatch?.played
          ? imHome
            ? myMatch.home_score
            : myMatch.away_score
          : null;
        const opScore = myMatch?.played
          ? imHome
            ? myMatch.away_score
            : myMatch.home_score
          : null;
        const myPen = hasPen
          ? imHome
            ? myMatch.home_penalties
            : myMatch.away_penalties
          : null;
        const opPen = hasPen
          ? imHome
            ? myMatch.away_penalties
            : myMatch.home_penalties
          : null;
        const won = myMatch?.played
          ? myMatch.winner_team_id === myTeamId
          : null;
        return {
          entry,
          status,
          type: "cup",
          myMatch,
          opponent,
          imHome,
          stadiumTeam,
          hasPen,
          myScore,
          opScore,
          myPen,
          opPen,
          won,
        };
      } else {
        const divFixtures =
          status === "done"
            ? (cal?.leagueMatches
                ?.filter(
                  (m) =>
                    m.matchweek === entry.matchweek &&
                    myDivTeams.some(
                      (t) => t.id === m.home_team_id,
                    ) &&
                    myDivTeams.some(
                      (t) => t.id === m.away_team_id,
                    ),
                )
                .map((m) => ({
                  homeTeamId: m.home_team_id,
                  awayTeamId: m.away_team_id,
                  result: m,
                })) ?? [])
            : generateLeagueFixtures(
                cal?.fixtureSeeds?.[myDivision] ?? myDivTeams.map((t) => t.id),
                entry.matchweek,
              ).map((f) => ({ ...f, result: null }));
        const myFixture = divFixtures.find(
          (f) =>
            f.homeTeamId === myTeamId ||
            f.awayTeamId === myTeamId,
        );
        if (!myFixture) return null;
        const imHome = myFixture.homeTeamId === myTeamId;
        const opponent = teams.find(
          (t) =>
            t.id ===
            (imHome
              ? myFixture.awayTeamId
              : myFixture.homeTeamId),
        );
        const stadiumTeam = imHome ? myTeam : opponent;
        const myScore = myFixture.result
          ? imHome
            ? myFixture.result.home_score
            : myFixture.result.away_score
          : null;
        const opScore = myFixture.result
          ? imHome
            ? myFixture.result.away_score
            : myFixture.result.home_score
          : null;
        const won = myFixture.result
          ? imHome
            ? myFixture.result.home_score >
              myFixture.result.away_score
            : myFixture.result.away_score >
              myFixture.result.home_score
          : null;
        const drew = myFixture.result
          ? myFixture.result.home_score ===
            myFixture.result.away_score
          : null;
        return {
          entry,
          status,
          type: "league",
          myFixture,
          opponent,
          imHome,
          stadiumTeam,
          myScore,
          opScore,
          won,
          drew,
        };
      }
    })
    .filter(Boolean);

  // ── STATS ─────────────────────────────────────────────
  // Unbeaten run: count from end of list until first loss
  const playedAll = calEntries.filter(
    (e) => e.status === "done" && e.myScore !== null,
  );
  let unbeatenRun = 0;
  for (let i = playedAll.length - 1; i >= 0; i--) {
    const e = playedAll[i];
    if (e.won === false && e.drew !== true) break;
    unbeatenRun++;
  }
  // Next game (home or away)
  const nextGame = calEntries.find(
    (e) => e.status !== "done" && !e.eliminated,
  );
  const nextGameOpponent = nextGame?.opponent;
  const nextGameVenue =
    nextGame?.stadiumTeam?.stadium_name ?? null;
  const nextGameIsHome = nextGame?.imHome;

  // Team logo circle helper
  const TeamCircle = ({ team, size = "lg" }) => {
    const sz =
      size === "lg"
        ? "w-10 h-10 text-base"
        : "w-7 h-7 text-xs";
    return (
      <div
        className={`${sz} rounded-full flex items-center justify-center font-black shrink-0 border border-white/10`}
        style={{
          background: team?.color_primary || "#333",
          color: team?.color_secondary || "#fff",
        }}
      >
        {team?.name?.[0] ?? "?"}
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {/* ── PAGE HEADER ──────────────────────────────────── */}
      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/60 mb-1">
          Timeline do Treinador
        </p>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-headline font-black text-on-surface leading-tight">
              Calendário de Competições
            </h2>
            <p className="text-sm text-on-surface-variant mt-0.5">
              Temporada {calYear}
              {myTeam ? ` · ${myTeam.name}` : ""}
            </p>
          </div>
          {/* Filter tabs */}
          <div className="flex items-center gap-1 bg-surface-container-high rounded-lg p-1">
            {[
              ["all", "Todos"],
              ["league", "Liga"],
              ["cup", "Taça"],
            ].map(([val, label]) => (
              <button
                key={val}
                onClick={() => setCalFilter(val)}
                className={`px-3 py-1 rounded text-xs font-black uppercase tracking-wide transition-all ${
                  calFilter === val
                    ? "bg-primary text-white shadow"
                    : "text-on-surface-variant hover:text-on-surface"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── LOADING STATE ─────────────────────────────────── */}
      {!cal && (
        <div className="bg-surface-container rounded-lg p-10 text-center">
          <span className="material-symbols-outlined text-4xl text-on-surface-variant/40 block mb-2">
            calendar_month
          </span>
          <p className="text-on-surface-variant font-bold text-sm">
            A carregar calendário…
          </p>
        </div>
      )}

      {/* ── SEASON STATS ──────────────────────────────────── */}
      {cal && (
        <div className="grid grid-cols-2 gap-3">
          {/* Unbeaten run */}
          <div className="bg-surface-container rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[9px] font-black uppercase tracking-widest text-on-surface-variant/60">
                Invencibilidade
              </span>
              <span className="material-symbols-outlined text-base text-amber-400">
                emoji_events
              </span>
            </div>
            <p className="text-3xl font-headline font-black leading-none mb-1 text-on-surface">
              {String(unbeatenRun).padStart(2, "0")}
            </p>
            <p className="text-[9px] text-on-surface-variant/60 uppercase tracking-wide font-bold">
              {unbeatenRun === 1
                ? "1 jogo"
                : `${unbeatenRun} jogos`}{" "}
              sem derrota
            </p>
          </div>
          {/* Next game */}
          <div className="bg-surface-container rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[9px] font-black uppercase tracking-widest text-on-surface-variant/60">
                Próximo Jogo
              </span>
              <span className="material-symbols-outlined text-base text-on-surface-variant/60">
                {nextGameIsHome === false
                  ? "flight_takeoff"
                  : "home"}
              </span>
            </div>
            <p className="text-base font-headline font-black leading-tight mb-1 text-on-surface truncate">
              {nextGameOpponent?.name ?? "—"}
            </p>
            <p className="text-[9px] text-on-surface-variant/60 uppercase tracking-wide font-bold truncate">
              {nextGameVenue ??
                (nextGameIsHome
                  ? "Casa"
                  : nextGameIsHome === false
                    ? "Deslocação"
                    : "—")}
            </p>
          </div>
        </div>
      )}

      {/* ── MATCH TIMELINE ────────────────────────────────── */}
      {cal && (
        <div className="space-y-2">
          {calEntries.length === 0 && (
            <div className="bg-surface-container rounded-lg p-8 text-center">
              <p className="text-on-surface-variant text-sm">
                Sem jogos para mostrar.
              </p>
            </div>
          )}
          {calEntries.map(
            ({
              entry,
              status,
              type,
              eliminated,
              opponent,
              imHome,
              stadiumTeam,
              myScore,
              opScore,
              won,
              drew,
              hasPen,
              myPen,
              opPen,
            }) => {
              // ── Eliminated from cup ──────────────────
              if (eliminated) {
                const weekLabel = entry.roundName;
                return (
                  <div
                    key={entry.calendarIndex}
                    className="flex items-stretch gap-0 rounded-lg overflow-hidden opacity-40 bg-surface-container border-l-2 border-l-red-800"
                  >
                    <div className="w-16 sm:w-28 shrink-0 flex flex-col justify-center gap-1 px-2 sm:px-3 py-3 border-r border-outline-variant/10">
                      <span className="text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded self-start bg-red-900/30 text-red-400">
                        Taça
                      </span>
                      <span className="text-[10px] font-black text-on-surface leading-tight">
                        {weekLabel}
                      </span>
                    </div>
                    <div className="flex-1 flex items-center gap-3 px-4 py-3 min-w-0">
                      <div className="shrink-0 w-8 h-8 rounded flex items-center justify-center text-xs font-black border border-red-800/30 text-red-600 bg-red-900/10">
                        🏆
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-sm font-black text-red-500 leading-tight">
                          Eliminado da Taça
                        </span>
                        <span className="text-[10px] text-on-surface-variant/40">
                          {entry.roundName}
                        </span>
                      </div>
                    </div>
                    <div className="shrink-0 flex items-center justify-end px-4 py-3">
                      <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded bg-red-900/20 text-red-600">
                        Eliminado
                      </span>
                    </div>
                  </div>
                );
              }

              const isCurrent = status === "current";
              const isDone = status === "done";

              // result outcome class
              const outcomeClass =
                !isDone || myScore === null
                  ? ""
                  : won
                    ? "border-l-2 border-l-emerald-500"
                    : drew
                      ? "border-l-2 border-l-amber-500"
                      : "border-l-2 border-l-red-500";

              const cardBase = `flex items-stretch gap-0 rounded-lg overflow-hidden transition-opacity ${
                isDone
                  ? "bg-surface-container"
                  : isCurrent
                    ? "bg-surface-container border border-primary/40"
                    : "bg-surface-container opacity-60"
              } ${outcomeClass}`;

              // Left date column content
              const weekLabel =
                type === "cup"
                  ? entry.roundName
                  : `Jornada ${entry.matchweek}`;

              // Score/status right column
              const scoreBlock =
                isDone && myScore !== null ? (
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-[9px] font-black uppercase tracking-widest text-on-surface-variant/60">
                      Resultado
                    </span>
                    <span
                      className={`text-xl font-headline font-black leading-none ${
                        won
                          ? "text-emerald-400"
                          : drew
                            ? "text-amber-400"
                            : "text-red-400"
                      }`}
                    >
                      {imHome ? myScore : opScore} –{" "}
                      {imHome ? opScore : myScore}
                    </span>
                    {hasPen && (
                      <span className="text-[9px] text-amber-400 font-bold">
                        {imHome ? myPen : opPen}–
                        {imHome ? opPen : myPen} gp
                      </span>
                    )}
                    <span
                      className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded ${
                        won
                          ? "bg-emerald-500/20 text-emerald-400"
                          : drew
                            ? "bg-amber-500/20 text-amber-400"
                            : "bg-red-500/20 text-red-400"
                      }`}
                    >
                      {won
                        ? "Vitória"
                        : drew
                          ? "Empate"
                          : "Derrota"}
                      {type === "cup" && !won && !drew
                        ? " · Eliminado"
                        : ""}
                    </span>
                  </div>
                ) : isCurrent ? (
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-[9px] font-black uppercase tracking-widest text-on-surface-variant/60">
                      Próximo Jogo
                    </span>
                    <span className="text-xl font-headline font-black text-on-surface-variant/60">
                      VS
                    </span>
                    <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded bg-primary/20 text-primary animate-pulse">
                      Ativo
                    </span>
                  </div>
                ) : (
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded bg-surface-bright text-on-surface-variant/40">
                      Agendado
                    </span>
                  </div>
                );

              return (
                <div
                  key={entry.calendarIndex}
                  className={cardBase}
                >
                  {/* Left: matchweek + competition type */}
                  <div className="w-16 sm:w-28 shrink-0 flex flex-col justify-center gap-1 px-2 sm:px-3 py-3 border-r border-outline-variant/10">
                    <span
                      className={`text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded self-start ${
                        type === "cup"
                          ? "bg-amber-500/20 text-amber-400"
                          : "bg-primary/20 text-primary"
                      }`}
                    >
                      {type === "cup" ? "Taça" : "Liga"}
                    </span>
                    <span className="text-[10px] font-black text-on-surface leading-tight">
                      {weekLabel}
                    </span>
                    {!(type === "cup" && !opponent) && (
                      <span
                        className={`hidden sm:inline-block text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded self-start ${
                          imHome
                            ? "bg-emerald-500/20 text-emerald-400"
                            : "bg-sky-500/20 text-sky-400"
                        }`}
                      >
                        {imHome ? "Casa" : "Fora"}
                      </span>
                    )}
                    {isCurrent && (
                      <span className="text-[9px] text-primary font-bold">
                        Hoje
                      </span>
                    )}
                  </div>

                  {/* Center: teams + stadium */}
                  <div className="flex-1 flex items-center gap-2 sm:gap-3 px-2 sm:px-4 py-3 min-w-0">
                    {/* Type icon — hidden on mobile */}
                    <div
                      className={`hidden sm:flex shrink-0 w-8 h-8 rounded items-center justify-center text-xs font-black border ${
                        type === "cup"
                          ? "border-amber-500/30 text-amber-400 bg-amber-500/10"
                          : "border-primary/30 text-primary bg-primary/10"
                      }`}
                    >
                      {type === "cup" ? "🏆" : "⚽"}
                    </div>
                    {/* Opponent logo */}
                    <TeamCircle team={opponent} />
                    {/* Opponent info */}
                    <div className="flex flex-col min-w-0">
                      <button
                        className="text-sm font-black text-on-surface text-left truncate hover:text-primary transition-colors"
                        onClick={() =>
                          opponent &&
                          handleOpenTeamSquad(opponent)
                        }
                      >
                        {opponent?.name ?? "TBD"}
                      </button>
                      <span className="hidden sm:block text-[10px] text-on-surface-variant/60 truncate">
                        {stadiumTeam?.stadium_name
                          ? `${stadiumTeam.stadium_name.toUpperCase()} (${imHome ? "Casa" : "Fora"})`
                          : imHome
                            ? "Casa"
                            : (type === "cup" && !opponent)
                              ? "—"
                              : "Fora"}
                      </span>
                      {/* Mobile-only home/away indicator */}
                      {!(type === "cup" && !opponent) && (
                        <span
                          className={`sm:hidden text-[8px] font-black uppercase tracking-widest ${
                            imHome
                              ? "text-emerald-400"
                              : "text-sky-400"
                          }`}
                        >
                          {imHome ? "Casa" : "Fora"}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Right: score/status */}
                  <div className="shrink-0 flex items-center justify-end px-2 sm:px-4 py-3">
                    {scoreBlock}
                  </div>
                </div>
              );
            },
          )}
        </div>
      )}

      {/* ── END OF CALENDAR ────────── */}
    </div>
  );
}
