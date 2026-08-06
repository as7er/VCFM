/**
 * 多年阵容规划：阵型名额、合同、年龄、质量、青训与报名资格共用同一份事实。
 * 规划只影响人员决策，不向比赛引擎写入任何隐藏能力或胜率修正。
 */

import { FORMATIONS } from "./data.js";
import { ensureClubSeasonPlan, clubPlanDef } from "./board.js";
import { developmentStatus } from "./squad-registration.js";

export const SQUAD_PLAN_VERSION = 1;
export const SQUAD_POSITIONS = ["GK", "DEF", "MID", "ATT"];

const POSITION_LABELS = {
  GK: { zh: "门将", en: "Goalkeeper" },
  DEF: { zh: "后卫", en: "Defence" },
  MID: { zh: "中场", en: "Midfield" },
  ATT: { zh: "前锋", en: "Attack" },
};

const REPLACEMENT_AGE = { GK: 34, DEF: 31, MID: 30, ATT: 29 };
const HORIZON_AGE = { GK: 38, DEF: 36, MID: 35, ATT: 34 };

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function average(items, getter) {
  return items.length
    ? items.reduce((sum, item) => sum + number(getter(item)), 0) / items.length
    : 0;
}

function round(value, digits = 1) {
  const scale = 10 ** digits;
  return Math.round(number(value) * scale) / scale;
}

function formationSlots(club) {
  const formation = club?.tactics?.formation || "4-3-3";
  const definition = FORMATIONS[formation] || FORMATIONS["4-3-3"];
  const counts = { GK: 0, DEF: 0, MID: 0, ATT: 0 };
  for (const slot of definition?.slots || []) {
    if (counts[slot.pos] != null) counts[slot.pos] += 1;
  }
  return { formation, counts };
}

function positionTarget(position, slots) {
  if (position === "GK") return { minimum: 2, ideal: 2, maximum: 3 };
  const minimum = Math.max(slots + 1, position === "ATT" ? 2 : 4);
  const ideal = Math.max(minimum, Math.ceil(slots * 1.65));
  return { minimum, ideal, maximum: ideal + 2 };
}

function playerOvr(player) {
  return number(player?.ovr, 10);
}

function playerPotential(player) {
  return Math.max(playerOvr(player), number(player?.potential, playerOvr(player)));
}

function ownedLoanedOutPlayers(world, club) {
  const ids = new Set(
    (world?.loans || [])
      .filter((loan) => loan.fromClubId === club?.id)
      .map((loan) => loan.playerId)
  );
  if (!ids.size) return [];
  const found = [];
  for (const other of world?.clubs || []) {
    for (const player of other.players || []) {
      if (ids.has(player.id)) found.push(player);
    }
  }
  return found;
}

function planPlayers(world, club) {
  const current = club?.players || [];
  const ownedHere = current.filter(
    (player) => !player.loan || (player.loan.parentClubId || player.loan.fromClubId) === club.id
  );
  const loanedOut = ownedLoanedOutPlayers(world, club);
  const owned = [...ownedHere];
  const seen = new Set(owned.map((player) => player.id));
  for (const player of loanedOut) {
    if (!seen.has(player.id)) owned.push(player);
  }
  return { current, owned, loanedOut };
}

function projectedOvr(player, years) {
  const age = number(player?.age, 25) + years;
  const position = player?.pos || "MID";
  let decline = 0;
  if (age > REPLACEMENT_AGE[position]) {
    decline = (age - REPLACEMENT_AGE[position]) * (position === "GK" ? 0.35 : 0.6);
  }
  const growthRoom = Math.max(0, playerPotential(player) - playerOvr(player));
  const growth = number(player?.age, 25) <= 23 ? Math.min(growthRoom, years * 0.65) : 0;
  return round(Math.max(1, playerOvr(player) + growth - decline));
}

function securedForHorizon(player, years) {
  const contractYears = number(player?.contractYears, 0);
  const ageThen = number(player?.age, 25) + years;
  return contractYears > years && ageThen < HORIZON_AGE[player?.pos || "MID"];
}

function peerStarterAverage(world, club, position, starterSlots) {
  const peers = (world?.clubs || []).filter(
    (candidate) => candidate.id !== club.id && candidate.division === club.division
  );
  const values = peers.map((candidate) => {
    const players = (candidate.players || [])
      .filter((player) => player.pos === position)
      .sort((a, b) => playerOvr(b) - playerOvr(a))
      .slice(0, Math.max(1, starterSlots));
    return average(players, playerOvr);
  }).filter((value) => value > 0);
  return round(average(values, (value) => value));
}

