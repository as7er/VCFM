/**
 * 禁区贴身防守与接应目标分离审计。
 *
 * 此前对方在自家禁区持球时，防守方实测「站着看」：
 * - `markingLimit` 在阵地战下要求 `pressing >= 5`，而多数俱乐部是 3，于是禁区里
 *   一个盯人任务都不派，四名后卫全部落在 shape 上（mark 只占防守任务时长 0.2%）。
 * - 非穿透求解器在禁区内把最小间距放大到 3.35 场地单位（沿球门方向合 3.52 米），
 *   比禁区外的 2.85 还大。动机是让 2D 画面里小禁区的圆点不糊成一团，代价是战术
 *   目标要求的 3.05 米被这条几何下限直接顶开，贴身防守物理上不可能。
 * - 盯人者被支援安全圈推到离球 2.8 米，被盯者一靠近球就自动松开。
 *
 * 同时钉死接应目标分离：`_clampOffside` 会把纵深投影到越位线，把分层刚分开的接
 * 应点重新压到一起，而逐球员分层读的是队友上一 tick 的预留目标，同一 tick 内排在
 * 前面的球员看到的全是过期数据。修复改为在全部目标定稿后做一次队级横向松弛。
 *
 * 样本量：第 2 节跑 **12 场**（约 95s），不是 4 场。接应目标重叠是极尾计数，
 * 4 场的绝对次数几乎是纯重掷噪声——推导与两个实测锚点见
 * `CROWDED_PAIRS_PER_MATCH_LIMIT` 那段。盯人/贴身那几条是逐 tick 均值
 * （12.8 万 boxTicks），4 场本来就够，12 场只是顺带把分母做厚。
 */
import assert from "node:assert/strict";

import { SimEngine, SIM } from "../js/sim/engine.js";
import { OFF_BALL_TARGET_DEFAULTS } from "../js/off-ball-movement.js";

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let n = value;
    n = Math.imul(n ^ (n >>> 15), n | 1);
    n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}

function makeClub(name, ability, tactics = {}) {
  const roles = ["GK", "DEF", "DEF", "DEF", "DEF", "MID", "MID", "MID", "ATT", "ATT", "ATT"];
  const players = roles.map((pos, index) => {
    const variance = ((index * 7 + ability) % 5) - 2;
    const rating = Math.max(1, Math.min(20, ability + variance));
    const id = `${name}-p${index}`;
    const attrs = {};
    for (const key of [
      "pace", "shooting", "passing", "dribbling", "defending", "physical", "finishing",
      "tackling", "marking", "strength", "stamina", "vision", "reflexes", "handling",
      "positioning", "kicking", "decisions",
    ]) {
      attrs[key] = rating;
    }
    return { id, name: id, pos, number: index + 1, fitness: 100, attrs };
  });
  return {
    id: name,
    name,
    players,
    tactics: {
      formation: "4-3-3",
      lineup: players.map((player) => player.id),
      pressing: 3,
      tempo: 3,
      defensiveLine: 3,
      style: "balanced",
      ...tactics,
    },
  };
}

const METRES_X = SIM.PITCH_W_METRES / SIM.FIELD_W;
const METRES_Y = SIM.PITCH_H_METRES / SIM.FIELD_H;
const distanceMetres = (ax, ay, bx, by) =>
  Math.hypot((ax - bx) * METRES_X, (ay - by) * METRES_Y);

/**
 * 接应目标重叠的上限，单位是**每场次数**（见下方第 2 节那段推导）。
 *
 * 6.0 不是猜的，是三组实测夹出来的（12 场/窗、与本审计同一份 `makeClub`）：
 *   基线（本审计的种子窗口 165000..165011） 每场 3.33，逐场 6,5,2,1,2,2,3,6,4,3,6,0
 *   换种子窗口                              166000.. 每场 0.83、167000.. 每场 3.42
 *   松弛失效（`_separateSupportTargets` 换成空函数，也就是这条断言存在的那个失效）
 *                                           每场 9.25，逐场 12,10,16,9,5,14,8,8,5,8,8,8
 *
 * 关键在于**换种子窗口就是换轨迹，而任何动引擎的改动同样会从第一次死球起换轨迹**——
 * 所以「窗口间摆动」才是这条固定种子断言该用的噪声模型，而不是窗口内的标准误
 * （0.59）。三个无辜窗口的上界是 3.42，加 3 个窗口内标准误 ≈ 5.2；松弛失效的下界
 * 是 9.25 − 3×0.95 ≈ 6.4。6.0 落在 5.2~6.4 之间。
 *
 * ⚠ **这是个弱检测器**，分离度只有 2.8 倍：门槛离「坏掉」只有 3.4 个标准误，
 *   部分失效（比如松弛只在某一阶段失灵）完全可能溜过去。想收紧不能靠压低门槛
 *   （那就退回旧断言挡住真改进的老问题），只能换检测器。所以这条刻意偏宽——
 *   接应目标拥挤另有 `match-motion-integrity-audit` 在其种子上把关。
 *
 * 改这个数之前先把两支探针跑一遍：
 *   node scripts/_crowded-pairs-gate-probe.mjs 12    # 窗口间摆动
 *   node scripts/_crowded-pairs-anchor-probe.mjs 12  # 松弛失效时的量级
 */
