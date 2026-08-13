/**
 * 球员属性结构。
 *
 * 总体能力仍由 models.js 的 1-20 标尺决定；本模块只回答能力如何分布到
 * 各项技术、精神和身体属性。位置原型制造现实中的专长与短板，不在比赛
 * 中追加隐藏能力。个人习惯可以读取原型，但仍只改变动作选择。
 */

export const PLAYER_ATTRIBUTE_MODEL_VERSION = 1;

export const OUTFIELD_ATTRIBUTE_KEYS = Object.freeze([
  "pace", "shooting", "passing", "dribbling", "defending", "physical",
  "finishing", "tackling", "marking", "strength", "stamina", "vision",
  "positioning", "heading", "crossing", "decisions",
]);

export const GOALKEEPER_ATTRIBUTE_KEYS = Object.freeze([
  "reflexes", "handling", "positioning", "kicking", "pace", "passing",
  "strength", "decisions",
]);

const ALL_ATTRIBUTE_KEYS = Object.freeze([
  ...new Set([...OUTFIELD_ATTRIBUTE_KEYS, ...GOALKEEPER_ATTRIBUTE_KEYS]),
]);

function archetype(id, positions, weights, habits = []) {
  return Object.freeze({
    id,
    positions: Object.freeze([...positions]),
    weights: Object.freeze({ ...weights }),
    habits: Object.freeze([...habits]),
  });
}

/**
 * 权重是相对球员自身能力基准的偏移，不是额外能力。平均权重接近零，
 * 所以原型会重分配能力，而不会凭空制造更强的球员。
 */
