/**
 * 标定曲线：给 `_bestCross` 补越位抑制项，扫描抑制强度的连带影响。
 *
 * 背景（AGENTS.md v241「越位判罚率约为真实的 2.7 倍」）：去重后实测 4.56 次/队/场，
 * Opta 英超 VAR 时代真实值 **1.70**（带 1.4~2.1）。归因探针显示判罚触发路径为
 * 普通传球 69.8% / 传中 30.2%，但按「出脚瞬间预定接球人已越位」的比例算，
 * **传中 10.5%、普通传球仅 0.3%**——传中单次风险高 35 倍。
 * 根因：`_passCandidates:2849` 对越位队友有 `×(0.16 + (1-vision)*0.34)` 的抑制，
 * 而 `_bestCross:2654` **完全没有越位项**，只要求 `ahead >= 4` 且离门 <32m，
 * 正好圈定越位区。
 *
 * AGENTS.md 明确要求「改它会动传中量与禁区进入结构，必须先跑标定曲线再决定」，
 * 本脚本就是那条曲线。**纯测量，不改仓库代码**——只在进程内替换
 * `SimEngine.prototype._bestCross`，进程退出即失效。
 *
 * 自检设计（与其他探针的「插桩不改比分」不同，本探针是**故意**改行为的）：
 * 抑制系数 1.00 那一档必须与**未打补丁的引擎**逐场比分完全一致。若不一致，
 * 说明我复刻的 `_bestCross` 与原版有偏差，整条曲线作废。
 * 随机数消费量与原版逐字相同（每个通过筛选的候选消费 2 次），所以 1.00 档
 * 不只是比分相同，而是完全同一条 RNG 流。
 *
 * 口径与 `match-realism-audit` 对齐：传中 = `pass && cross`，直塞 = `pass && through && !cross`，
 * `perMatch` 一律「总数 / 场数」**合并双方**；越位与射门另按「每队每场」报，
 * 因为真实参照值是那个口径。禁区触球口径与 `_box-touch-count-probe` 一致
 * （只数离散触球，是下界）。
 *
 * 用法：node scripts/_cross-offside-calibration-probe.mjs [场数] [档位过滤]
 * 档位过滤为逗号分隔的子串（如 `prefer,skip,0.00`）；对照档 1.00 永远保留，
 * 因为复刻自检与候选诊断都挂在它上面。用于在大场次复跑时跳过已证明「逐字与对照
 * 相同」的中间档，把机时花在有信息量的端点上。
 */
import { SimEngine, SIM } from "../js/sim/engine.js";

// 与 engine.js:111-116 逐字一致（模块私有，未导出）
function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}
function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
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

const ATTRS = [
  "pace", "shooting", "passing", "dribbling", "defending", "physical",
  "finishing", "tackling", "marking", "strength", "stamina", "vision",
  "reflexes", "handling", "positioning", "kicking", "decisions", "crossing",
];

function club(name, ability) {
  const roles = ["GK", "DEF", "DEF", "DEF", "DEF", "MID", "MID", "MID", "ATT", "ATT", "ATT"];
  const players = roles.map((pos, i) => {
    const rating = Math.max(1, Math.min(20, ability + (((i * 7 + ability) % 5) - 2)));
    const attrs = {};
    for (const k of ATTRS) attrs[k] = rating;
    return { id: `${name}-p${i}`, name: `${name}-p${i}`, pos, number: i + 1, fitness: 100, attrs };
  });
  return {
    id: name,
    name,
    players,
    tactics: { formation: "4-3-3", lineup: players.map((p) => p.id), pressing: 3, tempo: 3, defensiveLine: 3 },
  };
}

// —— 真实参照值（AGENTS.md v241 总表，官方 PL/Pulselive API，source=OPTA）——
const REAL = {
  offsidePerTeam: 1.7,          // 带 1.4~2.1，英超 VAR 时代十二季
  shotsPerTeam: [11.9, 13.8],   // 可断言 11~15
  boxTouchesPerTeam: 26.1,      // 带 20~30
  throughPerMatch: 3.38,        // 双方合计尝试
};
// 现有审计护栏（match-realism-audit.mjs:366）：传中占传球比必须落在 3~14%
const CROSS_SHARE_GATE = [3, 14];

const ORIGINAL_BEST_CROSS = SimEngine.prototype._bestCross;

/**
 * 当前扫描档位的抑制系数函数：(持球人 a) => 乘数。
 * 置 null 表示走原版方法（用于产出对照基线）。
 */
