/**
 * 诊断（决定「快速通路」该怎么建）：近静止的球员是**已到达目标点**，还是**目标点在远处但走不快**。
 *
 * 背景（AGENTS.md 交接段 + 留档七）：视频侧量出 VCFM 全场位移中位 1.91 m/s、
 * 近静止占比 **34.0%**，而 FM26 是 2.75 m/s、16.2%。整个引擎在慢动作运行。
 * 留档四~七连续四条杠杆失败，共同原因是「循环与产出是同一个现象」，
 * 结论是应先**建出缺失的快速进攻通路**而不是继续压制循环。
 *
 * 但「建通路」有两种完全不同的含义，工作量差一个量级：
 *   甲「目标点太保守」：球员已站在自己的目标点上，所以不动。
 *                       → 缺的是无球冲刺/插入的**决策**，杠杆在 `_attackPlan` 目标点生成。
 *   乙「走不快」：目标点在远处，但加速度/最大速度/体力把他压住了。
 *                 → 杠杆在移动物理层，与决策无关，改跑位分支无用。
 *
 * 这两者决定后面所有工作的方向，所以先量。**这是纯测量，不改引擎。**
 *
 * 口径与 `_box-entry-rate-probe.mjs` / `_box-carry-entry-probe.mjs` 一致：
 * 同种子 372000..372005、能力 15、标准档、每 0.1 秒采样。
 * 速度阈值 1.0 m/s 与视频侧「近静止 <1 m/s」同口径，可与那 34.0% 直接对照。
 * 全程只读引擎公开状态，不消费随机数，同种子下开关本脚本不改变比分。
 * `_` 前缀按仓库惯例表示诊断脚本，不进 `verify.mjs`。
 *
 * 口径限制（读结论前必须知道）：
 *   · 速度取相邻采样帧的位移差，不是引擎内部的 vx/vy 瞬时值；两者在 0.1s 尺度上接近。
 *   · 排除持球人（他的慢是带球控球，不是跑位问题）与被罚下者。
 *   · 门将单独统计——他本来就该几乎不动，混进去会稀释结论。
 *   · 「有效目标点」指 tx/ty 为有限数；到目标距离按引擎单位换算成米（x 0.68、y 1.05）。
 */
import { SimEngine, SIM } from "../js/sim/engine.js";

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
      "positioning", "kicking", "decisions", "crossing",
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
    },
  };
}

const METRES_X = SIM.PITCH_W_METRES / SIM.FIELD_W;
const METRES_Y = SIM.PITCH_H_METRES / SIM.FIELD_H;
const distM = (ax, ay, bx, by) =>
  Math.hypot((ax - bx) * METRES_X, (ay - by) * METRES_Y);

const median = (values) => {
  if (!values.length) return 0;
  const s = [...values].sort((x, y) => x - y);
  const m = s.length >> 1;
  return Number((s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2).toFixed(2));
};
const pct = (num, den) => Number(((num / Math.max(1, den)) * 100).toFixed(1));
const quantile = (values, q) => {
  if (!values.length) return 0;
  const s = [...values].sort((x, y) => x - y);
  return Number(s[Math.min(s.length - 1, Math.floor(s.length * q))].toFixed(2));
};

const matchCount = Math.max(1, Number(process.argv[2]) || 6);
const seeds = Array.from({ length: matchCount }, (_, i) => 372000 + i);
const timeStep = SIM.DT;
const STILL = 1.0; // m/s，与视频侧「近静止」同口径

// 全体非持球外场球员的速度样本（用于对账视频侧的 34.0%）
const allSpeeds = [];
const gkSpeeds = [];
// 近静止样本的画像
const still = {
  n: 0,
  hasTarget: 0,
  noTarget: 0,
  distToTarget: [],
  fsm: new Map(),
  stamina: [],
  // 分档：已到位 vs 目标在远处
  arrived: 0,     // <1.5m，视为已到达
  nearby: 0,      // 1.5~4m
  farStanding: 0, // >4m 却几乎不动 —— 这是最刺眼的一类
};
// 对照：跑动中（>2 m/s）的样本，看它们的目标距离，判断「远目标是否本来就会跑」
const moving = { n: 0, distToTarget: [] };

const bump = (map, key) => map.set(key, (map.get(key) || 0) + 1);

