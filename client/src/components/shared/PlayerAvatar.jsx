import { useId } from "react";

const POSITION_ACCENT = {
  GR: "#eab308",
  DEF: "#3b82f6",
  MED: "#10b981",
  ATA: "#f43f5e",
};

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

function weightedPick(rng, options) {
  const total = options.reduce((acc, opt) => acc + opt.weight, 0);
  let target = rng() * total;
  for (let i = 0; i < options.length; i += 1) {
    target -= options[i].weight;
    if (target <= 0) return options[i].value;
  }
  return options[options.length - 1].value;
}

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

function chance(rng, value) {
  return rng() < value;
}

/**
 * @param {"round"|"oval"|"square"|"heart"} shape
 */
function getFacePath(shape) {
  if (shape === "oval") {
    return "M60 16 C84 16 98 34 98 58 C98 86 82 104 60 104 C38 104 22 86 22 58 C22 34 36 16 60 16 Z";
  }
  if (shape === "square") {
    return "M33 20 L87 20 C93 20 98 25 98 31 L98 75 C98 93 80 104 60 104 C40 104 22 93 22 75 L22 31 C22 25 27 20 33 20 Z";
  }
  if (shape === "heart") {
    return "M60 17 C81 17 97 34 94 58 C92 75 81 104 60 104 C39 104 28 75 26 58 C23 34 39 17 60 17 Z";
  }
  return "M60 18 C83 18 98 35 98 58 C98 86 81 104 60 104 C39 104 22 86 22 58 C22 35 37 18 60 18 Z";
}

/**
 * Avatar procedural com geração determinística por seed.
 * @param {number|string} seed
 * @param {string} position
 */
