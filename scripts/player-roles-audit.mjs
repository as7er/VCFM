import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { CLUB_TEMPLATES, PLAYER_ROLES } from "../js/data.js";
import {
  createWorld,
  defaultTactics,
  ensureFootballProfile,
  ensureTactics,
} from "../js/models.js";
import {
  PLAYER_DUTIES,
  ROLE_DETAILS,
  roleBehavior,
  roleDetail,
  roleFitsPosition,
  roleHabitFit,
  roleIdentityFit,
  rolesForDetailedPosition,
} from "../js/player-roles.js";
import { assignCoachLineupRoles, ensureCoachIdentity } from "../js/manager-ecosystem.js";
import { SimEngine } from "../js/sim/engine.js";
import { validateSaveStructure } from "../js/save-schema.js";

const repo = resolve(import.meta.dirname, "..");
const ATTR_KEYS = [
  "pace", "shooting", "passing", "dribbling", "defending", "physical", "finishing",
  "tackling", "marking", "strength", "stamina", "vision", "reflexes", "handling",
  "positioning", "kicking", "heading", "crossing", "decisions",
];

function attrs(value = 13, extra = {}) {
  return Object.fromEntries(ATTR_KEYS.map((key) => [key, extra[key] ?? value]));
}

function player(id, pos, number, extra = {}) {
  const item = {
    id,
    name: id,
    pos,
    number,
    age: extra.age ?? 24,
    ovr: extra.ovr ?? 13,
    potential: extra.potential ?? 16,
    fitness: 100,
    morale: 75,
    injured: 0,
    suspendedMatches: 0,
    attrs: attrs(13, extra.attrs || {}),
  };
  ensureFootballProfile(item);
  return item;
}

function club(id) {
  const players = [
    player(`${id}-gk`, "GK", 1),
    player(`${id}-d1`, "DEF", 2),
    player(`${id}-d2`, "DEF", 3),
    player(`${id}-d3`, "DEF", 4),
    player(`${id}-d4`, "DEF", 5),
    player(`${id}-m1`, "MID", 6),
    player(`${id}-m2`, "MID", 7),
    player(`${id}-m3`, "MID", 8),
    player(`${id}-a1`, "ATT", 9),
    player(`${id}-a2`, "ATT", 10),
    player(`${id}-a3`, "ATT", 11),
  ];
  const tactics = defaultTactics();
  tactics.lineup = players.map((item) => item.id);
  return { id, name: id, short: id, power: 70, players, tactics };
}

function seeded(seed = 12345) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

// —— 1. 数据合法性：每个角色/职责的声明与位置、职责集、属性、标签一致 ——
const POS_GROUP = {
  GK: ["GK"],
  DEF: ["LB", "CB", "RB"],
  MID: ["DM", "CM", "LM", "RM", "AM"],
  ATT: ["LW", "RW", "CF", "ST"],
};
const VALID_DETAILED = new Set(Object.values(POS_GROUP).flat());
const VALID_DUTIES = new Set(Object.keys(PLAYER_DUTIES));
const ALL_TAGS = new Set();

assert.deepEqual(
  Object.keys(ROLE_DETAILS).sort(),
  Object.keys(PLAYER_ROLES).sort(),
  "ROLE_DETAILS must cover exactly the roles declared in PLAYER_ROLES"
);

