import { POS_BAR } from "./positionConstants.js";

/**
 * Gráfico de linhas mostrando a evolução da skill do jogador.
 * O número de pontos no gráfico depende dos dados disponíveis.
 * @param {{ skillHistory: Array<{matchweek: number, skill: number}>, skill: number, position: string }} props
 */
export function SkillLineChart({ skillHistory = [], skill = 0, position = "MED" }) {
  const barColor = POS_BAR[position] || "#eab308";
  const maxSkill = 50;

  // Ordenar e filtrar dados válidos
  const cleanHistory = skillHistory
    .filter((p) => p.skill != null)
    .sort((a, b) => a.matchweek - b.matchweek);

  // Sem dados suficientes — mostrar estado mínimo
  if (cleanHistory.length === 0) {
    return (
      <div className="px-6 py-5">
        <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-3">
          Evolução da Skill
        </p>
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <p className="text-xs text-on-surface-variant italic">
              Sem dados históricos. A evolução será registada a partir desta época.
            </p>
          </div>
          <div className="text-center min-w-[80px]">
            <div className="text-2xl font-black font-headline" style={{ color: barColor }}>
              {skill}
            </div>
            <div className="text-[9px] font-black uppercase tracking-widest text-on-surface-variant">
              Skill Atual
            </div>
          </div>
        </div>
      </div>
    );
  }

  const pointCount = cleanHistory.length;
  // Use actual data range for X axis; pad minimally to avoid edge clipping
  const firstMW = cleanHistory[0].matchweek;
  const lastMW = cleanHistory[pointCount - 1].matchweek;
  const mwRange = Math.max(lastMW - firstMW, 1);

  // Calcular coordenadas
  const padding = 20;
  const chartWidth = 300;
  const chartHeight = 100;
  const graphWidth = chartWidth - padding * 2;
  const graphHeight = chartHeight - padding * 2;

  const getX = (mw) => padding + ((mw - firstMW) / mwRange) * graphWidth;
  const getY = (skillValue) => padding + graphHeight - (skillValue / maxSkill) * graphHeight;

  // Criar caminho SVG
  let pathD = "";

  cleanHistory.forEach((point, i) => {
    const x = getX(point.matchweek);
    const y = getY(point.skill);
    if (i === 0) {
      pathD = `M ${x} ${y}`;
    } else {
      pathD += ` L ${x} ${y}`;
    }
  });

  // Índice do último ponto (válido) para highlight
  const lastIdx = pointCount - 1;

  return (
    <div className="px-6 py-5">
      <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-3">
        Evolução da Skill
      </p>

      <div className="flex items-center gap-4">
        {/* Gráfico SVG */}
        <div className="flex-1">
          <svg
            width="100%"
            height="100"
            viewBox={`0 0 ${chartWidth} ${chartHeight}`}
            className="overflow-visible"
          >
            {/* Grid lines */}
            {[0, 10, 20, 30, 40, 50].map((level) => (
              <line
                key={level}
                x1={padding}
                y1={getY(level)}
                x2={chartWidth - padding}
                y2={getY(level)}
                stroke="#333"
                strokeWidth="0.5"
                strokeDasharray="2,2"
              />
            ))}

            {/* Y-axis labels */}
            {[0, 10, 20, 30, 40, 50].map((level) => (
              <text
                key={level}
                x={padding - 6}
                y={getY(level) + 3}
                textAnchor="end"
                fontSize="6"
                fill="#888"
              >
                {level}
              </text>
            ))}

            {/* X-axis labels — show actual matchweek numbers */}
            {cleanHistory.map((p, i) => (
              <text
                key={p.matchweek}
                x={getX(p.matchweek)}
                y={chartHeight - 4}
                textAnchor="middle"
                fontSize="6"
                fill="#888"
              >
                J{p.matchweek}
              </text>
            ))}

            {/* Skill line */}
            {pathD && (
              <path
                d={pathD}
                fill="none"
                stroke={barColor}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {/* Points */}
            {cleanHistory.map((point, i) => {
              const isLast = i === lastIdx;
              const cx = getX(point.matchweek);
              const cy = getY(point.skill);

              return (
                <g key={`${point.matchweek}-${i}`}>
                  <circle
                    cx={cx}
                    cy={cy}
                    r={isLast ? 6 : 4}
                    fill={barColor}
                    stroke="#000"
                    strokeWidth={isLast ? 2 : 1}
                  />
                  {isLast && (
                    <circle
                      cx={cx}
                      cy={cy}
                      r="12"
                      fill="none"
                      stroke={barColor}
                      strokeWidth="1"
                      strokeDasharray="2,2"
                    />
                  )}
                </g>
              );
            })}
          </svg>
        </div>

        {/* Skill atual */}
        <div className="text-center min-w-[80px]">
          <div
            className="text-2xl font-black font-headline"
            style={{ color: barColor }}
          >
            {skill}
          </div>
          <div className="text-[9px] font-black uppercase tracking-widest text-on-surface-variant">
            Skill Atual
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-3 text-[9px] text-on-surface-variant">
        <div className="flex items-center gap-1">
          <span
            className="inline-block w-3 h-3 rounded-sm"
            style={{ backgroundColor: barColor }}
          />
          <span>Qualidade</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-full border border-current" />
          <span>Actual ({cleanHistory.length} ponto{cleanHistory.length !== 1 ? "s" : ""})</span>
        </div>
      </div>
    </div>
  );
}