function styleFit(planKey, player) {
  const attrs = player?.attrs || {};
  const position = player?.pos || "MID";
  const technical = average(
    [attrs.passing, attrs.vision, attrs.dribbling, attrs.crossing, attrs.decisions],
    (value) => number(value, playerOvr(player))
  );
  const defensive = average(
    [attrs.tackling, attrs.marking, attrs.positioning, attrs.strength, attrs.stamina],
    (value) => number(value, playerOvr(player))
  );
  const attacking = average(
    [attrs.finishing, attrs.shooting, attrs.dribbling, attrs.pace, attrs.decisions],
    (value) => number(value, playerOvr(player))
  );
  if (planKey === "attacking") {
    return round((position === "MID" || position === "ATT" ? 0.8 : 0) + (technical + attacking) / 20);
  }
  if (planKey === "resilient") {
    return round((position === "GK" || position === "DEF" ? 0.8 : 0) + defensive / 10);
  }
  if (planKey === "youth" || planKey === "rebuild") {
    return round((number(player?.age, 25) <= 23 ? 1.2 : 0) + Math.max(0, playerPotential(player) - playerOvr(player)) * 0.25);
  }
  if (planKey === "sustainable") {
    const value = Math.max(100_000, number(player?.value, 100_000));
    return round(playerOvr(player) / Math.max(1, Math.log10(value)));
  }
  return round(playerOvr(player) / 10);
}

function registrationFacts(world, club, players) {
  let clubTrained = 0;
  let associationTrained = 0;
  let listB = 0;
  let nonAssociation = 0;
  for (const player of players) {
    const status = developmentStatus(world, club, player);
    if (status.clubTrained) clubTrained += 1;
    if (status.associationTrained) associationTrained += 1;
    else if (number(player.age, 99) > 21) nonAssociation += 1;
    if (status.listB) listB += 1;
  }
  const clubTrainedShortage = Math.max(0, 4 - clubTrained);
  const associationShortage = Math.max(0, 8 - associationTrained);
  const nonAssociationRisk = Math.max(0, nonAssociation - 15);
  return {
    clubTrained,
    associationTrained,
    listB,
    nonAssociation,
    clubTrainedShortage,
    associationShortage,
    nonAssociationRisk,
    risk: clubTrainedShortage > 0 || associationShortage > 0 || nonAssociationRisk > 0,
  };
}

