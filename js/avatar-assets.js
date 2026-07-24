/**
 * 本地球员头像资产管线（正式 PNG/WebP 肖像）
 *
 * 职责：manifest 加载、稳定映射 resolvePlayerAvatar、相对路径（GitHub Pages 友好）。
 * 不生成 SVG/Canvas 人物；程序生成 fallback 仍由 avatar.js 负责。
 *
 * assignment:
 * - explicit（推荐，池不足时）：仅 avatarAssetId 绑定；其余走程序生成脸
 * - hash：池内稳定取模（易撞脸，不推荐）
 * - match：仅对 matchable!==false 的条目按年龄/地区/肤色/球衣打分
 *
 * 重要：source=variant-recolor 的“换肤克隆”必须 matchable:false，禁止自动分配。
 * 同队球衣色由渲染层强制 kit recolor，不依赖资产文件里的默认球衣色。
 *
 * 本文件可由 scripts/build-avatar-assets-module.mjs 从 manifest 重新生成内置副本。
 */

const MANIFEST_REL = "assets/player-avatars/manifest.json";

/** @type {import('./avatar-assets-types').AvatarManifest} */
const BUILTIN_MANIFEST = {
  "version": 7,
  "assignment": "match",
  "minDisplayPx": 64,
  "minMatchScore": 0,
  "poolPolicy": "face-centric-new-style-0005-0027",
  "notes": "New-style masters 0005-0027 face-centric normalized (eye-line/face-width/headroom). Old 0001-0004 removed.",
  "minAutoPool": 6,
  "avatars": [
    {
      "id": "avatar-0005",
      "portrait": "portraits/avatar-0005.png",
      "portraitPng": "portraits/avatar-0005.png",
      "thumbnail": "thumbnails/avatar-0005.png",
      "master": "portraits/avatar-0005.png",
      "width": 512,
      "height": 512,
      "masterWidth": 1024,
      "masterHeight": 1024,
      "ageMin": 20,
      "ageMax": 27,
      "ageBand": "young_adult",
      "skinTone": "olive",
      "hairColor": "ltbrown",
      "hairStyle": "fade",
      "regions": [
        "seur",
        "tur",
        "nafr",
        "latM"
      ],
      "kitPrimary": "#345151",
      "kitSecondary": "#0f172a",
      "notes": "face-centric normalize v1; eye-line + face-width; keep hair character",
      "source": "master",
      "matchable": true
    },
    {
      "id": "avatar-0006",
      "portrait": "portraits/avatar-0006.png",
      "portraitPng": "portraits/avatar-0006.png",
      "thumbnail": "thumbnails/avatar-0006.png",
      "master": "portraits/avatar-0006.png",
      "width": 512,
      "height": 512,
      "masterWidth": 1024,
      "masterHeight": 1024,
      "ageMin": 25,
      "ageMax": 33,
      "ageBand": "prime",
      "skinTone": "pale",
      "hairColor": "ltbrown",
      "hairStyle": "bowl",
      "regions": [
        "nordic",
        "brit",
        "eeur",
        "weur"
      ],
      "kitPrimary": "#AA96AB",
      "kitSecondary": "#0f172a",
      "notes": "face-centric normalize v1; eye-line + face-width; keep hair character",
      "source": "master",
      "matchable": true
    },
    {
      "id": "avatar-0007",
      "portrait": "portraits/avatar-0007.png",
      "portraitPng": "portraits/avatar-0007.png",
      "thumbnail": "thumbnails/avatar-0007.png",
      "master": "portraits/avatar-0007.png",
      "width": 512,
      "height": 512,
      "masterWidth": 1024,
      "masterHeight": 1024,
      "ageMin": 32,
      "ageMax": 40,
      "ageBand": "veteran",
      "skinTone": "light",
      "hairColor": "grey",
      "hairStyle": "sidepart",
      "regions": [
        "easia",
        "weur",
        "fra",
        "seur",
        "usa"
      ],
      "kitPrimary": "#558D64",
      "kitSecondary": "#0f172a",
      "notes": "face-centric normalize v1; eye-line + face-width; keep hair character",
      "source": "master",
      "matchable": true
    },
    {
      "id": "avatar-0008",
      "portrait": "portraits/avatar-0008.png",
      "portraitPng": "portraits/avatar-0008.png",
      "thumbnail": "thumbnails/avatar-0008.png",
      "master": "portraits/avatar-0008.png",
      "width": 512,
      "height": 512,
      "masterWidth": 1024,
      "masterHeight": 1024,
      "ageMin": 17,
      "ageMax": 21,
      "ageBand": "youth",
      "skinTone": "fair",
      "hairColor": "red",
      "hairStyle": "flat",
      "regions": [
        "brit",
        "weur",
        "fra",
        "usa",
        "aus"
      ],
      "kitPrimary": "#4E88BF",
      "kitSecondary": "#0f172a",
      "notes": "face-centric normalize v1; eye-line + face-width; keep hair character",
      "source": "master",
      "matchable": true
    },
    {
      "id": "avatar-0009",
      "portrait": "portraits/avatar-0009.png",
      "portraitPng": "portraits/avatar-0009.png",
      "thumbnail": "thumbnails/avatar-0009.png",
      "master": "portraits/avatar-0009.png",
      "width": 512,
      "height": 512,
      "masterWidth": 1024,
      "masterHeight": 1024,
      "ageMin": 20,
      "ageMax": 27,
      "ageBand": "young_adult",
      "skinTone": "light",
      "hairColor": "ltbrown",
      "hairStyle": "messy",
      "regions": [
        "easia",
        "weur",
        "fra",
        "seur",
        "usa"
      ],
      "kitPrimary": "#CA6C65",
      "kitSecondary": "#0f172a",
      "notes": "face-centric normalize v1; eye-line + face-width; keep hair character",
      "source": "master",
      "matchable": true
    },
    {
      "id": "avatar-0010",
      "portrait": "portraits/avatar-0010.png",
      "portraitPng": "portraits/avatar-0010.png",
      "thumbnail": "thumbnails/avatar-0010.png",
      "master": "portraits/avatar-0010.png",
      "width": 512,
      "height": 512,
      "masterWidth": 1024,
      "masterHeight": 1024,
      "ageMin": 25,
      "ageMax": 33,
      "ageBand": "prime",
      "skinTone": "fair",
      "hairColor": "ltbrown",
      "hairStyle": "spiky",
      "regions": [
        "brit",
        "weur",
        "fra",
        "usa",
        "aus"
      ],
      "kitPrimary": "#30AE92",
      "kitSecondary": "#0f172a",
      "notes": "face-centric normalize v1; eye-line + face-width; keep hair character",
      "source": "master",
      "matchable": true
    },
    {
      "id": "avatar-0011",
      "portrait": "portraits/avatar-0011.png",
      "portraitPng": "portraits/avatar-0011.png",
      "thumbnail": "thumbnails/avatar-0011.png",
      "master": "portraits/avatar-0011.png",
      "width": 512,
      "height": 512,
      "masterWidth": 1024,
      "masterHeight": 1024,
      "ageMin": 32,
      "ageMax": 40,
      "ageBand": "veteran",
      "skinTone": "pale",
      "hairColor": "black",
      "hairStyle": "pompadour",
      "regions": [
        "nordic",
        "brit",
        "eeur",
        "weur"
      ],
      "kitPrimary": "#3A80CB",
      "kitSecondary": "#0f172a",
      "notes": "face-centric normalize v1; eye-line + face-width; keep hair character",
      "source": "master",
      "matchable": true
    },
    {
      "id": "avatar-0012",
      "portrait": "portraits/avatar-0012.png",
      "portraitPng": "portraits/avatar-0012.png",
      "thumbnail": "thumbnails/avatar-0012.png",
      "master": "portraits/avatar-0012.png",
      "width": 512,
      "height": 512,
      "masterWidth": 1024,
      "masterHeight": 1024,
      "ageMin": 17,
      "ageMax": 21,
      "ageBand": "youth",
      "skinTone": "brown",
      "hairColor": "white",
      "hairStyle": "buzz",
      "regions": [
        "latM",
        "wafr",
        "usa",
        "fra",
        "nafr"
      ],
      "kitPrimary": "#827357",
      "kitSecondary": "#0f172a",
      "notes": "face-centric normalize v1; eye-line + face-width; keep hair character",
      "source": "master",
      "matchable": true
    },
    {
      "id": "avatar-0013",
      "portrait": "portraits/avatar-0013.png",
      "portraitPng": "portraits/avatar-0013.png",
      "thumbnail": "thumbnails/avatar-0013.png",
      "master": "portraits/avatar-0013.png",
      "width": 512,
      "height": 512,
      "masterWidth": 1024,
      "masterHeight": 1024,
      "ageMin": 20,
      "ageMax": 27,
      "ageBand": "young_adult",
      "skinTone": "pale",
      "hairColor": "brown",
      "hairStyle": "sidepart",
      "regions": [
        "nordic",
        "brit",
        "eeur",
        "weur"
      ],
      "kitPrimary": "#9F9E5C",
      "kitSecondary": "#0f172a",
      "notes": "face-centric normalize v1; eye-line + face-width; keep hair character",
      "source": "master",
      "matchable": true
    },
    {
      "id": "avatar-0014",
      "portrait": "portraits/avatar-0014.png",
      "portraitPng": "portraits/avatar-0014.png",
      "thumbnail": "thumbnails/avatar-0014.png",
      "master": "portraits/avatar-0014.png",
      "width": 512,
      "height": 512,
      "masterWidth": 1024,
      "masterHeight": 1024,
      "ageMin": 25,
      "ageMax": 33,
      "ageBand": "prime",
      "skinTone": "fair",
      "hairColor": "red",
      "hairStyle": "pompadour",
      "regions": [
        "brit",
        "weur",
        "fra",
        "usa",
        "aus"
      ],
      "kitPrimary": "#CB3B38",
      "kitSecondary": "#0f172a",
      "notes": "face-centric normalize v1; eye-line + face-width; keep hair character",
      "source": "master",
      "matchable": true
    },
    {
      "id": "avatar-0015",
      "portrait": "portraits/avatar-0015.png",
      "portraitPng": "portraits/avatar-0015.png",
      "thumbnail": "thumbnails/avatar-0015.png",
      "master": "portraits/avatar-0015.png",
      "width": 512,
      "height": 512,
      "masterWidth": 1024,
      "masterHeight": 1024,
      "ageMin": 32,
      "ageMax": 40,
      "ageBand": "veteran",
      "skinTone": "pale",
      "hairColor": "white",
      "hairStyle": "messy",
      "regions": [
        "nordic",
        "brit",
        "eeur",
        "weur"
      ],
      "kitPrimary": "#69B7EC",
      "kitSecondary": "#0f172a",
      "notes": "face-centric normalize v1; eye-line + face-width; keep hair character",
      "source": "master",
      "matchable": true
    },
    {
      "id": "avatar-0016",
      "portrait": "portraits/avatar-0016.png",
      "portraitPng": "portraits/avatar-0016.png",
      "thumbnail": "thumbnails/avatar-0016.png",
      "master": "portraits/avatar-0016.png",
      "width": 512,
      "height": 512,
      "masterWidth": 1024,
      "masterHeight": 1024,
      "ageMin": 17,
      "ageMax": 21,
      "ageBand": "youth",
      "skinTone": "fair",
      "hairColor": "red",
      "hairStyle": "curl",
      "regions": [
        "brit",
        "weur",
        "fra",
        "usa",
        "aus"
      ],
      "kitPrimary": "#7244B3",
      "kitSecondary": "#0f172a",
      "notes": "face-centric normalize v1; eye-line + face-width; keep hair character",
      "source": "master",
      "matchable": true
    },
    {
      "id": "avatar-0017",
      "portrait": "portraits/avatar-0017.png",
      "portraitPng": "portraits/avatar-0017.png",
      "thumbnail": "thumbnails/avatar-0017.png",
      "master": "portraits/avatar-0017.png",
      "width": 512,
      "height": 512,
      "masterWidth": 1024,
      "masterHeight": 1024,
      "ageMin": 20,
      "ageMax": 27,
      "ageBand": "young_adult",
      "skinTone": "pale",
      "hairColor": "white",
      "hairStyle": "pompadour",
      "regions": [
        "nordic",
        "brit",
        "eeur",
        "weur"
      ],
      "kitPrimary": "#9CB4C9",
      "kitSecondary": "#0f172a",
      "notes": "face-centric normalize v1; eye-line + face-width; keep hair character",
      "source": "master",
      "matchable": true
    },
    {
      "id": "avatar-0018",
      "portrait": "portraits/avatar-0018.png",
      "portraitPng": "portraits/avatar-0018.png",
      "thumbnail": "thumbnails/avatar-0018.png",
      "master": "portraits/avatar-0018.png",
      "width": 512,
      "height": 512,
      "masterWidth": 1024,
      "masterHeight": 1024,
      "ageMin": 25,
      "ageMax": 33,
      "ageBand": "prime",
      "skinTone": "pale",
      "hairColor": "grey",
      "hairStyle": "bowl",
      "regions": [
        "nordic",
        "brit",
        "eeur",
        "weur"
      ],
      "kitPrimary": "#2A9AC4",
      "kitSecondary": "#0f172a",
      "notes": "face-centric normalize v1; eye-line + face-width; keep hair character",
      "source": "master",
      "matchable": true
    },
    {
      "id": "avatar-0019",
      "portrait": "portraits/avatar-0019.png",
      "portraitPng": "portraits/avatar-0019.png",
      "thumbnail": "thumbnails/avatar-0019.png",
      "master": "portraits/avatar-0019.png",
      "width": 512,
      "height": 512,
      "masterWidth": 1024,
      "masterHeight": 1024,
      "ageMin": 32,
      "ageMax": 40,
      "ageBand": "veteran",
      "skinTone": "olive",
      "hairColor": "grey",
      "hairStyle": "messy",
      "regions": [
        "seur",
        "tur",
        "nafr",
        "latM"
      ],
      "kitPrimary": "#E7AB7C",
      "kitSecondary": "#0f172a",
      "notes": "face-centric normalize v1; eye-line + face-width; keep hair character",
      "source": "master",
      "matchable": true
    },
    {
      "id": "avatar-0020",
      "portrait": "portraits/avatar-0020.png",
      "portraitPng": "portraits/avatar-0020.png",
      "thumbnail": "thumbnails/avatar-0020.png",
      "master": "portraits/avatar-0020.png",
      "width": 512,
      "height": 512,
      "masterWidth": 1024,
      "masterHeight": 1024,
      "ageMin": 17,
      "ageMax": 21,
      "ageBand": "youth",
      "skinTone": "brown",
      "hairColor": "dkbrown",
      "hairStyle": "spiky",
      "regions": [
        "latM",
        "wafr",
        "usa",
        "fra",
        "nafr"
      ],
      "kitPrimary": "#745AA1",
      "kitSecondary": "#0f172a",
      "notes": "face-centric normalize v1; eye-line + face-width; keep hair character",
      "source": "master",
      "matchable": true
    },
    {
      "id": "avatar-0021",
      "portrait": "portraits/avatar-0021.png",
      "portraitPng": "portraits/avatar-0021.png",
      "thumbnail": "thumbnails/avatar-0021.png",
      "master": "portraits/avatar-0021.png",
      "width": 512,
      "height": 512,
      "masterWidth": 1024,
      "masterHeight": 1024,
      "ageMin": 20,
      "ageMax": 27,
      "ageBand": "young_adult",
      "skinTone": "fair",
      "hairColor": "white",
      "hairStyle": "sidepart",
      "regions": [
        "brit",
        "weur",
        "fra",
        "usa",
        "aus"
      ],
      "kitPrimary": "#EABDB0",
      "kitSecondary": "#0f172a",
      "notes": "face-centric normalize v1; eye-line + face-width; keep hair character",
      "source": "master",
      "matchable": true
    },
    {
      "id": "avatar-0022",
      "portrait": "portraits/avatar-0022.png",
      "portraitPng": "portraits/avatar-0022.png",
      "thumbnail": "thumbnails/avatar-0022.png",
      "master": "portraits/avatar-0022.png",
      "width": 512,
      "height": 512,
      "masterWidth": 1024,
      "masterHeight": 1024,
      "ageMin": 25,
      "ageMax": 33,
      "ageBand": "prime",
      "skinTone": "olive",
      "hairColor": "white",
      "hairStyle": "buzz",
      "regions": [
        "seur",
        "tur",
        "nafr",
        "latM"
      ],
      "kitPrimary": "#D7D6B7",
      "kitSecondary": "#0f172a",
      "notes": "face-centric normalize v1; eye-line + face-width; keep hair character",
      "source": "master",
      "matchable": true
    },
    {
      "id": "avatar-0023",
      "portrait": "portraits/avatar-0023.png",
      "portraitPng": "portraits/avatar-0023.png",
      "thumbnail": "thumbnails/avatar-0023.png",
      "master": "portraits/avatar-0023.png",
      "width": 512,
      "height": 512,
      "masterWidth": 1024,
      "masterHeight": 1024,
      "ageMin": 32,
      "ageMax": 40,
      "ageBand": "veteran",
      "skinTone": "fair",
      "hairColor": "white",
      "hairStyle": "bowl",
      "regions": [
        "brit",
        "weur",
        "fra",
        "usa",
        "aus"
      ],
      "kitPrimary": "#41937A",
      "kitSecondary": "#0f172a",
      "notes": "face-centric normalize v1; eye-line + face-width; keep hair character",
      "source": "master",
      "matchable": true
    },
    {
      "id": "avatar-0024",
      "portrait": "portraits/avatar-0024.png",
      "portraitPng": "portraits/avatar-0024.png",
      "thumbnail": "thumbnails/avatar-0024.png",
      "master": "portraits/avatar-0024.png",
      "width": 512,
      "height": 512,
      "masterWidth": 1024,
      "masterHeight": 1024,
      "ageMin": 17,
      "ageMax": 21,
      "ageBand": "youth",
      "skinTone": "fair",
      "hairColor": "ltbrown",
      "hairStyle": "pompadour",
      "regions": [
        "brit",
        "weur",
        "fra",
        "usa",
        "aus"
      ],
      "kitPrimary": "#1B9580",
      "kitSecondary": "#0f172a",
      "notes": "face-centric normalize v1; eye-line + face-width; keep hair character",
      "source": "master",
      "matchable": true
    },
    {
      "id": "avatar-0025",
      "portrait": "portraits/avatar-0025.png",
      "portraitPng": "portraits/avatar-0025.png",
      "thumbnail": "thumbnails/avatar-0025.png",
      "master": "portraits/avatar-0025.png",
      "width": 512,
      "height": 512,
      "masterWidth": 1024,
      "masterHeight": 1024,
      "ageMin": 20,
      "ageMax": 27,
      "ageBand": "young_adult",
      "skinTone": "fair",
      "hairColor": "white",
      "hairStyle": "fade",
      "regions": [
        "brit",
        "weur",
        "fra",
        "usa",
        "aus"
      ],
      "kitPrimary": "#D77B45",
      "kitSecondary": "#0f172a",
      "notes": "face-centric normalize v1; eye-line + face-width; keep hair character",
      "source": "master",
      "matchable": true
    },
    {
      "id": "avatar-0026",
      "portrait": "portraits/avatar-0026.png",
      "portraitPng": "portraits/avatar-0026.png",
      "thumbnail": "thumbnails/avatar-0026.png",
      "master": "portraits/avatar-0026.png",
      "width": 512,
      "height": 512,
      "masterWidth": 1024,
      "masterHeight": 1024,
      "ageMin": 25,
      "ageMax": 33,
      "ageBand": "prime",
      "skinTone": "brown",
      "hairColor": "black",
      "hairStyle": "curl",
      "regions": [
        "latM",
        "wafr",
        "usa",
        "fra",
        "nafr"
      ],
      "kitPrimary": "#276EC3",
      "kitSecondary": "#0f172a",
      "notes": "face-centric normalize v1; eye-line + face-width; keep hair character",
      "source": "master",
      "matchable": true
    },
    {
      "id": "avatar-0027",
      "portrait": "portraits/avatar-0027.png",
      "portraitPng": "portraits/avatar-0027.png",
      "thumbnail": "thumbnails/avatar-0027.png",
      "master": "portraits/avatar-0027.png",
      "width": 512,
      "height": 512,
      "masterWidth": 1024,
      "masterHeight": 1024,
      "ageMin": 32,
      "ageMax": 40,
      "ageBand": "veteran",
      "skinTone": "brown",
      "hairColor": "grey",
      "hairStyle": "long",
      "regions": [
        "latM",
        "wafr",
        "usa",
        "fra",
        "nafr"
      ],
      "kitPrimary": "#E0C174",
      "kitSecondary": "#0f172a",
      "notes": "face-centric normalize v1; eye-line + face-width; keep hair character",
      "source": "master",
      "matchable": true
    }
  ]
};

