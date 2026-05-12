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

// Tsubasa = traço a tinta-da-china preta, bem encorpado
const OUTLINE = "#0a0d16";
const OUTLINE_SOFT = "rgba(10, 13, 22, 0.55)";
const BACKDROP = "#0f1320";
const PANEL = "#171c2e";
const EYE_WHITE = "#fbfdff";

// Variantes de rosto em V agressivo (Tsubasa, Hyuga, Misaki...)
const FACE_VARIANTS = {
  round: {
    // Misaki/Tsubasa jovem - rosto redondo mas com queixo em V
    path: "M60 18 C82 18 94 36 94 60 C94 78 86 95 70 106 C66 110 64 112 60 112 C56 112 54 110 50 106 C34 95 26 78 26 60 C26 36 38 18 60 18 Z",
    top: 18,
    bottom: 112,
    left: 26,
    right: 94,
    eyeY: 64,
    browY: 50,
    noseY: 80,
    mouthY: 94,
    cheekY: 80,
    earY: 66,
    leftEyeX: 42,
    rightEyeX: 78,
    jawY: 100,
  },
  oval: {
    // Tsubasa adulto / Misaki - V puro e afilado
    path: "M60 16 C82 16 92 36 92 58 C92 82 76 100 64 110 C62 112 60 114 60 114 C60 114 58 112 56 110 C44 100 28 82 28 58 C28 36 38 16 60 16 Z",
    top: 16,
    bottom: 114,
    left: 28,
    right: 92,
    eyeY: 64,
    browY: 50,
    noseY: 81,
    mouthY: 95,
    cheekY: 80,
    earY: 66,
    leftEyeX: 43,
    rightEyeX: 77,
    jawY: 102,
  },
  strong: {
    // Hyuga / Wakabayashi - mandíbula angular, queixo cortado
    path: "M60 18 C84 18 96 36 96 56 C96 76 88 90 76 102 C70 108 66 110 60 110 C54 110 50 108 44 102 C32 90 24 76 24 56 C24 36 36 18 60 18 Z",
    top: 18,
    bottom: 110,
    left: 24,
    right: 96,
    eyeY: 62,
    browY: 48,
    noseY: 78,
    mouthY: 91,
    cheekY: 78,
    earY: 64,
    leftEyeX: 41,
    rightEyeX: 79,
    jawY: 99,
  },
};