function buildPositionPlan(world, club, position, slots, current, owned, registration) {
  const target = positionTarget(position, slots);
  const currentPlayers = current
    .filter((player) => player.pos === position)
    .sort((a, b) => playerOvr(b) - playerOvr(a));
  const ownedPlayers = owned
    .filter((player) => player.pos === position)
    .sort((a, b) => playerOvr(b) - playerOvr(a));
  const starters = currentPlayers.slice(0, Math.max(1, slots));
  const starterAverage = round(average(starters, playerOvr));
  const peerAverage = peerStarterAverage(world, club, position, slots);
  const securedNext = ownedPlayers.filter((player) => securedForHorizon(player, 1));
  const securedTwoYears = ownedPlayers.filter((player) => securedForHorizon(player, 2));
  const expiring = ownedPlayers.filter((player) => number(player.contractYears, 0) <= 1);
  const expiringStarters = starters.filter((player) => number(player.contractYears, 0) <= 1);
  const agingStarters = starters.filter(
    (player) => number(player.age, 25) >= REPLACEMENT_AGE[position]
  );
  const successors = ownedPlayers.filter(
    (player) => number(player.age, 25) <= 23 && playerPotential(player) >= starterAverage - 1
  );
  const currentDeficit = Math.max(0, target.ideal - currentPlayers.length);
  const minimumDeficit = Math.max(0, target.minimum - currentPlayers.length);
  const nextDeficit = Math.max(0, target.ideal - securedNext.length);
  const twoYearDeficit = Math.max(0, target.ideal - securedTwoYears.length);
  const qualityGap = Math.max(0, peerAverage - starterAverage);
  const surplus = Math.max(0, currentPlayers.length - target.maximum);
  const needScore = round(Math.max(0,
    currentDeficit * 18 +
    minimumDeficit * 22 +
    nextDeficit * 7 +
    twoYearDeficit * 4 +
    qualityGap * 4 +
    expiringStarters.length * 5 +
    agingStarters.length * 4 +
    (registration.risk ? 1.5 : 0) -
    surplus * 8
  ));

  const reasons = [];
  const reasonsEn = [];
  if (minimumDeficit > 0) {
    reasons.push(`当前少于最低轮换需求 ${minimumDeficit} 人`);
    reasonsEn.push(`${minimumDeficit} below minimum depth`);
  } else if (currentDeficit > 0) {
    reasons.push(`距理想深度还差 ${currentDeficit} 人`);
    reasonsEn.push(`${currentDeficit} below ideal depth`);
  }
  if (qualityGap >= 0.6) {
    reasons.push(`主力质量低于同级约 ${qualityGap.toFixed(1)}`);
    reasonsEn.push(`starter quality trails division by ${qualityGap.toFixed(1)}`);
  }
  if (expiringStarters.length) {
    reasons.push(`${expiringStarters.length} 名主力合同将尽`);
    reasonsEn.push(`${expiringStarters.length} starters are expiring`);
  }
  if (agingStarters.length) {
    reasons.push(`${agingStarters.length} 名主力进入替代年龄`);
    reasonsEn.push(`${agingStarters.length} starters are at replacement age`);
  }
  if (nextDeficit > currentDeficit) {
    reasons.push(`已签约下季阵容将减少 ${nextDeficit - currentDeficit} 人`);
    reasonsEn.push(`contracted depth falls by ${nextDeficit - currentDeficit} next season`);
  }
  if (!reasons.length && surplus > 0) {
    reasons.push(`超过阵型所需上限 ${surplus} 人`);
    reasonsEn.push(`${surplus} above the formation depth ceiling`);
  }
  if (!reasons.length) {
    reasons.push("人数、年龄与质量结构稳定");
    reasonsEn.push("depth, age and quality are stable");
  }

  return {
    position,
    label: POSITION_LABELS[position].zh,
    labelEn: POSITION_LABELS[position].en,
    slots,
    ...target,
    current: currentPlayers.length,
    owned: ownedPlayers.length,
    securedNext: securedNext.length,
    securedTwoYears: securedTwoYears.length,
    starterAverage,
    peerAverage,
    projectedStarterAverageNext: round(average(
      securedNext.sort((a, b) => projectedOvr(b, 1) - projectedOvr(a, 1)).slice(0, Math.max(1, slots)),
      (player) => projectedOvr(player, 1)
    )),
    expiring: expiring.length,
    expiringStarterIds: expiringStarters.map((player) => player.id),
    agingStarterIds: agingStarters.map((player) => player.id),
    successorIds: successors.map((player) => player.id),
    needScore,
    reasons,
    reasonsEn,
  };
}