/** 国籍 → 地区（与 avatar.js REGION_OF 对齐） */
export const NATION_REGION = Object.freeze({
  ENG: "brit",
  SCO: "brit",
  WAL: "brit",
  IRL: "brit",
  GER: "weur",
  NED: "weur",
  BEL: "weur",
  AUT: "weur",
  SUI: "weur",
  FRA: "fra",
  ESP: "seur",
  ITA: "seur",
  POR: "seur",
  CRO: "seur",
  SRB: "seur",
  POL: "eeur",
  UKR: "eeur",
  DEN: "nordic",
  SWE: "nordic",
  NOR: "nordic",
  TUR: "tur",
  JPN: "easia",
  KOR: "easia",
  CHN: "easia",
  NGA: "wafr",
  SEN: "wafr",
  GHA: "wafr",
  CIV: "wafr",
  MAR: "nafr",
  BRA: "latM",
  COL: "latM",
  ARG: "latE",
  URU: "latE",
  MEX: "mex",
  USA: "usa",
  AUS: "aus",
});

/** 地区默认肤色偏好（打分用） */
const REGION_SKIN_PREF = Object.freeze({
  nordic: ["pale", "fair", "light"],
  brit: ["pale", "fair", "light", "tan"],
  weur: ["fair", "pale", "light"],
  fra: ["fair", "light", "tan", "brown", "deep"],
  seur: ["light", "fair", "tan", "olive"],
  eeur: ["pale", "fair", "light"],
  tur: ["tan", "olive", "light"],
  easia: ["light", "fair", "tan", "pale"],
  wafr: ["deep", "dark", "brown"],
  nafr: ["tan", "olive", "brown", "light"],
  latM: ["tan", "light", "brown", "olive", "deep"],
  latE: ["fair", "light", "tan", "olive"],
  mex: ["tan", "olive", "brown", "light"],
  usa: ["fair", "light", "brown", "deep", "pale"],
  aus: ["fair", "pale", "light", "tan"],
});

