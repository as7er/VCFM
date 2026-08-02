/** Shared, deterministic appearance data for player creation and avatar rendering. */

export const APPEARANCE_SKIN_TONES = Object.freeze([
  "pale", "fair", "light", "tan", "olive", "brown", "deep", "dark",
]);

export const APPEARANCE_HAIR_COLORS = Object.freeze([
  "black", "dkbrown", "brown", "ltbrown", "blond", "red", "grey", "white",
]);

export const APPEARANCE_HAIR_STYLE_IDS = Object.freeze([
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13,
]);

export const APPEARANCE_HAIR_STYLE_NAMES = Object.freeze({
  0: "flat",
  1: "pompadour",
  2: "spiky",
  3: "buzz",
  4: "sidepart",
  5: "bowl",
  6: "afro",
  7: "curl",
  8: "fade",
  9: "long",
  10: "mohawk",
  11: "mullet",
  12: "headband",
  13: "topknot",
});

export const APPEARANCE_STYLE_DEFAULT = Object.freeze([
  [2, 14], [4, 14], [3, 12], [0, 11], [7, 9], [1, 9],
  [9, 7], [5, 6], [12, 6], [10, 5], [11, 4], [8, 4], [13, 3], [6, 2],
]);

export const APPEARANCE_STYLE_EASIA = Object.freeze([
  [5, 16], [4, 15], [2, 14], [1, 12], [3, 11], [0, 9],
  [13, 7], [12, 6], [9, 5], [7, 4], [10, 2],
]);

export const APPEARANCE_STYLE_AFRO = Object.freeze([
  [3, 20], [7, 18], [6, 14], [8, 14], [0, 10], [2, 8], [12, 8], [10, 5], [13, 3],
]);

export const APPEARANCE_REGION_OF = Object.freeze({
  ENG: "brit", SCO: "brit", WAL: "brit", IRL: "brit",
  GER: "weur", NED: "weur", BEL: "weur", AUT: "weur", SUI: "weur",
  FRA: "fra",
  ESP: "seur", ITA: "seur", POR: "seur", CRO: "seur", SRB: "seur",
  POL: "eeur", UKR: "eeur",
  DEN: "nordic", SWE: "nordic", NOR: "nordic",
  TUR: "tur",
  JPN: "easia", KOR: "easia", CHN: "easia",
  NGA: "wafr", SEN: "wafr", GHA: "wafr", CIV: "wafr",
  MAR: "nafr",
  BRA: "latM", COL: "latM",
  ARG: "latE", URU: "latE",
  MEX: "mex",
  USA: "usa",
  AUS: "aus",
});

// Nationality is a demographic prior, not a one-to-one visual identity. Each
// profile deliberately retains overlap with neighbouring and diaspora groups.
export const APPEARANCE_REGION_PROFILES = Object.freeze({
  nordic: {
    skin: [["pale", 55], ["fair", 30], ["light", 9], ["brown", 3], ["deep", 3]],
    hair: [["blond", 38], ["ltbrown", 25], ["brown", 20], ["red", 9], ["black", 8]],
  },
  brit: {
    skin: [["pale", 38], ["fair", 30], ["light", 13], ["tan", 5], ["brown", 8], ["deep", 6]],
    hair: [["brown", 33], ["dkbrown", 25], ["ltbrown", 14], ["blond", 10], ["red", 12], ["black", 6]],
  },
  weur: {
    skin: [["fair", 36], ["pale", 22], ["light", 17], ["tan", 8], ["brown", 10], ["deep", 7]],
    hair: [["dkbrown", 30], ["brown", 27], ["black", 15], ["blond", 15], ["ltbrown", 9], ["red", 4]],
  },
  fra: {
    skin: [["fair", 28], ["light", 18], ["tan", 12], ["olive", 8], ["brown", 17], ["deep", 13], ["dark", 4]],
    hair: [["black", 34], ["dkbrown", 30], ["brown", 21], ["blond", 8], ["ltbrown", 7]],
  },
  seur: {
    skin: [["light", 30], ["fair", 22], ["tan", 25], ["olive", 15], ["brown", 5], ["deep", 3]],
    hair: [["black", 44], ["dkbrown", 31], ["brown", 18], ["blond", 4], ["ltbrown", 3]],
  },
  eeur: {
    skin: [["pale", 35], ["fair", 35], ["light", 20], ["tan", 6], ["brown", 4]],
    hair: [["brown", 27], ["dkbrown", 25], ["blond", 20], ["ltbrown", 15], ["black", 11], ["red", 2]],
  },
  tur: {
    skin: [["tan", 32], ["olive", 27], ["light", 22], ["fair", 10], ["brown", 9]],
    hair: [["black", 62], ["dkbrown", 28], ["brown", 10]],
  },
  easia: {
    skin: [["light", 38], ["fair", 30], ["tan", 22], ["pale", 10]],
    hair: [["black", 82], ["dkbrown", 15], ["brown", 3]],
    style: APPEARANCE_STYLE_EASIA,
  },
  wafr: {
    skin: [["deep", 34], ["dark", 30], ["brown", 26], ["tan", 8], ["olive", 2]],
    hair: [["black", 85], ["dkbrown", 15]],
    style: APPEARANCE_STYLE_AFRO,
  },
  nafr: {
    skin: [["tan", 30], ["olive", 26], ["light", 20], ["brown", 16], ["deep", 6], ["fair", 2]],
    hair: [["black", 70], ["dkbrown", 24], ["brown", 6]],
  },
  latM: {
    skin: [["tan", 22], ["light", 20], ["fair", 12], ["olive", 14], ["brown", 16], ["deep", 12], ["dark", 4]],
    hair: [["black", 50], ["dkbrown", 30], ["brown", 14], ["blond", 4], ["ltbrown", 2]],
  },
  latE: {
    skin: [["fair", 30], ["light", 28], ["tan", 20], ["olive", 10], ["brown", 8], ["deep", 4]],
    hair: [["dkbrown", 32], ["black", 30], ["brown", 22], ["blond", 10], ["ltbrown", 6]],
  },
  mex: {
    skin: [["tan", 32], ["olive", 24], ["brown", 18], ["light", 16], ["fair", 6], ["deep", 4]],
    hair: [["black", 68], ["dkbrown", 24], ["brown", 8]],
  },
  usa: {
    skin: [["fair", 26], ["light", 18], ["pale", 12], ["tan", 10], ["brown", 16], ["deep", 14], ["dark", 4]],
    hair: [["dkbrown", 28], ["brown", 24], ["black", 26], ["blond", 14], ["red", 4], ["ltbrown", 4]],
  },
  aus: {
    skin: [["fair", 34], ["pale", 24], ["light", 18], ["tan", 10], ["brown", 8], ["deep", 6]],
    hair: [["brown", 30], ["dkbrown", 24], ["blond", 22], ["ltbrown", 12], ["black", 8], ["red", 4]],
  },
});

