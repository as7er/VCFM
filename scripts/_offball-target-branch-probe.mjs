/**
 * 诊断（执行 v240 交接「下一步」）：`_thinkAttackOffBall` 的各分支到底给无球进攻者
 * 指派了多深的目标点，以及**深度是在哪一步被削掉的**。
 *
 * 背景：v240 `_player-stillness-probe` 已证明近静止球员距自己目标点中位仅 0.31m
 * （96.3% <1.5m），跑动中球员目标距离中位 7.65m——**球员不是走不快，是没被指派远目标**。
 * v241 `_through-pass-gate-probe` 又测出直塞的卡点在前两门：`aheadOfBall(>4)` 淘汰
 * 68.0%、`advance(>0.35)`（要求接球人比持球者近门 14 单位）再淘汰 25.2%，
 * 一次决策中「存在几何可行的直塞接球人」只占 1.5%。
 *
 * 两条线索指向同一个未被测量的环节：**目标点生成后还要经过 `_clampOffside`**
 * （`engine.js:3469`），它把目标 y 夹到「越位线与球中更靠近对方球门者」之后：
 *     legalY = 主队 ? min(offY, ball.y) : max(offY, ball.y)
 * 即**任何无球目标点都不可能比球本身更靠前**。而各分支的原始公式（core 支援
 * `owner.y + dir*(4~10)`、边锋内切 `b.y + dir*(10~20)`、前锋前插 `baseY + dir*(18+)`）
 * 全都指向球/持球人前方。若原始目标确实深、夹取后变浅，则杠杆在夹取的口径
 * （对**目标点**套用「不得越过球」等于禁止一切反越位插上）；
 * 若原始目标本来就浅，则杠杆在分支公式本身。**本探针就是为了分开这两种可能。**
 *
 * **纯测量，不改仓库代码。** 只包装 `_thinkAttackOffBall` / `_applyAttackTactics` /
 * `_commitOffBallTarget` / `_clampOffside` 四处，每处都**只调用原方法一次**、
 * 不额外消费随机数；分类只用确定性判据（`_isWinger` / `_isPrimaryMidRunner` /
 * `_isFullback` / `_offsideLineY` 均为纯函数）。脚本内含决定性自检：
 * 同种子下插桩与不插桩必须逐场同分，否则直接 exit 1。
 *
 * 口径与 `_player-stillness-probe` / `_offside-line-occupancy-probe` 一致：
 * 种子 372000..、能力 15、标准档、0.1 秒步长。
 *
 * 用法：node scripts/_offball-target-branch-probe.mjs [场数=6]
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
      "positioning", "kicking", "decisions", "crossing",
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
    },
  };
}

const METRES_Y = SIM.PITCH_H_METRES / SIM.FIELD_H;
const METRES_X = SIM.PITCH_W_METRES / SIM.FIELD_W;
const median = (v) => {
  if (!v.length) return 0;
  const s = [...v].sort((x, y) => x - y);
  const m = s.length >> 1;
  return Number((s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2).toFixed(2));
};
const quantile = (v, q) => {
  if (!v.length) return 0;
  const s = [...v].sort((x, y) => x - y);
  return Number(s[Math.min(s.length - 1, Math.floor(s.length * q))].toFixed(2));
};
const pct = (n, d) => Number(((n / Math.max(1, d)) * 100).toFixed(1));
const toM = (u) => Number((u * METRES_Y).toFixed(1));

const matchCount = Math.max(1, Number(process.argv[2]) || 6);
const seeds = Array.from({ length: matchCount }, (_, i) => 372000 + i);
const timeStep = SIM.DT;

/** 分档：与引擎 `finalThird = prog > 0.64` 同口径 */
const bandOf = (prog) => (prog <= 0.36 ? "own" : prog <= 0.64 ? "mid" : "final");

