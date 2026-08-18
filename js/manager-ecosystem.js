/** 主教练足球理念、俱乐部匹配与 AI 绩效评估。 */

import { DIVISIONS, FORMATIONS } from "./data.js";
import { autoLineup, ensureLineupRoles, ensureTactics } from "./models.js";
import { positionFitForSlot, positionGroup, slotPositionCode } from "./player-positions.js";
import { shapeFormationSlotMap } from "./team-shapes.js";
import {
  roleDetail,
  roleIdentityFit,
  roleSuitability,
  rolesForDetailedPosition,
  normalizeDutyForRole,
} from "./player-roles.js";
import { generateBoardObjective } from "./board.js";

export const COACH_IDENTITY_VERSION = 2;
export const MANAGER_REVIEW_VERSION = 1;
const ACTIVE_PHASE_SHAPE_ADAPTABILITY = 5;
const PRE_MATCH_PHASE_MOVE_LIMIT = 8;

const ARCHETYPES = Object.freeze({
  controlled: Object.freeze({
    key: "controlled",
    label: "控球组织",
    labelEn: "Controlled possession",
    formations: ["4-2-3-1", "4-3-3", "3-5-2"],
    possessionFormations: ["3-4-3", "4-2-3-1", "3-5-2"],
    outOfPossessionFormations: ["4-1-4-1", "4-3-3", "4-5-1"],
    style: "possession",
    pressing: 4,
    tempo: 2,
    width: 4,
    defensiveLine: 4,
    roleTags: ["controlled", "build-up", "playmaker"],
  }),
  intense: Object.freeze({
    key: "intense",
    label: "主动压迫",
    labelEn: "Front-foot pressing",
    formations: ["4-3-3", "3-4-3", "4-2-3-1"],
    possessionFormations: ["3-4-3", "4-3-3", "4-2-3-1"],
    outOfPossessionFormations: ["4-1-4-1", "4-3-3", "4-4-2"],
    style: "attack",
    pressing: 5,
    tempo: 4,
    width: 4,
    defensiveLine: 5,
    roleTags: ["intense", "pressing", "runner", "attacking"],
  }),
  counter: Object.freeze({
    key: "counter",
    label: "快速反击",
    labelEn: "Direct counterattack",
    formations: ["4-2-3-1", "4-5-1", "5-3-2"],
    possessionFormations: ["3-5-2", "4-2-3-1", "4-3-3"],
    outOfPossessionFormations: ["5-3-2", "4-5-1", "4-1-4-1"],
    style: "counter",
    pressing: 2,
    tempo: 4,
    width: 3,
    defensiveLine: 2,
    roleTags: ["counter", "direct", "runner", "secure"],
  }),
  compact: Object.freeze({
    key: "compact",
    label: "紧凑防守",
    labelEn: "Compact defending",
    formations: ["4-1-4-1", "5-3-2", "4-4-2"],
    possessionFormations: ["3-5-2", "4-4-2", "4-2-3-1"],
    outOfPossessionFormations: ["5-3-2", "4-5-1", "4-1-4-1"],
    style: "defend",
    pressing: 2,
    tempo: 2,
    width: 2,
    defensiveLine: 2,
    roleTags: ["compact", "secure", "pressing"],
  }),
  direct: Object.freeze({
    key: "direct",
    label: "直接进攻",
    labelEn: "Direct attacking",
    formations: ["4-4-2", "3-5-2", "4-3-3"],
    possessionFormations: ["3-4-3", "3-5-2", "4-4-2"],
    outOfPossessionFormations: ["4-4-2", "5-3-2", "4-5-1"],
    style: "attack",
    pressing: 3,
    tempo: 5,
    width: 4,
    defensiveLine: 3,
    roleTags: ["direct", "wide", "attacking"],
  }),
  balanced: Object.freeze({
    key: "balanced",
    label: "均衡应变",
    labelEn: "Balanced adaptation",
    formations: ["4-2-3-1", "4-3-3", "4-4-2"],
    possessionFormations: ["4-2-3-1", "4-3-3", "3-5-2"],
    outOfPossessionFormations: ["4-1-4-1", "4-4-2", "4-5-1"],
    style: "balanced",
    pressing: 3,
    tempo: 3,
    width: 3,
    defensiveLine: 3,
    roleTags: ["balanced", "secure", "build-up"],
  }),
});

