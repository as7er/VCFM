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

/** 跑一场，逐 0.1s 采球位与飞行状态；同时量引擎自己的球员速度 */
function ballTrack(seed) {
  const restore = Math.random;
  Math.random = seededRandom(seed);
  try {
    const engine = new SimEngine(makeClub(`h${seed}`, 15), makeClub(`a${seed}`, 15), {
      simulationProfile: "standard", timeStep: DT, separationPasses: 8,
    });
    const steps = Math.round((90 * 60) / DT);
    const track = [];
    // 球员速度：全体外场用直方图（4.3M 样本不必全存），追球者单独存
    const BIN = 0.02, BINS = 700;
    const hist = new Uint32Array(BINS);
    let histN = 0;
    const chaser = [];
    let prevPos = null;
    for (let s = 0; s < steps; s++) {
      engine.step(DT);
      const st = engine.ball.state;
      const b = engine.ball;
      track.push({ x: b.x, y: b.y, flight: st === "pass" || st === "shot" });

      const out = engine.agents.filter((a) => a.role !== "GK" && !a.sentOff);
      const now = new Map(out.map((a) => [a.id, { x: a.x, y: a.y }]));
      const entry = track[track.length - 1];
      if (prevPos) {
        let nearest = null, nd = Infinity;
        for (const a of out) {
          const p = prevPos.get(a.id);
          if (!p) continue;
          const v = metres(a.x - p.x, a.y - p.y) / DT;
          const bin = Math.min(BINS - 1, Math.floor(v / BIN));
          hist[bin]++; histN++;
          const d = metres(a.x - b.x, a.y - b.y);
          if (d < nd) { nd = d; nearest = v; }
        }
        if (nearest != null) {
          chaser.push(nearest);
          // 逐帧存下追球者速度：用户的观察是**同一瞬间**的相对速度，
          // 拿分位对分位比不出「主裁比他快」这件事。
          entry.chaserV = nearest;
        }
      }
      prevPos = now;
    }
    const fromHist = (p) => {
      let acc = 0;
      const want = p * histN;
      for (let i = 0; i < BINS; i++) {
        acc += hist[i];
        if (acc >= want) return Number(((i + 0.5) * BIN).toFixed(2));
      }
      return Number(((BINS - 0.5) * BIN).toFixed(2));
    };
    let maxBin = 0;
    for (let i = BINS - 1; i >= 0; i--) if (hist[i]) { maxBin = i; break; }
    return {
      track,
      players: {
        全体中位: fromHist(0.5), 全体p90: fromHist(0.9), 全体p99: fromHist(0.99),
        全体峰值: Number(((maxBin + 0.5) * BIN).toFixed(2)),
        追球者中位: q(chaser, 0.5), 追球者p90: q(chaser, 0.9), 追球者峰值: Number(Math.max(...chaser).toFixed(2)),
      },
    };
  } finally {
    Math.random = restore;
  }
}

/**
 * 把某一版跟随逻辑跑在同一条球轨迹上。
 * cfg = { track, drift, cap, near, far }（"old" 忽略之，走旧的指数追踪 + 无上限）
 */
function follow(track, mode, cfg) {
  const ref = { x: 42, y: 50 };
  const play = { x: track[0].x, y: track[0].y };
  const speeds = [], gaps = [], jumps = [];
  let dist = 0, prevT = null, capHits = 0, fasterThanChaser = 0, chaserFrames = 0;
  for (const f of track) {
    let t;
    if (mode === "old") {
      t = oldTarget(f.x, f.y);
    } else {
      const kk = f.flight ? cfg.track / 3 : cfg.track;
      play.x += (f.x - play.x) * kk;
      play.y += (f.y - play.y) * kk;
      t = newTarget(f.x, f.y, play);
    }
    if (prevT) jumps.push(metres(t.tx - prevT.tx, t.ty - prevT.ty));
    prevT = { tx: t.tx, ty: t.ty };

    const px = ref.x, py = ref.y;
    if (mode === "old") {
      ref.x += (clamp(t.tx, 1, 99) - ref.x) * 0.12;
      ref.y += (clamp(t.ty, 1, 99) - ref.y) * 0.12;
    } else {
      // 恒速追击 + 距球分档
      const gapM = metres(f.x - ref.x, f.y - ref.y);
      const stepM =
        gapM > cfg.far ? cfg.cap : gapM < cfg.near ? cfg.drift * 0.6 : cfg.drift;
      if (stepM >= cfg.cap) capHits++;
      const dx = clamp(t.tx, 1, 99) - ref.x;
      const dy = clamp(t.ty, 1, 99) - ref.y;
      const dM = metres(dx, dy);
      if (dM >= 1e-4) {
        const s = Math.min(1, stepM / dM);
        ref.x += dx * s;
        ref.y += dy * s;
      }
    }
    const step = metres(ref.x - px, ref.y - py);
    dist += step;
    const v = step / DT;
    speeds.push(v);
    gaps.push(metres(ref.x - f.x, ref.y - f.y));
    if (f.chaserV != null) {
      chaserFrames++;
      if (v > f.chaserV) fasterThanChaser++;
    }
  }
  return {
    中位: q(speeds, 0.5), p90: q(speeds, 0.9), p99: q(speeds, 0.99),
    峰值: Number(Math.max(...speeds).toFixed(2)),
    比追球者快的帧占比: Number(((fasterThanChaser / Math.max(1, chaserFrames)) * 100).toFixed(1)),
    每场km: Number((dist / 1000).toFixed(2)),
    距球p10: q(gaps, 0.1), 距球中位: q(gaps, 0.5), 距球p90: q(gaps, 0.9),
    距球峰值: Number(Math.max(...gaps).toFixed(1)),
    全速帧占比: Number(((capHits / track.length) * 100).toFixed(1)),
    单帧跳变最大m: Number(Math.max(...jumps).toFixed(2)),
  };
}

