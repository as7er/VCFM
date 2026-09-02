/**
 * 标定曲线：关掉「越位球员抢飞行中的球」（路径 B）与「传给已越位队友」（路径 A），
 * 量它们各自与合并后的连带影响。
 *
 * 背景（AGENTS.md v241「越位判罚的路径分解」）：判罚 4.56 次/队/场，Opta 真实 1.70。
 * 分解结果：路径 A（预定接球人越位，`_think:1698`）2.31 次/队场；
 * 路径 B（越位球员**不是**传球目标却抢先拿到球，`_resolvePossession:5306`）2.25 次/队场。
 * 暴露量（3.3% 的传球有越位队友）与判定容差（越线中位 1.64m）**都已被证伪**，
 * 所以本探针不碰 `_clampOffside` 与 `tol`，只动这两条路径。
 *
 * **纯测量，不改仓库代码**，只在进程内包装两个方法：
 *
 *   路径 B（`peel*` 档）：在 `_resolvePossession` 执行期间，把处于 `b.offsideIds` 的
 *     球员临时置 `sentOff = true`，`finally` 里恢复。这样只影响 `engine.js:5252` 那一处
 *     控球候选筛选——语义正好是「越位球员知道自己越位，不去争这颗球」。
 *     ⚠ 已逐处核对：`_resolvePossession` 里其余读 `sentOff` 的地方（5054 / 5108 / 5157）
 *     都带 `o.team === b.kickTeam` 或 `o.team === owner.team` 前置守卫，越位球员必在
 *     `kickTeam`，本来就被跳过；5157 那段还要求存在 `owner`，而 `b.state === "pass"`
 *     期间 `owner` 为 null。所以这个临时标记**只作用于控球归属**，不掺别的。
 *     脚本另设一个反证计数器：统计标记期间 `_restart` 被调用的次数与队伍，
 *     确认没有让越位球员被排除在重启开球人之外（判罚重启给防守方，理应为 0 冲突）。
 *   路径 A（`hardA` 档）：包装 `_passCandidates`，把**已越位的候选整条剔掉**再返回。
 *     所有 `random()` 都在原方法内部消费完毕，过滤只发生在返回值上，
 *     **该次调用的随机数流与原版逐位一致**（下游因换了传球对象而分叉，是刻意的）。
 *     越位判定用与 `engine.js:2849` 完全相同的入参重算：
 *     `_isOffsidePosition(a.team, m, _offsideLineY(a.team), ball.y)`，纯几何、不消费随机数。
 *
 * ⚠ **本探针不含传中路径。** `_bestCross`（`engine.js:2654`）不经过 `_passCandidates`，
 * 且它的候选循环不看 `sentOff`，没有同样干净的接缝；那条路径已在负结果留档八单独量过
 * （硬禁 = 3.33 次/队场）。所以本表的档位是**普通传球 + 控球归属**两条，
 * 与传中硬禁可叠加但未在此合并测量。
 *
 * 自检：control 档必须与未打包装的引擎逐场同分（包装在无档位时是直通的，
 * 这条自检防的是笔误而不是模型偏差）。
 *
 * 口径与既有探针一致：种子 372000..、能力 15、标准档、0.1 秒步长。
 * 越位/射门/禁区触球按「每队每场」，传球/传中/直塞/进球按「合并双方每场」。
 * 采用任何档位之前必须跑 `node scripts/match-realism-audit.mjs 24`——
 * 本表的护栏列只是提前预警，不能替代那份审计。
 *
 * 用法：node scripts/_offside-path-fix-calibration-probe.mjs [场数]
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
    return { id: `${name}-p${i}`, name: `${name}-p${i}`, pos, number: i + 1, fitness: 100, attrs };
  });
  return {
    id: name,
    name,
    players,
    tactics: {
      formation: "4-3-3",
      lineup: players.map((p) => p.id),
      pressing: 3,
      tempo: 3,
      defensiveLine: 3,
    },
  };
}

// —— 真实参照值与现有护栏（AGENTS.md v241 总表 / match-realism-audit.mjs:362-370）——
const REAL = { offsidePerTeam: 1.7, band: [1.4, 2.1], shots: [11.9, 13.8], boxTouches: 26.1, through: 3.38 };
const GATE = { crossSharePct: [3, 14], passesPerMatch: [800, 1250], goalsPerMatch: [2.5, 3.3] };

const ORIG = {
  resolve: SimEngine.prototype._resolvePossession,
  cands: SimEngine.prototype._passCandidates,
  restart: SimEngine.prototype._restart,
};

/** 路径 B：'off' | 'nonTarget'（只拦非目标者） | 'all'（含预定接球人） */
let peel = "off";
/** 路径 A：true = 把已越位候选从 `_passCandidates` 的返回值里剔掉 */
let hardA = false;
/** 反证计数：临时标记生效期间 `_restart` 被调用了多少次、给了哪一方 */
let markDepth = 0;
let restartWhileMarked = { total: 0, toKickTeam: 0 };
SimEngine.prototype._resolvePossession = function _resolveProbe(...args) {
  if (peel === "off") return ORIG.resolve.apply(this, args);
  const b = this.ball;
  const flipped = [];
  if (b && b.state === "pass" && b.offsideIds instanceof Set && b.offsideIds.size) {
    for (const m of this.agents) {
      if (!b.offsideIds.has(m.id)) continue;
      if (peel === "nonTarget" && m.id === b.receiverId) continue;
      if (m.sentOff) continue; // 真的已离场：不要动，否则 finally 会把他"复活"
      m.sentOff = true;
      flipped.push(m);
    }
  }
  if (!flipped.length) return ORIG.resolve.apply(this, args);
  markDepth++;
  try {
    return ORIG.resolve.apply(this, args);
  } finally {
    markDepth--;
    for (const m of flipped) m.sentOff = false;
  }
};