const ARCHETYPE_KEYS = Object.freeze(Object.keys(ARCHETYPES));

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function stableHash(value) {
  let hash = 2166136261;
  for (const char of String(value || "coach")) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function stableLevel(seed, offset = "") {
  return 1 + (stableHash(`${seed}:${offset}`) % 5);
}

function validFormationList(value, fallback) {
  const formations = Array.isArray(value)
    ? [...new Set(value.filter((formation) => FORMATIONS[formation]))]
    : [];
  return formations.length ? formations.slice(0, 3) : [...fallback];
}

export function ensureCoachIdentity(coach) {
  if (!coach || coach.role !== "coach") return null;
  const seed = coach.id || coach.name || "coach";
  const existing = coach.footballIdentity && typeof coach.footballIdentity === "object"
    ? coach.footballIdentity
    : {};
  const archetype = ARCHETYPES[existing.archetype]
    || ARCHETYPES[ARCHETYPE_KEYS[stableHash(`${seed}:archetype`) % ARCHETYPE_KEYS.length]];
  const rating = clamp(coach.rating || 8, 1, 20);
  const experience = Number(coach.age || 42) >= 48 ? 1 : 0;
  const adaptabilityBase = stableLevel(seed, "adaptability");
  const adaptability = clamp(adaptabilityBase + (rating >= 15 ? 1 : 0) + experience, 1, 5);
  coach.footballIdentity = {
    version: COACH_IDENTITY_VERSION,
    archetype: archetype.key,
    label: archetype.label,
    labelEn: archetype.labelEn,
    preferredFormations: validFormationList(existing.preferredFormations, archetype.formations),
    phaseFormations: {
      possession: validFormationList(
        existing.phaseFormations?.possession,
        archetype.possessionFormations
      ),
      outOfPossession: validFormationList(
        existing.phaseFormations?.outOfPossession,
        archetype.outOfPossessionFormations
      ),
    },
    style: archetype.style,
    pressing: clamp(existing.pressing ?? archetype.pressing, 1, 5),
    tempo: clamp(existing.tempo ?? archetype.tempo, 1, 5),
    width: clamp(existing.width ?? archetype.width, 1, 5),
    defensiveLine: clamp(existing.defensiveLine ?? archetype.defensiveLine, 1, 5),
    roleTags: Array.isArray(existing.roleTags)
      ? [...new Set(existing.roleTags.filter((tag) => typeof tag === "string"))].slice(0, 8)
      : [...archetype.roleTags],
    youthTrust: clamp(existing.youthTrust ?? stableLevel(seed, "youth"), 1, 5),
    rotation: clamp(existing.rotation ?? stableLevel(seed, "rotation"), 1, 5),
    adaptability: clamp(existing.adaptability ?? adaptability, 1, 5),
  };
  return coach.footballIdentity;
}

export function coachIdentitySummary(coach, lang = "zh") {
  const identity = ensureCoachIdentity(coach);
  if (!identity) return lang === "en" ? "No coaching identity" : "无执教理念";
  const label = lang === "en" ? identity.labelEn : identity.label;
  return `${label} · ${identity.preferredFormations.join(" / ")}`;
}

export function coachIdentityFacts(coach, lang = "zh") {
  const identity = ensureCoachIdentity(coach);
  if (!identity) return [];
  if (lang === "en") {
    return [
      `Identity: ${identity.labelEn}`,
      `Preferred shapes: ${identity.preferredFormations.join(" / ")}`,
      `Phase shapes: ${identity.phaseFormations.possession.join(" / ")} in possession · ${identity.phaseFormations.outOfPossession.join(" / ")} without the ball`,
      `Base instructions: press ${identity.pressing}, tempo ${identity.tempo}, width ${identity.width}, line ${identity.defensiveLine}`,
      `Youth trust ${identity.youthTrust}/5 · rotation ${identity.rotation}/5 · adaptability ${identity.adaptability}/5`,
    ];
  }
  return [
    `足球理念：${identity.label}`,
    `偏好阵型：${identity.preferredFormations.join(" / ")}`,
    `阶段阵型：持球 ${identity.phaseFormations.possession.join(" / ")} · 无球 ${identity.phaseFormations.outOfPossession.join(" / ")}`,
    `基础指令：压迫 ${identity.pressing}、节奏 ${identity.tempo}、宽度 ${identity.width}、防线 ${identity.defensiveLine}`,
    `青训信任 ${identity.youthTrust}/5 · 轮换倾向 ${identity.rotation}/5 · 应变 ${identity.adaptability}/5`,
  ];
}

function formationSquadFit(club, formationId, cache = null) {
  if (cache?.has(formationId)) return cache.get(formationId);
  const formation = FORMATIONS[formationId];
  if (!formation) return -Infinity;
  const players = (club?.players || []).filter(
    (player) => !(player.injured > 0) && !(player.suspendedMatches > 0)
  );
  const used = new Set();
  let score = 0;
  for (const slot of formation.slots || []) {
    let picked = null;
    for (const player of players) {
      if (used.has(player.id)) continue;
      const sameGroup = positionGroup(player.pos) === positionGroup(slot.pos);
      const fit = positionFitForSlot(player, slot, formation.slots).rating;
      const candidateScore = (Number(player.ovr) || 10) * 0.75 + fit * 0.5 + (sameGroup ? 5 : -14);
      if (!picked || candidateScore > picked.score) picked = { player, score: candidateScore };
    }
    if (!picked) {
      score -= 30;
      continue;
    }
    used.add(picked.player.id);
    score += picked.score;
  }
  cache?.set(formationId, score);
  return score;
}

export function preferredCoachFormation(coach, club) {
  const identity = ensureCoachIdentity(coach);
  if (!identity) return club?.tactics?.formation || "4-3-3";
  const candidates = [...identity.preferredFormations];
  if (
    identity.adaptability >= 4
    && FORMATIONS[club?.tactics?.formation]
    && !candidates.includes(club.tactics.formation)
  ) {
    candidates.push(club.tactics.formation);
  }
  return candidates
    .map((formation, index) => ({
      formation,
      score: formationSquadFit(club, formation) + Math.max(0, 12 - index * 4),
    }))
    .sort((a, b) => b.score - a.score)[0]?.formation || identity.preferredFormations[0] || "4-3-3";
}

function phaseFormationFacts(formationId) {
  const slots = FORMATIONS[formationId]?.slots || [];
  const outfield = slots.filter((slot) => slot.pos !== "GK");
  return {
    defenders: outfield.filter((slot) => slot.pos === "DEF").length,
    midfielders: outfield.filter((slot) => slot.pos === "MID").length,
    attackers: outfield.filter((slot) => slot.pos === "ATT").length,
    widePlayers: outfield.filter((slot) => Number(slot.x) <= 20 || Number(slot.x) >= 80).length,
    averageDepth: outfield.length
      ? outfield.reduce((sum, slot) => sum + Number(slot.y || 50), 0) / outfield.length
      : 50,
  };
}

function phaseLineupFit(club, baseFormationId, targetFormationId) {
  const baseSlots = FORMATIONS[baseFormationId]?.slots || [];
  const targetSlots = FORMATIONS[targetFormationId]?.slots || [];
  const slotMap = shapeFormationSlotMap(baseFormationId, targetFormationId);
  const playerById = new Map((club?.players || []).map((player) => [player.id, player]));
  let total = 0;
  let count = 0;
  for (let baseIndex = 1; baseIndex < baseSlots.length; baseIndex++) {
    const player = playerById.get(club?.tactics?.lineup?.[baseIndex]);
    const targetSlot = targetSlots[slotMap[baseIndex]];
    if (!player || !targetSlot) continue;
    total += positionFitForSlot(player, targetSlot, targetSlots).rating;
    count++;
  }
  return count ? total / count : 10;
}

function phaseMovementDistance(baseFormationId, targetFormationId) {
  const baseSlots = FORMATIONS[baseFormationId]?.slots || [];
  const targetSlots = FORMATIONS[targetFormationId]?.slots || [];
  const slotMap = shapeFormationSlotMap(baseFormationId, targetFormationId);
  let total = 0;
  let count = 0;
  for (let baseIndex = 1; baseIndex < baseSlots.length; baseIndex++) {
    const source = baseSlots[baseIndex];
    const target = targetSlots[slotMap[baseIndex]];
    if (!source || !target) continue;
    total += Math.hypot(Number(source.x) - Number(target.x), Number(source.y) - Number(target.y));
    count++;
  }
  return count ? total / count : 0;
}

function phaseFormationCandidates(identity, baseFormationId, phase) {
  const preferences = identity?.phaseFormations?.[phase] || [];
  const candidates = new Set([baseFormationId, ...preferences, ...(identity?.preferredFormations || [])]);
  if (Number(identity?.adaptability || 3) >= 4) {
    for (const formationId of Object.keys(FORMATIONS)) candidates.add(formationId);
  }
  return [...candidates].filter((formationId) => FORMATIONS[formationId]);
}

function phaseFormationScore(club, identity, formationId, phase, context) {
  const baseFormationId = context.baseFormationId;
  const preferences = identity?.phaseFormations?.[phase] || [];
  const preferenceIndex = preferences.indexOf(formationId);
  const facts = phaseFormationFacts(formationId);
  const opponentTactics = context.opponent?.tactics || {};
  const opponentFormationId = phase === "possession"
    ? (opponentTactics.outOfPossessionFormation || opponentTactics.formation)
    : (opponentTactics.possessionFormation || opponentTactics.formation);
  const opponentFacts = phaseFormationFacts(opponentFormationId);
  const style = club?.tactics?.style || identity?.style || "balanced";
  const adaptability = Number(identity?.adaptability || 3);
  const scoreGap = Number(context.scoreGap) || 0;
  const scoreUrgency = Math.min(3, Math.abs(scoreGap));
  const minute = Number(context.minute) || 0;
  const strengthGap = (Number(club?.power) || 50) - (Number(context.opponent?.power) || 50);

  let score = preferenceIndex >= 0 ? 20 - preferenceIndex * 6 : -7;
  score += (phaseLineupFit(club, baseFormationId, formationId) - 10) * 0.8;
  // 阶段阵型是连续站位目标；过大的整队换位会制造不真实的追球和门将威胁窗口。
  score -= phaseMovementDistance(baseFormationId, formationId) * 0.22;
  if (formationId === baseFormationId) score += Math.max(0, 4 - adaptability) * 4;

  if (phase === "possession") {
    const attackingIntent = style === "attack" ? 2.2 : style === "counter" ? 1.5 : style === "possession" ? 1.1 : style === "defend" ? 0.2 : 0.8;
    score += facts.attackers * attackingIntent;
    if (style === "possession") score += facts.midfielders * 0.8;
    if (scoreGap < 0) score += facts.attackers * (minute >= 60 ? 3.2 : 1.8) * scoreUrgency;
    if (strengthGap >= 12) score += facts.attackers * 0.7;
    if (opponentFacts.defenders >= 5) score += facts.midfielders * 0.45 + facts.attackers * 0.35;
    score += Math.max(0, 50 - facts.averageDepth) * 0.04;
  } else {
    const defensiveIntent = style === "defend" ? 2.2 : style === "counter" ? 1.7 : 1.0;
    score += facts.defenders * defensiveIntent + facts.midfielders * 0.3;
    if (scoreGap > 0) score += facts.defenders * (minute >= 60 ? 3.2 : 1.8) * scoreUrgency;
    if (strengthGap <= -12) score += facts.defenders * 0.75;
    if (opponentFacts.attackers >= 3) score += Math.min(facts.defenders, opponentFacts.attackers + 1) * 0.75;
    if (Number(opponentTactics.width || 3) >= 4) score += facts.widePlayers * 0.55;
    if (scoreGap < 0 && minute >= 60) score -= facts.defenders * 1.4 * scoreUrgency;
    score += Math.max(0, facts.averageDepth - 50) * 0.03;
  }
  return score;
}

/**
 * Select phase formations from public coach, lineup, opponent and score facts.
 * The selected values only drive team-shape geometry in the spatial engine.
 */
export function coachPhaseFormationPlan(club, coach, options = {}) {
  const identity = ensureCoachIdentity(coach);
  if (!club || !identity) return { ok: false, msg: "missing coach identity" };
  ensureTactics(club);
  const baseFormationId = FORMATIONS[options.baseFormation || club.tactics.formation]
    ? (options.baseFormation || club.tactics.formation)
    : "4-3-3";
  const context = {
    baseFormationId,
    opponent: options.opponent || null,
    scoreGap: Number(options.scoreGap) || 0,
    minute: Number(options.minute) || 0,
  };
  const choose = (phase) => phaseFormationCandidates(identity, baseFormationId, phase)
    .map((formationId) => ({
      formationId,
      score: phaseFormationScore(club, identity, formationId, phase, context),
    }))
    .sort((left, right) => right.score - left.score || left.formationId.localeCompare(right.formationId))[0]?.formationId || baseFormationId;
  const effectivePossessionFormation = choose("possession");
  const effectiveOutOfPossessionFormation = choose("outOfPossession");
  return {
    ok: true,
    identity,
    baseFormation: baseFormationId,
    possessionFormation: effectivePossessionFormation === baseFormationId ? null : effectivePossessionFormation,
    outOfPossessionFormation: effectiveOutOfPossessionFormation === baseFormationId ? null : effectiveOutOfPossessionFormation,
    effectivePossessionFormation,
    effectiveOutOfPossessionFormation,
    context: {
      opponentId: context.opponent?.id || null,
      scoreGap: context.scoreGap,
      minute: context.minute,
    },
  };
}

export function applyCoachPhaseFormations(club, coach, options = {}) {
  const plan = coachPhaseFormationPlan(club, coach, options);
  if (!plan.ok) return plan;
  // 分离的阶段阵型要求最高应变能力；其余教练继续使用更稳定的基础阵型。
  const usePhaseShapes = Number(plan.identity?.adaptability || 3) >= ACTIVE_PHASE_SHAPE_ADAPTABILITY;
  const matchContextActive = Math.abs(Number(plan.context?.scoreGap) || 0) > 0
    || Number(plan.context?.minute) >= 45;
  const possessionMoveAllowed = matchContextActive;
  const outOfPossessionMoveAllowed = matchContextActive
    || phaseMovementDistance(plan.baseFormation, plan.effectiveOutOfPossessionFormation) <= PRE_MATCH_PHASE_MOVE_LIMIT;
  const appliedPlan = usePhaseShapes
    ? {
      ...plan,
      possessionFormation: possessionMoveAllowed ? plan.possessionFormation : null,
      outOfPossessionFormation: outOfPossessionMoveAllowed ? plan.outOfPossessionFormation : null,
      effectivePossessionFormation: possessionMoveAllowed ? plan.effectivePossessionFormation : plan.baseFormation,
      effectiveOutOfPossessionFormation: outOfPossessionMoveAllowed ? plan.effectiveOutOfPossessionFormation : plan.baseFormation,
      selectionSuppressed: !possessionMoveAllowed || !outOfPossessionMoveAllowed,
    }
    : {
      ...plan,
      possessionFormation: null,
      outOfPossessionFormation: null,
      effectivePossessionFormation: plan.baseFormation,
      effectiveOutOfPossessionFormation: plan.baseFormation,
      selectionSuppressed: true,
    };
  const before = {
    possessionFormation: club.tactics.possessionFormation ?? null,
    outOfPossessionFormation: club.tactics.outOfPossessionFormation ?? null,
  };
  club.tactics.possessionFormation = appliedPlan.possessionFormation;
  club.tactics.outOfPossessionFormation = appliedPlan.outOfPossessionFormation;
  club.tactics.coachPhaseIdentityId = coach.id;
  club.tactics.coachPhaseIdentityVersion = plan.identity.version;
  return {
    ...appliedPlan,
    changed:
      before.possessionFormation !== appliedPlan.possessionFormation
      || before.outOfPossessionFormation !== appliedPlan.outOfPossessionFormation,
  };
}

function dutyPreference(identity, roleId, dutyId) {
  const style = identity?.style || identity?.archetype;
  const role = roleDetail(roleId);
  const preference = style === "defend" || identity?.archetype === "compact"
    ? "defend"
    : style === "counter"
      ? (role.tags.includes("secure") ? "support" : "attack")
      : style === "attack" || identity?.archetype === "intense" || identity?.archetype === "direct"
        ? "attack"
        : "support";
  return dutyId === preference ? 1.7 : dutyId === "support" ? 0.55 : 0;
}

/** 按教练理念、球员属性和个人习惯给当前首发槽分配角色与职责。 */
export function assignCoachLineupRoles(club, coach, { force = false } = {}) {
  if (!club || !coach) return { ok: false, assignments: [] };
  const identity = ensureCoachIdentity(coach);
  ensureTactics(club);
  ensureLineupRoles(club);
  const formation = FORMATIONS[club.tactics.formation] || FORMATIONS["4-3-3"];
  const assignments = [];
  for (let index = 0; index < formation.slots.length; index++) {
    const slot = formation.slots[index];
    const playerId = club.tactics.lineup?.[index];
    const player = club.players?.find((item) => item.id === playerId);
    if (!player) continue;
    const detailed = slotPositionCode(slot, index, formation.slots);
    const candidateIds = rolesForDetailedPosition(detailed);
    const candidates = [];
    for (const roleId of candidateIds) {
      const info = roleDetail(roleId);
      for (const dutyId of info.duties) {
        const fit = roleSuitability(player, roleId, dutyId, detailed);
        const score =
          fit.rating +
          roleIdentityFit(roleId, identity) * 2.2 +
          dutyPreference(identity, roleId, dutyId) +
          (roleId === club.tactics.roles?.[index] && !force ? 0.4 : 0);
        candidates.push({ roleId, dutyId, score, fit });
      }
    }
    candidates.sort((left, right) =>
      right.score - left.score || left.roleId.localeCompare(right.roleId) || left.dutyId.localeCompare(right.dutyId)
    );
    const chosen = candidates[0];
    if (!chosen) continue;
    club.tactics.roles[index] = chosen.roleId;
    if (!Array.isArray(club.tactics.duties)) club.tactics.duties = [];
    club.tactics.duties[index] = normalizeDutyForRole(chosen.roleId, chosen.dutyId);
    assignments.push({
      slot: index,
      playerId,
      detailedPosition: detailed,
      roleId: chosen.roleId,
      dutyId: club.tactics.duties[index],
      fit: chosen.fit,
    });
  }
  club.tactics.coachRoleIdentityId = coach.id;
  club.tactics.coachRoleIdentityVersion = COACH_IDENTITY_VERSION;
  return { ok: true, assignments, identity };
}

export function applyCoachTacticalIdentity(club, coach, options = {}) {
  const identity = ensureCoachIdentity(coach);
  if (!club || !identity) return { ok: false, msg: "missing coach identity" };
  ensureTactics(club);
  if (
    !options.force
    && club.tactics.coachIdentityId === coach.id
    && club.tactics.coachIdentityVersion === COACH_IDENTITY_VERSION
  ) {
    const phasePlan = applyCoachPhaseFormations(club, coach, options);
    return { ok: true, unchanged: !phasePlan.changed, identity, formation: club.tactics.formation, phasePlan };
  }
  const formation = preferredCoachFormation(coach, club);
  club.tactics.formation = formation;
  club.tactics.style = identity.style;
  club.tactics.pressing = identity.pressing;
  club.tactics.tempo = identity.tempo;
  club.tactics.width = identity.width;
  club.tactics.defensiveLine = identity.defensiveLine;
  club.tactics.coachIdentityId = coach.id;
  club.tactics.coachIdentityVersion = COACH_IDENTITY_VERSION;
  ensureLineupRoles(club, { reset: true });
  if (options.rebuildLineup !== false) autoLineup(club);
  assignCoachLineupRoles(club, coach, { force: true });
  const phasePlan = applyCoachPhaseFormations(club, coach, options);
  return { ok: true, identity, formation, phasePlan };
}

const PLAN_ARCHETYPE_FIT = Object.freeze({
  compete: new Set(["controlled", "intense", "balanced"]),
  youth: new Set(["controlled", "intense", "balanced"]),
  rebuild: new Set(["balanced", "controlled", "counter"]),
  sustainable: new Set(["counter", "compact", "balanced"]),
  attacking: new Set(["controlled", "intense", "direct"]),
  resilient: new Set(["counter", "compact", "balanced"]),
  balanced: new Set(["balanced", "controlled", "counter"]),
});

export function coachClubFitScore(coach, club, options = {}) {
  const identity = ensureCoachIdentity(coach);
  if (!identity || !club) return -Infinity;
  const planKey = club.seasonPlan?.key || "balanced";
  const styleFit = PLAN_ARCHETYPE_FIT[planKey]?.has(identity.archetype) ? 10 : 0;
  const youthFit = planKey === "youth" || planKey === "rebuild"
    ? identity.youthTrust * 2
    : identity.adaptability;
  const formationFit = Math.max(
    ...identity.preferredFormations.map((formation) =>
      formationSquadFit(club, formation, options.formationFitCache)
    )
  );
  return (Number(coach.rating) || 8) * 4 + styleFit + youthFit + formationFit * 0.08;
}

function activeTenure(coach) {
  return (coach?.history || []).find((item) => item && item.toDay == null) || null;
}

function recordManagerEvent(club, event) {
  if (!Array.isArray(club.managerHistory)) club.managerHistory = [];
  const duplicate = club.managerHistory.some(
    (item) => item.type === event.type && item.coachId === event.coachId && item.day === event.day && item.season === event.season
  );
  if (!duplicate) club.managerHistory.unshift(event);
  if (club.managerHistory.length > 40) club.managerHistory.length = 40;
}

export function noteCoachDeparture(world, club, coach, reason, facts = null) {
  if (!club || !coach) return;
  const tenure = activeTenure(coach);
  if (tenure) {
    tenure.exitReason = reason || "left club";
    if (facts) {
      tenure.finalPosition = facts.position;
      tenure.targetPosition = facts.targetPosition;
      tenure.played = facts.played;
    }
  }
  recordManagerEvent(club, {
    type: "departure",
    season: Number(world?.season) || null,
    day: Number(world?.day) || 1,
    coachId: coach.id,
    coachName: coach.name,
    reason: reason || "left club",
    facts: facts ? { ...facts } : null,
  });
}

export function noteCoachAppointment(world, club, coach, reason = "appointment") {
  if (!club || !coach) return null;
  ensureCoachIdentity(coach);
  const season = Number(world?.season) || null;
  const existingReview = club.managerReview?.season === season ? club.managerReview : null;
  const review = existingReview || ensureManagerReview(world, club);
  const changed = !existingReview || review.coachId !== coach.id;
  if (changed) {
    review.coachId = coach.id;
    review.warnings = 0;
    review.status = coach.isCaretaker ? "caretaker" : "new_appointment";
    review.appointedDay = Number(world?.day) || 1;
    review.graceUntilDay = coach.isCaretaker ? review.appointedDay : review.appointedDay + 28;
    review.vacancySinceDay = coach.isCaretaker ? review.appointedDay : null;
    review.vacancySinceSeason = coach.isCaretaker ? Number(world?.season) || null : null;
    review.lastEvaluation = null;
    review.lastCheckDay = 0;
    recordManagerEvent(club, {
      type: "appointment",
      season: Number(world?.season) || null,
      day: Number(world?.day) || 1,
      coachId: coach.id,
      coachName: coach.name,
      caretaker: !!coach.isCaretaker,
      reason,
      identity: coach.footballIdentity?.archetype || null,
    });
  }
  const tenure = activeTenure(coach);
  if (tenure && !tenure.appointmentReason) tenure.appointmentReason = reason;
  return review;
}

export function ensureManagerReview(world, club) {
  if (!club) return null;
  const season = Number(world?.season) || null;
  const coach = club.staff?.coach || null;
  if (
    !club.managerReview
    || typeof club.managerReview !== "object"
    || club.managerReview.season !== season
  ) {
    const objective = generateBoardObjective(club, world?.clubs || [club], season);
    club.managerReview = {
      version: MANAGER_REVIEW_VERSION,
      season,
      targetType: objective.type,
      targetPosition: objective.targetPos,
      targetLabel: objective.label,
      coachId: coach?.id || null,
      appointedDay: Number(coach?.joinedDay) || Number(world?.day) || 1,
      graceUntilDay: 0,
      vacancySinceDay: coach?.isCaretaker ? Number(world?.day) || 1 : null,
      vacancySinceSeason: coach?.isCaretaker
        ? Number(coach.joinedSeason) || season
        : null,
      lastCheckDay: 0,
      warnings: 0,
      status: coach?.isCaretaker ? "caretaker" : "stable",
      lastEvaluation: null,
    };
  }
  const review = club.managerReview;
  review.version = MANAGER_REVIEW_VERSION;
  review.warnings = clamp(review.warnings, 0, 4);
  if (!Number.isFinite(Number(review.targetPosition))) {
    review.targetPosition = generateBoardObjective(club, world?.clubs || [club], season).targetPos;
  }
  if (coach && review.coachId !== coach.id) {
    noteCoachAppointment(world, club, coach, coach.isCaretaker ? "caretaker" : "appointment");
  }
  return review;
}

export function managerPerformanceFacts(world, club) {
  const divisionClubs = (world?.clubs || []).filter(
    (item) => Number(item.division || 3) === Number(club?.division || 3)
  );
  const sorted = divisionClubs
    .map((item) => {
      const row = world?.table?.[item.id] || {};
      return {
        id: item.id,
        pts: Number(row.pts) || 0,
        played: Number(row.played) || 0,
        gf: Number(row.gf) || 0,
        ga: Number(row.ga) || 0,
      };
    })
    .sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf);
  const position = Math.max(1, sorted.findIndex((item) => item.id === club.id) + 1);
  const row = sorted.find((item) => item.id === club.id) || { pts: 0, played: 0, gf: 0, ga: 0 };
  const review = ensureManagerReview(world, club);
  const form = (club.form || []).slice(-5);
  const recentPoints = form.reduce(
    (sum, result) => sum + (result === "W" ? 3 : result === "D" ? 1 : 0),
    0
  );
  const relegate = Number(DIVISIONS[club.division || 3]?.relegate) || 0;
  return {
    position,
    teams: sorted.length,
    played: row.played,
    points: row.pts,
    goalDifference: row.gf - row.ga,
    goalDifferencePerMatch: row.played ? (row.gf - row.ga) / row.played : 0,
    targetPosition: Number(review.targetPosition) || sorted.length,
    targetGap: position - (Number(review.targetPosition) || sorted.length),
    recentMatches: form.length,
    recentPoints,
    recentPpg: form.length ? recentPoints / form.length : 0,
    relegated: relegate > 0 && position > sorted.length - relegate,
  };
}

