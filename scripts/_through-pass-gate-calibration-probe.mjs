/**
 * 标定曲线：放开**传球决策侧**的直塞两道门槛，量直塞量与越位的连带影响。
 *
 * 背景（AGENTS.md「🔜 下一个杠杆在传球决策侧」）：`release{R}` 那一档已经证明了机制
 * ——允许把防线身后当跑位目标，`boxSeconds` −57%、禁区触球 −61%、均速 +35%，而进球
 * 2.67 仍在护栏内。**但越位被打到 24~37 倍**（40~63 次/队场 vs 真实 1.70），
 * `peelB`+`hardA` 那 2.5 次/队场的下调预算在那个量级前毫无意义，所以 R=4/R=8 都不可用。
 *
 * 那一档动的是**跑位目标**。传球飞行段本来就自由（`engine.js:1721` 对预定接球人有更早
 * 的提前返回，不经过 `_clampOffside`），所以缺的不是「能不能跑到身后」，
 * 而是**「把球打到身后」这个决定**。本探针只动决定，不动跑位——
 * 预期它抬直塞的效率远高于抬越位，因为直塞是**被门槛挡住的意图**，
 * 而 `release{R}` 的越位爆炸来自「一大批人常驻越位位置」。
 *
 * 两道门槛（都在 `_passCandidates` 的直塞分支里，`engine.js:2932-2953`）：
 *   `advance > 0.35`  第 2 门（`:2934`）。`advance = (myProg - mProg)/40`，
 *                     所以 0.35 要求接球人比持球者近门 **14 场地单位**。
 *                     AGENTS.md 实测这一门独立通过率只有 **6.9%**。
 *   `okOffside`       落点上限（`:2943-2945`）。直塞落点 `leadY` 被要求不超过越位线
 *                     **2 单位**。而 `leadY = ty + dir*(6 + rand*4)`，即身前 6~10 单位
 *                     ——**这两个数天生打架**：想把球送到身前 6~10 单位，又不许越过
 *                     越位线 2 单位以上，只有接球人本身深深落后于越位线时才可能同时满足。
 *
 * 档位（单因素 + 合并，一次只动一个数，留档二的教训）：
 *   advance25 / advance15   0.35 → 0.25 / 0.15（近门 10 / 6 单位）
 *   offTol4   / offTol6     落点容差 2 → 4 / 6 单位
 *   combined                advance15 + offTol6（最激进）
 *
 * ⚠ **RNG 纪律与既有探针不同，这一条必须说清楚。**
 * `_final-third-movement-...` 那支能做到「逐 tick random() 调用次数与原版逐位相同」，
 * 因为它只在原方法跑完之后覆写 `tx/ty`。**本探针做不到，而且不可能做到**：
 * 门槛就在 `&&` 短路链里、紧挨着 `this.random() < throughIntent`，放宽门槛必然让
 * 更多候选走到那次掷骰，**random() 的消费次数一定改变，轨迹从第一次分叉起完全不同**。
 * 这不是缺陷，是任何真实行为改动的必然结果（`box-defending-audit` 里
 * 「任何动引擎的改动同样会从第一次死球起换轨迹」说的是同一件事）。
 * 因此：
 *   · **做法是把 `_passCandidates` 逐字复制过来、只把那两个字面量参数化**，
 *     而不是事后重算——事后重算会漏掉 `throughIntent` 那次掷骰，
 *     等于让实验档以 100% 意图触发，系统性高估自己。
 *   · **自检 [0] 就是这份复制的保真证明**：control 档（0.35 / 2）必须与未打包装的
 *     引擎**逐场同分**。不同分说明复制走样，整表作废。
 *   · 档位之间**不能**按窗口内标准误比较；判读看方向与量级，结论要换种子窗口复核。
 *
 * 口径与既有探针一致：种子 372000..、能力 15、标准档、0.1s 步长、`club()` 逐字相同，
 * 因此可直接与那支的 control 比（越位 4.54 / boxSeconds 1092 / 进球 2.92 / 直塞 0.75）。
 *
 * ⚠ 任何档位在采用前必须另跑 `node scripts/match-realism-audit.mjs 24`
 * 与 `node scripts/box-defending-audit.mjs`（本表不测它们）。
 *
 * 用法：node scripts/_through-pass-gate-calibration-probe.mjs [场数=6] [起始种子=372000] [档位=全部]
 *   例：… 24 372000 advance15,advance20              # 只跑 control + 两个候选档，24 场
 *   例：… 24 372000 advance20,advance25 background  # 扫后台档（0.3s 步长，快 3 倍）
 */