export function appearanceHash(value) {
  let hash = 2166136261;
  for (const char of String(value || "x")) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function appearanceWpick(hash, salt, pairs) {
  let total = 0;
  for (const [, weight] of pairs) total += weight;
  let roll = ((hash ^ Math.imul(salt + 1, 2654435761)) >>> 0) % Math.max(1, total);
  for (const [value, weight] of pairs) {
    if ((roll -= weight) < 0) return value;
  }
  return pairs[0][0];
}

export function normalizeHairStyleId(value) {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    const id = Math.round(value);
    return APPEARANCE_HAIR_STYLE_IDS.includes(id) ? id : null;
  }
  const key = String(value).toLowerCase();
  if (/^\d+$/.test(key)) {
    const id = Number(key);
    return APPEARANCE_HAIR_STYLE_IDS.includes(id) ? id : null;
  }
  const aliases = {
    flat: 0, flat_top: 0, flattop: 0, kunio: 0,
    pompadour: 1, rizzento: 1,
    spiky: 2, spike: 2, messy: 2,
    buzz: 3, short: 3, crop: 3,
    sidepart: 4, side: 4, part: 4,
    bowl: 5, bowlcut: 5,
    afro: 6, explosion: 6,
    curl: 7, curly: 7,
    fade: 8, bald_fade: 8,
    long: 9, longhair: 9,
    mohawk: 10, punk: 10,
    mullet: 11,
    headband: 12, band: 12,
    topknot: 13, bun: 13, knot: 13,
  };
  return aliases[key] ?? null;
}

export function normalizeSkinTone(value) {
  if (value == null || value === "") return null;
  const key = String(value).toLowerCase();
  return APPEARANCE_SKIN_TONES.includes(key) ? key : null;
}

export function normalizeHairColor(value) {
  if (value == null || value === "") return null;
  const key = String(value).toLowerCase();
  const aliases = {
    darkbrown: "dkbrown",
    dark_brown: "dkbrown",
    lightbrown: "ltbrown",
    light_brown: "ltbrown",
    blonde: "blond",
    gray: "grey",
  };
  const normalized = aliases[key] || key;
  return APPEARANCE_HAIR_COLORS.includes(normalized) ? normalized : null;
}

export function generatePlayerAppearance(player = {}, opts = {}) {
  const nation = player.nationality || player.nation || opts.nation || "ENG";
  const age = Number(player.age ?? opts.age ?? 25) || 25;
  const seedBase =
    player.appearanceSeed != null && player.appearanceSeed !== ""
      ? String(player.appearanceSeed)
      : player.id != null && player.id !== ""
        ? String(player.id)
        : player.name != null && player.name !== ""
          ? String(player.name)
          : `look:${nation}:${age}`;
  const hash = appearanceHash(`look:${seedBase}`);
  const region = APPEARANCE_REGION_OF[String(nation).toUpperCase()] || "weur";
  const profile = APPEARANCE_REGION_PROFILES[region] || APPEARANCE_REGION_PROFILES.weur;
  const skinTone = normalizeSkinTone(player.skinTone) || appearanceWpick(hash, 11, profile.skin);
  const darkSkin = skinTone === "deep" || skinTone === "dark";
  let hairColor =
    normalizeHairColor(player.hairColor) ||
    (darkSkin
      ? appearanceWpick(hash, 12, [["black", 80], ["dkbrown", 20]])
      : appearanceWpick(hash, 12, profile.hair));
  if (age >= 40 && !normalizeHairColor(player.hairColor)) {
    hairColor = appearanceWpick(hash, 13, [["grey", 55], ["white", 25], [hairColor, 20]]);
  } else if (age >= 34 && (hash & 3) === 0 && !normalizeHairColor(player.hairColor)) {
    hairColor = "grey";
  }
  const styleWeights = darkSkin
    ? APPEARANCE_STYLE_AFRO
    : profile.style || APPEARANCE_STYLE_DEFAULT;
  let hairStyle = normalizeHairStyleId(player.hairStyle);
  if (hairStyle == null) hairStyle = appearanceWpick(hash, 14, styleWeights);
  return {
    appearanceSeed: seedBase,
    skinTone,
    hairColor,
    hairStyle,
    hairStyleName: APPEARANCE_HAIR_STYLE_NAMES[hairStyle] || "spiky",
    region,
  };
}
