/**
 * 探针：禁区里到底有几个人没人管，以及门将站在哪。
 *
 * 为什么必须新写：`box-defending-audit.mjs:130` 有 `if (!ball.owner) continue;`——
 * **把每一个球在飞行中的 tick 全丢掉了，也就是传中那一整段**。而且它只量
 * 「防守者到球」的距离（:145），**从来不量「进攻者到最近防守者」**，所以远端柱子
 * 边站一个没人管的人它完全看不见。加上盯人断言只是 3% 的地板
 * （`markSharePct >= 3`），97% 的禁区防守 tick 不盯人也能过。
 *
 * 本探针就补这两件事，并且**按「球在飞行中」和「有人持球」分开报** ——
 * 前者正是审计的盲区，也正是用户看到漏人的时刻。
 *
 * 顺带量门将：离门线深度、横向偏离、以及**有多少采样他站到了自家门柱之外**
 * （`GOAL_X0 44`~`GOAL_X1 56`）。
 *
 * 口径：种子 372000..、能力 15、标准档、0.1s 步长，与其他探针一致。
 * 禁区按**画面画的那个**：x∈[22,78]，主队 y>=84 / 客队 y<=16
 * （⚠ 引擎里 `_inOwnPenaltyArea` 用的是 x∈(18,82)、y>80，比画面深 4.2m 宽 2.7m）。
 *
 * 用法：node scripts/_box-marking-probe.mjs [场数=6]
 */
import { SimEngine, SIM } from "../js/sim/engine.js";

const matches = Math.max(2, Number(process.argv[2]) || 6);
const seeds = Array.from({ length: matches }, (_, i) => 372000 + i);
const DT = SIM.DT;
const MX = SIM.PITCH_W_METRES / SIM.FIELD_W;
const MY = SIM.PITCH_H_METRES / SIM.FIELD_H;
const metres = (dx, dy) => Math.hypot(dx * MX, dy * MY);
const LOOSE_M = 3; // 超过这个距离算「没人贴」
const FREE_M = 5; // 超过这个距离算「完全没人管」

const q = (v, p) => {
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b);
  return Number(s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(2));
};
const mean = (v) => (v.length ? Number((v.reduce((a, b) => a + b, 0) / v.length).toFixed(2)) : 0);
const pct = (n, d) => Number(((n / Math.max(1, d)) * 100).toFixed(1));

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

const bucket = () => ({ ticks: 0, atts: 0, nearest: [], loose: 0, free: 0 });
const flight = bucket();
const owned = bucket();
const gk = { depth: [], lateral: [], outsidePosts: 0, samples: 0 };

for (const seed of seeds) {
  const restore = Math.random;
  Math.random = seededRandom(seed);
  try {
    const engine = new SimEngine(makeClub(`h${seed}`, 15), makeClub(`a${seed}`, 15), {
      simulationProfile: "standard", timeStep: DT, separationPasses: 8,
    });
    const steps = Math.round((90 * 60) / DT);
    for (let s = 0; s < steps; s++) {
      engine.step(DT);
      const b = engine.ball;
      const inFlight = !b.owner && (b.state === "pass" || b.state === "shot");
      const bag = inFlight ? flight : b.owner ? owned : null;
      if (!bag) continue;

      // 只在球已经进入某一侧的进攻三区时采样（否则禁区里本来就没人）
      for (const defTeam of ["home", "away"]) {
        const goalY = defTeam === "home" ? 100 : 0;
        const inBox = (p) =>
          p.x >= 22 && p.x <= 78 && (defTeam === "home" ? p.y >= 84 : p.y <= 16);
        if (!inBox({ x: b.x, y: b.y })) continue;
        const attTeam = defTeam === "home" ? "away" : "home";
        const outfield = (team) =>
          engine.agents.filter((a) => a.team === team && a.role !== "GK" && !a.sentOff);
        const atts = outfield(attTeam).filter(inBox);
        if (!atts.length) continue;
        const defs = outfield(defTeam);
        bag.ticks++;
        bag.atts += atts.length;
        for (const a of atts) {
          let nd = Infinity;
          for (const d of defs) nd = Math.min(nd, metres(a.x - d.x, a.y - d.y));
          if (Number.isFinite(nd)) {
            bag.nearest.push(nd);
            if (nd > LOOSE_M) bag.loose++;
            if (nd > FREE_M) bag.free++;
          }
        }
        const keeper = engine.agents.find(
          (a) => a.team === defTeam && a.role === "GK" && !a.sentOff
        );
        if (keeper) {
          gk.samples++;
          gk.depth.push(Math.abs(keeper.y - goalY) * MY);
          gk.lateral.push(Math.abs(keeper.x - 50) * MX);
          if (keeper.x < SIM.GOAL_X0 || keeper.x > SIM.GOAL_X1) gk.outsidePosts++;
        }
      }
    }
  } finally {
    Math.random = restore;
  }
}

const report = (b, label) => ({
  档: label,
  采样tick: b.ticks,
  禁区内进攻者均值: b.ticks ? Number((b.atts / b.ticks).toFixed(2)) : 0,
  最近防守者距离中位m: q(b.nearest, 0.5),
  最近防守者p90m: q(b.nearest, 0.9),
  [`>${LOOSE_M}m无人贴_每tick`]: b.ticks ? Number((b.loose / b.ticks).toFixed(2)) : 0,
  [`>${FREE_M}m完全无人_每tick`]: b.ticks ? Number((b.free / b.ticks).toFixed(2)) : 0,
  [`>${FREE_M}m占进攻者比`]: pct(b.free, b.nearest.length),
});

console.log(JSON.stringify({
  matches,
  seeds: { first: seeds[0], last: seeds.at(-1) },
  球在飞行中: report(flight, "flight ← box-defending-audit 完全丢掉的那一段"),
  有人持球: report(owned, "owned ← 审计只看这一段"),
  门将: {
    采样: gk.samples,
    离门线中位m: q(gk.depth, 0.5),
    离门线p90m: q(gk.depth, 0.9),
    横向偏离中位m: q(gk.lateral, 0.5),
    横向偏离p90m: q(gk.lateral, 0.9),
    站到自家门柱之外的占比: pct(gk.outsidePosts, gk.samples),
  },
}, null, 2));
console.log(`
真实参照：禁区内传中来球时，防守方基本人盯人，>5m 完全无人的进攻者应接近 0。
门将：角球外的运动战里应贴近门线（1~3m），横向不应超出门柱（±4.08m = 6 格）。
「站到自家门柱之外的占比」若明显 > 0，说明通用兜底分支把他推到了柱外——
_thinkGK 的兜底是 clamp(50 + (b.x-50)*0.72, 40, 60)，40 已经在 GOAL_X0=44 之外。`);