import { SimEngine, SIM } from "../js/sim/engine.js";

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
    return { name: `${name}${i}`, pos, id: `${name}_${i}`, attrs };
  });
  return {
    id: name,
    name,
    players,
    tactics: { formation: "4-3-3", lineup: players.map((p) => p.id), pressing: 3, tempo: 3, defensiveLine: 3 },
  };
}

// engine.js 的模块私有工具，逐字照抄（:130-137）
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

// —— 真实参照值与现有护栏（与 _final-third-movement-... 逐字相同）——
const REAL = { offsideBand: [1.4, 2.1], offsideTarget: 1.7, shots: [11.9, 13.8], boxTouches: 26.1, through: 3.38 };
const GATE = { goals: [2.5, 3.3], passes: [800, 1250], crossSharePct: [3, 14], boxSecondsCeiling: 1200 };

const ORIG = { passCandidates: SimEngine.prototype._passCandidates };

/** 当前档位：control 必须是引擎里的原值 0.35 / 2 */
const V = { advanceGate: 0.35, offsideTol: 2 };

/** 直塞分支实际被放行的次数，用来证明档位真的作用了（不是惰性档） */
let applied = { throughMarked: 0, gate2Passed: 0 };

/**
 * `_passCandidates` 的逐字复制（engine.js:2845-2958），**只有两处不同**：
 *   1. `advance > 0.35`      → `advance > V.advanceGate`
 *   2. `offY ± 2`（okOffside）→ `offY ± V.offsideTol`
 * 其余每一行、每一次 `this.random()`、每一个系数都与原方法一致——
 * 自检 [0] 靠的就是这个（control 档 V=0.35/2 时必须与未打包装的引擎逐场同分）。
 *
 * ⛔ 改这份复制之前先 diff 一遍上游：
 *      git diff HEAD -- js/sim/engine.js | grep -A40 _passCandidates
 *    上游动了而这里没跟，自检会立刻报不一致（这正是自检存在的理由）。
 */
