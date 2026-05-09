import { useId, memo } from "react";

const POSITION_ACCENT = {
  GR: "#eab308",
  DEF: "#3b82f6",
  MED: "#10b981",
  ATA: "#f43f5e",
};

// --------------- PRNG ---------------
function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i += 1) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

function mulberry32(a) {
  return () => {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

function chance(rng, p) {
  return rng() < p;
}

function weightedPick(rng, options) {
  const total = options.reduce((s, o) => s + o.weight, 0);
  let t = rng() * total;
  for (const o of options) {
    t -= o.weight;
    if (t <= 0) return o.value;
  }
  return options[options.length - 1].value;
}

function hexToRgba(hex, a) {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

const SIZE_MAP = { sm: "w-10 h-10", md: "w-16 h-16", lg: "w-24 h-24", xl: "w-32 h-32" };

/**
 * Avatar procedural cartoon, determinístico por seed.
 * @param {{ seed: number|string, position?: string, teamColor?: string, size?: "sm"|"md"|"lg"|"xl" }} props
 */
function PlayerAvatarInner({ seed, position, teamColor, size = "lg" }) {
  const uid = useId().replace(/:/g, "");
  const rng = mulberry32(xmur3(`${seed ?? 0}|${position ?? "X"}`)());

  // ── Paletas ──
  const skin = pick(rng, [
    { base: "#f5d0b0", shade: "#d9a87a", blush: "#e89080", lip: "#a05050" },
    { base: "#e8b88a", shade: "#c0885a", blush: "#d07870", lip: "#885040" },
    { base: "#d09060", shade: "#a06838", blush: "#b86858", lip: "#784030" },
    { base: "#b07040", shade: "#805028", blush: "#a05848", lip: "#603828" },
    { base: "#885030", shade: "#603818", blush: "#904838", lip: "#482818" },
    { base: "#603020", shade: "#401808", blush: "#703028", lip: "#301008" },
  ]);

  const hair = pick(rng, [
    { base: "#180e08", hi: "#302018" },
    { base: "#2e1408", hi: "#4e2818" },
    { base: "#5a3010", hi: "#805030" },
    { base: "#7a5020", hi: "#a07840" },
    { base: "#a08040", hi: "#c0a060" },
    { base: "#c8b080", hi: "#e0d0a8" },
    { base: "#484e58", hi: "#7080a0" },
    { base: "#803028", hi: "#b05848" },
  ]);

  const eyes = pick(rng, [
    { iris: "#2e6080", ring: "#183848" },
    { iris: "#507020", ring: "#304010" },
    { iris: "#604020", ring: "#382810" },
    { iris: "#506070", ring: "#303848" },
    { iris: "#604880", ring: "#382858" },
  ]);

  const expression = weightedPick(rng, [
    { value: "smile",   weight: position === "ATA" ? 3.0 : 1.8 },
    { value: "grin",    weight: position === "ATA" ? 2.0 : 1.2 },
    { value: "neutral", weight: position === "MED" ? 2.5 : 1.5 },
    { value: "serious", weight: position === "DEF" ? 2.5 : 1.2 },
    { value: "focused", weight: position === "GR"  ? 2.5 : 1.0 },
  ]);

  // face: round | wide | narrow
  const faceType = pick(rng, ["round", "round", "wide", "narrow"]);

  const hairStyle = weightedPick(rng, [
    { value: "bald",   weight: 0.5 },
    { value: "short",  weight: 2.5 },
    { value: "swoop",  weight: 1.5 },
    { value: "curly",  weight: 1.2 },
    { value: "long",   weight: 0.8 },
    { value: "afro",   weight: 0.8 },
    { value: "spiky",  weight: 1.0 },
  ]);

  const beard = weightedPick(rng, [
    { value: "none",     weight: 2.8 },
    { value: "stubble",  weight: 1.2 },
    { value: "mustache", weight: 0.4 },
    { value: "goatee",   weight: 0.4 },
    { value: "full",     weight: 0.4 },
  ]);

  const noseStyle  = pick(rng, ["default", "wide", "slim"]);
  const browStyle  = pick(rng, ["arch", "flat", "thick"]);
  const glasses    = chance(rng, 0.12);
  const freckles   = chance(rng, 0.14);
  const mole       = chance(rng, 0.08);
  const earring    = chance(rng, 0.10);
  const headband   = position === "GR" && chance(rng, 0.45);

  // dimensões da cabeça conforme tipo
  // cx=60, cy=62 — centro ligeiramente abaixo do meio do viewBox (deixa espaço cabelo em cima)
  const CX = 60, CY = 62;
  const headRx = faceType === "wide" ? 38 : faceType === "narrow" ? 30 : 34;
  const headRy = faceType === "wide" ? 42 : faceType === "narrow" ? 48 : 44;

  // topo/fundo da cabeça
  const headTop    = CY - headRy;   // ~14-20
  const headBottom = CY + headRy;   // ~104-110

  // posições faciais relativas ao centro
  const eyeY   = CY - 6;
  const browY  = eyeY - 13;
  const noseY  = CY + 8;
  const mouthY = CY + 22;
  const leftX  = CX - 16;
  const rightX = CX + 16;
  const earCY  = CY;
  const earRx  = 7;
  const earRy  = 9;
  const earLX  = CX - headRx - 2;
  const earRX  = CX + headRx + 2;

  const angryTilt = (expression === "focused" || expression === "serious") ? 2 : 0;
  const eyeOpen   = 4.5 + rng() * 2;
  const browW     = 2.5 + rng() * 1.5;

  const accent  = POSITION_ACCENT[position] || "#94a3b8";
  const jersey  = teamColor || accent;

  // IDs
  const gSkin    = `sg-${uid}`;
  const gHair    = `gh-${uid}`;
  const gIris    = `gi-${uid}`;
  const gJersey  = `gj-${uid}`;
  const gShadow  = `gs-${uid}`;
  const clip     = `cl-${uid}`;

  // ── Hair cap path: elipse que cobre o topo da cabeça ──
  // Desenhamos o cabelo sempre usando um cap que assenta na ellipse da cabeça.
  // hairTopY: quão alto sobe o cabelo acima do headTop
  void rng; // PRNG esgotado — variável mantida para consistência de sequência

  // ── Renderers ──

  const renderHair = () => {
    if (hairStyle === "bald") return null;

    // todos os estilos são elipses/curvas que assentam na forma da cabeça
    // o clip garante que nunca saem fora da cabeça nos lados/fundo

    if (hairStyle === "short") return (
      <g>
        {/* calota que cobre o topo + desce ligeiramente pelos lados */}
        <ellipse cx={CX} cy={headTop + 6} rx={headRx + 2} ry={headRy * 0.55} fill={`url(#${gHair})`} />
        <ellipse cx={CX} cy={headTop + 2} rx={headRx - 4} ry={8} fill={hair.hi} opacity="0.4" />
      </g>
    );

    if (hairStyle === "swoop") return (
      <g>
        <ellipse cx={CX + 4} cy={headTop + 5} rx={headRx + 2} ry={headRy * 0.52} fill={`url(#${gHair})`} />
        {/* risco ao lado */}
        <path
          d={`M${CX + 8} ${headTop + 2} C${CX + 4} ${headTop + 14} ${CX - 8} ${headTop + 18} ${CX - 14} ${headTop + 20}`}
          stroke={hair.hi} strokeWidth="2.5" fill="none" opacity="0.55"
        />
      </g>
    );

    if (hairStyle === "curly") return (
      <g fill={`url(#${gHair})`}>
        {/* fila de círculos que formam a cabeleira crespa */}
        {[
          [CX - headRx + 2, headTop + 4, 11],
          [CX - headRx + 14, headTop - 2, 12],
          [CX, headTop - 4, 13],
          [CX + headRx - 14, headTop - 2, 12],
          [CX + headRx - 2, headTop + 4, 11],
          [CX, headTop + 8, 14],
        ].map(([x, y, r], i) => <circle key={i} cx={x} cy={y} r={r} />)}
      </g>
    );

    if (hairStyle === "afro") return (
      <g>
        <ellipse cx={CX} cy={CY - 10} rx={headRx + 12} ry={headRy * 0.7} fill={`url(#${gHair})`} />
        <ellipse cx={CX} cy={CY - 6}  rx={headRx + 4}  ry={headRy * 0.5} fill={hair.base} opacity="0.3" />
      </g>
    );

    if (hairStyle === "long") return (
      <g>
        {/* topo */}
        <ellipse cx={CX} cy={headTop + 5} rx={headRx + 2} ry={headRy * 0.52} fill={`url(#${gHair})`} />
        {/* extensões laterais que descem */}
        <rect x={CX - headRx - 1} y={headTop + 10} width={14} height={55} rx="7" fill={hair.base} opacity="0.9" />
        <rect x={CX + headRx - 13} y={headTop + 10} width={14} height={55} rx="7" fill={hair.base} opacity="0.9" />
      </g>
    );

    if (hairStyle === "spiky") return (
      <g>
        {/* base */}
        <ellipse cx={CX} cy={headTop + 6} rx={headRx + 2} ry={headRy * 0.53} fill={`url(#${gHair})`} />
        {/* picos */}
        {[
          [CX - 16, headTop - 2, CX - 10, headTop - 16, CX - 4,  headTop - 2],
          [CX - 4,  headTop - 4, CX,      headTop - 20, CX + 4,  headTop - 4],
          [CX + 4,  headTop - 2, CX + 10, headTop - 16, CX + 16, headTop - 2],
        ].map(([x1, y1, mx, my, x2, y2], i) => (
          <path key={i} d={`M${x1} ${y1} L${mx} ${my} L${x2} ${y2} Z`} fill={hair.base} />
        ))}
      </g>
    );

    // mohawk
    return (
      <g>
        <rect x={CX - 9} y={headTop - 26} width={18} height={headRy * 0.6 + 26} rx="8" fill={`url(#${gHair})`} />
      </g>
    );
  };

  const renderBeard = () => {
    if (beard === "none") return null;
    if (beard === "stubble") return (
      <path
        d={`M${CX - 22} ${mouthY - 4} C${CX - 16} ${mouthY + 12} ${CX + 16} ${mouthY + 12} ${CX + 22} ${mouthY - 4}`}
        stroke={hair.base} strokeWidth="3" fill="none" opacity="0.25"
        strokeLinecap="round" strokeDasharray="1.5 2.5"
      />
    );
    if (beard === "mustache") return (
      <path
        d={`M${CX - 14} ${mouthY - 10} C${CX - 8} ${mouthY - 14} ${CX - 2} ${mouthY - 12} ${CX} ${mouthY - 10} C${CX + 2} ${mouthY - 12} ${CX + 8} ${mouthY - 14} ${CX + 14} ${mouthY - 10}`}
        stroke={hair.base} strokeWidth="3" fill="none" strokeLinecap="round"
      />
    );
    if (beard === "goatee") return (
      <g stroke={hair.base} fill="none" strokeLinecap="round">
        <path d={`M${CX - 10} ${mouthY + 4} C${CX - 6} ${mouthY + 16} ${CX + 6} ${mouthY + 16} ${CX + 10} ${mouthY + 4}`} strokeWidth="3.5" />
        <path d={`M${CX - 14} ${mouthY - 10} C${CX - 8} ${mouthY - 14} ${CX - 2} ${mouthY - 12} ${CX} ${mouthY - 10}`} strokeWidth="2.5" />
        <path d={`M${CX} ${mouthY - 10} C${CX + 2} ${mouthY - 12} ${CX + 8} ${mouthY - 14} ${CX + 14} ${mouthY - 10}`} strokeWidth="2.5" />
      </g>
    );
    // full beard
    return (
      <ellipse cx={CX} cy={mouthY + 10} rx={headRx - 6} ry={16} fill={hair.base} opacity="0.75" />
    );
  };

  const renderNose = () => {
    if (noseStyle === "wide") return (
      <g opacity="0.5">
        <ellipse cx={CX - 5} cy={noseY + 6} rx="4" ry="2" fill="#00000022" />
        <ellipse cx={CX + 5} cy={noseY + 6} rx="4" ry="2" fill="#00000022" />
        <path d={`M${CX} ${noseY - 6} C${CX - 2} ${noseY + 2} ${CX - 6} ${noseY + 4} ${CX - 7} ${noseY + 6}`}
          stroke="#00000030" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      </g>
    );
    if (noseStyle === "slim") return (
      <path d={`M${CX} ${noseY - 6} L${CX} ${noseY + 6}`}
        stroke="#00000028" strokeWidth="1.5" fill="none" strokeLinecap="round" />
    );
    // default
    return (
      <g opacity="0.55">
        <path d={`M${CX} ${noseY - 6} C${CX - 1} ${noseY} ${CX - 4} ${noseY + 4} ${CX - 5} ${noseY + 6}`}
          stroke="#00000030" strokeWidth="1.8" fill="none" strokeLinecap="round" />
        <ellipse cx={CX - 3} cy={noseY + 7} rx="3" ry="1.5" fill="#00000020" />
      </g>
    );
  };

  const renderBrows = () => {
    const y0 = browY + angryTilt;
    const y1 = browY - angryTilt;
    if (browStyle === "flat") return (
      <g stroke={hair.base} strokeWidth={browW} fill="none" strokeLinecap="round">
        <path d={`M${leftX - 10} ${y0} L${leftX + 10} ${y0}`} />
        <path d={`M${rightX - 10} ${y0} L${rightX + 10} ${y0}`} />
      </g>
    );
    if (browStyle === "thick") return (
      <g stroke={hair.base} strokeWidth={browW + 1.5} fill="none" strokeLinecap="round">
        <path d={`M${leftX - 10} ${y0 + 2} C${leftX} ${y1 - 2} ${leftX + 8} ${y1 - 2} ${leftX + 10} ${y0 + 2}`} />
        <path d={`M${rightX - 10} ${y0 + 2} C${rightX} ${y1 - 2} ${rightX + 8} ${y1 - 2} ${rightX + 10} ${y0 + 2}`} />
      </g>
    );
    // arch
    return (
      <g stroke={hair.base} strokeWidth={browW} fill="none" strokeLinecap="round">
        <path d={`M${leftX - 10} ${y0 + 2} C${leftX} ${y1 - 3} ${leftX + 8} ${y1 - 3} ${leftX + 10} ${y0 + 2}`} />
        <path d={`M${rightX - 10} ${y0 + 2} C${rightX} ${y1 - 3} ${rightX + 8} ${y1 - 3} ${rightX + 10} ${y0 + 2}`} />
      </g>
    );
  };

  const renderMouth = () => {
    if (expression === "smile") return (
      <path d={`M${CX - 14} ${mouthY} C${CX - 8} ${mouthY + 10} ${CX + 8} ${mouthY + 10} ${CX + 14} ${mouthY}`}
        stroke={skin.lip} strokeWidth="2.8" fill="none" strokeLinecap="round" />
    );
    if (expression === "grin") return (
      <path d={`M${CX - 15} ${mouthY - 2} C${CX - 8} ${mouthY + 12} ${CX + 8} ${mouthY + 12} ${CX + 15} ${mouthY - 2} C${CX + 8} ${mouthY + 4} ${CX - 8} ${mouthY + 4} ${CX - 15} ${mouthY - 2} Z`}
        fill="#f0f0f0" stroke={skin.lip} strokeWidth="2" />
    );
    if (expression === "serious") return (
      <path d={`M${CX - 12} ${mouthY + 2} C${CX - 4} ${mouthY - 2} ${CX + 4} ${mouthY - 2} ${CX + 12} ${mouthY + 2}`}
        stroke={skin.lip} strokeWidth="2.2" fill="none" strokeLinecap="round" />
    );
    if (expression === "focused") return (
      <path d={`M${CX - 11} ${mouthY} L${CX + 11} ${mouthY}`}
        stroke={skin.lip} strokeWidth="2" fill="none" strokeLinecap="round" />
    );
    // neutral
    return (
      <path d={`M${CX - 10} ${mouthY} C${CX - 4} ${mouthY + 3} ${CX + 4} ${mouthY + 3} ${CX + 10} ${mouthY}`}
        stroke={skin.lip} strokeWidth="2" fill="none" strokeLinecap="round" />
    );
  };

  return (
    <div className="relative shrink-0">
      <svg
        viewBox="0 0 120 120"
        className={`${SIZE_MAP[size] ?? SIZE_MAP.lg} rounded-full`}
        style={{
          backgroundColor: "#111423",
          border: `2px solid ${accent}55`,
          filter: "drop-shadow(0 2px 5px rgba(0,0,0,0.5))",
        }}
      >
        <defs>
          <radialGradient id={gSkin} cx="38%" cy="28%" r="72%">
            <stop offset="0%"   stopColor={skin.base} />
            <stop offset="75%"  stopColor={skin.shade} />
            <stop offset="100%" stopColor="#00000020" />
          </radialGradient>

          <radialGradient id={gHair} cx="30%" cy="20%" r="80%">
            <stop offset="0%"   stopColor={hair.hi} />
            <stop offset="65%"  stopColor={hair.base} />
            <stop offset="100%" stopColor="#00000030" />
          </radialGradient>

          <radialGradient id={gIris} cx="35%" cy="30%" r="75%">
            <stop offset="0%"   stopColor="#ffffff99" />
            <stop offset="40%"  stopColor={eyes.iris} />
            <stop offset="100%" stopColor={eyes.ring} />
          </radialGradient>

          <linearGradient id={gJersey} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%"   stopColor={hexToRgba(jersey, 0.95)} />
            <stop offset="100%" stopColor={hexToRgba(jersey, 0.55)} />
          </linearGradient>

          <radialGradient id={gShadow} cx="50%" cy="90%" r="55%">
            <stop offset="0%"   stopColor="#00000050" />
            <stop offset="100%" stopColor="#00000000" />
          </radialGradient>

          {/* clipPath da cabeça: ellipse + rect no topo para cabelo poder sobressair */}
          <clipPath id={clip}>
            <rect x={CX - headRx - 1} y={0} width={(headRx + 1) * 2} height={headTop + 2} />
            <ellipse cx={CX} cy={CY} rx={headRx + 1} ry={headRy + 1} />
          </clipPath>
        </defs>

        {/* fundo */}
        <rect x="0" y="0" width="120" height="120" fill="#0e1220" />
        <circle cx="60" cy="60" r="56" fill="#171b2e" />

        {/* pescoço + camisola */}
        <rect x={CX - 11} y={headBottom - 4} width={22} height={20} rx="6" fill={skin.shade} />
        <path d={`M${CX - 32} 120 C${CX - 28} ${headBottom + 4} ${CX - 12} ${headBottom + 2} ${CX - 10} ${headBottom + 2} L${CX + 10} ${headBottom + 2} C${CX + 12} ${headBottom + 2} ${CX + 28} ${headBottom + 4} ${CX + 32} 120 Z`}
          fill={`url(#${gJersey})`} />
        {/* gola */}
        <path d={`M${CX - 10} ${headBottom + 2} C${CX - 6} ${headBottom + 10} ${CX + 6} ${headBottom + 10} ${CX + 10} ${headBottom + 2}`}
          stroke={hexToRgba(jersey, 0.8)} strokeWidth="3" fill="none" strokeLinecap="round" />

        {/* sombra queixo */}
        <ellipse cx={CX} cy={headBottom - 2} rx={headRx * 0.75} ry={10} fill={`url(#${gShadow})`} />

        {/* orelhas — atrás da cabeça */}
        <ellipse cx={earLX} cy={earCY} rx={earRx}     ry={earRy}     fill={skin.shade} />
        <ellipse cx={earLX} cy={earCY} rx={earRx - 2} ry={earRy - 2} fill={skin.base} />
        <ellipse cx={earRX} cy={earCY} rx={earRx}     ry={earRy}     fill={skin.shade} />
        <ellipse cx={earRX} cy={earCY} rx={earRx - 2} ry={earRy - 2} fill={skin.base} />
        {earring && <circle cx={earLX} cy={earCY + earRy - 1} r="2.2" fill="#d4af37" stroke="#a07820" strokeWidth="0.8" />}
        {earring && <circle cx={earRX} cy={earCY + earRy - 1} r="2.2" fill="#d4af37" stroke="#a07820" strokeWidth="0.8" />}

        {/* cabeça */}
        <ellipse cx={CX} cy={CY} rx={headRx} ry={headRy} fill={`url(#${gSkin})`} />
        <ellipse cx={CX} cy={CY} rx={headRx} ry={headRy} fill="none" stroke="#00000018" strokeWidth="1.2" />

        {/* bochechas */}
        <ellipse cx={leftX  - 4} cy={mouthY - 8} rx="9" ry="6" fill={skin.blush} opacity="0.20" />
        <ellipse cx={rightX + 4} cy={mouthY - 8} rx="9" ry="6" fill={skin.blush} opacity="0.20" />

        {/* cabelo — clippado à cabeça (laterais/fundo) mas livre no topo */}
        <g clipPath={`url(#${clip})`}>
          {renderHair()}
        </g>

        {/* headband GR — por cima do cabelo */}
        {headband && (
          <rect
            x={CX - headRx + 2} y={browY - 4}
            width={(headRx - 2) * 2} height={9} rx="4"
            fill={hexToRgba(jersey, 0.85)}
            stroke={hexToRgba(jersey, 0.5)} strokeWidth="1"
          />
        )}

        {/* sardas */}
        {freckles && (
          <g fill={skin.shade} opacity="0.45">
            <circle cx={leftX  - 4} cy={mouthY - 12} r="1.1" />
            <circle cx={leftX  - 0} cy={mouthY - 9}  r="0.9" />
            <circle cx={leftX  + 4} cy={mouthY - 13} r="1.0" />
            <circle cx={rightX - 4} cy={mouthY - 12} r="1.1" />
            <circle cx={rightX + 0} cy={mouthY - 9}  r="0.9" />
            <circle cx={rightX + 4} cy={mouthY - 13} r="1.0" />
          </g>
        )}

        {mole && <circle cx={rightX + 6} cy={mouthY - 4} r="1.4" fill="#5a2e28" opacity="0.6" />}

        {renderNose()}
        {renderMouth()}
        {renderBeard()}
        {renderBrows()}

        {/* olhos */}
        <ellipse cx={leftX}  cy={eyeY} rx="8" ry={eyeOpen} fill="#ffffff" />
        <ellipse cx={rightX} cy={eyeY} rx="8" ry={eyeOpen} fill="#ffffff" />
        {/* sombra pálpebra */}
        <ellipse cx={leftX}  cy={eyeY - eyeOpen * 0.55} rx="8" ry="2" fill="#00000020" />
        <ellipse cx={rightX} cy={eyeY - eyeOpen * 0.55} rx="8" ry="2" fill="#00000020" />
        {/* íris */}
        <circle cx={leftX  + 1} cy={eyeY + 0.5} r="4.8" fill={`url(#${gIris})`} />
        <circle cx={rightX + 1} cy={eyeY + 0.5} r="4.8" fill={`url(#${gIris})`} />
        {/* pupila */}
        <circle cx={leftX  + 1.8} cy={eyeY + 1} r="2.0" fill="#080c14" />
        <circle cx={rightX + 1.8} cy={eyeY + 1} r="2.0" fill="#080c14" />
        {/* highlight */}
        <circle cx={leftX  - 1} cy={eyeY - 1.5} r="1.4" fill="#ffffffcc" />
        <circle cx={rightX - 1} cy={eyeY - 1.5} r="1.4" fill="#ffffffcc" />
        <circle cx={leftX  + 3} cy={eyeY + 1.5} r="0.6" fill="#ffffff55" />
        <circle cx={rightX + 3} cy={eyeY + 1.5} r="0.6" fill="#ffffff55" />

        {/* óculos */}
        {glasses && (
          <g>
            <rect x={leftX  - 9} y={eyeY - 7} width="18" height="13" rx="3.5" fill="#12182000" stroke="#8ea7c6aa" strokeWidth="1.5" />
            <rect x={rightX - 9} y={eyeY - 7} width="18" height="13" rx="3.5" fill="#12182000" stroke="#8ea7c6aa" strokeWidth="1.5" />
            <path d={`M${leftX + 9} ${eyeY - 1} L${rightX - 9} ${eyeY - 1}`} stroke="#8ea7c6aa" strokeWidth="1.2" />
            <path d={`M${leftX - 9} ${eyeY - 4} L${leftX - 14} ${eyeY - 6}`}  stroke="#8ea7c6aa" strokeWidth="1.1" />
            <path d={`M${rightX + 9} ${eyeY - 4} L${rightX + 14} ${eyeY - 6}`} stroke="#8ea7c6aa" strokeWidth="1.1" />
          </g>
        )}

        {/* highlight topo da cabeça */}
        <ellipse cx={CX - 6} cy={headTop + 10} rx="12" ry="7" fill="#ffffff07" />

        {/* contorno accent */}
        <circle cx="60" cy="60" r="57" fill="none" stroke={`${accent}55`} strokeWidth="2" />
      </svg>
    </div>
  );
}

export const PlayerAvatar = memo(PlayerAvatarInner, (prev, next) =>
  prev.seed === next.seed &&
  prev.position === next.position &&
  prev.teamColor === next.teamColor &&
  prev.size === next.size
);