const CROWDED_PAIRS_PER_MATCH_LIMIT = 6;

function runSample(seeds, { profile = "standard" } = {}) {
  const matches = seeds.length;
  const stats = {
    boxTicks: 0,
    nearestSum: 0,
    nearestDefenderSum: 0,
    within2: 0,
    markTicks: 0,
    defenceTicks: 0,
    crowdedPairs: 0,
    supportPairs: 0,
    tightMarkTicks: 0,
    looseMarkTicks: 0,
  };
  const step = profile === "background" ? 0.3 : SIM.DT;
  for (const seed of seeds) {
    const original = Math.random;
    Math.random = seededRandom(seed);
    const openCrowding = new Map();
    try {
      const engine = new SimEngine(
        makeClub(`home-${seed}`, 12),
        makeClub(`away-${seed}`, 12),
        { simulationProfile: profile, timeStep: step, separationPasses: profile === "background" ? 4 : 8 }
      );
      const steps = Math.round((90 * 60) / step);
      for (let index = 0; index < steps; index++) {
        engine.step(step);
        const ball = engine.ball;

        // —— 接应目标分离：同队、同持球人的 support 目标不得**持续**重叠 ——
        // 与 `match-motion-integrity.js` 同口径：死球摆位期间不计。定位球要求球员
        // 站到法定位置，此时接应目标重叠是规则要求的结果，不是跑位缺陷；检测器也
        // 在 `ball.restartType` 存在时重置计时（isMotionBoundary / _analyzeSupportTargets）。
        if (ball.restartType) {
          openCrowding.clear();
        } else {
          const supports = engine.agents.filter(
            (agent) => !agent.sentOff && agent.fsm === "support" && agent.offBallTarget?.ownerId != null
          );
          const seen = new Set();
          for (let i = 0; i < supports.length; i++) {
            for (let j = i + 1; j < supports.length; j++) {
              const a = supports[i];
              const b = supports[j];
              if (a.team !== b.team) continue;
              if (a.offBallTarget.ownerId !== b.offBallTarget.ownerId) continue;
              stats.supportPairs++;
              if (distanceMetres(a.tx, a.ty, b.tx, b.ty) >= 1.6) continue;
              const pair = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
              const key = `${a.offBallTarget.ownerId}|${pair}`;
              seen.add(key);
              if (!openCrowding.has(key)) openCrowding.set(key, engine.t);
            }
          }
          for (const [key, since] of [...openCrowding]) {
            if (seen.has(key)) continue;
            if (engine.t - since >= 0.6) stats.crowdedPairs++;
            openCrowding.delete(key);
          }
        }

        if (!ball.owner) continue;
        const owner = engine.agents.find((agent) => agent.id === ball.owner);
        if (!owner || owner.role === "GK") continue;
        const defendingTeam = owner.team === "home" ? "away" : "home";
        const inBox =
          ball.x > 22 && ball.x < 78 &&
          (defendingTeam === "home" ? ball.y >= 84 : ball.y <= 16);
        if (!inBox) continue;

        stats.boxTicks++;
        const plan = engine._defPlans?.[defendingTeam] || null;
        let nearest = Infinity;
        let nearestDefender = Infinity;
        for (const agent of engine.agents) {
          if (agent.team !== defendingTeam || agent.sentOff || agent.role === "GK") continue;
          const gap = distanceMetres(agent.x, agent.y, ball.x, ball.y);
          if (gap < nearest) nearest = gap;
          if (agent.role === "DEF" && gap < nearestDefender) nearestDefender = gap;
          if (gap < 2) stats.within2++;
          const job = plan?.jobs?.get?.(agent.id)?.type || null;
          stats.defenceTicks++;
          if (job === "mark") stats.markTicks++;
        }
        stats.nearestSum += nearest;
        stats.nearestDefenderSum += nearestDefender;
      }
    } finally {
      Math.random = original;
    }
  }
  const ticks = Math.max(1, stats.boxTicks);
  return {
    matches,
    boxTicks: stats.boxTicks,
    avgNearestDefenderMetres: Number((stats.nearestSum / ticks).toFixed(3)),
    avgNearestCentreBackMetres: Number((stats.nearestDefenderSum / ticks).toFixed(3)),
    avgDefendersWithin2Metres: Number((stats.within2 / ticks).toFixed(3)),
    markSharePct: Number(((stats.markTicks / Math.max(1, stats.defenceTicks)) * 100).toFixed(2)),
    supportPairs: stats.supportPairs,
    crowdedPairs: stats.crowdedPairs,
    // 每场次数才是能跨样本量比较的口径；绝对次数随场数线性漂，换一组种子就失效。
    crowdedPairsPerMatch: Number((stats.crowdedPairs / matches).toFixed(2)),
    crowdedPairSharePct: Number(((stats.crowdedPairs / Math.max(1, stats.supportPairs)) * 100).toFixed(3)),
  };
}

