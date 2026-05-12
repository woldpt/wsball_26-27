import { useState, useMemo, useEffect, startTransition } from "react";

const ROUND_NAMES = [
  "",
  "16 avos de final",
  "Oitavos de final",
  "Quartos de final",
  "Meias-finais",
  "Final",
];
const ROUND_SHORT = ["", "16 avos", "Oitavos", "Quartos", "Meias", "Final"];

// ── Bracket layout constants (px) ──────────────────────────────────────────
const BK_CARD_H = 60;
const BK_CARD_W = 176;
const BK_GAP_W = 48;
const BK_SLOT_H = 84; // vertical slot per QF match
const BK_PAIR_GAP = 32; // extra gap between the two QF pairs

// Pre-computed vertical positions
const QF_TOPS = [
  0,
  BK_SLOT_H,
  BK_SLOT_H * 2 + BK_PAIR_GAP,
  BK_SLOT_H * 3 + BK_PAIR_GAP,
];
const SF_CENTERS = [
  (QF_TOPS[0] + BK_CARD_H / 2 + QF_TOPS[1] + BK_CARD_H / 2) / 2,
  (QF_TOPS[2] + BK_CARD_H / 2 + QF_TOPS[3] + BK_CARD_H / 2) / 2,
];
const SF_TOPS = SF_CENTERS.map((c) => c - BK_CARD_H / 2);
const FN_CENTER = (SF_CENTERS[0] + SF_CENTERS[1]) / 2;
const FN_TOP = FN_CENTER - BK_CARD_H / 2;
const BK_TOTAL_H = QF_TOPS[3] + BK_SLOT_H;

// Horizontal column positions
const QF_X = 0;
const SF_X = BK_CARD_W + BK_GAP_W;
const FN_X = (BK_CARD_W + BK_GAP_W) * 2;
const WN_X = FN_X + BK_CARD_W + 28;
const SVG_W = WN_X + 148;

// SVG connector mid-points
const MID_QF_SF = (BK_CARD_W + SF_X) / 2;
const MID_SF_FN = (SF_X + BK_CARD_W + FN_X) / 2;

// ── Helpers ─────────────────────────────────────────────────────────────────
function winnerOf(match) {
  if (!match?.played || !match.winnerId) return null;
  if (match.winnerId === match.homeTeam?.id) return match.homeTeam;
  if (match.winnerId === match.awayTeam?.id) return match.awayTeam;
  return null;
}

function connColor(match) {
  const w = winnerOf(match);
  return w?.color_primary || "#424843";
}

function connOpacity(match) {
  return match?.played ? 0.65 : 0.25;
}

// ── Compact bracket team row (internal helper, not a component) ──────────────
function BracketTeamRow({ team, isWinner, played, score }) {
  return (
    <div
      className={`flex items-center gap-1.5 px-2 transition-opacity ${
        played && !isWinner ? "opacity-30" : ""
      }`}
      style={{ height: BK_CARD_H / 2 - 1 }}
    >
      <div
        className="w-[18px] h-[18px] rounded-full shrink-0 flex items-center justify-center text-[8px] font-black leading-none"
        style={{
          background: team ? team.color_primary || "#27272a" : "#27272a",
          color: team ? team.color_secondary || "#fff" : "#555",
        }}
      >
        {team ? team.name?.[0] || "?" : ""}
      </div>
      <span
        className="flex-1 truncate text-[10px] font-bold leading-none"
        style={{ color: team?.color_primary || "#9ca3af" }}
      >
        {team?.name || (played ? "?" : "···")}
      </span>
      {played && (
        <span
          className={`text-[11px] font-black tabular-nums shrink-0 ${isWinner ? "text-on-surface" : "text-on-surface-variant/40"}`}
        >
          {score}
        </span>
      )}
    </div>
  );
}

