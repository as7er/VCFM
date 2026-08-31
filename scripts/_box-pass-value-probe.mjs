/**
 * 诊断：禁区内持球时，传球 value 的构成，以及「出禁区」选项差在哪个因子上。
 *
 * 背景（AGENTS.md v239 遗留 #1）：以传球结束的禁区回合中，58.3% 的传球目标点仍留在
 * 同一禁区内，而禁区里只有约 3 名进攻方（含持球人）。人少却仍在内部倒球，说明杠杆在
 * 传球价值评估，不在人数或跑位分布。
 *
 * 待验证的具体假设：`_passCandidates` 里
 *     value = (0.35 + advance) * safety * distPen * coreBoost
 *     advance = clamp((myProg - mProg) / 40, -0.5, 1)
 *     distPen = clamp(1 - d / 55, 0.2, 1)
 * 把「把球传出禁区」记为负推进（接球人离对方球门更远 → advance < 0），同时 distPen
 * 又奖励短传，两者叠加使禁区内的短横传结构性占优。若成立，出禁区候选的第一因子
 * (0.35 + advance) 会显著低于留在禁区的候选。
 *
 * —— 为什么不直接调 `_passCandidates` ——
 * 它**会消耗随机数**：直塞识别里有 `this.random() < throughIntent` 与
 * `this.random() * 4` 的落点抖动（engine.js:2875/2878）。从探针里调用它会改掉本场
 * 之后的整个随机流，等于一边测一边改，测出来的东西不再是原来的比赛。
 * 因此本脚本：
 *   · 只观察**真实发生过**的传球（读 ball.targetX/targetY 与 lastPasserId）
 *   · 因子用纯算术自行复算，`safety` 调 `_laneSafety`（2898-2917，已核对无随机调用）
 *   · 「出禁区备选」由脚本自己枚举队友复算，**不含直塞加成**（直塞正是随机数所在处）
 * 全程不消费随机数，同种子下开关本脚本不改变比分。
 *
 * `_` 前缀按仓库惯例表示诊断脚本，不进 `verify.mjs`。
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

const median = (values) => {
  if (!values.length) return 0;
  const s = [...values].sort((x, y) => x - y);
  const m = s.length >> 1;
  return Number((s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2).toFixed(3));
};

// 与 engine.js `_passCandidates` 的普通传球同式（不含直塞、越位、回做等修正项）。
function baseFactors(engine, a, m, tx, ty) {
  const goalY = engine.targetGoalY(a.team);
  const d = Math.hypot(a.x - m.x, a.y - m.y);
  const myProg = Math.abs(a.y - goalY);
  const mProg = Math.abs(m.y - goalY);
  const advance = Math.max(-0.5, Math.min(1, (myProg - mProg) / 40));
  const distPen = Math.max(0.2, Math.min(1, 1 - d / 55));
  const coreBoost = m.isCore ? 1.65 : 1;
  const safety = engine._laneSafety(a, m, tx, ty);
  const first = 0.35 + advance;
  return {
    first,
    advance,
    safety,
    distPen,
    coreBoost,
    value: first * safety * distPen * coreBoost,
    distanceUnits: d,
  };
}

const seeds = [372000, 372001, 372002, 372003, 372004, 372005];
const timeStep = SIM.DT;

const mk = () => ({ n: 0, first: [], advance: [], safety: [], distPen: [], value: [] });
const actualStay = mk();   // 真实发生的禁区传球，落点仍在禁区内
const actualExit = mk();   // 真实发生的禁区传球，落点出禁区
const forgoneExit = mk();  // 选了留在禁区时，脚本复算的最佳出禁区备选
let momentsWithExitOption = 0;
let momentsWithoutExitOption = 0;

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
    // 记录上一 tick 的持球人与位置，用于在传球刚发生的那一 tick 归因
    let prevOwnerId = null;
    let prevOwnerX = 0;
    let prevOwnerY = 0;
    let prevOwnerTeam = null;
    let lastSeenPassAt = -1;

    for (let step = 0; step < steps; step++) {
      engine.step(timeStep);
      const b = engine.ball;

      // 传球刚发出的那一 tick：state 变 pass 且 lastPassAt 是新的
      const passAt = b.lastPassAt || 0;
      const isFreshPass =
        b.state === "pass" && passAt !== lastSeenPassAt && b.lastPasserId != null;

      if (isFreshPass) {
        lastSeenPassAt = passAt;
        const passer = engine.agentById(b.lastPasserId);
        // 用出脚人当时的位置判断「是否在对方禁区内传的球」。出脚后 owner 已清空，
        // 所以用上一 tick 缓存的位置（同一 id 时）更贴近出脚瞬间。
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
            const receiver = b.receiverId ? engine.agentById(b.receiverId) : null;
            const stays = engine._inOwnFoulBox(defendingTeam, b.targetX, b.targetY);
            if (receiver) {
              // 归因用出脚人当时的位置：临时借用一个轻量壳，避免改动引擎对象
              const shell = { x: px, y: py, team, attr: passer.attr, isCore: passer.isCore };
              const f = baseFactors(engine, shell, receiver, b.targetX, b.targetY);
              const bucket = stays ? actualStay : actualExit;
              bucket.n++;
              bucket.first.push(f.first);
              bucket.advance.push(f.advance);
              bucket.safety.push(f.safety);
              bucket.distPen.push(f.distPen);
              bucket.value.push(f.value);

              if (stays) {
                // 枚举队友，找复算 value 最高的「出禁区」备选（不含直塞加成）
                let best = null;
                for (const m of engine.agents) {
                  if (m === passer || m.team !== team || m.sentOff) continue;
                  if (m.role === "GK") continue;
                  const d = Math.hypot(px - m.x, py - m.y);
                  if (d < 6 || d > 45) continue; // 与引擎同一可行域
                  if (engine._inOwnFoulBox(defendingTeam, m.x, m.y)) continue;
                  const f2 = baseFactors(engine, shell, m, m.x, m.y);
                  if (!best || f2.value > best.value) best = f2;
                }
                if (best) {
                  momentsWithExitOption++;
                  forgoneExit.n++;
                  forgoneExit.first.push(best.first);
                  forgoneExit.advance.push(best.advance);
                  forgoneExit.safety.push(best.safety);
                  forgoneExit.distPen.push(best.distPen);
                  forgoneExit.value.push(best.value);
                } else {
                  momentsWithoutExitOption++;
                }
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

const summarise = (bucket) => ({
  samples: bucket.n,
  medianValue: median(bucket.value),
  medianFirstFactor: median(bucket.first),
  medianAdvance: median(bucket.advance),
  medianSafety: median(bucket.safety),
  medianDistPen: median(bucket.distPen),
});

console.log(JSON.stringify({
  note:
    "只统计真实发生过的禁区内传球；因子按 _passCandidates 普通传球同式复算，不含直塞加成",
  seeds: { first: seeds[0], last: seeds[seeds.length - 1] },
  actualPassStaysInBox: summarise(actualStay),
  actualPassLeavesBox: summarise(actualExit),
  bestForgoneExitOption: summarise(forgoneExit),
  exitOptionAvailability: {
    momentsWithExitOption,
    momentsWithoutExitOption,
    exitAvailablePct: Number(
      (
        (momentsWithExitOption /
          Math.max(1, momentsWithExitOption + momentsWithoutExitOption)) *
        100
      ).toFixed(1)
    ),
  },
}, null, 2));
