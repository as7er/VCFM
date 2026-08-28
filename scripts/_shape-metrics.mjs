/**
 * 队形几何诊断（临时工具，不进 verify）。
 *
 * 从画面快照看到的疑点需要数字确认：球员是否被球磁吸、阵型带是否失效、
 * 跑位目标与实际位移是否脱节。这里跑整场统计，与真实足球的公开基准对比。
 *
 * 真实基准（广播追踪数据的常见区间）：
 * - 纵向紧凑度（最后卫→最前锋，不含门将）：30–40 m
 * - 横向宽度：进攻方 45–60 m，防守方 25–38 m
 * - 球周围 10 m 内人数：约 2–5
 * - 每秒位移中位数：阵地战约 1.5–3 m/s（球员几乎不会长时间静止）
 *
 * 用法：node scripts/_shape-metrics.mjs
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

const MX = SIM.PITCH_W_METRES / SIM.FIELD_W;
const MY = SIM.PITCH_H_METRES / SIM.FIELD_H;

const pct = (arr, p) => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * p))];
};
const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

const samples = {
  attackLength: [], defendLength: [],
  attackWidth: [], defendWidth: [],
  near10: [], near5: [],
  speedAll: [],        // 每名球员每 0.5s 的实际速度 (m/s)
  stalledShare: [],    // 每帧里"几乎静止"(<0.3 m/s) 的非门将球员比例
  targetGap: [],       // 目标点距离 (m)
  targetGapStalled: [],// 目标远(>5m)却几乎不动的次数
  emptyMidfield: [],
};

const seeds = [20260829, 20260830, 20260831, 20260832];
const original = Math.random;
try {
  for (const seed of seeds) {
    Math.random = seededRandom(seed);
    const engine = new SimEngine(makeClub("HOME", 14), makeClub("AWAY", 12), {
      simulationProfile: "standard", timeStep: SIM.DT, separationPasses: 8,
    });
    const steps = Math.round((90 * 60) / SIM.DT);
    let prev = null;
    for (let i = 0; i < steps; i++) {
      engine.step(SIM.DT);
      if (i % 5 !== 0) continue; // 每 0.5 秒采样
      const b = engine.ball;
      const live = engine.agents.filter((a) => !a.sentOff);
      const cur = new Map(live.map((a) => [a.id, { x: a.x, y: a.y }]));

      if (prev) {
        let stalled = 0, outfield = 0;
        for (const a of live) {
          if (a.role === "GK") continue;
          const p = prev.get(a.id);
          if (!p) continue;
          const moved = Math.hypot((a.x - p.x) * MX, (a.y - p.y) * MY) / 0.5;
          samples.speedAll.push(moved);
          outfield++;
          if (moved < 0.3) stalled++;
          const gap = Math.hypot((a.tx - a.x) * MX, (a.ty - a.y) * MY);
          samples.targetGap.push(gap);
          if (gap > 5 && moved < 0.3) samples.targetGapStalled.push(1);
        }
        if (outfield) samples.stalledShare.push(stalled / outfield);
      }
      prev = cur;

      // 球周围人数
      let n10 = 0, n5 = 0;
      for (const a of live) {
        if (a.role === "GK") continue;
        const d = Math.hypot((a.x - b.x) * MX, (a.y - b.y) * MY);
        if (d <= 10) n10++;
        if (d <= 5) n5++;
      }
      samples.near10.push(n10);
      samples.near5.push(n5);

      // 队形长宽（不含门将）
      const owner = b.owner ? engine.agents.find((a) => a.id === b.owner) : null;
      for (const team of ["home", "away"]) {
        const squad = live.filter((a) => a.team === team && a.role !== "GK");
        if (squad.length < 8) continue;
        const ys = squad.map((a) => a.y * MY);
        const xs = squad.map((a) => a.x * MX);
        const length = Math.max(...ys) - Math.min(...ys);
        const width = Math.max(...xs) - Math.min(...xs);
        const attacking = owner ? owner.team === team : false;
        if (attacking) { samples.attackLength.push(length); samples.attackWidth.push(width); }
        else { samples.defendLength.push(length); samples.defendWidth.push(width); }
      }

      // 中场真空：y 在 35..65 区间（中路 30% 场地）的球员数
      samples.emptyMidfield.push(live.filter((a) => a.role !== "GK" && a.y > 35 && a.y < 65).length);
    }
  }
} finally {
  Math.random = original;
}

const row = (label, value, real, ok) =>
  `${label.padEnd(30)} ${String(value).padStart(8)}   ${real.padEnd(16)} ${ok ? "OK" : "<-- 偏离"}`;

console.log("指标".padEnd(30) + "     实测   " + "真实基准".padEnd(16) + " 判定");
console.log("-".repeat(72));
const aL = mean(samples.attackLength).toFixed(1);
const dL = mean(samples.defendLength).toFixed(1);
const aW = mean(samples.attackWidth).toFixed(1);
const dW = mean(samples.defendWidth).toFixed(1);
const n10 = mean(samples.near10).toFixed(2);
const n5 = mean(samples.near5).toFixed(2);
const spdMed = pct(samples.speedAll, 0.5).toFixed(2);
const stall = (mean(samples.stalledShare) * 100).toFixed(1);
const gapMed = pct(samples.targetGap, 0.5).toFixed(2);
const gapStalled = samples.targetGapStalled.length;
const midOcc = mean(samples.emptyMidfield).toFixed(2);

console.log(row("进攻方纵向长度 (m)", aL, "30-40", aL >= 30 && aL <= 42));
console.log(row("防守方纵向长度 (m)", dL, "28-38", dL >= 28 && dL <= 40));
console.log(row("进攻方横向宽度 (m)", aW, "45-60", aW >= 45 && aW <= 62));
console.log(row("防守方横向宽度 (m)", dW, "25-38", dW >= 25 && dW <= 40));
console.log(row("球 10m 内人数", n10, "2-5", n10 >= 2 && n10 <= 5.5));
console.log(row("球 5m 内人数", n5, "1-2.5", n5 >= 1 && n5 <= 2.5));
console.log(row("位移速度中位数 (m/s)", spdMed, "1.5-3.0", spdMed >= 1.2));
console.log(row("几乎静止球员占比 (%)", stall, "<15", stall < 15));
console.log(row("跑位目标距离中位数 (m)", gapMed, "1-6", gapMed >= 1 && gapMed <= 8));
console.log(row("中场带 (35-65%) 人数", midOcc, "6-11", midOcc >= 6));
console.log("");
console.log(`目标 >5m 却几乎不动的采样点：${gapStalled}（占全部球员采样 ${(gapStalled / Math.max(1, samples.speedAll.length) * 100).toFixed(1)}%）`);
console.log(`速度分位：p10=${pct(samples.speedAll,0.1).toFixed(2)} p50=${spdMed} p90=${pct(samples.speedAll,0.9).toFixed(2)} m/s`);
console.log(`目标距离分位：p50=${gapMed} p90=${pct(samples.targetGap,0.9).toFixed(2)} m`);
