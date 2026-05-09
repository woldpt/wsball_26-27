import { memo } from "react";

const POSITION_ACCENT = {
  GR: "#eab308",
  DEF: "#3b82f6",
  MED: "#10b981",
  ATA: "#f43f5e",
};

const SIZE_MAP = {
  sm: "w-10 h-10",
  md: "w-16 h-16",
  lg: "w-24 h-24",
  xl: "w-32 h-32",
};

const OUTLINE = "#23283a";
const BACKDROP = "#0f1320";
const PANEL = "#171c2e";
const EYE_WHITE = "#fbfdff";

const FACE_VARIANTS = {
  round: {
    // Anime "round" - still pointy chin but wider cheeks
    path: "M60 18 C80 18 92 35 92 60 C92 80 82 98 60 108 C38 98 28 80 28 60 C28 35 40 18 60 18 Z",
    top: 18,
    bottom: 108,
    left: 28,
    right: 92,
    eyeY: 62,
    browY: 48,
    noseY: 78,
    mouthY: 90,
    cheekY: 78,
    earY: 65,
    leftEyeX: 43,
    rightEyeX: 77,
  },
  oval: {
    // Classic anime V-shape, sharp chin
    path: "M60 16 C80 16 90 35 90 60 C90 85 75 102 60 110 C45 102 30 85 30 60 C30 35 40 16 60 16 Z",
    top: 16,
    bottom: 110,
    left: 30,
    right: 90,
    eyeY: 62,
    browY: 48,
    noseY: 79,
    mouthY: 91,
    cheekY: 78,
    earY: 65,
    leftEyeX: 44,
    rightEyeX: 76,
  },
  strong: {
    // More muscular/mature anime style, flat bottom but still angled
    path: "M60 18 C82 18 94 35 94 58 C94 80 85 95 72 105 C66 109 64 110 60 110 C56 110 54 109 48 105 C35 95 26 80 26 58 C26 35 38 18 60 18 Z",
    top: 18,
    bottom: 110,
    left: 26,
    right: 94,
    eyeY: 60,
    browY: 46,
    noseY: 77,
    mouthY: 89,
    cheekY: 76,
    earY: 63,
    leftEyeX: 42,
    rightEyeX: 78,
  },
};