export function PlayerAvatar({ seed, position }) {
  const reactId = useId().replace(/:/g, "");
  const seedText = `${seed ?? "0"}|${position ?? "X"}`;
  const seedHash = xmur3(seedText)();
  const rng = mulberry32(seedHash);

  const skinPalette = pick(rng, [
    { base: "#f7d8bf", shadow: "#d9b192", blush: "#e49c89", lip: "#9d5b55" },
    { base: "#ecc3a4", shadow: "#cc9f82", blush: "#d68d7c", lip: "#8f534d" },
    { base: "#d8a67a", shadow: "#b37e5b", blush: "#c17a67", lip: "#7e453f" },
    { base: "#bc8356", shadow: "#925f3c", blush: "#ad6657", lip: "#6d3c36" },
    { base: "#8f5a35", shadow: "#6d4328", blush: "#91534a", lip: "#552c28" },
    { base: "#5c3a24", shadow: "#3f2819", blush: "#6c3e37", lip: "#3a1f1c" },
  ]);

  const hairPalette = pick(rng, [
    { base: "#1b1715", hi: "#3c312b" },
    { base: "#322017", hi: "#57382a" },
    { base: "#6b3f1c", hi: "#956133" },
    { base: "#8c5a2a", hi: "#b17f4a" },
    { base: "#a47b42", hi: "#c6a362" },
    { base: "#ccb78d", hi: "#e2d1b0" },
    { base: "#5d5f68", hi: "#8a8d99" },
    { base: "#8f3f32", hi: "#b25f4f" },
  ]);

  const eyePalette = pick(rng, [
    { iris: "#2e5b7a", ring: "#203a51" },
    { iris: "#6a8f2e", ring: "#445f1c" },
    { iris: "#5f3e26", ring: "#3a2619" },
    { iris: "#6c6f79", ring: "#4f525b" },
    { iris: "#35627c", ring: "#264859" },
  ]);

  const expression = weightedPick(rng, [
    {
      value: "smile",
      weight: position === "ATA" ? 2.2 : 1.3,
    },
    {
      value: "grin",
      weight: position === "ATA" ? 1.8 : 1.0,
    },
    {
      value: "neutral",
      weight: position === "MED" ? 2.1 : 1.5,
    },
    {
      value: "serious",
      weight: position === "GR" || position === "DEF" ? 2.3 : 1.2,
    },
    {
      value: "focused",
      weight: position === "GR" ? 1.8 : 0.9,
    },
  ]);

  const traits = {
    faceShape: pick(rng, ["round", "oval", "square", "heart"]),
    hairStyle: weightedPick(rng, [
      { value: "bald", weight: 0.7 },
      { value: "buzz", weight: 1.0 },
      { value: "short", weight: 2.2 },
      { value: "side", weight: 1.6 },
      { value: "curly", weight: 1.4 },
      { value: "afro", weight: 0.9 },
      { value: "mohawk", weight: 0.45 },
      { value: "long", weight: 0.8 },
      { value: "undercut", weight: 0.95 },
    ]),
    eyeOpen: 4.6 + rng() * 1.8,
    browThickness: 1.9 + rng() * 1.6,
    noseType: pick(rng, ["soft", "roman", "button"]),
    mouthType: pick(rng, ["thin", "full"]),
    earSize: 5.4 + rng() * 2.6,
    freckles: chance(rng, 0.16),
    mole: chance(rng, 0.07),
    glasses: chance(rng, 0.14),
    scar: chance(rng, 0.08),
    beard: weightedPick(rng, [
      { value: "none", weight: 2.7 },
      { value: "stubble", weight: 1.0 },
      { value: "goatee", weight: 0.5 },
      { value: "full", weight: 0.6 },
      { value: "mustache", weight: 0.45 },
    ]),
  };

  if (traits.hairStyle === "bald" && traits.beard === "none" && chance(rng, 0.6)) {
    traits.beard = "stubble";
  }

  const accent = POSITION_ACCENT[position] || "#9ca3af";
  const facePath = getFacePath(traits.faceShape);
  const clipId = `avatarClip-${reactId}`;
  const skinGradId = `avatarSkin-${reactId}`;
  const hairGradId = `avatarHair-${reactId}`;
  const irisGradId = `avatarIris-${reactId}`;

  const renderHairBack = () => {
    switch (traits.hairStyle) {
      case "long":
        return (
          <path
            d="M20 44 C20 18 40 7 60 7 C80 7 100 18 100 44 L100 100 L82 100 L82 61 C75 54 69 52 60 52 C51 52 45 54 38 61 L38 100 L20 100 Z"
            fill={`url(#${hairGradId})`}
          />
        );
      case "curly":
        return (
          <g fill={`url(#${hairGradId})`}>
            <circle cx="26" cy="41" r="12" />
            <circle cx="94" cy="41" r="12" />
            <circle cx="16" cy="56" r="10" />
            <circle cx="104" cy="56" r="10" />
          </g>
        );
      case "afro":
        return <ellipse cx="60" cy="46" rx="48" ry="42" fill={`url(#${hairGradId})`} />;
      default:
        return null;
    }
  };

  const renderHairFront = () => {
    switch (traits.hairStyle) {
      case "bald":
        return null;
      case "buzz":
        return <path d="M24 46 C26 24 41 13 60 13 C79 13 94 24 96 46" fill="none" stroke={hairPalette.base} strokeWidth="7" strokeLinecap="round" />;
      case "short":
        return (
          <g>
            <path d="M22 48 C24 18 41 11 60 11 C79 11 96 18 98 48 C87 41 74 38 60 38 C46 38 33 41 22 48 Z" fill={`url(#${hairGradId})`} />
            <path d="M32 30 C41 22 50 20 61 20 C72 20 81 22 88 30" stroke={hairPalette.hi} strokeWidth="3" fill="none" opacity="0.55" />
          </g>
        );
      case "side":
        return (
          <g>
            <path d="M21 50 C24 18 45 9 66 10 C84 10 97 20 99 44 C91 38 82 35 72 34 C61 33 43 36 21 50 Z" fill={`url(#${hairGradId})`} />
            <path d="M72 34 C65 43 54 49 45 52" stroke={hairPalette.hi} strokeWidth="3" fill="none" opacity="0.5" />
          </g>
        );
      case "curly":
        return (
          <g fill={`url(#${hairGradId})`}>
            <circle cx="30" cy="30" r="13" />
            <circle cx="46" cy="20" r="14" />
            <circle cx="60" cy="17" r="14" />
            <circle cx="74" cy="20" r="14" />
            <circle cx="90" cy="30" r="13" />
            <circle cx="60" cy="30" r="16" />
          </g>
        );
      case "afro":
        return (
          <g>
            <ellipse cx="60" cy="44" rx="46" ry="38" fill={`url(#${hairGradId})`} />
            <ellipse cx="60" cy="48" rx="40" ry="30" fill={hairPalette.base} opacity="0.42" />
          </g>
        );
      case "mohawk":
        return (
          <g>
            <path d="M48 48 L48 7 L60 2 L72 7 L72 48 Z" fill={`url(#${hairGradId})`} />
            <path d="M56 13 L63 10 L66 18" stroke={hairPalette.hi} strokeWidth="2" fill="none" opacity="0.6" />
          </g>
        );
      case "long":
        return (
          <g>
            <path d="M20 48 C20 18 38 8 60 8 C82 8 100 18 100 48 C90 39 76 34 60 34 C44 34 30 39 20 48 Z" fill={`url(#${hairGradId})`} />
            <path d="M36 26 C45 18 53 16 60 16 C67 16 75 18 84 26" stroke={hairPalette.hi} strokeWidth="3" fill="none" opacity="0.55" />
          </g>
        );
      case "undercut":
        return (
          <g>
            <path d="M23 54 C25 24 44 10 64 10 C81 10 96 21 97 42 C85 35 73 32 60 33 C47 34 35 39 23 54 Z" fill={`url(#${hairGradId})`} />
            <path d="M27 57 C35 53 42 50 52 48" stroke={hairPalette.base} strokeWidth="6" fill="none" opacity="0.35" />
          </g>
        );
      default:
        return null;
    }
  };

  const renderBeard = () => {
    if (traits.beard === "none") return null;
    if (traits.beard === "stubble") {
      return <path d="M35 78 C43 93 51 98 60 98 C69 98 77 93 85 78" stroke={hairPalette.base} strokeWidth="3" fill="none" opacity="0.35" strokeLinecap="round" />;
    }
    if (traits.beard === "mustache") {
      return (
        <path
          d="M42 73 C47 70 50 70 54 73 C56 74 58 74 60 73 C62 74 64 74 66 73 C70 70 73 70 78 73"
          stroke={hairPalette.base}
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
        />
      );
    }
    if (traits.beard === "goatee") {
      return (
        <g>
          <path d="M46 88 C51 96 55 99 60 99 C65 99 69 96 74 88" stroke={hairPalette.base} strokeWidth="4" fill="none" strokeLinecap="round" />
          <path d="M43 73 C48 71 52 71 57 74" stroke={hairPalette.base} strokeWidth="2.8" fill="none" strokeLinecap="round" />
          <path d="M63 74 C68 71 72 71 77 73" stroke={hairPalette.base} strokeWidth="2.8" fill="none" strokeLinecap="round" />
        </g>
      );
    }
    return <path d="M30 76 C34 93 45 103 60 103 C75 103 86 93 90 76 L90 88 C83 98 73 105 60 105 C47 105 37 98 30 88 Z" fill={hairPalette.base} opacity="0.86" />;
  };

  const renderNose = () => {
    if (traits.noseType === "roman") {
      return <path d="M58 60 C60 66 61 71 62 76 C61 77 59 78 57 77" stroke="#00000038" strokeWidth="1.8" fill="none" strokeLinecap="round" />;
    }
    if (traits.noseType === "button") {
      return (
        <g>
          <circle cx="60" cy="73" r="2.2" fill="#0000001f" />
          <circle cx="57" cy="74" r="1" fill="#0000001b" />
          <circle cx="63" cy="74" r="1" fill="#0000001b" />
        </g>
      );
    }
    return <path d="M58 61 C59 66 60 70 60 74 C60 76 58 77 56 77" stroke="#0000002b" strokeWidth="1.7" fill="none" strokeLinecap="round" />;
  };

  const renderMouth = () => {
    const mouthColor = skinPalette.lip;
    if (expression === "smile") {
      return <path d="M44 84 C50 92 70 92 76 84" stroke={mouthColor} strokeWidth={traits.mouthType === "full" ? 3 : 2.2} fill="none" strokeLinecap="round" />;
    }
    if (expression === "grin") {
      return (
        <path
          d="M43 83 C50 95 70 95 77 83 C72 87 48 87 43 83 Z"
          fill="#f8f8f8"
          stroke={mouthColor}
          strokeWidth="2"
        />
      );
    }
    if (expression === "serious") {
      return <path d="M46 86 C54 82 66 82 74 86" stroke={mouthColor} strokeWidth="2.2" fill="none" strokeLinecap="round" />;
    }
    if (expression === "focused") {
      return <path d="M47 86 C55 84 65 84 73 86" stroke={mouthColor} strokeWidth="2" fill="none" strokeLinecap="round" />;
    }
    return <path d="M47 86 L73 86" stroke={mouthColor} strokeWidth="2" fill="none" strokeLinecap="round" />;
  };

  const eyeY = 61;
  const leftX = 45;
  const rightX = 75;
  const eyeRx = 8.2;
  const eyeRy = traits.eyeOpen;
  const angryTilt = expression === "focused" || expression === "serious" ? 2 : 0;

  return (
    <div className="relative shrink-0">
      <svg
        viewBox="0 0 120 120"
        className="w-20 h-20 rounded-full shadow-lg"
        style={{
          backgroundColor: "#141420",
          border: `2px solid ${accent}55`,
        }}
      >
        <defs>
          <clipPath id={clipId}>
            <path d={facePath} />
          </clipPath>

          <radialGradient id={skinGradId} cx="38%" cy="26%" r="72%">
            <stop offset="0%" stopColor={skinPalette.base} />
            <stop offset="70%" stopColor={skinPalette.shadow} />
            <stop offset="100%" stopColor="#0000002b" />
          </radialGradient>

          <linearGradient id={hairGradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={hairPalette.hi} />
            <stop offset="72%" stopColor={hairPalette.base} />
            <stop offset="100%" stopColor="#00000033" />
          </linearGradient>

          <radialGradient id={irisGradId} cx="38%" cy="34%" r="68%">
            <stop offset="0%" stopColor="#ffffffbf" />
            <stop offset="35%" stopColor={eyePalette.iris} />
            <stop offset="100%" stopColor={eyePalette.ring} />
          </radialGradient>
        </defs>

        <rect x="0" y="0" width="120" height="120" fill="#0f111b" />
        <circle cx="60" cy="60" r="54" fill="#171a28" opacity="0.95" />

        <path d="M42 99 C47 106 52 111 60 111 C68 111 73 106 78 99 L74 120 L46 120 Z" fill={skinPalette.shadow} />
        <path d="M45 100 C50 106 55 109 60 109 C65 109 70 106 75 100" stroke="#00000024" strokeWidth="3" fill="none" />

        {renderHairBack()}

        <g>
          <path d={facePath} fill={`url(#${skinGradId})`} />
          <path d={facePath} fill="none" stroke="#00000022" strokeWidth="1.2" />
          <ellipse cx="42" cy="74" rx="7" ry="5" fill={skinPalette.blush} opacity="0.17" />
          <ellipse cx="78" cy="74" rx="7" ry="5" fill={skinPalette.blush} opacity="0.17" />
        </g>

        <ellipse cx="24" cy="64" rx={traits.earSize} ry={traits.earSize + 1.6} fill={skinPalette.shadow} opacity="0.95" />
        <ellipse cx="96" cy="64" rx={traits.earSize} ry={traits.earSize + 1.6} fill={skinPalette.shadow} opacity="0.95" />
        <ellipse cx="25" cy="64" rx={traits.earSize - 1.5} ry={traits.earSize} fill={skinPalette.base} />
        <ellipse cx="95" cy="64" rx={traits.earSize - 1.5} ry={traits.earSize} fill={skinPalette.base} />

        <g clipPath={`url(#${clipId})`}>
          <path d="M26 68 C35 58 45 54 60 53 C75 54 85 58 94 68 L94 104 L26 104 Z" fill="#00000012" />

          <ellipse cx={leftX} cy={eyeY} rx={eyeRx} ry={eyeRy} fill="#fefefe" />
          <ellipse cx={rightX} cy={eyeY} rx={eyeRx} ry={eyeRy} fill="#fefefe" />

          <circle cx={leftX + 1.2} cy={eyeY + 0.4} r="4.6" fill={`url(#${irisGradId})`} />
          <circle cx={rightX + 1.2} cy={eyeY + 0.4} r="4.6" fill={`url(#${irisGradId})`} />

          <circle cx={leftX + 2.2} cy={eyeY + 0.8} r="1.9" fill="#101216" />
          <circle cx={rightX + 2.2} cy={eyeY + 0.8} r="1.9" fill="#101216" />

          <circle cx={leftX - 1.4} cy={eyeY - 1.8} r="1.2" fill="#ffffffc2" />
          <circle cx={rightX - 1.4} cy={eyeY - 1.8} r="1.2" fill="#ffffffc2" />

          <path
            d={`M35 ${48 + angryTilt} C40 ${44 - angryTilt} 48 ${44 - angryTilt} 53 ${49 + angryTilt}`}
            stroke={hairPalette.base}
            strokeWidth={traits.browThickness}
            fill="none"
            strokeLinecap="round"
          />
          <path
            d={`M67 ${49 + angryTilt} C72 ${44 - angryTilt} 80 ${44 - angryTilt} 85 ${48 + angryTilt}`}
            stroke={hairPalette.base}
            strokeWidth={traits.browThickness}
            fill="none"
            strokeLinecap="round"
          />

          {traits.freckles && (
            <g fill="#8f5b49" opacity="0.24">
              <circle cx="38" cy="75" r="1" />
              <circle cx="42" cy="77" r="1.1" />
              <circle cx="82" cy="75" r="1" />
              <circle cx="78" cy="77" r="1.1" />
            </g>
          )}

          {traits.mole && <circle cx="74" cy="87" r="1.25" fill="#6a3e34" opacity="0.65" />}

          {renderNose()}
          {renderMouth()}
          {renderBeard()}

          {traits.scar && (
            <path
              d="M71 52 C69 58 67 63 66 68"
              stroke="#c8c8c8b3"
              strokeWidth="1.2"
              fill="none"
              strokeLinecap="round"
            />
          )}

          {traits.glasses && (
            <g>
              <rect x="33.5" y="54" width="19" height="14" rx="4" fill="#12152220" stroke="#8aa1ba99" strokeWidth="1.4" />
              <rect x="63.5" y="54" width="19" height="14" rx="4" fill="#12152220" stroke="#8aa1ba99" strokeWidth="1.4" />
              <path d="M52.5 61 L63.5 61" stroke="#8aa1ba99" strokeWidth="1.2" />
            </g>
          )}
        </g>

        {renderHairFront()}

        <circle cx="60" cy="60" r="57" fill="none" stroke={`${accent}66`} strokeWidth="2.2" />
      </svg>
    </div>
  );
}
