/**
 * 细分位置与多位置适应性审计。
 *
 * 覆盖：细分熟悉度由真实属性派生、旧档迁移可落盘、阵型槽位映射、
 * 自动阵容按适配度选人、阵容规划暴露可解释的槽位覆盖事实。
 */
import assert from "node:assert/strict";
import {
  DETAILED_POSITIONS,
  POSITION_GROUPS,
  PLAYER_POSITION_VERSION,
  derivePositionRatings,
  ensurePlayerPositionProfile,
  positionCoverage,
  positionGroup,
  positionLabel,
  positionRating,
  positionSummary,
  slotPositionCode,
} from "../js/player-positions.js";
import { ensureFootballProfile, autoLineup, ensureTactics } from "../js/models.js";
import { generateClubSquadPlan } from "../js/squad-planning.js";
import { FORMATIONS } from "../js/data.js";

const report = {};

// —— 1. 元数据自洽 ——
for (const code of DETAILED_POSITIONS) {
  assert.ok(POSITION_GROUPS[code], `${code} 必须归入一个粗位置组`);
  assert.ok(positionLabel(code, "zh") !== code, `${code} 必须有中文名`);
  assert.ok(positionLabel(code, "en") !== code, `${code} 必须有英文名`);
}
assert.equal(positionGroup("GK"), "GK");
assert.equal(positionGroup("LB"), "DEF");
assert.equal(positionGroup("AM"), "MID");
assert.equal(positionGroup("ST"), "ATT");
report.positions = DETAILED_POSITIONS.length;

// —— 2. 熟悉度必须由真实属性解释，而不是位置平均值 ——
const mkPlayer = (id, pos, attrs, extra = {}) => {
  const player = { id, pos, age: 25, ovr: 14, name: id, attrs: { ...attrs }, ...extra };
  ensureFootballProfile(player);
  return player;
};

const stopper = mkPlayer("cb", "DEF", {
  pace: 8, stamina: 12, tackling: 17, marking: 17, dribbling: 6,
  passing: 9, vision: 8, positioning: 16, strength: 17, physical: 16,
  shooting: 6, finishing: 5, kicking: 8, defending: 17,
});
const flyer = mkPlayer("lb", "DEF", {
  pace: 17, stamina: 16, tackling: 11, marking: 10, dribbling: 15,
  passing: 16, vision: 15, positioning: 11, strength: 7, physical: 8,
  shooting: 9, finishing: 8, kicking: 13, defending: 11,
}, { preferredFoot: "left" });

assert.ok(
  stopper.positionProfile.ratings.CB > stopper.positionProfile.ratings.LB,
  "抢截型中卫的中卫熟悉度必须高于边后卫"
);

// 熟悉度衡量属性结构是否匹配，不能是绝对能力的复读：
// 能力已由 OVR 在选人与评估里单独计入，此处再算一次即为双重计入。
const flatKeys = ["pace", "stamina", "strength", "physical", "tackling", "marking", "positioning", "passing", "vision", "dribbling", "shooting", "finishing", "heading", "crossing", "decisions", "reflexes", "handling", "kicking", "defending"];
const flatPlayer = (id, pos, level) => {
  const attrs = {};
  for (const key of flatKeys) attrs[key] = level;
  return mkPlayer(id, pos, attrs);
};
for (const pos of ["DEF", "MID", "ATT"]) {
  const weak = flatPlayer(`flat6${pos}`, pos, 6).positionProfile.ratings;
  const strong = flatPlayer(`flat18${pos}`, pos, 18).positionProfile.ratings;
  for (const code of Object.keys(weak)) {
    assert.ok(
      weak[code] >= 9 && weak[code] <= 17,
      `属性均衡的低能力球员在 ${code} 应是"能踢但不专精"，实际 ${weak[code]}`
    );
    assert.ok(
      strong[code] <= 17,
      `属性均衡的高能力球员不得在 ${code} 顶格（实际 ${strong[code]}），否则多位置适应性失去区分度`
    );
    assert.ok(
      Math.abs(strong[code] - weak[code]) <= 4,
      `${code} 熟悉度不得随绝对能力大幅漂移（6 级 ${weak[code]} vs 18 级 ${strong[code]}）`
    );
  }
}
// 专精球员必须明显偏离中性值，否则区分度不足
assert.ok(
  stopper.positionProfile.ratings.CB - stopper.positionProfile.ratings.LB >= 3,
  "专精型球员的主位与非主位必须有明显差距"
);
assert.ok(
  flyer.positionProfile.ratings.LB > flyer.positionProfile.ratings.CB,
  "传中型边后卫的边后卫熟悉度必须高于中卫"
);
assert.ok(
  flyer.positionProfile.ratings.LB > flyer.positionProfile.ratings.RB,
  "左脚球员的左后卫熟悉度必须高于右后卫"
);
assert.equal(stopper.positionProfile.primary, "CB");
assert.equal(flyer.positionProfile.primary, "LB");

