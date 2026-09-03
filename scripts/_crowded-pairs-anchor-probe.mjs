/**
 * 探针：给 `crowdedPairs` 闸门找上锚——「真的坏掉」是多少。
 *
 * `_crowded-pairs-gate-probe.mjs` 已经给出下锚（噪声）：12 场/窗、三个窗口，
 * 每场 2.92 / 2.58 / 2.17，窗口间跨度 0.75；单场 0~10，合并 36 场均值 2.56、
 * 池内标准差约 2.48（对 Poisson 过散约 2.4 倍），所以 12 场窗口均值的 2σ ≈ ±1.4。
 *
 * 但只有下锚不足以定门槛：旧断言（4 场绝对次数 ≤14、基线 12）失败的根因**不是**
 * 样本小，而是**没人知道坏掉长什么样**——门槛是从一组幸运种子 +2 猜的，于是既挡不住
 * 回归也放不过改进。换成「每场 + 12 场」只是把噪声压小，如果门槛照旧凭噪声猜，
 * 就还是一条不知道自己能否失败的断言（同 `vcfm-audit-dead-assertions` 那类错误）。
 *
 * 所以本探针把队级横向松弛 `_separateSupportTargets` 换成空函数，量同一批 12 个
 * 种子下 `crowdedPairs` 涨到多少。那正是这条断言存在的理由——松弛失效。
 * 门槛应当落在「基线 + 噪声」与「松弛失效」之间，并且离两边都有距离。
 *
 * ⚠ 关掉松弛会改 `tx`，球员走位随之改变，进而改变抢断/传球，从第一次死球起整场重掷。
 *   所以 off 档的数字里也含重掷噪声，不是纯效应；这正是为什么要看**量级**而不是差值。
 *   松弛本身不消费随机数（`box-defending-audit` 第 4 节已断言），所以重掷来自轨迹而非流。
 *
 * 口径与 `box-defending-audit` 的 `makeClub` **逐字一致**：能力 12、标准档、0.1s 步长、
 * separationPasses 8；同队、盯同一持球人的 `support` 目标点距离 < 1.6m 且持续 ≥ 0.6s
 * 记一次；`ball.restartType` 存在时清空计时。
 *
 * ⚠ `_crowded-pairs-gate-probe.mjs` 的头注释声称与本审计「逐字一致」，实际它的
 *   `makeClub` 多写了一个 `crossing` 属性（审计的属性表里没有）。属性表不同 → 球员
 *   数据不同 → 整场轨迹不同，所以那支探针的绝对值不能直接当审计的基线读。
 *   本探针已对齐审计（不含 `crossing`）。
 *
 * 用法：node scripts/_crowded-pairs-anchor-probe.mjs [场数=12]
 */
import { SimEngine, SIM } from "../js/sim/engine.js";

const matches = Math.max(4, Number(process.argv[2]) || 12);
const BASE = 165000;
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

/** 一场比赛的重叠回合数；relax=false 时把队级松弛换成空函数 */
function runMatch(seed, relax) {
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
    // 实例级覆盖，不动仓库代码；只在本进程本场生效。
    if (!relax) engine._separateSupportTargets = () => {};
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

const stats = (v) => {
  const n = v.length;
  const mean = v.reduce((a, b) => a + b, 0) / n;
  const variance = n > 1 ? v.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1) : 0;
  return {
    每场: Number(mean.toFixed(2)),
    总次数: v.reduce((a, b) => a + b, 0),
    单场最少: Math.min(...v),
    单场最多: Math.max(...v),
    单场标准差: Number(Math.sqrt(variance).toFixed(2)),
    窗口均值标准误: Number(Math.sqrt(variance / n).toFixed(2)),
    逐场: v.join(","),
  };
};

const arms = {};
for (const [label, relax] of [["松弛开启（基线）", true], ["松弛关闭（已知坏掉）", false]]) {
  const per = [];
  let pairs = 0;
  for (let i = 0; i < matches; i++) {
    const r = runMatch(BASE + i, relax);
    per.push(r.episodes);
    pairs += r.supportPairs;
  }
  arms[label] = { ...stats(per), support配对样本: pairs };
}

console.log(JSON.stringify({ 场数: matches, 种子: `${BASE}..${BASE + matches - 1}`, arms }, null, 2));

const on = arms["松弛开启（基线）"];
const off = arms["松弛关闭（已知坏掉）"];
console.log(`
基线每场 ${on.每场}（标准误 ${on.窗口均值标准误}）
坏掉每场 ${off.每场}（标准误 ${off.窗口均值标准误}）
倍数     ${(off.每场 / Math.max(0.01, on.每场)).toFixed(1)}×

读法：门槛要落在两者之间且离两边都有距离。若倍数不足 2×，说明这条断言即使换成
每场 + 12 场也**测不出松弛失效**，那就不是调门槛的问题，而是这个检测器本身该换。`);