let offsidePenalty = null;
/** true = 把越位候选整个剔出候选集（真硬禁），与「乘 0」是两回事，见循环内注释。 */
let skipOffside = false;
/** true = 优先选非越位候选，只有当**全部**候选都越位时才仍然传（保留「绝境误传」）。 */
let preferOnside = false;

/**
 * 候选构成诊断。乘性抑制只有在「同一次决策里越位候选与非越位候选并存」时才可能
 * 改变 argmax；只有越位候选时，无论乘多少都还是同一个人（`!best` 分支照收）。
 * 所以 `bothKinds` 才是这条杠杆的有效作用面，`ratios` 给出「要翻盘需要多小的系数」。
 * 只在 1.00 档采集，那一档行为与原版逐字相同。
 */
let diag = null;
const newDiag = () => ({
  calls: 0, withCandidate: 0, withOffside: 0, bothKinds: 0,
  winnerOffside: 0, onlyOffside: 0, ratios: [],
});

/**
 * 复刻 engine.js:2654-2693 的 `_bestCross`，只多一处越位抑制。
 * 逐行对照原版；随机数调用位置与次数不变。
 */
SimEngine.prototype._bestCross = function _bestCrossProbe(a) {
  if (!offsidePenalty) return ORIGINAL_BEST_CROSS.call(this, a);
  const dir = this.attackDir(a.team);
  const goalY = this.targetGoalY(a.team);
  let best = null;
  let bestOn = null;
  let bestOff = null;
  let bestOffRaw = -Infinity;
  let bestOnRaw = -Infinity;
  for (const m of this.agents) {
    if (m === a || m.team !== a.team || m.role === "GK") continue;
    const ahead = (m.y - a.y) * dir;
    if (ahead < 4) continue;
    const dGoalM = dist(m.x, m.y, 50, goalY);
    if (dGoalM > 32) continue;
    const d = dist(a.x, a.y, m.x, m.y);
    if (d < 10 || d > 48) continue;
    const opposite = Math.abs(m.x - a.x) > 12 ? 1.25 : 0.85;
    const roleB = m.role === "ATT" ? 1.35 : m.role === "MID" ? 1.05 : 0.7;
    const coreB = m.isCore ? 1.4 : 1;
    const aerialB = 0.72 + this._aerialAbility(m) * 0.72;
    const deliveryB = clamp(
      0.76 + (a.attr.crossing || a.attr.passing || 0.55) * 0.36 + (a.attr.decisions || 0.55) * 0.1,
      0.82,
      1.2
    );
    let value =
      (0.4 + clamp(1 - dGoalM / 32, 0, 1)) *
      this._laneSafety(a, m) *
      opposite *
      roleB *
      coreB *
      aerialB *
      deliveryB;
    // ★ 唯一的改动：与 `_passCandidates:2849` 同位置、同语义的越位抑制。
    const offside = this._isOffsidePosition(a.team, m);
    if (diag) {
      if (offside) bestOffRaw = Math.max(bestOffRaw, value);
      else bestOnRaw = Math.max(bestOnRaw, value);
    }
    // `skip` 档是真正的硬禁：直接把越位候选剔出候选集。
    // 注意乘 0 **不等于**硬禁——`!best` 分支会照收值为 0 的候选，
    // 「只有越位候选」时乘 0 仍然传给越位球员，只是改成按遍历顺序取第一个。
    // 这两档必须分开量，否则曲线端点是错的。
    if (offside && !skipOffside) value *= offsidePenalty(a);
    // 两次 random() 照常消费**再**跳过：这样 skip 档与原版的随机数流逐位一致，
    // 量到的差异只来自「候选被剔除」，不掺杂 RNG 错位的蝴蝶效应。
    const tx = clamp(m.x * 0.55 + 50 * 0.45 + (this.random() - 0.5) * 6, 28, 72);
    const ty = clamp(goalY - dir * (8 + this.random() * 6), 4, 96);
    const cand = { agent: m, value, through: true, tx, ty, cross: true, offside };
    // preferOnside 档：分开留最优的越位/非越位候选，最后优先取非越位、
    // 无非越位候选时仍传越位者——即保留 `_passCandidates:2847` 注释所说的「绝境误传」。
    if (offside) {
      if (!bestOff || value > bestOff.value) bestOff = cand;
    } else if (!bestOn || value > bestOn.value) bestOn = cand;
    if (offside && skipOffside) continue;
    if (!best || value > best.value) {
      best = cand;
    }
  }
  if (diag) {
    diag.calls++;
    if (best) diag.withCandidate++;
    const hasOff = bestOffRaw > -Infinity;
    const hasOn = bestOnRaw > -Infinity;
    if (hasOff) diag.withOffside++;
    if (hasOff && hasOn) {
      diag.bothKinds++;
      // >1 表示越位候选原本就赢，需要把系数压到该比值以下才翻得动
      diag.ratios.push(bestOffRaw / Math.max(1e-9, bestOnRaw));
    }
    if (hasOff && !hasOn) diag.onlyOffside++;
    if (best?.offside) diag.winnerOffside++;
  }
  // preferOnside 只改「最后选谁」，不改候选集，也不改随机数消费。
  if (preferOnside) return bestOn || bestOff;
  return best;
};

