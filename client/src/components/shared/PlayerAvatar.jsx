/**
 * Avatar gerado proceduralmente para jogadores.
 * Usa o ID do jogador como seed para manter consistência.
 * @param {number|string} seed - ID do jogador para gerar características consistentes
 * @param {string} position - Posição (GR, DEF, MED, ATA) para possíveis variações contextuais
 */
export function PlayerAvatar({ seed, position }) {
  const seedNum = Number(seed) || 0;

  const rand = (index, max) => {
    const x = Math.sin(seedNum * 9999 + index * 777) * 10000;
    return Math.floor((x - Math.floor(x)) * max);
  };

  const skinTones = [
    "#fcd5b5", "#e8beac", "#d4a574", "#c68642", "#8d5524", "#523218"
  ];
  const skinColor = skinTones[rand(1, skinTones.length)];

  const hairColors = [
    "#1a1a1a", "#3d2314", "#8b4513", "#c4a35a", "#e8d0a9", "#7a7a7a", "#b55239"
  ];
  const hairColor = hairColors[rand(2, hairColors.length)];

  const hairStyles = ["bald", "short", "medium", "long", "curly", "mohawk"];
  const hairStyle = hairStyles[rand(3, hairStyles.length)];

  const eyeColors = ["#4b3621", "#2e536f", "#6b8e23", "#4682b4", "#8b4513", "#333"];
  const eyeColor = eyeColors[rand(4, eyeColors.length)];

  const expressions = ["smile", "neutral", "serious", "grin"];
  const expression = expressions[rand(5, expressions.length)];

  const hasBeard = rand(6, 3) === 0;

  const renderHair = () => {
    const color = hairColor;
    switch (hairStyle) {
      case "bald":
        return null;
      case "short":
        return (
          <path
            d="M25,45 Q30,20 50,18 Q70,20 75,45"
            fill={color}
            stroke="none"
          />
        );
      case "medium":
        return (
          <>
            <path
              d="M20,50 Q20,10 50,8 Q80,10 80,50 L80,55 Q80,30 50,25 Q20,30 20,55 Z"
              fill={color}
            />
            <circle cx="25" cy="35" r="8" fill={color} />
            <circle cx="75" cy="35" r="8" fill={color} />
          </>
        );
      case "long":
        return (
          <>
            <path
              d="M20,55 Q15,10 50,5 Q85,10 80,55 L85,90 L70,90 L70,50 Q50,30 30,50 L30,90 L15,90 Z"
              fill={color}
            />
          </>
        );
      case "curly":
        return (
          <>
            <circle cx="25" cy="35" r="10" fill={color} />
            <circle cx="40" cy="25" r="10" fill={color} />
            <circle cx="60" cy="25" r="10" fill={color} />
            <circle cx="75" cy="35" r="10" fill={color} />
            <circle cx="50" cy="20" r="10" fill={color} />
          </>
        );
      case "mohawk":
        return (
          <path
            d="M45,40 L45,15 L50,10 L55,15 L55,40 Z"
            fill={color}
          />
        );
      default:
        return null;
    }
  };

  const renderEyes = () => {
    const y = 55;
    const spacing = 12;
    return (
      <>
        <ellipse cx={50 - spacing} cy={y} rx="6" ry={rand(7, 2) + 4} fill="#fff" />
        <circle cx={50 - spacing + 1} cy={y + 1} r="3" fill={eyeColor} />
        <circle cx={50 - spacing - 1} cy={y - 1} r="1" fill="#fff" opacity="0.6" />

        <ellipse cx={50 + spacing} cy={y} rx="6" ry={rand(8, 2) + 4} fill="#fff" />
        <circle cx={50 + spacing + 1} cy={y + 1} r="3" fill={eyeColor} />
        <circle cx={50 + spacing - 1} cy={y - 1} r="1" fill="#fff" opacity="0.6" />
      </>
    );
  };

  const renderMouth = () => {
    const y = 80;
    switch (expression) {
      case "smile":
        return (
          <path
            d={`M35,${y} Q50,${y + 12} 65,${y}`}
            stroke="#8b5a2b"
            strokeWidth="3"
            fill="none"
            strokeLinecap="round"
          />
        );
      case "neutral":
        return (
          <path
            d={`M38,${y} L62,${y}`}
            stroke="#8b5a2b"
            strokeWidth="3"
            fill="none"
            strokeLinecap="round"
          />
        );
      case "serious":
        return (
          <path
            d={`M35,${y} Q50,${y - 2} 65,${y}`}
            stroke="#8b5a2b"
            strokeWidth="3"
            fill="none"
            strokeLinecap="round"
          />
        );
      case "grin":
        return (
          <path
            d={`M35,${y} Q50,${y + 15} 65,${y} Z`}
            fill="#fff"
            stroke="#8b5a2b"
            strokeWidth="2"
          />
        );
      default:
        return null;
    }
  };

  const renderBeard = () => {
    if (!hasBeard) return null;
    return (
      <path
        d="M30,70 Q50,95 70,70 L70,80 Q50,100 30,80 Z"
        fill={hairColor}
      />
    );
  };

  const renderNose = () => {
    const type = rand(9, 3);
    if (type === 0) {
      return <circle cx="50" cy="65" r="4" fill="#d4a574" opacity="0.5" />;
    } else if (type === 1) {
      return (
        <path
          d="M48,60 L46,68 L54,68 L52,60 Z"
          fill="#d4a574"
          opacity="0.5"
        />
      );
    }
    return (
      <path
        d="M50,60 L47,67 L53,67"
        stroke="#d4a574"
        strokeWidth="2"
        fill="none"
        opacity="0.5"
      />
    );
  };

  return (
    <div className="relative shrink-0">
      <svg
        viewBox="0 0 100 100"
        className="w-20 h-20 rounded-full border-2 border-surface-bright shadow-lg"
        style={{ backgroundColor: "#1a1a24" }}
      >
        <defs>
          <radialGradient id={`grad-${seed}`} cx="40%" cy="30%">
            <stop offset="0%" stopColor="#ffffff20" />
            <stop offset="100%" stopColor="#00000040" />
          </radialGradient>
        </defs>

        <circle cx="50" cy="50" r="40" fill={skinColor} stroke="#00000010" strokeWidth="1" />
        <circle cx="50" cy="50" r="40" fill={`url(#grad-${seed})`} />

        {renderBeard()}
        {renderHair()}
        {renderEyes()}
        {renderNose()}
        {renderMouth()}

        {rand(10, 5) === 0 && (
          <circle cx="75" cy="70" r="3" fill="#c4a35a" opacity="0.6" />
        )}
      </svg>
    </div>
  );
}