export const PLAYER_ATTRIBUTE_ARCHETYPES = Object.freeze({
  goalkeeper: archetype("goalkeeper", ["GK"], {
    reflexes: 3.0, handling: 2.7, positioning: 2.2, kicking: 0.9,
    decisions: 0.6, strength: 0.5, passing: -0.8, pace: -1.2,
    shooting: -4.8, finishing: -5.0, dribbling: -2.8, defending: -0.5,
    tackling: -2.4, marking: -2.0, crossing: -3.2, vision: -0.6,
  }, ["distributes_short", "launches_counters"]),
  centre_back: archetype("centre_back", ["CB"], {
    marking: 2.5, tackling: 2.3, positioning: 2.1, heading: 1.8,
    strength: 1.7, defending: 1.6, physical: 0.9, decisions: 0.5,
    passing: -0.1, pace: -0.4, stamina: -0.5, crossing: -1.8,
    dribbling: -1.9, shooting: -2.8, finishing: -3.2,
    reflexes: -4.5, handling: -4.5, kicking: -2.5,
  }, ["switches_play", "dives_into_tackles"]),
  full_back: archetype("full_back", ["LB", "RB"], {
    pace: 2.0, stamina: 2.0, crossing: 1.8, tackling: 1.4,
    marking: 1.2, defending: 1.0, dribbling: 0.7, decisions: 0.4,
    positioning: 0.4, passing: 0.2, strength: -0.4, heading: -1.1,
    shooting: -1.7, finishing: -2.2,
    reflexes: -4.5, handling: -4.5, kicking: -2.7,
  }, ["gets_forward", "hugs_line", "runs_with_ball"]),
  holding_midfielder: archetype("holding_midfielder", ["DM", "CM"], {
    tackling: 2.0, positioning: 1.8, marking: 1.6, stamina: 1.5,
    passing: 1.2, decisions: 1.0, defending: 1.0, strength: 0.8,
    vision: 0.4, pace: -0.5, dribbling: -0.7, crossing: -1.0,
    shooting: -1.4, finishing: -2.2,
    reflexes: -4.5, handling: -4.5, kicking: -2.5,
  }, ["comes_deep", "switches_play", "dives_into_tackles"]),
  playmaker: archetype("playmaker", ["CM", "AM"], {
    passing: 2.5, vision: 2.5, decisions: 1.9, dribbling: 1.2,
    stamina: 0.7, positioning: 0.4, shooting: 0.1, crossing: 0.1,
    pace: -0.3, strength: -0.8, tackling: -1.1, marking: -1.4,
    defending: -1.4, finishing: -0.8, heading: -1.4,
    reflexes: -4.5, handling: -4.5, kicking: -2.2,
  }, ["tries_through_balls", "plays_one_twos", "switches_play", "comes_deep"]),
  box_to_box: archetype("box_to_box", ["CM"], {
    stamina: 2.5, pace: 1.3, passing: 1.0, tackling: 0.9,
    decisions: 0.8, physical: 0.8, positioning: 0.6, dribbling: 0.5,
    shooting: 0.4, strength: 0.3, marking: 0.1, finishing: -0.4,
    crossing: -0.5, heading: -0.6,
    reflexes: -4.5, handling: -4.5, kicking: -2.4,
  }, ["gets_forward", "runs_with_ball", "plays_one_twos"]),
  wide_midfielder: archetype("wide_midfielder", ["LM", "RM"], {
    pace: 2.1, crossing: 2.1, dribbling: 1.7, stamina: 1.5,
    passing: 0.8, decisions: 0.5, vision: 0.1, shooting: -0.2,
    tackling: -0.5, marking: -0.7, strength: -0.8, heading: -1.5,
    finishing: -1.4, defending: -0.5,
    reflexes: -4.5, handling: -4.5, kicking: -2.6,
  }, ["hugs_line", "runs_with_ball", "gets_forward"]),
  winger: archetype("winger", ["LW", "RW"], {
    pace: 2.7, dribbling: 2.5, crossing: 1.8, stamina: 0.8,
    decisions: 0.7, passing: 0.3, shooting: 0.5, finishing: 0.2,
    vision: 0.1, strength: -0.9, heading: -1.4, positioning: -0.2,
    tackling: -2.5, marking: -2.8, defending: -2.7,
    reflexes: -4.5, handling: -4.5, kicking: -2.5,
  }, ["hugs_line", "runs_with_ball", "gets_forward"]),
  inside_forward: archetype("inside_forward", ["LW", "RW", "CF"], {
    dribbling: 2.5, pace: 2.2, finishing: 1.8, shooting: 1.6,
    decisions: 1.0, positioning: 0.8, vision: 0.2, passing: 0.1,
    crossing: -0.5, stamina: 0.2, strength: -0.7, heading: -1.0,
    tackling: -2.7, marking: -3.0, defending: -2.8,
    reflexes: -4.5, handling: -4.5, kicking: -2.5,
  }, ["cuts_inside", "runs_with_ball", "places_shots"]),
  advanced_forward: archetype("advanced_forward", ["ST", "CF"], {
    finishing: 3.0, shooting: 2.3, pace: 2.1, positioning: 1.7,
    dribbling: 1.2, decisions: 0.9, strength: 0.3, heading: 0.1,
    passing: -0.8, vision: -1.0, crossing: -1.8, stamina: -0.2,
    tackling: -3.2, marking: -3.5, defending: -3.2,
    reflexes: -4.5, handling: -4.5, kicking: -2.5,
  }, ["gets_forward", "places_shots", "rounds_keeper"]),
  target_forward: archetype("target_forward", ["ST", "CF"], {
    strength: 2.8, heading: 2.7, finishing: 2.0, positioning: 1.7,
    shooting: 1.4, physical: 1.3, decisions: 0.6, passing: 0.2,
    pace: -1.1, dribbling: -1.3, crossing: -1.8, vision: -0.5,
    tackling: -2.8, marking: -3.1, defending: -2.8,
    reflexes: -4.5, handling: -4.5, kicking: -2.5,
  }, ["comes_deep", "places_shots"]),
  pressing_forward: archetype("pressing_forward", ["ST", "CF"], {
    stamina: 2.5, pace: 2.0, strength: 1.6, decisions: 1.0,
    finishing: 1.5, shooting: 1.2, positioning: 1.0, tackling: 0.3,
    physical: 0.8, dribbling: 0.1, passing: -0.5, heading: -0.3,
    marking: -1.4, defending: -1.1, crossing: -1.8,
    reflexes: -4.5, handling: -4.5, kicking: -2.5,
  }, ["gets_forward", "dives_into_tackles", "runs_with_ball"]),
  false_nine: archetype("false_nine", ["CF", "ST"], {
    passing: 2.3, vision: 2.2, decisions: 1.8, dribbling: 1.7,
    finishing: 1.4, shooting: 0.9, positioning: 0.8, pace: 0.1,
    strength: -0.5, heading: -1.2, crossing: -0.9, stamina: 0.1,
    tackling: -2.8, marking: -3.1, defending: -2.9,
    reflexes: -4.5, handling: -4.5, kicking: -2.5,
  }, ["comes_deep", "plays_one_twos", "tries_through_balls"]),
});