// ── Compact bracket card ─────────────────────────────────────────────────────
function BracketCard({ match, myTeamId }) {
  const {
    homeTeam,
    awayTeam,
    homeScore,
    awayScore,
    homeEtScore,
    awayEtScore,
    homePenalties,
    awayPenalties,
    winnerId,
    played,
  } = match || {};
  const homeWins = played && winnerId === homeTeam?.id;
  const awayWins = played && winnerId === awayTeam?.id;
  const isMyMatch =
    myTeamId && (homeTeam?.id === myTeamId || awayTeam?.id === myTeamId);
  const hasPens = played && (homePenalties > 0 || awayPenalties > 0);
  const finalHome = (homeScore || 0) + (homeEtScore || 0);
  const finalAway = (awayScore || 0) + (awayEtScore || 0);

  return (
    <div
      className={`rounded-lg border overflow-hidden relative transition-all ${
        isMyMatch
          ? "border-amber-500/40 bg-amber-950/25 shadow shadow-amber-500/10"
          : "border-outline-variant/25 bg-surface-container-high"
      }`}
      style={{ width: BK_CARD_W, height: BK_CARD_H }}
    >
      <BracketTeamRow
        team={homeTeam}
        isHome
        isWinner={homeWins}
        played={played}
        score={finalHome}
      />
      <div className="h-px bg-outline-variant/15 mx-2" />
      <BracketTeamRow
        team={awayTeam}
        isHome={false}
        isWinner={awayWins}
        played={played}
        score={finalAway}
      />
      {hasPens && (
        <div className="absolute top-0.5 right-1.5 text-[7px] text-amber-400/60 font-black uppercase tracking-wide">
          g.p.
        </div>
      )}
    </div>
  );
}