const agg = (rows, key) => mean(rows.map((r) => r[key]));
const summarise = (rows) =>
  Object.fromEntries(Object.keys(rows[0]).map((key) => [key, agg(rows, key)]));

// 候选档。判据不是真实主裁的 6~7 m/s，而是**引擎自己的追球者**：
// 长传转移时主裁必须被落下，所以 cap 要低于追球者 p90。
const CFGS = [
  { name: "上一版", track: 0.035, drift: 0.5, cap: 0.5, near: 0, far: 0 }, // 恒定 0.5 = 无分档
  { name: "A", track: 0.035, drift: 0.15, cap: 0.5, near: 9, far: 30 },
  { name: "B ★采用", track: 0.035, drift: 0.15, cap: 0.38, near: 9, far: 30 },
  { name: "C", track: 0.035, drift: 0.12, cap: 0.32, near: 9, far: 34 },
  { name: "D", track: 0.035, drift: 0.1, cap: 0.28, near: 10, far: 38 },
];

const tracks = [], playerRows = [];
for (const seed of seeds) {
  const { track, players } = ballTrack(seed);
  tracks.push(track);
  playerRows.push(players);
}
const oldRows = tracks.map((t) => follow(t, "old"));
const byCfg = CFGS.map((cfg) => ({ cfg, rows: tracks.map((t) => follow(t, "new", cfg)) }));

const P = summarise(playerRows);
console.log(JSON.stringify({ matches, seeds: { first: seeds[0], last: seeds.at(-1) }, 引擎球员速度: P }, null, 2));
console.log(`\n⚠ 判据是引擎自己的球员，不是真实主裁——这个引擎的球员就这个速度。`);
console.log(`  追球者 中位 ${P.追球者中位} / p90 ${P.追球者p90}    全体 中位 ${P.全体中位} / p90 ${P.全体p90} / p99 ${P.全体p99}`);
console.log(`  （峰值列不可信：定位球会把球员瞬移回阵型，那不是跑动）\n`);

const OLD = summarise(oldRows);
const hdr = `  ${"档".padEnd(9)} ${"drift".padEnd(6)} ${"cap".padEnd(5)} 中位   p90   峰值  比追球者快%  距球p10/中位/p90/峰值      每场km  全速帧%`;
console.log(hdr);
console.log(`  ${"修前".padEnd(9)} ${"—".padEnd(6)} ${"—".padEnd(5)} ${String(OLD.中位).padStart(4)}  ${String(OLD.p90).padStart(4)}  ${String(OLD.峰值).padStart(5)}  ${String(OLD.比追球者快的帧占比).padStart(9)}%  ${String(OLD.距球p10).padStart(4)}/${String(OLD.距球中位).padStart(5)}/${String(OLD.距球p90).padStart(5)}/${String(OLD.距球峰值).padStart(5)}  ${String(OLD.每场km).padStart(6)}  ${String(OLD.全速帧占比).padStart(6)}%`);
for (const { cfg, rows } of byCfg) {
  const r = summarise(rows);
  const ok = r.p90 < P.追球者p90 && r.中位 < P.追球者中位 && r.峰值 <= P.追球者p90;
  console.log(
    `${ok ? "★" : " "} ${cfg.name.padEnd(9)} ${String(cfg.drift).padEnd(6)} ${String(cfg.cap).padEnd(5)} ` +
    `${String(r.中位).padStart(4)}  ${String(r.p90).padStart(4)}  ${String(r.峰值).padStart(5)}  ` +
    `${String(r.比追球者快的帧占比).padStart(9)}%  ` +
    `${String(r.距球p10).padStart(4)}/${String(r.距球中位).padStart(5)}/${String(r.距球p90).padStart(5)}/${String(r.距球峰值).padStart(5)}  ` +
    `${String(r.每场km).padStart(6)}  ${String(r.全速帧占比).padStart(6)}%`
  );
}
console.log(`
★ = 中位与 p90 低于追球者，且峰值不超过追球者 p90（长传转移时必然被落下）。
「距球 p10/中位/p90/峰值」是这次的关键列：上一版几乎是常数（距离被锁死），
分档之后应该拉开——距离会呼吸，才说明主裁不再被球牵着走。`);