/** 每个 (分支 × 分档) 一个桶；数组只存标量，便于取分位数 */
const buckets = new Map();
function bucket(key) {
  let b = buckets.get(key);
  if (!b) {
    buckets.set(key, (b = {
      n: 0,
      rawAhead: [],      // 原始分支目标领先球多少单位（正=更靠近对方球门）
      finalAhead: [],    // 最终目标领先球多少单位
      targetDistM: [],   // 最终目标距球员本人多少米（对齐 v240 的 0.31m / 7.65m）
      removedByClamp: [], // 三处 clamp 合计削掉的纵深（单位）
      playerAhead: [],   // 球员本人领先球多少单位
      runsInBehind: 0,   // 最终目标领先球 >4 单位（直塞第 1 门的门槛）
      rawRunsInBehind: 0,
      beyondLine: 0,     // 最终目标越过越位线
      rawBeyondLine: 0,
    }));
  }
  return b;
}

/** clamp 的绑定参照：球更靠前则是球在绑，否则是越位线在绑 */
const clampSites = {
  branch: { calls: 0, moved: 0, removed: [], byBall: 0, byLine: 0 },
  tactics: { calls: 0, moved: 0, removed: [], byBall: 0, byLine: 0 },
  commit: { calls: 0, moved: 0, removed: [], byBall: 0, byLine: 0 },
  other: { calls: 0, moved: 0, removed: [], byBall: 0, byLine: 0 },
};
let noOffsideLineCalls = 0;

/** 分支归属：只用确定性判据，顺序与 `_thinkAttackOffBall` 的分支顺序逐条对应 */
function branchKeyOf(cur) {
  const finalThird = cur.prog > 0.64;
  if (cur.kind === "one-two") return "one-two";
  if (finalThird && cur.role === "MID" && !cur.primaryMid) return "mid-2nd-layer";
  if (finalThird && cur.role === "DEF" && !cur.fullback) return "cb-hold";
  if (cur.isCore && cur.ownerOk) return "core-support";
  if (cur.winger) return `wing-${cur.fsm}`;
  return `${cur.role}-${cur.fsm}`;
}

function record(cur, a) {
  if (cur.role === "GK") return;
  const dir = cur.dir;
  const b = bucket(`${branchKeyOf(cur)}|${bandOf(cur.prog)}`);
  const rawAhead = (cur.rawTy - cur.ballY) * dir;
  const finalAhead = (a.ty - cur.ballY) * dir;
  b.n++;
  b.rawAhead.push(rawAhead);
  b.finalAhead.push(finalAhead);
  b.playerAhead.push((cur.py - cur.ballY) * dir);
  b.removedByClamp.push(cur.removed);
  b.targetDistM.push(
    Math.hypot((a.tx - cur.px) * METRES_X, (a.ty - cur.py) * METRES_Y)
  );
  if (finalAhead > 4) b.runsInBehind++;
  if (rawAhead > 4) b.rawRunsInBehind++;
  if (cur.offY != null) {
    if ((a.ty - cur.offY) * dir > 0) b.beyondLine++;
    if ((cur.rawTy - cur.offY) * dir > 0) b.rawBeyondLine++;
  }
}