const POSITION_PROFILE = {
  GR: {
    faceWeights: { round: 2.4, oval: 1.1, strong: 1.5 },
    expressionWeights: { smile: 0.8, grin: 0.35, neutral: 1.2, serious: 1.8, focused: 3.4 },
    hairWeights: { bald: 0.45, buzz: 1.9, classic: 2.0, sidepart: 1.1, spiky: 0.45, curly: 0.7, afro: 0.45, long: 0.08 },
    eyeWeights: { soft: 0.9, hero: 0.55, sharp: 2.5 },
    browWeights: { soft: 0.8, flat: 1.4, bold: 1.9 },
    headbandChance: 0.55,
    eyeScale: 1.0,
    eyeYOffset: 0,
    browYOffset: 0.9,
    mouthYOffset: 0.5,
    cheekAlpha: 0.12,
    browBias: 1.0,
    lidBoost: 1.2,
    hairShineOpacity: 0.55,
    faceShadowAlpha: 0.22,
  },
  DEF: {
    faceWeights: { round: 0.9, oval: 1.0, strong: 3.8 },
    expressionWeights: { smile: 0.55, grin: 0.2, neutral: 1.1, serious: 3.0, focused: 1.9 },
    hairWeights: { bald: 0.42, buzz: 2.2, classic: 2.0, sidepart: 1.0, spiky: 0.7, curly: 0.55, afro: 0.4, long: 0.05 },
    eyeWeights: { soft: 0.6, hero: 0.7, sharp: 2.8 },
    browWeights: { soft: 0.5, flat: 1.7, bold: 2.1 },
    headbandChance: 0,
    eyeScale: 0.95,
    eyeYOffset: 0,
    browYOffset: 0.7,
    mouthYOffset: 0.5,
    cheekAlpha: 0.1,
    browBias: 1.5,
    lidBoost: 1.5,
    hairShineOpacity: 0.5,
    faceShadowAlpha: 0.24,
  },
  MED: {
    faceWeights: { round: 1.5, oval: 2.6, strong: 1.0 },
    expressionWeights: { smile: 1.6, grin: 0.65, neutral: 2.7, serious: 0.85, focused: 0.75 },
    hairWeights: { bald: 0.2, buzz: 0.7, classic: 2.4, sidepart: 2.4, spiky: 1.9, curly: 1.2, afro: 0.8, long: 0.2 },
    eyeWeights: { soft: 2.3, hero: 1.5, sharp: 1.0 },
    browWeights: { soft: 1.9, flat: 0.9, bold: 0.9 },
    headbandChance: 0,
    eyeScale: 1.15,
    eyeYOffset: 0,
    browYOffset: -0.2,
    mouthYOffset: -0.25,
    cheekAlpha: 0.18,
    browBias: -0.2,
    lidBoost: 0,
    hairShineOpacity: 0.78,
    faceShadowAlpha: 0.16,
  },
  ATA: {
    faceWeights: { round: 1.0, oval: 3.8, strong: 1.1 },
    expressionWeights: { smile: 2.9, grin: 2.2, neutral: 1.2, serious: 0.65, focused: 0.45 },
    hairWeights: { bald: 0.12, buzz: 0.45, classic: 2.0, sidepart: 1.0, spiky: 4.7, curly: 1.1, afro: 0.8, long: 1.05 },
    eyeWeights: { soft: 0.9, hero: 3.7, sharp: 0.75 },
    browWeights: { soft: 1.0, flat: 0.55, bold: 1.7 },
    headbandChance: 0,
    eyeScale: 1.3,
    eyeYOffset: -0.5,
    browYOffset: -0.75,
    mouthYOffset: -0.8,
    cheekAlpha: 0.24,
    browBias: -0.55,
    lidBoost: -0.5,
    hairShineOpacity: 0.85,
    faceShadowAlpha: 0.15,
  },
  default: {
    faceWeights: { round: 1.4, oval: 1.5, strong: 1.3 },
    expressionWeights: { smile: 1.5, grin: 1.0, neutral: 1.6, serious: 1.2, focused: 1.0 },
    hairWeights: { bald: 0.35, buzz: 1.0, classic: 2.4, sidepart: 1.4, spiky: 1.2, curly: 1.0, afro: 0.75, long: 0.45 },
    eyeWeights: { soft: 1.2, hero: 1.2, sharp: 1.1 },
    browWeights: { soft: 1.4, flat: 1.1, bold: 1.2 },
    headbandChance: 0,
    eyeScale: 1.1,
    eyeYOffset: 0,
    browYOffset: 0,
    mouthYOffset: 0,
    cheekAlpha: 0.18,
    browBias: 0,
    lidBoost: 0,
    hairShineOpacity: 0.7,
    faceShadowAlpha: 0.18,
  },
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

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

function chance(rng, value) {
  return rng() < value;
}

function weightedPick(rng, options) {
  const total = options.reduce((sum, option) => sum + option.weight, 0);
  let target = rng() * total;

  for (let i = 0; i < options.length; i += 1) {
    target -= options[i].weight;
    if (target <= 0) return options[i].value;
  }

  return options[options.length - 1].value;
}

function normalizeHex(color, fallback = "#94a3b8") {
  if (typeof color !== "string") return fallback;

  const raw = color.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(raw)) {
    return `#${raw
      .split("")
      .map((char) => char + char)
      .join("")
      .toLowerCase()}`;
  }

  if (/^[0-9a-fA-F]{6}$/.test(raw)) {
    return `#${raw.toLowerCase()}`;
  }

  return fallback;
}