// 同一份输入必须稳定复现，不能每次调用重掷
const repeat = derivePositionRatings(flyer);
assert.deepEqual(repeat, derivePositionRatings(flyer), "熟悉度派生必须是稳定的");

// v199 属性缺失时（外部先于 ensureFootballProfile 调用）方向必须一致
const bare = { id: "lb", pos: "DEF", age: 25, ovr: 14, preferredFoot: "left", attrs: { ...flyer.attrs } };
delete bare.attrs.heading;
delete bare.attrs.crossing;
delete bare.attrs.decisions;
const bareRatings = derivePositionRatings(bare);
assert.ok(
  bareRatings.LB > bareRatings.CB,
  "缺少 v199 属性时仍必须按基础属性判断，不能塌成平均值"
);
assert.ok(
  bareRatings.LB > bareRatings.RB,
  "缺少 v199 属性时惯用脚偏好仍必须生效"
);
report.attributeDriven = true;

// —— 3. 旧档迁移：任何实际修正都要回报 changed，否则不会落盘 ——
const stable = mkPlayer("mid", "MID", {
  pace: 12, stamina: 14, tackling: 11, marking: 10, dribbling: 13,
  passing: 15, vision: 15, positioning: 12, strength: 11, physical: 12,
  shooting: 11, finishing: 9, kicking: 11, defending: 11,
});
assert.equal(ensurePlayerPositionProfile(stable), false, "稳定态不得反复把存档标脏");

const clone = () => JSON.parse(JSON.stringify(stable));

const outOfRange = clone();
outOfRange.positionProfile.ratings.CM = 999;
assert.equal(ensurePlayerPositionProfile(outOfRange), true, "修正越界熟悉度必须回报 changed");
assert.ok(outOfRange.positionProfile.ratings.CM <= 20);

const illegalNatural = clone();
illegalNatural.positionProfile.natural = ["ST"];
assert.equal(ensurePlayerPositionProfile(illegalNatural), true, "剔除非法擅长位置必须回报 changed");
assert.ok(
  illegalNatural.positionProfile.natural.every((code) => POSITION_GROUPS[code] === "MID"),
  "擅长位置必须落在球员自己的粗位置组内"
);

const missingRating = clone();
const expected = missingRating.positionProfile.ratings.CM;
delete missingRating.positionProfile.ratings.CM;
assert.equal(ensurePlayerPositionProfile(missingRating), true, "补齐缺失熟悉度必须回报 changed");
assert.equal(
  missingRating.positionProfile.ratings.CM,
  expected,
  "缺失的熟悉度必须按真实属性补回，而不是塌成最低值"
);

const oldVersion = clone();
oldVersion.positionProfile.version = 0;
assert.equal(ensurePlayerPositionProfile(oldVersion), true, "版本落后必须重新派生并回报 changed");
assert.equal(oldVersion.positionProfile.version, PLAYER_POSITION_VERSION);
report.migrationReportsChanges = true;