const SKIN_ORDER = ["pale", "fair", "light", "tan", "olive", "brown", "deep", "dark"];

let manifest = cloneManifest(BUILTIN_MANIFEST);
let byId = indexManifest(manifest);
/** @type {Promise<object>|null} */
let loadPromise = null;

function cloneManifest(m) {
  return JSON.parse(JSON.stringify(m));
}

function indexManifest(m) {
  const map = new Map();
  for (const a of m?.avatars || []) {
    if (a?.id) map.set(String(a.id), a);
  }
  return map;
}

export function avatarAssetUrl(rel) {
  if (!rel) return null;
  const s = String(rel);
  if (/^(https?:|data:|blob:)/i.test(s)) return s;
  if (s.startsWith("./") || s.startsWith("../") || s.startsWith("/")) return s;
  if (s.startsWith("assets/")) return s;
  return `assets/player-avatars/${s.replace(/^\/+/, "")}`;
}

export function getAvatarManifest() {
  return manifest;
}

export function getAvatarEntry(id) {
  if (!id) return null;
  return byId.get(String(id)) || null;
}

function normalizeAssignment(a) {
  if (a === "hash" || a === "explicit" || a === "match") return a;
  return "match";
}

export function setAvatarManifest(next) {
  if (!next || !Array.isArray(next.avatars)) return manifest;
  manifest = {
    version: next.version || 1,
    assignment: normalizeAssignment(next.assignment),
    minDisplayPx: next.minDisplayPx ?? 64,
    minMatchScore: next.minMatchScore ?? 0,
    poolPolicy: next.poolPolicy || "trait-score",
    avatars: next.avatars.slice(),
  };
  byId = indexManifest(manifest);
  return manifest;
}