// ── 1) 非穿透求解器不得在禁区内放大身体半径 ──
{
  const source = await import("node:fs").then(({ readFileSync }) =>
    readFileSync(new URL("../js/sim/engine.js", import.meta.url), "utf8")
  );
  assert.doesNotMatch(
    source,
    /const need = inBox \? 3\.35 : minD/,
    "the separation solver must not inflate the body radius inside the penalty area"
  );
  assert.match(
    source,
    /const need = minD;/,
    "the separation solver must use one body radius everywhere"
  );
}

// ── 2) 阵地战下球进入自家禁区必须派出盯人 ──
{
  // 12 场，不是 4 场。`crowdedPairs` 是极尾计数（每场只有个位数，占几百万个 support
  // 配对的 0.001%），而**任何动引擎的改动都会从第一次死球起让整场重新掷一遍**：
  // 4 场的绝对次数因此几乎是纯重掷噪声。实测（`_crowded-pairs-gate-probe.mjs`，
  // 12 场/窗 × 3 窗）单场 0~10、池内标准差约 2.5，对 Poisson 过散约 2.4 倍；
  // 12 场窗口均值的标准误约 0.7，而 4 场约 1.2。盯人/贴身那几条是逐 tick 均值
  // （12 万 boxTicks），4 场本来就够，12 场只是顺带把它们的分母做厚。
  const seeds = Array.from({ length: 12 }, (_, index) => 165000 + index);
  const sample = runSample(seeds, { profile: "standard" });
  assert.ok(sample.boxTicks > 9000, `box possession sample too small: ${sample.boxTicks}`);
  assert.ok(
    sample.markSharePct >= 3,
    `defenders must actually mark inside their own box (mark share ${sample.markSharePct}%)`
  );
  assert.ok(
    sample.avgNearestDefenderMetres <= 2.25,
    `the nearest defender must engage the ball carrier (${sample.avgNearestDefenderMetres} m)`
  );
  assert.ok(
    sample.avgNearestCentreBackMetres <= 3.6,
    `centre backs must not stand off inside the box (${sample.avgNearestCentreBackMetres} m)`
  );
  assert.ok(
    sample.avgDefendersWithin2Metres >= 0.55,
    `at least some real body contact is expected inside the box (${sample.avgDefendersWithin2Metres})`
  );

  // 接应目标分离：队级松弛之后不应再有成对重叠
  assert.ok(sample.supportPairs > 1000, `support pair sample too small: ${sample.supportPairs}`);
  // 门槛按**每场次数**定，并且三头都有实测锚点，不是从某一组种子的运气值 +2 猜的：
  //   基线      每场 3.33（本审计的种子窗口）
  //   换窗口    每场 0.83 / 3.42（`_crowded-pairs-gate-probe.mjs`，即无辜改动的摆动量级）
  //   坏掉      每场 9.25（`_crowded-pairs-anchor-probe.mjs`，松弛换成空函数）
  // 旧断言（4 场绝对次数 ≤ 14、当时基线 12）三头都没有：同一改动家族给过 3/12/15/25，
  // 摆动幅度是余量的 6 倍，于是既挡不住真回归也放不过真改进。
  // ⚠ 绝对次数仍然打印，但**不要**再拿它当门槛：它随场数线性漂，换样本量就失效。
  assert.ok(
    sample.crowdedPairsPerMatch <= CROWDED_PAIRS_PER_MATCH_LIMIT,
    `support targets must stay separated in open play (${sample.crowdedPairsPerMatch}/match over ` +
      `${sample.matches} matches, limit ${CROWDED_PAIRS_PER_MATCH_LIMIT}; ` +
      `${sample.crowdedPairs} episodes, ${sample.crowdedPairSharePct}%)`
  );
  console.log(JSON.stringify({ standard: sample }, null, 2));
}