function install(engine) {
  const origThink = engine._thinkAttackOffBall.bind(engine);
  const origTactics = engine._applyAttackTactics.bind(engine);
  const origCommit = engine._commitOffBallTarget.bind(engine);
  const origClamp = engine._clampOffside.bind(engine);
  let site = "other";
  let cur = null;

  engine._clampOffside = (a) => {
    const store = clampSites[site] || clampSites.other;
    const dir = engine.attackDir(a.team);
    const offY = engine._offsideLineY(a.team);
    const preTy = a.ty;
    origClamp(a);
    store.calls++;
    if (offY == null) {
      noOffsideLineCalls++;
      return;
    }
    if ((engine.ball.y - offY) * dir > 0) store.byBall++;
    else store.byLine++;
    const removed = (preTy - a.ty) * dir;
    if (removed > 1e-9) {
      store.moved++;
      store.removed.push(removed);
    }
    if (cur && cur.agent === a) {
      if (site === "branch" && cur.rawTy == null) cur.rawTy = preTy;
      cur.removed += Math.max(0, removed);
    }
  };

  engine._thinkAttackOffBall = (a, owner) => {
    const ownGoalY = a.team === "home" ? SIM.HOME_GOAL_Y : SIM.AWAY_GOAL_Y;
    cur = {
      agent: a,
      role: a.role,
      dir: engine.attackDir(a.team),
      prog: Math.abs(engine.ball.y - ownGoalY) / 100,
      ballY: engine.ball.y,
      offY: engine._offsideLineY(a.team),
      px: a.x,
      py: a.y,
      isCore: !!a.isCore,
      ownerOk: !!(owner && owner.team === a.team && owner !== a),
      primaryMid: a.role === "MID" ? engine._isPrimaryMidRunner(a) : false,
      fullback: a.role === "DEF" ? engine._isFullback(a) : false,
      winger: engine._isWinger(a),
      rawTy: null,
      removed: 0,
    };
    site = "branch";
    try {
      origThink(a, owner);
    } finally {
      site = "other";
    }
    if (cur.rawTy == null) cur.rawTy = a.ty; // 该分支没有调用 clamp
    cur.fsm = a.fsm;
    cur.kind = a.offBallTargetKind;
  };

  engine._applyAttackTactics = (a, phaseActor) => {
    site = "tactics";
    try {
      origTactics(a, phaseActor);
    } finally {
      site = "other";
    }
  };

  engine._commitOffBallTarget = (a, phaseActor) => {
    site = "commit";
    try {
      origCommit(a, phaseActor);
    } finally {
      site = "other";
    }
    if (cur && cur.agent === a) record(cur, a);
    cur = null;
  };
}

function runMatch(seed, instrument) {
  const original = Math.random;
  Math.random = seededRandom(seed);
  try {
    const engine = new SimEngine(
      makeClub(`home-${seed}`, 15),
      makeClub(`away-${seed}`, 15),
      { simulationProfile: "standard", timeStep, separationPasses: 8 }
    );
    if (instrument) install(engine);
    const steps = Math.round((90 * 60) / timeStep);
    for (let step = 0; step < steps; step++) engine.step(timeStep);
    return { home: engine.score?.home ?? 0, away: engine.score?.away ?? 0 };
  } finally {
    Math.random = original;
  }
}

const cleanScore = runMatch(seeds[0], false);
const instrumentedFirst = runMatch(seeds[0], true);
const deterministic =
  cleanScore.home === instrumentedFirst.home && cleanScore.away === instrumentedFirst.away;
for (const seed of seeds.slice(1)) runMatch(seed, true);

console.log(
  `\n=== 无球目标点的纵深从哪一步被削掉（${seeds.length} 场，种子 ${seeds[0]}..${seeds[seeds.length - 1]}）===`
);
console.log("\n[0] 决定性自检 —— 插桩是否污染了 RNG 流：");
console.log({
  无插桩比分: `${cleanScore.home}-${cleanScore.away}`,
  有插桩比分: `${instrumentedFirst.home}-${instrumentedFirst.away}`,
  判定: deterministic ? "✅ 一致，插桩只读" : "❌ 不一致，下面所有数字作废",
});
if (!deterministic) {
  console.error("\n插桩改变了比赛结果，测量无效。终止。");
  process.exit(1);
}

function merge(pred) {
  const out = {
    n: 0, rawAhead: [], finalAhead: [], targetDistM: [], removedByClamp: [],
    playerAhead: [], runsInBehind: 0, rawRunsInBehind: 0, beyondLine: 0, rawBeyondLine: 0,
  };
  for (const [key, b] of buckets) {
    if (!pred(key)) continue;
    out.n += b.n;
    out.runsInBehind += b.runsInBehind;
    out.rawRunsInBehind += b.rawRunsInBehind;
    out.beyondLine += b.beyondLine;
    out.rawBeyondLine += b.rawBeyondLine;
    for (const f of ["rawAhead", "finalAhead", "targetDistM", "removedByClamp", "playerAhead"]) {
      for (const v of b[f]) out[f].push(v);
    }
  }
  return out;
}

