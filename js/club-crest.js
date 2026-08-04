/** Stable, offline SVG club crests derived from existing club identity data. */

const CREST_SHAPES = new Set(["circle", "shield", "diamond", "hexagon", "striped-shield"]);
const CREST_SYMBOLS = new Set(["peak", "river", "star", "tower", "tree", "wing"]);
const CREST_PATTERNS = new Set(["solid", "stripes", "halves", "sash", "hoops"]);
const uriCache = new Map();

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || min));
}

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function color(value, fallback) {
  const normalized = String(value || "").trim();
  return /^#[0-9a-f]{6}$/i.test(normalized) ? normalized.toLowerCase() : fallback;
}

function stableHash(value) {
  let hash = 2166136261;
  for (const char of String(value || "")) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mixHex(from, to, weight) {
  const a = color(from, "#334155").slice(1);
  const b = color(to, "#ffffff").slice(1);
  const amount = clamp(weight, 0, 1);
  const parts = [0, 2, 4].map((offset) => {
    const start = parseInt(a.slice(offset, offset + 2), 16);
    const end = parseInt(b.slice(offset, offset + 2), 16);
    return Math.round(start + (end - start) * amount).toString(16).padStart(2, "0");
  });
  return `#${parts.join("")}`;
}

function contrastColor(hex) {
  const value = color(hex, "#334155").slice(1);
  const rgb = [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16));
  const luminance = (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000;
  return luminance > 150 ? "#111827" : "#f8fafc";
}

function normalizedCrest(club) {
  const raw = club?.crest || club?.branding?.crest || {};
  const primary = color(raw.primary || club?.colors?.primary || club?.kit?.primary, "#1d4ed8");
  const secondary = color(raw.secondary || club?.colors?.secondary || club?.kit?.secondary, "#f8fafc");
  const accent = color(club?.colors?.accent, mixHex(secondary, primary, 0.35));
  const shape = CREST_SHAPES.has(raw.shape) ? raw.shape : "shield";
  const symbol = CREST_SYMBOLS.has(raw.symbol) ? raw.symbol : "star";
  const pattern = CREST_PATTERNS.has(club?.kit?.style) ? club.kit.style : "solid";
  const monogram = String(raw.monogram || club?.shortName || club?.shortCode || club?.id || "FC")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase()
    .slice(0, 4) || "FC";
  return { shape, symbol, pattern, primary, secondary, accent, monogram };
}

function shapePath(shape) {
  if (shape === "circle") return "M32 3A29 29 0 1 1 32 61A29 29 0 1 1 32 3Z";
  if (shape === "diamond") return "M32 3L59 25L50 54L32 61L14 54L5 25Z";
  if (shape === "hexagon") return "M17 4H47L60 18V44L47 60H17L4 44V18Z";
  return "M7 6H57V30C57 45 47 56 32 61C17 56 7 45 7 30Z";
}

function patternMarkup(pattern, primary, secondary) {
  if (pattern === "stripes") {
    return `<rect width="64" height="64" fill="${primary}"/><path d="M8 0H18V64H8ZM28 0H38V64H28ZM48 0H58V64H48Z" fill="${secondary}"/>`;
  }
  if (pattern === "halves") {
    return `<rect width="32" height="64" fill="${primary}"/><rect x="32" width="32" height="64" fill="${secondary}"/>`;
  }
  if (pattern === "sash") {
    return `<rect width="64" height="64" fill="${primary}"/><path d="M-8 7L4-5L72 57L60 69Z" fill="${secondary}"/>`;
  }
  if (pattern === "hoops") {
    return `<rect width="64" height="64" fill="${primary}"/><path d="M0 11H64V20H0ZM0 29H64V38H0ZM0 47H64V56H0Z" fill="${secondary}"/>`;
  }
  return `<rect width="64" height="64" fill="${primary}"/><path d="M7 6H57V16H7Z" fill="${secondary}" opacity="0.9"/>`;
}

function symbolMarkup(symbol, fill, stroke) {
  if (symbol === "peak") {
    return `<path d="M15 38L27 18L33 28L39 16L51 38Z" fill="${fill}" stroke="${stroke}" stroke-width="2" stroke-linejoin="round"/><path d="M23 31L27 24L31 31L39 22L44 31Z" fill="${stroke}" opacity="0.78"/>`;
  }
  if (symbol === "river") {
    return `<path d="M15 22C23 17 28 27 36 22C43 18 47 20 51 23M13 30C22 24 29 35 38 29C44 25 49 28 52 30M15 38C23 33 29 42 37 37C44 33 48 35 51 38" fill="none" stroke="${fill}" stroke-width="4" stroke-linecap="round"/>`;
  }
  if (symbol === "tower") {
    return `<path d="M18 39V21H23V16H28V21H36V16H41V21H46V39H39V29H25V39ZM28 24H33V29H28ZM36 24H41V29H36Z" fill="${fill}" stroke="${stroke}" stroke-width="1.8" stroke-linejoin="round"/>`;
  }
  if (symbol === "tree") {
    return `<path d="M29 40H36L35 33H42L37 26H41L32 15L23 26H27L22 33H30Z" fill="${fill}" stroke="${stroke}" stroke-width="1.8" stroke-linejoin="round"/><path d="M30 32H35V42H30Z" fill="${stroke}"/>`;
  }
  if (symbol === "wing") {
    return `<path d="M14 34C26 14 42 15 52 19C42 21 33 26 27 34C34 29 42 27 49 28C40 31 34 36 29 42C26 37 21 35 14 34Z" fill="${fill}" stroke="${stroke}" stroke-width="1.8" stroke-linejoin="round"/><path d="M22 34C29 25 37 21 47 19" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round"/>`;
  }
  return `<path d="M32 14L36.7 24.2L48 25.3L39.6 33L42 44L32 38.3L22 44L24.4 33L16 25.3L27.3 24.2Z" fill="${fill}" stroke="${stroke}" stroke-width="2" stroke-linejoin="round"/>`;
}

export function crestVisualSignature(club) {
  const crest = normalizedCrest(club);
  return [
    crest.shape,
    crest.symbol,
    crest.pattern,
    crest.primary,
    crest.secondary,
    crest.accent,
    crest.monogram,
  ].join("|");
}

export function clubCrestSvg(club) {
  const crest = normalizedCrest(club);
  const signature = crestVisualSignature(club);
  const id = `crest_${stableHash(signature).toString(36)}`;
  const path = shapePath(crest.shape);
  const outline = mixHex(crest.primary, "#020617", 0.72);
  const medallion = mixHex(crest.accent, "#ffffff", 0.1);
  const symbolInk = contrastColor(medallion);
  const ribbon = mixHex(crest.primary, "#020617", 0.62);
  const pattern = crest.shape === "striped-shield" ? "stripes" : crest.pattern;
  const fontSize = crest.monogram.length >= 4 ? 9 : crest.monogram.length === 3 ? 10.5 : 12;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs><clipPath id="${id}"><path d="${path}"/></clipPath></defs>
  <path d="${path}" fill="${crest.secondary}" stroke="${outline}" stroke-width="4" stroke-linejoin="round"/>
  <g clip-path="url(#${id})">${patternMarkup(pattern, crest.primary, crest.secondary)}</g>
  <path d="${path}" fill="none" stroke="${mixHex(crest.secondary, "#ffffff", 0.45)}" stroke-width="1.25" stroke-linejoin="round" opacity="0.85"/>
  <circle cx="32" cy="29" r="16" fill="${medallion}" stroke="${outline}" stroke-width="2" opacity="0.96"/>
  <g>${symbolMarkup(crest.symbol, symbolInk, outline)}</g>
  <path d="M10 43H54L51 56H13Z" fill="${ribbon}" stroke="${outline}" stroke-width="1.5" stroke-linejoin="round"/>
  <text x="32" y="52.5" text-anchor="middle" fill="#f8fafc" font-family="Arial,sans-serif" font-size="${fontSize}" font-weight="800" letter-spacing="0">${escapeXml(crest.monogram)}</text>
</svg>`;
}

export function clubCrestDataUri(club) {
  const signature = crestVisualSignature(club);
  if (!uriCache.has(signature)) {
    uriCache.set(signature, `data:image/svg+xml;charset=utf-8,${encodeURIComponent(clubCrestSvg(club))}`);
  }
  return uriCache.get(signature);
}

export function clubCrestHtml(
  club,
  { size = 20, className = "", decorative = true, label = "", lazy = false } = {}
) {
  if (!club) return "";
  const px = Math.round(clamp(size, 16, 128));
  const classes = `club-crest ${String(className || "").replace(/[^A-Za-z0-9_-]/g, " ").trim()}`.trim();
  const name = label || club.nameEn || club.nameZh || club.name || club.shortName || "Club";
  const accessibility = decorative
    ? 'alt="" aria-hidden="true"'
    : `alt="${escapeXml(name)}"`;
  return `<img class="${escapeXml(classes)}" src="${clubCrestDataUri(club)}" width="${px}" height="${px}" ${accessibility} draggable="false" decoding="async"${lazy ? ' loading="lazy"' : ""}/>`;
}
