/**
 * 位置角色与职责。
 *
 * 角色只描述球员被要求怎样移动和选择动作；属性决定执行质量，个人习惯
 * 决定球员在相同要求下的稳定偏好。教练与 AI 可读取适配度选人，但这里
 * 不向比赛写入能力或胜率修正。
 */

import { PLAYER_ROLES } from "./data.js";
import { ensurePlayerHabits } from "./player-habits.js";

export const PLAYER_ROLE_VERSION = 2;

export const PLAYER_DUTIES = Object.freeze({
  defend: Object.freeze({
    id: "defend",
    label: "防守",
    labelEn: "Defend",
    short: "防",
    shortEn: "D",
    description: "优先保持防守结构，减少无保护前插和高风险处理。",
    descriptionEn: "Prioritises defensive structure and limits unprotected forward movement.",
    behavior: Object.freeze({ depth: -0.28, passRisk: -0.12, shoot: -0.12, hold: 0.12 }),
  }),
  support: Object.freeze({
    id: "support",
    label: "策应",
    labelEn: "Support",
    short: "策",
    shortEn: "S",
    description: "在球后与球前之间提供连接，根据局面接应或前插。",
    descriptionEn: "Links play between the ball and the forward line, supporting as the phase requires.",
    behavior: Object.freeze({ support: 0.18, press: 0.04 }),
  }),
  attack: Object.freeze({
    id: "attack",
    label: "进攻",
    labelEn: "Attack",
    short: "攻",
    shortEn: "A",
    description: "更积极攻击纵深、禁区和高风险进攻线路。",
    descriptionEn: "Attacks depth, the box and higher-risk attacking routes more aggressively.",
    behavior: Object.freeze({ depth: 0.32, passRisk: 0.1, carry: 0.08, shoot: 0.14, press: 0.06 }),
  }),
});

function detail(config) {
  return Object.freeze({
    duties: Object.freeze([...(config.duties || ["support"])]),
    defaultDuty: config.defaultDuty || config.duties?.[0] || "support",
    slotPositions: Object.freeze([...(config.slotPositions || [])]),
    attributes: Object.freeze([...(config.attributes || [])]),
    preferredHabits: Object.freeze([...(config.preferredHabits || [])]),
    conflictingHabits: Object.freeze([...(config.conflictingHabits || [])]),
    tags: Object.freeze([...(config.tags || [])]),
    behavior: Object.freeze({ ...(config.behavior || {}) }),
    description: config.description || "",
    descriptionEn: config.descriptionEn || "",
  });
}