for (const roleId of Object.keys(PLAYER_ROLES)) {
  const info = ROLE_DETAILS[roleId];
  assert.ok(info.slotPositions.length > 0, `${roleId} needs slot positions`);
  const allowed = POS_GROUP[PLAYER_ROLES[roleId].pos];
  // 角色至少覆盖其粗位置大类的某一个细分位置（保证 ROLES_BY_POS 兼容）；
  // 允许跨大类扩展（如影锋 am_shadow 是 MID，但可担任 AM 或 CF）。
  for (const position of info.slotPositions) {
    assert.ok(VALID_DETAILED.has(position), `${roleId} uses unknown position ${position}`);
    assert.ok(roleFitsPosition(roleId, position), `${roleId} must fit its declared position`);
    assert.ok(rolesForDetailedPosition(position).includes(roleId), `${roleId} must be offered for ${position}`);
  }
  assert.ok(
    info.slotPositions.some((position) => allowed.includes(position)),
    `${roleId} (${PLAYER_ROLES[roleId].pos}) must declare at least one position in its group`
  );
  assert.ok(info.duties.length > 0, `${roleId} needs duties`);
  for (const dutyId of info.duties) {
    assert.ok(VALID_DUTIES.has(dutyId), `${roleId} uses unknown duty ${dutyId}`);
  }
  assert.ok(info.duties.includes(info.defaultDuty), `${roleId} default duty must be within its duties`);
  assert.ok(info.attributes.length > 0, `${roleId} needs attribute emphasis`);
  for (const tag of info.tags) ALL_TAGS.add(tag);
}
for (const position of VALID_DETAILED) {
  assert.ok(rolesForDetailedPosition(position).length > 0, `${position} needs at least one selectable role`);
}
for (const dutyId of VALID_DUTIES) {
  const duty = PLAYER_DUTIES[dutyId];
  assert.ok(typeof duty.label === "string" && typeof duty.labelEn === "string", `${dutyId} needs labels`);
  assert.ok(duty.behavior && typeof duty.behavior === "object", `${dutyId} needs behavior modifiers`);
}
assert.equal(ALL_TAGS.has("playmaker"), true, "coach identity tags must overlap role tags");

// 职责叠加：进攻职责提高前插/射门倾向，防守职责回收
assert.ok(roleBehavior("cm_central", "attack").depth > roleBehavior("cm_central", "defend").depth,
  "attack duty must push depth above defend duty");
assert.ok((roleBehavior("cm_ballwinner", "defend").tackle || 0) > 0,
  "ball-winning role must expose a tackling tendency");

// —— 2. 习惯契合 / 冲突提示 ——
{
  const target = player("fit-player", "MID", 8);
  target.playingHabits = ["tries_through_balls"];
  const fit = roleHabitFit(target, "dm_playmaker");
  assert.ok(fit.matched.includes("tries_through_balls"), "preferred habit must be reported as matched");
  assert.ok(fit.score > 0, "matched habit must raise the fit score");
  assert.deepEqual(fit.conflicts, [], "no conflict should be reported when the habit is preferred");
  target.playingHabits = ["gets_forward"];
  const conflict = roleHabitFit(target, "st_false9");
  assert.ok(conflict.conflicts.includes("gets_forward"), "conflicting habit must be surfaced");
  assert.ok(conflict.score < 0, "a conflicting habit must lower the fit score");
  target.playingHabits = [];
  const neutral = roleHabitFit(target, "st_false9");
  assert.equal(neutral.score, 0, "no habit facts must keep the fit score neutral");
}

// —— 3. 教练理念差异确实改变角色选择打分 ——
{
  const controlledCoach = { id: "coach-controlled", name: "C", role: "coach", age: 45, rating: 16, footballIdentity: { archetype: "controlled" } };
  const intenseCoach = { id: "coach-intense", name: "I", role: "coach", age: 45, rating: 16, footballIdentity: { archetype: "intense" } };
  const controlled = ensureCoachIdentity(controlledCoach);
  const intense = ensureCoachIdentity(intenseCoach);
  assert.ok(roleIdentityFit("dm_playmaker", controlled) >= 2, "playmaker role must fit a controlled identity");
  assert.equal(roleIdentityFit("dm_playmaker", intense), 0, "playmaker role must not fit an intense identity");
  assert.ok(roleIdentityFit("cm_ballwinner", intense) >= 2, "ball-winner role must fit an intense identity");
  assert.equal(roleIdentityFit("cm_ballwinner", controlled), 0, "ball-winner role must not fit a controlled identity");

  const home = club("identity-home");
  const rolesControlled = assignCoachLineupRoles(home, controlledCoach, { force: true });
  const homeB = club("identity-home-b");
  const rolesIntense = assignCoachLineupRoles(homeB, intenseCoach, { force: true });
  assert.ok(rolesControlled.ok && rolesIntense.ok, "coach role assignment must succeed");
  const roleList = (result) => result.assignments.map((item) => item.roleId);
  assert.notDeepEqual(roleList(rolesControlled), roleList(rolesIntense),
    "two different coach identities must produce different role assignments");
}