function playerDecision(world, club, player, positionPlan, seasonPlan, decisionPlayers) {
  const peers = (decisionPlayers || club.players || [])
    .filter((candidate) => candidate.pos === player.pos)
    .sort((a, b) => playerOvr(b) - playerOvr(a));
  const rank = Math.max(1, peers.findIndex((candidate) => candidate.id === player.id) + 1);
  const age = number(player.age, 25);
  const contractYears = number(player.contractYears, 0);
  const growthRoom = Math.max(0, playerPotential(player) - playerOvr(player));
  const status = developmentStatus(world, club, player);
  const starter = rank <= Math.max(1, positionPlan.slots);
  const withinIdeal = rank <= positionPlan.ideal;
  const surplus = positionPlan.current > positionPlan.maximum;
  const replacementAge = REPLACEMENT_AGE[player.pos || "MID"];
  const weakForClub = playerOvr(player) < Math.max(6, positionPlan.starterAverage - 3);
  const protectedYouth = age <= 22 && growthRoom >= 2;
  let action = "retain";
  let priority = 30;
  let reason = "保持阵容稳定";
  let reasonEn = "Retain for squad stability";

  if (contractYears <= 1 && (starter || withinIdeal || positionPlan.needScore >= 18) && age < HORIZON_AGE[player.pos || "MID"]) {
    action = "renew";
    priority = 78 + (starter ? 12 : 0) + Math.min(8, positionPlan.needScore / 5);
    reason = starter ? "主力合同将尽，续约可避免下季结构断层" : "位置深度不足，续约比重新引援更连续";
    reasonEn = starter ? "Expiring starter; renewal prevents a depth break" : "Depth need makes renewal more coherent than replacement";
  } else if (protectedYouth && !starter && rank > positionPlan.slots + 1 && positionPlan.current > positionPlan.minimum) {
    action = "loan";
    priority = 62 + growthRoom * 3;
    reason = "高潜年轻球员暂缺稳定一线队分钟，适合外租发展";
    reasonEn = "High-potential youngster currently lacks reliable first-team minutes";
  } else if (protectedYouth) {
    action = "develop";
    priority = 58 + growthRoom * 3 + (status.clubTrained ? 5 : 0);
    reason = status.clubTrained ? "高潜且具本俱乐部培养价值，应保留培养" : "能力仍有明确成长空间，应进入轮换培养";
    reasonEn = status.clubTrained ? "High upside with club-trained value" : "Clear development room merits rotation minutes";
  } else if (starter && age >= replacementAge) {
    action = "replace";
    priority = 64 + Math.max(0, age - replacementAge) * 4;
    reason = positionPlan.successorIds.length
      ? "仍可使用，但已进入年龄替代期，年轻接班人应逐步接手"
      : "仍是当前主力，但需要提前寻找真实接班人";
    reasonEn = positionPlan.successorIds.length
      ? "Still useful, but a younger successor should take over gradually"
      : "Still starts, but a genuine successor is needed";
  } else if (!starter && weakForClub && (surplus || rank > positionPlan.ideal) && peers.length > positionPlan.minimum) {
    action = contractYears <= 1 ? "release" : "sell";
    priority = 56 + Math.max(0, rank - positionPlan.ideal) * 5 + Math.max(0, age - 27) * 2;
    reason = surplus ? "位置人数超过阵型上限，且竞技顺位靠后" : "不在现实轮换顺位内，可释放名额与工资";
    reasonEn = surplus ? "Position is overstocked and the player is low in the order" : "Outside the realistic rotation order; can release a slot and wages";
  } else if (starter) {
    action = "core";
    priority = 52;
    reason = "当前阵型主力，应维持竞技连续性";
    reasonEn = "Current formation starter; retain competitive continuity";
  }

  if (seasonPlan?.key === "compete" && starter && action === "replace") priority -= 8;
  if (seasonPlan?.key === "sustainable" && action === "sell") priority += 8;
  if ((seasonPlan?.key === "youth" || seasonPlan?.key === "rebuild") && action === "develop") priority += 8;

  return {
    playerId: player.id,
    playerName: player.name,
    position: player.pos,
    rank,
    action,
    priority: round(priority),
    reason,
    reasonEn,
    starter,
    protectedYouth,
    clubTrained: status.clubTrained,
    associationTrained: status.associationTrained,
    styleFit: styleFit(seasonPlan?.key, player),
  };
}

function planSignature(world, club, seasonPlan) {
  const playerFacts = [];
  const visiblePlayers = [...(club?.players || []), ...ownedLoanedOutPlayers(world, club)];
  const seen = new Set();
  for (const player of visiblePlayers) {
    if (seen.has(player.id)) continue;
    seen.add(player.id);
    const parentId = player.loan?.parentClubId || player.loan?.fromClubId;
    playerFacts.push([
      player.id,
      player.pos,
      number(player.age),
      playerOvr(player),
      playerPotential(player),
      number(player.contractYears),
      number(player.wage),
      parentId || "",
    ].join(":"));
  }
  playerFacts.sort();
  const moneyBand = Math.floor(number(club?.money) / 250_000);
  const planningPeriod = Math.floor(Math.max(0, number(world?.day, 1) - 1) / 14);
  return [
    SQUAD_PLAN_VERSION,
    world?.season || 0,
    club?.tactics?.formation || "4-3-3",
    seasonPlan?.key || "balanced",
    moneyBand,
    planningPeriod,
    playerFacts.join("|"),
  ].join("#");
}

