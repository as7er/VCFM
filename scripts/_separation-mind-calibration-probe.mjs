/**
 * 标定曲线：非穿透求解器的最小间距该是多少米。
 *
 * 背景（AGENTS.md「🔜 下一个瓶颈已定位」）：`_separateAgents` 的 `minD = 2.85` 是
 * **格数**，而距离用 `Math.hypot(dx, dy)` 直接对格数取模——x 一格 0.68m、y 一格 1.05m，
 * 所以这条几何下限在真实空间里是个**椭圆**：横向 2.85×0.68 = **1.94m**，
 * 沿球门方向 2.85×1.05 = **2.99m**。
 *
 * 为什么这正好卡住贴身防守：防守者站在被盯者与球门之间，两人连线基本沿 y，
 * 也就是撞在 2.99m 那一侧。实测（`_box-marking-probe`，12 场）最近防守者距离中位
 * **2.76~2.84m**，**正好压在这个下限上**——贴身防守是被求解器物理挡住的，
 * 而战术目标在危险区只要求 1.1m（`markWeight` 那段）。
 * 同一处的禁区内 3.35 膨胀早就因为同样理由被移除过（留档 v239），
 * **但格/米的混用留下来了**。这是本项目第五次撞见混单位。
 *
 * 本探针把 `_separateAgents` 换成**各向同性的米制**下限（`separationMinDistanceMetres`
 * 引擎选项，与既有的 `separationPasses` 并列），逐档量它对整套连带指标的影响。
 * 四个档位都不是随手取的数，各自对着一个真实存在的锚：
 *   1.94  **纯单位修正**：2.85 格 × 0.68 = 横向的旧值。横向行为逐位不变，
 *         只把沿球门方向那一侧从 2.99m 放到 1.94m。风险最低的一档。
 *   1.60  **画面圆点直径**，也是本仓库统一的重叠判定阈值
 *         （`set-piece-presentation-audit.mjs:106`、点球段、support-target-crowding 都用它）。
 *         这一档等于「保证两个圆点不重叠」。
 *   1.10  **危险区盯人的战术目标**（`markWeight` 那段）。取这一档意味着几何下限
 *         刚好不再挡住战术意图。
 *   0.90  **真实身体半径量级**（两名球员肩宽各约 0.45m）。真实足球里禁区争抢时
 *         球员确实贴到 0.5~1m，2D 俯视图上圆点几乎相接。仓库既有注释已经定过调子：
 *         「身体半径不会因为球进了禁区就变大……圆点是否重叠是渲染层的事」。
 *
 * ⚠ 按 `vcfm-calibration-compensation` 那条教训，**同表量连带指标**。
 *   第一版这张表只有进球/射门/角球，看起来 1.10 与 1.60 都无害——**是漏了两列**：
 *   `strongVsWeak`（强弱分离）与 `throughPasses`（直塞量）。24 场标定一跑就现形：
 *   1.10 档直塞 0.67 → 0.21（护栏下限 0.5）、强队 1.79 → 1.29 分/场、净胜球 +12 → −4。
 *   身体能贴到 1.1m 时弱队光靠贴身就能捂住强队，能力差异不再体现，传球线也一起没了。
 *   两列现已进表。**放松几何下限会同时压掉「技术优势」和「传球线」，不只压进球。**
 *
 * 口径：种子 372000..、能力 15、标准档、0.1s 步长、separationPasses 8，
 * 与 `_box-marking-probe` 一致，因此禁区那几列可以直接对比它记录的基线：
 *   各向异性基线（当前树，含盯人地板）  中位 2.76m、p90 5.81m、>5m 完全无人 14.8%
 *
 * 用法：node scripts/_separation-mind-calibration-probe.mjs [场数=12]
 */
import { SimEngine, SIM } from "../js/sim/engine.js";

const matches = Math.max(2, Number(process.argv[2]) || 12);
const seeds = Array.from({ length: matches }, (_, i) => 372000 + i);
const ARMS = [1.94, 1.6, 1.1, 0.9];
const DT = SIM.DT;
const MX = SIM.PITCH_W_METRES / SIM.FIELD_W;
const MY = SIM.PITCH_H_METRES / SIM.FIELD_H;
const metres = (dx, dy) => Math.hypot(dx * MX, dy * MY);
const FREE_M = 5; // 超过这个距离算「完全没人管」，与 _box-marking-probe 同值

const q = (v, p) => {
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b);
  return Number(s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(2));
};
const per = (n) => Number((n / matches).toFixed(2));
const pct = (n, d) => Number(((n / Math.max(1, d)) * 100).toFixed(1));

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