SimEngine.prototype._passCandidates = function _passCandidates(a) {
  const dir = this.attackDir(a.team);
  const goalY = this.targetGoalY(a.team);
  const offY = this._offsideLineY(a.team);
  const holderPressure = this._pressureOn(a);
  const out = [];
  for (const m of this.agents) {
    if (m === a || m.team !== a.team || m.sentOff) continue;
    const d = dist(a.x, a.y, m.x, m.y);
    if (m.role === "GK") {
      const inOwnBuildZone = a.team === "home" ? a.y >= 66 : a.y <= 34;
      const canRecycleToKeeper =
        inOwnBuildZone &&
        holderPressure >= 0.68 &&
        (a.role === "DEF" || a.detailedPosition === "DM") &&
        d >= 6 &&
        d <= 32;
      if (!canRecycleToKeeper) continue;
      const safety = this._laneSafety(a, m, m.x, m.y);
      const distanceWeight = clamp(1 - d / 40, 0.25, 1);
      const value =
        (0.13 + holderPressure * 0.22) *
        safety *
        distanceWeight *
        (0.82 + (a.attr.decisions || 0.55) * 0.18);
      out.push({ agent: m, value, through: false, backpass: true, tx: m.x, ty: m.y });
      continue;
    }
    if (d < 6 || d > 45) continue;
    const nominalSpeed = clamp(18 + d * 0.7, 18, 42) * (0.85 + 0.15 * a.attr.passing);
    const eta = clamp(d / Math.max(1, nominalSpeed), 0.2, 1.35);
    let tx = clamp(m.x + (m.vx || 0) * eta, 3, 97);
    let ty = clamp(m.y + (m.vy || 0) * eta, 3, 97);
    const myProg = Math.abs(a.y - goalY);
    const mProg = Math.abs(m.y - goalY);
    const advance = clamp((myProg - mProg) / 40, -0.5, 1);
    const safety = this._laneSafety(a, m, tx, ty);
    const distPen = clamp(1 - d / 55, 0.2, 1);
    const coreBoost = m.isCore ? 1.65 : 1;
    let value = (0.35 + advance) * safety * distPen * coreBoost;

    const directReturn =
      this.ball.lastPasserId === m.id &&
      this.ball.lastPassTeam === a.team &&
      this.t - (this.ball.lastPassAt || 0) < 8.5;
    if (directReturn) {
      value *= this._hasHabit(a, "plays_one_twos")
        ? 0.38 + holderPressure * 0.12
        : 0.02 + holderPressure * 0.05;
      value *= 1 + Math.max(0, this._roleBehavior(a, "support")) * 0.35;
    } else if (Math.abs(m.x - a.x) > 18) {
      value *= this._hasHabit(a, "switches_play") ? 1.28 : 1.08;
    }

    if (this._isOffsidePosition(a.team, m, offY, this.ball.y)) {
      value *= 0.16 + (1 - a.attr.vision) * 0.34;
    }

    let through = false;
    const aheadOfBall = (m.y - a.y) * dir > 4;
    const lineGap = offY == null ? Infinity : Math.abs(m.y - offY);
    const receiverGoalDist = Math.abs(m.y - goalY);
    const throughIntent = clamp(
      0.34 +
        a.attr.vision * 0.24 +
        (a.attr.decisions || 0.55) * 0.1 +
        (this._hasHabit(a, "tries_through_balls") ? 0.2 : 0) +
        this._roleBehavior(a, "passRisk") * 0.12 -
        holderPressure * 0.12,
      0.2,
      0.82
    );
    if (
      aheadOfBall &&
      advance > V.advanceGate && // ★ 杠杆 1（原值 0.35）
      lineGap < 11 &&
      receiverGoalDist < 44 &&
      safety > 0.28 &&
      this.random() < throughIntent &&
      this.t >= (this._teamThroughUntil[a.team] || 0)
    ) {
      applied.gate2Passed++;
      const leadY = clamp(ty + dir * (6 + this.random() * 4), 3, 97);
      const okOffside =
        offY == null ||
        (a.team === "home"
          ? leadY >= offY - V.offsideTol // ★ 杠杆 2（原值 2）
          : leadY <= offY + V.offsideTol);
      if (okOffside) {
        applied.throughMarked++;
        through = true;
        value *= (this._hasHabit(a, "tries_through_balls") ? 0.9 : 0.72) *
          (1 + this._roleBehavior(a, "passRisk") * 0.22);
        ty = leadY;
        tx = clamp(tx + (50 - tx) * 0.1, 3, 97);
      }
    }
    out.push({ agent: m, value, through, tx, ty });
  }
  out.sort((p, q) => q.value - p.value);
  return out;
};

// 第四参数 = 模拟档（standard | background）。
// **必须能扫后台档**：advance15 在标准档全绿，却把后台档的进球顶到 3.46（护栏顶 3.3，
// 干净引擎同口径 2.88）。后台档 0.3s 步长 + 4 趟分离，对「往防线身后送球」这种
// 事件的解算更粗，直塞成得更多（3.21 vs 标准档 2.79）、转化率更高（11.4% vs 9.4%）。
// 生涯里其余联赛比赛全部走后台档，所以它才是这条杠杆真正的约束面。
const PROFILE = (process.argv[5] || "standard") === "background" ? "background" : "standard";
const STEP = PROFILE === "background" ? 0.3 : SIM.DT;

const matches = Math.max(1, Number(process.argv[2]) || 6);
// 第二参数 = 起始种子。换窗口是本探针唯一可靠的噪声估计手段（窗口内标准误不适用，
// 见文件头的 RNG 说明），所以复核候选档时务必换一个窗口重跑。
const seedBase = Number(process.argv[3]) || 372000;
const seeds = Array.from({ length: matches }, (_, i) => seedBase + i);