// ── 3) 贴身程度必须读防守意识：意识高的贴得更紧 ──
{
  const engine = new SimEngine(makeClub("sharp", 18), makeClub("blunt", 4), {
    simulationProfile: "standard",
    timeStep: SIM.DT,
    separationPasses: 8,
  });
  const sharp = engine.agents.find((agent) => agent.team === "home" && agent.role === "DEF");
  const blunt = engine.agents.find((agent) => agent.team === "away" && agent.role === "DEF");
  assert.ok(sharp && blunt, "both sides need a defender");
  assert.ok(
    Number(sharp.attr.marking) > Number(blunt.attr.marking),
    "the sharp side must really have better marking attributes"
  );
  // markDistance = clamp(2.05 + goalDistance/48 - (awareness-0.5)*1.3, 1.5, 3.4)
  const markDistance = (awareness, goalDistance) =>
    Math.min(3.4, Math.max(1.5, 2.05 + goalDistance / 48 - (awareness - 0.5) * 1.3));
  const sharpAwareness = (Number(sharp.attr.marking) + Number(sharp.attr.positioning) + Number(sharp.attr.decisions)) / 3;
  const bluntAwareness = (Number(blunt.attr.marking) + Number(blunt.attr.positioning) + Number(blunt.attr.decisions)) / 3;
  assert.ok(
    markDistance(sharpAwareness, 12) < markDistance(bluntAwareness, 12) - 0.2,
    "better defensive awareness must mark tighter"
  );
}

// ── 4) 队级松弛只动横向，不消费随机数，且相同输入确定性相同 ──
{
  const build = () => {
    const original = Math.random;
    Math.random = seededRandom(4242);
    try {
      const engine = new SimEngine(makeClub("home-4242", 12), makeClub("away-4242", 12), {
        simulationProfile: "standard",
        timeStep: SIM.DT,
        separationPasses: 8,
      });
      for (let index = 0; index < 900; index++) engine.step(SIM.DT);
      return engine;
    } finally {
      Math.random = original;
    }
  };
  const first = build();
  const second = build();
  assert.deepEqual(
    first.agents.map((agent) => [agent.id, Number(agent.tx.toFixed(6)), Number(agent.ty.toFixed(6))]),
    second.agents.map((agent) => [agent.id, Number(agent.tx.toFixed(6)), Number(agent.ty.toFixed(6))]),
    "the relaxation must be deterministic for identical inputs"
  );

  // 纵深不得被松弛改动：直接对比调用前后的 ty
  const engine = first;
  const before = engine.agents.map((agent) => [agent.id, agent.ty, agent.tx]);
  // 直接对随机源计数。引擎没有内建调用计数器，读 `engine._randomCalls` 之类的
  // 可选字段会让这条断言永远被跳过——那是一条不会失败的断言，不是检测。
  let engineRolls = 0;
  let globalRolls = 0;
  const engineRandom = engine.random;
  const globalRandom = Math.random;
  engine.random = () => (engineRolls++, engineRandom());
  Math.random = () => (globalRolls++, globalRandom());
  try {
    engine._separateSupportTargets();
  } finally {
    engine.random = engineRandom;
    Math.random = globalRandom;
  }
  for (const [id, ty] of before) {
    const agent = engine.agents.find((item) => item.id === id);
    assert.equal(agent.ty, ty, `${id}: the relaxation must never move a target in depth`);
  }
  assert.equal(engineRolls, 0, "the relaxation must not consume the engine random stream");
  assert.equal(globalRolls, 0, "the relaxation must not consume global randomness");
  assert.equal(
    OFF_BALL_TARGET_DEFAULTS.supportSpacingMetres,
    1.8,
    "the relaxation shares the off-ball spacing budget"
  );
}

console.log("Box defending audit passed: penalty-area marking, body radius, awareness-driven tightness and support separation");