function performanceReasons(facts) {
  const reasons = [];
  if (facts.targetGap >= 3) reasons.push(`排名落后目标 ${facts.targetGap} 位`);
  if (facts.recentMatches >= 5 && facts.recentPpg < 0.8) reasons.push(`近五场仅 ${facts.recentPoints} 分`);
  if (facts.goalDifferencePerMatch <= -0.8) reasons.push("场均净胜球明显为负");
  if (facts.relegated) reasons.push("处于降级区");
  return reasons;
}

export function evaluateManagerPerformance(world, club, options = {}) {
  const review = ensureManagerReview(world, club);
  const coach = club?.staff?.coach;
  if (!review || !coach || coach.isCaretaker) {
    return { reviewed: false, dismiss: false, review, facts: null };
  }
  const day = Number(world?.day) || 1;
  const seasonEnd = !!options.seasonEnd;
  if (!seasonEnd && day - (Number(review.lastCheckDay) || 0) < 14) {
    return { reviewed: false, dismiss: false, review, facts: null };
  }
  const facts = managerPerformanceFacts(world, club);
  if (!seasonEnd && (facts.played < 8 || day < (Number(review.graceUntilDay) || 0))) {
    review.lastCheckDay = day;
    review.status = "protected";
    return { reviewed: true, dismiss: false, protected: true, review, facts };
  }

  let risk = 0;
  if (facts.targetGap >= 6) risk += 2.5;
  else if (facts.targetGap >= 3) risk += 1.5;
  else if (facts.targetGap >= 2) risk += 0.75;
  if (facts.recentMatches >= 5 && facts.recentPpg < 0.6) risk += 1.5;
  else if (facts.recentMatches >= 5 && facts.recentPpg < 1 && facts.targetGap >= 2) risk += 0.75;
  if (facts.goalDifferencePerMatch <= -1) risk += 1;
  else if (facts.goalDifferencePerMatch <= -0.6) risk += 0.5;
  if (facts.relegated) risk += 1;

  if (risk >= 3.5) review.warnings = clamp(review.warnings + 2, 0, 4);
  else if (risk >= 2) review.warnings = clamp(review.warnings + 1, 0, 4);
  else if (facts.targetGap <= 1 || (facts.recentMatches >= 5 && facts.recentPpg >= 1.6)) {
    review.warnings = clamp(review.warnings - 1, 0, 4);
  }

  const tenureDays = Math.max(0, day - (Number(review.appointedDay) || 1));
  const seasonFailure = seasonEnd && facts.played >= 10 && (facts.targetGap >= 4 || facts.relegated);
  const sustainedFailure = review.warnings >= 3 && tenureDays >= 42;
  const dismiss = seasonFailure || sustainedFailure;
  const reasons = performanceReasons(facts);
  review.lastCheckDay = day;
  review.status = dismiss
    ? "dismiss"
    : review.warnings >= 2
      ? "danger"
      : review.warnings >= 1
        ? "pressure"
        : "stable";
  review.lastEvaluation = {
    season: Number(world?.season) || null,
    day,
    risk: Math.round(risk * 100) / 100,
    warnings: review.warnings,
    reasons,
    facts: { ...facts },
  };
  return { reviewed: true, dismiss, reasons, risk, review, facts, seasonEnd };
}

export function managerReviewLabel(review, lang = "zh") {
  const status = review?.status || "stable";
  const labels = {
    stable: ["职位稳定", "Secure"],
    protected: ["任命保护期", "New appointment"],
    new_appointment: ["新任主教练", "New appointment"],
    pressure: ["承受压力", "Under pressure"],
    danger: ["帅位危险", "Job at risk"],
    dismiss: ["决定解雇", "Dismissal decided"],
    caretaker: ["看守教练", "Caretaker"],
  };
  return labels[status]?.[lang === "en" ? 1 : 0] || labels.stable[lang === "en" ? 1 : 0];
}

export { ARCHETYPES as COACH_ARCHETYPES };