const matches = Math.max(1, Number(process.argv[2]) || 4);
const seeds = Array.from({ length: matches }, (_, i) => 372000 + i);

const LEVELS = [
  { label: "1.00 对照（现状，无抑制）", fn: () => 1 },
  { label: "0.60 轻", fn: () => 0.6 },
  { label: "0.35 中", fn: () => 0.35 },
  { label: "同式 0.16+(1-vision)*0.34", fn: (a) => 0.16 + (1 - a.attr.vision) * 0.34 },
  { label: "0.12 重", fn: () => 0.12 },
  { label: "0.00 乘零（非硬禁，见注释）", fn: () => 0 },
  { label: "preferOnside 保留绝境误传", fn: () => 1, prefer: true },
  { label: "skip 真硬禁（剔出候选集）", fn: () => 1, skip: true },
];

// 档位过滤：只影响跑哪些档，不影响任何档内部的行为与随机数流。
const filter = (process.argv[3] || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const activeLevels = filter.length
  ? LEVELS.filter((l, i) => i === 0 || filter.some((f) => l.label.includes(f)))
  : LEVELS;


function runMatch(seed) {
  const restore = Math.random;
  Math.random = seededRandom(seed);
  try {
    const eng = new SimEngine(club(`h${seed}`, 15), club(`a${seed}`, 15), {
      simulationProfile: "standard",
      timeStep: SIM.DT,
      separationPasses: 8,
    });
    const steps = Math.round((90 * 60) / SIM.DT);
    for (let s = 0; s < steps; s++) eng.step(SIM.DT);

    const t = {
      offsides: 0, crosses: 0, passes: 0, through: 0,
      shots: 0, goals: 0, boxTouches: 0, corners: 0,
    };
    for (const ev of eng.events) {
      if (ev.type === "offside") t.offsides++;
      else if (ev.type === "shot") t.shots++;
      else if (ev.type === "goal") t.goals++;
      else if (ev.type === "corner") t.corners++;
      if (ev.type === "pass") {
        t.passes++;
        if (ev.cross) t.crosses++;
        if (ev.through && !ev.cross) t.through++;
      }
      // 禁区触球（离散口径，与 _box-touch-count-probe 一致）
      if (ev.type === "pass" || ev.type === "shot" || ev.type === "receive") {
        if ((ev.team === "home" || ev.team === "away") && Number.isFinite(ev.x) && Number.isFinite(ev.y)) {
          const opp = ev.team === "home" ? "away" : "home";
          if (eng._inOwnFoulBox(opp, ev.x, ev.y)) t.boxTouches++;
        }
      }
    }
    return { score: `${eng.score.home}-${eng.score.away}`, ...t };
  } finally {
    Math.random = restore;
  }
}

function sweep(level, collectDiag = false) {
  offsidePenalty = level ? level.fn : null;
  skipOffside = !!level?.skip;
  preferOnside = !!level?.prefer;
  diag = collectDiag ? newDiag() : null;
  const agg = {
    offsides: 0, crosses: 0, passes: 0, through: 0,
    shots: 0, goals: 0, boxTouches: 0, corners: 0,
  };
  const scores = [];
  for (const seed of seeds) {
    const r = runMatch(seed);
    scores.push(r.score);
    for (const k of Object.keys(agg)) agg[k] += r[k];
  }
  offsidePenalty = null;
  skipOffside = false;
  preferOnside = false;
  const perMatch = (n) => Number((n / matches).toFixed(2));
  const perTeam = (n) => Number((n / matches / 2).toFixed(2));
  return {
    scores,
    越位_队场: perTeam(agg.offsides),
    传中_场: perMatch(agg.crosses),
    传中占比pct: Number(((agg.crosses / Math.max(1, agg.passes)) * 100).toFixed(2)),
    直塞_场: perMatch(agg.through),
    射门_队场: perTeam(agg.shots),
    进球_场: perMatch(agg.goals),
    角球_场: perMatch(agg.corners),
    禁区触球_队场: perTeam(agg.boxTouches),
  };
}

console.log(`\n=== \`_bestCross\` 越位抑制标定曲线（${matches} 场，种子 ${seeds[0]}..）===`);
if (filter.length) {
  console.log(
    `档位过滤：${filter.join(",")} → 跑 ${activeLevels.length}/${LEVELS.length} 档` +
      `（被跳过的中间档此前已证明逐字与对照相同）`,
  );
}

// —— [0] 自检：未打补丁的原版基线 ——
const baseline = sweep(null);
const control = sweep(LEVELS[0], true);
const controlDiag = diag;
const faithful = baseline.scores.join(",") === control.scores.join(",");

console.log("\n[0] 复刻自检 —— 系数 1.00 是否与原版逐场同分：");
console.log({
  原版比分: baseline.scores.join(" "),
  "复刻@1.00": control.scores.join(" "),
  判定: faithful ? "✅ 一致，复刻忠实" : "❌ 不一致，整条曲线作废",
});
if (!faithful) {
  console.error("\n复刻的 `_bestCross` 与原版行为不同，标定无效。终止。");
  process.exit(1);
}

// —— [1] 曲线 ——
console.log("\n[1] 🔑 标定曲线（★ = 落进真实带）：");
const rows = [];
for (const level of activeLevels) {
  const r = level === LEVELS[0] ? control : sweep(level);
  rows.push({ 档位: level.label, ...r, scores: undefined });
  const off = r.越位_队场;
  const inBand = off >= 1.4 && off <= 2.1;
  const shareOk = r.传中占比pct >= CROSS_SHARE_GATE[0] && r.传中占比pct <= CROSS_SHARE_GATE[1];
  const shotOk = r.射门_队场 >= 11 && r.射门_队场 <= 15;
  console.log(
    `${inBand ? "★" : " "} ${level.label.padEnd(28)} ` +
      `越位 ${String(off).padStart(5)}/队场  ` +
      `传中 ${String(r.传中_场).padStart(6)}/场 (${r.传中占比pct}%${shareOk ? "" : " ⚠越护栏"})  ` +
      `射门 ${String(r.射门_队场).padStart(5)}/队场${shotOk ? "" : " ⚠"}  ` +
      `进球 ${String(r.进球_场).padStart(4)}/场  ` +
      `禁区触球 ${String(r.禁区触球_队场).padStart(6)}/队场  ` +
      `直塞 ${r.直塞_场}/场`
  );
}

console.log("\n[2] 🔑 候选构成 —— 乘性抑制到底有没有作用面（1.00 档采集）：");
{
  const d = controlDiag;
  const pct = (n) => `${((n / Math.max(1, d.calls)) * 100).toFixed(1)}%`;
  const sorted = d.ratios.slice().sort((p, q) => p - q);
  const q = (f) => (sorted.length ? Number(sorted[Math.floor((sorted.length - 1) * f)].toFixed(2)) : null);
  console.log({
    "_bestCross 调用数": d.calls,
    有候选: `${d.withCandidate}（${pct(d.withCandidate)}）`,
    含越位候选: `${d.withOffside}（${pct(d.withOffside)}）`,
    "★ 越位与非越位并存（唯一可翻盘的情形）": `${d.bothKinds}（${pct(d.bothKinds)}）`,
    "仅有越位候选（乘任何正系数都翻不动）": `${d.onlyOffside}（${pct(d.onlyOffside)}）`,
    最终选中越位者: `${d.winnerOffside}（${pct(d.winnerOffside)}）`,
    "并存时 越位最优/非越位最优 比值": sorted.length
      ? `中位 ${q(0.5)}、p90 ${q(0.9)}（>1 才需要抑制去翻）`
      : "无样本",
  });
}

console.log("\n[3] 真实参照（AGENTS.md v241 总表）：");
console.log({
  "越位 目标/带": `${REAL.offsidePerTeam}（1.4~2.1）`,
  "射门 真实": REAL.shotsPerTeam.join("~"),
  "禁区触球 真实": `${REAL.boxTouchesPerTeam}（20~30）`,
  "直塞 真实(双方合计尝试)": REAL.throughPerMatch,
  "传中占比 现有审计护栏": `${CROSS_SHARE_GATE[0]}~${CROSS_SHARE_GATE[1]}%`,
});

console.log("\n[4] 读法提醒：");
console.log(
  [
    "· 越位掉下来但传中占比跌破 3% → 撞现有审计护栏，不能直接采用。",
    "· 样本小时进球/角球波动大，看趋势不看单点；定案前用更多场次复跑。",
    "· 本探针只动 `_bestCross` 一处；若曲线全程压不到 1.4~2.1，说明剩余越位来自",
    "  普通传球路径（占 69.8%），需要另找杠杆而不是把这一处拧到 0。",
  ].join("\n")
);