export const ROLE_DETAILS = Object.freeze({
  gk_std: detail({
    slotPositions: ["GK"], duties: ["defend", "support"], defaultDuty: "defend",
    attributes: ["reflexes", "handling", "positioning", "kicking"],
    preferredHabits: ["distributes_short"], tags: ["balanced", "secure"],
    behavior: { shortDistribution: 0.18 },
    description: "以门线保护和稳妥处理为首要任务。",
    descriptionEn: "Protects the goal first and distributes with controlled risk.",
  }),
  gk_sweeper: detail({
    slotPositions: ["GK"], duties: ["support", "attack"], defaultDuty: "support",
    attributes: ["reflexes", "positioning", "kicking", "pace", "decisions"],
    preferredHabits: ["distributes_short", "launches_counters"], tags: ["controlled", "intense", "build-up"],
    behavior: { sweep: 0.72, shortDistribution: 0.24, passRisk: 0.2 },
    description: "主动保护高位防线，并在禁区外侧参与第一阶段出球。",
    descriptionEn: "Protects a high line and joins the first phase of build-up beyond the six-yard area.",
  }),
  cb_central: detail({
    slotPositions: ["CB"], duties: ["defend"], attributes: ["marking", "tackling", "heading", "positioning"],
    tags: ["balanced", "secure"], behavior: { hold: 0.32, passRisk: -0.08 },
    description: "保持中卫防区，兼顾盯防、争顶和常规出球。",
    descriptionEn: "Holds the centre-back zone and balances marking, aerial defence and ordinary distribution.",
  }),
  cb_ball: detail({
    slotPositions: ["CB"], duties: ["defend", "support"], defaultDuty: "defend",
    attributes: ["marking", "positioning", "passing", "vision", "decisions"],
    preferredHabits: ["switches_play", "tries_through_balls"], tags: ["controlled", "build-up", "playmaker"],
    behavior: { passRisk: 0.38, support: 0.18, carry: 0.08 },
    description: "在完成中卫防守职责的同时主动寻找推进和转移线路。",
    descriptionEn: "Defends as a centre-back while actively seeking progressive and switching passes.",
  }),
  cb_stop: detail({
    slotPositions: ["CB"], duties: ["defend"], attributes: ["heading", "strength", "marking", "tackling"],
    conflictingHabits: ["tries_through_balls", "runs_with_ball"], tags: ["compact", "direct", "secure"],
    behavior: { hold: 0.48, passRisk: -0.42, carry: -0.35, tackle: 0.18 },
    description: "优先解围和终止进攻，不承担冒险组织任务。",
    descriptionEn: "Clears danger and stops attacks without taking ambitious build-up risks.",
  }),
  fb_def: detail({
    slotPositions: ["LB", "RB"], duties: ["defend", "support"], defaultDuty: "support",
    attributes: ["pace", "stamina", "tackling", "marking", "crossing"],
    tags: ["balanced", "compact"], behavior: { width: 0.35, depth: -0.08, cross: 0.12 },
    description: "从边后卫区域提供宽度，并根据职责决定前插幅度。",
    descriptionEn: "Provides width from full-back and advances according to the selected duty.",
  }),
  fb_wb: detail({
    slotPositions: ["LB", "RB"], duties: ["support", "attack"], defaultDuty: "support",
    attributes: ["pace", "stamina", "crossing", "dribbling", "decisions"],
    preferredHabits: ["gets_forward", "hugs_line"], tags: ["intense", "direct", "wide"],
    behavior: { width: 0.68, depth: 0.38, cross: 0.48, carry: 0.16, press: 0.12 },
    description: "沿边线持续前插，在高位提供传中和反抢。",
    descriptionEn: "Advances repeatedly outside, supplying crosses and counter-pressure high up the pitch.",
  }),
  fb_inverted: detail({
    slotPositions: ["LB", "RB"], duties: ["defend", "support"], defaultDuty: "support",
    attributes: ["passing", "decisions", "positioning", "tackling", "stamina"],
    preferredHabits: ["comes_deep", "switches_play"], conflictingHabits: ["hugs_line"],
    tags: ["controlled", "build-up", "compact"], behavior: { width: -0.52, support: 0.42, passRisk: 0.15, depth: -0.04 },
    description: "本队控球时内收进入中场，帮助保护转换和组织出球。",
    descriptionEn: "Moves into midfield in possession to support circulation and protect transitions.",
  }),
  wm_wingback: detail({
    slotPositions: ["LM", "RM"], duties: ["support", "attack"], defaultDuty: "support",
    attributes: ["pace", "stamina", "crossing", "tackling", "dribbling"],
    preferredHabits: ["gets_forward", "hugs_line"], tags: ["intense", "direct", "wide"],
    behavior: { width: 0.72, depth: 0.34, cross: 0.5, press: 0.18 },
    description: "在三后卫体系中承担整条边路的攻防覆盖。",
    descriptionEn: "Covers the entire flank in a back-three structure.",
  }),
  dm_hold: detail({
    slotPositions: ["DM", "CM"], duties: ["defend", "support"], defaultDuty: "defend",
    attributes: ["positioning", "marking", "tackling", "strength", "passing"],
    tags: ["compact", "counter", "secure"], behavior: { hold: 0.58, depth: -0.42, passRisk: -0.08 },
    description: "保护中卫身前区域，保持位置并提供安全接应。",
    descriptionEn: "Screens the centre-backs, holds position and offers a safe passing option.",
  }),
  dm_playmaker: detail({
    slotPositions: ["DM", "CM"], duties: ["defend", "support"], defaultDuty: "support",
    attributes: ["passing", "vision", "decisions", "positioning"],
    preferredHabits: ["switches_play", "tries_through_balls", "comes_deep"], tags: ["controlled", "playmaker", "build-up"],
    behavior: { hold: 0.36, support: 0.5, passRisk: 0.48, depth: -0.28 },
    description: "从较深位置控制节奏并向前输送球权。",
    descriptionEn: "Controls tempo from deep and progresses possession through passing.",
  }),
  dm_halfback: detail({
    slotPositions: ["DM"], duties: ["defend"], attributes: ["positioning", "marking", "tackling", "passing", "heading"],
    tags: ["controlled", "compact", "secure"], behavior: { hold: 0.78, depth: -0.68, support: 0.18 },
    description: "组织阶段回撤到中卫之间，稳定后场出球结构。",
    descriptionEn: "Drops between the centre-backs during build-up to stabilise the defensive structure.",
  }),
  cm_central: detail({
    slotPositions: ["CM"], duties: ["defend", "support", "attack"], defaultDuty: "support",
    attributes: ["passing", "stamina", "decisions", "positioning"], tags: ["balanced"], behavior: {},
    description: "按照职责在中场防守、连接和前插之间保持平衡。",
    descriptionEn: "Balances defending, linking and forward movement according to duty.",
  }),
  cm_box: detail({
    slotPositions: ["CM"], duties: ["support"], attributes: ["stamina", "pace", "passing", "tackling", "shooting"],
    preferredHabits: ["gets_forward", "runs_with_ball"], tags: ["intense", "runner"],
    behavior: { depth: 0.42, press: 0.34, carry: 0.12 },
    description: "依靠体能覆盖两个禁区之间的空间。",
    descriptionEn: "Uses stamina to cover the space between both penalty areas.",
  }),
  cm_ballwinner: detail({
    slotPositions: ["DM", "CM"], duties: ["defend", "support"], defaultDuty: "defend",
    attributes: ["tackling", "marking", "strength", "stamina", "decisions"],
    preferredHabits: ["dives_into_tackles"], tags: ["intense", "compact", "pressing"],
    behavior: { press: 0.65, tackle: 0.48, passRisk: -0.2 },
    description: "主动离开原位压迫和夺回球权，需要队友提供身后保护。",
    descriptionEn: "Leaves position to press and regain possession, requiring cover behind.",
  }),
  cm_playmaker: detail({
    slotPositions: ["CM", "AM"], duties: ["support", "attack"], defaultDuty: "support",
    attributes: ["passing", "vision", "decisions", "dribbling"],
    preferredHabits: ["plays_one_twos", "tries_through_balls", "switches_play"], tags: ["controlled", "playmaker"],
    behavior: { support: 0.5, passRisk: 0.52, carry: 0.08 },
    description: "成为中场主要接球点，负责创造和输送。",
    descriptionEn: "Acts as a primary midfield receiver and creator.",
  }),
  am_play: detail({
    slotPositions: ["AM"], duties: ["support", "attack"], defaultDuty: "support",
    attributes: ["passing", "vision", "decisions", "dribbling"],
    preferredHabits: ["plays_one_twos", "tries_through_balls", "comes_deep"], tags: ["controlled", "playmaker"],
    behavior: { support: 0.46, passRisk: 0.56, carry: 0.1 },
    description: "在前锋身后寻找空间并承担最后一传。",
    descriptionEn: "Finds space behind the forwards and supplies the final pass.",
  }),
  am_shadow: detail({
    slotPositions: ["AM", "CF"], duties: ["attack"], attributes: ["finishing", "pace", "positioning", "stamina", "decisions"],
    preferredHabits: ["gets_forward", "shoots_from_distance"], conflictingHabits: ["comes_deep"], tags: ["intense", "runner", "attacking"],
    behavior: { depth: 0.72, shoot: 0.42, press: 0.18 },
    description: "从前腰区域后插上攻击禁区和第二落点。",
    descriptionEn: "Arrives late from attacking midfield to attack the box and second balls.",
  }),
  winger: detail({
    slotPositions: ["LM", "RM"], duties: ["support", "attack"], defaultDuty: "support",
    attributes: ["pace", "dribbling", "crossing", "stamina"],
    preferredHabits: ["hugs_line", "runs_with_ball"], conflictingHabits: ["cuts_inside"], tags: ["direct", "wide"],
    behavior: { width: 0.75, cross: 0.55, carry: 0.28 },
    description: "保持边路宽度，以带球和传中制造机会。",
    descriptionEn: "Holds width and creates through carrying and crossing.",
  }),
  wide_playmaker: detail({
    slotPositions: ["LM", "RM", "LW", "RW"], duties: ["support", "attack"], defaultDuty: "support",
    attributes: ["passing", "vision", "decisions", "dribbling"],
    preferredHabits: ["comes_deep", "tries_through_balls", "switches_play"], tags: ["controlled", "playmaker", "wide"],
    behavior: { width: 0.12, support: 0.52, passRisk: 0.46, carry: 0.08 },
    description: "从边路向内寻找接球空间并组织进攻。",
    descriptionEn: "Drifts inside from a wide starting position to organise attacks.",
  }),
  st_winger: detail({
    slotPositions: ["LW", "RW"], duties: ["support", "attack"], defaultDuty: "attack",
    attributes: ["pace", "dribbling", "crossing", "decisions"],
    preferredHabits: ["hugs_line", "runs_with_ball"], conflictingHabits: ["cuts_inside"], tags: ["direct", "wide", "attacking"],
    behavior: { width: 0.78, cross: 0.58, carry: 0.32, depth: 0.2 },
    description: "从高位边路保持宽度，直接攻击边后卫并送出传中。",
    descriptionEn: "Stays high and wide to attack the full-back directly and cross.",
  }),
  st_inside: detail({
    slotPositions: ["LW", "RW", "CF"], duties: ["support", "attack"], defaultDuty: "attack",
    attributes: ["pace", "dribbling", "finishing", "shooting", "decisions"],
    preferredHabits: ["cuts_inside", "runs_with_ball", "places_shots"], conflictingHabits: ["hugs_line"],
    tags: ["controlled", "intense", "attacking"], behavior: { width: -0.62, depth: 0.42, carry: 0.34, shoot: 0.34 },
    description: "从边路向禁区内切，成为额外的射门点。",
    descriptionEn: "Cuts inside from wide to become an additional scoring threat.",
  }),
  st_advanced: detail({
    slotPositions: ["ST", "CF"], duties: ["attack"], attributes: ["pace", "finishing", "dribbling", "decisions"],
    preferredHabits: ["gets_forward", "runs_with_ball", "rounds_keeper"], tags: ["counter", "intense", "attacking"],
    behavior: { depth: 0.64, carry: 0.22, shoot: 0.34 },
    description: "持续攻击防线身后，并在前场各通道寻找机会。",
    descriptionEn: "Threatens the space behind the defence and moves across the forward line.",
  }),
  st_poach: detail({
    slotPositions: ["ST"], duties: ["attack"], attributes: ["finishing", "positioning", "pace", "decisions"],
    preferredHabits: ["places_shots", "rounds_keeper"], conflictingHabits: ["comes_deep"], tags: ["attacking", "direct"],
    behavior: { depth: 0.76, shoot: 0.54, support: -0.32, press: -0.16 },
    description: "减少参与组织，专注禁区和防线身后的终结机会。",
    descriptionEn: "Offers little build-up involvement and focuses on finishing in and behind the box.",
  }),
  st_target: detail({
    slotPositions: ["ST", "CF"], duties: ["support", "attack"], defaultDuty: "support",
    attributes: ["strength", "heading", "positioning", "passing", "finishing"],
    preferredHabits: ["comes_deep"], tags: ["direct", "counter", "secure"],
    behavior: { hold: 0.68, support: 0.52, depth: -0.08 },
    description: "背身保护长传和直接球，为队友提供向前支点。",
    descriptionEn: "Protects direct passes with back to goal and provides a focal point for runners.",
  }),
  st_pressing: detail({
    slotPositions: ["ST", "CF"], duties: ["defend", "support", "attack"], defaultDuty: "support",
    attributes: ["stamina", "pace", "strength", "tackling", "decisions"],
    preferredHabits: ["dives_into_tackles", "gets_forward"], tags: ["intense", "pressing", "runner"],
    behavior: { press: 0.78, tackle: 0.24, depth: 0.2 },
    description: "从锋线发起压迫，迫使对方后场仓促处理。",
    descriptionEn: "Leads the press from the front and forces rushed opposition build-up.",
  }),
  st_false9: detail({
    slotPositions: ["ST", "CF"], duties: ["support"], attributes: ["passing", "vision", "dribbling", "decisions", "finishing"],
    preferredHabits: ["comes_deep", "plays_one_twos", "tries_through_balls"], conflictingHabits: ["gets_forward"],
    tags: ["controlled", "playmaker", "build-up"], behavior: { support: 0.76, depth: -0.36, passRisk: 0.34, carry: 0.08 },
    description: "主动回撤离开中锋线，连接中场并为队友拉开纵深。",
    descriptionEn: "Drops away from the striker line to link midfield and open depth for runners.",
  }),
});

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function roleFallbackPositions(roleId) {
  const pos = PLAYER_ROLES[roleId]?.pos;
  if (pos === "GK") return ["GK"];
  if (pos === "DEF") return ["LB", "CB", "RB"];
  if (pos === "MID") return ["DM", "CM", "LM", "RM", "AM"];
  return ["LW", "RW", "CF", "ST"];
}