// —— 4. 角色确实改变空间决策：上抢者指派与压迫站位 ——
{
  const home = club("space-home");
  const away = club("space-away");
  const engine = new SimEngine(home, away, { random: seeded(91) });
  const ball = engine.ball;
  ball.x = 50;
  ball.y = 40; // home 防守（own goal y=100），球逼近 home 球门
  const owner = engine.agentById("space-away-m1");
  ball.owner = owner.id;
  ball.kickTeam = "away";
  // 防守方其余人放远，避免干扰排序
  for (const agent of engine.agents) {
    if (agent.team === "home" && agent.role !== "GK") {
      agent.x = 92;
      agent.y = 92;
    }
    if (agent.team === "away") {
      agent.x = 12;
      agent.y = 12;
    }
  }
  const m1 = engine.agentById("space-home-m1");
  const m2 = engine.agentById("space-home-m2");
  m1.roleId = "cm_central";
  m1.dutyId = "defend";
  m1.x = 48;
  m1.y = 42; // 离球 2.83
  m2.roleId = "cm_ballwinner";
  m2.dutyId = "defend";
  m2.x = 50;
  m2.y = 43; // 物理上离球更远（3.0）

  const plan = engine._refreshDefPlan("home", owner);
  const presser = [...plan.jobs.entries()].find(([, job]) => job.type === "press")?.[0];
  assert.equal(presser, m2.id,
    "the ball-winning midfielder must take the pressing job even when physically further from the ball");

  // 压迫型角色站位更贴身：同一名上抢者在高压迫角色下离球更近
  m2.x = 50;
  m2.y = 43;
  engine._thinkDefend(m2, owner);
  const closeWithRole = dist(m2.tx, m2.ty, ball.x, ball.y);
  m2.roleId = "cm_central";
  m2.dutyId = "support";
  engine._thinkDefend(m2, owner);
  const closeWithout = dist(m2.tx, m2.ty, ball.x, ball.y);
  assert.ok(closeWithRole < closeWithout,
    "a high-pressing role must press closer to the ball than an ordinary midfielder");
}

// —— 5. 引擎源码确实在防守路径消费角色/职责行为 ——
{
  const source = readFileSync(resolve(repo, "js/sim/engine.js"), "utf8");
  assert.match(source, /_refreshDefPlan[\s\S]{0,4000}_roleBehavior/,
    "defensive plan must read role behaviour when assigning pressers");
  assert.match(source, /_thinkDefend[\s\S]{0,2200}_roleBehavior/,
    "defensive positioning must read role behaviour");
  assert.match(source, /_hasHabit\(o, "dives_into_tackles"\)[\s\S]{0,400}tackleAgg/,
    "the tackling loop must consume role tackling tendency");
}

// —— 6. 存档结构校验覆盖角色/职责，读取兜底能归一化非法值 ——
{
  const start = CLUB_TEMPLATES.find((item) => item.division === 3);
  const world = createWorld(start.id, "Player Roles Audit");
  const user = world.clubs.find((item) => item.id === world.userClubId);
  ensureTactics(user);
  assert.equal(validateSaveStructure(world), world, "a generated world must pass structure validation");
  const goodRoles = [...(user.tactics.roles || [])];
  const goodDuties = [...(user.tactics.duties || [])];
  user.tactics.roles = [1, 2, 3];
  assert.throws(() => validateSaveStructure(world), /tactics role 0 is invalid/, "non-string roles must be rejected");
  user.tactics.roles = goodRoles;
  user.tactics.duties = goodDuties;
  user.tactics.coachRoleIdentityId = 7;
  assert.throws(() => validateSaveStructure(world), /coach role identity/, "invalid coach role identity must be rejected");
  user.tactics.coachRoleIdentityId = "coach-x";
  user.tactics.coachRoleIdentityVersion = "not-a-number";
  assert.throws(() => validateSaveStructure(world), /version/, "invalid coach role identity version must be rejected");
  user.tactics.coachRoleIdentityId = null;
  user.tactics.coachRoleIdentityVersion = null;
  assert.equal(validateSaveStructure(world), world);
}

console.log("Player roles audit passed: role/duty legality, habit fit, coach-identity divergence and spatial-engine defensive causality");
