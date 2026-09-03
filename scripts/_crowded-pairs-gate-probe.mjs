/**
 * 探针：`crowdedPairs` 这个闸门到底能不能用。
 *
 * 背景：`box-defending-audit.mjs:217` 断言 `crowdedPairs <= 14`，而干净基线是 12——
 * 余量只有 2。问题在于它是**写死的 4 场（种子 165000..165003）的绝对次数**：
 * 任何动引擎的改动都会从第一次死球起让整场重新掷一遍，4 场的绝对计数跟着重掷。
 * 实测同一个改动家族给出 3 / 12 / 15 三个值——摆动幅度 12，是余量的 6 倍。
 * 所以那个断言既挡不住真回归，也放不过真改进。
 *
 * 本探针量两件事，用来给出一个**能用**的门槛：
 *   1. 同一份代码在**不同种子窗口**下的摆动（窗口间噪声）
 *   2. 换成「每场次数」而不是「绝对次数」之后，摆动收窄多少
 *
 * 口径与 `box-defending-audit` / `_crowded-pairs-probe` 的 `makeClub` 逐字一致：
 * 能力 12、标准档、0.1s 步长、separationPasses 8；同队、盯同一持球人的 `support`
 * 目标点距离 < 1.6m 且持续 ≥ 0.6s 记一次；`ball.restartType` 存在时清空计时。
 *
 * ⚠ 2026-09-03 修正：本文件此前的 `makeClub` 多写了一个 `crossing` 属性，而审计的
 *   属性表里没有它——属性表不同 → 球员数据不同 → 整场轨迹不同。头注释当时已经声称
 *   「逐字一致」，所以那一版跑出来的绝对值（每场 2.92 / 2.58 / 2.17）**不能当审计的
 *   基线读**，只能读作「这个指标的噪声量级」。属性表现已对齐审计。
 *
 * 用法：node scripts/_crowded-pairs-gate-probe.mjs [每窗场数=8]
 */
import { SimEngine, SIM } from "../js/sim/engine.js";

const perWindow = Math.max(4, Number(process.argv[2]) || 8);
const BASES = [165000, 166000, 167000];
const MIN_M = 1.6;
const MIN_S = 0.6;
const step = SIM.DT;
const METRES_X = SIM.PITCH_W_METRES / SIM.FIELD_W;
const METRES_Y = SIM.PITCH_H_METRES / SIM.FIELD_H;
const distanceMetres = (ax, ay, bx, by) =>
  Math.hypot((ax - bx) * METRES_X, (ay - by) * METRES_Y);

function makeClub(name, ability) {
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
    ]) attrs[key] = rating;
    return { id, name: id, pos, number: index + 1, fitness: 100, attrs };
  });
  return {
    id: name, name, players,
    tactics: { formation: "4-3-3", lineup: players.map((p) => p.id), pressing: 3, tempo: 3, defensiveLine: 3, style: "balanced" },
  };
}

function seededRandom(seed) {
  let v = seed >>> 0;
  return () => {
    v += 0x6d2b79f5;
    let n = v;
    n = Math.imul(n ^ (n >>> 15), n | 1);
    n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}

/** 一场比赛的重叠回合数与 support 配对样本量 */
function runMatch(seed) {
  const original = Math.random;
  Math.random = seededRandom(seed);
  const openCrowding = new Map();
  let episodes = 0;
  let supportPairs = 0;
  try {
    const engine = new SimEngine(
      makeClub(`home-${seed}`, 12),
      makeClub(`away-${seed}`, 12),
      { simulationProfile: "standard", timeStep: step, separationPasses: 8 }
    );
    const steps = Math.round((90 * 60) / step);
    for (let i = 0; i < steps; i++) {
      engine.step(step);
      const ball = engine.ball;
      if (ball.restartType) {
        openCrowding.clear();
        continue;
      }
      const supports = engine.agents.filter(
        (a) => !a.sentOff && a.fsm === "support" && a.offBallTarget?.ownerId != null
      );
      const seen = new Set();
      for (let x = 0; x < supports.length; x++) {
        for (let y = x + 1; y < supports.length; y++) {
          const a = supports[x];
          const b = supports[y];
          if (a.team !== b.team) continue;
          if (a.offBallTarget.ownerId !== b.offBallTarget.ownerId) continue;
          supportPairs++;
          if (distanceMetres(a.tx, a.ty, b.tx, b.ty) >= MIN_M) continue;
          const pair = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
          const key = `${a.offBallTarget.ownerId}|${pair}`;
          seen.add(key);
          if (!openCrowding.has(key)) openCrowding.set(key, engine.t);
        }
      }
      for (const [key, since] of [...openCrowding]) {
        if (seen.has(key)) continue;
        if (engine.t - since >= MIN_S) episodes++;
        openCrowding.delete(key);
      }
    }
  } finally {
    Math.random = original;
  }
  return { episodes, supportPairs };
}

const rows = [];
for (const base of BASES) {
  const per = [];
  let pairs = 0;
  for (let i = 0; i < perWindow; i++) {
    const r = runMatch(base + i);
    per.push(r.episodes);
    pairs += r.supportPairs;
  }
  const total = per.reduce((a, b) => a + b, 0);
  rows.push({
    窗口: `${base}..${base + perWindow - 1}`,
    绝对次数: total,
    每场: Number((total / perWindow).toFixed(2)),
    单场最少: Math.min(...per),
    单场最多: Math.max(...per),
    逐场: per.join(","),
    support配对样本: pairs,
  });
}

console.log(JSON.stringify({ 每窗场数: perWindow, 窗口数: BASES.length, rows }, null, 2));

const totals = rows.map((r) => r.绝对次数);
const rates = rows.map((r) => r.每场);
const spread = (v) => Number((Math.max(...v) - Math.min(...v)).toFixed(2));
console.log(`
门槛现为**每场次数** ≤ ${6}（\`box-defending-audit.mjs\` 的 CROWDED_PAIRS_PER_MATCH_LIMIT，
12 场窗口 165000..165011），配套上锚见 \`_crowded-pairs-anchor-probe.mjs\`（松弛失效每场 9.25）。
窗口间摆动  绝对次数 ${Math.min(...totals)}~${Math.max(...totals)}（跨度 ${spread(totals)}）
           每场    ${Math.min(...rates)}~${Math.max(...rates)}（跨度 ${spread(rates)}）

读法：**换种子窗口就是换轨迹，而任何动引擎的改动同样会换轨迹**，所以「窗口间摆动」
才是那条固定种子断言该用的噪声模型，不是窗口内的标准误。若某次改动把每场次数推到
无辜窗口的上界之外、又远低于 9.25，那它既不是噪声也不是松弛失效，值得单独查。`);
