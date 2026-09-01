/**
 * 诊断（时限插入的可行性前提）：禁区内的**进攻产出**依赖长停留还是短停留？
 *
 * 为什么必须先问这个（AGENTS.md 负结果留档五）：把 A 类 support 目标硬性推回禁区边缘
 * 时，A 类只占 support 总时长 4.7%，却让进球 2.88 → 2.29、转化率 9.2% → 7.9%、
 * 强队积分 2.21 → 1.17（比分 62–33 被反超成 29–33）。结论是「方向对、手段错」：
 * 硬 clamp 对 A 类允许的停留是 **0 秒**，把合理的抢点插入一起铲了。
 *
 * 下一步设计是**有时限的禁区插入**（允许进禁区抢点，到点回撤边缘）。它成立的前提是：
 *   进球/射门集中在**短停留**，而留区传球循环集中在**长停留**。
 * 若两者的 dwell 分布重叠，则任何时限都会按同一比例砍掉产出，设计不成立，需另找杠杆。
 *
 * `_box-receiver-occupancy-probe.mjs` 已量出留区传球接球人的 dwell：
 * 中位 6.7s、p25 3s、p75 14.3s、p90 24.1s、最长 82.4s。本脚本补上对照组：
 * **禁区内射门/进球者在出脚那一刻已经站了多久。**
 *
 * 输出四组：
 *   1. 禁区内射门者的 dwell 分布（对照留区传球接球人）。
 *   2. 其中进球者的 dwell 分布——真正的产出来源。
 *   3. 权衡曲线：若时限为 T，有多少比例的射门/进球发生在 T 之内（= 会被保留），
 *      对比有多少比例的留区传球发生在 T 之内（= 不会被消掉）。
 *      时限可行的标志是「保留的产出 ≫ 保留的循环」。
 *   4. 射门者与留区接球人是否同一批人（fsm、目标是否也在禁区内）。
 *
 * 口径与 `_box-receiver-occupancy-probe.mjs` 严格一致：同种子 372000..372005、能力 15、
 * 标准档、dwell 以「连续处于对方禁区内」计（角球/任意球摆位不单独剔除）。
 * 全程只读引擎公开状态，不消费随机数，同种子下开关本脚本不改变比分。
 * `_` 前缀按仓库惯例表示诊断脚本，不进 `verify.mjs`。
 *
 * 已知口径限制（读结论前必须知道）：
 *   · dwell 只对**射门瞬间已在禁区内**的射门有意义；禁区外射门不计入，单独报数量。
 *   · 「进球」按射门事件后 2.5 秒内出现同队 goal 事件归因（引擎 goal 事件不带射门 id），
 *     乌龙球与点球已排除。这个归因在连续快攻里可能错配，量级可信、绝对值不可当精确数。
 *   · 时限曲线是**静态分箱**，不是改动后的预测：留档五已证明「类别占比」不等于
 *     「消除率」（预测消掉 56%，实际留区占比只降 6.9pp，中间隔着替代选项再分配）。
 *     本曲线只用于判断「产出与循环的 dwell 是否可分」，不预测改动幅度。
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
    },
  };
}

const METRES_X = SIM.PITCH_W_METRES / SIM.FIELD_W;
const METRES_Y = SIM.PITCH_H_METRES / SIM.FIELD_H;
const speedMps = (a) => Math.hypot((a.vx || 0) * METRES_X, (a.vy || 0) * METRES_Y);

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
const shareWithin = (values, limit) =>
  pct(values.filter((v) => v <= limit).length, values.length);

// 默认 6 场与 occupancy 探针同口径；可传场次放大样本（进球 n 小是本探针的弱点）。
const matchCount = Math.max(1, Number(process.argv[2]) || 6);
const seeds = Array.from({ length: matchCount }, (_, i) => 372000 + i);
const timeStep = SIM.DT;
const GOAL_ATTRIB_WINDOW = 2.5;
const LIMITS = [2, 3, 4, 5, 6, 8, 12];

// 禁区内射门者画像
const shotDwell = [];
const goalDwell = [];
const shotSpeed = [];
let shotsInBox = 0;
let shotsOutBox = 0;
let shotTargetInBox = 0;
let shotTargetOutBox = 0;
let shotTargetMissing = 0;
const shotFsm = new Map();
// 留区传球接球人 dwell（对照组，与 occupancy 探针同口径重算）
const recycleDwell = [];

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
    let prevOwnerId = null;
    let prevOwnerX = 0;
    let prevOwnerY = 0;
    let prevOwnerTeam = null;
    let lastSeenPassAt = -1;
    let seenEvents = 0;
    // 待归因的禁区内射门：等 GOAL_ATTRIB_WINDOW 秒内是否出现同队进球
    const pendingShots = [];
    const boxEnteredAt = new Map();

    for (let step = 0; step < steps; step++) {
      engine.step(timeStep);
      const b = engine.ball;

      // —— dwell 维护：与 occupancy 探针逐字同口径 ——
      for (const p of engine.agents) {
        if (p.sentOff || p.role === "GK") {
          boxEnteredAt.delete(p.id);
          continue;
        }
        const defending = p.team === "home" ? "away" : "home";
        if (engine._inOwnFoulBox(defending, p.x, p.y)) {
          if (!boxEnteredAt.has(p.id)) boxEnteredAt.set(p.id, engine.t);
        } else {
          boxEnteredAt.delete(p.id);
        }
      }

      // —— 增量读取新事件：射门记 dwell，进球回填归因 ——
      for (; seenEvents < engine.events.length; seenEvents++) {
        const ev = engine.events[seenEvents];
        if (ev.type === "shot") {
          const shooter = ev.agentId ? engine.agentById(ev.agentId) : null;
          if (!shooter) continue;
          const defending = shooter.team === "home" ? "away" : "home";
          // 射门瞬间已在禁区内才有 dwell 语义
          if (!engine._inOwnFoulBox(defending, shooter.x, shooter.y)) {
            shotsOutBox++;
            continue;
          }
          shotsInBox++;
          const enteredAt = boxEnteredAt.get(shooter.id);
          const dwell = Number.isFinite(enteredAt) ? engine.t - enteredAt : 0;
          shotDwell.push(dwell);
          shotSpeed.push(speedMps(shooter));
          bump(shotFsm, shooter.fsm || "?");
          const tx = shooter.offBallTarget?.x;
          const ty = shooter.offBallTarget?.y;
          if (!Number.isFinite(tx) || !Number.isFinite(ty)) shotTargetMissing++;
          else if (engine._inOwnFoulBox(defending, tx, ty)) shotTargetInBox++;
          else shotTargetOutBox++;
          pendingShots.push({ team: ev.team || shooter.team, t: ev.t ?? engine.t, dwell });
        } else if (ev.type === "goal") {
          if (ev.ownGoal || ev.penalty) continue;
          const goalT = ev.t ?? engine.t;
          // 取窗口内最近的同队禁区射门
          let bestIndex = -1;
          let bestGap = Infinity;
          for (let i = 0; i < pendingShots.length; i++) {
            const s = pendingShots[i];
            if (s.team !== ev.team) continue;
            const gap = goalT - s.t;
            if (gap < -0.01 || gap > GOAL_ATTRIB_WINDOW) continue;
            if (gap < bestGap) {
              bestGap = gap;
              bestIndex = i;
            }
          }
          if (bestIndex >= 0) {
            goalDwell.push(pendingShots[bestIndex].dwell);
            pendingShots.splice(bestIndex, 1);
          }
        }
      }
      // 过期的待归因射门丢弃，避免跨回合错配
      for (let i = pendingShots.length - 1; i >= 0; i--) {
        if (engine.t - pendingShots[i].t > GOAL_ATTRIB_WINDOW) pendingShots.splice(i, 1);
      }

      // —— 对照组：留区传球接球人的 dwell（与 occupancy 探针同式） ——
      const passAt = b.lastPassAt || 0;
      const isFreshPass =
        b.state === "pass" && passAt !== lastSeenPassAt && b.lastPasserId != null;
      if (isFreshPass) {
        lastSeenPassAt = passAt;
        const passer = engine.agentById(b.lastPasserId);
        const px = passer && b.lastPasserId === prevOwnerId ? prevOwnerX : passer?.x;
        const py = passer && b.lastPasserId === prevOwnerId ? prevOwnerY : passer?.y;
        const team = passer?.team || prevOwnerTeam;
        if (passer && Number.isFinite(px) && Number.isFinite(py) && team) {
          const defendingTeam = team === "home" ? "away" : "home";
          if (
            engine._inOwnFoulBox(defendingTeam, px, py) &&
            Number.isFinite(b.targetX) &&
            Number.isFinite(b.targetY) &&
            engine._inOwnFoulBox(defendingTeam, b.targetX, b.targetY)
          ) {
            const receiver = b.receiverId ? engine.agentById(b.receiverId) : null;
            if (receiver) {
              const enteredAt = boxEnteredAt.get(receiver.id);
              recycleDwell.push(Number.isFinite(enteredAt) ? engine.t - enteredAt : 0);
            }
          }
        }
      }

      const owner = b.owner ? engine.agentById(b.owner) : null;
      if (owner) {
        prevOwnerId = owner.id;
        prevOwnerX = owner.x;
        prevOwnerY = owner.y;
        prevOwnerTeam = owner.team;
      }
    }
  } finally {
    Math.random = original;
  }
}

const dist = (values) => ({
  n: values.length,
  中位: median(values),
  p25: quantile(values, 0.25),
  p75: quantile(values, 0.75),
  p90: quantile(values, 0.9),
  最长: Number(Math.max(0, ...values).toFixed(2)),
});

console.log(`\n=== 禁区内射门/进球者的停留时长 vs 留区传球循环（${seeds.length} 场，种子 ${seeds[0]}..${seeds[seeds.length - 1]}）===`);
console.log(`\n禁区内射门 ${shotsInBox} 次、禁区外射门 ${shotsOutBox} 次（禁区外不计 dwell）`);
console.log(`归因成功的禁区内进球 ${goalDwell.length} 个（窗口 ${GOAL_ATTRIB_WINDOW}s，已排除乌龙与点球）`);

console.log("\n[对照1] 禁区内射门者在出脚那一刻已站了多久（秒）：");
console.log(dist(shotDwell));
console.log("\n[对照2] 其中进球者（真正的产出来源）：");
console.log(dist(goalDwell));
console.log("\n[对照3] 留区传球接球人（循环，occupancy 探针同口径重算）：");
console.log(dist(recycleDwell));

console.log("\n[权衡曲线] 时限 T 秒时，各类事件发生在 T 之内的占比%：");
console.log("  （时限可行的标志：射门/进球的保留率 ≫ 留区传球的保留率）");
const curve = LIMITS.map((limit) => ({
  "时限T(秒)": limit,
  "射门保留%": shareWithin(shotDwell, limit),
  "进球保留%": shareWithin(goalDwell, limit),
  "留区传球保留%": shareWithin(recycleDwell, limit),
  "产出-循环差(pp)": Number(
    (shareWithin(goalDwell, limit) - shareWithin(recycleDwell, limit)).toFixed(1)
  ),
}));
console.table(curve);

console.log("\n[辅助] 禁区内射门者的 fsm 分布：");
console.log(
  Object.fromEntries(
    [...shotFsm.entries()].map(([k, v]) => [k, `${v} (${pct(v, shotsInBox)}%)`])
  )
);
console.log("\n[辅助] 禁区内射门者自己的 offBallTarget 在哪：");
console.log({
  目标也在禁区内: `${shotTargetInBox} (${pct(shotTargetInBox, shotsInBox)}%)`,
  目标在禁区外: `${shotTargetOutBox} (${pct(shotTargetOutBox, shotsInBox)}%)`,
  无有效目标: `${shotTargetMissing} (${pct(shotTargetMissing, shotsInBox)}%)`,
});
console.log("\n[辅助] 禁区内射门者出脚瞬间速度（m/s，对照留区接球人的 0.82）：");
console.log({ 中位: median(shotSpeed), p25: quantile(shotSpeed, 0.25), p75: quantile(shotSpeed, 0.75) });

console.log(`
判别：
  · 时限插入**可行**的标志——[权衡曲线] 里存在某个 T，使「进球保留%」明显高于
    「留区传球保留%」（差值为正且可观）。此时时限能砍循环而留产出。
  · 时限插入**不可行**的标志——两条曲线贴合（差值≈0 或为负），说明产出与循环
    来自同一批长停留，任何时限都按同比例砍掉进球，需回到上游另找杠杆。
  · 口径限制见文件头：进球归因是 ${GOAL_ATTRIB_WINDOW}s 窗口的就近匹配，非精确；
    曲线是静态分箱，不预测改动后的幅度（留档五已证明占比≠消除率）。
`);
