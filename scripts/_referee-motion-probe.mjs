/**
 * 探针：量主裁跟随的运动学，给「主裁和球同步/瞬移」这条肉眼观察配上数字。
 *
 * 背景：`js/matchview.js` 的 `_updateOfficials` 是纯表现层（不参与判罚、不碰标定），
 * 所以 `scripts/` 下**从来没有任何审计量过它**。读代码找到四处缺陷：
 *   1. `side = bx >= 50 ? -1 : 1` —— 球横穿中线时目标 x 一次跳 2×11 = 22 格
 *   2. `ty = by + (by >= 50 ? -7 : 7)` —— 过半场线时目标 y 一次跳 14 格
 *   3. 目标点是球**瞬时位置**的刚性偏移，长传飞行与死球摆位瞬移一并被继承
 *   4. `if (gap < 6)` 恒不成立（`hypot(11, 7)` 恒等于 13.04），且直接对格数取
 *      hypot 是混单位（x 一格 0.68m、y 一格 1.05m）——死代码，靠推导即可确认，本探针只计数
 *
 * 口径：种子 372000..、能力 15、标准档、0.1s 步长，与 `corner-structure-audit` 一致。
 * 官员更新频率对齐 sim 帧：`_updateOfficials` 只在 `matchview.js:513` 与 `:3497`
 * 被调用，两处都是 sim 帧节奏（不在 60fps 的 `update()` 里），所以每 0.1s 调一次。
 * `soft = true`：高光/回放走 `playSimTimeline` 里的 `_updateOfficials(true)`，
 * 即 `k = 0.12`、低通系数 0.06——正是用户看到的那条路径。
 * 飞行判定用引擎的 `ball.state === "pass" | "shot"`，与视图层 `_isBallInFlight`
 * 等价：`matchview.js:504-509` 把引擎的 `pass` 映射成视图的 `flight`。
 *
 * 真实参照：英超主裁每场跑 10~12 km，均速约 2 m/s，冲刺峰值 6~7 m/s。
 *
 * 纯测量，不改仓库代码；只读引擎公开状态，不消费额外随机数。
 * 用法：node scripts/_referee-motion-probe.mjs [场数=4]
 */
import { SimEngine, SIM } from "../js/sim/engine.js";

const matches = Math.max(2, Number(process.argv[2]) || 4);
const seeds = Array.from({ length: matches }, (_, i) => 372000 + i);
const DT = SIM.DT;
const MX = SIM.PITCH_W_METRES / SIM.FIELD_W;
const MY = SIM.PITCH_H_METRES / SIM.FIELD_H;
const MIN_GAP_M = 5;
/** 与 `matchview.js` 的 MAX_OFFICIAL_STEP_M 同值：7 m/s × 0.1s */
const MAX_STEP_M = 0.7;

const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const metres = (dx, dy) => Math.hypot(dx * MX, dy * MY);
const q = (v, p) => {
  if (!v.length) return 0;
  const s = [...v].sort((a, b) => a - b);
  return Number(s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(2));
};
const mean = (v) => (v.length ? Number((v.reduce((a, b) => a + b, 0) / v.length).toFixed(2)) : 0);

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

/** 改动前的 `_updateOfficials` 目标点，逐字照抄 */
function oldTarget(bx, by) {
  const side = bx >= 50 ? -1 : 1;
  let tx = bx + side * 11;
  let ty = by + (by >= 50 ? -7 : 7);
  const gap = Math.hypot(tx - bx, ty - by);
  const dead = gap < 6;
  if (dead) {
    tx = bx + side * 8;
    ty = by + (by >= 50 ? -6 : 6);
  }
  return { tx, ty, dead };
}

/** 改动后：低通局面重心 + tanh 过渡 + 按米的最小间距 */
function newTarget(bx, by, play) {
  let tx = play.x + -Math.tanh((play.x - 50) / 12) * 11;
  let ty = play.y + -Math.tanh((play.y - 50) / 12) * 7;
  const dxM = (tx - bx) * MX;
  const dyM = (ty - by) * MY;
  const gapM = Math.hypot(dxM, dyM);
  const guard = gapM < MIN_GAP_M;
  if (guard) {
    const ux = gapM > 1e-3 ? dxM / gapM : 1;
    const uy = gapM > 1e-3 ? dyM / gapM : 0;
    tx = bx + (ux * MIN_GAP_M) / MX;
    ty = by + (uy * MIN_GAP_M) / MY;
  }
  return { tx, ty, guard };
}

