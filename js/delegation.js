/** 职责委托：只决定谁写入训练、阵容和战术，不提供比赛或能力隐藏加成。 */

import { FORMATIONS } from "./data.js";
import {
  autoLineup,
  ensureCorePlayer,
  ensureLineupRoles,
  ensureTactics,
} from "./models.js";
import { assistantTrainingPlan, setTraining } from "./training.js";
import { setTrainingMode } from "./training-boost.js";
import {
  assignCoachLineupRoles,
  ensureCoachIdentity,
  preferredCoachFormation,
} from "./manager-ecosystem.js";

const DEFAULT_DELEGATION = Object.freeze({
  training: "player",
  lineup: "player",
  tactics: "player",
  matchday: "player",
  development: "player",
});

const VALID = {
  training: new Set(["player", "staff"]),
  lineup: new Set(["player", "confirm", "staff"]),
  tactics: new Set(["player", "confirm", "staff"]),
  matchday: new Set(["player", "emergency", "staff"]),
  development: new Set(["player", "staff"]),
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function average(values, fallback = 0) {
  const nums = values.filter(Number.isFinite);
  return nums.length ? nums.reduce((sum, value) => sum + value, 0) / nums.length : fallback;
}

export function ensureDelegation(world, club) {
  if (!world || !club) return null;
  if (world.managementMode !== "club_director") world.managementMode = "head_coach";
  if (!club.delegation || typeof club.delegation !== "object") club.delegation = {};
  const delegation = club.delegation;
  for (const [key, fallback] of Object.entries(DEFAULT_DELEGATION)) {
    if (!VALID[key].has(delegation[key])) delegation[key] = fallback;
  }
  if (!delegation.locks || typeof delegation.locks !== "object") delegation.locks = {};
  delegation.locks.formation = !!delegation.locks.formation;
  delegation.locks.playerIds = Array.isArray(delegation.locks.playerIds)
    ? [...new Set(delegation.locks.playerIds.filter((id) => club.players?.some((p) => p.id === id)))]
    : [];
  if (delegation.locks.corePlayerId === undefined) delegation.locks.corePlayerId = null;
  if (!delegation.principles || typeof delegation.principles !== "object") delegation.principles = {};
  if (!new Set(["normal", "high"]).has(delegation.principles.youthPriority)) {
    delegation.principles.youthPriority = "normal";
  }
  if (!new Set(["balanced", "fitness", "strongest"]).has(delegation.principles.rotation)) {
    delegation.principles.rotation = "balanced";
  }
  if (!FORMATIONS[delegation.principles.preferredFormation]) {
    delegation.principles.preferredFormation = null;
  }
  if (!delegation.lastAppliedDay || typeof delegation.lastAppliedDay !== "object") {
    delegation.lastAppliedDay = {};
  }
  return delegation;
}

export function ensureWorldDelegation(world) {
  const club = world?.clubs?.find((item) => item.id === world.userClubId);
  return club ? ensureDelegation(world, club) : null;
}

export function delegationStaff(club) {
  if (!club) return null;
  return club.staff?.coach || null;
}

export function setManagementMode(world, club, mode) {
  ensureDelegation(world, club);
  if (!new Set(["head_coach", "club_director"]).has(mode)) {
    return { ok: false, msg: "无效管理模式" };
  }
  const coach = delegationStaff(club);
  if (mode === "club_director" && !coach) {
    return { ok: false, msg: "请先聘请主教练，再启用俱乐部经营模式" };
  }
  world.managementMode = mode;
  return { ok: true, mode, coach };
}

export function isFullyDelegated(world, club, responsibility) {
  const delegation = ensureDelegation(world, club);
  if (!delegationStaff(club)) return false;
  if (world.managementMode === "club_director") {
    return new Set(["training", "lineup", "tactics", "matchday", "development"]).has(responsibility);
  }
  return delegation?.[responsibility] === "staff";
}

export function shouldStaffHandleMatchday(world, club, { emergency = false } = {}) {
  const delegation = ensureDelegation(world, club);
  if (!delegationStaff(club)) return false;
  if (world.managementMode === "club_director") return true;
  return delegation.matchday === "staff" || (emergency && delegation.matchday === "emergency");
}

export function applyDelegatedTraining(world, club) {
  const delegation = ensureDelegation(world, club);
  if (!isFullyDelegated(world, club, "training")) return { ok: false, skipped: "player" };
  const plan = assistantTrainingPlan(world, club);
  setTraining(club, { focus: plan.focus, intensity: plan.intensity });
  const prepResult = setTrainingMode(club, plan.prepMode, world.day);
  delegation.lastAppliedDay.training = world.day;
  return { ok: true, plan, prepResult };
}

/** 教练团队执行培养原则：按年轻球员的潜力缺口选择一个可解释的周训练重点。 */
export function applyDelegatedDevelopment(world, club) {
  const delegation = ensureDelegation(world, club);
  if (!isFullyDelegated(world, club, "development")) return { ok: false, skipped: "player" };
  const candidates = (club.players || []).filter(
    (player) =>
      player.age <= 24 &&
      (player.potential || 0) > (player.ovr || 0) &&
      !(player.injured > 0)
  );
  const groups = {
    attack: new Set(["shooting", "finishing", "dribbling", "pace"]),
    defense: new Set(["tackling", "marking", "strength", "positioning"]),
    technical: new Set(["passing", "vision", "dribbling"]),
    fitness: new Set(["stamina", "pace", "strength"]),
    goalkeeping: new Set(["reflexes", "handling", "positioning", "kicking"]),
  };
  const totals = Object.fromEntries(Object.keys(groups).map((key) => [key, 0]));
  const focusPlayers = [];
  for (const player of candidates) {
    const attrs = player.attrs || {};
    let bestKey = player.pos === "GK" ? "goalkeeping" : "technical";
    let bestGap = -Infinity;
    for (const [key, keys] of Object.entries(groups)) {
      if (player.pos === "GK" && key !== "goalkeeping") continue;
      if (player.pos !== "GK" && key === "goalkeeping") continue;
      const relevant = [...keys];
      const gap = average(relevant.map((attr) =>
        Math.max(0, (player.potential || player.ovr || 0) - Number(attrs[attr] || 0))
      ));
      if (gap > bestGap) {
        bestGap = gap;
        bestKey = key;
      }
    }
    totals[bestKey] += Math.max(0.1, bestGap);
    focusPlayers.push({ id: player.id, focus: bestKey });
  }
  let focus = candidates.length
    ? Object.entries(totals).sort((a, b) => b[1] - a[1])[0]?.[0] || "balanced"
    : "balanced";
  if (delegation.principles.youthPriority === "high" && candidates.length >= 3) {
    // 高培养原则优先保证年轻人有明确重点，而不是回退到纯体能/恢复。
    focus = focus === "goalkeeping" ? focus : focus;
  }
  delegation.developmentPlan = {
    day: world.day,
    focus,
    playerIds: focusPlayers.map((item) => item.id),
    focusPlayers,
    reason: candidates.length
      ? `教练根据 ${candidates.length} 名年轻球员的潜力缺口安排${focus}专项`
      : "当前没有需要专项培养的年轻球员，保持综合发展",
    reasonEn: candidates.length
      ? `Staff selected ${focus} from the potential gaps of ${candidates.length} young players`
      : "No young player needs a focused plan, so the staff keeps development balanced",
  };
  delegation.lastAppliedDay.development = world.day;
  return { ok: true, plan: delegation.developmentPlan };
}

function formationFit(club, formation) {
  const available = (club.players || []).filter((p) => !(p.injured > 0) && !(p.suspendedMatches > 0));
  const byPos = { GK: 0, DEF: 0, MID: 0, ATT: 0 };
  for (const player of available) byPos[player.pos] = (byPos[player.pos] || 0) + 1;
  const need = { GK: 0, DEF: 0, MID: 0, ATT: 0 };
  for (const slot of formation.slots || []) need[slot.pos] = (need[slot.pos] || 0) + 1;
  let score = 0;
  for (const pos of Object.keys(need)) score += Math.min(byPos[pos], need[pos]) * 5 - Math.max(0, need[pos] - byPos[pos]) * 12;
  return score;
}

function chooseFormation(club, delegation, coach) {
  ensureTactics(club);
  if (delegation.locks.formation) return club.tactics.formation;
  if (delegation.principles.preferredFormation) return delegation.principles.preferredFormation;
  if (ensureCoachIdentity(coach)) return preferredCoachFormation(coach, club);
  return Object.entries(FORMATIONS)
    .sort((a, b) => formationFit(club, b[1]) - formationFit(club, a[1]))[0]?.[0] || "4-3-3";
}

function squadLevel(club) {
  const available = (club?.players || []).filter((p) => !(p.injured > 0));
  return average(available.map((p) => Number(p.ovr)), Number(club?.power || 50) / 5);
}

export function buildDelegatedTactics(world, club, fixture = null) {
  const delegation = ensureDelegation(world, club);
  const coach = delegationStaff(club);
  if (!coach) return { ok: false, msg: "尚未聘请主教练" };
  ensureTactics(club);
  const opponentId = fixture
    ? (fixture.home === club.id ? fixture.away : fixture.home)
    : null;
  const opponent = world.clubs?.find((item) => item.id === opponentId) || null;
  const ownLevel = squadLevel(club);
  const opponentLevel = squadLevel(opponent);
  const difference = ownLevel - opponentLevel;
  const rating = Number(coach.rating || 8);
  const identity = ensureCoachIdentity(coach);
  const formation = chooseFormation(club, delegation, coach);
  const adaptability = Number(identity?.adaptability || 3);
  let style = identity?.style || "balanced";
  let pressing = Number(identity?.pressing || 3);
  let tempo = Number(identity?.tempo || 3);
  let width = Number(identity?.width || 3);
  let defensiveLine = Number(identity?.defensiveLine || 3);

  if (opponent && difference <= -1.5 && adaptability >= 3) {
    style = "counter";
    pressing = Math.min(pressing, 2);
    tempo = Math.max(tempo, 4);
    defensiveLine = Math.min(defensiveLine, 2);
  } else if (opponent && difference >= 1.5 && adaptability >= 3) {
    style = identity?.archetype === "controlled" || rating >= 14 ? "possession" : "attack";
    pressing = Math.max(pressing, 4);
    tempo = style === "possession" ? Math.min(tempo, 3) : Math.max(tempo, 4);
    defensiveLine = Math.max(defensiveLine, 4);
  }
  if (
    rating >= 14
    && adaptability >= 4
    && opponent?.tactics?.style === "attack"
    && difference < 1.5
  ) {
    style = "counter";
    pressing = Math.min(pressing, 2);
    defensiveLine = Math.min(defensiveLine, 2);
  }
  const xi = (club.players || []).filter((p) => club.tactics.lineup?.includes(p.id));
  const avgFitness = average(xi.map((p) => Number(p.fitness ?? 70)), 75);
  if (avgFitness < 70) {
    pressing = Math.min(pressing, 2);
    tempo = Math.min(tempo, 3);
  }
  return {
    ok: true,
    formation,
    style,
    pressing: clamp(pressing, 1, 5),
    tempo: clamp(tempo, 1, 5),
    width: clamp(width, 1, 5),
    defensiveLine: clamp(defensiveLine, 1, 5),
    coachId: coach.id,
    coachIdentity: identity?.archetype || null,
  };
}

export function applyDelegatedTactics(world, club, fixture = null, { force = false } = {}) {
  const delegation = ensureDelegation(world, club);
  if (!force && !isFullyDelegated(world, club, "tactics")) return { ok: false, skipped: "player" };
  const coach = delegationStaff(club);
  if (!coach) return { ok: false, msg: "尚未聘请主教练" };
  const plan = buildDelegatedTactics(world, club, fixture);
  if (!plan.ok) return plan;
  ensureTactics(club);
  if (!delegation.locks.formation) club.tactics.formation = plan.formation;
  club.tactics.style = plan.style;
  club.tactics.pressing = plan.pressing;
  club.tactics.tempo = plan.tempo;
  club.tactics.width = plan.width;
  club.tactics.defensiveLine = plan.defensiveLine;
  ensureLineupRoles(club, { reset: true });
  assignCoachLineupRoles(club, coach, { force: true });
  delegation.lastAppliedDay.tactics = world.day;
  return plan;
}

export function applyDelegatedLineup(world, club, options = {}) {
  const delegation = ensureDelegation(world, club);
  if (!options.force && !isFullyDelegated(world, club, "lineup")) return { ok: false, skipped: "player" };
  const coach = delegationStaff(club);
  if (!coach) return { ok: false, msg: "尚未聘请主教练" };
  const lockedPlayerIds = [...delegation.locks.playerIds];
  if (delegation.locks.corePlayerId) lockedPlayerIds.push(delegation.locks.corePlayerId);
  const lineup = autoLineup(club, {
    day: world.day,
    importance: options.importance,
    eligibleIds: options.eligibleIds,
    lockedPlayerIds,
    youthPriority: delegation.principles.youthPriority,
    rotation: delegation.principles.rotation,
  });
  const preferredCore = delegation.locks.corePlayerId;
  if (preferredCore && lineup.includes(preferredCore)) club.tactics.corePlayerId = preferredCore;
  else ensureCorePlayer(club, { force: true });
  assignCoachLineupRoles(club, coach, { force: true });
  delegation.lastAppliedDay.lineup = world.day;
  const unavailableLocked = delegation.locks.playerIds.filter((id) => !lineup.includes(id));
  return { ok: true, lineup, unavailableLocked };
}

export function applyPreMatchDelegation(world, club, fixture, options = {}) {
  const delegation = ensureDelegation(world, club);
  const output = { ok: true, tactics: null, lineup: null };
  if (isFullyDelegated(world, club, "tactics")) {
    output.tactics = applyDelegatedTactics(world, club, fixture);
  }
  if (isFullyDelegated(world, club, "lineup")) {
    output.lineup = applyDelegatedLineup(world, club, options);
  }
  delegation.lastAppliedDay.match = world.day;
  return output;
}