// —— 4. 阵型槽位映射：左右与纵深必须解析成真实细分位置 ——
const f433 = FORMATIONS["4-3-3"];
const codes433 = f433.slots.map((slot) => slotPositionCode(slot, 0, f433.slots));
assert.equal(codes433[0], "GK", "首槽必须是门将");
assert.ok(codes433.includes("LB") && codes433.includes("RB"), "4-3-3 必须解析出两名边后卫");
assert.ok(codes433.filter((code) => code === "CB").length === 2, "4-3-3 必须解析出两名中卫");
assert.ok(
  codes433.includes("LW") && codes433.includes("RW"),
  "4-3-3 必须解析出两名边锋"
);
for (const [formationName, definition] of Object.entries(FORMATIONS)) {
  if (!definition?.slots) continue;
  for (const slot of definition.slots) {
    const code = slotPositionCode(slot, 0, definition.slots);
    assert.ok(DETAILED_POSITIONS.includes(code), `${formationName} 的槽位必须映射到已知细分位置`);
    assert.equal(
      positionGroup(code),
      slot.pos,
      `${formationName} 的槽位细分位置必须与其粗位置一致（${code} vs ${slot.pos}）`
    );
  }
}
report.formations = Object.keys(FORMATIONS).length;

// —— 5. 自动阵容：同能力时优先使用位置更合适的球员 ——
const squad = [];
const wideAttrs = {
  pace: 16, stamina: 16, tackling: 11, marking: 10, dribbling: 15,
  passing: 15, vision: 14, positioning: 11, strength: 8, physical: 9,
  shooting: 10, finishing: 9, kicking: 12, defending: 11,
};
const centralAttrs = {
  pace: 8, stamina: 12, tackling: 17, marking: 17, dribbling: 6,
  passing: 9, vision: 8, positioning: 16, strength: 17, physical: 17,
  shooting: 6, finishing: 5, kicking: 8, defending: 17,
};
squad.push(mkPlayer("gk1", "GK", { reflexes: 15, handling: 14, positioning: 13, kicking: 12, strength: 12, pace: 8, stamina: 10 }));
squad.push(mkPlayer("gk2", "GK", { reflexes: 11, handling: 11, positioning: 10, kicking: 10, strength: 11, pace: 8, stamina: 10 }));
squad.push(mkPlayer("wide1", "DEF", wideAttrs, { preferredFoot: "left" }));
squad.push(mkPlayer("wide2", "DEF", wideAttrs, { preferredFoot: "right" }));
squad.push(mkPlayer("central1", "DEF", centralAttrs));
squad.push(mkPlayer("central2", "DEF", centralAttrs));
for (let i = 0; i < 5; i++) {
  squad.push(mkPlayer(`mid${i}`, "MID", {
    pace: 12, stamina: 15, tackling: 12, marking: 11, dribbling: 13,
    passing: 15, vision: 14, positioning: 12, strength: 11, physical: 12,
    shooting: 11, finishing: 10, kicking: 11, defending: 12,
  }));
}
for (let i = 0; i < 4; i++) {
  squad.push(mkPlayer(`att${i}`, "ATT", {
    pace: 15, stamina: 13, tackling: 6, marking: 6, dribbling: 15,
    passing: 12, vision: 12, positioning: 13, strength: 12, physical: 12,
    shooting: 15, finishing: 15, kicking: 11, defending: 6,
  }));
}
for (const player of squad) {
  player.fitness = 100;
  player.injured = 0;
  player.ovr = 14;
}

const club = { id: "c1", name: "Audit FC", division: 1, players: squad, tactics: { formation: "4-3-3" } };
ensureTactics(club);
club.tactics.formation = "4-3-3";
const lineup = autoLineup(club);
assert.equal(lineup.length, f433.slots.length, "自动阵容必须填满所有槽位");
assert.equal(new Set(lineup).size, lineup.length, "自动阵容不得重复使用同一球员");