/** 跑一场，逐 0.1s 采球位与飞行状态 */
function ballTrack(seed) {
  const restore = Math.random;
  Math.random = seededRandom(seed);
  try {
    const engine = new SimEngine(makeClub(`h${seed}`, 15), makeClub(`a${seed}`, 15), {
      simulationProfile: "standard", timeStep: DT, separationPasses: 8,
    });
    const steps = Math.round((90 * 60) / DT);
    const track = [];
    for (let s = 0; s < steps; s++) {
      engine.step(DT);
      const st = engine.ball.state;
      track.push({ x: engine.ball.x, y: engine.ball.y, flight: st === "pass" || st === "shot" });
    }
    return track;
  } finally {
    Math.random = restore;
  }
}

/** 把某一版跟随逻辑跑在同一条球轨迹上 */
function follow(track, mode) {
  const k = 0.12; // soft = true
  const ref = { x: 42, y: 50 };
  const play = { x: track[0].x, y: track[0].y };
  const speeds = [], jumps = [], gaps = [], ballSpeeds = [];
  let dist = 0, branchHits = 0, capHits = 0, prevT = null, prevB = null;
  for (const f of track) {
    let t;
    if (mode === "old") {
      t = oldTarget(f.x, f.y);
      if (t.dead) branchHits++;
    } else {
      const kk = f.flight ? 0.02 : 0.06;
      play.x += (f.x - play.x) * kk;
      play.y += (f.y - play.y) * kk;
      t = newTarget(f.x, f.y, play);
      if (t.guard) branchHits++;
    }
    if (prevT) jumps.push(metres(t.tx - prevT.tx, t.ty - prevT.ty));
    prevT = { tx: t.tx, ty: t.ty };
    if (prevB) ballSpeeds.push(metres(f.x - prevB.x, f.y - prevB.y) / DT);
    prevB = { x: f.x, y: f.y };
    const px = ref.x, py = ref.y;
    let dx = (clamp(t.tx, 1, 99) - ref.x) * k;
    let dy = (clamp(t.ty, 1, 99) - ref.y) * k;
    if (mode !== "old") {
      // 单帧位移封顶：MAX_OFFICIAL_STEP_M = 0.7 m（7 m/s × 0.1s）
      const stepM = Math.hypot(dx * MX, dy * MY);
      if (stepM > MAX_STEP_M) {
        const scale = MAX_STEP_M / stepM;
        dx *= scale;
        dy *= scale;
        capHits++;
      }
    }
    ref.x += dx;
    ref.y += dy;
    const step = metres(ref.x - px, ref.y - py);
    dist += step;
    speeds.push(step / DT);
    gaps.push(metres(ref.x - f.x, ref.y - f.y));
  }
  return {
    refSpeedMedian: q(speeds, 0.5), refSpeedP90: q(speeds, 0.9), refSpeedP99: q(speeds, 0.99),
    refSpeedMax: Number(Math.max(...speeds).toFixed(2)),
    stepsOver7ms: speeds.filter((s) => s > 7).length,
    distanceKm: Number((dist / 1000).toFixed(2)),
    targetJumpP99M: q(jumps, 0.99), targetJumpMaxM: Number(Math.max(...jumps).toFixed(2)),
    targetJumpsOver5M: jumps.filter((j) => j > 5).length,
    gapToBallMedianM: q(gaps, 0.5),
    ballSpeedMedian: q(ballSpeeds, 0.5),
    branchHits, capHits,
  };
}

const agg = (rows, key) => mean(rows.map((r) => r[key]));
const oldRows = [], newRows = [];
for (const seed of seeds) {
  const track = ballTrack(seed);
  oldRows.push(follow(track, "old"));
  newRows.push(follow(track, "new"));
}
const summarise = (rows) =>
  Object.fromEntries(Object.keys(rows[0]).map((key) => [key, agg(rows, key)]));

console.log(JSON.stringify({ matches, seeds: { first: seeds[0], last: seeds.at(-1) }, before: summarise(oldRows), after: summarise(newRows) }, null, 2));
console.log(`
真实参照：主裁每场 10~12 km、均速约 2 m/s、冲刺峰值 6~7 m/s。
before.branchHits 是 \`gap < 6\` 兜底的命中次数（应为 0 —— 死代码）；
after.branchHits 是新的按米最小间距守卫命中次数（应 > 0 —— 它现在真的会成立）。`);
