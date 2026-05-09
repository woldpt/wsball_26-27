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

function chance(rng, value) {
  return rng() < value;
}

function weightedPick(rng, options) {
  const total = options.reduce((acc, opt) => acc + opt.weight, 0);
  let target = rng() * total;
  for (let i = 0; i < options.length; i += 1) {
    target -= options[i].weight;
    if (target <= 0) return options[i].value;
  }
  return options[options.length - 1].value;
}

function hexToRgba(hex, alpha) {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// --------------- SIZE MAP ---------------
const SIZE_MAP = {
  sm: "w-10 h-10",
  md: "w-16 h-16",
  lg: "w-24 h-24",
  xl: "w-32 h-32",
};

/**
 * Avatar procedural cartoon, determinístico por seed.
 * @param {object} props
 * @param {number|string} props.seed - ID único do jogador
 * @param {string} [props.position] - GR | DEF | MED | ATA
 * @param {string} [props.teamColor] - hex da cor primária da equipa (ex: "#e03b2f")
 * @param {"sm"|"md"|"lg"|"xl"} [props.size="lg"] - tamanho do avatar
 */
function PlayerAvatarInner({ seed, position, teamColor, size = "lg" }) {
  const reactId = useId().replace(/:/g, "");
  const seedText = `${seed ?? "0"}|${position ?? "X"}`;
  const seedHash = xmur3(seedText)();
  const rng = mulberry32(seedHash);

  // ── Traços base ──
  const skin = pick(rng, [
    { base: "#f8d9c0", shade: "#e5b594", blush: "#f39e8a", lip: "#a35651" },
    { base: "#efc39f", shade: "#d29d76", blush: "#e6917d", lip: "#914e49" },
    { base: "#ddac80", shade: "#bc835f", blush: "#cf7d68", lip: "#7f443e" },
    { base: "#c2885b", shade: "#9b6644", blush: "#bb6b59", lip: "#6f3b36" },
    { base: "#965d37", shade: "#74442a", blush: "#9d564c", lip: "#542c28" },
    { base: "#643e27", shade: "#472b1c", blush: "#744138", lip: "#3a1f1b" },
  ]);

  const hair = pick(rng, [
    { base: "#1f1713", hi: "#3a2c24" },
    { base: "#3b2416", hi: "#5e3b27" },
    { base: "#6b421f", hi: "#956338" },
    { base: "#8d6130", hi: "#b3895a" },
    { base: "#b7995d", hi: "#d0b780" },
    { base: "#d8c6a0", hi: "#e8dcc3" },
    { base: "#59606d", hi: "#858d9d" },
    { base: "#94463a", hi: "#b96657" },
  ]);

  const eyes = pick(rng, [
    { iris: "#356d92", ring: "#234a63" },
    { iris: "#6f8f35", ring: "#4e6428" },
    { iris: "#6d4b2e", ring: "#4a311f" },
    { iris: "#6a727d", ring: "#4a515a" },
    { iris: "#2b5f7c", ring: "#20445c" },
    { iris: "#7c5d8e", ring: "#523b60" },
  ]);

  const expression = weightedPick(rng, [
    { value: "smile",   weight: position === "ATA" ? 2.5 : 1.7 },
    { value: "grin",    weight: position === "ATA" ? 1.8 : 1.2 },
    { value: "neutral", weight: position === "MED" ? 2.2 : 1.5 },
    { value: "serious", weight: position === "DEF" ? 2.2 : 1.3 },
    { value: "focused", weight: position === "GR"  ? 2.3 : 1.0 },
  ]);

  const faceShape = pick(rng, ["round", "oval", "square"]);
  const hairStyle = weightedPick(rng, [
    { value: "bald",    weight: 0.6 },
    { value: "short",   weight: 2.3 },
    { value: "swoop",   weight: 1.6 },
    { value: "curly",   weight: 1.3 },
    { value: "mohawk",  weight: 0.4 },
    { value: "long",    weight: 0.8 },
    { value: "afro",    weight: 0.8 },
    { value: "spiky",   weight: 0.95 },
  ]);

  const beard = weightedPick(rng, [
    { value: "none",     weight: 2.9 },
    { value: "stubble",  weight: 1.1 },
    { value: "mustache", weight: 0.4 },
    { value: "goatee",   weight: 0.45 },
    { value: "full",     weight: 0.5 },
  ]);

  const noseStyle    = pick(rng, ["default", "wide", "slim", "button"]);
  const browStyle    = pick(rng, ["arch", "straight", "thick"]);
  const glasses      = chance(rng, 0.13);
  const freckles     = chance(rng, 0.14);
  const mole         = chance(rng, 0.08);
  const scar         = chance(rng, 0.06);
  const earring      = chance(rng, 0.10);
  const headband     = position === "GR" && chance(rng, 0.45);

  // Proporções variáveis do rosto
  const eyeVertOffset  = -2 + rng() * 4;   // olhos mais altos ou baixos
  const mouthVertOff   = -2 + rng() * 4;   // boca mais alta ou baixa
  const eyeOpen        = 4.2 + rng() * 2.2;
  const browWidth      = 2.4 + rng() * 1.4;
  const ear            = 6 + rng() * 2;
  const accent         = POSITION_ACCENT[position] || "#94a3b8";
  const jersey         = teamColor || accent;

  const eyeY   = 60 + eyeVertOffset;
  const leftX  = 44;
  const rightX = 76;
  const angryTilt = expression === "focused" || expression === "serious" ? 2.5 : 0;

  // Gradient / clip IDs
  const skinGradId   = `skin-${reactId}`;
  const hairGradId   = `hair-${reactId}`;
  const irisGradId   = `iris-${reactId}`;
  const jerseyGradId = `jersey-${reactId}`;
  const shadowId     = `shadow-${reactId}`;
  const dropId       = `drop-${reactId}`;
  const hairClipId   = `hclip-${reactId}`;

  // ── Forme da cabeça ──
  // "square": topo largo mas arredondado (não reto), lados mais verticais, queixo amplo
  const headPath =
    faceShape === "oval"
      ? "M60 16 C84 16 98 34 98 58 C98 87 82 104 60 104 C38 104 22 87 22 58 C22 34 36 16 60 16 Z"
      : faceShape === "square"
        ? "M60 17 C78 17 97 22 98 38 V76 C98 93 80 104 60 104 C40 104 22 93 22 76 V38 C23 22 42 17 60 17 Z"
        : "M60 17 C84 17 98 35 98 58 C98 86 82 104 60 104 C38 104 22 86 22 58 C22 35 36 17 60 17 Z";

  // ── Cabelo ──
  const renderHair = () => {
    if (hairStyle === "bald") return null;
    if (hairStyle === "short") return (
      <g>
        <path d="M20 48 C22 20 40 10 60 10 C80 10 98 20 100 48 C88 41 75 37 60 37 C45 37 32 41 20 48 Z" fill={`url(#${hairGradId})`} />
        <path d="M34 30 C42 23 50 21 60 21 C70 21 78 23 86 30" stroke={hair.hi} strokeWidth="3" fill="none" opacity="0.65" />
      </g>
    );
    if (hairStyle === "swoop") return (
      <g>
        <path d="M18 51 C22 20 45 10 68 11 C86 11 98 20 100 42 C92 37 81 34 70 33 C57 32 37 36 18 51 Z" fill={`url(#${hairGradId})`} />
        <path d="M71 34 C64 45 53 50 43 54" stroke={hair.hi} strokeWidth="3" fill="none" opacity="0.55" />
      </g>
    );
    if (hairStyle === "curly") return (
      <g fill={`url(#${hairGradId})`}>
        <circle cx="30" cy="30" r="12" />
        <circle cx="45" cy="21" r="13" />
        <circle cx="60" cy="18" r="13" />
        <circle cx="75" cy="21" r="13" />
        <circle cx="90" cy="30" r="12" />
        <circle cx="60" cy="31" r="15" />
      </g>
    );
    if (hairStyle === "mohawk") return (
      <g>
        <path d="M48 49 L48 8 L60 3 L72 8 L72 49 Z" fill={`url(#${hairGradId})`} />
        <path d="M56 12 L61 10 L65 17" stroke={hair.hi} strokeWidth="2" fill="none" opacity="0.6" />
      </g>
    );
    if (hairStyle === "long") return (
      <g>
        <path d="M19 46 C19 18 38 8 60 8 C82 8 101 18 101 46 L101 100 L83 100 L83 60 C76 53 69 51 60 51 C51 51 44 53 37 60 L37 100 L19 100 Z" fill={`url(#${hairGradId})`} />
        <path d="M35 26 C43 18 51 15 60 15 C69 15 77 18 85 26" stroke={hair.hi} strokeWidth="3" fill="none" opacity="0.5" />
      </g>
    );
    if (hairStyle === "afro") return (
      <g>
        <ellipse cx="60" cy="45" rx="46" ry="37" fill={`url(#${hairGradId})`} />
        <ellipse cx="60" cy="49" rx="40" ry="30" fill={hair.base} opacity="0.35" />
      </g>
    );
    // spiky (default)
    return (
      <g>
        <path d="M19 50 C23 23 41 10 60 10 C79 10 97 23 101 50 C93 41 84 36 75 34 C65 32 54 32 45 35 C35 38 27 43 19 50 Z" fill={`url(#${hairGradId})`} />
        <path d="M31 31 L37 20 L43 31" stroke={hair.hi} strokeWidth="2.6" fill="none" opacity="0.65" />
        <path d="M47 27 L53 16 L59 27" stroke={hair.hi} strokeWidth="2.6" fill="none" opacity="0.65" />
        <path d="M63 27 L69 16 L75 27" stroke={hair.hi} strokeWidth="2.6" fill="none" opacity="0.65" />
      </g>
    );
  };

  // ── Barba ──
  const renderBeard = () => {
    if (beard === "none") return null;
    if (beard === "stubble") return (
      <path d="M35 78 C42 91 50 96 60 96 C70 96 78 91 85 78" stroke={hair.base} strokeWidth="3.5" fill="none" opacity="0.28" strokeLinecap="round" strokeDasharray="1.5 2.5" />
    );
    if (beard === "mustache") return (
      <path d="M43 73 C47 70 51 70 55 73 C57 74 59 74 60 73 C61 74 63 74 65 73 C69 70 73 70 77 73" stroke={hair.base} strokeWidth="3" fill="none" strokeLinecap="round" />
    );
    if (beard === "goatee") return (
      <g>
        <path d="M46 88 C50 95 55 99 60 99 C65 99 70 95 74 88" stroke={hair.base} strokeWidth="4" fill="none" strokeLinecap="round" />
        <path d="M44 73 C48 71 52 71 56 74" stroke={hair.base} strokeWidth="2.8" fill="none" strokeLinecap="round" />
        <path d="M64 74 C68 71 72 71 76 73" stroke={hair.base} strokeWidth="2.8" fill="none" strokeLinecap="round" />
      </g>
    );
    return <path d="M30 76 C34 93 45 103 60 103 C75 103 86 93 90 76 L90 88 C83 98 73 104 60 104 C47 104 37 98 30 88 Z" fill={hair.base} opacity="0.80" />;
  };

  // ── Nariz ──
  const renderNose = () => {
    if (noseStyle === "wide") return (
      <g>
        <path d="M57 61 C58 67 59 71 59 75 C59 77 56 79 54 78" stroke="#0000002e" strokeWidth="2" fill="none" strokeLinecap="round" />
        <ellipse cx="57" cy="79" rx="4.5" ry="1.6" fill="#00000019" />
        <ellipse cx="63" cy="79" rx="4.5" ry="1.6" fill="#00000019" />
      </g>
    );
    if (noseStyle === "slim") return (
      <g>
        <path d="M59 60 C60 66 61 72 61 77" stroke="#0000002b" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        <ellipse cx="59" cy="78" rx="2.2" ry="1" fill="#00000016" />
      </g>
    );
    if (noseStyle === "button") return (
      <g>
        <circle cx="60" cy="77" r="3.5" fill="#00000013" />
        <path d="M57 74 C58 72 62 72 63 74" stroke="#0000002a" strokeWidth="1.4" fill="none" strokeLinecap="round" />
      </g>
    );
    // default
    return (
      <g>
        <path d="M58 61 C59 67 60 71 60 75 C60 77 58 78 56 78" stroke="#0000002b" strokeWidth="1.9" fill="none" strokeLinecap="round" />
        <ellipse cx="58" cy="78" rx="3" ry="1.2" fill="#00000016" />
      </g>
    );
  };

  // ── Sobrancelhas ──
  const renderBrows = () => {
    const bY = eyeY - 12;
    if (browStyle === "straight") return (
      <g stroke={hair.base} strokeWidth={browWidth} fill="none" strokeLinecap="round">
        <path d={`M35 ${bY + angryTilt} L53 ${bY + angryTilt}`} />
        <path d={`M67 ${bY + angryTilt} L85 ${bY + angryTilt}`} />
      </g>
    );
    if (browStyle === "thick") return (
      <g stroke={hair.base} strokeWidth={browWidth + 1.2} fill="none" strokeLinecap="round" opacity="0.9">
        <path d={`M33 ${bY + 2 + angryTilt} C40 ${bY - 2 - angryTilt} 48 ${bY - 2 - angryTilt} 54 ${bY + 2 + angryTilt}`} />
        <path d={`M66 ${bY + 2 + angryTilt} C72 ${bY - 2 - angryTilt} 80 ${bY - 2 - angryTilt} 87 ${bY + 2 + angryTilt}`} />
      </g>
    );
    // arch (default)
    return (
      <g stroke={hair.base} strokeWidth={browWidth} fill="none" strokeLinecap="round">
        <path d={`M34 ${bY + 2 + angryTilt} C40 ${bY - 3 - angryTilt} 48 ${bY - 3 - angryTilt} 53 ${bY + 2 + angryTilt}`} />
        <path d={`M67 ${bY + 2 + angryTilt} C72 ${bY - 3 - angryTilt} 80 ${bY - 3 - angryTilt} 86 ${bY + 2 + angryTilt}`} />
      </g>
    );
  };

  // ── Boca ──
  const renderMouth = () => {
    const mY = 85 + mouthVertOff;
    if (expression === "smile") return (
      <path d={`M44 ${mY - 1} C50 ${mY + 9} 70 ${mY + 9} 76 ${mY - 1}`} stroke={skin.lip} strokeWidth="2.7" fill="none" strokeLinecap="round" />
    );
    if (expression === "grin") return (
      <path d={`M43 ${mY - 2} C49 ${mY + 10} 71 ${mY + 10} 77 ${mY - 2} C72 ${mY + 2} 48 ${mY + 2} 43 ${mY - 2} Z`} fill="#f9f9f9" stroke={skin.lip} strokeWidth="2" />
    );
    if (expression === "serious") return (
      <path d={`M46 ${mY + 1} C54 ${mY - 3} 66 ${mY - 3} 74 ${mY + 1}`} stroke={skin.lip} strokeWidth="2.2" fill="none" strokeLinecap="round" />
    );
    if (expression === "focused") return (
      <path d={`M47 ${mY} C55 ${mY - 1.5} 65 ${mY - 1.5} 73 ${mY}`} stroke={skin.lip} strokeWidth="2" fill="none" strokeLinecap="round" />
    );
    return <path d={`M47 ${mY} L73 ${mY}`} stroke={skin.lip} strokeWidth="2" fill="none" strokeLinecap="round" />;
  };

  // ── Camisola / pescoço ──
  const renderJersey = () => (
    <g>
      {/* pescoço */}
      <path d="M50 105 C53 108 56 110 60 110 C64 110 67 108 70 105 L70 120 L50 120 Z" fill={skin.shade} />
      {/* ombros da camisola */}
      <path d="M28 120 C32 107 44 104 50 106 L50 120 Z" fill={`url(#${jerseyGradId})`} />
      <path d="M92 120 C88 107 76 104 70 106 L70 120 Z" fill={`url(#${jerseyGradId})`} />
      {/* gola */}
      <path d="M46 107 C50 112 56 114 60 114 C64 114 70 112 74 107" stroke={hexToRgba(jersey, 0.9)} strokeWidth="3.5" fill="none" strokeLinecap="round" />
    </g>
  );

  // ── Bon é / headband GR ──
  const renderHeadband = () => (
    <rect x="21" y="47" width="78" height="8" rx="4"
      fill={hexToRgba(jersey, 0.82)}
      stroke={hexToRgba(jersey, 0.5)}
      strokeWidth="1" />
  );

  return (
    <div className="relative shrink-0">
      <svg
        viewBox="0 0 120 120"
        className={`${SIZE_MAP[size] ?? SIZE_MAP.lg} rounded-full`}
        style={{
          backgroundColor: "#111423",
          border: `2px solid ${accent}66`,
          filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.55))",
        }}
      >
        <defs>
          <radialGradient id={skinGradId} cx="36%" cy="24%" r="74%">
            <stop offset="0%" stopColor={skin.base} />
            <stop offset="78%" stopColor={skin.shade} />
            <stop offset="100%" stopColor="#00000026" />
          </radialGradient>

          <linearGradient id={hairGradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={hair.hi} />
            <stop offset="70%" stopColor={hair.base} />
            <stop offset="100%" stopColor="#0000002b" />
          </linearGradient>

          <radialGradient id={irisGradId} cx="38%" cy="34%" r="70%">
            <stop offset="0%" stopColor="#ffffffb5" />
            <stop offset="36%" stopColor={eyes.iris} />
            <stop offset="100%" stopColor={eyes.ring} />
          </radialGradient>

          <linearGradient id={jerseyGradId} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={hexToRgba(jersey, 0.95)} />
            <stop offset="100%" stopColor={hexToRgba(jersey, 0.6)} />
          </linearGradient>

          {/* sombra suave sob o queixo */}
          <radialGradient id={shadowId} cx="50%" cy="100%" r="50%">
            <stop offset="0%" stopColor="#00000045" />
            <stop offset="100%" stopColor="#00000000" />
          </radialGradient>

          <filter id={dropId} x="-10%" y="-10%" width="120%" height="130%">
            <feDropShadow dx="0" dy="1.5" stdDeviation="2.5" floodColor="#000000" floodOpacity="0.38" />
          </filter>

          {/* clip para o cabelo não sair fora das laterais/fundo da cabeça
              — rect cobre a zona acima da testa (cabelo visível no topo) */}
          <clipPath id={hairClipId}>
            <rect x="0" y="0" width="120" height="20" />
            <path d={headPath} />
          </clipPath>
        </defs>

        {/* fundo */}
        <rect x="0" y="0" width="120" height="120" fill="#101424" />
        <circle cx="60" cy="60" r="54" fill="#181c2c" opacity="0.95" />

        {/* camisola / pescoço (por baixo da cabeça) */}
        {renderJersey()}

        {/* sombra queixo */}
        <ellipse cx="60" cy="106" rx="26" ry="8" fill={`url(#${shadowId})`} />

        {/* orelhas */}
        <ellipse cx="24" cy="64" rx={ear} ry={ear + 1.6} fill={skin.shade} opacity="0.95" />
        <ellipse cx="96" cy="64" rx={ear} ry={ear + 1.6} fill={skin.shade} opacity="0.95" />
        <ellipse cx="25" cy="64" rx={ear - 1.3} ry={ear} fill={skin.base} />
        <ellipse cx="95" cy="64" rx={ear - 1.3} ry={ear} fill={skin.base} />
        {/* concha da orelha */}
        <path d="M24 60 C26 65 25 70 24 72" stroke={skin.shade} strokeWidth="1.3" fill="none" opacity="0.5" />
        <path d="M96 60 C94 65 95 70 96 72" stroke={skin.shade} strokeWidth="1.3" fill="none" opacity="0.5" />
        {/* brinco */}
        {earring && <circle cx="24" cy="74" r="2" fill="#d4af37" stroke="#b8941e" strokeWidth="0.8" />}
        {earring && <circle cx="96" cy="74" r="2" fill="#d4af37" stroke="#b8941e" strokeWidth="0.8" />}

        {/* cabeça */}
        <g filter={`url(#${dropId})`}>
          <path d={headPath} fill={`url(#${skinGradId})`} />
        </g>
        <path d={headPath} fill="none" stroke="#00000018" strokeWidth="1.5" />

        {/* highlight de luz no topo da cabeça */}
        <ellipse cx="52" cy="32" rx="16" ry="9" fill="#ffffff08" />

        {/* bochechas */}
        <ellipse cx="41" cy="76" rx="9" ry="6" fill={skin.blush} opacity="0.22" />
        <ellipse cx="79" cy="76" rx="9" ry="6" fill={skin.blush} opacity="0.22" />

        <g clipPath={`url(#${hairClipId})`}>{renderHair()}</g>

        {/* headband GR */}
        {headband && renderHeadband()}

        {/* sardas */}
        {freckles && (
          <g fill="#8f5b49" opacity="0.28">
            <circle cx="37" cy="75" r="1" />
            <circle cx="41" cy="78" r="1.1" />
            <circle cx="83" cy="75" r="1" />
            <circle cx="79" cy="78" r="1.1" />
            <circle cx="39" cy="72" r="0.8" />
            <circle cx="81" cy="72" r="0.8" />
          </g>
        )}

        {mole  && <circle cx="74" cy="88" r="1.4" fill="#6a3e34" opacity="0.65" />}
        {scar  && <path d="M71 52 C69 58 67 63 66 68" stroke="#d4d4d4aa" strokeWidth="1.3" fill="none" strokeLinecap="round" />}

        {renderNose()}
        {renderMouth()}
        {renderBeard()}
        {renderBrows()}

        {/* olhos — branco */}
        <ellipse cx={leftX}  cy={eyeY} rx="8.5" ry={eyeOpen} fill="#ffffff" />
        <ellipse cx={rightX} cy={eyeY} rx="8.5" ry={eyeOpen} fill="#ffffff" />
        {/* sombra superior da pálpebra */}
        <ellipse cx={leftX}  cy={eyeY - eyeOpen * 0.6} rx="8.5" ry="2.2" fill="#00000018" />
        <ellipse cx={rightX} cy={eyeY - eyeOpen * 0.6} rx="8.5" ry="2.2" fill="#00000018" />

        {/* íris */}
        <circle cx={leftX  + 1.3} cy={eyeY + 0.2} r="5.1" fill={`url(#${irisGradId})`} />
        <circle cx={rightX + 1.3} cy={eyeY + 0.2} r="5.1" fill={`url(#${irisGradId})`} />
        {/* pupila */}
        <circle cx={leftX  + 2.2} cy={eyeY + 0.8} r="2.1" fill="#0e1118" />
        <circle cx={rightX + 2.2} cy={eyeY + 0.8} r="2.1" fill="#0e1118" />
        {/* highlight principal */}
        <circle cx={leftX  - 1.5} cy={eyeY - 2}   r="1.5" fill="#ffffffcc" />
        <circle cx={rightX - 1.5} cy={eyeY - 2}   r="1.5" fill="#ffffffcc" />
        {/* highlight secundário pequeno */}
        <circle cx={leftX  + 3}   cy={eyeY + 1.5} r="0.7" fill="#ffffff66" />
        <circle cx={rightX + 3}   cy={eyeY + 1.5} r="0.7" fill="#ffffff66" />

        {renderBrows()}

        {/* óculos */}
        {glasses && (
          <g>
            <rect x="33" y={eyeY - 7} width="20" height="14" rx="4" fill="#1318261f" stroke="#8ea7c699" strokeWidth="1.5" />
            <rect x="63" y={eyeY - 7} width="20" height="14" rx="4" fill="#1318261f" stroke="#8ea7c699" strokeWidth="1.5" />
            <path d={`M53 ${eyeY} L63 ${eyeY}`} stroke="#8ea7c699" strokeWidth="1.3" />
            <path d="M33 57 L28 55" stroke="#8ea7c699" strokeWidth="1.2" />
            <path d="M83 57 L88 55" stroke="#8ea7c699" strokeWidth="1.2" />
          </g>
        )}

        {/* contorno accent */}
        <circle cx="60" cy="60" r="57" fill="none" stroke={`${accent}66`} strokeWidth="2.5" />
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