export function roleDetail(roleId) {
  return ROLE_DETAILS[roleId] || detail({ slotPositions: roleFallbackPositions(roleId) });
}

export function dutyDefinition(dutyId) {
  return PLAYER_DUTIES[dutyId] || PLAYER_DUTIES.support;
}

export function dutyLabel(dutyId, lang = "zh") {
  const duty = dutyDefinition(dutyId);
  return lang === "en" ? duty.labelEn : duty.label;
}

export function dutyShort(dutyId, lang = "zh") {
  const duty = dutyDefinition(dutyId);
  return lang === "en" ? duty.shortEn : duty.short;
}

export function roleDescription(roleId, lang = "zh") {
  const info = roleDetail(roleId);
  return lang === "en" ? info.descriptionEn : info.description;
}

export function roleFitsPosition(roleId, detailedPosition) {
  return roleDetail(roleId).slotPositions.includes(detailedPosition);
}

export function rolesForDetailedPosition(detailedPosition) {
  return Object.keys(PLAYER_ROLES).filter((roleId) => roleFitsPosition(roleId, detailedPosition));
}

export function normalizeDutyForRole(roleId, dutyId) {
  const info = roleDetail(roleId);
  return info.duties.includes(dutyId) ? dutyId : info.defaultDuty;
}