SimEngine.prototype._restart = function _restartProbe(reason, team, ...rest) {
  if (markDepth > 0) {
    restartWhileMarked.total++;
    if (team === this.ball?.kickTeam) restartWhileMarked.toKickTeam++;
  }
  return ORIG.restart.call(this, reason, team, ...rest);
};

SimEngine.prototype._passCandidates = function _passCandidatesProbe(a) {
  const out = ORIG.cands.call(this, a);
  if (!hardA || !Array.isArray(out) || !out.length) return out;
  // 与 engine.js:2849 完全同样的入参；纯几何，不消费随机数。
  const lineY = this._offsideLineY(a.team);
  if (lineY == null) return out;
  const ballY = this.ball.y;
  return out.filter((c) => !this._isOffsidePosition(a.team, c.agent, lineY, ballY));
};

const matches = Math.max(1, Number(process.argv[2]) || 12);
const seeds = Array.from({ length: matches }, (_, i) => 372000 + i);

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
    const t = { offsides: 0, passes: 0, crosses: 0, through: 0, shots: 0, goals: 0, corners: 0, boxTouches: 0 };
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
const LEVELS = [
  { label: "control 现状", peel: "off", hardA: false },
  { label: "peelB 越位者不争飞行球", peel: "nonTarget", hardA: false },
  { label: "peelAll 含预定接球人", peel: "all", hardA: false },
  { label: "hardA 越位者不当传球目标", peel: "off", hardA: true },
  { label: "peelB + hardA 合并", peel: "nonTarget", hardA: true },
  { label: "peelAll + hardA 合并", peel: "all", hardA: true },
];

function sweep(level) {
  peel = level.peel;
  hardA = level.hardA;
  restartWhileMarked = { total: 0, toKickTeam: 0 };
  const agg = { offsides: 0, passes: 0, crosses: 0, through: 0, shots: 0, goals: 0, corners: 0, boxTouches: 0 };
  const scores = [];
  for (const seed of seeds) {
    const r = runMatch(seed);
    scores.push(r.score);
    for (const k of Object.keys(agg)) agg[k] += r[k];
  }
  peel = "off";
  hardA = false;
  const per = (n) => Number((n / matches).toFixed(2));
  const perTeam = (n) => Number((n / matches / 2).toFixed(2));
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
    restartWhileMarked: { ...restartWhileMarked },
  };
}

console.log(`\n=== 越位两条路径的修法标定（${matches} 场，种子 ${seeds[0]}..）===`);

