/**
 * 诊断（改动前的波及面预测）：把「持球人已在对方禁区内时、生成在更深禁区里的 support 目标」
 * 推回禁区边缘，会波及多少目标点、消掉多少次留区传球，以及**会不会连正常的禁区抢点一起铲掉**。
 *
 * 背景（AGENTS.md v239 遗留 #1，已验证段）：855 次留区传球的接球人是静态占位——
 * offBallTarget 97.5% 也在禁区内、禁区内连续停留中位 6.7s、出脚瞬间速度中位 0.82 m/s。
 * 机制是 `_attackPlan` 各 support 分支以「相对持球人再往前推一段」生成目标点、
 * clamp 只到场地边界，没有「对方禁区」概念。
 *
 * —— 为什么不能简单地「禁止 support 目标进禁区」——
 * 真实足球里进攻方**必须**有人进禁区抢点（传中、二次球、补射），一刀切会直接铲掉进球来源，
 * 而进球区间只有 2.5~3.3、当前 2.88，下方余量不多。所以必须先把两类分开：
 *
 *   A 类「病灶」：持球人**已在**对方禁区内，接应目标点又生成在禁区里（且更深）。
 *                 → 真实足球此时的正确动作是在禁区边缘做倒三角接应，不是站到他旁边。
 *   B 类「正常」：持球人**在禁区外**（传中/直塞位置），接应目标点在禁区内 = 抢点跑动。
 *                 → 必须保留。
 *
 * 本脚本只测量、不改引擎，回答四个问题：
 *   1. A/B 两类各占多少 support 目标时长——决定候选规则的作用面有多窄。
 *   2. A 类目标点若推回边缘，位移多大（引擎单位与米）。
 *   3. 855 次留区传球里有多少的接球人属于 A 类——即预期能消掉多少留区传球。
 *   4. 禁区内进攻方存在时长里 A/B 各占多少——B 占多数才说明抢点能力不受伤。
 *
 * 口径与 `_box-receiver-occupancy-probe.mjs` 一致（同种子 372000..372005、能力 15、标准档）。
 * 全程只读引擎公开状态，不消费随机数，同种子下开关本脚本不改变比分。
 * `_` 前缀按仓库惯例表示诊断脚本，不进 `verify.mjs`。
 *
 * 禁区判定沿用引擎 `_inOwnFoulBox`：x ∈ (22,78)，home 守 y>=84、away 守 y<=16。
 * 边缘线因此是 home 的 84 / away 的 16（引擎单位，**不是米**；y 一格 1.05m）。
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
const METRES_Y = SIM.PITCH_H_METRES / SIM.FIELD_H;

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

/** 对方禁区的边缘 y（引擎单位）：进攻 home→守 away 的 16 线；进攻 away→守 home 的 84 线。 */
const boxEdgeY = (defendingTeam) => (defendingTeam === "home" ? 84 : 16);

/** 把禁区内的目标点沿 y 推回边缘（只动 y，保留横向接应位置）。 */
const relocatedY = (defendingTeam) => boxEdgeY(defendingTeam);

const seeds = [372000, 372001, 372002, 372003, 372004, 372005];
const timeStep = SIM.DT;

// 1&4. support 目标时长分类
let supportSeconds = 0;
let targetInBoxSeconds = 0;
let classASeconds = 0; // 持球人已在禁区内 + 目标也在禁区内（病灶）
let classBSeconds = 0; // 持球人在禁区外 + 目标在禁区内（抢点，须保留）
let classUnknownSeconds = 0; // 无明确持球人（球在空中/争顶）
// 禁区内进攻方球员存在时长，按其目标类别归因
let presenceSeconds = 0;
let presenceFromASeconds = 0;
let presenceFromBSeconds = 0;
// 2. A 类目标点推回边缘的位移
const shiftUnits = [];
// 3. 留区传球接球人是否属于 A 类
let stayPasses = 0;
let stayPassReceiverClassA = 0;
let stayPassReceiverClassB = 0;
let stayPassReceiverOther = 0;
// 对照：出区传球数（本次规则不应影响它，用于确认口径）
let exitPasses = 0;

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
    // 每名球员最近一次被判定的目标类别，供传球瞬间归因（目标已随 fsm 切到 receive 而失效）
    const lastClass = new Map();

    for (let step = 0; step < steps; step++) {
      engine.step(timeStep);
      const b = engine.ball;
      const owner = b.owner ? engine.agentById(b.owner) : null;

      for (const p of engine.agents) {
        if (p.sentOff || p.role === "GK") continue;
        const defending = p.team === "home" ? "away" : "home";

        // 禁区内存在时长（不限 fsm），按该球员最近的目标类别归因
        if (engine._inOwnFoulBox(defending, p.x, p.y)) {
          presenceSeconds += timeStep;
          const cls = lastClass.get(p.id);
          if (cls === "A") presenceFromASeconds += timeStep;
          else if (cls === "B") presenceFromBSeconds += timeStep;
        }

        if (p.fsm !== "support" || !p.offBallTarget) continue;
        supportSeconds += timeStep;
        const tx = p.offBallTarget.x;
        const ty = p.offBallTarget.y;
        if (!Number.isFinite(tx) || !Number.isFinite(ty)) continue;
        if (!engine._inOwnFoulBox(defending, tx, ty)) {
          lastClass.set(p.id, "outside");
          continue;
        }
        targetInBoxSeconds += timeStep;

        // 分类依据持球人当时在不在同一禁区内
        const carrier = owner && owner.team === p.team ? owner : null;
        if (!carrier) {
          classUnknownSeconds += timeStep;
          lastClass.set(p.id, "unknown");
          continue;
        }
        if (engine._inOwnFoulBox(defending, carrier.x, carrier.y)) {
          classASeconds += timeStep;
          lastClass.set(p.id, "A");
          shiftUnits.push(Math.abs(ty - relocatedY(defending)));
        } else {
          classBSeconds += timeStep;
          lastClass.set(p.id, "B");
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
            if (stays && receiver) {
              stayPasses++;
              const cls = lastClass.get(receiver.id);
              if (cls === "A") stayPassReceiverClassA++;
              else if (cls === "B") stayPassReceiverClassB++;
              else stayPassReceiverOther++;
            } else if (!stays && receiver) {
              exitPasses++;
            }
          }
        }
      }

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
console.log(`\n=== 6 场（种子 372000..372005），support 目标总时长 ${supportSeconds.toFixed(0)}s ===`);