export const PLAYER_ATTRIBUTE_ARCHETYPE_LABELS = Object.freeze({
  goalkeeper: Object.freeze({ zh: "传统门将", en: "Goalkeeper" }),
  centre_back: Object.freeze({ zh: "中卫", en: "Centre-back" }),
  full_back: Object.freeze({ zh: "边后卫", en: "Full-back" }),
  holding_midfielder: Object.freeze({ zh: "防守中场", en: "Holding midfielder" }),
  playmaker: Object.freeze({ zh: "组织核心", en: "Playmaker" }),
  box_to_box: Object.freeze({ zh: "全能中场", en: "Box-to-box midfielder" }),
  wide_midfielder: Object.freeze({ zh: "边路中场", en: "Wide midfielder" }),
  winger: Object.freeze({ zh: "边锋", en: "Winger" }),
  inside_forward: Object.freeze({ zh: "内锋", en: "Inside forward" }),
  advanced_forward: Object.freeze({ zh: "突前前锋", en: "Advanced forward" }),
  target_forward: Object.freeze({ zh: "支点前锋", en: "Target forward" }),
  pressing_forward: Object.freeze({ zh: "压迫前锋", en: "Pressing forward" }),
  false_nine: Object.freeze({ zh: "伪九号", en: "False nine" }),
});

const ARCHETYPE_IDS_BY_GROUP = Object.freeze({
  GK: ["goalkeeper"],
  DEF: ["centre_back", "centre_back", "full_back", "full_back"],
  MID: ["holding_midfielder", "playmaker", "playmaker", "box_to_box", "wide_midfielder"],
  ATT: ["advanced_forward", "advanced_forward", "target_forward", "pressing_forward", "false_nine", "winger", "inside_forward"],
});

const PROTECTED_KEYS = Object.freeze({
  GK: new Set(["reflexes", "handling", "positioning", "kicking"]),
  DEF: new Set(["tackling", "marking", "strength", "pace", "passing"]),
  MID: new Set(["passing", "vision", "stamina", "pace", "shooting"]),
  ATT: new Set(["shooting", "pace", "dribbling", "finishing", "strength"]),
});

const POSITION_OVR_EXCESS = Object.freeze({ GK: 0.8, DEF: 0, MID: -0.2, ATT: 0.4 });

function clamp(value, min = 1, max = 20) {
  return Math.max(min, Math.min(max, Math.round(Number(value) || min)));
}

function stableUnit(seed) {
  let hash = 2166136261;
  for (const char of String(seed || "attribute-profile")) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967296;
}

