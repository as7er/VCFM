/**
 * 赛前准备对称性审计：AI 与玩家必须受同一套赛前准备规则约束。
 *
 * `training-boost.js` 的攻防/体能/士气加成此前只有玩家一侧会设置
 * （UI 与 `delegation.js`），AI 永远停在 `balanced`，等于给玩家一份
 * 单向的隐性加成——正是最高设计原则禁止的东西。本审计钉死：
 * 两侧共用 `pickPrepMode`，共用 `setTrainingMode` 的冷却，且决策不消费随机数。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { CLUB_TEMPLATES } from "../js/data.js";
import { createWorld } from "../js/models.js";
import {
  assistantTrainingPlan,
  autoPickTraining,
  pickPrepMode,
  processTrainingDay,
} from "../js/training.js";
import { TRAINING_MODES, ensureTrainingBoost, setTrainingMode } from "../js/training-boost.js";

const repo = resolve(import.meta.dirname, "..");
const trainingSource = readFileSync(resolve(repo, "js/training.js"), "utf8");

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

// ── 源码约束：准备模式只能有一份决策实现 ──
assert.match(
  trainingSource,
  /export function pickPrepMode/,
  "the shared prep-mode decision must stay exported from training.js"
);
assert.equal(
  (trainingSource.match(/pickPrepMode\(/g) || []).length,
  3,
  "pickPrepMode must have exactly one definition and two callers (assistant + AI)"
);
assert.match(
  trainingSource,
  /autoPickTraining[\s\S]*?setTrainingMode\(/,
  "the AI path must actually set a preparation mode"
);

// ── 决策纯函数：确定性且不消费随机数 ──
const scenario = {
  avgFitness: 84,
  avgMorale: 70,
  injured: 0,
  lowFitness: 0,
  daysToMatch: 6,
  ownOvr: 12,
  opponentOvr: 15,
};
const guardedRandom = Math.random;
Math.random = () => {
  throw new Error("pickPrepMode must not consume the random stream");
};
try {
  assert.equal(pickPrepMode(scenario), "defense", "a stronger opponent calls for defensive work");
  assert.equal(pickPrepMode(scenario), "defense", "the same facts must give the same plan");
  assert.equal(
    pickPrepMode({ ...scenario, ownOvr: 15, opponentOvr: 12 }),
    "attack",
    "a weaker opponent calls for attacking work"
  );
  assert.equal(
    pickPrepMode({ ...scenario, ownOvr: 13, opponentOvr: 13 }),
    "setpiece",
    "an even tie falls back to set pieces"
  );
  assert.equal(
    pickPrepMode({ ...scenario, avgFitness: 60 }),
    "fitness",
    "a depleted squad recovers before anything else"
  );
  assert.equal(
    pickPrepMode({ ...scenario, avgMorale: 40 }),
    "morale",
    "a demoralised squad gets team building"
  );
  assert.equal(
    pickPrepMode({ ...scenario, ownOvr: null, opponentOvr: null }),
    "balanced",
    "no readable opponent means no guess"
  );
  for (const mode of ["defense", "attack", "setpiece", "fitness", "morale", "balanced"]) {
    assert.ok(TRAINING_MODES[mode], `${mode} must be a real training mode`);
  }
} finally {
  Math.random = guardedRandom;
}

const startClubId = CLUB_TEMPLATES.find((club) => club.division === 3)?.id;
assert.ok(startClubId, "a playable starting club is required");

const originalRandom = Math.random;
Math.random = seededRandom(0x51a7c3);

try {
  const world = createWorld(startClubId, "Prep Symmetry Audit");
  const clubsById = new Map(world.clubs.map((club) => [club.id, club]));

  // ── 同一阵容状态与对手，AI 与玩家助教得到同一个准备模式 ──
  let compared = 0;
  for (const club of world.clubs.slice(0, 24)) {
    const plan = assistantTrainingPlan(world, club);
    const fixture = [...(world.fixtures || [])]
      .filter((f) => !f.played && (f.home === club.id || f.away === club.id))
      .sort((a, b) => Number(a.day || 0) - Number(b.day || 0))[0];
    if (!fixture) continue;
    const opponentId = fixture.home === club.id ? fixture.away : fixture.home;
    ensureTrainingBoost(club).lastChanged = 0; // 允许本次设置，冷却单独校验
    autoPickTraining(club, plan.metrics.daysToMatch, {
      day: world.day,
      opponent: clubsById.get(opponentId) || null,
    });
    assert.equal(
      club.trainingBoost.mode,
      plan.prepMode,
      `${club.id}: AI and the assistant must reach the same preparation`
    );
    compared += 1;
  }
  assert.ok(compared >= 12, "the symmetry check needs a meaningful sample");

  // ── AI 遵守与玩家相同的 3 天冷却 ──
  const probe = world.clubs.find((club) => club.id !== world.userClubId);
  const boost = ensureTrainingBoost(probe);
  boost.mode = "balanced";
  boost.lastChanged = 0;
  assert.equal(setTrainingMode(probe, "attack", 10).ok, true, "the first plan always applies");
  assert.equal(probe.trainingBoost.mode, "attack");
  assert.equal(
    setTrainingMode(probe, "defense", 11).ok,
    false,
    "AI must obey the same cooldown the player does"
  );
  assert.equal(probe.trainingBoost.mode, "attack", "a blocked change must not take effect");
  assert.equal(setTrainingMode(probe, "defense", 13).ok, true, "the cooldown expires after 3 days");

  // ── 推进若干天后，AI 联赛不再是清一色 balanced ──
  for (const club of world.clubs) {
    const state = ensureTrainingBoost(club);
    state.mode = "balanced";
    state.lastChanged = 0;
  }
  for (let i = 0; i < 8; i++) {
    world.day += 1;
    processTrainingDay(world);
  }
  const aiClubs = world.clubs.filter((club) => club.id !== world.userClubId);
  const modes = new Map();
  for (const club of aiClubs) {
    const mode = ensureTrainingBoost(club).mode;
    modes.set(mode, (modes.get(mode) || 0) + 1);
  }
  const nonBalanced = aiClubs.length - (modes.get("balanced") || 0);
  assert.ok(
    nonBalanced > aiClubs.length * 0.5,
    `most AI clubs should prepare for their next match (${nonBalanced}/${aiClubs.length})`
  );
  assert.ok(modes.size >= 2, "AI preparation must vary with squad state and opponent");
  for (const mode of modes.keys()) {
    assert.ok(TRAINING_MODES[mode], `${mode} must be a real training mode`);
  }

  // 玩家队不被自动接管：AI 逻辑不得代玩家设置准备模式
  const userClub = world.clubs.find((club) => club.id === world.userClubId);
  assert.equal(
    ensureTrainingBoost(userClub).mode,
    "balanced",
    "the player's own preparation stays under player (or delegated) control"
  );

  console.log(
    JSON.stringify(
      {
        compared,
        aiClubs: aiClubs.length,
        nonBalanced,
        distribution: Object.fromEntries([...modes.entries()].sort()),
      },
      null,
      2
    )
  );
} finally {
  Math.random = originalRandom;
}
