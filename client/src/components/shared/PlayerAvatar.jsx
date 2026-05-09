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
    path: "M60 15 C80 15 95 31 96 54 C97 81 80 106 60 106 C40 106 23 81 24 54 C25 31 40 15 60 15 Z",
    top: 15,
    bottom: 106,
    left: 24,
    right: 96,
    eyeY: 58,
    browY: 44,
    noseY: 70,
    mouthY: 85,
    cheekY: 77,
    earY: 61,
    leftEyeX: 44,
    rightEyeX: 76,
  },
  oval: {
    path: "M60 13 C78 13 93 30 94 56 C95 84 79 108 60 108 C41 108 25 84 26 56 C27 30 42 13 60 13 Z",
    top: 13,
    bottom: 108,
    left: 26,
    right: 94,
    eyeY: 59,
    browY: 45,
    noseY: 71,
    mouthY: 86,
    cheekY: 78,
    earY: 62,
    leftEyeX: 45,
    rightEyeX: 75,
  },
  strong: {
    path: "M60 15 C82 15 96 30 95 51 C94 73 85 96 75 104 C70 108 65 109 60 109 C55 109 50 108 45 104 C35 96 26 73 25 51 C24 30 38 15 60 15 Z",
    top: 15,
    bottom: 109,
    left: 25,
    right: 95,
    eyeY: 57,
    browY: 43,
    noseY: 70,
    mouthY: 85,
    cheekY: 77,
    earY: 60,
    leftEyeX: 43,
    rightEyeX: 77,
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
    { value: "smile", weight: position === "ATA" ? 2.8 : 1.7 },
    { value: "grin", weight: position === "ATA" ? 1.8 : 1.0 },
    { value: "neutral", weight: position === "MED" ? 2.2 : 1.4 },
    { value: "serious", weight: position === "DEF" ? 2.2 : 1.2 },
    { value: "focused", weight: position === "GR" ? 2.3 : 1.0 },
  ]);

  const faceKey = weightedPick(rng, [
    { value: "round", weight: position === "GR" ? 1.9 : 1.4 },
    { value: "oval", weight: position === "MED" || position === "ATA" ? 2.0 : 1.4 },
    { value: "strong", weight: position === "DEF" ? 2.0 : 1.3 },
  ]);
  const face = FACE_VARIANTS[faceKey];

  const hairStyle = weightedPick(rng, [
    { value: "bald", weight: 0.35 },
    { value: "buzz", weight: position === "DEF" ? 1.6 : 1.0 },
    { value: "classic", weight: 2.4 },
    { value: "sidepart", weight: position === "MED" ? 1.9 : 1.4 },
    { value: "spiky", weight: position === "ATA" ? 2.0 : 1.2 },
    { value: "curly", weight: 1.0 },
    { value: "afro", weight: 0.75 },
    { value: "long", weight: position === "ATA" ? 0.8 : 0.45 },
  ]);

  const eyeStyle = weightedPick(rng, [
    { value: "soft", weight: position === "MED" ? 1.8 : 1.2 },
    { value: "hero", weight: position === "ATA" ? 1.9 : 1.2 },
    { value: "sharp", weight: position === "DEF" || position === "GR" ? 1.9 : 1.1 },
  ]);

  const browStyle = weightedPick(rng, [
    { value: "soft", weight: 1.4 },
    { value: "flat", weight: 1.1 },
    { value: "bold", weight: 1.2 },
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
  const headband = position === "GR" && chance(rng, 0.35);

  const accent = POSITION_ACCENT[position] || "#94a3b8";
  const shirt = normalizeHex(teamColor, accent);
  const shirtDark = mixHex(shirt, "#000000", 0.24);
  const shirtLight = mixHex(shirt, "#ffffff", 0.12);
  const hairStroke = mixHex(hair.base, "#000000", 0.18);
  const eyeRx = eyeStyle === "hero" ? 8.6 : eyeStyle === "soft" ? 7.8 : 8.2;
  const eyeRy = eyeStyle === "sharp" ? 3.7 : eyeStyle === "hero" ? 5.0 : 4.4;
  const irisR = eyeStyle === "hero" ? 4.7 : 4.3;
  const angryTilt = expression === "focused" || expression === "serious" ? 3 : 0;
  const smileLift = expression === "smile" || expression === "grin" ? -1 : 0;
  const shirtTop = face.bottom - 8;
  const headLeft = face.left;
  const headRight = face.right;
  const headWidth = headRight - headLeft;
  const centerX = 60;
  const earLeftX = headLeft - 2;
  const earRightX = headRight + 2;
  const browInnerShift = expression === "focused" || expression === "serious" ? 2.5 : -0.6;

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
            opacity="0.65"
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
            opacity="0.65"
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
          <path d={`M${centerX - 26} ${face.top + 25} L${centerX - 18} ${face.top - 2} L${centerX - 8} ${face.top + 23} Z`} fill={hair.base} stroke={hairStroke} strokeWidth="1" />
          <path d={`M${centerX - 5} ${face.top + 20} L${centerX + 1} ${face.top - 6} L${centerX + 8} ${face.top + 20} Z`} fill={hair.base} stroke={hairStroke} strokeWidth="1" />
          <path d={`M${centerX + 11} ${face.top + 25} L${centerX + 19} ${face.top - 1} L${centerX + 27} ${face.top + 24} Z`} fill={hair.base} stroke={hairStroke} strokeWidth="1" />
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
            opacity="0.4"
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
            opacity="0.7"
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
            opacity="0.7"
          />
        </g>
      );
    }

    if (hairStyle === "spiky") {
      return (
        <g fill={hair.base} stroke={hairStroke} strokeWidth="1">
          <path d={`M${centerX - 23} ${face.top + 30} L${centerX - 15} ${face.top + 12} L${centerX - 6} ${face.top + 30} Z`} />
          <path d={`M${centerX - 4} ${face.top + 25} L${centerX + 2} ${face.top + 7} L${centerX + 9} ${face.top + 26} Z`} />
          <path d={`M${centerX + 11} ${face.top + 31} L${centerX + 18} ${face.top + 13} L${centerX + 25} ${face.top + 31} Z`} />
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
          opacity="0.7"
        />
      </g>
    );
  };

  const renderBrows = () => {
    const leftOuterY = face.browY - angryTilt + smileLift;
    const leftInnerY = face.browY + browInnerShift + smileLift;
    const rightInnerY = face.browY + browInnerShift + smileLift;
    const rightOuterY = face.browY - angryTilt + smileLift;
    const strokeWidth = browStyle === "bold" ? 3.6 : browStyle === "flat" ? 2.4 : 2.8;

    if (browStyle === "flat") {
      return (
        <g stroke={hair.base} strokeWidth={strokeWidth} fill="none">
          <path d={`M${face.leftEyeX - 10} ${leftOuterY} L${face.leftEyeX + 10} ${leftOuterY}`} />
          <path d={`M${face.rightEyeX - 10} ${rightOuterY} L${face.rightEyeX + 10} ${rightOuterY}`} />
        </g>
      );
    }

    if (browStyle === "bold") {
      return (
        <g stroke={hair.base} strokeWidth={strokeWidth} fill="none">
          <path d={`M${face.leftEyeX - 10} ${leftOuterY + 1} C${face.leftEyeX - 3} ${leftInnerY - 4} ${face.leftEyeX + 4} ${leftInnerY - 3} ${face.leftEyeX + 10} ${leftInnerY + 1}`} />
          <path d={`M${face.rightEyeX - 10} ${rightInnerY + 1} C${face.rightEyeX - 4} ${rightInnerY - 3} ${face.rightEyeX + 3} ${rightOuterY - 4} ${face.rightEyeX + 10} ${rightOuterY + 1}`} />
        </g>
      );
    }

    return (
      <g stroke={hair.base} strokeWidth={strokeWidth} fill="none">
        <path d={`M${face.leftEyeX - 10} ${leftOuterY + 1} C${face.leftEyeX - 2} ${leftInnerY - 5} ${face.leftEyeX + 4} ${leftInnerY - 4} ${face.leftEyeX + 10} ${leftInnerY + 1}`} />
        <path d={`M${face.rightEyeX - 10} ${rightInnerY + 1} C${face.rightEyeX - 4} ${rightInnerY - 4} ${face.rightEyeX + 2} ${rightOuterY - 5} ${face.rightEyeX + 10} ${rightOuterY + 1}`} />
      </g>
    );
  };

  const renderEye = (x, direction) => {
    const lidLift = eyeStyle === "sharp" ? 5 + angryTilt * 0.4 : eyeStyle === "hero" ? 4.5 : 3.8;
    const irisShift = direction === "left" ? 0.9 : 1.1;

    return (
      <g>
        <ellipse cx={x} cy={face.eyeY} rx={eyeRx} ry={eyeRy} fill={EYE_WHITE} />
        <circle cx={x + irisShift} cy={face.eyeY + 0.8} r={irisR} fill={eyes.iris} stroke={OUTLINE} strokeWidth="0.8" />
        <circle cx={x + irisShift + 0.8} cy={face.eyeY + 1.1} r="2" fill="#111420" />
        <circle cx={x - 1.1} cy={face.eyeY - 1.3} r="1.4" fill="#ffffffd0" />
        <path d={`M${x - eyeRx - 0.4} ${face.eyeY - 0.2} C${x - 4} ${face.eyeY - lidLift} ${x + 4} ${face.eyeY - lidLift} ${x + eyeRx + 0.4} ${face.eyeY - 0.2}`} stroke={OUTLINE} strokeWidth="2.3" fill="none" />
        <path d={`M${x - eyeRx + 1.2} ${face.eyeY + eyeRy - 0.1} C${x} ${face.eyeY + eyeRy + 0.8} ${x + eyeRx - 1.2} ${face.eyeY + eyeRy - 0.1} ${x + eyeRx - 1.2} ${face.eyeY + eyeRy - 0.1}`} stroke="#00000022" strokeWidth="1" fill="none" />
      </g>
    );
  };

  const renderNose = () => {
    if (noseStyle === "button") {
      return (
        <g stroke={hexToRgba(OUTLINE, 0.55)} fill="none">
          <path d={`M${centerX - 3} ${face.noseY + 4} C${centerX - 1} ${face.noseY + 7} ${centerX + 1} ${face.noseY + 7} ${centerX + 3} ${face.noseY + 4}`} strokeWidth="1.6" />
          <path d={`M${centerX} ${face.noseY - 5} C${centerX - 1} ${face.noseY - 1} ${centerX - 1} ${face.noseY + 2} ${centerX} ${face.noseY + 4}`} strokeWidth="1.4" />
        </g>
      );
    }

    if (noseStyle === "bridge") {
      return (
        <g stroke={hexToRgba(OUTLINE, 0.55)} fill="none">
          <path d={`M${centerX} ${face.noseY - 6} C${centerX - 1} ${face.noseY} ${centerX - 2} ${face.noseY + 4} ${centerX} ${face.noseY + 7}`} strokeWidth="1.6" />
          <path d={`M${centerX - 3} ${face.noseY + 7} C${centerX - 1} ${face.noseY + 8.5} ${centerX + 1} ${face.noseY + 8.5} ${centerX + 3} ${face.noseY + 7}`} strokeWidth="1.2" />
        </g>
      );
    }

    return (
      <g stroke={hexToRgba(OUTLINE, 0.55)} fill="none">
        <path d={`M${centerX} ${face.noseY - 6} C${centerX} ${face.noseY} ${centerX - 3} ${face.noseY + 4} ${centerX - 5} ${face.noseY + 6}`} strokeWidth="1.6" />
        <path d={`M${centerX - 1} ${face.noseY + 6} C${centerX + 1} ${face.noseY + 7} ${centerX + 3} ${face.noseY + 7} ${centerX + 5} ${face.noseY + 6}`} strokeWidth="1.1" opacity="0.7" />
      </g>
    );
  };

  const renderMouth = () => {
    if (expression === "smile") {
      return <path d={`M${centerX - 14} ${face.mouthY} C${centerX - 8} ${face.mouthY + 9} ${centerX + 8} ${face.mouthY + 9} ${centerX + 14} ${face.mouthY}`} stroke={skin.lip} strokeWidth="2.5" fill="none" />;
    }

    if (expression === "grin") {
      return (
        <path
          d={`M${centerX - 14} ${face.mouthY - 1} C${centerX - 8} ${face.mouthY + 8} ${centerX + 8} ${face.mouthY + 8} ${centerX + 14} ${face.mouthY - 1} C${centerX + 8} ${face.mouthY + 4} ${centerX - 8} ${face.mouthY + 4} ${centerX - 14} ${face.mouthY - 1} Z`}
          fill="#f6f7fa"
          stroke={skin.lip}
          strokeWidth="1.8"
        />
      );
    }

    if (expression === "serious") {
      return <path d={`M${centerX - 12} ${face.mouthY + 2} C${centerX - 4} ${face.mouthY - 2} ${centerX + 4} ${face.mouthY - 2} ${centerX + 12} ${face.mouthY + 2}`} stroke={skin.lip} strokeWidth="2" fill="none" />;
    }

    if (expression === "focused") {
      return <path d={`M${centerX - 11} ${face.mouthY} L${centerX + 11} ${face.mouthY}`} stroke={skin.lip} strokeWidth="2" fill="none" />;
    }

    return <path d={`M${centerX - 10} ${face.mouthY} C${centerX - 4} ${face.mouthY + 2.5} ${centerX + 4} ${face.mouthY + 2.5} ${centerX + 10} ${face.mouthY}`} stroke={skin.lip} strokeWidth="1.8" fill="none" />;
  };

  const renderBeard = () => {
    if (beardStyle === "none") return null;

    if (beardStyle === "stubble") {
      return (
        <path
          d={`M${headLeft + 14} ${face.mouthY - 2} C${centerX - 12} ${face.bottom - 4} ${centerX + 12} ${face.bottom - 4} ${headRight - 14} ${face.mouthY - 2}`}
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
          d={`M${centerX - 13} ${face.mouthY - 9} C${centerX - 8} ${face.mouthY - 12} ${centerX - 2} ${face.mouthY - 11} ${centerX} ${face.mouthY - 9} C${centerX + 2} ${face.mouthY - 11} ${centerX + 8} ${face.mouthY - 12} ${centerX + 13} ${face.mouthY - 9}`}
          stroke={hair.base}
          strokeWidth="2.6"
          fill="none"
        />
      );
    }

    return (
      <g>
        <path
          d={`M${centerX - 12} ${face.mouthY - 9} C${centerX - 8} ${face.mouthY - 12} ${centerX - 2} ${face.mouthY - 11} ${centerX} ${face.mouthY - 9} C${centerX + 2} ${face.mouthY - 11} ${centerX + 8} ${face.mouthY - 12} ${centerX + 12} ${face.mouthY - 9}`}
          stroke={hair.base}
          strokeWidth="2.3"
          fill="none"
        />
        <path
          d={`M${centerX - 8} ${face.mouthY + 4} C${centerX - 5} ${face.mouthY + 13} ${centerX + 5} ${face.mouthY + 13} ${centerX + 8} ${face.mouthY + 4}`}
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
        <rect x={face.leftEyeX - 10} y={face.eyeY - 7} width="20" height="13" rx="4" strokeWidth="1.5" />
        <rect x={face.rightEyeX - 10} y={face.eyeY - 7} width="20" height="13" rx="4" strokeWidth="1.5" />
        <path d={`M${face.leftEyeX + 10} ${face.eyeY - 1} L${face.rightEyeX - 10} ${face.eyeY - 1}`} strokeWidth="1.2" />
        <path d={`M${face.leftEyeX - 10} ${face.eyeY - 4} L${face.leftEyeX - 15} ${face.eyeY - 6}`} strokeWidth="1.1" />
        <path d={`M${face.rightEyeX + 10} ${face.eyeY - 4} L${face.rightEyeX + 15} ${face.eyeY - 6}`} strokeWidth="1.1" />
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
        <ellipse cx={centerX + 11} cy={face.noseY + 2} rx="14" ry="23" fill={hexToRgba(skin.shadow, 0.18)} />
        <ellipse cx={centerX - 8} cy={face.top + 19} rx="12" ry="6" fill="#ffffff14" />

        <ellipse cx={face.leftEyeX - 5} cy={face.cheekY} rx="8.5" ry="5.5" fill={hexToRgba(skin.blush, expression === "smile" || expression === "grin" ? 0.28 : 0.18)} />
        <ellipse cx={face.rightEyeX + 5} cy={face.cheekY} rx="8.5" ry="5.5" fill={hexToRgba(skin.blush, expression === "smile" || expression === "grin" ? 0.28 : 0.18)} />

        {renderFrontHair()}

        {headband && (
          <rect
            x={headLeft + 9}
            y={face.browY - 8}
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
            <circle cx={face.leftEyeX - 6} cy={face.cheekY - 3} r="1" />
            <circle cx={face.leftEyeX - 2} cy={face.cheekY} r="0.9" />
            <circle cx={face.leftEyeX + 2} cy={face.cheekY - 4} r="0.8" />
            <circle cx={face.rightEyeX - 2} cy={face.cheekY - 4} r="0.8" />
            <circle cx={face.rightEyeX + 2} cy={face.cheekY} r="0.9" />
            <circle cx={face.rightEyeX + 6} cy={face.cheekY - 3} r="1" />
          </g>
        )}

        {mole && <circle cx={face.rightEyeX + 7} cy={face.mouthY - 4} r="1.3" fill={hexToRgba(skin.lip, 0.85)} />}

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
