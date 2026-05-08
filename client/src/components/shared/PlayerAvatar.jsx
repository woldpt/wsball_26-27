/**
 * Avatar gerado proceduralmente para jogadores.
 * Usa o ID do jogador como seed para manter consistência e profundidade visual.
 * @param {number|string} seed - ID do jogador para gerar características consistentes
 * @param {string} position - Posição (GR, DEF, MED, ATA) para possíveis variações contextuais
 */
export function PlayerAvatar({ seed, position }) {
  const seedNum = Number(seed) || 0;

  const rand = (index, max) => {
    const x = Math.sin(seedNum * 9999 + index * 777) * 10000;
    return Math.floor((x - Math.floor(x)) * max);
  };

  // --- Paletas e Características ---
  const skinTones = [
    { base: "#fcd5b5", shadow: "#e8beac" },
    { base: "#e8beac", shadow: "#d4a574" },
    { base: "#d4a574", shadow: "#b88654" },
    { base: "#c68642", shadow: "#a05a2c" },
    { base: "#8d5524", shadow: "#5d3618" },
    { base: "#523218", shadow: "#321d0e" }
  ];
  const skin = skinTones[rand(1, skinTones.length)];

  const hairColors = [
    { base: "#1a1a1a", highlight: "#333333" },
    { base: "#3d2314", highlight: "#5a3a22" },
    { base: "#8b4513", highlight: "#a05a22" },
    { base: "#c4a35a", highlight: "#e0c07a" },
    { base: "#e8d0a9", highlight: "#f5e3c8" },
    { base: "#7a7a7a", highlight: "#999999" },
    { base: "#b55239", highlight: "#d46a4d" }
  ];
  const hair = hairColors[rand(2, hairColors.length)];

  const eyeColors = ["#4b3621", "#2e536f", "#6b8e23", "#4682b4", "#8b4513", "#333"];
  const eyeColor = eyeColors[rand(4, eyeColors.length)];

  const hairStyles = ["bald", "short", "medium", "long", "curly", "mohawk", "bowl"];
  const hairStyle = hairStyles[rand(3, hairStyles.length)];

  const expressions = ["smile", "neutral", "serious", "grin", "angry"];
  const expression = expressions[rand(5, expressions.length)];

  const hasBeard = rand(6, 3) === 0;
  const hasEyebrows = true;

  // --- Renderizadores de Camadas ---

  const renderNeck = () => (
    <path
      d="M35,85 Q50,95 65,85 L65,100 L35,100 Z"
      fill={skin.base}
      opacity="0.9"
    />
  );

  const renderFace = () => (
    <g>
      {/* Base do rosto com gradiente de profundidade */}
      <circle cx="50" cy="50" r="40" fill={`url(#skinGrad-${seed})`} />
      {/* Contorno suave */}
      <circle cx="50" cy="50" r="40" fill="none" stroke="#00000015" strokeWidth="1" />
    </g>
  );

  const renderEyes = () => {
    const y = 52;
    const spacing = 14;
    const eyeWidth = 8;
    const eyeHeight = 6;

    return (
      <g>
        {/* Esquerdo */}
        <ellipse cx={50 - spacing} cy={y} rx={eyeWidth} ry={eyeHeight} fill="#fff" />
        <ellipse cx={50 - spacing} cy={y} rx={eyeWidth * 0.6} ry={eyeHeight * 0.6} fill={eyeColor} />
        <circle cx={50 - spacing + 2} cy={y - 1} r="1.5" fill="#fff" opacity="0.8" />
        
        {/* Direito */}
        <ellipse cx={50 + spacing} cy={y} rx={eyeWidth} ry={eyeHeight} fill="#fff" />
        <ellipse cx={50 + spacing} cy={y} rx={eyeWidth * 0.6} ry={eyeHeight * 0.6} fill={eyeColor} />
        <circle cx={50 + spacing - 2} cy={y - 1} r="1.5" fill="#fff" opacity="0.8" />

        {/* Sobrancelhas */}
        {hasEyebrows && (
          <g opacity="0.8">
            <path
              d={`M${34 - (expression === 'angry' ? 2 : 0)},${y - 12} Q${44 - (expression === 'angry' ? 2 : 0)},${y - 16} ${50 - spacing},${y - 12}`}
              stroke="#1a1a1a"
              strokeWidth="2.5"
              fill="none"
              strokeLinecap="round"
            />
            <path
              d={`M${50 + spacing - (expression === 'angry' ? 2 : 0)},${y - 12} Q${66 + (expression === 'angry' ? 2 : 0)},${y - 16} ${66 + (expression === 'angry' ? 2 : 0)},${y - 12}`}
              stroke="#1a1a1a"
              strokeWidth="2.5"
              fill="none"
              strokeLinecap="round"
            />
          </g>
        )}
      </g>
    );
  };

  const renderNose = () => (
    <path
      d="M48,60 Q50,68 52,60"
      stroke={skin.shadow}
      strokeWidth="2"
      fill="none"
      strokeLinecap="round"
      opacity="0.6"
    />
  );

  const renderMouth = () => {
    const y = 78;
    let path = "";
    switch (expression) {
      case "smile":
        path = `M38,${y} Q50,${y + 10} 62,${y}`;
        break;
      case "neutral":
        path = `M42,${y} L58,${y}`;
        break;
      case "serious":
        path = `M40,${y + 2} Q50,${y - 2} 60,${y + 2}`;
        break;
      case "grin":
        path = `M36,${y} Q50,${y + 15} 64,${y} Z`;
        break;
      case "angry":
        path = `M42,${y + 3} Q50,${y} 58,${y + 3}`;
        break;
    }

    return (
      <path
        d={path}
        stroke="#5d3618"
        strokeWidth="2.5"
        fill={expression === "grin" ? "#fff" : "none"}
        strokeLinecap="round"
      />
    );
  };

  const renderHair = () => {
    const color = hair.base;
    const highlight = hair.highlight;

    switch (hairStyle) {
      case "bald":
        return null;
      case "short":
        return (
          <g>
            <path d="M20,45 Q25,15 50,15 Q75,15 80,45 L80,55 Q50,45 20,55 Z" fill={`url(#hairGrad-${seed})`} />
            <path d="M30,30 Q50,20 70,30" stroke={highlight} strokeWidth="4" fill="none" opacity="0.4" />
          </g>
        );
      case "medium":
        return (
          <g>
            <path d="M18,50 Q18,10 50,10 Q82,10 82,50 L85,70 Q50,60 15,70 Z" fill={`url(#hairGrad-${seed})`} />
            <path d="M25,30 Q50,15 75,30" stroke={highlight} strokeWidth="6" fill="none" opacity="0.3" />
          </g>
        );
      case "long":
        return (
          <g>
            <path d="M15,55 Q15,5 50,5 Q85,5 85,55 L90,95 L75,95 L75,60 Q50,45 25,60 L25,95 L10,95 Z" fill={`url(#hairGrad-${seed})`} />
            <path d="M20,40 Q50,20 80,40" stroke={highlight} strokeWidth="8" fill="none" opacity="0.2" />
          </g>
        );
      case "curly":
        return (
          <g>
            <circle cx="30" cy="30" r="15" fill={`url(#hairGrad-${seed})`} />
            <circle cx="50" cy="20" r="18" fill={`url(#hairGrad-${seed})`} />
            <circle cx="70" cy="30" r="15" fill={`url(#hairGrad-${seed})`} />
            <circle cx="20" cy="50" r="15" fill={`url(#hairGrad-${seed})`} />
            <circle cx="80" cy="50" r="15" fill={`url(#hairGrad-${seed})`} />
            <circle cx="50" cy="50" r="25" fill={`url(#hairGrad-${seed})`} />
            <circle cx="35" cy="20" r="10" fill={highlight} opacity="0.3" />
          </g>
        );
      case "mohawk":
        return (
          <g>
            <path d="M35,45 L35,10 Q50,0 65,10 L65,45 Z" fill={`url(#hairGrad-${seed})`} />
            <path d="M45,20 Q50,10 55,20" stroke={highlight} strokeWidth="3" fill="none" opacity="0.5" />
          </g>
        );
      case "bowl":
        return (
          <g>
            <path d="M15,50 Q15,10 50,10 Q85,10 85,50 L80,60 Q50,50 20,60 Z" fill={`url(#hairGrad-${seed})`} />
            <path d="M25,35 Q50,25 75,35" stroke={highlight} strokeWidth="5" fill="none" opacity="0.3" />
          </g>
        );
      default:
        return null;
    }
  };

  const renderBeard = () => {
    if (!hasBeard) return null;
    return (
      <path
        d="M32,70 Q50,95 68,70 L68,80 Q50,100 32,80 Z"
        fill={hair.base}
        opacity="0.8"
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
          {/* Gradiente para a pele */}
          <radialGradient id={`skinGrad-${seed}`} cx="40%" cy="30%" r="60%">
            <stop offset="0%" stopColor={skin.base} />
            <stop offset="100%" stopColor={skin.shadow} />
          </radialGradient>
          
          {/* Gradiente para o cabelo */}
          <linearGradient id={`hairGrad-${seed}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={hair.base} />
            <stop offset="100%" stopColor={hair.highlight} />
          </linearGradient>
        </defs>

        {/* 1. Background/Neck */}
        {renderNeck()}

        {/* 2. Face Base */}
        {renderFace()}

        {/* 3. Eyes & Eyebrows */}
        {renderEyes()}

        {/* 4. Nose */}
        {renderNose()}

        {/* 5. Mouth */}
        {renderMouth()}

        {/* 6. Beard */}
        {renderBeard()}

        {/* 7. Hair (Back layer) */}
        <g opacity="0.9">
          {renderHair()}
        </g>

        {/* 8. Extra details (Freckles/Symmetry) */}
        {rand(10, 5) === 0 && (
          <g opacity="0.4">
            <circle cx="70" cy="65" r="1.5" fill="#d4a574" />
            <circle cx="73" cy="68" r="1" fill="#d4a574" />
          </g>
        )}
      </svg>
    </div>
  );
}