// [0] 自检：control 必须与未打包装的引擎逐场同分
const savedResolve = SimEngine.prototype._resolvePossession;
const savedCands = SimEngine.prototype._passCandidates;
const savedRestart = SimEngine.prototype._restart;
SimEngine.prototype._resolvePossession = ORIG.resolve;
SimEngine.prototype._passCandidates = ORIG.cands;
SimEngine.prototype._restart = ORIG.restart;
const bare = seeds.map((s) => runMatch(s).score).join(" ");
SimEngine.prototype._resolvePossession = savedResolve;
SimEngine.prototype._passCandidates = savedCands;
SimEngine.prototype._restart = savedRestart;
const control = sweep(LEVELS[0]);
const faithful = bare === control.scores.join(" ");
console.log("\n[0] 包装自检 —— control 档必须与未打包装的引擎逐场同分：");
console.log({ 未打包装: bare, "control": control.scores.join(" "), 判定: faithful ? "✅ 一致" : "❌ 不一致，整表作废" });
if (!faithful) process.exit(1);
console.log("\n[1] 🔑 标定曲线（★ = 越位落进 1.4~2.1，⚠ = 撞现有审计护栏）：");
const rows = [];
for (const level of LEVELS) {
  const r = level === LEVELS[0] ? control : sweep(level);
  rows.push({ label: level.label, peel: level.peel, ...r });
  const inBand = r.越位 >= REAL.band[0] && r.越位 <= REAL.band[1];
  const warn = [];
  if (r.传中占比 < GATE.crossSharePct[0] || r.传中占比 > GATE.crossSharePct[1]) warn.push("传中占比");
  if (r.传球 < GATE.passesPerMatch[0] || r.传球 > GATE.passesPerMatch[1]) warn.push("传球量");
  if (r.进球 < GATE.goalsPerMatch[0] || r.进球 > GATE.goalsPerMatch[1]) warn.push("进球");
  if (r.射门 < REAL.shots[0] || r.射门 > REAL.shots[1]) warn.push("射门离真实带");
  console.log(
    `${inBand ? "★" : " "} ${level.label.padEnd(26)} ` +
      `越位 ${String(r.越位).padStart(5)}/队场  ` +
      `传球 ${String(r.传球).padStart(7)}/场  ` +
      `传中 ${String(r.传中占比).padStart(5)}%  ` +
      `射门 ${String(r.射门).padStart(5)}/队场  ` +
      `进球 ${String(r.进球).padStart(4)}/场  ` +
      `禁区触球 ${String(r.禁区触球).padStart(6)}/队场  ` +
      `直塞 ${String(r.直塞).padStart(4)}/场` +
      (warn.length ? `  ⚠${warn.join("/")}` : "")
  );
}

console.log("\n[2] 反证：临时 `sentOff` 标记期间 `_restart` 的调用（应为 0 冲突）：");
for (const r of rows) {
  if (r.peel === "off" && !r.restartWhileMarked.total) continue;
  console.log(
    `  ${r.label.padEnd(26)} 标记期间重启 ${r.restartWhileMarked.total} 次，` +
      `其中判给出球方 ${r.restartWhileMarked.toKickTeam} 次` +
      (r.restartWhileMarked.toKickTeam ? "  ⚠ 需核查开球人是否被误排除" : "  ✅ 无冲突")
  );
}

console.log("\n[3] 真实参照与护栏：");
console.log({
  "越位 目标/带": `${REAL.offsidePerTeam}（${REAL.band.join("~")}）`,
  "射门 真实/队场": REAL.shots.join("~"),
  "禁区触球 真实/队场": `${REAL.boxTouches}（20~30）`,
  "直塞 真实/场(双方合计尝试)": REAL.through,
  "护栏 传中占比": `${GATE.crossSharePct.join("~")}%`,
  "护栏 传球/场": GATE.passesPerMatch.join("~"),
  "护栏 进球/场": GATE.goalsPerMatch.join("~"),
});

console.log("\n[4] 读法：");
console.log(
  [
    "· 本表不含传中路径（`_bestCross` 无干净接缝，见文件头）。传中硬禁单独测得 3.33 次/队场，",
    "  与本表档位理论上可叠加，但**没有实测合并值**，不要把两个降幅相加当结论。",
    "· 越位进带不等于可采用：必须再跑 `node scripts/match-realism-audit.mjs 24`",
    "  与 `node scripts/box-possession-sampling-audit.mjs`，那两份才是护栏本体。",
    "· `peelAll` 只是对照——路径 A 在 `_think:1698` 就吹了，不经过控球归属，",
    "  所以 peelAll 与 peelB 的差值反映的是「预定接球人抢到球」那一小部分，不是路径 A 的全部。",
  ].join("\n")
);