const byId = new Map(squad.map((player) => [player.id, player]));
const picked = lineup.map((id) => byId.get(id));
const gkSlotPlayer = picked[0];
assert.equal(gkSlotPlayer.pos, "GK", "门将槽必须由门将占据");
assert.equal(gkSlotPlayer.id, "gk1", "门将槽必须选能力更好的门将");

f433.slots.forEach((slot, index) => {
  const player = picked[index];
  if (!player) return;
  const code = slotPositionCode(slot, 0, f433.slots);
  if (code === "LB" || code === "RB") {
    assert.ok(
      player.id.startsWith("wide"),
      `${code} 槽应优先使用适配边路的后卫，实际是 ${player.id}`
    );
  }
  if (code === "CB") {
    assert.ok(
      player.id.startsWith("central"),
      `${code} 槽应优先使用适配中路的后卫，实际是 ${player.id}`
    );
  }
});

// 左脚边后卫应落在左路，右脚落在右路
const lbIndex = f433.slots.findIndex((slot) => slotPositionCode(slot, 0, f433.slots) === "LB");
const rbIndex = f433.slots.findIndex((slot) => slotPositionCode(slot, 0, f433.slots) === "RB");
assert.equal(picked[lbIndex].preferredFoot, "left", "左后卫槽应优先使用左脚球员");
assert.equal(picked[rbIndex].preferredFoot, "right", "右后卫槽应优先使用右脚球员");
report.autoLineupRespectsFit = true;

// —— 6. 熟悉度只读取同一份档案，不产生隐藏能力 ——
const coverage = positionCoverage(flyer, f433.slots[lbIndex], f433.slots);
assert.equal(coverage.target, "LB");
assert.equal(coverage.rating, flyer.positionProfile.ratings.LB, "覆盖度必须直接读档案，不另算隐藏值");
assert.ok(coverage.score >= 0 && coverage.score <= 1, "覆盖度分值必须归一化");
assert.equal(coverage.natural, flyer.positionProfile.natural.includes("LB"));
assert.equal(
  positionRating(flyer, "DEF"),
  Math.max(...["LB", "CB", "RB"].map((code) => flyer.positionProfile.ratings[code])),
  "按粗位置查询必须返回该组内最佳熟悉度"
);
assert.ok(positionSummary(flyer, "zh").includes("左后卫"), "中文摘要必须给出主位");
assert.ok(positionSummary(flyer, "en").toLowerCase().includes("left"), "英文摘要必须给出主位");
report.singleSourceOfTruth = true;

// —— 7. 阵容规划必须暴露可解释的槽位覆盖事实 ——
const world = { season: 2026, clubs: [club], players: squad };
const plan = generateClubSquadPlan(world, club);
assert.ok(plan, "阵容规划必须生成");
assert.ok(Array.isArray(plan.slotCoverage), "规划必须包含槽位覆盖");
assert.equal(plan.slotCoverage.length, f433.slots.length, "槽位覆盖必须逐槽给出");
const slotsByIndex = new Map(plan.slotCoverage.map((slot) => [slot.slotIndex, slot]));
for (const slot of plan.slotCoverage) {
  assert.ok(DETAILED_POSITIONS.includes(slot.target), "覆盖条目必须指向真实细分位置");
  assert.equal(positionGroup(slot.target), slot.group, "覆盖条目的细分位置必须与粗位置一致");
  assert.equal(
    slot.target,
    slotPositionCode(f433.slots[slot.slotIndex], slot.slotIndex, f433.slots),
    "覆盖条目的细分位置必须由槽位本身决定，不能受球员名单顺序影响"
  );
  assert.ok(slot.label && slot.labelEn, "覆盖条目必须双语可读");
  assert.ok(slot.bestRating >= 0 && slot.bestRating <= 20, "最佳熟悉度必须在 1-20 量纲内");
  assert.ok(slot.readyCount >= 0, "可用人数不得为负");
  assert.ok(slot.groupDemand >= 1, "每条战线的槽位需求至少为 1");
  assert.ok(slot.groupSupply >= 0, "每条战线的可用人数不得为负");
  for (const candidate of slot.candidates) {
    assert.ok(byId.has(candidate.playerId), "候选人必须来自本队");
    assert.equal(
      candidate.rating,
      positionRating(byId.get(candidate.playerId), slot.target),
      "候选人熟悉度必须与球员档案一致"
    );
  }
}
assert.ok(Array.isArray(plan.detailedNeeds), "规划必须给出细分位置需求");
for (const need of plan.detailedNeeds) {
  assert.ok(need.needScore >= 5, "只有真实缺口才应进入需求列表");
  assert.ok(DETAILED_POSITIONS.includes(need.target), "缺口必须指向真实细分位置");
  assert.ok(need.label && need.labelEn, "缺口必须双语可读");
}
const needScores = plan.detailedNeeds.map((need) => need.needScore);
assert.deepEqual(
  needScores,
  [...needScores].sort((a, b) => b - a),
  "细分需求必须按缺口严重度排序"
);
report.planExposesCoverage = true;

