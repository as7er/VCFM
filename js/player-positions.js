/**
 * 球员详细位置与多位置适应性。
 *
 * `player.pos` 继续保留 GK / DEF / MID / ATT 作为赛事与旧存档兼容字段；
 * 本模块提供真实阵型槽位使用的细分位置、熟悉度和稳定迁移。所有调用方
 * 读取同一份 positionProfile，不在界面或比赛中另造隐藏能力。
 */

export const PLAYER_POSITION_VERSION = 1;

export const DETAILED_POSITIONS = Object.freeze([
  "GK", "LB", "CB", "RB", "DM", "CM", "LM", "RM", "AM", "LW", "RW", "CF", "ST",
]);

export const POSITION_GROUPS = Object.freeze({
  GK: "GK",
  LB: "DEF", CB: "DEF", RB: "DEF",
  DM: "MID", CM: "MID", LM: "MID", RM: "MID", AM: "MID",
  LW: "ATT", RW: "ATT", CF: "ATT", ST: "ATT",
});

export const POSITION_LABELS = Object.freeze({
  GK: { zh: "门将", en: "Goalkeeper" },
  LB: { zh: "左后卫", en: "Left-back" },
  CB: { zh: "中后卫", en: "Centre-back" },
  RB: { zh: "右后卫", en: "Right-back" },
  DM: { zh: "后腰", en: "Defensive midfield" },
  CM: { zh: "中场", en: "Centre midfield" },
  LM: { zh: "左中场", en: "Left midfield" },
  RM: { zh: "右中场", en: "Right midfield" },
  AM: { zh: "前腰", en: "Attacking midfield" },
  LW: { zh: "左边锋", en: "Left wing" },
  RW: { zh: "右边锋", en: "Right wing" },
  CF: { zh: "影锋", en: "Centre forward" },
  ST: { zh: "中锋", en: "Striker" },
});

const GROUP_CODES = Object.freeze({
  GK: ["GK"],
  DEF: ["LB", "CB", "RB"],
  MID: ["DM", "CM", "LM", "RM", "AM"],
  ATT: ["LW", "RW", "CF", "ST"],
});

function clamp(value, min = 1, max = 20) {
  return Math.max(min, Math.min(max, Math.round(Number(value) || min)));
}

function stableUnit(seed) {
  let hash = 2166136261;
  for (const char of String(seed || "position")) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967296;
}

function noise(player, key, amount = 0.8) {
  return (stableUnit(`${player?.id || player?.name || "player"}:position:${key}`) - 0.5) * amount;
}

/**
 * heading / crossing / decisions 是 v199 属性，正常由 models.js 的
 * ensureFootballProfile 补齐。本模块不能反向 import models.js（会成环），
 * 所以在这里用基础属性给出方向一致的代理值：调用顺序不同时，派生结果
 * 仍由球员真实能力决定，而不是塌成平均值 10。
 */
const ATTR_PROXY = {
  heading: (player) => rawAttr(player, "strength") * 0.4 + rawAttr(player, "positioning") * 0.3 + rawAttr(player, "physical") * 0.3,
  crossing: (player) => rawAttr(player, "passing") * 0.5 + rawAttr(player, "vision") * 0.25 + rawAttr(player, "dribbling") * 0.25,
  decisions: (player) => rawAttr(player, "vision") * 0.4 + rawAttr(player, "positioning") * 0.35 + rawAttr(player, "passing") * 0.25,
};