console.log("\n[1] 目标点落在对方禁区内的时长如何分类：");
console.log({
  "目标在对方禁区内(秒)": Number(targetInBoxSeconds.toFixed(0)),
  "占 support 总时长%": pct(targetInBoxSeconds, supportSeconds),
  "A类·持球人也在禁区内（病灶）": `${classASeconds.toFixed(0)}s (${pct(classASeconds, targetInBoxSeconds)}%)`,
  "B类·持球人在禁区外（抢点，须保留）": `${classBSeconds.toFixed(0)}s (${pct(classBSeconds, targetInBoxSeconds)}%)`,
  "无明确持球人": `${classUnknownSeconds.toFixed(0)}s (${pct(classUnknownSeconds, targetInBoxSeconds)}%)`,
  "A类占 support 总时长%": pct(classASeconds, supportSeconds),
});

console.log("\n[2] A 类目标点推回禁区边缘的 y 位移：");
console.log({
  "中位(引擎单位)": median(shiftUnits),
  "中位(米)": Number((median(shiftUnits) * METRES_Y).toFixed(2)),
  "p75(米)": Number((quantile(shiftUnits, 0.75) * METRES_Y).toFixed(2)),
  "p90(米)": Number((quantile(shiftUnits, 0.9) * METRES_Y).toFixed(2)),
  样本: shiftUnits.length,
});

console.log("\n[3] 855 量级的留区传球，接球人属于哪一类：");
console.log({
  留区传球总数: stayPasses,
  "接球人A类（预期被消掉）": `${stayPassReceiverClassA} (${pct(stayPassReceiverClassA, stayPasses)}%)`,
  "接球人B类（抢点，保留）": `${stayPassReceiverClassB} (${pct(stayPassReceiverClassB, stayPasses)}%)`,
  "其他/无记录": `${stayPassReceiverOther} (${pct(stayPassReceiverOther, stayPasses)}%)`,
  "对照·出区传球数（本规则不应影响）": exitPasses,
});

console.log("\n[4] 禁区内进攻方球员存在时长的来源归因（抢点能力会不会受伤）：");
console.log({
  "禁区内存在总时长(秒)": Number(presenceSeconds.toFixed(0)),
  "来自A类目标": `${presenceFromASeconds.toFixed(0)}s (${pct(presenceFromASeconds, presenceSeconds)}%)`,
  "来自B类目标": `${presenceFromBSeconds.toFixed(0)}s (${pct(presenceFromBSeconds, presenceSeconds)}%)`,
  "其他来源（持球人本人/跑动中/无目标）": `${(presenceSeconds - presenceFromASeconds - presenceFromBSeconds).toFixed(0)}s (${pct(presenceSeconds - presenceFromASeconds - presenceFromBSeconds, presenceSeconds)}%)`,
});

console.log(
  [
    "",
    "判据：",
    "  · [1] A 类占 support 总时长越小，候选规则的作用面越窄、越不容易冲击全局标定。",
    "  · [3] 接球人 A 类占比 = 预期能消掉的留区传球比例，直接对应 boxSpells 的下降空间。",
    "  · [4] 若禁区内存在时长主要来自 B 类与「其他」，说明推回 A 类不会铲掉抢点能力；",
    "    若大头来自 A 类，则该规则会同时压掉进球来源，必须改为限时插入而非直接推回。",
    "  · 口径限制：类别按「最近一帧的目标判定」缓存，传球瞬间接球人 fsm 已切 receive，",
    "    故用缓存归因；无明确持球人（球在空中）单列。可靠的是比例与量级，不是绝对秒数。",
    "  · 位移只算 y 方向（保留横向接应位置），是候选规则的最小改法，不代表最终实现。",
  ].join("\n")
);

