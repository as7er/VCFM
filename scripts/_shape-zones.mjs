/**
 * 队形纵向长度的分区分解（临时工具，不进 verify）。
 *
 * `_shape-metrics.mjs` 测出进攻方平均纵向长度 51.5 m（真实 30–40）。但
 * `_defLineY` 的基础层次是合理的：DEF 层距己方球门 20 单位、ATT 层 55 单位，
 * 相差 35 单位 ≈ 36.8 m（engine.js:4186）。所以拉长发生在执行阶段，而不是设计。
 *
 * 这里按「球在场上什么位置」分桶，定位长度是在哪个阶段被拉开的，并分别报告
 * 后卫线、中场线、前锋线各自距己方球门的距离——这样能区分两种病因：
 *   A) 进攻时后卫线不跟着压上（后卫距门不变，前锋走远）
 *   B) 前锋压得过前（后卫正常）
 *
 * 用法：node scripts/_shape-zones.mjs
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
    ]) attrs[key] = rating;
    return { id, name: id, pos, number: index + 1, fitness: 100, attrs };
  });
  return {
    id: name, name, players,
    tactics: {
      formation: "4-3-3", lineup: players.map((p) => p.id),
      pressing: 3, tempo: 3, defensiveLine: 3, style: "balanced",
    },
  };
}

const MY = SIM.PITCH_H_METRES / SIM.FIELD_H;
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

// 球相对于「该队进攻方向」的推进度：0 = 在自家门前，100 = 在对方门前
function advance(team, ballY) {
  return team === "home" ? 100 - ballY : ballY;
}

const buckets = [
  { key: "own-third", label: "球在本方三区 (0-33)", lo: 0, hi: 33 },
  { key: "middle", label: "球在中场 (33-66)", lo: 33, hi: 66 },
  { key: "final-third", label: "球在进攻三区 (66-100)", lo: 66, hi: 100 },
];

const stats = {};
for (const b of buckets) {
  for (const side of ["attack", "defend"]) {
    stats[`${b.key}|${side}`] = { length: [], defLine: [], midLine: [], attLine: [] };
  }
}

const seeds = [20260829, 20260830, 20260831, 20260832];
const original = Math.random;
try {
  for (const seed of seeds) {
    Math.random = seededRandom(seed);
    const engine = new SimEngine(makeClub("HOME", 14), makeClub("AWAY", 12), {
      simulationProfile: "standard", timeStep: SIM.DT, separationPasses: 8,
    });
    const steps = Math.round((90 * 60) / SIM.DT);
    for (let i = 0; i < steps; i++) {
      engine.step(SIM.DT);
      if (i % 5 !== 0) continue;
      const ball = engine.ball;
      if (ball.restartType) continue;
      const owner = ball.owner ? engine.agents.find((a) => a.id === ball.owner) : null;
      if (!owner) continue;

      for (const team of ["home", "away"]) {
        const squad = engine.agents.filter((a) => a.team === team && !a.sentOff && a.role !== "GK");
        if (squad.length < 8) continue;
        const adv = advance(team, ball.y);
        const bucket = buckets.find((b) => adv >= b.lo && adv < b.hi);
        if (!bucket) continue;
        const side = owner.team === team ? "attack" : "defend";
        const bin = stats[`${bucket.key}|${side}`];

        // 距己方球门的距离（米），越大越靠前
        const ownGoalY = team === "home" ? SIM.HOME_GOAL_Y : SIM.AWAY_GOAL_Y;
        const fromGoal = (a) => Math.abs(a.y - ownGoalY) * MY;
        const ds = squad.map(fromGoal);
        bin.length.push(Math.max(...ds) - Math.min(...ds));

        const byRole = (role) => {
          const xs = squad.filter((a) => a.role === role).map(fromGoal);
          return xs.length ? mean(xs) : null;
        };
        const d = byRole("DEF"), m = byRole("MID"), t = byRole("ATT");
        if (d != null) bin.defLine.push(d);
        if (m != null) bin.midLine.push(m);
        if (t != null) bin.attLine.push(t);
      }
    }
  }
} finally {
  Math.random = original;
}

console.log("阶段".padEnd(26) + "  长度   后卫线  中场线  前锋线   (距己方球门, 米)");
console.log("-".repeat(74));
for (const b of buckets) {
  for (const side of ["attack", "defend"]) {
    const bin = stats[`${b.key}|${side}`];
    if (!bin.length.length) continue;
    const tag = `${b.label} ${side === "attack" ? "[持球]" : "[无球]"}`;
    console.log(
      tag.padEnd(30) +
      mean(bin.length).toFixed(1).padStart(6) +
      mean(bin.defLine).toFixed(1).padStart(8) +
      mean(bin.midLine).toFixed(1).padStart(8) +
      mean(bin.attLine).toFixed(1).padStart(8) +
      `   n=${bin.length.length}`
    );
  }
}
console.log("");
console.log("参考：真实球队纵向长度 30-40 m。进攻三区持球时后卫线应压到距己方球门 40-55 m");
console.log("（即中线附近或过中线），若后卫线仍在 20-30 m 则是「防线不跟进」。");