function stableGaussian(seed) {
  const u = Math.max(0.000001, stableUnit(`${seed}:u`));
  const v = stableUnit(`${seed}:v`);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function average(values, fallback = 10) {
  const finite = values.map(Number).filter(Number.isFinite);
  return finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : fallback;
}

function currentAbilityBase(player) {
  const protectedKeys = PROTECTED_KEYS[player?.pos] || PROTECTED_KEYS.MID;
  const values = [...protectedKeys].map((key) => player?.attrs?.[key]);
  return average(values, Number(player?.ovr) || 10);
}

function generationBase(player, fallback) {
  const value = Number(player?.attributeAbilityBase);
  return Number.isFinite(value) ? value : currentAbilityBase(player) || fallback;
}

function seedKey(player, suffix) {
  return `${player?.id || player?.name || "player"}:attribute-v${PLAYER_ATTRIBUTE_MODEL_VERSION}:${suffix}`;
}

export function attributeArchetype(playerOrId) {
  const id = typeof playerOrId === "string" ? playerOrId : playerOrId?.attributeArchetype;
  return PLAYER_ATTRIBUTE_ARCHETYPES[id] || null;
}

export function attributeArchetypeLabel(playerOrId, lang = "zh") {
  const id = typeof playerOrId === "string" ? playerOrId : playerOrId?.attributeArchetype;
  return PLAYER_ATTRIBUTE_ARCHETYPE_LABELS[id]?.[lang] || id || "-";
}

export function attributeArchetypeIdsForPosition(position) {
  return [...(ARCHETYPE_IDS_BY_GROUP[position] || ARCHETYPE_IDS_BY_GROUP.MID)];
}

export function selectAttributeArchetype(player) {
  const current = attributeArchetype(player);
  if (current && current.positions.some((position) => position === player?.pos || position === player?.positionProfile?.primary)) {
    return current.id;
  }
  const candidates = ARCHETYPE_IDS_BY_GROUP[player?.pos] || ARCHETYPE_IDS_BY_GROUP.MID;
  return candidates[Math.floor(stableUnit(seedKey(player, "archetype")) * candidates.length)] || candidates[0];
}

/** 旧档按既有细分位置和属性专长寻找最近的原型，保留球员原有身份。 */
export function inferAttributeArchetype(player) {
  const current = attributeArchetype(player);
  if (current) return current.id;
  const primary = player?.positionProfile?.primary;
  const groupCandidates = [...new Set(ARCHETYPE_IDS_BY_GROUP[player?.pos] || ARCHETYPE_IDS_BY_GROUP.MID)];
  const compatible = primary
    ? groupCandidates.filter((id) => PLAYER_ATTRIBUTE_ARCHETYPES[id].positions.includes(primary))
    : [];
  const candidates = compatible.length ? compatible : groupCandidates;
  const base = currentAbilityBase(player);
  return candidates
    .map((id) => {
      const profile = PLAYER_ATTRIBUTE_ARCHETYPES[id];
      const entries = Object.entries(profile.weights)
        .filter(([key]) => Number.isFinite(Number(player?.attrs?.[key])));
      const score = entries.reduce((sum, [key, weight]) => {
        const deviation = Number(player.attrs[key]) - base;
        return sum + deviation * Number(weight);
      }, 0) / Math.max(1, entries.length);
      return { id, score };
    })
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))[0]?.id || candidates[0];
}

export function preferredHabitsForAttributeArchetype(player) {
  return [...(attributeArchetype(player)?.habits || [])];
}

export function weightedDevelopmentAttributes(player, keys = ALL_ATTRIBUTE_KEYS) {
  const profile = attributeArchetype(player);
  if (!profile) return [...keys];
  const candidates = [...new Set(keys)].filter((key) => Number(player?.attrs?.[key]) < 20);
  const weighted = [];
  for (const key of candidates) {
    const weight = Number(profile.weights[key] || 0);
    const copies = weight >= 2 ? 5 : weight >= 1 ? 4 : weight >= 0 ? 2 : 1;
    for (let index = 0; index < copies; index++) weighted.push(key);
  }
  return weighted;
}

function targetAttribute(player, profile, key, base, mode) {
  const protectedKeys = PROTECTED_KEYS[player?.pos] || PROTECTED_KEYS.MID;
  const protectedMean = average([...protectedKeys].map((attribute) => profile.weights[attribute] || 0), 0);
  const positional = Number(profile.weights[key] || 0) - protectedMean + (POSITION_OVR_EXCESS[player?.pos] || 0);
  const noiseScale = mode === "generate" ? 1.45 : 0.85;
  return clamp(base + positional + stableGaussian(seedKey(player, key)) * noiseScale);
}