export function generateClubSquadPlan(world, club) {
  if (!world || !club) return null;
  const seasonPlan = ensureClubSeasonPlan(club, world.clubs || [], world.season);
  const planDef = clubPlanDef(seasonPlan);
  const { formation, counts } = formationSlots(club);
  const { current, owned, loanedOut } = planPlayers(world, club);
  const registration = registrationFacts(world, club, owned);
  const positions = {};
  for (const position of SQUAD_POSITIONS) {
    positions[position] = buildPositionPlan(
      world,
      club,
      position,
      counts[position],
      current,
      owned,
      registration
    );
  }

  const decisions = {};
  for (const player of current) {
    if (player.loan && (player.loan.parentClubId || player.loan.fromClubId) !== club.id) continue;
    decisions[player.id] = playerDecision(
      world,
      club,
      player,
      positions[player.pos] || positions.MID,
      seasonPlan,
      owned
    );
  }
  for (const player of loanedOut) {
    decisions[player.id] = playerDecision(
      world,
      club,
      player,
      positions[player.pos] || positions.MID,
      seasonPlan,
      owned
    );
  }

  const orderedNeeds = SQUAD_POSITIONS
    .map((position) => ({ position, ...positions[position] }))
    .sort((a, b) => b.needScore - a.needScore || a.position.localeCompare(b.position));
  const idealSize = orderedNeeds.reduce((sum, item) => sum + item.ideal, 0);
  const securedNext = orderedNeeds.reduce((sum, item) => sum + item.securedNext, 0);
  const securedTwoYears = orderedNeeds.reduce((sum, item) => sum + item.securedTwoYears, 0);
  const priorities = Object.values(decisions)
    .filter((decision) => !["core", "retain"].includes(decision.action))
    .sort((a, b) => b.priority - a.priority || a.playerName.localeCompare(b.playerName));

  return {
    version: SQUAD_PLAN_VERSION,
    season: world.season,
    generatedDay: world.day || 1,
    signature: planSignature(world, club, seasonPlan),
    formation,
    seasonPlanKey: seasonPlan?.key || "balanced",
    seasonPlanLabel: seasonPlan?.label || "均衡建设",
    seasonPlanLabelEn: seasonPlan?.labelEn || "Balanced build",
    seasonPlanWeights: {
      youth: planDef.youthWeight,
      value: planDef.valueWeight,
      ability: planDef.ovrWeight,
    },
    squad: {
      current: current.length,
      owned: owned.length,
      loanedOut: loanedOut.length,
      ideal: idealSize,
      securedNext,
      securedTwoYears,
      averageAge: round(average(owned, (player) => number(player.age, 25))),
    },
    registration,
    positions,
    orderedNeeds: orderedNeeds.map((item) => item.position),
    playerDecisions: decisions,
    priorities: priorities.slice(0, 12),
  };
}

export function ensureClubSquadPlan(world, club, options = {}) {
  if (!world || !club) return null;
  const seasonPlan = ensureClubSeasonPlan(club, world.clubs || [], world.season);
  const signature = planSignature(world, club, seasonPlan);
  if (
    options.force ||
    !club.squadPlan ||
    club.squadPlan.version !== SQUAD_PLAN_VERSION ||
    club.squadPlan.signature !== signature
  ) {
    club.squadPlan = generateClubSquadPlan(world, club);
  }
  return club.squadPlan;
}

export function ensureWorldSquadPlans(world, options = {}) {
  return (world?.clubs || []).map((club) => ensureClubSquadPlan(world, club, options));
}

export function invalidateClubSquadPlan(club) {
  if (club) club.squadPlan = null;
}

export function invalidateDivisionSquadPlans(world, division) {
  for (const club of world?.clubs || []) {
    if (club.division === division) invalidateClubSquadPlan(club);
  }
}

export function squadPositionPlan(plan, position) {
  return plan?.positions?.[position] || null;
}

export function squadPlayerPlan(plan, playerId) {
  return plan?.playerDecisions?.[playerId] || null;
}

export function selectPlannedSaleCandidate(world, club, filter = null) {
  const plan = ensureClubSquadPlan(world, club);
  const candidates = (club?.players || [])
    .filter((player) => !player.loan)
    .map((player) => ({ player, decision: squadPlayerPlan(plan, player.id) }))
    .filter(({ player, decision }) =>
      decision?.action === "sell" &&
      (!filter || filter(player, club.players)) &&
      (plan.positions[player.pos]?.current || 0) > (plan.positions[player.pos]?.minimum || 0) &&
      (plan.positions[player.pos]?.owned || 0) > (plan.positions[player.pos]?.minimum || 0)
    )
    .sort((a, b) =>
      b.decision.priority - a.decision.priority ||
      playerOvr(a.player) - playerOvr(b.player) ||
      number(b.player.age) - number(a.player.age)
    );
  return candidates[0]?.player || null;
}

