import { formatCurrency } from "../../utils/formatters.js";

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

function SkillBar({ label, value, maxValue = 20, color }) {
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

/**
 * @param {{ playerHistoryModal: object|null, setPlayerHistoryModal: function }} props
 */
export function PlayerHistoryModal({
  playerHistoryModal,
  setPlayerHistoryModal,
}) {
  if (!playerHistoryModal) return null;

  const { player, transfers } = playerHistoryModal;
  if (!player) return null;

  const pos = player.position; // GR | DEF | MED | ATA
  const barColor = POS_BAR[pos] || "#95d4b3";
  const goals = player.career_goals ?? player.goals ?? 0;
  const reds = player.career_reds ?? player.red_cards ?? 0;
  const injuries = player.career_injuries ?? player.injuries ?? 0;
  const form = player.form ?? 10;
  const formPct = Math.min(100, Math.round((form / 20) * 100));
  const skill = player.skill ?? 0;
  const skillPct = Math.min(100, Math.round((skill / 20) * 100));
  const isStar = player.is_star === 1;

  // Availability badge
  let availBadge = null;
  if (player.suspension_until_matchweek > 0) {
    availBadge = (
      <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-sm bg-error-container/50 text-error border border-error/20 tracking-widest">
        🟥 Suspenso
      </span>
    );
  } else if (player.injury_until_matchweek > 0) {
    availBadge = (
      <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-sm bg-error-container/30 text-error border border-error/20 tracking-widest">
        🩹 Lesionado
      </span>
    );
  }

  return (
    <div
      className="fixed inset-0 z-200 flex items-center justify-center bg-black/75 p-3 sm:p-6"
      onClick={() => setPlayerHistoryModal(null)}
    >
      <div
        className="bg-surface-container-low border border-outline-variant/20 rounded-xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col"
        style={{ maxHeight: "90vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── IDENTITY HEADER ── */}
        <div className="relative bg-surface-container overflow-hidden">
          {/* subtle position glow */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: `radial-gradient(ellipse at top left, ${barColor}18 0%, transparent 70%)`,
            }}
          />
          <div className="relative flex items-start gap-4 px-6 pt-6 pb-5">
            {/* Position orb */}
            <div className="shrink-0 flex flex-col items-center gap-2 mt-1">
              <div
                className={`px-2.5 py-1 rounded-sm bg-surface-bright border-l-2 ${POS_BORDER[pos] || "border-zinc-500"} ${POS_TEXT[pos] || "text-zinc-300"} text-xs font-black uppercase tracking-wider`}
              >
                {POS_LABEL[pos] || pos}
              </div>
            </div>

            {/* Name + meta */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-black font-headline text-2xl tracking-tight text-on-surface uppercase leading-none">
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
                {player.age ? ` · ${player.age} anos` : ""}
                {player.nationality ? ` · ${player.nationality}` : ""}
              </p>
              <p className="text-xs mt-0.5">
                <span className="text-on-surface-variant">Clube: </span>
                <span className="font-bold text-tertiary">
                  {player.team_name || "Sem clube"}
                </span>
              </p>
            </div>

            {/* Close */}
            <button
              type="button"
              className="shrink-0 text-on-surface-variant hover:text-on-surface text-lg leading-none transition-colors"
              onClick={() => setPlayerHistoryModal(null)}
            >
              ✕
            </button>
          </div>

          {/* Value strip */}
          <div className="flex items-center justify-between px-6 py-3 border-t border-outline-variant/15 bg-surface-container-high/30">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                Valor de mercado
              </p>
              <p className="font-black font-headline text-xl tracking-tighter text-tertiary">
                {formatCurrency(player.value || 0)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                Ordenado/sem
              </p>
              <p className="font-bold font-mono text-sm text-on-surface">
                {formatCurrency(player.wage || 0)}
              </p>
            </div>
          </div>
        </div>

        {/* ── SCROLLABLE BODY ── */}
        <div className="overflow-y-auto flex-1">
          {/* ── SKILL + FORM BARS ── */}
          <div className="px-6 py-5 border-b border-outline-variant/10">
            <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-4">
              Atributos
            </p>
            <div className="space-y-4">
              <SkillBar label="Qualidade" value={skill} color={barColor} />
              <SkillBar label="Forma" value={form} color="#95d4b3" />
            </div>
          </div>

          {/* ── CAREER STATS GRID ── */}
          <div className="px-6 py-5 border-b border-outline-variant/10">
            <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-4">
              Estatísticas de Carreira
            </p>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Golos", value: goals, color: "text-tertiary" },
                {
                  label: "Cartões Vermelhos",
                  value: reds,
                  color: reds > 0 ? "text-error" : "text-on-surface",
                },
                {
                  label: "Lesões",
                  value: injuries,
                  color: injuries > 0 ? "text-amber-400" : "text-on-surface",
                },
              ].map(({ label, value, color }) => (
                <div
                  key={label}
                  className="bg-surface-container rounded-lg p-4 flex flex-col items-center gap-1"
                >
                  <span
                    className={`font-black font-headline text-2xl ${color}`}
                  >
                    {value}
                  </span>
                  <span className="text-[9px] font-black uppercase tracking-widest text-on-surface-variant text-center leading-tight">
                    {label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* ── TRANSFER HISTORY ── */}
          <div className="px-6 py-5">
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
                        key={i}
                        className="border-t border-outline-variant/10 hover:bg-primary-container/10 transition-colors text-sm"
                      >
                        <td className="px-3 py-2.5 text-on-surface-variant text-xs tabular-nums">
                          {t.year ? `${t.year}` : "—"}
                          {t.matchweek ? (
                            <span className="opacity-50"> J{t.matchweek}</span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2.5 text-on-surface-variant text-xs truncate max-w-[90px]">
                          {t.related_team_name || "—"}
                        </td>
                        <td className="px-3 py-2.5 font-bold text-on-surface truncate max-w-[90px]">
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