// ── Desktop bracket tree (rounds 3-5) ────────────────────────────────────────
function BracketTree({ rounds, myTeamId }) {
  const qf = useMemo(
    () => rounds.find((r) => r.round === 3)?.matches || [],
    [rounds],
  );
  const sf = useMemo(
    () => rounds.find((r) => r.round === 4)?.matches || [],
    [rounds],
  );
  const fn = useMemo(
    () => rounds.find((r) => r.round === 5)?.matches || [],
    [rounds],
  );

  if (!qf.length) return null;

  const winner = fn[0] ? winnerOf(fn[0]) : null;

  const qfsfLines = [
    {
      from: [BK_CARD_W, QF_TOPS[0] + BK_CARD_H / 2],
      to: [SF_X, SF_CENTERS[0]],
      m: qf[0],
    },
    {
      from: [BK_CARD_W, QF_TOPS[1] + BK_CARD_H / 2],
      to: [SF_X, SF_CENTERS[0]],
      m: qf[1],
    },
    {
      from: [BK_CARD_W, QF_TOPS[2] + BK_CARD_H / 2],
      to: [SF_X, SF_CENTERS[1]],
      m: qf[2],
    },
    {
      from: [BK_CARD_W, QF_TOPS[3] + BK_CARD_H / 2],
      to: [SF_X, SF_CENTERS[1]],
      m: qf[3],
    },
  ];
  const sffnLines = [
    {
      from: [SF_X + BK_CARD_W, SF_CENTERS[0]],
      to: [FN_X, FN_CENTER],
      m: sf[0],
    },
    {
      from: [SF_X + BK_CARD_W, SF_CENTERS[1]],
      to: [FN_X, FN_CENTER],
      m: sf[1],
    },
  ];

  return (
    <div className="overflow-x-auto pb-2">
      <div
        className="relative"
        style={{ width: SVG_W, height: BK_TOTAL_H + 20, paddingTop: 20 }}
      >
        {/* Column labels */}
        {[
          { label: "Quartos de final", x: QF_X },
          { label: "Meias-finais", x: SF_X },
          { label: "Final", x: FN_X },
        ].map(({ label, x }) => (
          <div
            key={label}
            className="absolute text-[8px] font-black uppercase tracking-widest text-on-surface-variant/30"
            style={{ left: x, top: 0 }}
          >
            {label}
          </div>
        ))}

        {/* SVG connector lines */}
        <svg
          className="absolute left-0 pointer-events-none"
          style={{ top: 20 }}
          width={SVG_W}
          height={BK_TOTAL_H}
        >
          {qfsfLines.map((l, i) => (
            <path
              key={`qf-${i}`}
              d={`M ${l.from[0]},${l.from[1]} H ${MID_QF_SF} V ${l.to[1]} H ${l.to[0]}`}
              fill="none"
              stroke={connColor(l.m)}
              strokeWidth="1.5"
              strokeOpacity={connOpacity(l.m)}
            />
          ))}
          {sf.length > 0 &&
            sffnLines.map((l, i) => (
              <path
                key={`sf-${i}`}
                d={`M ${l.from[0]},${l.from[1]} H ${MID_SF_FN} V ${l.to[1]} H ${l.to[0]}`}
                fill="none"
                stroke={connColor(l.m)}
                strokeWidth="1.5"
                strokeOpacity={connOpacity(l.m)}
              />
            ))}
        </svg>

        {/* QF cards */}
        {qf.slice(0, 4).map((m, i) => (
          <div
            key={i}
            className="absolute"
            style={{ left: QF_X, top: 20 + QF_TOPS[i] }}
          >
            <BracketCard match={m} myTeamId={myTeamId} />
          </div>
        ))}

        {/* SF cards */}
        {sf.slice(0, 2).map((m, i) => (
          <div
            key={i}
            className="absolute"
            style={{ left: SF_X, top: 20 + SF_TOPS[i] }}
          >
            <BracketCard match={m} myTeamId={myTeamId} />
          </div>
        ))}

        {/* Final card */}
        {fn.length > 0 && (
          <div className="absolute" style={{ left: FN_X, top: 20 + FN_TOP }}>
            <BracketCard match={fn[0]} myTeamId={myTeamId} />
          </div>
        )}

        {/* Champion display */}
        <div
          className="absolute flex flex-col items-center justify-center gap-2 text-center"
          style={{
            left: WN_X,
            top: 20 + FN_TOP - 28,
            width: 140,
            height: BK_CARD_H + 56,
          }}
        >
          {winner ? (
            <>
              <span
                className="material-symbols-outlined text-amber-400"
                style={{
                  fontSize: 30,
                  filter: "drop-shadow(0 0 8px rgba(245,158,11,0.6))",
                }}
              >
                emoji_events
              </span>
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-black border-2 border-amber-500/50 shadow-lg shadow-amber-500/20"
                style={{
                  background: winner.color_primary,
                  color: winner.color_secondary,
                }}
              >
                {winner.name?.[0]}
              </div>
              <div>
                <div
                  className="text-[10px] font-black"
                  style={{ color: winner.color_primary }}
                >
                  {winner.name}
                </div>
                <div className="text-[8px] text-amber-400/70 font-black uppercase tracking-wider">
                  Campeão
                </div>
              </div>
            </>
          ) : fn.length > 0 ? (
            <>
              <span
                className="material-symbols-outlined text-amber-400/30 animate-pulse"
                style={{ fontSize: 30 }}
              >
                emoji_events
              </span>
              <div className="text-[9px] text-on-surface-variant/30 font-bold uppercase tracking-wider animate-pulse">
                Por disputar
              </div>
            </>
          ) : (
            <span
              className="material-symbols-outlined text-amber-400/20"
              style={{ fontSize: 30 }}
            >
              emoji_events
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Full match row (list view) ────────────────────────────────────────────────
function MatchRow({ match, myTeamId, players }) {
  if (!match) return null;
  const {
    homeTeam,
    awayTeam,
    homeScore,
    awayScore,
    homeEtScore,
    awayEtScore,
    homePenalties,
    awayPenalties,
    winnerId,
    played,
  } = match;
  const homeWins = played && winnerId === homeTeam?.id;
  const awayWins = played && winnerId === awayTeam?.id;
  const isMyMatch =
    myTeamId && (homeTeam?.id === myTeamId || awayTeam?.id === myTeamId);
  const hasPens = played && (homePenalties > 0 || awayPenalties > 0);
  const hadET = played && (homeEtScore || 0) + (awayEtScore || 0) > 0;
  const finalHome = (homeScore || 0) + (homeEtScore || 0);
  const finalAway = (awayScore || 0) + (awayEtScore || 0);
  const homeCoach = players?.find((p) => p.teamId === homeTeam?.id)?.name;
  const awayCoach = players?.find((p) => p.teamId === awayTeam?.id)?.name;

  return (
    <div
      className={`relative flex items-center gap-3 px-4 py-3.5 rounded-lg border transition-all ${
        isMyMatch
          ? "border-amber-500/45 bg-amber-950/20"
          : "border-outline-variant/20 bg-surface-container"
      }`}
    >
      {isMyMatch && (
        <span className="absolute -top-2 left-4 px-2 py-0.5 bg-amber-500 text-black text-[8px] font-black uppercase rounded-full tracking-widest">
          O seu jogo
        </span>
      )}

      {/* Home */}
      <div
        className={`flex-1 flex items-center justify-end gap-2 min-w-0 ${played && !homeWins ? "opacity-35" : ""}`}
      >
        <div className="text-right min-w-0">
          <span
            className="block font-black text-xs truncate"
            style={{ color: homeTeam?.color_primary || "#e5e2e1" }}
          >
            {homeTeam?.name || "?"}
          </span>
          {homeCoach && (
            <span className="block text-[9px] text-amber-400/70 font-bold truncate">
              {homeCoach}
            </span>
          )}
        </div>
        <div
          className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black shrink-0 border ${
            played && homeWins ? "border-[2px] shadow-sm" : "border-white/10"
          }`}
          style={{
            background: homeTeam?.color_primary || "#27272a",
            color: homeTeam?.color_secondary || "#fff",
            borderColor:
              played && homeWins ? homeTeam?.color_primary : undefined,
            boxShadow:
              played && homeWins
                ? `0 0 8px ${homeTeam?.color_primary}50`
                : undefined,
          }}
        >
          {homeTeam?.name?.[0] || "?"}
        </div>
      </div>

      {/* Score / VS */}
      <div className="shrink-0 flex flex-col items-center gap-0.5">
        {played ? (
          <>
            <span className="font-black text-sm text-on-surface tabular-nums">
              {finalHome} – {finalAway}
            </span>
            {hadET && !hasPens && (
              <span className="text-[8px] text-on-surface-variant/50 font-bold uppercase tracking-wide">
                p.e.
              </span>
            )}
            {hasPens && (
              <span className="text-[8px] text-amber-400/70 font-bold">
                (g.p. {homePenalties}–{awayPenalties})
              </span>
            )}
          </>
        ) : (
          <span className="text-xs font-black text-on-surface-variant/30 animate-pulse">
            vs
          </span>
        )}
      </div>

      {/* Away */}
      <div
        className={`flex-1 flex items-center gap-2 min-w-0 ${played && !awayWins ? "opacity-35" : ""}`}
      >
        <div
          className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black shrink-0 border ${
            played && awayWins ? "border-[2px] shadow-sm" : "border-white/10"
          }`}
          style={{
            background: awayTeam?.color_primary || "#27272a",
            color: awayTeam?.color_secondary || "#fff",
            borderColor:
              played && awayWins ? awayTeam?.color_primary : undefined,
            boxShadow:
              played && awayWins
                ? `0 0 8px ${awayTeam?.color_primary}50`
                : undefined,
          }}
        >
          {awayTeam?.name?.[0] || "?"}
        </div>
        <div className="min-w-0">
          <span
            className="block font-black text-xs truncate"
            style={{ color: awayTeam?.color_primary || "#e5e2e1" }}
          >
            {awayTeam?.name || "?"}
          </span>
          {awayCoach && (
            <span className="block text-[9px] text-amber-400/70 font-bold truncate">
              {awayCoach}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main page component ───────────────────────────────────────────────────────
export function CupBracketPage({ bracketData, me, players, onRequestRefresh }) {
  const rounds = useMemo(() => bracketData?.rounds || [], [bracketData]);

  // Most advanced round with match data
  const activeRound = useMemo(() => {
    for (let r = 5; r >= 1; r--) {
      if (rounds.find((rd) => rd.round === r)?.matches?.length > 0) return r;
    }
    return 1;
  }, [rounds]);

  const [selectedRound, setSelectedRound] = useState(null);

  useEffect(() => {
    if (bracketData) startTransition(() => setSelectedRound(activeRound));
  }, [bracketData, activeRound]);

  const currentRound = selectedRound ?? activeRound;
  const currentRoundData = rounds.find((r) => r.round === currentRound);

  // ── Loading ────────────────────────────────────────────────────────────────
  if (!bracketData) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <span
          className="material-symbols-outlined text-amber-400/30 animate-pulse"
          style={{ fontSize: 48 }}
        >
          emoji_events
        </span>
        <p className="text-on-surface-variant/40 font-bold text-sm">
          A carregar…
        </p>
        <button
          onClick={onRequestRefresh}
          className="text-xs text-primary/50 hover:text-primary transition-colors font-bold"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  // ── No data ────────────────────────────────────────────────────────────────
  if (!rounds.length || !rounds.some((r) => r.matches?.length > 0)) {
    return (
      <div className="bg-surface-container rounded-xl border border-outline-variant/20 p-10 text-center">
        <span
          className="material-symbols-outlined text-amber-400/20 block mb-3"
          style={{ fontSize: 48 }}
        >
          emoji_events
        </span>
        <p className="text-on-surface-variant/60 font-bold text-sm">
          A Taça de Portugal ainda não começou esta época.
        </p>
      </div>
    );
  }

  // Progress stat
  const totalRounds = 5;
  const completedRounds = rounds.filter(
    (r) => r.matches?.length > 0 && r.matches.every((m) => m.played),
  ).length;
  const champion = (() => {
    const fn = rounds.find((r) => r.round === 5);
    return fn ? winnerOf(fn.matches?.[0]) : null;
  })();

  return (
    <div className="space-y-5">
      {/* ── HEADER ──────────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-xl bg-surface-container border border-amber-900/25">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-12 -right-12 w-56 h-56 rounded-full bg-amber-500/7 blur-3xl" />
          <div className="absolute -bottom-6 -left-6 w-40 h-40 rounded-full bg-amber-500/5 blur-2xl" />
        </div>
        <div className="relative px-5 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <span
              className="material-symbols-outlined text-amber-400"
              style={{
                fontSize: 32,
                filter: champion
                  ? "drop-shadow(0 0 10px rgba(245,158,11,0.7))"
                  : undefined,
              }}
            >
              emoji_events
            </span>
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.25em] text-amber-400/70">
                Taça de Portugal · Temporada {bracketData.season}
              </p>
              <h2 className="font-headline font-black text-xl text-on-surface leading-tight">
                Árvore de Knockout
              </h2>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            {champion ? (
              <div className="flex items-center gap-1.5">
                <div
                  className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black"
                  style={{
                    background: champion.color_primary,
                    color: champion.color_secondary,
                  }}
                >
                  {champion.name?.[0]}
                </div>
                <span
                  className="text-[9px] font-black uppercase tracking-wider"
                  style={{ color: champion.color_primary }}
                >
                  {champion.name}
                </span>
                <span className="text-[8px] text-amber-400/60 font-bold">
                  Campeão
                </span>
              </div>
            ) : (
              <span className="text-[9px] text-on-surface-variant/40 font-bold uppercase tracking-wider">
                Em curso
              </span>
            )}
            <div className="flex items-center gap-1">
              {Array.from({ length: totalRounds }).map((_, i) => (
                <div
                  key={i}
                  className={`rounded-full transition-all ${
                    i < completedRounds
                      ? "bg-amber-400 w-2 h-2"
                      : i === completedRounds
                        ? "bg-amber-400/40 w-2 h-2 animate-pulse"
                        : "bg-outline-variant/30 w-1.5 h-1.5"
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── ROUND PILLS ─────────────────────────────────────────────────────── */}
      <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-1">
        {[1, 2, 3, 4, 5].map((r) => {
          const rd = rounds.find((x) => x.round === r);
          const hasData = (rd?.matches?.length || 0) > 0;
          const allPlayed = hasData && rd.matches.every((m) => m.played);
          const isActive = currentRound === r;
          const isFuture = !hasData;

          return (
            <button
              key={r}
              onClick={() => hasData && setSelectedRound(r)}
              disabled={isFuture}
              className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${
                isActive
                  ? "bg-amber-500 text-black shadow-lg shadow-amber-500/20"
                  : isFuture
                    ? "bg-surface-container/50 text-on-surface-variant/20 cursor-not-allowed"
                    : "bg-surface-container-high text-on-surface-variant hover:bg-surface-bright hover:text-on-surface"
              }`}
            >
              {allPlayed && !isActive && (
                <span className="material-symbols-outlined text-[10px] leading-none text-primary/60">
                  check
                </span>
              )}
              {ROUND_SHORT[r]}
            </button>
          );
        })}
      </div>

      {/* ── DESKTOP BRACKET TREE (rounds 3-5 only) ──────────────────────────── */}
      {currentRound >= 3 && (
        <div className="hidden lg:block">
          <div className="bg-surface-container rounded-xl border border-outline-variant/15 px-6 pt-3 pb-6">
            <BracketTree rounds={rounds} myTeamId={me?.teamId} />
          </div>
        </div>
      )}

      {/* ── MATCH LIST ──────────────────────────────────────────────────────── */}
      <div className="space-y-2">
        <div className="flex items-center gap-3 px-1 mb-1">
          <span className="text-[9px] font-black uppercase tracking-widest text-on-surface-variant/45">
            {ROUND_NAMES[currentRound]}
          </span>
          <div className="flex-1 h-px bg-outline-variant/15" />
          {currentRoundData && (
            <span className="text-[9px] text-on-surface-variant/35 font-bold shrink-0">
              {currentRoundData.matches.filter((m) => m.played).length} /{" "}
              {currentRoundData.matches.length} jogados
            </span>
          )}
        </div>

        {(currentRoundData?.matches || []).map((match, i) => (
          <MatchRow
            key={match.id ?? i}
            match={match}
            myTeamId={me?.teamId}
            players={players}
          />
        ))}

        {!currentRoundData?.matches?.length && (
          <div className="bg-surface-container rounded-lg px-4 py-8 text-center">
            <p className="text-on-surface-variant/40 text-sm font-bold">
              Sem jogos nesta ronda.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
