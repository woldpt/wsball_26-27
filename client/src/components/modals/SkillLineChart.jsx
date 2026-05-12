import { POS_BAR } from "./PlayerHistoryModal.jsx";

/**
 * Gráfico de linhas mostrando a evolução da skill do jogador nas últimas 19 semanas.
 * @param {{ skillHistory: Array<{year: number, matchweek: number, skill: number}>, skill: number, position: string }} props
 */
export function SkillLineChart({ skillHistory = [], skill = 0, position = "MED" }) {
  const barColor = POS_BAR[position] || "#95d4b3";
  const maxSkill = 50;

  // Ordenar histórico por matchweek
  const sortedHistory = [...skillHistory].sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    return a.matchweek - b.matchweek;
  });

  // Encontrar o matchweek atual (último da temporada)
  const currentMatchweek = sortedHistory.length > 0 ? sortedHistory[sortedHistory.length - 1].matchweek : 0;

  // Calcular offset para alinhar o último ponto com o final do gráfico
  const totalWeeks = 19;
  const weeksOffset = Math.max(0, totalWeeks - sortedHistory.length);

  // Dados para o gráfico
  const chartData = [...sortedHistory];
  // Adicionar pontos vazios para preencher até 19 semanas
  for (let i = 0; i < weeksOffset; i++) {
    chartData.push({ year: sortedHistory[0]?.year || 2026, matchweek: 0, skill: null });
  }

  // Calcular coordenadas
  const padding = 20;
  const chartWidth = 300;
  const chartHeight = 100;
  const graphWidth = chartWidth - padding * 2;
  const graphHeight = chartHeight - padding * 2;

  const getX = (index) => padding + (index / (totalWeeks - 1)) * graphWidth;
  const getY = (skillValue) => {
    if (skillValue === null) return padding + graphHeight;
    return padding + graphHeight - (skillValue / maxSkill) * graphHeight;
  };

  // Criar caminho SVG
  let pathD = "";
  let points = [];

  chartData.forEach((point, index) => {
    const x = getX(index);
    const y = getY(point.skill);
    points.push(`${x},${y}`);

    if (index === 0) {
      pathD = `M ${x} ${y}`;
    } else {
      pathD += ` L ${x} ${y}`;
    }
  });

  // Adicionar pontos no gráfico
  const dotStyle = {
    fill: barColor,
    stroke: "#000",
    strokeWidth: 1,
    r: 4,
  };

  // Encontrar o último ponto válido para destacar
  const lastValidPoint = chartData.findLast((p) => p.skill !== null);
  const isCurrentWeek = lastValidPoint && lastValidPoint.matchweek === currentMatchweek;

  return (
    <div className="px-6 py-5 border-b border-outline-variant/10">
      <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-3">
        Evolução da Skill (Últimas 19 Semanas)
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
            {[0, 12.5, 25, 37.5, 50].map((level) => (
              <line
                key={level}
                x1={padding}
                y1={getY(level)}
                x2={chartWidth - padding}
                y2={getY(level)}
                stroke="#444"
                strokeWidth="0.5"
                strokeDasharray="2,2"
              />
            ))}

            {/* X-axis labels */}
            {[0, 5, 10, 15, 20].map((label) => (
              <text
                key={label}
                x={getX(label)}
                y={chartHeight - 4}
                textAnchor="middle"
                fontSize="6"
                fill="#888"
              >
                {label === 0 ? "S1" : label === 5 ? "S5" : label === 10 ? "S10" : label === 15 ? "S15" : "S19"}
              </text>
            ))}

            {/* Y-axis labels */}
            {[0, 12.5, 25, 37.5, 50].map((level) => (
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
            {points.map((point, index) => {
              const dataPoint = chartData[index];
              const isLast = index === chartData.length - 1;
              const isCurrent = isLast && isCurrentWeek;

              return (
                <g key={index}>
                  <circle
                    cx={parseFloat(point.split(",")[0])}
                    cy={parseFloat(point.split(",")[1])}
                    r={isCurrent ? 6 : 4}
                    fill={barColor}
                    stroke={isCurrent ? "#000" : "#000"}
                    strokeWidth={isCurrent ? 2 : 1}
                  />
                  {isCurrent && (
                    <circle
                      cx={parseFloat(point.split(",")[0])}
                      cy={parseFloat(point.split(",")[1])}
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
          <span className="inline-block w-3 h-3 rounded-sm border border-current" />
          <span>Semanas</span>
        </div>
      </div>
    </div>
  );
}