export function loadAvatarManifest(url = MANIFEST_REL) {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    try {
      if (typeof fetch !== "function") return manifest;
      const res = await fetch(url, { cache: "no-cache" });
      if (!res.ok) return manifest;
      const data = await res.json();
      if (data && Array.isArray(data.avatars)) setAvatarManifest(data);
    } catch {
      /* keep builtin */
    }
    return manifest;
  })();
  return loadPromise;
}

export function stableAvatarHash(s) {
  let h = 2166136261;
  const str = String(s || "x");
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function readExplicitAvatarId(player) {
  if (!player || typeof player !== "object") return null;
  const raw = player.avatarAssetId ?? player.avatarId ?? player.portraitId ?? null;
  if (raw == null || raw === "") return null;
  return String(raw);
}

export function playerAppearanceKey(player) {
  if (!player || typeof player !== "object") return "anon";
  if (player.appearanceSeed != null && player.appearanceSeed !== "") {
    return String(player.appearanceSeed);
  }
  if (player.id != null && player.id !== "") return String(player.id);
  if (player.name != null && player.name !== "") return String(player.name);
  return "anon";
}

export function nationRegion(nation) {
  if (!nation) return null;
  return NATION_REGION[String(nation).toUpperCase()] || null;
}

export function ageBandOf(age) {
  const a = Number(age);
  if (!Number.isFinite(a)) return "young_adult";
  if (a <= 21) return "youth";
  if (a <= 27) return "young_adult";
  if (a <= 33) return "prime";
  return "veteran";
}

function parseHex(hex) {
  if (!hex || typeof hex !== "string") return null;
  let h = hex.trim();
  if (h.startsWith("#")) h = h.slice(1);
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (h.length !== 6 || /[^0-9a-fA-F]/.test(h)) return null;
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

/** 0..1 色差（越小越近） */
export function colorDistance(a, b) {
  const A = parseHex(a);
  const B = parseHex(b);
  if (!A || !B) return 1;
  const dr = A.r - B.r;
  const dg = A.g - B.g;
  const db = A.b - B.b;
  return Math.min(1, Math.sqrt(dr * dr + dg * dg + db * db) / 441.67);
}

function skinIndex(tone) {
  const i = SKIN_ORDER.indexOf(String(tone || "").toLowerCase());
  return i < 0 ? 2 : i;
}

/**
 * 从球员 + 可选球衣色构建匹配查询。
 * 身份键不含 club；kit 色只用于匹配/着色。
 */
const HAIR_STYLE_NAME_BY_ID = Object.freeze({
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
  flat: "flat",
  pompadour: "pompadour",
  spiky: "spiky",
  messy: "spiky",
  buzz: "buzz",
  short: "buzz",
  sidepart: "sidepart",
  side: "sidepart",
  bowl: "bowl",
  afro: "afro",
  curl: "curl",
  curly: "curl",
  fade: "fade",
  long: "long",
});

function normalizeQueryHairStyle(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number" && Number.isFinite(v)) {
    return HAIR_STYLE_NAME_BY_ID[Math.round(v)] || null;
  }
  const s = String(v).toLowerCase();
  if (/^\d+$/.test(s)) return HAIR_STYLE_NAME_BY_ID[Number(s)] || null;
  return HAIR_STYLE_NAME_BY_ID[s] || s;
}

function normalizeQueryHairColor(v) {
  if (v == null || v === "") return null;
  const s = String(v).toLowerCase();
  const alias = {
    darkbrown: "dkbrown",
    dark_brown: "dkbrown",
    lightbrown: "ltbrown",
    light_brown: "ltbrown",
    blonde: "blond",
    gray: "grey",
  };
  return alias[s] || s;
}

export function buildAvatarQuery(player, opts = {}) {
  const nation = player?.nationality || player?.nation || opts.nation || null;
  const region = nationRegion(nation) || opts.region || null;
  const age = player?.age ?? opts.age ?? 25;
  const band = ageBandOf(age);
  const key = playerAppearanceKey(player);
  const h = stableAvatarHash(`look:${key}`);
  const pref = (region && REGION_SKIN_PREF[region]) || REGION_SKIN_PREF.weur;
  // Prefer persisted player traits; hash-derived values only as fallback
  const skinTone =
    (player?.skinTone && String(player.skinTone).toLowerCase()) ||
    (opts.skinTone && String(opts.skinTone).toLowerCase()) ||
    pref[h % pref.length];
  const hairColor =
    normalizeQueryHairColor(player?.hairColor) ||
    normalizeQueryHairColor(opts.hairColor) ||
    null;
  const hairStyle =
    normalizeQueryHairStyle(player?.hairStyle) ||
    normalizeQueryHairStyle(opts.hairStyle) ||
    null;
  const kitPrimary = opts.kitPrimary || opts.kit?.primary || null;
  const kitSecondary = opts.kitSecondary || opts.kit?.secondary || null;
  return {
    key,
    age: Number(age) || 25,
    ageBand: band,
    nation,
    region,
    skinTone,
    hairColor,
    hairStyle,
    kitPrimary,
    kitSecondary,
    hash: h,
  };
}

/** 是否允许自动匹配（克隆伪变体必须 false） */
export function isMatchableEntry(entry) {
  if (!entry?.id) return false;
  if (entry.matchable === false || entry.autoAssign === false) return false;
  if (entry.source === "variant-recolor") return false;
  return true;
}

/** 资产 vs 查询打分（越高越好） */
export function scoreAvatarEntry(entry, query) {
  if (!entry || !query) return -1e9;
  if (!isMatchableEntry(entry)) return -1e9;
  let score = 0;

  const amin = entry.ageMin ?? 17;
  const amax = entry.ageMax ?? 40;
  const age = query.age;
  if (age >= amin && age <= amax) score += 40;
  else {
    const dist = age < amin ? amin - age : age - amax;
    score += Math.max(0, 40 - dist * 8);
  }
  if (entry.ageBand && entry.ageBand === query.ageBand) score += 18;

  const regs = Array.isArray(entry.regions) ? entry.regions : [];
  if (query.region && regs.includes(query.region)) score += 36;
  else if (query.region && regs.length) score -= 8;

  if (entry.skinTone && query.skinTone) {
    const d = Math.abs(skinIndex(entry.skinTone) - skinIndex(query.skinTone));
    score += Math.max(0, 28 - d * 9);
  }

  if (entry.hairColor && query.hairColor) {
    const eh = normalizeQueryHairColor(entry.hairColor);
    const qh = normalizeQueryHairColor(query.hairColor);
    if (eh && qh) score += eh === qh ? 16 : -4;
  }

  if (entry.hairStyle && query.hairStyle) {
    const eh = normalizeQueryHairStyle(entry.hairStyle);
    const qh = normalizeQueryHairStyle(query.hairStyle);
    if (eh && qh) score += eh === qh ? 18 : -3;
  }

  if (query.kitPrimary && entry.kitPrimary) {
    const d = colorDistance(query.kitPrimary, entry.kitPrimary);
    score += Math.round((1 - d) * 32);
  }

  const jitter = (stableAvatarHash(`pick:${query.key}|${entry.id}`) % 1000) / 1000;
  score += jitter * 6;

  return score;
}

function fromEntry(entry, wantThumb, score) {
  if (!entry?.id) return fallbackResolved();
  const portraitRel = entry.portrait || entry.portraitPng || entry.master;
  const thumbRel = entry.thumbnail || portraitRel;
  const srcPortrait = avatarAssetUrl(portraitRel);
  const srcThumb = avatarAssetUrl(thumbRel);
  const src = wantThumb ? srcThumb || srcPortrait : srcPortrait || srcThumb;
  if (!src) return fallbackResolved();
  return {
    kind: "asset",
    id: String(entry.id),
    src,
    srcPortrait,
    srcThumb,
    sizeHint: wantThumb ? "thumbnail" : "portrait",
    score: score ?? 0,
    entry,
    kitPrimary: entry.kitPrimary || null,
  };
}

function fallbackResolved() {
  return {
    kind: "fallback",
    id: null,
    src: null,
    srcPortrait: null,
    srcThumb: null,
    sizeHint: null,
    score: 0,
    entry: null,
    kitPrimary: null,
  };
}

/**
 * 集中式纯函数：球员 → 头像资源或 fallback。
 *
 * 优先级：
 * 1. player.avatarAssetId（及兼容字段）
 * 2. assignment=match：年龄/地区/肤色/球衣打分 + 稳定破平
 * 3. assignment=hash：appearanceSeed / id 取模
 * 4. assignment=explicit：无显式 id 则 fallback
 * 5. 内置程序生成 fallback
 */
export function resolvePlayerAvatar(player, avatarManifest, opts = {}) {
  const m = avatarManifest || manifest;
  const list = m?.avatars || [];
  const index = m === manifest ? byId : indexManifest(m);
  const size = Number(opts.size) || 64;
  const wantThumb = size <= 96;

  const explicit = readExplicitAvatarId(player);
  if (explicit) {
    const entry = index.get(explicit);
    if (entry) return fromEntry(entry, wantThumb, 1e6);
    const id = explicit.replace(/[^a-zA-Z0-9_-]/g, "");
    if (id) {
      const portrait = avatarAssetUrl(`portraits/${id}.webp`);
      const thumb = avatarAssetUrl(`thumbnails/${id}.webp`);
      return {
        kind: "asset",
        id,
        src: wantThumb ? thumb : portrait,
        srcPortrait: portrait,
        srcThumb: thumb,
        sizeHint: wantThumb ? "thumbnail" : "portrait",
        score: 1e6,
        entry: null,
        kitPrimary: null,
      };
    }
  }

  const pool = list.filter(isMatchableEntry);
  if (!pool.length) return fallbackResolved();

  const mode = normalizeAssignment(m.assignment);

  // 可匹配池过小（例如只剩 1 张真·母版）时禁止自动分配，避免全员同一张脸
  const minPool = Number(m.minAutoPool) > 0 ? Number(m.minAutoPool) : 6;
  if (mode !== "explicit" && pool.length < minPool) {
    return fallbackResolved();
  }

  if (mode === "explicit") return fallbackResolved();

  if (mode === "hash") {
    const seed =
      player?.appearanceSeed != null && player.appearanceSeed !== ""
        ? String(player.appearanceSeed)
        : null;
    if (seed) {
      const i = stableAvatarHash(`seed:${seed}`) % pool.length;
      return fromEntry(pool[i], wantThumb, 0);
    }
    const pid = player?.id != null && player.id !== "" ? String(player.id) : null;
    if (pid) {
      const i = stableAvatarHash(`id:${pid}`) % pool.length;
      return fromEntry(pool[i], wantThumb, 0);
    }
    return fallbackResolved();
  }

  // match
  const query = buildAvatarQuery(player, opts);
  let best = null;
  let bestScore = -1e9;
  for (const entry of pool) {
    const s = scoreAvatarEntry(entry, query);
    if (s > bestScore) {
      bestScore = s;
      best = entry;
    }
  }
  const minScore = m.minMatchScore ?? 0;
  if (!best || bestScore < minScore) return fallbackResolved();
  return fromEntry(best, wantThumb, bestScore);
}

export function playerHasAvatarAsset(player, avatarManifest, opts) {
  return resolvePlayerAvatar(player, avatarManifest, opts).kind === "asset";
}

/**
 * 运行时球衣主色着色（canvas）。
 * 新风格肖像肩线更高：从约 48% 高度起处理球衣区；保留脸/发/线稿/白底。
 * @returns {Promise<string|null>} data URL
 */
export async function recolorAvatarKit(srcUrl, targetHex, opts = {}) {
  if (typeof document === "undefined" || !srcUrl || !targetHex) return null;
  const target = parseHex(targetHex);
  if (!target) return null;
  const outSize = Math.max(64, Math.min(512, Number(opts.size) || 128));

  const img = await loadImage(srcUrl);
  if (!img) return null;

  const canvas = document.createElement("canvas");
  canvas.width = outSize;
  canvas.height = outSize;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, outSize, outSize);
  const imageData = ctx.getImageData(0, 0, outSize, outSize);
  const d = imageData.data;
  const tr = target.r;
  const tg = target.g;
  const tb = target.b;
  // 目标色亮度，用于把不同原画球衣压到更接近的队色观感
  const tLum = 0.299 * tr + 0.587 * tg + 0.114 * tb;

  for (let y = 0; y < outSize; y++) {
    for (let x = 0; x < outSize; x++) {
      const i = (y * outSize + x) * 4;
      const r = d[i];
      const g = d[i + 1];
      const b = d[i + 2];
      const a = d[i + 3];
      if (a < 8) continue;

      const maxc = Math.max(r, g, b);
      const minc = Math.min(r, g, b);
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const sat = maxc === 0 ? 0 : (maxc - minc) / maxc;
      const nx = x / outSize;
      const ny = y / outSize;

      // 白底 / 近白背景
      if (sat < 0.14 && lum > 210) continue;
      // 线稿 / 深描边
      if (lum < 36 && sat < 0.35) continue;

      // 脸部保护区（上半中部）
      const inFaceBand = ny < 0.58 && nx > 0.22 && nx < 0.78;
      const isSkinish =
        inFaceBand &&
        r > 85 &&
        g > 45 &&
        b > 30 &&
        r >= g - 8 &&
        r > b &&
        sat > 0.08 &&
        sat < 0.72 &&
        lum > 55 &&
        lum < 230;
      if (isSkinish) continue;

      // 头发/头饰保护区：顶部且非球衣带
      if (ny < 0.34 && !(ny > 0.28 && sat > 0.18 && lum < 190)) continue;

      // 球衣主区：肩线以下；中间更宽，两侧略收
      const kitStart = 0.46;
      if (ny < kitStart) continue;
      const sideMargin = 0.08 + Math.max(0, (0.72 - ny) * 0.12);
      if (nx < sideMargin || nx > 1 - sideMargin) continue;

      // 近白领口/高光可保留一点，但低饱和浅色球衣也要上色
      const isNearWhiteFabric = sat < 0.06 && lum > 225;
      if (isNearWhiteFabric && ny < 0.56) continue;

      // 把原像素亮度映射到目标色，并略向队色亮度靠拢，减少“同队深浅乱跳”
      let shade = lum / Math.max(40, tLum);
      shade = Math.max(0.42, Math.min(1.35, shade));
      // 下半身更实色一点
      if (ny > 0.7) shade = Math.max(0.5, Math.min(1.25, shade * 0.98 + 0.06));

      d[i] = Math.max(0, Math.min(255, Math.round(tr * shade)));
      d[i + 1] = Math.max(0, Math.min(255, Math.round(tg * shade)));
      d[i + 2] = Math.max(0, Math.min(255, Math.round(tb * shade)));
    }
  }
  ctx.putImageData(imageData, 0, 0);
  try {
    return canvas.toDataURL("image/webp", 0.9);
  } catch {
    return canvas.toDataURL("image/png");
  }
}

function loadImage(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

const kitRecolorCache = new Map();
const KIT_CACHE_MAX = 200;

export async function getKitRecoloredSrc(srcUrl, kitPrimary, size) {
  if (!srcUrl || !kitPrimary) return srcUrl;
  const key = `${srcUrl}|${String(kitPrimary).toLowerCase()}|${size || 0}`;
  if (kitRecolorCache.has(key)) return kitRecolorCache.get(key);
  const out = await recolorAvatarKit(srcUrl, kitPrimary, { size: size || 128 });
  const finalSrc = out || srcUrl;
  if (kitRecolorCache.size >= KIT_CACHE_MAX) {
    const first = kitRecolorCache.keys().next().value;
    if (first != null) kitRecolorCache.delete(first);
  }
  kitRecolorCache.set(key, finalSrc);
  return finalSrc;
}
