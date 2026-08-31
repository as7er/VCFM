/**
 * 诊断：禁区内「留区传球」的接球人是**静态占位**还是**跑动插入**。
 *
 * 背景（AGENTS.md v239 遗留 #1，负结果留档四）：让 `distPen` 对拥堵度敏感的方向已被
 * 实测否决——拥堵度不区分禁区内外（禁区内中位 3 人、非禁区 2 人），以它为闸门会波及
 * 一半到四分之三的非禁区传球，而禁区翻转率只有 3~4.6%。同一次测量还量出：**每场有
 * 250 次传球是从对方禁区里出脚的，占全部传球 27%**，真实足球里这个比例极小。
 *
 * 于是把问题往上游推一格：58.3% 的禁区传球能留在禁区，前提是**禁区里站着可传的接球人**
 * （实测非持球进攻者中位仅 2 名，本就在死代码 `_capAttackersInBox` 上限之内，所以不是
 * 人数堆积）。本脚本要判定的是这 2 名接球人怎么来的：
 *
 *   假设 A「静态占位」：无球 support 目标本身就生成在禁区里，把人钉在那儿。
 *                        → 杠杆在 support 目标生成（`off-ball-movement.js` / `_offBallTarget`），
 *                          与 crowdedPairs 的「12/12 持球人是 ATT、全在对方禁区纵深」同源。
 *   假设 B「跑动插入」：人是冲进去的，目标点在禁区外或刚好穿过。
 *                        → 杠杆不在站位，需另找。
 *
 * 判别指标（按证据强度排序）：
 *   1. 接球人的 `offBallTarget` 是否**也在禁区内**——最直接：目标点在里面就是被指过去的。
 *   2. 接球人在禁区内的**连续停留时长**（dwell）——静态占位应显著长于穿越所需时间。
 *   3. 接球人在出脚瞬间的**速度**（m/s）——占位者慢，插入者快。
 *
 * 口径与 `_box-pass-value-probe.mjs` / `_congestion-distpen-probe.mjs` 一致
 * （同种子 372000..372005、能力 15、标准档），以便三份数据交叉。
 * 全程只读引擎公开状态，不调用 `_passCandidates`（会消耗随机数），
 * 同种子下开关本脚本不改变比分。`_` 前缀按仓库惯例表示诊断脚本，不进 `verify.mjs`。
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

const seeds = [372000, 372001, 372002, 372003, 372004, 372005];
const timeStep = SIM.DT;

// 留区传球的接球人画像
const recv = {
  n: 0,
  targetInBox: 0,
  targetOutBox: 0,
  targetMissing: 0,
  dwell: [],
  speed: [],
  fsm: new Map(),
  targetKind: new Map(),
};
// 出区传球的接球人对照组（只看 dwell/speed 没意义，这里只统计 fsm 供对照）
const exitRecvFsm = new Map();
// 出脚瞬间禁区内非持球进攻者的构成
const attackersInBox = [];
const attackersInBoxWithInBoxTarget = [];
// 全场层面：进攻方球员「support 目标落在对方禁区内」的总时长占比
let supportTargetInBoxSeconds = 0;
let supportTotalSeconds = 0;

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
    // 每名球员在对方禁区内的连续停留起始时刻
    const boxEnteredAt = new Map();

    for (let step = 0; step < steps; step++) {
      engine.step(timeStep);
      const b = engine.ball;

      // 维护 dwell：逐帧记录每名球员进入/离开对方禁区的时刻
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
        // support 目标落在对方禁区内的时长占比（不限于传球瞬间）
        if (p.fsm === "support" && p.offBallTarget) {
          supportTotalSeconds += timeStep;
          const tx = p.offBallTarget.x;
          const ty = p.offBallTarget.y;
          if (
            Number.isFinite(tx) && Number.isFinite(ty) &&
            engine._inOwnFoulBox(defending, tx, ty)
          ) {
            supportTargetInBoxSeconds += timeStep;
          }
        }
      }

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
            Number.isFinite(b.targetY)
          ) {
            const stays = engine._inOwnFoulBox(defendingTeam, b.targetX, b.targetY);
            const receiver = b.receiverId ? engine.agentById(b.receiverId) : null;
            if (receiver) {
              if (!stays) {
                bump(exitRecvFsm, receiver.fsm || "?");
              } else {
                recv.n++;
                bump(recv.fsm, receiver.fsm || "?");
                bump(recv.targetKind, receiver.offBallTarget?.kind || "无目标");
                recv.speed.push(speedMps(receiver));
                const enteredAt = boxEnteredAt.get(receiver.id);
                recv.dwell.push(
                  Number.isFinite(enteredAt) ? engine.t - enteredAt : 0
                );
                const tx = receiver.offBallTarget?.x;
                const ty = receiver.offBallTarget?.y;
                if (!Number.isFinite(tx) || !Number.isFinite(ty)) recv.targetMissing++;
                else if (engine._inOwnFoulBox(defendingTeam, tx, ty)) recv.targetInBox++;
                else recv.targetOutBox++;

                // 出脚瞬间禁区内非持球进攻者构成
                let inBox = 0;
                let inBoxTargeted = 0;
                for (const p of engine.agents) {
                  if (p.team !== team || p.sentOff || p.role === "GK") continue;
                  if (p.id === passer.id) continue;
                  if (!engine._inOwnFoulBox(defendingTeam, p.x, p.y)) continue;
                  inBox++;
                  const ptx = p.offBallTarget?.x;
                  const pty = p.offBallTarget?.y;
                  if (
                    Number.isFinite(ptx) && Number.isFinite(pty) &&
                    engine._inOwnFoulBox(defendingTeam, ptx, pty)
                  ) inBoxTargeted++;
                }
                attackersInBox.push(inBox);
                attackersInBoxWithInBoxTarget.push(inBoxTargeted);
              }
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
const sortedCounts = (map, total) =>
  Object.fromEntries(
    [...map].sort((a, b) => b[1] - a[1]).map(([k, n]) => [k, `${n} (${pct(n, total)}%)`])
  );

console.log(`\n=== 留区传球的接球人画像（n=${recv.n}，6 场，种子 372000..372005）===`);

console.log("\n[证据1] 接球人自己的 offBallTarget 在哪：");
console.log({
  目标也在禁区内: `${recv.targetInBox} (${pct(recv.targetInBox, recv.n)}%)`,
  目标在禁区外: `${recv.targetOutBox} (${pct(recv.targetOutBox, recv.n)}%)`,
  无有效目标: `${recv.targetMissing} (${pct(recv.targetMissing, recv.n)}%)`,
});

console.log("\n[证据2] 接球人在对方禁区内的连续停留时长（秒）：");
console.log({
  中位: median(recv.dwell),
  p25: quantile(recv.dwell, 0.25),
  p75: quantile(recv.dwell, 0.75),
  p90: quantile(recv.dwell, 0.9),
  最长: Math.max(0, ...recv.dwell).toFixed(2),
  "停留≥2秒占比%": pct(recv.dwell.filter((d) => d >= 2).length, recv.dwell.length),
  "停留≥4秒占比%": pct(recv.dwell.filter((d) => d >= 4).length, recv.dwell.length),
});

console.log("\n[证据3] 接球人在出脚瞬间的速度（m/s，占位者应显著慢于插入者）：");
console.log({
  中位: median(recv.speed),
  p25: quantile(recv.speed, 0.25),
  p75: quantile(recv.speed, 0.75),
  "慢于2m/s占比%": pct(recv.speed.filter((s) => s < 2).length, recv.speed.length),
});

console.log("\n[辅助] 接球人 fsm 分布（留区 vs 出区对照）：");
console.log("留区接球人:", sortedCounts(recv.fsm, recv.n));
const exitTotal = [...exitRecvFsm.values()].reduce((a, c) => a + c, 0);
console.log("出区接球人:", sortedCounts(exitRecvFsm, exitTotal));

console.log("\n[辅助] 接球人 offBallTarget.kind 分布：");
console.log(sortedCounts(recv.targetKind, recv.n));

console.log("\n[辅助] 出脚瞬间禁区内非持球进攻者：");
console.log({
  人数中位: median(attackersInBox),
  "其中目标点也在禁区内的人数中位": median(attackersInBoxWithInBoxTarget),
});

console.log("\n=== 全场层面：support 目标落在对方禁区内的时长占比 ===");
console.log({
  "support 总时长(秒)": Number(supportTotalSeconds.toFixed(0)),
  "其中目标在对方禁区内(秒)": Number(supportTargetInBoxSeconds.toFixed(0)),
  占比: `${pct(supportTargetInBoxSeconds, supportTotalSeconds)}%`,
});

console.log(
  [
    "",
    "判别：",
    "  · 假设A「静态占位」成立的标志——[证据1] 目标也在禁区内占多数，且 [证据2] 停留时长",
    "    远超穿越所需时间、[证据3] 速度偏慢。此时杠杆在 support 目标生成，与 crowdedPairs 同源。",
    "  · 假设B「跑动插入」成立的标志——[证据1] 目标多在禁区外（人只是路过），",
    "    [证据2] 停留短、[证据3] 速度快。此时杠杆不在站位，需另找。",
    "  · 口径限制：dwell 以「连续处于对方禁区内」计，重启（角球/任意球摆位）不单独剔除；",
    "    速度取出脚那一帧的瞬时值。可靠的是两组对照与量级，不是绝对值。",
  ].join("\n")
);