export function selectPlannedLoanCandidate(world, club) {
  const plan = ensureClubSquadPlan(world, club);
  return (club?.players || [])
    .filter((player) => !player.loan)
    .map((player) => ({ player, decision: squadPlayerPlan(plan, player.id) }))
    .filter(({ player, decision }) =>
      decision?.action === "loan" &&
      (plan.positions[player.pos]?.current || 0) > (plan.positions[player.pos]?.minimum || 0)
    )
    .sort((a, b) => b.decision.priority - a.decision.priority)[0]?.player || null;
}

export function selectPlannedRecruitmentPosition(world, club, options = {}) {
  const plan = ensureClubSquadPlan(world, club);
  const minimumNeed = options.minimumNeed == null ? 12 : number(options.minimumNeed, 12);
  return plan?.orderedNeeds?.find((position) => {
    const row = plan.positions[position];
    return row.needScore >= minimumNeed && row.current < row.maximum;
  }) || null;
}

export function evaluateRecruitmentCandidate(world, club, player, options = {}) {
  const plan = options.plan || ensureClubSquadPlan(world, club);
  const position = plan?.positions?.[player?.pos];
  if (!position) return { score: -Infinity, reasons: [], reasonsEn: [] };
  const seasonPlan = options.seasonPlan || ensureClubSeasonPlan(club, world.clubs || [], world.season);
  const def = clubPlanDef(seasonPlan);
  const age = number(player?.age, 25);
  const potential = playerPotential(player);
  const ability = playerOvr(player);
  const qualityGain = ability - position.starterAverage;
  const youthValue = age <= 23 ? Math.max(0, potential - ability) + 1 : 0;
  const agePenalty = age >= REPLACEMENT_AGE[player.pos || "MID"] + 2 ? age - REPLACEMENT_AGE[player.pos || "MID"] : 0;
  const status = developmentStatus(world, club, player);
  const homegrownValue = status.clubTrained ? 1.4 : status.associationTrained ? 0.8 : age <= 21 ? 0.35 : 0;
  const fit = styleFit(seasonPlan?.key, player);
  const score = round(
    ability * def.ovrWeight +
    potential * (0.18 + def.youthWeight * 0.14) +
    youthValue * def.youthWeight +
    qualityGain * 1.8 +
    position.needScore * 0.16 +
    homegrownValue +
    fit -
    agePenalty * 1.4
  );
  const reasons = [position.reasons[0]];
  const reasonsEn = [position.reasonsEn[0]];
  if (qualityGain >= 0.5) {
    reasons.push(`可将该位置主力质量提高约 ${qualityGain.toFixed(1)}`);
    reasonsEn.push(`could lift starter quality by about ${qualityGain.toFixed(1)}`);
  }
  if (age <= 23 && potential >= ability + 2) {
    reasons.push("具备可解释的成长空间");
    reasonsEn.push("has credible development room");
  }
  if (homegrownValue > 0) {
    reasons.push("有助于报名与本土培养结构");
    reasonsEn.push("supports registration and homegrown structure");
  }
  return { score, qualityGain: round(qualityGain), styleFit: fit, reasons, reasonsEn };
}

export function evaluateYouthCandidate(world, club, player, options = {}) {
  const plan = options.plan || ensureClubSquadPlan(world, club);
  const position = plan?.positions?.[player?.pos] || plan?.positions?.MID;
  const age = number(player?.age, 17);
  const ability = playerOvr(player);
  const potential = playerPotential(player);
  const readinessGap = ability - Math.max(6, position.starterAverage - 3);
  const status = developmentStatus(world, club, player);
  const score = round(
    potential * 2 +
    ability * 1.2 +
    position.needScore * 0.35 +
    Math.max(0, readinessGap) * 4 +
    (age >= 19 ? 6 : 0) +
    (status.clubTrained ? 4 : 0) -
    Math.max(0, (club.players || []).length - 23) * 4
  );
  return {
    score,
    promote: score >= 48 && (potential >= 13 || position.needScore >= 18),
    positionNeed: position.needScore,
    reason: position.reasons[0],
    reasonEn: position.reasonsEn[0],
  };
}
