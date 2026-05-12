import { AggBadge } from "../components/shared/AggBadge.jsx";
import { PlayerLink } from "../components/shared/PlayerLink.jsx";
import {
  FLAG_TO_COUNTRY,
  DIVISION_NAMES,
  ENABLE_ROW_BG,
  POSITION_TEXT_CLASS,
  POSITION_BG_CLASS,
  POSITION_BORDER_CLASS,
  POSITION_LABEL_MAP,
} from "../constants/index.js";
import { generateLeagueFixtures } from "../utils/fixtures.js";
import { getPlayerStat } from "../utils/playerHelpers.js";
import { formatCurrency } from "../utils/formatters.js";
import { isSameTeamId } from "../utils/teamHelpers.js";
import { useState } from "react";

/**
 * @param {{
 *   selectedTeam: object|null,
 *   selectedTeamSquad: Array,
 *   selectedTeamLoading: boolean,
 *   me: object|null,
 *   players: Array,
 *   palmares: object,
 *   palmaresTeamId: number|null,
 *   setTransferProposalModal: function,
 *   myBudget: number,
 *   currentMatchweek: number,
 *   calendarData,
 *   teams,
 * }} props
 */
export function TeamSquadView({
  selectedTeam,
  selectedTeamSquad,
  selectedTeamLoading,
  me,
  players,
  palmares,
  palmaresTeamId,
  setTransferProposalModal,
  myBudget = 0,
  currentMatchweek = 1,
  calendarData,
  teams,
}) {
  const [activeTab, setActiveTab] = useState("squad");

  const isOwnTeam = isSameTeamId(selectedTeam?.id, me?.teamId);
  const isNpcTeam =
    !isOwnTeam &&
    !players.some((p) => isSameTeamId(p.teamId, selectedTeam?.id));
  const showProposalCol = isNpcTeam;
  const colCount = showProposalCol ? 10 : 9;

  const selectedTeamDivision = selectedTeam?.division;
  const selectedDivTeams = teams
    .filter((t) => t.division === selectedTeamDivision)
    .sort((a, b) => a.id - b.id);

  const seasonYear = calendarData?.year ?? new Date().getFullYear();

  const getTeamFixtures = () => {
    const curIdx = calendarData?.calendarIndex ?? 0;
    const cal = calendarData;



    const calEntries = (calendarData?.leagueMatches ?? [])
      .filter((m) =>
        selectedDivTeams.some((t) => t.id === m.home_team_id) &&
        selectedDivTeams.some((t) => t.id === m.away_team_id)
      )
      .map((m) => ({
        homeTeamId: m.home_team_id,
        awayTeamId: m.away_team_id,
        result: m,
      }))
      .filter((f) => f.homeTeamId === selectedTeam.id || f.awayTeamId === selectedTeam.id);

    const futureFixtures = [];
    for (let mw = curIdx + 1; mw <= 14; mw++) {
      const fixtures = generateLeagueFixtures(
        cal?.fixtureSeeds?.[selectedTeamDivision] ?? selectedDivTeams.map((t) => t.id),
        mw
      ).map((f) => ({ ...f, result: null }));
      const myFixture = fixtures.find(
        (f) => f.homeTeamId === selectedTeam.id || f.awayTeamId === selectedTeam.id
      );
      if (myFixture) {
        futureFixtures.push({
          homeTeamId: myFixture.homeTeamId,
          awayTeamId: myFixture.awayTeamId,
          result: null,
          matchweek: mw,
          calendarIndex: mw - 1,
        });
      }
    }

    const processed = [...calEntries, ...futureFixtures].map((fixture) => {
      const imHome = fixture.homeTeamId === selectedTeam.id;
      const opponent = teams.find(
        (t) => t.id === (imHome ? fixture.awayTeamId : fixture.homeTeamId)
      );
      const stadiumTeam = imHome ? selectedTeam : opponent;
      const myScore = fixture.result
        ? imHome
          ? fixture.result.home_score
          : fixture.result.away_score
        : null;
      const opScore = fixture.result
        ? imHome
          ? fixture.result.away_score
          : fixture.result.home_score
        : null;
      const won = fixture.result
        ? imHome
          ? fixture.result.home_score > fixture.result.away_score
          : fixture.result.away_score > fixture.result.home_score
        : null;
      const drew = fixture.result
        ? fixture.result.home_score === fixture.result.away_score
        : null;
      return {
        fixture,
        imHome,
        opponent,
        stadiumTeam,
        myScore,
        opScore,
        won,
        drew,
      };
    });

    return processed;
  };

  return (
    <div className="min-h-screen w-full bg-surface text-on-surface flex flex-col">
      {/* Header */}
      <div
        className="relative px-6 py-8 border-b border-zinc-800 overflow-hidden"
        style={{
          background: selectedTeam.color_primary || "#18181b",
        }}
      >
        {/* Ambient glow blobs */}
        <div
          className="pointer-events-none absolute -top-16 -left-16 w-80 h-80 rounded-full blur-[100px] opacity-15"
          style={{ background: selectedTeam.color_primary || "#2d6a4f" }}
        />
        <div
          className="pointer-events-none absolute top-24 -right-16 w-64 h-64 rounded-full blur-[80px] opacity-10"
          style={{ background: selectedTeam.color_secondary || "#e9c349" }}
        />

        {/* Gradient overlay */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: selectedTeam.color_primary
              ? `linear-gradient(to right, ${selectedTeam.color_primary}40, transparent 70%)`
              : "linear-gradient(to right, #2d6a4f40, transparent 70%)",
          }}
        />

        {/* Hero section */}
        <div className="relative flex flex-col sm:flex-row gap-5 items-start sm:items-center">
          {/* Team badge */}
          <div
            className="w-20 h-20 rounded-xl flex items-center justify-center text-4xl font-black shrink-0 shadow-lg border border-white/10"
            style={{
              background: selectedTeam.color_primary || "#201f1f",
              color: selectedTeam.color_secondary || "#fff",
            }}
          >
            {selectedTeam.name?.[0] || "?"}
          </div>

          {/* Team info */}
          <div className="flex-1 min-w-0">
            <p
              className="text-xs uppercase tracking-widest font-black mb-1"
              style={{ color: selectedTeam.color_secondary || "#fff" }}
            >
              {DIVISION_NAMES[selectedTeam.division] ||
                `Divisão ${selectedTeam.division}`}
            </p>
            <h1
              className="font-headline text-3xl md:text-4xl font-black tracking-tighter leading-none mb-1 truncate"
              style={{ color: selectedTeam.color_secondary || "#ffffff" }}
            >
              {selectedTeam.name}
            </h1>
            <p className="text-sm text-on-surface-variant/80 font-bold">
              Época {seasonYear}
            </p>
          </div>

          {/* Manager */}
          {isOwnTeam && (
            <div className="shrink-0 text-right hidden sm:block">
              <p className="text-[10px] uppercase tracking-widest text-on-surface-variant/80 font-black mb-1">
                Manager
              </p>
              <p className="font-headline font-black text-on-surface text-lg tracking-tight">
                {me?.name || "—" }
              </p>
            </div>
          )}
        </div>

        {/* Budget widget (only for own team) */}
        {isOwnTeam && (
          <div className="relative mt-5">
            <div
              className="bg-surface-container-high rounded-lg p-4 flex flex-col justify-between border-t-2"
              style={{
                borderColor: selectedTeam.color_primary || "#2d6a4f",
              }}
            >
              <div className="flex justify-between items-start mb-2">
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-on-surface-variant font-black mb-1.5">
                    Saldo Disponível
                  </p>
                  <p
                    className={`font-headline text-2xl font-black ${
                      myBudget >= 0
                        ? "text-on-surface"
                        : "text-error"
                    }`}
                  >
                    {formatCurrency(myBudget)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="relative mt-5 flex items-center gap-1 bg-surface-container-high rounded-lg p-2">
          <button
            onClick={() => setActiveTab("squad")}
            className={`px-4 py-2 rounded text-sm font-black uppercase tracking-wide transition-all ${
              activeTab === "squad"
                ? "bg-primary text-white shadow"
                : "text-on-surface-variant hover:text-on-surface"
            }`}
          >
            Plantel
          </button>
          <button
            onClick={() => setActiveTab("calendar")}
            className={`px-4 py-2 rounded text-sm font-black uppercase tracking-wide transition-all ${
              activeTab === "calendar"
                ? "bg-primary text-white shadow"
                : "text-on-surface-variant hover:text-on-surface"
            }`}
          >
            Calendário
          </button>
        </div>
      </div>

      {/* Palmarés */}
      {activeTab === "squad" &&
        palmaresTeamId === selectedTeam?.id &&
        palmares.trophies?.length > 0 && (
          <div className="border-t border-zinc-800 px-6 py-4">
            <h4 className="text-xs text-amber-400 font-black uppercase tracking-widest mb-3 flex items-center gap-2">
              🏆 Palmarés
            </h4>
            <div className="flex flex-wrap gap-2">
              {palmares.trophies.map((trophy, idx) => (
                <span
                  key={idx}
                  className="px-3 py-1 rounded-full bg-amber-900/30 border border-amber-700/40 text-amber-300 text-xs font-black"
                >
                  🏆 {trophy.achievement} ({trophy.season})
                </span>
              ))}
            </div>
          </div>
        )}

      {/* Content */}
      <div className="overflow-auto flex-1">
        {activeTab === "calendar" ? (
          <div className="space-y-2 p-6">
            {getTeamFixtures().length === 0 && (
              <div className="bg-surface-container rounded-lg p-8 text-center">
                <p className="text-on-surface-variant text-sm">
                  Sem jogos para mostrar.
                </p>
              </div>
            )}
            {getTeamFixtures().map(
              ({
                imHome,
                opponent,
                stadiumTeam,
                myScore,
                opScore,
                won,
                drew,
                fixture,
              }) => {
                const matchweek = fixture.matchweek ?? fixture.result?.matchweek ?? 0;
                const status = matchweek <= currentMatchweek ? "done" : "future";
                const isCurrent = matchweek === currentMatchweek;
                const isDone = status === "done";

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

                const weekLabel = `Jornada ${matchweek}`;

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
                    key={matchweek}
                    className={cardBase}
                  >
                    <div className="w-16 sm:w-28 shrink-0 flex flex-col justify-center gap-1 px-2 sm:px-3 py-3 border-r border-outline-variant/10">
                      <span
                        className={`text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded self-start bg-primary/20 text-primary`}
                      >
                        Liga
                      </span>
                      <span className="text-[10px] font-black text-on-surface leading-tight">
                        {weekLabel}
                      </span>
                      {opponent && (
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

                    <div className="flex-1 flex items-center gap-2 sm:gap-3 px-2 sm:px-4 py-3 min-w-0">
                      <div
                        className={`hidden sm:flex shrink-0 w-8 h-8 rounded items-center justify-center text-xs font-black border ${
                          "border-primary/30 text-primary bg-primary/10"
                        }`}
                      >
                        ⚽
                      </div>
                      <div
                        className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-sm font-black border border-white/10 shrink-0"
                        style={{
                          background: opponent?.color_primary || "#333",
                          color: opponent?.color_secondary || "#fff",
                        }}
                      >
                        {opponent?.name?.[0] ?? "?"}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <button
                          className="text-sm font-black text-on-surface text-left truncate hover:text-primary transition-colors"
                          onClick={() =>
                            opponent &&
                            teams.find(t => t.id === opponent.id) &&
                            window.dispatchEvent(new CustomEvent('selectTeam', { detail: opponent }))
                          }
                        >
                          {opponent?.name ?? "TBD"}
                        </button>
                        <span className="hidden sm:block text-[10px] text-on-surface-variant/60 truncate">
                          {stadiumTeam?.stadium_name
                            ? `${stadiumTeam.stadium_name.toUpperCase()} (${imHome ? "Casa" : "Fora"})`
                            : imHome
                              ? "Casa"
                              : "Fora"}
                        </span>
                        {opponent && (
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

                    <div className="shrink-0 flex items-center justify-end px-2 sm:px-4 py-3">
                      {scoreBlock}
                    </div>
                  </div>
                );
              }
            )}
          </div>
        ) : selectedTeamLoading ? (
          <div className="p-8 text-center text-zinc-400 font-bold">
            A carregar plantel...
          </div>
        ) : (
          <table className="w-full min-w-170 text-left border-collapse">
            <thead className="sticky top-0 bg-surface text-on-surface-variant uppercase text-[11px] tracking-widest border-b border-outline-variant/20">
              <tr>
                <th className="px-4 py-3 font-black">Pos</th>
                <th className="px-4 py-3 font-black">Nome</th>
                <th className="px-4 py-3 font-black text-center">Nac.</th>
                <th className="px-4 py-3 font-black text-center">Qual</th>
                <th className="px-4 py-3 font-black text-center">Agr.</th>
                <th className="px-4 py-3 font-black text-center">
                  Golos
                </th>
                <th className="px-4 py-3 font-black text-center">
                  Vermelhos
                </th>
                <th className="px-4 py-3 font-black text-center">
                  Lesões
                </th>
                <th className="px-4 py-3 font-black text-center">
                  Susp.
                </th>
                {showProposalCol && (
                  <th className="px-4 py-3 font-black text-center">
                    Proposta
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {selectedTeamSquad.length === 0 ? (
                <tr>
                  <td
                    colSpan={colCount}
                    className="px-4 py-8 text-center text-zinc-500 font-bold"
                  >
                    Sem jogadores encontrados.
                  </td>
                </tr>
              ) : (
                selectedTeamSquad.map((player) => (
                  <tr
                    key={player.id}
                    className={`hover:bg-zinc-800/50 transition-colors ${ENABLE_ROW_BG ? POSITION_BG_CLASS[player.position] : ""}`}
                  >
                    <td className="px-4 py-2.5 text-center">
                      <span
                        className={`px-2 py-0.5 bg-surface-bright rounded-sm text-[10px] font-black border-l-2 ${POSITION_BORDER_CLASS[player.position] || "border-zinc-500"} ${POSITION_TEXT_CLASS[player.position] || "text-zinc-300"}`}
                      >
                        {POSITION_LABEL_MAP[player.position] ||
                          player.position}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-bold text-white">
                      <PlayerLink playerId={player.id}>
                        {player.name}
                      </PlayerLink>
                      {player.isJunior && (
                        <span className="ml-1 text-[9px] font-black uppercase px-1 py-0.5 rounded bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                          🎓
                        </span>
                      )}
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
                      {(player.transfer_cooldown_until_matchweek || 0) > 0 &&
                        (player.transfer_cooldown_until_matchweek || 0) >= currentMatchweek && (
                        <span
                          className="ml-1"
                          title="Em viagem — disponível na próxima jornada"
                        >
                          ✈️
                        </span>
                      )}
                    </td>
                    <td
                      className="px-4 py-2.5 text-center text-lg"
                      title={
                        FLAG_TO_COUNTRY[player.nationality] ||
                        player.nationality ||
                        "—"
                      }
                    >
                      {player.nationality || "—"}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      {player.prev_skill !== null &&
                        player.prev_skill !== undefined &&
                        player.prev_skill !== player.skill && (
                          <span
                            className={`mr-1 text-xs font-black ${player.skill > player.prev_skill ? "text-emerald-400" : "text-red-400"}`}
                          >
                            {player.skill > player.prev_skill ? "▲" : "▼"}
                          </span>
                        )}
                      <span className="bg-zinc-950 text-white font-black px-2 py-1.5 rounded text-sm border border-zinc-800">
                        {player.skill}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <AggBadge value={player.aggressiveness} />
                    </td>
                    <td className="px-4 py-2.5 text-center font-black text-emerald-400">
                      {getPlayerStat(player, ["goals"])}{" "}
                      <span className="text-zinc-500 text-xs font-normal">
                        ({getPlayerStat(player, ["career_goals"])})
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-center font-black text-red-400">
                      {getPlayerStat(player, ["red_cards"])}{" "}
                      <span className="text-zinc-500 text-xs font-normal">
                        ({getPlayerStat(player, ["career_reds"])})
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-center font-black text-orange-400">
                      {getPlayerStat(player, ["injuries"])}{" "}
                      <span className="text-zinc-500 text-xs font-normal">
                        ({getPlayerStat(player, ["career_injuries"])})
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-center font-black text-amber-400">
                      {getPlayerStat(player, ["suspension_games"])}
                    </td>
                    {showProposalCol && (
                      <td className="px-4 py-2.5 text-center">
                        {!player.isJunior &&
                        Math.round((player.value || 0) * 1.35) <=
                          myBudget ? (
                          <button
                            onClick={() =>
                              setTransferProposalModal({
                                player,
                                suggestedPrice: Math.round(
                                  (player.value || 0) * 1.35,
                                ),
                              })
                            }
                            className="px-3 py-1.5 rounded text-xs font-black uppercase bg-emerald-700 hover:bg-emerald-600 text-white border border-emerald-500 transition-colors whitespace-nowrap"
                          >
                            Proposta
                          </button>
                        ) : (
                          <span className="text-[10px] text-zinc-600 font-bold uppercase">
                            Sem saldo
                          </span>
                        )}
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