function hexToRgb(hex) {
  const value = normalizeHex(hex, "#000000").slice(1);
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

function hexToRgba(hex, alpha) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function mixHex(baseHex, targetHex, amount) {
  const base = hexToRgb(baseHex);
  const target = hexToRgb(targetHex);
  const t = Math.max(0, Math.min(1, amount));

  const r = Math.round(base.r + (target.r - base.r) * t);
  const g = Math.round(base.g + (target.g - base.g) * t);
  const b = Math.round(base.b + (target.b - base.b) * t);

  return `#${[r, g, b]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")}`;
}

/**
 * Avatar procedural estilo Hattrick com ligeiro toque anime.
 * Mantem a API atual: seed, position, teamColor, size.
 * @param {{ seed: number|string, position?: string, teamColor?: string, size?: "sm"|"md"|"lg"|"xl" }} props
 */
function PlayerAvatarInner({ seed, position, teamColor, size = "lg" }) {
  const rng = mulberry32(xmur3(`${seed ?? 0}|${position ?? "X"}`)());
  const profile = POSITION_PROFILE[position] || POSITION_PROFILE.default;

  const skin = pick(rng, [
    { base: "#f3d8c4", shadow: "#d7ad8e", blush: "#ecaa9a", lip: "#9c5f5c" },
    { base: "#e7bf9b", shadow: "#c18e68", blush: "#dc937f", lip: "#8a5546" },
    { base: "#d5a27a", shadow: "#ab744f", blush: "#c97a65", lip: "#7d4b3d" },
    { base: "#b97f56", shadow: "#885937", blush: "#a95d4f", lip: "#6b3e33" },
    { base: "#8f5c3e", shadow: "#65402b", blush: "#89493f", lip: "#553129" },
    { base: "#64412f", shadow: "#42281d", blush: "#6b372f", lip: "#342019" },
  ]);

  const hair = pick(rng, [
    { base: "#17110d", shine: "#35261d" },
    { base: "#2d180d", shine: "#5b3522" },
    { base: "#5d3517", shine: "#8c5f36" },
    { base: "#815826", shine: "#b18752" },
    { base: "#b39a63", shine: "#ddc791" },
    { base: "#c9ba9a", shine: "#ece0c5" },
    { base: "#4d5460", shine: "#7f8796" },
    { base: "#7c332a", shine: "#b06253" },
  ]);

  const eyes = pick(rng, [
    { iris: "#4473a3" },
    { iris: "#63833c" },
    { iris: "#6e5137" },
    { iris: "#66707f" },
    { iris: "#6d5393" },
  ]);

  const expression = weightedPick(rng, [
    { value: "smile", weight: profile.expressionWeights.smile },
    { value: "grin", weight: profile.expressionWeights.grin },
    { value: "neutral", weight: profile.expressionWeights.neutral },
    { value: "serious", weight: profile.expressionWeights.serious },
    { value: "focused", weight: profile.expressionWeights.focused },
  ]);

  const faceKey = weightedPick(rng, [
    { value: "round", weight: profile.faceWeights.round },
    { value: "oval", weight: profile.faceWeights.oval },
    { value: "strong", weight: profile.faceWeights.strong },
  ]);
  const face = FACE_VARIANTS[faceKey];

  const hairStyle = weightedPick(rng, [
    { value: "bald", weight: profile.hairWeights.bald },
    { value: "buzz", weight: profile.hairWeights.buzz },
    { value: "classic", weight: profile.hairWeights.classic },
    { value: "sidepart", weight: profile.hairWeights.sidepart },
    { value: "spiky", weight: profile.hairWeights.spiky },
    { value: "curly", weight: profile.hairWeights.curly },
    { value: "afro", weight: profile.hairWeights.afro },
    { value: "long", weight: profile.hairWeights.long },
  ]);

  const eyeStyle = weightedPick(rng, [
    { value: "soft", weight: profile.eyeWeights.soft },
    { value: "hero", weight: profile.eyeWeights.hero },
    { value: "sharp", weight: profile.eyeWeights.sharp },
  ]);

  const browStyle = weightedPick(rng, [
    { value: "soft", weight: profile.browWeights.soft },
    { value: "flat", weight: profile.browWeights.flat },
    { value: "bold", weight: profile.browWeights.bold },
  ]);

  const noseStyle = pick(rng, ["point", "button", "bridge"]);
  const beardStyle = weightedPick(rng, [
    { value: "none", weight: 3.2 },
    { value: "stubble", weight: 1.2 },
    { value: "mustache", weight: 0.45 },
    { value: "goatee", weight: 0.35 },
  ]);

  const glasses = chance(rng, 0.11);
  const freckles = chance(rng, 0.12);
  const mole = chance(rng, 0.07);
  const headband = chance(rng, profile.headbandChance);

  const accent = POSITION_ACCENT[position] || "#94a3b8";
  const shirt = normalizeHex(teamColor, accent);
  const shirtDark = mixHex(shirt, "#000000", 0.24);
  const shirtLight = mixHex(shirt, "#ffffff", 0.12);
  const hairStroke = mixHex(hair.base, "#000000", 0.18);
  const eyeScale = profile.eyeScale;
  const eyeYOffset = profile.eyeYOffset;
  const browYOffset = profile.browYOffset;
  const mouthYOffset = profile.mouthYOffset;
  const cheekAlpha = profile.cheekAlpha;
  const hairShineOpacity = profile.hairShineOpacity;
  const faceShadowAlpha = profile.faceShadowAlpha;
  const eyeRx = (eyeStyle === "hero" ? 9.6 : eyeStyle === "soft" ? 8.8 : 9.2) * eyeScale;
  const eyeRy = (eyeStyle === "sharp" ? 4.7 : eyeStyle === "hero" ? 6.0 : 5.4) * eyeScale;
  const irisR = (eyeStyle === "hero" ? 5.7 : 5.3) * eyeScale;
  const angryTilt = expression === "focused" || expression === "serious" ? 4.5 : 0;
  const smileLift = expression === "smile" || expression === "grin" ? -1.5 : 0;
  const shirtTop = face.bottom - 8;
  const headLeft = face.left;
  const headRight = face.right;
  const headWidth = headRight - headLeft;
  const centerX = 60;
  const earLeftX = headLeft - 2;
  const earRightX = headRight + 2;
  const browInnerShift = (expression === "focused" || expression === "serious" ? 2.5 : -0.6) + profile.browBias;
  const eyeY = face.eyeY + eyeYOffset;
  const browY = face.browY + browYOffset;
  const mouthY = face.mouthY + mouthYOffset;
  const cheekY = face.cheekY + mouthYOffset * 0.3;

  const renderBackHair = () => {
    if (hairStyle === "bald") return null;

    if (hairStyle === "buzz") {
      return (
        <ellipse
          cx={centerX}
          cy={face.top + 17}
          rx={headWidth / 2 + 2}
          ry="17"
          fill={hair.base}
          stroke={hairStroke}
          strokeWidth="1.1"
        />
      );
    }

    if (hairStyle === "classic") {
      return (
        <g>
          <ellipse
            cx={centerX}
            cy={face.top + 18}
            rx={headWidth / 2 + 4}
            ry="21"
            fill={hair.base}
            stroke={hairStroke}
            strokeWidth="1.2"
          />
          <path
            d={`M${headLeft + 18} ${face.top + 15} C${centerX - 6} ${face.top + 8} ${centerX + 6} ${face.top + 8} ${headRight - 18} ${face.top + 15}`}
            stroke={hair.shine}
            strokeWidth="2"
            fill="none"
            opacity={hairShineOpacity}
          />
        </g>
      );
    }

    if (hairStyle === "sidepart") {
      return (
        <g>
          <ellipse
            cx={centerX + 3}
            cy={face.top + 17}
            rx={headWidth / 2 + 4}
            ry="22"
            fill={hair.base}
            stroke={hairStroke}
            strokeWidth="1.2"
          />
          <path
            d={`M${centerX + 11} ${face.top + 15} C${centerX + 6} ${face.top + 27} ${centerX - 1} ${face.top + 33} ${centerX - 12} ${face.top + 36}`}
            stroke={hair.shine}
            strokeWidth="2.2"
            fill="none"
            opacity={hairShineOpacity}
          />
        </g>
      );
    }

    if (hairStyle === "spiky") {
      return (
        <g>
          <ellipse
            cx={centerX}
            cy={face.top + 18}
            rx={headWidth / 2 + 4}
            ry="19"
            fill={hair.base}
            stroke={hairStroke}
            strokeWidth="1.1"
          />
          <path d={`M${centerX - 30} ${face.top + 28} L${centerX - 20} ${face.top - 8} L${centerX - 6} ${face.top + 23} Z`} fill={hair.base} stroke={hairStroke} strokeWidth="1.2" />
          <path d={`M${centerX - 10} ${face.top + 20} L${centerX} ${face.top - 14} L${centerX + 10} ${face.top + 20} Z`} fill={hair.base} stroke={hairStroke} strokeWidth="1.2" />
          <path d={`M${centerX + 6} ${face.top + 25} L${centerX + 20} ${face.top - 8} L${centerX + 30} ${face.top + 28} Z`} fill={hair.base} stroke={hairStroke} strokeWidth="1.2" />
        </g>
      );
    }

    if (hairStyle === "curly") {
      return (
        <g fill={hair.base} stroke={hairStroke} strokeWidth="1.1">
          <circle cx={headLeft + 8} cy={face.top + 17} r="10" />
          <circle cx={headLeft + 23} cy={face.top + 8} r="11" />
          <circle cx={centerX} cy={face.top + 6} r="12" />
          <circle cx={headRight - 23} cy={face.top + 8} r="11" />
          <circle cx={headRight - 8} cy={face.top + 17} r="10" />
          <circle cx={centerX} cy={face.top + 20} r="12" />
        </g>
      );
    }

    if (hairStyle === "afro") {
      return (
        <g>
          <ellipse
            cx={centerX}
            cy={face.top + 18}
            rx={headWidth / 2 + 10}
            ry="28"
            fill={hair.base}
            stroke={hairStroke}
            strokeWidth="1.2"
          />
          <path
            d={`M${headLeft + 18} ${face.top + 14} C${centerX - 4} ${face.top + 5} ${centerX + 8} ${face.top + 5} ${headRight - 18} ${face.top + 14}`}
            stroke={hair.shine}
            strokeWidth="2"
            fill="none"
            opacity={Math.max(0.32, hairShineOpacity - 0.25)}
          />
        </g>
      );
    }

    return (
      <g>
        <ellipse
          cx={centerX}
          cy={face.top + 18}
          rx={headWidth / 2 + 4}
          ry="22"
          fill={hair.base}
          stroke={hairStroke}
          strokeWidth="1.2"
        />
        <rect x={headLeft - 4} y={face.top + 20} width="13" height="58" rx="6.5" fill={hair.base} stroke={hairStroke} strokeWidth="1" />
        <rect x={headRight - 9} y={face.top + 20} width="13" height="58" rx="6.5" fill={hair.base} stroke={hairStroke} strokeWidth="1" />
      </g>
    );
  };

  const renderFrontHair = () => {
    if (hairStyle === "bald") return null;

    if (hairStyle === "buzz") {
      return (
        <path
          d={`M${headLeft + 12} ${face.top + 24} C${headLeft + 22} ${face.top + 17} ${headRight - 22} ${face.top + 17} ${headRight - 12} ${face.top + 24}`}
          stroke={hexToRgba(hair.base, 0.45)}
          strokeWidth="2"
          fill="none"
        />
      );
    }

    if (hairStyle === "classic") {
      return (
        <g>
          <path
            d={`M${headLeft + 8} ${face.top + 29} C${headLeft + 18} ${face.top + 18} ${headRight - 18} ${face.top + 18} ${headRight - 8} ${face.top + 29} C${headRight - 18} ${face.top + 25} ${headLeft + 18} ${face.top + 25} ${headLeft + 8} ${face.top + 29} Z`}
            fill={hair.base}
            stroke={hairStroke}
            strokeWidth="1"
          />
          <path
            d={`M${headLeft + 20} ${face.top + 18} C${centerX - 4} ${face.top + 12} ${centerX + 8} ${face.top + 12} ${headRight - 18} ${face.top + 18}`}
            stroke={hair.shine}
            strokeWidth="2"
            fill="none"
            opacity={hairShineOpacity}
          />
        </g>
      );
    }

    if (hairStyle === "sidepart") {
      return (
        <g>
          <path
            d={`M${headLeft + 7} ${face.top + 30} C${headLeft + 25} ${face.top + 13} ${headRight - 4} ${face.top + 15} ${headRight - 10} ${face.top + 29} C${headRight - 19} ${face.top + 23} ${headLeft + 28} ${face.top + 24} ${headLeft + 7} ${face.top + 30} Z`}
            fill={hair.base}
            stroke={hairStroke}
            strokeWidth="1"
          />
          <path
            d={`M${centerX + 12} ${face.top + 17} C${centerX + 6} ${face.top + 30} ${centerX - 2} ${face.top + 35} ${centerX - 14} ${face.top + 38}`}
            stroke={hair.shine}
            strokeWidth="2.2"
            fill="none"
            opacity={hairShineOpacity}
          />
        </g>
      );
    }

    if (hairStyle === "spiky") {
      return (
        <g fill={hair.base} stroke={hairStroke} strokeWidth="1.2">
          <path d={`M${centerX - 28} ${face.top + 34} L${centerX - 18} ${face.top + 8} L${centerX - 4} ${face.top + 30} Z`} />
          <path d={`M${centerX - 8} ${face.top + 28} L${centerX + 2} ${face.top + 2} L${centerX + 12} ${face.top + 28} Z`} />
          <path d={`M${centerX + 4} ${face.top + 30} L${centerX + 18} ${face.top + 8} L${centerX + 28} ${face.top + 34} Z`} />
        </g>
      );
    }

    if (hairStyle === "curly") {
      return (
        <g fill={hair.base} stroke={hairStroke} strokeWidth="1">
          <circle cx={centerX - 16} cy={face.top + 26} r="6" />
          <circle cx={centerX - 5} cy={face.top + 20} r="7" />
          <circle cx={centerX + 6} cy={face.top + 20} r="7" />
          <circle cx={centerX + 17} cy={face.top + 26} r="6" />
        </g>
      );
    }

    if (hairStyle === "afro") {
      return (
        <path
          d={`M${headLeft + 12} ${face.top + 26} C${headLeft + 22} ${face.top + 18} ${headRight - 22} ${face.top + 18} ${headRight - 12} ${face.top + 26}`}
          stroke={hexToRgba(hair.shine, 0.5)}
          strokeWidth="2.2"
          fill="none"
          opacity={hairShineOpacity}
        />
      );
    }

    return (
      <g>
        <path
          d={`M${centerX - 20} ${face.top + 31} C${centerX - 14} ${face.top + 17} ${centerX - 6} ${face.top + 17} ${centerX - 2} ${face.top + 31} C${centerX - 9} ${face.top + 26} ${centerX - 14} ${face.top + 26} ${centerX - 20} ${face.top + 31} Z`}
          fill={hair.base}
          stroke={hairStroke}
          strokeWidth="1"
        />
        <path
          d={`M${centerX + 20} ${face.top + 31} C${centerX + 14} ${face.top + 17} ${centerX + 6} ${face.top + 17} ${centerX + 2} ${face.top + 31} C${centerX + 9} ${face.top + 26} ${centerX + 14} ${face.top + 26} ${centerX + 20} ${face.top + 31} Z`}
          fill={hair.base}
          stroke={hairStroke}
          strokeWidth="1"
        />
        <path
          d={`M${centerX} ${face.top + 16} C${centerX} ${face.top + 21} ${centerX - 1} ${face.top + 27} ${centerX - 2} ${face.top + 31}`}
          stroke={hair.shine}
          strokeWidth="2"
          fill="none"
          opacity={hairShineOpacity}
        />
      </g>
    );
  };

  const renderBrows = () => {
    const leftOuterY = browY - angryTilt + smileLift;
    const leftInnerY = browY + browInnerShift + smileLift;
    const rightInnerY = browY + browInnerShift + smileLift;
    const rightOuterY = browY - angryTilt + smileLift;
    // Sobrancelhas mais angulares e afiadas
    const strokeWidth = browStyle === "bold" ? 4.5 : browStyle === "flat" ? 2.5 : 3.0;

    if (browStyle === "flat") {
      return (
        <g stroke={hair.base} strokeWidth={strokeWidth} fill="none" strokeLinecap="round">
          <path d={`M${face.leftEyeX - 12} ${leftOuterY} L${face.leftEyeX + 12} ${leftOuterY}`} />
          <path d={`M${face.rightEyeX - 12} ${rightOuterY} L${face.rightEyeX + 12} ${rightOuterY}`} />
        </g>
      );
    }

    if (browStyle === "bold") {
      return (
        <g fill={hair.base} stroke="none">
          {/* Sobrancelhas grossas como no Rock Lee/Tsubasa */}
          <path d={`M${face.leftEyeX - 14} ${leftOuterY + 2} L${face.leftEyeX + 10} ${leftInnerY + 2} L${face.leftEyeX + 10} ${leftInnerY - 2} L${face.leftEyeX - 14} ${leftOuterY - 2} Z`} />
          <path d={`M${face.rightEyeX - 10} ${rightInnerY + 2} L${face.rightEyeX + 14} ${rightOuterY + 2} L${face.rightEyeX + 14} ${rightOuterY - 2} L${face.rightEyeX - 10} ${rightInnerY - 2} Z`} />
        </g>
      );
    }

    return (
      <g stroke={hair.base} strokeWidth={strokeWidth} fill="none" strokeLinecap="round">
        <path d={`M${face.leftEyeX - 12} ${leftOuterY} L${face.leftEyeX + 10} ${leftInnerY}`} />
        <path d={`M${face.rightEyeX - 10} ${rightInnerY} L${face.rightEyeX + 12} ${rightOuterY}`} />
      </g>
    );
  };

  const renderEye = (x, direction) => {
    const lidLift = (eyeStyle === "sharp" ? 6 + angryTilt * 0.5 : eyeStyle === "hero" ? 5.5 : 4.8) + profile.lidBoost;
    const irisShift = direction === "left" ? 1.5 : 1.5; // cross-eyed fix for anime style
    const shiftDir = direction === "left" ? 1 : -1;

    return (
      <g>
        {/* Eye White */}
        <ellipse cx={x} cy={eyeY} rx={eyeRx} ry={eyeRy} fill={EYE_WHITE} />
        {/* Iris */}
        <circle cx={x + irisShift * shiftDir} cy={eyeY + 1} r={irisR} fill={eyes.iris} stroke={OUTLINE} strokeWidth="1" />
        {/* Pupil */}
        <circle cx={x + irisShift * shiftDir} cy={eyeY + 1.5} r={irisR * 0.45} fill="#111420" />
        {/* Main Catchlight (Anime large reflection) */}
        <circle cx={x + irisShift * shiftDir - irisR * 0.35} cy={eyeY - irisR * 0.25} r={irisR * 0.35} fill="#ffffff" opacity="0.9" />
        {/* Secondary Catchlight (Anime small reflection) */}
        <circle cx={x + irisShift * shiftDir + irisR * 0.4} cy={eyeY + irisR * 0.35} r={irisR * 0.15} fill="#ffffff" opacity="0.7" />
        
        {/* Upper Eyelid (Thick, Anime style) */}
        <path d={`M${x - eyeRx - 1} ${eyeY + 1} C${x - 4} ${eyeY - lidLift} ${x + 4} ${eyeY - lidLift} ${x + eyeRx + 1} ${eyeY + 1}`} stroke={OUTLINE} strokeWidth="3" strokeLinecap="round" fill="none" />
        {/* Eyelid crease (Optional detail) */}
        <path d={`M${x - eyeRx + 2} ${eyeY - lidLift - 2} C${x} ${eyeY - lidLift - 3} ${x + eyeRx - 2} ${eyeY - lidLift - 2}`} stroke={hexToRgba(OUTLINE, 0.4)} strokeWidth="1" fill="none" />
        {/* Lower Eyelid (Disconnected, thin) */}
        <path d={`M${x - eyeRx + 2} ${eyeY + eyeRy} L${x + eyeRx - 2} ${eyeY + eyeRy}`} stroke={hexToRgba(OUTLINE, 0.5)} strokeWidth="1.2" strokeLinecap="round" fill="none" />
      </g>
    );
  };

  const renderNose = () => {
    // Simplificar bastante o nariz para o estilo anime: sombra em V ou linha angular.
    if (noseStyle === "button") {
      return (
        <path d={`M${centerX} ${face.noseY - 4} L${centerX - 2} ${face.noseY + 4} L${centerX + 1} ${face.noseY + 4}`} stroke={hexToRgba(OUTLINE, 0.4)} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      );
    }

    if (noseStyle === "bridge") {
      return (
        <g stroke={hexToRgba(OUTLINE, 0.5)} fill="none" strokeLinecap="round">
          <path d={`M${centerX} ${face.noseY - 8} L${centerX - 3} ${face.noseY + 5}`} strokeWidth="1.5" />
          <path d={`M${centerX - 3} ${face.noseY + 5} L${centerX + 2} ${face.noseY + 6}`} strokeWidth="1.5" />
        </g>
      );
    }

    // Default (sombra em V característica)
    return (
      <path d={`M${centerX} ${face.noseY - 5} L${centerX - 4} ${face.noseY + 5} L${centerX} ${face.noseY + 6}`} fill={hexToRgba(skin.shadow, 0.6)} stroke="none" />
    );
  };

  const renderMouth = () => {
    // Bocas mais vincadas e extremas
    if (expression === "smile") {
      return <path d={`M${centerX - 16} ${mouthY - 2} C${centerX - 8} ${mouthY + 12} ${centerX + 8} ${mouthY + 12} ${centerX + 16} ${mouthY - 2}`} stroke={skin.lip} strokeWidth="3" fill="none" strokeLinecap="round" />;
    }

    if (expression === "grin") {
      return (
        <path
          d={`M${centerX - 18} ${mouthY - 2} C${centerX - 8} ${mouthY + 10} ${centerX + 8} ${mouthY + 10} ${centerX + 18} ${mouthY - 2} L${centerX} ${mouthY + 4} Z`}
          fill="#f6f7fa"
          stroke={skin.lip}
          strokeWidth="2"
          strokeLinejoin="round"
        />
      );
    }

    if (expression === "serious") {
      return <path d={`M${centerX - 12} ${mouthY + 3} L${centerX} ${mouthY} L${centerX + 12} ${mouthY + 3}`} stroke={skin.lip} strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />;
    }

    if (expression === "focused") {
      return <path d={`M${centerX - 10} ${mouthY} L${centerX + 10} ${mouthY}`} stroke={skin.lip} strokeWidth="2.5" fill="none" strokeLinecap="round" />;
    }

    return <path d={`M${centerX - 12} ${mouthY} C${centerX - 4} ${mouthY + 3} ${centerX + 4} ${mouthY + 3} ${centerX + 12} ${mouthY}`} stroke={skin.lip} strokeWidth="2.5" fill="none" strokeLinecap="round" />;
  };

  const renderBeard = () => {
    if (beardStyle === "none") return null;

    if (beardStyle === "stubble") {
      return (
        <path
          d={`M${headLeft + 14} ${mouthY - 2} C${centerX - 12} ${face.bottom - 4} ${centerX + 12} ${face.bottom - 4} ${headRight - 14} ${mouthY - 2}`}
          stroke={hexToRgba(hair.base, 0.45)}
          strokeWidth="2.8"
          fill="none"
          strokeDasharray="1.4 2.2"
        />
      );
    }

    if (beardStyle === "mustache") {
      return (
        <path
          d={`M${centerX - 13} ${mouthY - 9} C${centerX - 8} ${mouthY - 12} ${centerX - 2} ${mouthY - 11} ${centerX} ${mouthY - 9} C${centerX + 2} ${mouthY - 11} ${centerX + 8} ${mouthY - 12} ${centerX + 13} ${mouthY - 9}`}
          stroke={hair.base}
          strokeWidth="2.6"
          fill="none"
        />
      );
    }

    return (
      <g>
        <path
          d={`M${centerX - 12} ${mouthY - 9} C${centerX - 8} ${mouthY - 12} ${centerX - 2} ${mouthY - 11} ${centerX} ${mouthY - 9} C${centerX + 2} ${mouthY - 11} ${centerX + 8} ${mouthY - 12} ${centerX + 12} ${mouthY - 9}`}
          stroke={hair.base}
          strokeWidth="2.3"
          fill="none"
        />
        <path
          d={`M${centerX - 8} ${mouthY + 4} C${centerX - 5} ${mouthY + 13} ${centerX + 5} ${mouthY + 13} ${centerX + 8} ${mouthY + 4}`}
          stroke={hair.base}
          strokeWidth="3"
          fill="none"
        />
      </g>
    );
  };

  const renderGlasses = () => {
    if (!glasses) return null;

    return (
      <g stroke={hexToRgba(OUTLINE, 0.65)} fill="none">
        <rect x={face.leftEyeX - 10} y={eyeY - 7} width="20" height="13" rx="4" strokeWidth="1.5" />
        <rect x={face.rightEyeX - 10} y={eyeY - 7} width="20" height="13" rx="4" strokeWidth="1.5" />
        <path d={`M${face.leftEyeX + 10} ${eyeY - 1} L${face.rightEyeX - 10} ${eyeY - 1}`} strokeWidth="1.2" />
        <path d={`M${face.leftEyeX - 10} ${eyeY - 4} L${face.leftEyeX - 15} ${eyeY - 6}`} strokeWidth="1.1" />
        <path d={`M${face.rightEyeX + 10} ${eyeY - 4} L${face.rightEyeX + 15} ${eyeY - 6}`} strokeWidth="1.1" />
      </g>
    );
  };

  return (
    <div className="relative shrink-0">
      <svg
        viewBox="0 0 120 120"
        className={`${SIZE_MAP[size] ?? SIZE_MAP.lg} rounded-full shadow-lg`}
        style={{ backgroundColor: BACKDROP }}
        shapeRendering="geometricPrecision"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="60" cy="60" r="58" fill={BACKDROP} />
        <circle cx="60" cy="60" r="56" fill={PANEL} />

        <path
          d={`M28 120 C32 ${shirtTop + 2} 45 ${shirtTop - 7} 60 ${shirtTop - 7} C75 ${shirtTop - 7} 88 ${shirtTop + 2} 92 120 Z`}
          fill={shirt}
          stroke={OUTLINE}
          strokeWidth="1.2"
        />
        <ellipse cx={centerX} cy={face.bottom - 1} rx="22" ry="6.5" fill="#0000001e" />
        <path
          d={`M48 ${shirtTop - 3} L48 ${shirtTop + 11} C52 ${shirtTop + 15} 68 ${shirtTop + 15} 72 ${shirtTop + 11} L72 ${shirtTop - 3} Z`}
          fill={skin.shadow}
          stroke={OUTLINE}
          strokeWidth="1.1"
        />
        <path
          d={`M48 ${shirtTop - 3} L60 ${shirtTop + 9} L72 ${shirtTop - 3}`}
          fill={shirtDark}
          stroke={OUTLINE}
          strokeWidth="1.1"
        />
        <path d={`M52 ${shirtTop - 1} L60 ${shirtTop + 7} L68 ${shirtTop - 1}`} fill={shirtLight} opacity="0.35" />

        {renderBackHair()}

        <g>
          <ellipse cx={earLeftX} cy={face.earY} rx="6.3" ry="8.4" fill={skin.base} stroke={OUTLINE} strokeWidth="1.1" />
          <ellipse cx={earRightX} cy={face.earY} rx="6.3" ry="8.4" fill={skin.base} stroke={OUTLINE} strokeWidth="1.1" />
          <path d={`M${earLeftX + 1} ${face.earY - 3} C${earLeftX - 1} ${face.earY} ${earLeftX - 1} ${face.earY + 2} ${earLeftX + 1} ${face.earY + 4}`} stroke={hexToRgba(skin.shadow, 0.9)} strokeWidth="1" fill="none" />
          <path d={`M${earRightX - 1} ${face.earY - 3} C${earRightX + 1} ${face.earY} ${earRightX + 1} ${face.earY + 2} ${earRightX - 1} ${face.earY + 4}`} stroke={hexToRgba(skin.shadow, 0.9)} strokeWidth="1" fill="none" />
        </g>

        <path d={face.path} fill={skin.base} stroke={OUTLINE} strokeWidth="1.3" />
        <ellipse cx={centerX + 11} cy={face.noseY + 2} rx="14" ry="23" fill={hexToRgba(skin.shadow, faceShadowAlpha)} />
        <ellipse cx={centerX - 8} cy={face.top + 19} rx="12" ry="6" fill="#ffffff14" />

        <ellipse cx={face.leftEyeX - 5} cy={cheekY} rx="8.5" ry="5.5" fill={hexToRgba(skin.blush, expression === "smile" || expression === "grin" ? cheekAlpha + 0.08 : cheekAlpha)} />
        <ellipse cx={face.rightEyeX + 5} cy={cheekY} rx="8.5" ry="5.5" fill={hexToRgba(skin.blush, expression === "smile" || expression === "grin" ? cheekAlpha + 0.08 : cheekAlpha)} />

        {renderFrontHair()}

        {headband && (
          <rect
            x={headLeft + 9}
            y={browY - 8}
            width={headWidth - 18}
            height="8"
            rx="4"
            fill={shirtLight}
            stroke={OUTLINE}
            strokeWidth="1.1"
          />
        )}

        {renderEye(face.leftEyeX, "left")}
        {renderEye(face.rightEyeX, "right")}
        {renderBrows()}

        {freckles && (
          <g fill={hexToRgba(skin.shadow, 0.65)}>
            <circle cx={face.leftEyeX - 6} cy={cheekY - 3} r="1" />
            <circle cx={face.leftEyeX - 2} cy={cheekY} r="0.9" />
            <circle cx={face.leftEyeX + 2} cy={cheekY - 4} r="0.8" />
            <circle cx={face.rightEyeX - 2} cy={cheekY - 4} r="0.8" />
            <circle cx={face.rightEyeX + 2} cy={cheekY} r="0.9" />
            <circle cx={face.rightEyeX + 6} cy={cheekY - 3} r="1" />
          </g>
        )}

        {mole && <circle cx={face.rightEyeX + 7} cy={mouthY - 4} r="1.3" fill={hexToRgba(skin.lip, 0.85)} />}

        {renderNose()}
        {renderMouth()}
        {renderBeard()}
        {renderGlasses()}

        <circle cx="60" cy="60" r="56" fill="none" stroke={hexToRgba(accent, 0.55)} strokeWidth="2.1" />
      </svg>
    </div>
  );
}

export const PlayerAvatar = memo(PlayerAvatarInner, (prev, next) =>
  prev.seed === next.seed &&
  prev.position === next.position &&
  prev.teamColor === next.teamColor &&
  prev.size === next.size,
);