const bands = ["own", "mid", "final"];
console.log(
  "\n[1] 🔑 目标点领先球多少（单位；正=更靠近对方球门）—— 原始分支输出 vs 最终目标："
);
for (const band of [...bands, "ALL"]) {
  const m = merge((k) => band === "ALL" || k.endsWith(`|${band}`));
  if (!m.n) continue;
  console.log(`  ${band}（n=${m.n}）:`, {
    原始目标领先球_中位: `${median(m.rawAhead)} (${toM(median(m.rawAhead))}m)`,
    原始_p90: quantile(m.rawAhead, 0.9),
    最终目标领先球_中位: `${median(m.finalAhead)} (${toM(median(m.finalAhead))}m)`,
    最终_p90: quantile(m.finalAhead, 0.9),
    球员本人领先球_中位: median(m.playerAhead),
    "原始就>4单位(直塞第1门)": `${pct(m.rawRunsInBehind, m.n)}%`,
    "最终仍>4单位": `${pct(m.runsInBehind, m.n)}%`,
    原始越过越位线: `${pct(m.rawBeyondLine, m.n)}%`,
    最终越过越位线: `${pct(m.beyondLine, m.n)}%`,
    clamp削掉纵深_中位: median(m.removedByClamp),
    削掉_p90: quantile(m.removedByClamp, 0.9),
    目标距球员_中位m: median(m.targetDistM),
  });
}

console.log(
  "\n[2] `_clampOffside` 三处调用点的归因（byBall = 球比越位线更靠前，此时夹取的实质是「目标不得越过球」）："
);
for (const [name, s] of Object.entries(clampSites)) {
  if (!s.calls) continue;
  console.log(`  ${name}:`, {
    调用: s.calls,
    实际移动了目标: `${s.moved} (${pct(s.moved, s.calls)}%)`,
    削掉纵深_中位: median(s.removed),
    削掉_p90: quantile(s.removed, 0.9),
    绑定参照_球: `${pct(s.byBall, s.calls)}%`,
    绑定参照_越位线: `${pct(s.byLine, s.calls)}%`,
  });
}
console.log({ 无越位线可用的调用: noOffsideLineCalls });

console.log("\n[3] 分支 × 分档（按样本量排序，只列 n>=400 的行）：");
const rows = [...buckets.entries()]
  .map(([key, b]) => ({ key, b }))
  .sort((p, q) => q.b.n - p.b.n)
  .filter((r) => r.b.n >= 400);
for (const { key, b } of rows) {
  console.log(`  ${key.padEnd(26)}`, {
    n: b.n,
    原始领先球: median(b.rawAhead),
    最终领先球: median(b.finalAhead),
    削掉: median(b.removedByClamp),
    "最终>4单位%": pct(b.runsInBehind, b.n),
    目标距离m: median(b.targetDistM),
  });
}

const all = merge(() => true);
const rawRun = pct(all.rawRunsInBehind, all.n);
const finalRun = pct(all.runsInBehind, all.n);
console.log("\n[4] 判定 —— 纵深是「分支公式本来就浅」还是「被 clamp 削掉」：");
console.log({
  原始目标已领先球_4单位以上: `${rawRun}%`,
  最终目标仍领先球_4单位以上: `${finalRun}%`,
  结论:
    rawRun - finalRun >= 10
      ? `❗ clamp 是绑定约束：原始 ${rawRun}% → 最终 ${finalRun}%，杠杆在夹取口径`
      : rawRun < 10
        ? `❗ 分支公式本身就浅：原始只有 ${rawRun}% 越过球，杠杆在目标点生成公式`
        : `两者都不显著（原始 ${rawRun}% / 最终 ${finalRun}%），需换口径再量`,
});