/** 一档 = 一个 separationMinDistanceMetres 取值，跑完整批种子 */
function runArm(minDistanceMetres) {
  const box = { ticks: 0, atts: 0, nearest: [], free: 0 };
  const totals = { goals: 0, shots: 0, corners: 0, through: 0 };
  // 强弱分离：能力 18 打能力 6，另一批种子。这一列**必须在表里**——
  // 只看进球/射门会漏掉「弱队光靠贴身就能捂住强队」这种失真。
  const strong = { points: 0, matches: 0, goalsFor: 0, goalsAgainst: 0 };
  let separationSamples = 0;
  let separationBelowLegacy = 0;
  for (const seed of seeds) {
    const restore = Math.random;
    Math.random = seededRandom(seed);
    try {
      const engine = new SimEngine(makeClub(`h${seed}`, 15), makeClub(`a${seed}`, 15), {
        simulationProfile: "standard",
        timeStep: DT,
        separationPasses: 8,
        separationMinDistanceMetres: minDistanceMetres,
      });
      const steps = Math.round((90 * 60) / DT);
      for (let s = 0; s < steps; s++) {
        engine.step(DT);
        const b = engine.ball;
        // 禁区盯人：口径与 `_box-marking-probe` 逐字一致（画面画的那个框），
        // 但这里把 flight 与 owned 合并——档位之间的差异在两档里同向，分开报只是噪声更大。
        const live = b.owner || b.state === "pass" || b.state === "shot";
        if (!live) continue;
        for (const defTeam of ["home", "away"]) {
          const inBox = (p) =>
            p.x >= 22 && p.x <= 78 && (defTeam === "home" ? p.y >= 84 : p.y <= 16);
          if (!inBox({ x: b.x, y: b.y })) continue;
          const attTeam = defTeam === "home" ? "away" : "home";
          const outfield = (team) =>
            engine.agents.filter((a) => a.team === team && a.role !== "GK" && !a.sentOff);
          const atts = outfield(attTeam).filter(inBox);
          if (!atts.length) continue;
          const defs = outfield(defTeam);
          box.ticks++;
          box.atts += atts.length;
          for (const a of atts) {
            let nd = Infinity;
            for (const d of defs) nd = Math.min(nd, metres(a.x - d.x, a.y - d.y));
            if (!Number.isFinite(nd)) continue;
            box.nearest.push(nd);
            if (nd > FREE_M) box.free++;
            separationSamples++;
            // 旧几何在沿球门方向的下限是 2.99m。落到它以下的采样比例，直接量出
            // 「贴身防守此前被求解器挡住」这件事被松开了多少——不是推导，是计数。
            if (nd < 2.99) separationBelowLegacy++;
          }
        }
      }
      for (const ev of engine.events) {
        if (ev.type === "goal") totals.goals++;
        else if (ev.type === "shot") totals.shots++;
        else if (ev.type === "corner") totals.corners++;
        else if (ev.type === "pass" && ev.through && !ev.cross) totals.through++;
      }
    } finally {
      Math.random = restore;
    }
  }

  // 强弱分离档：能力 18 打能力 6，种子另起一段避免与上面同流。
  for (const seed of seeds) {
    const restore = Math.random;
    Math.random = seededRandom(seed + 100000);
    try {
      const engine = new SimEngine(makeClub(`s${seed}`, 18), makeClub(`w${seed}`, 6), {
        simulationProfile: "standard",
        timeStep: DT,
        separationPasses: 8,
        separationMinDistanceMetres: minDistanceMetres,
      });
      const steps = Math.round((90 * 60) / DT);
      for (let s = 0; s < steps; s++) engine.step(DT);
      strong.matches++;
      strong.goalsFor += engine.score.home;
      strong.goalsAgainst += engine.score.away;
      strong.points +=
        engine.score.home > engine.score.away ? 3 : engine.score.home === engine.score.away ? 1 : 0;
    } finally {
      Math.random = restore;
    }
  }

  return {
    档_最小间距m: minDistanceMetres,
    采样tick: box.ticks,
    禁区内进攻者均值: box.ticks ? Number((box.atts / box.ticks).toFixed(2)) : 0,
    最近防守者中位m: q(box.nearest, 0.5),
    最近防守者p90m: q(box.nearest, 0.9),
    ">5m完全无人占比": pct(box.free, box.nearest.length),
    "贴到旧下限2.99m以内的占比": pct(separationBelowLegacy, separationSamples),
    进球每场: per(totals.goals),
    射门每队场: Number((totals.shots / matches / 2).toFixed(2)),
    角球每场: per(totals.corners),
    直塞每场: per(totals.through),
    强队分每场: Number((strong.points / Math.max(1, strong.matches)).toFixed(2)),
    强队净胜球: strong.goalsFor - strong.goalsAgainst,
  };
}

const rows = [];
for (const arm of ARMS) {
  const row = runArm(arm);
  rows.push(row);
  console.log(JSON.stringify(row));
}

console.log(`\n${JSON.stringify({ 场数: matches, 种子: `${seeds[0]}..${seeds.at(-1)}`, rows }, null, 2)}`);
console.log(`
各向异性基线（当前树、含盯人地板、同种子，来自 _box-marking-probe 12 场）：
  最近防守者中位 2.76m、p90 5.81m、>5m 完全无人 14.8%
  旧几何沿球门方向的下限 = 2.85 格 × 1.05 = 2.99m，横向 = 2.85 × 0.68 = 1.94m

护栏（真实带）：进球 2.5~3.3、射门 11.9~13.8 每队场、角球 4.5~6.0 每场、
                直塞 ≥0.5 每场、强队 ≥1.5 分/场且净胜球为正。
读法：**先看最后两列。** 12 场的进球一列 1σ 约 ±0.49，几个档位互相都在噪声里，
排不出名次（1.10 档 12 场读到 3.50，24 场复跑是 3.04）。而「直塞每场」与
「强队分每场」是这条改动真正的代价所在：1.10 档实测直塞 0.21（下限 0.5）、
强队 1.29 分/场、净胜球 −4 —— **弱队光靠贴身就能捂住强队**。
禁区那几列在 1.94 与 0.90 之间只差 0.15m，说明**收益几乎全部来自「改成各向同性」
本身，而不是这个量级**。所以量级应当留在 1.94（旧椭圆的横向半轴，
历次标定都长在它上面），不要往下调。`);