export function roleBehavior(roleId, dutyId) {
  const info = roleDetail(roleId);
  const duty = dutyDefinition(normalizeDutyForRole(roleId, dutyId));
  const keys = new Set([...Object.keys(info.behavior), ...Object.keys(duty.behavior)]);
  return Object.fromEntries(
    [...keys].map((key) => [key, clamp((info.behavior[key] || 0) + (duty.behavior[key] || 0), -1, 1)])
  );
}

function attributeValue(player, key) {
  return clamp(player?.attrs?.[key] ?? player?.[key] ?? 10, 1, 20);
}

export function roleHabitFit(player, roleId) {
  ensurePlayerHabits(player);
  const habits = new Set(player?.playingHabits || []);
  const info = roleDetail(roleId);
  const matched = info.preferredHabits.filter((habitId) => habits.has(habitId));
  const conflicts = info.conflictingHabits.filter((habitId) => habits.has(habitId));
  return { matched, conflicts, score: matched.length * 1.15 - conflicts.length * 1.45 };
}

export function roleSuitability(player, roleId, dutyId, detailedPosition) {
  const info = roleDetail(roleId);
  if (!player || !info.slotPositions.includes(detailedPosition)) {
    return { rating: 1, attributeRating: 1, habitScore: 0, matched: [], conflicts: [] };
  }
  const values = info.attributes.map((key) => attributeValue(player, key));
  const attributeRating = values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : Number(player.ovr) || 10;
  const habit = roleHabitFit(player, roleId);
  const duty = normalizeDutyForRole(roleId, dutyId);
  const dutyAdjustment = duty === "attack"
    ? (attributeValue(player, "pace") + attributeValue(player, "stamina") + attributeValue(player, "decisions")) / 60 - 0.5
    : duty === "defend"
      ? (attributeValue(player, "positioning") + attributeValue(player, "strength") + attributeValue(player, "decisions")) / 60 - 0.5
      : 0;
  return {
    rating: clamp(Math.round(attributeRating + habit.score + dutyAdjustment), 1, 20),
    attributeRating: Math.round(attributeRating * 10) / 10,
    habitScore: habit.score,
    matched: habit.matched,
    conflicts: habit.conflicts,
  };
}

export function roleIdentityFit(roleId, identity) {
  const tags = roleDetail(roleId).tags;
  const preferred = new Set(identity?.roleTags || []);
  return tags.reduce((score, tag) => score + (preferred.has(tag) ? 1 : 0), 0);
}
