/**
 * 探针：门框命中频率与它对护栏的连带影响。
 *
 * 背景：`_resolveBounds` 过去只有 `underBar = crossZ < 2.44` 的二元判断——柱内且低于横梁
 * 就是进球，否则出底线。**立柱与横梁不是可碰撞几何**，所以画面上永远看不到打门框，
 * `woodwork` 事件类型虽然存在（matchview 也有画法）却从没被空间引擎发出过。
 *
 * 新增的判定容差是唯一可调量，直接决定命中频率：
 *   立柱 `|crossX − GOAL_X0/X1| < POST_TOL_X`（格），横梁 `|crossZ − 2.44| < BAR_TOL_Z`（米）
 * 柱子实际 12cm + 球半径约 11cm ≈ 0.34m，x 一格 0.68m 故 0.5 格。
 *
 * 真实参照：英超门框命中约 **0.4 次/场**（每 2~3 场一次）。
 *
 * ⚠ 这批会把一部分「擦柱进球」变成反弹、一部分「出底线」变成场内二次进攻，
 *   所以进球数与角球数**都会动**。本探针同表量出来，别只看门框频率。
 *
 * 口径：种子 372000..、能力 15、标准档、0.1s 步长，与其他探针一致。
 * 用法：node scripts/_woodwork-probe.mjs [场数=12]
 */
import { SimEngine, SIM } from "../js/sim/engine.js";

const matches = Math.max(4, Number(process.argv[2]) || 12);
const seeds = Array.from({ length: matches }, (_, i) => 372000 + i);
const DT = SIM.DT;

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

const agg = { woodwork: 0, post: 0, bar: 0, goals: 0, shots: 0, corners: 0, saves: 0 };
const scores = [];
/** 击中门框之后那 6 秒里有没有变成进球（二次进攻） */
let reboundGoals = 0;

for (const seed of seeds) {
  const restore = Math.random;
  Math.random = seededRandom(seed);
  try {
    const engine = new SimEngine(makeClub(`h${seed}`, 15), makeClub(`a${seed}`, 15), {
      simulationProfile: "standard", timeStep: DT, separationPasses: 8,
    });
    const steps = Math.round((90 * 60) / DT);
    for (let s = 0; s < steps; s++) engine.step(DT);
    scores.push(`${engine.score.home}-${engine.score.away}`);
    const evs = engine.events;
    const wood = evs.filter((e) => e.type === "woodwork");
    agg.woodwork += wood.length;
    agg.post += wood.filter((e) => e.part === "post").length;
    agg.bar += wood.filter((e) => e.part === "bar").length;
    agg.goals += evs.filter((e) => e.type === "goal").length;
    agg.shots += evs.filter((e) => e.type === "shot").length;
    agg.corners += evs.filter((e) => e.type === "corner").length;
    agg.saves += evs.filter((e) => e.type === "save").length;
    for (const w of wood) {
      if (evs.some((e) => e.type === "goal" && e.t > w.t && e.t <= w.t + 6)) reboundGoals++;
    }
  } finally {
    Math.random = restore;
  }
}

const per = (n) => Number((n / matches).toFixed(2));
console.log(JSON.stringify({
  matches,
  seeds: { first: seeds[0], last: seeds.at(-1) },
  门框每场: per(agg.woodwork),
  其中立柱: per(agg.post),
  其中横梁: per(agg.bar),
  门框后6秒内进球: agg.woodwork ? Number(((reboundGoals / agg.woodwork) * 100).toFixed(1)) : 0,
  进球每场: per(agg.goals),
  射门每队场: Number((agg.shots / matches / 2).toFixed(2)),
  角球每场: per(agg.corners),
  扑救每场: per(agg.saves),
  比分: scores.join(" "),
}, null, 2));
console.log(`
真实参照：门框命中约 0.4 次/场（每 2~3 场一次）。
护栏：进球 2.5~3.3、角球 2.75~10、射门 11.9~13.8（每队场）。
留档基线（12 场，同种子，加门框之前）：进球 2.92、射门 13.75、角球 4.67。
读法：门框频率若远高于 0.4，说明容差取大了；同时看进球有没有被顶出护栏。`);