function runMatch(seed) {
  const restore = Math.random;
  Math.random = seededRandom(seed);
  try {
    const eng = new SimEngine(club(`h${seed}`, 15), club(`a${seed}`, 15), {
      simulationProfile: PROFILE,
      timeStep: STEP,
      separationPasses: PROFILE === "background" ? 4 : 8,
    });
    const steps = Math.round((90 * 60) / STEP);
    const t = {
      offsides: 0, passes: 0, crosses: 0, through: 0, shots: 0, goals: 0,
      corners: 0, boxTouches: 0, boxSeconds: 0, finalThirdSeconds: 0,
    };
    for (let s = 0; s < steps; s++) {
      eng.step(STEP);

      // boxSeconds / finalThirdSeconds：与 _final-third-movement-... 逐字同口径。
      // 后者是前者的分母——放开门槛会造成更多越位停顿，不归一化的话 boxSeconds
      // 下降可能只是「球被判罚拿走了」的假象。
      const b = eng.ball;
      const owner = b.owner ? eng.agentById(b.owner) : null;
      const defendingTeam = eng._inOwnFoulBox("home", b.x, b.y)
        ? "home"
        : eng._inOwnFoulBox("away", b.x, b.y)
          ? "away"
          : null;
      if (
        owner && defendingTeam && owner.team !== defendingTeam &&
        (b.state === "held" || b.state === "control")
      ) {
        t.boxSeconds += STEP;
      }
      const attTeam = eng.possession;
      if (attTeam === "home" || attTeam === "away") {
        const ownGoalY = attTeam === "home" ? SIM.HOME_GOAL_Y : SIM.AWAY_GOAL_Y;
        if (Math.abs(b.y - ownGoalY) / 100 > 0.64) t.finalThirdSeconds += STEP;
      }
    }
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


const ALL_LEVELS = [
  { key: "control", label: "control 现状", set: {} },
  { key: "advance25", label: "advance25（0.35→0.25）", set: { advanceGate: 0.25 } },
  { key: "advance20", label: "advance20（0.35→0.20）", set: { advanceGate: 0.20 } },
  { key: "advance15", label: "advance15（0.35→0.15）", set: { advanceGate: 0.15 } },
  { key: "offTol4", label: "offTol4（落点容差 2→4）", set: { offsideTol: 4 } },
  { key: "offTol6", label: "offTol6（落点容差 2→6）", set: { offsideTol: 6 } },
  { key: "combined", label: "combined（15 + 6）", set: { advanceGate: 0.15, offsideTol: 6 } },
];

// 第三参数 = 逗号分隔的档位 key，用来做「少档位 × 高场数」的聚焦复核。
// 进球那一列在 6 场下窗口间摆动 ±1.3（护栏宽度只有 0.8），只能靠加场数解决，
// 而全 7 档 × 24 场太贵——所以要能只跑 control 与候选档。
// control 必须在列表里：自检与所有对比都以它为基准。
const wanted = (process.argv[4] || "").split(",").map((x) => x.trim()).filter(Boolean);
const LEVELS = wanted.length
  ? ALL_LEVELS.filter((l) => l.key === "control" || wanted.includes(l.key))
  : ALL_LEVELS;
if (wanted.length) {
  const unknown = wanted.filter((w) => !ALL_LEVELS.some((l) => l.key === w));
  if (unknown.length) {
    console.error(`未知档位：${unknown.join(", ")}；可选：${ALL_LEVELS.map((l) => l.key).join(", ")}`);
    process.exit(1);
  }
}

function sweep(level) {
  V.advanceGate = level.set.advanceGate ?? 0.35;
  V.offsideTol = level.set.offsideTol ?? 2;
  applied = { throughMarked: 0, gate2Passed: 0 };
  const agg = {
    offsides: 0, passes: 0, crosses: 0, through: 0, shots: 0, goals: 0,
    corners: 0, boxTouches: 0, boxSeconds: 0, finalThirdSeconds: 0,
  };
  const scores = [];
  for (const seed of seeds) {
    const r = runMatch(seed);
    scores.push(r.score);
    for (const k of Object.keys(agg)) agg[k] += r[k];
  }
  V.advanceGate = 0.35;
  V.offsideTol = 2;
  const per = (n) => Number((n / matches).toFixed(2));
  const perTeam = (n) => Number((n / matches / 2).toFixed(2));
  const share = (n, d) => Number(((n / Math.max(1, d)) * 100).toFixed(1));
  return {
    scores,
    越位: perTeam(agg.offsides),
    传球: per(agg.passes),
    传中占比: Number(((agg.crosses / Math.max(1, agg.passes)) * 100).toFixed(2)),
    射门: perTeam(agg.shots),
    进球: per(agg.goals),
    角球: per(agg.corners),
    禁区触球: perTeam(agg.boxTouches),
    直塞: per(agg.through),
    boxSeconds: per(agg.boxSeconds),
    最后三区秒: per(agg.finalThirdSeconds),
    "boxSec占最后三区%": share(agg.boxSeconds, agg.finalThirdSeconds),
    applied: { ...applied },
  };
}

console.log(`\n=== 直塞门槛标定曲线（${matches} 场，种子 ${seeds[0]}..${seeds[seeds.length - 1]}）===`);

// [0] 自检：这份 `_passCandidates` 复制的保真证明。
// control 档（V=0.35/2）必须与未打包装的引擎逐场同分——不同分说明复制走样，整表作废。
const patched = SimEngine.prototype._passCandidates;
SimEngine.prototype._passCandidates = ORIG.passCandidates;
const bare = seeds.map((s) => runMatch(s).score).join(" ");
SimEngine.prototype._passCandidates = patched;
const control = sweep(LEVELS[0]);
const faithful = bare === control.scores.join(" ");
console.log("\n[0] 复制保真自检 —— control 必须与未打包装的引擎逐场同分：");
console.log({ 未打包装: bare, control: control.scores.join(" "), 判定: faithful ? "✅ 一致" : "❌ 不一致，整表作废" });
if (!faithful) process.exit(1);

console.log("\n[1] 🔑 标定曲线（★ = 越位落进 1.4~2.1，⚠ = 撞护栏）：");
const rows = [];
for (const level of LEVELS) {
  const r = level === LEVELS[0] ? control : sweep(level);
  rows.push({ label: level.label, ...r });
  const inBand = r.越位 >= REAL.offsideBand[0] && r.越位 <= REAL.offsideBand[1];
  const warn = [];
  if (r.进球 < GATE.goals[0] || r.进球 > GATE.goals[1]) warn.push("进球");
  if (r.传球 < GATE.passes[0] || r.传球 > GATE.passes[1]) warn.push("传球量");
  if (r.传中占比 < GATE.crossSharePct[0] || r.传中占比 > GATE.crossSharePct[1]) warn.push("传中占比");
  if (r.boxSeconds > GATE.boxSecondsCeiling) warn.push("boxSeconds");
  if (r.射门 < REAL.shots[0] || r.射门 > REAL.shots[1]) warn.push("射门离真实带");
  console.log(
    `${inBand ? "★" : " "} ${level.label.padEnd(22)} ` +
      `越位 ${String(r.越位).padStart(6)}  ` +
      `直塞 ${String(r.直塞).padStart(5)}  ` +
      `进球 ${String(r.进球).padStart(4)}  ` +
      `射门 ${String(r.射门).padStart(5)}  ` +
      `传球 ${String(r.传球).padStart(7)}  ` +
      `传中 ${String(r.传中占比).padStart(5)}%  ` +
      `禁区触球 ${String(r.禁区触球).padStart(6)}  ` +
      `boxSec ${String(r.boxSeconds).padStart(7)}` +
      (warn.length ? `  ⚠${warn.join("/")}` : "")
  );
}

console.log("\n[2] 档位是否真的作用了（直塞分支放行计数；惰性档在这里会露出来）：");
for (const r of rows) {
  console.log(
    `  ${r.label.padEnd(22)} 第2门通过 ${String(r.applied.gate2Passed).padStart(7)}  ` +
      `落点也过（标记直塞）${String(r.applied.throughMarked).padStart(7)}  ` +
      `落点通过率 ${String(
        Number(((r.applied.throughMarked / Math.max(1, r.applied.gate2Passed)) * 100).toFixed(1))
      ).padStart(5)}%  ` +
      `最后三区 ${String(r.最后三区秒).padStart(7)}s  ` +
      `boxSec占比 ${String(r["boxSec占最后三区%"]).padStart(5)}%`
  );
}

console.log("\n[3] 真实参照与护栏：");
console.log(`  越位 真实 ${REAL.offsideTarget}（带 ${REAL.offsideBand.join("~")}），现状 4.54，peelB+hardA 可下调到 2.04`);
console.log(`  直塞 真实 ${REAL.through}，现状 0.75  ← 本探针要抬的就是这一列`);
console.log(`  进球护栏 ${GATE.goals.join("~")}；射门真实带 ${REAL.shots.join("~")}；传中占比 ${GATE.crossSharePct.join("~")}%`);
console.log(`  禁区触球 真实 ${REAL.boxTouches}；boxSeconds 上限 ${GATE.boxSecondsCeiling}（基线约 1092）`);
console.log("\n⚠ 判读顺序：先看「直塞」与「越位」两列的**比值**——直塞抬得多、越位抬得少才有配平余地。");
console.log("⚠ 档位间不可按窗口内标准误比较（RNG 轨迹必然分叉，见文件头）；候选档要换种子窗口复核。");