export function normalizePlayerAttributeCoherence(player) {
  if (!player?.attrs) return false;
  const attrs = player.attrs;
  const before = JSON.stringify(attrs);
  if (player.pos === "ATT") {
    const attackFloor = Math.min(attrs.shooting || 1, attrs.finishing || 1) - 1;
    if ((attrs.tackling || 1) > attackFloor) attrs.tackling = clamp(attackFloor);
    if ((attrs.marking || 1) > attackFloor - 1) attrs.marking = clamp(attackFloor - 1);
    attrs.defending = clamp(average([attrs.tackling, attrs.marking, attrs.positioning]) - 1);
  } else if (player.pos === "DEF") {
    attrs.defending = clamp(average([attrs.tackling, attrs.marking, attrs.positioning]));
  } else if (player.pos === "MID") {
    attrs.defending = clamp(average([attrs.tackling, attrs.marking, attrs.positioning]) - 0.5);
  }
  attrs.physical = clamp(average([attrs.pace, attrs.strength, attrs.stamina]));
  return JSON.stringify(attrs) !== before;
}

function alignOverallKeys(player, wanted) {
  const keys = [...(PROTECTED_KEYS[player?.pos] || PROTECTED_KEYS.MID)];
  let guard = 0;
  const current = () => clamp(average(keys.map((key) => player.attrs[key])));
  while (current() !== wanted && guard++ < 120) {
    const direction = current() < wanted ? 1 : -1;
    const candidates = keys
      .filter((key) => direction > 0 ? player.attrs[key] < 20 : player.attrs[key] > 1)
      .sort((left, right) => direction > 0
        ? player.attrs[left] - player.attrs[right]
        : player.attrs[right] - player.attrs[left]);
    if (!candidates.length) break;
    player.attrs[candidates[guard % candidates.length]] += direction;
  }
}

/** 新球员生成：完整按原型生成，不继承此前的独立随机属性。 */
export function generatePlayerAttributes(player, abilityBase) {
  if (!player) return false;
  if (!player.attrs || typeof player.attrs !== "object") player.attrs = {};
  player.attributeArchetype = selectAttributeArchetype(player);
  player.attributeAbilityBase = Number(abilityBase) || 10;
  const profile = attributeArchetype(player);
  for (const key of ALL_ATTRIBUTE_KEYS) {
    player.attrs[key] = targetAttribute(player, profile, key, player.attributeAbilityBase, "generate");
  }
  normalizePlayerAttributeCoherence(player);
  player.attributeModelVersion = PLAYER_ATTRIBUTE_MODEL_VERSION;
  return true;
}

/**
 * 旧档一次性温和迁移。关键 OVR 属性只向原型目标靠拢 45%，以保留既有
 * 总体能力；其他属性靠拢 72%，足以修复随机倒挂而不抹掉个体差异。
 */
export function ensurePlayerAttributeProfile(player) {
  if (!player) return false;
  if (!player.attrs || typeof player.attrs !== "object") player.attrs = {};
  if ((player.attributeModelVersion || 0) >= PLAYER_ATTRIBUTE_MODEL_VERSION && attributeArchetype(player)) {
    return false;
  }
  const base = generationBase(player, Number(player.ovr) || 10);
  player.attributeArchetype = inferAttributeArchetype(player);
  player.attributeAbilityBase = base;
  const profile = attributeArchetype(player);
  const protectedKeys = PROTECTED_KEYS[player.pos] || PROTECTED_KEYS.MID;
  for (const key of ALL_ATTRIBUTE_KEYS) {
    const current = Number(player.attrs[key]);
    const target = targetAttribute(player, profile, key, base, "migrate");
    const blend = protectedKeys.has(key) ? 0.45 : 0.72;
    player.attrs[key] = Number.isFinite(current)
      ? clamp(current + (target - current) * blend)
      : target;
  }
  if (Number.isFinite(Number(player.ovr))) alignOverallKeys(player, clamp(player.ovr));
  normalizePlayerAttributeCoherence(player);
  // 细分位置是从属性结构派生的；属性迁移后必须用同一份新事实重算。
  player.positionProfile = null;
  player.attributeModelVersion = PLAYER_ATTRIBUTE_MODEL_VERSION;
  return true;
}