// —— 8. 位置深度必须单调：一条战线人手越少，缺口越大 ——
// 同一名球员会适配多个同组槽位，所以缺口要按战线人手算，
// 否则一名中卫被四个后卫槽各数一遍，深度不足完全暴露不出来。
const flatSquadFor = (defenderCount) => {
  const roster = [flatPlayer(`d${defenderCount}gk1`, "GK", 12), flatPlayer(`d${defenderCount}gk2`, "GK", 11)];
  for (let i = 0; i < defenderCount; i++) roster.push(flatPlayer(`d${defenderCount}def${i}`, "DEF", 12));
  for (let i = 0; i < 5; i++) roster.push(flatPlayer(`d${defenderCount}mid${i}`, "MID", 12));
  for (let i = 0; i < 4; i++) roster.push(flatPlayer(`d${defenderCount}att${i}`, "ATT", 12));
  const target = { id: `depth${defenderCount}`, name: "Depth FC", division: 1, players: roster, tactics: { formation: "4-3-3" } };
  ensureTactics(target);
  target.tactics.formation = "4-3-3";
  const built = generateClubSquadPlan({ season: 2026, clubs: [target], players: roster }, target);
  const defenceSlot = built.slotCoverage.find((row) => row.group === "DEF");
  return { plan: built, defenceNeed: defenceSlot.needScore, demand: defenceSlot.groupDemand, supply: defenceSlot.groupSupply };
};

const depth0 = flatSquadFor(0);
const depth2 = flatSquadFor(2);
const depth4 = flatSquadFor(4);
const depth6 = flatSquadFor(6);

assert.equal(depth4.demand, 4, "4-3-3 必须有 4 个后卫槽");
assert.ok(
  depth0.defenceNeed > depth2.defenceNeed,
  `完全无后卫的缺口必须大于仅 2 名后卫（${depth0.defenceNeed} vs ${depth2.defenceNeed}）`
);
assert.ok(
  depth2.defenceNeed > depth4.defenceNeed,
  `2 名后卫的缺口必须大于 4 名后卫（${depth2.defenceNeed} vs ${depth4.defenceNeed}）`
);
assert.ok(
  depth4.defenceNeed > 0,
  "首发刚好够、没有替补时仍必须报出缺口"
);
assert.equal(
  depth6.defenceNeed,
  0,
  `人手充裕的战线不得报出缺口（实际 ${depth6.defenceNeed}）`
);
assert.ok(
  depth0.plan.detailedNeeds.some((need) => positionGroup(need.target) === "DEF"),
  "完全无后卫时必须点名后卫线槽位"
);
report.depthMonotonic = [depth0.defenceNeed, depth2.defenceNeed, depth4.defenceNeed, depth6.defenceNeed];

console.log(JSON.stringify(report, null, 2));
console.log("player positions audit passed");