for (const seed of seeds) {
  const original = Math.random;
  Math.random = seededRandom(seed);
  try {
    const engine = new SimEngine(
      makeClub(`home-${seed}`, 15),
      makeClub(`away-${seed}`, 15),
      { simulationProfile: "standard", timeStep, separationPasses: 8 }
    );
    const steps = Math.round((90 * 60) / timeStep);
    const prev = new Map();

    for (let step = 0; step < steps; step++) {
      engine.step(timeStep);
      const ownerId = engine.ball.owner;

      for (const p of engine.agents) {
        if (p.sentOff) {
          prev.delete(p.id);
          continue;
        }
        const last = prev.get(p.id);
        prev.set(p.id, { x: p.x, y: p.y });
        if (!last) continue;

        const speed = distM(p.x, p.y, last.x, last.y) / timeStep;
        if (p.role === "GK") {
          gkSpeeds.push(speed);
          continue;
        }
        // 持球人的慢是带球控球，不是跑位问题
        if (p.id === ownerId) continue;

        allSpeeds.push(speed);

        const hasTarget = Number.isFinite(p.tx) && Number.isFinite(p.ty);
        const d = hasTarget ? distM(p.x, p.y, p.tx, p.ty) : null;

        if (speed < STILL) {
          still.n++;
          if (hasTarget) {
            still.hasTarget++;
            still.distToTarget.push(d);
            if (d < 1.5) still.arrived++;
            else if (d < 4) still.nearby++;
            else still.farStanding++;
          } else {
            still.noTarget++;
          }
          bump(still.fsm, p.fsm || "?");
          if (Number.isFinite(p.attr?.stamina)) still.stamina.push(p.attr.stamina);
        } else if (speed > 2.0) {
          moving.n++;
          if (hasTarget) moving.distToTarget.push(d);
        }
      }
    }
  } finally {
    Math.random = original;
  }
}

const mapReport = (map, total) =>
  Object.fromEntries(
    [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => [k, `${v} (${pct(v, total)}%)`])
  );

console.log(`\n=== 球员为什么慢：近静止球员的目标点画像（${seeds.length} 场，种子 ${seeds[0]}..${seeds[seeds.length - 1]}）===`);

console.log("\n[0] 先对账视频侧——确认这把尺子量的是同一件事：");
console.log({
  "非持球外场球员速度中位(m/s)": median(allSpeeds),
  "视频侧实测中位": 1.91,
  "近静止<1m/s占比%": pct(allSpeeds.filter((s) => s < STILL).length, allSpeeds.length),
  "视频侧实测占比%": 34.0,
  "FM26 对照": "2.75 m/s / 16.2%",
  样本数: allSpeeds.length,
});
console.log(`（门将单独统计，中位 ${median(gkSpeeds)} m/s，未计入上表）`);

console.log("\n[1] 主证据——近静止球员离自己的目标点有多远（米）：");
console.log({
  近静止样本数: still.n,
  有有效目标点: `${still.hasTarget} (${pct(still.hasTarget, still.n)}%)`,
  无有效目标点: `${still.noTarget} (${pct(still.noTarget, still.n)}%)`,
  中位: median(still.distToTarget),
  p25: quantile(still.distToTarget, 0.25),
  p75: quantile(still.distToTarget, 0.75),
  p90: quantile(still.distToTarget, 0.9),
});

console.log("\n[2] 分档——甲「已到位」vs 乙「远目标却不动」：");
const withT = Math.max(1, still.hasTarget);
console.log({
  "甲 已到达(<1.5m)": `${still.arrived} (${pct(still.arrived, withT)}%)`,
  "  中间带(1.5~4m)": `${still.nearby} (${pct(still.nearby, withT)}%)`,
  "乙 远目标却不动(>4m)": `${still.farStanding} (${pct(still.farStanding, withT)}%)`,
});

console.log("\n[3] 对照组——跑动中(>2m/s)球员的目标距离，看远目标是否本来就会跑：");
console.log({
  样本数: moving.n,
  中位: median(moving.distToTarget),
  p75: quantile(moving.distToTarget, 0.75),
});

console.log("\n[4] 近静止球员的 fsm 分布：");
console.log(mapReport(still.fsm, still.n));

console.log("\n[5] 近静止球员的体力属性（排除体力属性过低这个解释）：");
console.log({
  中位: median(still.stamina),
  p25: quantile(still.stamina, 0.25),
  p10: quantile(still.stamina, 0.1),
});

console.log(`
判别：
  · 甲「目标点太保守」成立的标志——[2] 里「已到达(<1.5m)」占绝大多数，且 [1] 的
    目标距离中位很小。说明球员不是走不快，而是**没有被指派更远的跑位**。
    → 杠杆在 \`_attackPlan\` 的目标点生成：缺无球冲刺/纵深插入的决策。
  · 乙「走不快」成立的标志——[2] 里「远目标却不动(>4m)」占可观比例，且 [3] 显示
    跑动中球员的目标距离与之相当（即同样距离有人跑有人不跑，差别不在距离）。
    → 杠杆在移动物理层（加速度/最大速度/体力），改跑位分支无用。
  · [5] 若体力中位很低，则「慢」有第三种解释（体力模型过度惩罚），需单独处理。
  · 注意 v238 已留档一条教训：**肉眼读静态帧会系统性高估「球员静止」**，
    当时实测「目标 >5m 却不动」仅 0.1%。本探针若复现出同样的低比例，
    则甲成立、乙被排除，与那次结论一致。
`);