function rawAttr(player, key, fallback = 10) {
  const value = Number(player?.attrs?.[key]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function attr(player, key, fallback = 10) {
  const value = Number(player?.attrs?.[key]);
  if (Number.isFinite(value) && value > 0) return value;
  const proxy = ATTR_PROXY[key];
  return proxy ? proxy(player) : fallback;
}

function weighted(player, entries, fallback = 10) {
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  if (!total) return fallback;
  return entries.reduce((sum, [key, weight]) => sum + attr(player, key, fallback) * weight, 0) / total;
}

/**
 * 惯用脚未定时返回 0（无侧向偏好），左右两侧熟悉度相同。
 * 惯用脚由 models.js 的 ensureFootballProfile 稳定推断，且它在补齐惯用脚
 * 之后才调用本模块，所以正常路径总能拿到真实值；此处不复制那份推断种子，
 * 避免两处哈希将来失步。
 */
function footSide(player) {
  if (player?.preferredFoot === "left") return -1;
  if (player?.preferredFoot === "right") return 1;
  return 0;
}

/**
 * 熟悉度以球员自身的属性均值为基准，而不是叠加一个平加常数。
 *
 * 绝对能力已经由 OVR 在选人（xiSortScore）、转会评估和规划里单独计入；
 * 若这里再把能力算一遍，就会双重计入：低级别球队的后卫会在每个位置都被
 * 判成"不适配"，而顶级球员在所有位置都顶格 20，"多位置适应性"反而失去
 * 区分度。以自身均值为基准后，熟悉度只回答"你的属性结构适合这个位置吗"。
 */
const NEUTRAL_FAMILIARITY = 13;
const FAMILIARITY_SLOPE = 1.5;

const FIELD_BASELINE_KEYS = Object.freeze([
  "pace", "stamina", "strength", "physical", "tackling", "marking", "positioning",
  "passing", "vision", "dribbling", "shooting", "finishing", "heading", "crossing", "decisions",
]);

function baselineLevel(player) {
  const values = FIELD_BASELINE_KEYS.map((key) => attr(player, key));
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** 把某个位置的加权适配值折算成 1-20 熟悉度。 */
function familiarity(value, baseline, offset, player, key) {
  return clamp(
    NEUTRAL_FAMILIARITY + (value - baseline) * FAMILIARITY_SLOPE + offset + noise(player, key)
  );
}

/** 从球员现有的粗位置和真实属性生成一次稳定的细分熟悉度。 */
export function derivePositionRatings(player) {
  const foot = footSide(player);
  const ratings = {};

  if (player?.pos === "GK") {
    // 门将只有一个位置，没有"结构是否匹配"的问题，直接读本职属性。
    ratings.GK = clamp(
      weighted(player, [["reflexes", .36], ["handling", .3], ["positioning", .2], ["kicking", .14]]) + 1.5 + noise(player, "GK")
    );
    return ratings;
  }

  const baseline = baselineLevel(player);
  const fit = (entries) => weighted(player, entries);

  if (player?.pos === "DEF") {
    ratings.CB = familiarity(
      fit([["marking", .25], ["tackling", .22], ["strength", .18], ["heading", .15], ["positioning", .12], ["physical", .08]]),
      baseline, 0, player, "CB"
    );
    const fullback = fit([["pace", .2], ["stamina", .16], ["crossing", .18], ["tackling", .14], ["marking", .1], ["dribbling", .1], ["decisions", .12]]);
    ratings.LB = familiarity(fullback, baseline, foot < 0 ? 1.1 : foot > 0 ? -0.35 : 0, player, "LB");
    ratings.RB = familiarity(fullback, baseline, foot > 0 ? 1.1 : foot < 0 ? -0.35 : 0, player, "RB");
    return ratings;
  }

  if (player?.pos === "MID") {
    ratings.DM = familiarity(
      fit([["tackling", .2], ["marking", .16], ["positioning", .18], ["strength", .12], ["stamina", .14], ["passing", .2]]),
      baseline, -1, player, "DM"
    );
    ratings.CM = familiarity(
      fit([["passing", .24], ["vision", .2], ["stamina", .18], ["pace", .12], ["decisions", .16], ["shooting", .1]]),
      baseline, 0, player, "CM"
    );
    ratings.AM = familiarity(
      fit([["vision", .24], ["passing", .2], ["dribbling", .18], ["shooting", .14], ["decisions", .16], ["pace", .08]]),
      baseline, -0.5, player, "AM"
    );
    const wide = fit([["pace", .2], ["crossing", .2], ["dribbling", .18], ["stamina", .16], ["passing", .14], ["decisions", .12]]);
    ratings.LM = familiarity(wide, baseline, foot < 0 ? 0.7 : foot > 0 ? -0.2 : 0, player, "LM");
    ratings.RM = familiarity(wide, baseline, foot > 0 ? 0.7 : foot < 0 ? -0.2 : 0, player, "RM");
    return ratings;
  }

  const wing = fit([["pace", .2], ["dribbling", .2], ["crossing", .14], ["finishing", .16], ["shooting", .1], ["decisions", .12], ["stamina", .08]]);
  ratings.LW = familiarity(wing, baseline, foot < 0 ? 0.65 : foot > 0 ? -0.15 : 0, player, "LW");
  ratings.RW = familiarity(wing, baseline, foot > 0 ? 0.65 : foot < 0 ? -0.15 : 0, player, "RW");
  ratings.CF = familiarity(
    fit([["finishing", .2], ["shooting", .14], ["dribbling", .16], ["vision", .12], ["passing", .1], ["decisions", .14], ["pace", .14]]),
    baseline, -0.5, player, "CF"
  );
  ratings.ST = familiarity(
    fit([["finishing", .24], ["shooting", .18], ["strength", .16], ["heading", .12], ["positioning", .14], ["pace", .1], ["decisions", .06]]),
    baseline, 0, player, "ST"
  );
  return ratings;
}

export function ensurePlayerPositionProfile(player) {
  if (!player) return false;
  const current = player.positionProfile;
  if (!current || typeof current !== "object" || Number(current.version || 0) < PLAYER_POSITION_VERSION) {
    const ratings = derivePositionRatings(player);
    const codes = GROUP_CODES[player.pos] || GROUP_CODES.MID;
    const ordered = codes.slice().sort((a, b) => (ratings[b] || 0) - (ratings[a] || 0) || a.localeCompare(b));
    const primary = ordered[0] || (player.pos || "CM");
    const natural = ordered.filter((code, index) => index < 3 && (ratings[code] || 0) >= Math.max(8, (ratings[primary] || 0) - 2.5));
    player.positionProfile = {
      version: PLAYER_POSITION_VERSION,
      primary,
      natural: natural.length ? natural : [primary],
      ratings,
    };
    return true;
  }
  // 旧档修补：任何一次实际修正都必须回报 changed，否则存档不会落盘，
  // 下次读档还会读到同一份非法数据。
  let changed = false;
  const codes = GROUP_CODES[player.pos] || GROUP_CODES.MID;
  const hasRatings = current.ratings && typeof current.ratings === "object";
  const ratings = hasRatings ? current.ratings : derivePositionRatings(player);
  if (!hasRatings) changed = true;
  const derived = codes.some((code) => !Number.isFinite(Number(ratings[code])))
    ? derivePositionRatings(player)
    : null;
  for (const code of codes) {
    // 缺失的细分位置按球员真实属性补齐，而不是塌成最低熟悉度。
    const source = Number.isFinite(Number(ratings[code])) ? ratings[code] : derived?.[code];
    const next = clamp(source, 1, 20);
    if (ratings[code] !== next) changed = true;
    ratings[code] = next;
  }
  current.ratings = ratings;
  if (!DETAILED_POSITIONS.includes(current.primary)) {
    current.primary = codes[0];
    changed = true;
  }
  if (!Array.isArray(current.natural) || !current.natural.length) {
    current.natural = [current.primary];
    changed = true;
  }
  const naturalBefore = current.natural.join(",");
  current.natural = current.natural.filter((code) => codes.includes(code));
  if (!current.natural.includes(current.primary)) current.natural.unshift(current.primary);
  current.natural = [...new Set(current.natural)].slice(0, 3);
  if (current.natural.join(",") !== naturalBefore) changed = true;
  if (current.version !== PLAYER_POSITION_VERSION) changed = true;
  current.version = PLAYER_POSITION_VERSION;
  return changed;
}

export function positionGroup(code) {
  return POSITION_GROUPS[code] || code || "MID";
}

export function positionLabel(code, lang = "zh") {
  return POSITION_LABELS[code]?.[lang] || code || "—";
}

export function slotPositionCode(slot, index = 0, slots = []) {
  const pos = slot?.pos || "MID";
  if (pos === "GK") return "GK";
  const x = Number(slot?.x ?? 50);
  if (pos === "DEF") return x <= 28 ? "LB" : x >= 72 ? "RB" : "CB";
  if (pos === "MID") {
    if (x <= 28) return "LM";
    if (x >= 72) return "RM";
    const same = (slots || []).filter((item) => item?.pos === "MID");
    const ys = same.map((item) => Number(item?.y ?? 50));
    const min = Math.min(...ys, Number(slot?.y ?? 50));
    const max = Math.max(...ys, Number(slot?.y ?? 50));
    if (max - min > 7 && Number(slot?.y ?? 50) >= max - 4) return "DM";
    if (max - min > 7 && Number(slot?.y ?? 50) <= min + 4) return "AM";
    return "CM";
  }
  if (x <= 34) return "LW";
  if (x >= 66) return "RW";
  return (slots || []).filter((item) => item?.pos === "ATT").length > 2 ? "CF" : "ST";
}

export function positionRating(player, target) {
  if (!player) return 0;
  ensurePlayerPositionProfile(player);
  if (GROUP_CODES[target]) {
    return Math.max(...(GROUP_CODES[target] || []).map((code) => Number(player.positionProfile?.ratings?.[code]) || 0));
  }
  return Number(player.positionProfile?.ratings?.[target]) || 0;
}

export function positionFitForSlot(player, slot, slots = []) {
  const target = slotPositionCode(slot, 0, slots);
  return { target, rating: positionRating(player, target), group: positionGroup(target) };
}

export function positionSummary(player, lang = "zh") {
  if (!player) return "—";
  ensurePlayerPositionProfile(player);
  const primary = player.positionProfile?.primary || player.pos || "MID";
  const natural = (player.positionProfile?.natural || []).filter((code) => code !== primary);
  return natural.length
    ? `${positionLabel(primary, lang)} · ${natural.map((code) => positionLabel(code, lang)).join(" / ")}`
    : positionLabel(primary, lang);
}

export function positionCoverage(player, slot, slots = []) {
  const fit = positionFitForSlot(player, slot, slots);
  return {
    ...fit,
    score: fit.rating / 20,
    natural: player?.positionProfile?.natural?.includes(fit.target) || false,
  };
}