const POSITION_PROFILE = {
  GR: {
    faceWeights: { round: 1.6, oval: 1.0, strong: 2.4 },
    expressionWeights: { smile: 0.7, grin: 0.3, neutral: 1.0, serious: 2.0, focused: 3.6 },
    hairWeights: { bald: 0.18, buzz: 1.4, classic: 2.4, sidepart: 1.6, spiky: 0.9, curly: 0.7, afro: 0.5, long: 0.5 },
    eyeWeights: { soft: 0.6, hero: 0.7, sharp: 3.0 },
    browWeights: { soft: 0.5, flat: 1.4, bold: 2.4 },
    headbandChance: 0.4,
    eyeScale: 1.0,
    eyeYOffset: 0,
    browYOffset: 0.5,
    mouthYOffset: 0.5,
    cheekAlpha: 0.1,
    browBias: 1.2,
    lidBoost: 1.5,
    hairShineOpacity: 0.55,
    faceShadowAlpha: 0.28,
  },
  DEF: {
    faceWeights: { round: 0.7, oval: 0.9, strong: 4.2 },
    expressionWeights: { smile: 0.45, grin: 0.2, neutral: 1.0, serious: 3.4, focused: 2.0 },
    hairWeights: { bald: 0.12, buzz: 1.6, classic: 2.0, sidepart: 1.4, spiky: 1.6, curly: 0.6, afro: 0.5, long: 0.5 },
    eyeWeights: { soft: 0.4, hero: 0.6, sharp: 3.4 },
    browWeights: { soft: 0.3, flat: 1.7, bold: 2.6 },
    headbandChance: 0,
    eyeScale: 0.95,
    eyeYOffset: 0,
    browYOffset: 0.4,
    mouthYOffset: 0.5,
    cheekAlpha: 0.08,
    browBias: 1.7,
    lidBoost: 1.8,
    hairShineOpacity: 0.5,
    faceShadowAlpha: 0.3,
  },
  MED: {
    faceWeights: { round: 1.5, oval: 3.0, strong: 0.8 },
    expressionWeights: { smile: 1.7, grin: 0.7, neutral: 2.6, serious: 0.9, focused: 0.85 },
    hairWeights: { bald: 0.04, buzz: 0.5, classic: 2.6, sidepart: 2.8, spiky: 2.0, curly: 1.2, afro: 0.8, long: 0.9 },
    eyeWeights: { soft: 2.4, hero: 1.7, sharp: 1.0 },
    browWeights: { soft: 1.9, flat: 0.9, bold: 0.9 },
    headbandChance: 0,
    eyeScale: 1.18,
    eyeYOffset: 0,
    browYOffset: -0.2,
    mouthYOffset: -0.25,
    cheekAlpha: 0.18,
    browBias: -0.2,
    lidBoost: 0.2,
    hairShineOpacity: 0.82,
    faceShadowAlpha: 0.2,
  },
  ATA: {
    faceWeights: { round: 0.9, oval: 4.0, strong: 1.0 },
    expressionWeights: { smile: 3.0, grin: 2.4, neutral: 1.1, serious: 0.6, focused: 0.45 },
    hairWeights: { bald: 0.02, buzz: 0.3, classic: 2.0, sidepart: 1.2, spiky: 5.5, curly: 1.0, afro: 0.7, long: 1.6 },
    eyeWeights: { soft: 0.8, hero: 4.0, sharp: 0.7 },
    browWeights: { soft: 1.0, flat: 0.5, bold: 1.9 },
    headbandChance: 0,
    eyeScale: 1.32,
    eyeYOffset: -0.5,
    browYOffset: -0.8,
    mouthYOffset: -0.8,
    cheekAlpha: 0.24,
    browBias: -0.5,
    lidBoost: -0.3,
    hairShineOpacity: 0.9,
    faceShadowAlpha: 0.18,
  },
  default: {
    faceWeights: { round: 1.4, oval: 1.6, strong: 1.3 },
    expressionWeights: { smile: 1.5, grin: 1.0, neutral: 1.5, serious: 1.2, focused: 1.0 },
    hairWeights: { bald: 0.08, buzz: 0.9, classic: 2.4, sidepart: 1.6, spiky: 1.6, curly: 1.0, afro: 0.7, long: 0.8 },
    eyeWeights: { soft: 1.2, hero: 1.4, sharp: 1.2 },
    browWeights: { soft: 1.3, flat: 1.1, bold: 1.4 },
    headbandChance: 0,
    eyeScale: 1.12,
    eyeYOffset: 0,
    browYOffset: 0,
    mouthYOffset: 0,
    cheekAlpha: 0.16,
    browBias: 0,
    lidBoost: 0.3,
    hairShineOpacity: 0.75,
    faceShadowAlpha: 0.22,
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
 * Avatar procedural com estética Captain Tsubasa:
 * traço a tinta preto, queixo em V, cabelos pontiagudos esvoaçantes,
 * olhos verticais com pálpebras carregadas e sombreamento cell-shading.
 * @param {{ seed: number|string, position?: string, teamColor?: string, size?: "sm"|"md"|"lg"|"xl" }} props
 */
function PlayerAvatarInner({ seed, position, teamColor, size = "lg" }) {
  const rng = mulberry32(xmur3(`${seed ?? 0}|${position ?? "X"}`)());
  const profile = POSITION_PROFILE[position] || POSITION_PROFILE.default;

  const skin = pick(rng, [
    { base: "#f5dcc6", shadow: "#cf9d7c", blush: "#ec9b8c", lip: "#9c5044" },
    { base: "#e8c09c", shadow: "#b67a52", blush: "#d57c66", lip: "#7e3f30" },
    { base: "#d29c70", shadow: "#9c6541", blush: "#bb6852", lip: "#6c3a2d" },
    { base: "#b27a4f", shadow: "#7a4a2c", blush: "#9c4f40", lip: "#5a2f24" },
    { base: "#8a5638", shadow: "#54331e", blush: "#7a3d33", lip: "#3f221b" },
    { base: "#5e3a26", shadow: "#321d12", blush: "#5a2c25", lip: "#2a1612" },
  ]);

  // Paleta de cabelos shounen 80s: muitos pretos azulados, chocolates, alguns destaques
  const hair = pick(rng, [
    { base: "#0e0a08", shine: "#3a2c25" }, // preto Tsubasa
    { base: "#1a0f0a", shine: "#4a3024" }, // preto Hyuga
    { base: "#2a160c", shine: "#643a20" }, // castanho escuro
    { base: "#5a2e15", shine: "#9a5a30" }, // chocolate
    { base: "#7d4a1c", shine: "#c08544" }, // castanho avermelhado
    { base: "#a87c34", shine: "#e0b96a" }, // loiro escuro
    { base: "#c9a85a", shine: "#f0d894" }, // loiro Wakabayashi
    { base: "#46505e", shine: "#7e8895" }, // grisalho
    { base: "#7a2e22", shine: "#b25a48" }, // ruivo escuro
  ]);

  const eyes = pick(rng, [
    { iris: "#3d6ea8" }, // azul Tsubasa
    { iris: "#4a8a3a" }, // verde
    { iris: "#5a3a22" }, // castanho
    { iris: "#62707f" }, // cinza
    { iris: "#7a4a2c" }, // âmbar
    { iris: "#5a3a8a" }, // violeta (raro)
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
    { value: "none", weight: 3.4 },
    { value: "stubble", weight: 1.0 },
    { value: "mustache", weight: 0.4 },
    { value: "goatee", weight: 0.3 },
  ]);

  const glasses = chance(rng, 0.08);
  const freckles = chance(rng, 0.1);
  const mole = chance(rng, 0.06);
  const headband = chance(rng, profile.headbandChance);
  const sweatDrop = chance(rng, 0.05); // gota anime ocasional

  const accent = POSITION_ACCENT[position] || "#94a3b8";
  const shirt = normalizeHex(teamColor, accent);
  const shirtDark = mixHex(shirt, "#000000", 0.28);
  const shirtLight = mixHex(shirt, "#ffffff", 0.14);
  const hairStroke = OUTLINE; // Tsubasa: tudo a tinta preta dura
  const eyeScale = profile.eyeScale;
  const eyeYOffset = profile.eyeYOffset;
  const browYOffset = profile.browYOffset;
  const mouthYOffset = profile.mouthYOffset;
  const cheekAlpha = profile.cheekAlpha;
  const hairShineOpacity = profile.hairShineOpacity;
  const faceShadowAlpha = profile.faceShadowAlpha;

  // Olhos verticalmente alongados (assinatura Tsubasa)
  const eyeRx = (eyeStyle === "hero" ? 8.8 : eyeStyle === "soft" ? 8.4 : 8.6) * eyeScale;
  const eyeRy = (eyeStyle === "sharp" ? 5.2 : eyeStyle === "hero" ? 8.5 : 7.4) * eyeScale;
  const irisR = (eyeStyle === "hero" ? 5.8 : 5.2) * eyeScale;

  const angryTilt = expression === "focused" || expression === "serious" ? 5 : 0;
  const smileLift = expression === "smile" || expression === "grin" ? -1.5 : 0;
  const shirtTop = face.bottom - 8;
  const headLeft = face.left;
  const headRight = face.right;
  const headWidth = headRight - headLeft;
  const centerX = 60;
  const earLeftX = headLeft - 1;
  const earRightX = headRight + 1;
  const browInnerShift = (expression === "focused" || expression === "serious" ? 3.2 : -0.5) + profile.browBias;
  const eyeY = face.eyeY + eyeYOffset;
  const browY = face.browY + browYOffset;
  const mouthY = face.mouthY + mouthYOffset;
  const cheekY = face.cheekY + mouthYOffset * 0.3;

  // ---------- CABELOS estilo Tsubasa ----------
  const renderBackHair = () => {
    if (hairStyle === "bald") return null;

    if (hairStyle === "buzz") {
      // Tampa justa sobre o crânio com hairline visível
      return (
        <path
          d={`M${headLeft - 1} ${face.top + 30}
              C${headLeft - 2} ${face.top + 8} ${headLeft + 12} ${face.top + 2} ${centerX} ${face.top + 2}
              C${headRight - 12} ${face.top + 2} ${headRight + 2} ${face.top + 8} ${headRight + 1} ${face.top + 30}
              L${headRight - 6} ${face.top + 28}
              Q${centerX} ${face.top + 20} ${headLeft + 6} ${face.top + 28} Z`}
          fill={hair.base}
          stroke={hairStroke}
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      );
    }

    if (hairStyle === "classic") {
      // Cobre o crânio e termina na linha da hairline lateral — não desce abaixo de face.top+18
      return (
        <g fill={hair.base} stroke={hairStroke} strokeWidth="1.8" strokeLinejoin="round">
          <path
            d={`M${headLeft - 2} ${face.top + 18}
                C${headLeft - 5} ${face.top + 8} ${headLeft + 8} ${face.top - 1} ${centerX} ${face.top - 1}
                C${headRight - 8} ${face.top - 1} ${headRight + 5} ${face.top + 8} ${headRight + 2} ${face.top + 18}
                Q${centerX} ${face.top + 14} ${headLeft - 2} ${face.top + 18} Z`}
          />
          {/* Mechas laterais curtas atrás das orelhas */}
          <path d={`M${headLeft - 3} ${face.top + 16} Q${headLeft - 7} ${face.earY} ${headLeft - 4} ${face.earY + 14} Q${headLeft + 2} ${face.earY + 10} ${headLeft + 2} ${face.top + 20} Z`} />
          <path d={`M${headRight + 3} ${face.top + 16} Q${headRight + 7} ${face.earY} ${headRight + 4} ${face.earY + 14} Q${headRight - 2} ${face.earY + 10} ${headRight - 2} ${face.top + 20} Z`} />
        </g>
      );
    }

    if (hairStyle === "sidepart") {
      return (
        <g fill={hair.base} stroke={hairStroke} strokeWidth="1.8" strokeLinejoin="round">
          <path
            d={`M${headLeft - 2} ${face.top + 18}
                C${headLeft - 5} ${face.top + 8} ${headLeft + 10} ${face.top - 1} ${centerX + 4} ${face.top - 1}
                C${headRight - 6} ${face.top - 1} ${headRight + 5} ${face.top + 8} ${headRight + 2} ${face.top + 18}
                Q${centerX} ${face.top + 14} ${headLeft - 2} ${face.top + 18} Z`}
          />
          {/* Mecha lateral direita (lado onde o cabelo está varrido) */}
          <path d={`M${headRight + 3} ${face.top + 16} Q${headRight + 8} ${face.earY} ${headRight + 5} ${face.earY + 14} Q${headRight - 1} ${face.earY + 10} ${headRight - 1} ${face.top + 20} Z`} />
        </g>
      );
    }

    if (hairStyle === "spiky") {
      // Silhueta contínua com 3 picos integrados — sem formas soltas
      return (
        <path
          d={`M${headLeft - 2} ${face.top + 32}
              L${headLeft + 4} ${face.top + 18}
              L${headLeft + 12} ${face.top + 2}
              L${headLeft + 24} ${face.top + 16}
              L${centerX - 2} ${face.top - 8}
              L${centerX + 14} ${face.top + 14}
              L${headRight - 14} ${face.top + 4}
              L${headRight - 4} ${face.top + 18}
              L${headRight + 2} ${face.top + 32}
              Q${centerX} ${face.top + 22} ${headLeft - 2} ${face.top + 32} Z`}
          fill={hair.base}
          stroke={hairStroke}
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      );
    }

    if (hairStyle === "curly") {
      // Cúpula festonada — termina na hairline lateral, não desce pela face
      return (
        <path
          d={`M${headLeft - 2} ${face.top + 18}
              Q${headLeft - 6} ${face.top + 6} ${headLeft - 2} ${face.top + 4}
              Q${headLeft - 8} ${face.top - 4} ${headLeft + 8} ${face.top - 6}
              Q${headLeft + 6} ${face.top - 14} ${centerX - 10} ${face.top - 14}
              Q${centerX - 6} ${face.top - 20} ${centerX + 8} ${face.top - 18}
              Q${headRight - 6} ${face.top - 16} ${headRight - 6} ${face.top - 8}
              Q${headRight + 6} ${face.top - 4} ${headRight + 2} ${face.top + 4}
              Q${headRight + 6} ${face.top + 6} ${headRight + 2} ${face.top + 18}
              Q${centerX} ${face.top + 14} ${headLeft - 2} ${face.top + 18} Z`}
          fill={hair.base}
          stroke={hairStroke}
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      );
    }

    if (hairStyle === "afro") {
      // Cúpula larga — termina na hairline, não desce pela face
      return (
        <path
          d={`M${headLeft - 6} ${face.top + 20}
              Q${headLeft - 14} ${face.top + 10} ${headLeft - 8} ${face.top + 2}
              Q${headLeft - 14} ${face.top - 6} ${headLeft - 4} ${face.top - 10}
              Q${headLeft - 2} ${face.top - 18} ${headLeft + 14} ${face.top - 18}
              Q${headLeft + 12} ${face.top - 24} ${centerX} ${face.top - 24}
              Q${headRight - 12} ${face.top - 24} ${headRight - 14} ${face.top - 18}
              Q${headRight + 2} ${face.top - 18} ${headRight + 4} ${face.top - 10}
              Q${headRight + 14} ${face.top - 6} ${headRight + 8} ${face.top + 2}
              Q${headRight + 14} ${face.top + 10} ${headRight + 6} ${face.top + 20}
              Q${centerX} ${face.top + 16} ${headLeft - 6} ${face.top + 20} Z`}
          fill={hair.base}
          stroke={hairStroke}
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      );
    }

    if (hairStyle === "long") {
      // Crânio + mechas laterais que descem atrás das orelhas (o rosto pinta por cima do centro)
      return (
        <g fill={hair.base} stroke={hairStroke} strokeWidth="1.8" strokeLinejoin="round">
          <path
            d={`M${headLeft - 2} ${face.top + 18}
                C${headLeft - 5} ${face.top + 6} ${centerX - 18} ${face.top - 2} ${centerX} ${face.top - 2}
                C${centerX + 18} ${face.top - 2} ${headRight + 5} ${face.top + 6} ${headRight + 2} ${face.top + 18}
                Q${centerX} ${face.top + 14} ${headLeft - 2} ${face.top + 18} Z`}
          />
          {/* Mecha lateral esquerda — desce atrás da orelha */}
          <path
            d={`M${headLeft - 4} ${face.top + 16}
                L${headLeft - 8} ${face.earY + 10}
                L${headLeft - 6} ${face.earY + 28}
                Q${headLeft + 4} ${face.earY + 22} ${headLeft + 6} ${face.earY + 14}
                L${headLeft + 4} ${face.top + 20} Z`}
          />
          {/* Mecha lateral direita — desce atrás da orelha */}
          <path
            d={`M${headRight + 4} ${face.top + 16}
                L${headRight + 8} ${face.earY + 10}
                L${headRight + 6} ${face.earY + 28}
                Q${headRight - 4} ${face.earY + 22} ${headRight - 6} ${face.earY + 14}
                L${headRight - 4} ${face.top + 20} Z`}
          />
        </g>
      );
    }

    return null;
  };

  // Brilho do cabelo - traços curvos a seguir a curvatura (cell-shading)
  const renderHairShine = () => {
    if (hairStyle === "bald" || hairStyle === "buzz") return null;
    return (
      <g
        stroke={hair.shine}
        strokeWidth="2.4"
        fill="none"
        strokeLinecap="round"
        opacity={hairShineOpacity}
      >
        <path
          d={`M${centerX - 16} ${face.top + 12} Q${centerX - 8} ${face.top + 4} ${centerX - 2} ${face.top + 8}`}
        />
        <path
          d={`M${centerX + 4} ${face.top + 8} Q${centerX + 10} ${face.top + 4} ${centerX + 16} ${face.top + 12}`}
        />
      </g>
    );
  };

  const renderFrontHair = () => {
    if (hairStyle === "bald") return null;

    if (hairStyle === "buzz") {
      // Linha de implantação com textura de cabelo curto
      return (
        <g>
          <path
            d={`M${headLeft + 6} ${face.top + 8} Q${centerX} ${face.top + 4} ${headRight - 6} ${face.top + 8}`}
            stroke={hexToRgba(hair.base, 0.65)}
            strokeWidth="2.4"
            fill="none"
            strokeLinecap="round"
          />
          {/* Micro-fios na linha de implantação */}
          <g stroke={hexToRgba(hair.shine, 0.4)} strokeWidth="1.0" fill="none" strokeLinecap="round">
            <path d={`M${headLeft + 12} ${face.top + 7} L${headLeft + 14} ${face.top + 4}`} />
            <path d={`M${headLeft + 24} ${face.top + 6} L${headLeft + 26} ${face.top + 3}`} />
            <path d={`M${centerX - 8} ${face.top + 5} L${centerX - 6} ${face.top + 2}`} />
            <path d={`M${centerX + 6} ${face.top + 5} L${centerX + 8} ${face.top + 2}`} />
            <path d={`M${headRight - 24} ${face.top + 6} L${headRight - 22} ${face.top + 3}`} />
            <path d={`M${headRight - 12} ${face.top + 7} L${headRight - 10} ${face.top + 4}`} />
          </g>
        </g>
      );
    }

    if (hairStyle === "classic") {
      // Franja em arco natural com mechas individuais
      return (
        <g>
          <path
            d={`M${headLeft + 2} ${face.top + 4}
                Q${headLeft + 8} ${face.top - 4} ${centerX} ${face.top}
                Q${headRight - 8} ${face.top - 4} ${headRight - 2} ${face.top + 4}
                Q${centerX} ${face.top + 8} ${headLeft + 2} ${face.top + 4} Z`}
            fill={hair.base}
            stroke={hairStroke}
            strokeWidth="1.8"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {/* Mechas internas — fios curvos a seguir a curvatura da testa */}
          <g stroke={hair.shine} strokeWidth="1.2" fill="none" strokeLinecap="round" opacity="0.6">
            <path d={`M${headLeft + 10} ${face.top + 2} Q${headLeft + 14} ${face.top - 2} ${headLeft + 18} ${face.top + 4}`} />
            <path d={`M${headLeft + 22} ${face.top + 2} Q${headLeft + 26} ${face.top - 4} ${headLeft + 30} ${face.top + 5}`} />
            <path d={`M${centerX - 14} ${face.top} Q${centerX - 10} ${face.top - 6} ${centerX - 6} ${face.top + 3}`} />
            <path d={`M${centerX - 2} ${face.top - 1} Q${centerX + 2} ${face.top - 7} ${centerX + 6} ${face.top + 2}`} />
            <path d={`M${centerX + 10} ${face.top} Q${centerX + 14} ${face.top - 5} ${centerX + 18} ${face.top + 4}`} />
            <path d={`M${headRight - 30} ${face.top + 5} Q${headRight - 26} ${face.top - 4} ${headRight - 22} ${face.top + 2}`} />
            <path d={`M${headRight - 18} ${face.top + 4} Q${headRight - 14} ${face.top - 2} ${headRight - 10} ${face.top + 2}`} />
          </g>
        </g>
      );
    }

    if (hairStyle === "sidepart") {
      // Franja varridida da esquerda para a direita com mechas em leque
      return (
        <g>
          <path
            d={`M${headLeft + 2} ${face.top + 4}
                Q${headLeft + 6} ${face.top - 4} ${headRight - 8} ${face.top}
                Q${headRight - 2} ${face.top + 2} ${headRight - 4} ${face.top + 4}
                Q${centerX + 4} ${face.top + 8} ${headLeft + 2} ${face.top + 4} Z`}
            fill={hair.base}
            stroke={hairStroke}
            strokeWidth="1.8"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {/* Mechas internas — fios curvos varridos para a direita */}
          <g stroke={hair.shine} strokeWidth="1.2" fill="none" strokeLinecap="round" opacity="0.55">
            <path d={`M${headLeft + 8} ${face.top + 2} Q${headLeft + 20} ${face.top - 2} ${headLeft + 36} ${face.top + 5}`} />
            <path d={`M${headLeft + 14} ${face.top + 1} Q${headLeft + 28} ${face.top - 6} ${headLeft + 48} ${face.top + 4}`} />
            <path d={`M${headLeft + 22} ${face.top + 1} Q${headLeft + 38} ${face.top - 8} ${headLeft + 56} ${face.top + 3}`} />
            <path d={`M${headLeft + 32} ${face.top + 2} Q${headLeft + 48} ${face.top - 4} ${headLeft + 64} ${face.top + 5}`} />
            <path d={`M${headLeft + 42} ${face.top + 3} Q${headLeft + 58} ${face.top - 2} ${headLeft + 72} ${face.top + 4}`} />
            <path d={`M${headLeft + 54} ${face.top + 4} Q${headLeft + 68} ${face.top} ${headLeft + 80} ${face.top + 3}`} />
          </g>
        </g>
      );
    }

    if (hairStyle === "spiky") {
      // 3 mechas ponteagudas na raiz com fios internos
      return (
        <g fill={hair.base} stroke={hairStroke} strokeWidth="1.8" strokeLinejoin="round">
          <path d={`M${headLeft + 4} ${face.top + 2} Q${headLeft + 14} ${face.top - 4} ${headLeft + 22} ${face.top + 2} L${headLeft + 12} ${face.top + 24} Z`} />
          <path d={`M${centerX - 8} ${face.top} Q${centerX} ${face.top - 8} ${centerX + 8} ${face.top} L${centerX} ${face.top + 24} Z`} />
          <path d={`M${headRight - 22} ${face.top + 2} Q${headRight - 14} ${face.top - 4} ${headRight - 4} ${face.top + 2} L${headRight - 12} ${face.top + 24} Z`} />
          {/* Fios internos em cada pico */}
          <g stroke={hair.shine} strokeWidth="1.1" fill="none" strokeLinecap="round" opacity="0.5">
            <path d={`M${headLeft + 12} ${face.top + 2} Q${headLeft + 14} ${face.top - 2} ${headLeft + 16} ${face.top + 2} L${headLeft + 13} ${face.top + 18}`} />
            <path d={`M${centerX} ${face.top - 2} Q${centerX + 1} ${face.top - 6} ${centerX + 2} ${face.top} L${centerX} ${face.top + 18}`} />
            <path d={`M${headRight - 14} ${face.top + 2} Q${headRight - 14} ${face.top - 2} ${headRight - 12} ${face.top + 2} L${headRight - 13} ${face.top + 18}`} />
          </g>
        </g>
      );
    }

    if (hairStyle === "curly") {
      // Franja com caracóis sobrepostos e fios individuais
      return (
        <g>
          <path
            d={`M${headLeft + 2} ${face.top + 2}
                Q${centerX} ${face.top - 4} ${headRight - 2} ${face.top + 2}
                L${headRight - 2} ${face.top + 4}
                Q${headRight - 14} ${face.top + 16} ${centerX + 10} ${face.top + 4}
                Q${centerX} ${face.top + 16} ${centerX - 10} ${face.top + 4}
                Q${headLeft + 14} ${face.top + 16} ${headLeft + 2} ${face.top + 4} Z`}
            fill={hair.base}
            stroke={hairStroke}
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          {/* Fios em espiral — cada carioco tem anel interno */}
          <g stroke={hair.shine} strokeWidth="1.3" fill="none" strokeLinecap="round" opacity="0.5">
            {/* Carioco esquerdo */}
            <path d={`M${headLeft + 8} ${face.top + 6} Q${headLeft + 4} ${face.top + 10} ${headLeft + 10} ${face.top + 12} Q${headLeft + 16} ${face.top + 10} ${headLeft + 12} ${face.top + 6}`} />
            {/* Carioco central */}
            <path d={`M${centerX - 6} ${face.top + 6} Q${centerX - 10} ${face.top + 12} ${centerX - 4} ${face.top + 14} Q${centerX + 2} ${face.top + 12} ${centerX - 2} ${face.top + 6}`} />
            {/* Carioco direito */}
            <path d={`M${headRight - 12} ${face.top + 6} Q${headRight - 16} ${face.top + 10} ${headRight - 10} ${face.top + 12} Q${headRight - 4} ${face.top + 10} ${headRight - 8} ${face.top + 6}`} />
          </g>
        </g>
      );
    }

    if (hairStyle === "afro") {
      // Linha de implantação ondulada com textura de caracóis
      return (
        <g>
          <path
            d={`M${headLeft + 6} ${face.top + 4}
                Q${headLeft + 12} ${face.top - 2} ${centerX - 4} ${face.top}
                Q${centerX + 2} ${face.top + 2} ${centerX + 8} ${face.top}
                Q${headRight - 12} ${face.top - 2} ${headRight - 6} ${face.top + 4}
                Q${centerX} ${face.top + 8} ${headLeft + 6} ${face.top + 4} Z`}
            fill={hair.base}
            stroke={hairStroke}
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          {/* Textura de caracóis — pequenos arcos sobrepostos */}
          <g stroke={hair.shine} strokeWidth="1.1" fill="none" strokeLinecap="round" opacity="0.45">
            <path d={`M${headLeft + 10} ${face.top + 2} Q${headLeft + 8} ${face.top + 6} ${headLeft + 12} ${face.top + 7} Q${headLeft + 16} ${face.top + 6} ${headLeft + 14} ${face.top + 2}`} />
            <path d={`M${headLeft + 20} ${face.top + 1} Q${headLeft + 18} ${face.top + 5} ${headLeft + 22} ${face.top + 6} Q${headLeft + 26} ${face.top + 5} ${headLeft + 24} ${face.top + 1}`} />
            <path d={`M${centerX - 8} ${face.top + 1} Q${centerX - 10} ${face.top + 5} ${centerX - 6} ${face.top + 6} Q${centerX - 2} ${face.top + 5} ${centerX - 4} ${face.top + 1}`} />
            <path d={`M${centerX + 2} ${face.top + 1} Q${centerX} ${face.top + 5} ${centerX + 4} ${face.top + 6} Q${centerX + 8} ${face.top + 5} ${centerX + 6} ${face.top + 1}`} />
            <path d={`M${headRight - 14} ${face.top + 2} Q${headRight - 16} ${face.top + 6} ${headRight - 12} ${face.top + 7} Q${headRight - 8} ${face.top + 6} ${headRight - 10} ${face.top + 2}`} />
            <path d={`M${headRight - 6} ${face.top + 3} Q${headRight - 8} ${face.top + 7} ${headRight - 4} ${face.top + 8} Q${headRight} ${face.top + 7} ${headRight - 2} ${face.top + 3}`} />
          </g>
        </g>
      );
    }

    if (hairStyle === "long") {
      // Franja em dois picos suaves com mechas longas e fios internos
      return (
        <g>
          <path
            d={`M${headLeft + 2} ${face.top + 4}
                Q${headLeft + 8} ${face.top - 4} ${centerX - 10} ${face.top}
                Q${centerX - 4} ${face.top + 8} ${centerX} ${face.top}
                Q${centerX + 6} ${face.top + 8} ${centerX + 12} ${face.top}
                Q${headRight - 8} ${face.top - 4} ${headRight - 2} ${face.top + 4}
                Q${centerX} ${face.top + 8} ${headLeft + 2} ${face.top + 4} Z`}
            fill={hair.base}
            stroke={hairStroke}
            strokeWidth="1.8"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {/* Mechas longas — fios que descem ao longo da face */}
          <g stroke={hair.shine} strokeWidth="1.2" fill="none" strokeLinecap="round" opacity="0.5">
            {/* Pico esquerdo — fios internos */}
            <path d={`M${headLeft + 6} ${face.top + 2} Q${headLeft + 8} ${face.top - 2} ${headLeft + 10} ${face.top + 2}`} />
            <path d={`M${headLeft + 14} ${face.top + 1} Q${headLeft + 16} ${face.top - 3} ${headLeft + 18} ${face.top + 1}`} />
            {/* Fio longo lateral esquerdo */}
            <path d={`M${headLeft + 4} ${face.top + 6} Q${headLeft + 2} ${face.top + 18} ${headLeft + 6} ${face.top + 30}`} />
            {/* Pico direito — fios internos */}
            <path d={`M${headRight - 10} ${face.top + 1} Q${headRight - 12} ${face.top - 3} ${headRight - 14} ${face.top + 1}`} />
            <path d={`M${headRight - 6} ${face.top + 2} Q${headRight - 8} ${face.top - 2} ${headRight - 10} ${face.top + 2}`} />
            {/* Fio longo lateral direito */}
            <path d={`M${headRight - 4} ${face.top + 6} Q${headRight - 2} ${face.top + 18} ${headRight - 6} ${face.top + 30}`} />
            {/* Fio central suave */}
            <path d={`M${centerX - 2} ${face.top + 3} Q${centerX - 1} ${face.top + 10} ${centerX - 3} ${face.top + 16}`} />
            <path d={`M${centerX + 4} ${face.top + 3} Q${centerX + 5} ${face.top + 10} ${centerX + 3} ${face.top + 16}`} />
          </g>
        </g>
      );
    }

    return null;
  };

  // ---------- SOBRANCELHAS estilo tinta ----------
  const renderBrows = () => {
    const leftOuterY = browY - angryTilt + smileLift;
    const leftInnerY = browY + browInnerShift + smileLift;
    const rightInnerY = browY + browInnerShift + smileLift;
    const rightOuterY = browY - angryTilt + smileLift;

    if (browStyle === "flat") {
      return (
        <g fill={OUTLINE} stroke="none">
          <path
            d={`M${face.leftEyeX - 13} ${leftOuterY - 1.5}
                L${face.leftEyeX + 11} ${leftOuterY - 1.5}
                L${face.leftEyeX + 11} ${leftOuterY + 1.5}
                L${face.leftEyeX - 13} ${leftOuterY + 1.5} Z`}
          />
          <path
            d={`M${face.rightEyeX - 11} ${rightOuterY - 1.5}
                L${face.rightEyeX + 13} ${rightOuterY - 1.5}
                L${face.rightEyeX + 13} ${rightOuterY + 1.5}
                L${face.rightEyeX - 11} ${rightOuterY + 1.5} Z`}
          />
        </g>
      );
    }

    if (browStyle === "bold") {
      // Sobrancelhas grossas como traço de pincel - Hyuga / Wakashimazu
      return (
        <g fill={OUTLINE} stroke="none">
          <path
            d={`M${face.leftEyeX - 14} ${leftOuterY + 3}
                L${face.leftEyeX + 12} ${leftInnerY + 3}
                L${face.leftEyeX + 12} ${leftInnerY - 2.5}
                L${face.leftEyeX - 14} ${leftOuterY - 2.5} Z`}
          />
          <path
            d={`M${face.rightEyeX - 12} ${rightInnerY + 3}
                L${face.rightEyeX + 14} ${rightOuterY + 3}
                L${face.rightEyeX + 14} ${rightOuterY - 2.5}
                L${face.rightEyeX - 12} ${rightInnerY - 2.5} Z`}
          />
        </g>
      );
    }

    // Soft - linha angular fina mas firme
    return (
      <g stroke={OUTLINE} strokeWidth="3" fill="none" strokeLinecap="round">
        <path d={`M${face.leftEyeX - 13} ${leftOuterY} L${face.leftEyeX + 11} ${leftInnerY}`} />
        <path d={`M${face.rightEyeX - 11} ${rightInnerY} L${face.rightEyeX + 13} ${rightOuterY}`} />
      </g>
    );
  };

  // ---------- OLHOS estilo Tsubasa ----------
  const renderEye = (x, direction) => {
    const lidLift = (eyeStyle === "sharp" ? 4 + angryTilt * 0.4 : eyeStyle === "hero" ? 7.5 : 6.5) + profile.lidBoost;
    const irisShift = direction === "left" ? 1.2 : -1.2;
    const isClosed = eyeStyle === "sharp" && expression === "focused";

    if (isClosed) {
      // Olhos meio-fechados de concentração (efeito Tsubasa serious)
      return (
        <g>
          <path
            d={`M${x - eyeRx} ${eyeY + 1}
                Q${x} ${eyeY - lidLift * 0.5} ${x + eyeRx} ${eyeY + 1}`}
            stroke={OUTLINE}
            strokeWidth="3.5"
            fill="none"
            strokeLinecap="round"
          />
          <path
            d={`M${x - eyeRx + 2} ${eyeY + 3} L${x + eyeRx - 2} ${eyeY + 3}`}
            stroke={OUTLINE}
            strokeWidth="2"
            strokeLinecap="round"
          />
        </g>
      );
    }

    return (
      <g>
        {/* Esclera - pontas afiladas em V */}
        <path
          d={`M${x - eyeRx} ${eyeY}
              Q${x - eyeRx + 1} ${eyeY - eyeRy} ${x} ${eyeY - eyeRy}
              Q${x + eyeRx - 1} ${eyeY - eyeRy} ${x + eyeRx} ${eyeY}
              Q${x + eyeRx - 1} ${eyeY + eyeRy * 0.85} ${x} ${eyeY + eyeRy * 0.85}
              Q${x - eyeRx + 1} ${eyeY + eyeRy * 0.85} ${x - eyeRx} ${eyeY} Z`}
          fill={EYE_WHITE}
          stroke={OUTLINE}
          strokeWidth="1.6"
        />

        {/* Sombra superior na esclera (estilo cell-shading Tsubasa) */}
        <path
          d={`M${x - eyeRx + 1} ${eyeY - 0.5}
              Q${x} ${eyeY - eyeRy + 0.5} ${x + eyeRx - 1} ${eyeY - 0.5}
              L${x + eyeRx - 2} ${eyeY - eyeRy * 0.4}
              Q${x} ${eyeY - eyeRy * 0.55} ${x - eyeRx + 2} ${eyeY - eyeRy * 0.4} Z`}
          fill={hexToRgba(OUTLINE, 0.18)}
        />

        {/* Íris vertical (alongada como Tsubasa) */}
        <ellipse
          cx={x + irisShift}
          cy={eyeY}
          rx={irisR}
          ry={irisR * 1.15}
          fill={eyes.iris}
        />

        {/* Sombra superior da íris */}
        <path
          d={`M${x + irisShift - irisR} ${eyeY}
              Q${x + irisShift} ${eyeY - irisR * 1.1} ${x + irisShift + irisR} ${eyeY}
              L${x + irisShift + irisR * 0.9} ${eyeY - irisR * 0.2}
              Q${x + irisShift} ${eyeY - irisR * 0.4} ${x + irisShift - irisR * 0.9} ${eyeY - irisR * 0.2} Z`}
          fill={mixHex(eyes.iris, "#000000", 0.45)}
        />

        {/* Pupila vertical */}
        <ellipse
          cx={x + irisShift}
          cy={eyeY + 1}
          rx={irisR * 0.4}
          ry={irisR * 0.65}
          fill="#0a0d16"
        />

        {/* Catchlight grande no canto superior (assinatura shounen) */}
        <ellipse
          cx={x + irisShift - irisR * 0.35}
          cy={eyeY - irisR * 0.45}
          rx={irisR * 0.4}
          ry={irisR * 0.5}
          fill="#ffffff"
        />
        {/* Catchlight pequeno oposto */}
        <circle
          cx={x + irisShift + irisR * 0.4}
          cy={eyeY + irisR * 0.4}
          r={irisR * 0.18}
          fill="#ffffff"
          opacity="0.85"
        />

        {/* Pálpebra superior carregada - Tsubasa style */}
        <path
          d={`M${x - eyeRx - 1} ${eyeY + 0.5}
              Q${x - eyeRx + 2} ${eyeY - eyeRy - 1} ${x} ${eyeY - eyeRy - 1}
              Q${x + eyeRx - 2} ${eyeY - eyeRy - 1} ${x + eyeRx + 1} ${eyeY + 0.5}
              L${x + eyeRx + 1} ${eyeY - 1}
              Q${x + eyeRx - 2} ${eyeY - eyeRy + 0.5} ${x} ${eyeY - eyeRy + 0.5}
              Q${x - eyeRx + 2} ${eyeY - eyeRy + 0.5} ${x - eyeRx - 1} ${eyeY - 1} Z`}
          fill={OUTLINE}
        />

        {/* Pestanas superiores (3 traços externos) */}
        <g stroke={OUTLINE} strokeWidth="1.6" strokeLinecap="round" fill="none">
          <path d={`M${x - eyeRx - 1} ${eyeY - 0.5} L${x - eyeRx - 4} ${eyeY - eyeRy * 0.5}`} />
          {direction === "left" && (
            <path d={`M${x - eyeRx + 1} ${eyeY - eyeRy + 0.5} L${x - eyeRx - 2} ${eyeY - eyeRy - 2}`} />
          )}
          {direction === "right" && (
            <path d={`M${x + eyeRx - 1} ${eyeY - eyeRy + 0.5} L${x + eyeRx + 2} ${eyeY - eyeRy - 2}`} />
          )}
        </g>

        {/* Pálpebra inferior fina, desconectada */}
        <path
          d={`M${x - eyeRx + 3} ${eyeY + eyeRy * 0.85}
              L${x + eyeRx - 3} ${eyeY + eyeRy * 0.85}`}
          stroke={hexToRgba(OUTLINE, 0.55)}
          strokeWidth="1.4"
          strokeLinecap="round"
          fill="none"
        />
      </g>
    );
  };

  // ---------- NARIZ minimalista ----------
  const renderNose = () => {
    if (noseStyle === "button") {
      return (
        <path
          d={`M${centerX - 1} ${face.noseY + 4} L${centerX + 3} ${face.noseY + 5}`}
          stroke={hexToRgba(OUTLINE, 0.55)}
          strokeWidth="1.8"
          fill="none"
          strokeLinecap="round"
        />
      );
    }

    if (noseStyle === "bridge") {
      // Pequeno V e linha da ponte (lado iluminado/sombrio)
      return (
        <g fill="none" strokeLinecap="round">
          <path
            d={`M${centerX + 2} ${face.noseY - 8} L${centerX + 3} ${face.noseY + 2}`}
            stroke={hexToRgba(OUTLINE, 0.4)}
            strokeWidth="1.4"
          />
          <path
            d={`M${centerX - 1} ${face.noseY + 2} L${centerX + 4} ${face.noseY + 4}`}
            stroke={hexToRgba(OUTLINE, 0.55)}
            strokeWidth="1.6"
          />
        </g>
      );
    }

    // Point - apenas a sombra em V (estilo Tsubasa puro)
    return (
      <path
        d={`M${centerX + 1} ${face.noseY - 4}
            L${centerX - 3} ${face.noseY + 4}
            L${centerX + 4} ${face.noseY + 5} Z`}
        fill={hexToRgba(skin.shadow, 0.7)}
      />
    );
  };

  // ---------- BOCAS angulares ----------
  const renderMouth = () => {
    if (expression === "smile") {
      return (
        <path
          d={`M${centerX - 14} ${mouthY - 1}
              Q${centerX} ${mouthY + 8} ${centerX + 14} ${mouthY - 1}`}
          stroke={OUTLINE}
          strokeWidth="2.6"
          fill="none"
          strokeLinecap="round"
        />
      );
    }

    if (expression === "grin") {
      // Boca aberta a sorrir - dente cerrado heroico
      return (
        <g>
          <path
            d={`M${centerX - 16} ${mouthY - 2}
                Q${centerX} ${mouthY + 12} ${centerX + 16} ${mouthY - 2}
                Q${centerX} ${mouthY + 4} ${centerX - 16} ${mouthY - 2} Z`}
            fill={OUTLINE}
            stroke={OUTLINE}
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <path
            d={`M${centerX - 12} ${mouthY + 1}
                Q${centerX} ${mouthY + 5} ${centerX + 12} ${mouthY + 1}
                L${centerX + 10} ${mouthY + 3}
                Q${centerX} ${mouthY + 7} ${centerX - 10} ${mouthY + 3} Z`}
            fill="#f6f7fa"
          />
        </g>
      );
    }

    if (expression === "serious") {
      // Linha angular descendente nos cantos
      return (
        <path
          d={`M${centerX - 10} ${mouthY + 2} L${centerX} ${mouthY - 1} L${centerX + 10} ${mouthY + 2}`}
          stroke={OUTLINE}
          strokeWidth="2.5"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      );
    }

    if (expression === "focused") {
      // Linha cerrada
      return (
        <path
          d={`M${centerX - 9} ${mouthY} L${centerX + 9} ${mouthY}`}
          stroke={OUTLINE}
          strokeWidth="2.6"
          fill="none"
          strokeLinecap="round"
        />
      );
    }

    // Neutral
    return (
      <path
        d={`M${centerX - 10} ${mouthY} Q${centerX} ${mouthY + 2.5} ${centerX + 10} ${mouthY}`}
        stroke={OUTLINE}
        strokeWidth="2.4"
        fill="none"
        strokeLinecap="round"
      />
    );
  };

  // ---------- BARBAS ----------
  const renderBeard = () => {
    if (beardStyle === "none") return null;

    if (beardStyle === "stubble") {
      return (
        <path
          d={`M${headLeft + 14} ${mouthY - 2} C${centerX - 12} ${face.bottom - 6} ${centerX + 12} ${face.bottom - 6} ${headRight - 14} ${mouthY - 2}`}
          stroke={hexToRgba(hair.base, 0.5)}
          strokeWidth="2.6"
          fill="none"
          strokeDasharray="1.3 2"
        />
      );
    }

    if (beardStyle === "mustache") {
      return (
        <path
          d={`M${centerX - 14} ${mouthY - 8}
              Q${centerX - 6} ${mouthY - 12} ${centerX} ${mouthY - 7}
              Q${centerX + 6} ${mouthY - 12} ${centerX + 14} ${mouthY - 8}`}
          stroke={OUTLINE}
          strokeWidth="2.8"
          fill="none"
          strokeLinecap="round"
        />
      );
    }

    return (
      <g>
        <path
          d={`M${centerX - 13} ${mouthY - 8}
              Q${centerX} ${mouthY - 11} ${centerX + 13} ${mouthY - 8}`}
          stroke={OUTLINE}
          strokeWidth="2.4"
          fill="none"
        />
        <path
          d={`M${centerX - 7} ${mouthY + 4}
              Q${centerX} ${mouthY + 14} ${centerX + 7} ${mouthY + 4} Z`}
          fill={hair.base}
          stroke={OUTLINE}
          strokeWidth="1.6"
        />
      </g>
    );
  };

  const renderGlasses = () => {
    if (!glasses) return null;

    return (
      <g stroke={OUTLINE} fill="none">
        <rect x={face.leftEyeX - 11} y={eyeY - 8} width="22" height="15" rx="3" strokeWidth="1.8" />
        <rect x={face.rightEyeX - 11} y={eyeY - 8} width="22" height="15" rx="3" strokeWidth="1.8" />
        <path d={`M${face.leftEyeX + 11} ${eyeY - 1} L${face.rightEyeX - 11} ${eyeY - 1}`} strokeWidth="1.6" />
        <path d={`M${face.leftEyeX - 11} ${eyeY - 4} L${face.leftEyeX - 16} ${eyeY - 6}`} strokeWidth="1.4" />
        <path d={`M${face.rightEyeX + 11} ${eyeY - 4} L${face.rightEyeX + 16} ${eyeY - 6}`} strokeWidth="1.4" />
        {/* Reflexo na lente */}
        <path d={`M${face.leftEyeX - 7} ${eyeY - 5} L${face.leftEyeX - 2} ${eyeY - 7}`} strokeWidth="1.6" stroke="rgba(255,255,255,0.8)" />
        <path d={`M${face.rightEyeX - 7} ${eyeY - 5} L${face.rightEyeX - 2} ${eyeY - 7}`} strokeWidth="1.6" stroke="rgba(255,255,255,0.8)" />
      </g>
    );
  };

  // Sombra cell-shading na face (lado direito mais escuro)
  const renderFaceShadow = () => (
    <path
      d={`M${centerX + 2} ${face.top + 18}
          L${centerX + 4} ${face.noseY}
          L${centerX + 1} ${face.noseY + 8}
          L${centerX + 8} ${mouthY + 4}
          L${centerX + 6} ${face.jawY}
          L${headRight - 4} ${face.cheekY}
          L${headRight - 8} ${face.top + 30} Z`}
      fill={hexToRgba(skin.shadow, faceShadowAlpha)}
    />
  );

  return (
    <div className="relative shrink-0">
      <svg
        viewBox="0 0 120 120"
        className={`w-full h-full ${SIZE_MAP[size] ?? SIZE_MAP.lg} rounded-full shadow-lg`}
        style={{ backgroundColor: BACKDROP }}
        shapeRendering="geometricPrecision"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* Fundo */}
        <circle cx="60" cy="60" r="58" fill={BACKDROP} />
        <circle cx="60" cy="60" r="56" fill={PANEL} />



        {/* Linhas de velocidade radiais (efeito shounen sutil) */}
        <g stroke={hexToRgba(accent, 0.12)} strokeWidth="1" fill="none">
          <path d="M60 6 L60 14" />
          <path d="M60 106 L60 114" />
          <path d="M6 60 L14 60" />
          <path d="M106 60 L114 60" />
        </g>

        {/* Camisola */}
        <path
          d={`M28 120 C32 ${shirtTop + 2} 45 ${shirtTop - 7} 60 ${shirtTop - 7} C75 ${shirtTop - 7} 88 ${shirtTop + 2} 92 120 Z`}
          fill={shirt}
          stroke={OUTLINE}
          strokeWidth="1.8"
        />
        {/* Sombra debaixo do queixo */}
        <ellipse cx={centerX} cy={face.bottom - 1} rx="22" ry="6.5" fill="#00000033" />

        {/* Pescoço */}
        <path
          d={`M48 ${shirtTop - 3} L48 ${shirtTop + 11} C52 ${shirtTop + 15} 68 ${shirtTop + 15} 72 ${shirtTop + 11} L72 ${shirtTop - 3} Z`}
          fill={skin.shadow}
          stroke={OUTLINE}
          strokeWidth="1.6"
        />
        {/* Decote em V */}
        <path
          d={`M48 ${shirtTop - 3} L60 ${shirtTop + 9} L72 ${shirtTop - 3}`}
          fill={shirtDark}
          stroke={OUTLINE}
          strokeWidth="1.6"
        />
        <path d={`M52 ${shirtTop - 1} L60 ${shirtTop + 7} L68 ${shirtTop - 1}`} fill={shirtLight} opacity="0.4" />

        {/* Cabelo de trás */}
        {renderBackHair()}

        {/* Orelhas - traço grosso */}
        <g>
          <path
            d={`M${earLeftX} ${face.earY - 8}
                Q${earLeftX - 7} ${face.earY - 4} ${earLeftX - 7} ${face.earY + 2}
                Q${earLeftX - 5} ${face.earY + 8} ${earLeftX} ${face.earY + 8} Z`}
            fill={skin.base}
            stroke={OUTLINE}
            strokeWidth="1.6"
          />
          <path
            d={`M${earRightX} ${face.earY - 8}
                Q${earRightX + 7} ${face.earY - 4} ${earRightX + 7} ${face.earY + 2}
                Q${earRightX + 5} ${face.earY + 8} ${earRightX} ${face.earY + 8} Z`}
            fill={skin.base}
            stroke={OUTLINE}
            strokeWidth="1.6"
          />
          {/* Detalhe interno orelhas */}
          <path
            d={`M${earLeftX - 1} ${face.earY - 3} Q${earLeftX - 4} ${face.earY + 1} ${earLeftX - 1} ${face.earY + 5}`}
            stroke={hexToRgba(skin.shadow, 0.85)}
            strokeWidth="1.4"
            fill="none"
          />
          <path
            d={`M${earRightX + 1} ${face.earY - 3} Q${earRightX + 4} ${face.earY + 1} ${earRightX + 1} ${face.earY + 5}`}
            stroke={hexToRgba(skin.shadow, 0.85)}
            strokeWidth="1.4"
            fill="none"
          />
        </g>

        {/* Rosto - traço grosso a tinta */}
        <path d={face.path} fill={skin.base} stroke={OUTLINE} strokeWidth="1.8" />

        {/* Sombra cell-shading do rosto */}
        {renderFaceShadow()}

        {/* Brilho subtil sobre a testa */}
        <ellipse cx={centerX - 10} cy={face.top + 22} rx="14" ry="6" fill="#ffffff14" />

        {/* Bochechas */}
        <ellipse
          cx={face.leftEyeX - 4}
          cy={cheekY}
          rx="7.5"
          ry="4.5"
          fill={hexToRgba(skin.blush, expression === "smile" || expression === "grin" ? cheekAlpha + 0.1 : cheekAlpha)}
        />
        <ellipse
          cx={face.rightEyeX + 4}
          cy={cheekY}
          rx="7.5"
          ry="4.5"
          fill={hexToRgba(skin.blush, expression === "smile" || expression === "grin" ? cheekAlpha + 0.1 : cheekAlpha)}
        />

        {/* Cabelo da frente */}
        {renderFrontHair()}
        {renderHairShine()}

        {/* Faixa */}
        {headband && (
          <g>
            <rect
              x={headLeft + 6}
              y={browY - 9}
              width={headWidth - 12}
              height="9"
              rx="1.5"
              fill={shirtLight}
              stroke={OUTLINE}
              strokeWidth="1.6"
            />
            <rect
              x={headLeft + 6}
              y={browY - 6}
              width={headWidth - 12}
              height="3"
              fill={shirt}
              opacity="0.55"
            />
            {/* Nó da faixa de lado */}
            <path
              d={`M${headRight - 4} ${browY - 8}
                  L${headRight + 6} ${browY - 12}
                  L${headRight + 8} ${browY - 4}
                  L${headRight - 2} ${browY - 1} Z`}
              fill={shirt}
              stroke={OUTLINE}
              strokeWidth="1.4"
            />
          </g>
        )}

        {/* Olhos */}
        {renderEye(face.leftEyeX, "left")}
        {renderEye(face.rightEyeX, "right")}
        {renderBrows()}

        {freckles && (
          <g fill={hexToRgba(skin.shadow, 0.7)}>
            <circle cx={face.leftEyeX - 6} cy={cheekY - 3} r="1" />
            <circle cx={face.leftEyeX - 2} cy={cheekY} r="0.9" />
            <circle cx={face.leftEyeX + 2} cy={cheekY - 4} r="0.8" />
            <circle cx={face.rightEyeX - 2} cy={cheekY - 4} r="0.8" />
            <circle cx={face.rightEyeX + 2} cy={cheekY} r="0.9" />
            <circle cx={face.rightEyeX + 6} cy={cheekY - 3} r="1" />
          </g>
        )}

        {mole && <circle cx={face.rightEyeX + 7} cy={mouthY - 4} r="1.3" fill={hexToRgba(OUTLINE, 0.85)} />}

        {renderNose()}
        {renderMouth()}
        {renderBeard()}
        {renderGlasses()}

        {/* Gota de suor anime (raríssimo, GR/DEF stressed) */}
        {sweatDrop && (
          <path
            d={`M${face.rightEyeX + 14} ${eyeY - 2}
                Q${face.rightEyeX + 17} ${eyeY + 2} ${face.rightEyeX + 14} ${eyeY + 6}
                Q${face.rightEyeX + 11} ${eyeY + 2} ${face.rightEyeX + 14} ${eyeY - 2} Z`}
            fill="#9ad4ff"
            stroke={OUTLINE}
            strokeWidth="1.2"
          />
        )}

        {/* Anel de acento da posição */}
        <circle cx="60" cy="60" r="56" fill="none" stroke={hexToRgba(accent, 0.6)} strokeWidth="2.4" />
        <circle cx="60" cy="60" r="56" fill="none" stroke={hexToRgba(accent, 0.2)} strokeWidth="0.8" />
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
