/**
 * 诊断（决定「快速通路」从哪一端建）：直塞每场只有 0.63 次，是**没有接球人**还是**不愿意传**。
 *
 * 背景：
 *   · `match-realism-audit.mjs 24` 实测直塞 **0.63 次/场**、占传球 0.1%，而该脚本自己的
 *     断言区间是 `>= 0.5 && <= 12`（`match-realism-audit.mjs:368`）——引擎跑在自己
 *     容许下限的边缘。同时传中 74.42 次/场，直塞:传中 ≈ 1:118。
 *   · 用户从 2D 画面独立指出「前场组织核心/进攻中场经常传直塞给前锋或跑位出色的内锋」，
 *     与上面的标定数据同向。直塞正是留档七所说「缺失的快速进攻通路」的典型形态。
 *   · 停滞探针（`_player-stillness-probe.mjs`）结论：96.3% 的近静止球员已站在自己目标点上，
 *     `_attackPlan` 不派纵深跑位。若成立，直塞会因**无接球人**而无法生成——
 *     两头互锁，放开传球权重也不会有效果。
 *
 * 所以本探针量的是**逐门淘汰率**，回答一个二选一：
 *   甲「无人插上」：卡在几何门（接球人不在越位线后方的窄带里）→ 杠杆在 `_attackPlan`。
 *   乙「不愿意传」：几何门常过，卡在意愿/冷却/权重 → 杠杆在 `_passCandidates` / `_think`。
 *
 * **这是纯测量，不改引擎。** 全程只读引擎公开状态与纯几何私有方法
 * （`_offsideLineY` / `_pressureOn` / `_laneSafety` 均不消费随机数，已逐个确认），
 * 同种子下开关本脚本不改变比分。`_` 前缀按仓库惯例表示诊断脚本，不进 `verify.mjs`。
 *
 * 口径与 `_box-entry-rate-probe` / `_box-carry-entry-probe` / `_player-stillness-probe` 一致：
 * 同种子 372000..372005、能力 15、标准档、0.1 秒步长。
 *
 * 口径限制（读结论前必须知道）：
 *   · 统计单位是「`_passCandidates` 的一次调用 × 一名队友」，不是「一次传球」。
 *     同一 tick 可能被调用多次（`_bestPass` 与 `_think` 各一次），分母因此偏大；
 *     可比较的是**各门之间的相对淘汰率**，不是绝对次数。
 *   · 第 6 门 `random() < throughIntent` 与 `okOffside` 里的 `random()*4` 是随机的。
 *     本探针**不实际抽样**（那会污染 RNG 流、改变比分），改为记录 intent 分布并按
 *     区间判定 okOffside 为「必过 / 可能过 / 必不过」。
 *   · 越位线 `offY` 为 null（防守方不足 2 人）时 `lineGap = Infinity`，该门必不过，单独计数。
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
      style: "balanced",
    },
  };
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
const METRES_X = SIM.PITCH_W_METRES / SIM.FIELD_W;
const METRES_Y = SIM.PITCH_H_METRES / SIM.FIELD_H;

const median = (values) => {
  if (!values.length) return 0;
  const s = [...values].sort((x, y) => x - y);
  const m = s.length >> 1;
  return Number((s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2).toFixed(2));
};
const pct = (num, den) => Number(((num / Math.max(1, den)) * 100).toFixed(1));
const quantile = (values, q) => {
  if (!values.length) return 0;
  const s = [...values].sort((x, y) => x - y);
  return Number(s[Math.min(s.length - 1, Math.floor(s.length * q))].toFixed(2));
};

const matchCount = Math.max(1, Number(process.argv[2]) || 6);
const seeds = Array.from({ length: matchCount }, (_, i) => 372000 + i);
const timeStep = SIM.DT;

// 门的顺序与 engine.js:2869-2876 逐字一致（短路求值，首个失败者被记账）
const GATES = [
  "1_aheadOfBall(>4)",
  "2_advance(>0.35)",
  "3_lineGap(<11)",
  "4_receiverGoalDist(<44)",
  "5_safety(>0.28)",
  "6_randomIntent",
  "7_teamCooldown(3.2s)",
  "8_okOffside",
];
// 顺序淘汰：每对(调用×队友)只在首个失败的门上记一次
const firstFail = new Map(GATES.map((g) => [g, 0]));
// 独立通过率：每道门单独看，不受前面门影响
const soloPass = new Map(GATES.map((g) => [g, 0]));
let pairsConsidered = 0;   // 过了距离预筛(6~45)的非门将队友
let pairsPrefiltered = 0;  // 被距离预筛掉的
let pairsAllGatesPass = 0; // 八门全过（第6门按 intent 期望计，见报告说明）

// 「有没有人插上」——按一次决策（一次 _passCandidates 调用）统计
const decisions = { n: 0, anyGeometric: 0, anyFull: 0, cooldownBlocked: 0 };

// 卡在 lineGap 的接球人画像：区分「没插上」与「已越位」
const lineGapDetail = { tooDeep: 0, offside: 0, noOffsideLine: 0, values: [] };
// advance 分布（第 2 门的严苛程度）
const advanceValues = [];
const advanceOfAheadOnly = []; // 只看已过第 1 门的
// intent 分布（第 6 门的期望通过率）
const intentValues = [];
// okOffside 区间判定
const offsideBand = { always: 0, sometimes: 0, never: 0 };
// 实际发生的直塞（与 match-realism-audit 的 0.63 对账）
let actualThroughPasses = 0;
let actualCrossThroughPasses = 0;
let actualPasses = 0;

const bump = (map, key) => map.set(key, (map.get(key) || 0) + 1);

/**
 * 复算 engine.js:2782-2890 的确定性部分，对一次 _passCandidates(a) 调用做逐门记账。
 * 必须在原方法**执行前**调用：原方法会消费随机数，之后 agent 状态不变但 _teamThroughUntil 可能被写。
 */
function auditCall(engine, a) {
  const dir = engine.attackDir(a.team);
  const goalY = engine.targetGoalY(a.team);
  const offY = engine._offsideLineY(a.team);
  const holderPressure = engine._pressureOn(a);
  const cooldownOpen = engine.t >= (engine._teamThroughUntil[a.team] || 0);

  decisions.n++;
  if (!cooldownOpen) decisions.cooldownBlocked++;
  let sawGeometric = false;
  let sawFull = false;

  for (const m of engine.agents) {
    if (m === a || m.team !== a.team || m.sentOff) continue;
    if (m.role === "GK") continue; // 门将走 backpass 分支，永不为直塞
    const d = dist(a.x, a.y, m.x, m.y);
    if (d < 6 || d > 45) {
      pairsPrefiltered++;
      continue;
    }
    pairsConsidered++;

    // —— 与引擎逐字一致的确定性量 ——
    const nominalSpeed = clamp(18 + d * 0.7, 18, 42) * (0.85 + 0.15 * a.attr.passing);
    const eta = clamp(d / Math.max(1, nominalSpeed), 0.2, 1.35);
    const tx = clamp(m.x + (m.vx || 0) * eta, 3, 97);
    const ty = clamp(m.y + (m.vy || 0) * eta, 3, 97);
    const myProg = Math.abs(a.y - goalY);
    const mProg = Math.abs(m.y - goalY);
    const advance = clamp((myProg - mProg) / 40, -0.5, 1);
    const safety = engine._laneSafety(a, m, tx, ty);

    const aheadOfBall = (m.y - a.y) * dir > 4;
    const lineGap = offY == null ? Infinity : Math.abs(m.y - offY);
    const receiverGoalDist = Math.abs(m.y - goalY);
    const throughIntent = clamp(
      0.34 +
        a.attr.vision * 0.24 +
        (a.attr.decisions || 0.55) * 0.1 +
        (engine._hasHabit(a, "tries_through_balls") ? 0.2 : 0) +
        engine._roleBehavior(a, "passRisk") * 0.12 -
        holderPressure * 0.12,
      0.2,
      0.82
    );

    // okOffside 区间判定：leadY = clamp(ty + dir*(6+rand*4), 3, 97)，rand∈[0,1)
    // 合法条件（展开 engine.js:2880-2882）：(leadY - offY) * dir <= 2
    let offsideVerdict = "always";
    if (offY != null) {
      const leadLo = clamp(ty + dir * 6, 3, 97);
      const leadHi = clamp(ty + dir * 10, 3, 97);
      const beyondLo = (leadLo - offY) * dir;
      const beyondHi = (leadHi - offY) * dir;
      const okLo = beyondLo <= 2;
      const okHi = beyondHi <= 2;
      offsideVerdict = okLo && okHi ? "always" : !okLo && !okHi ? "never" : "sometimes";
    }

    // —— 独立通过率 ——
    const checks = {
      "1_aheadOfBall(>4)": aheadOfBall,
      "2_advance(>0.35)": advance > 0.35,
      "3_lineGap(<11)": lineGap < 11,
      "4_receiverGoalDist(<44)": receiverGoalDist < 44,
      "5_safety(>0.28)": safety > 0.28,
      "6_randomIntent": null, // 随机，见 intentValues
      "7_teamCooldown(3.2s)": cooldownOpen,
      "8_okOffside": offsideVerdict !== "never",
    };
    for (const [gate, ok] of Object.entries(checks)) {
      if (ok === true) soloPass.set(gate, soloPass.get(gate) + 1);
    }

    advanceValues.push(advance);
    if (aheadOfBall) advanceOfAheadOnly.push(advance);

    // —— 顺序淘汰：记首个失败的门 ——
    let failed = null;
    if (!aheadOfBall) failed = "1_aheadOfBall(>4)";
    else if (!(advance > 0.35)) failed = "2_advance(>0.35)";
    else if (!(lineGap < 11)) {
      failed = "3_lineGap(<11)";
      if (offY == null) lineGapDetail.noOffsideLine++;
      else {
        lineGapDetail.values.push(lineGap);
        // beyondLine > 0 表示已在越位线前方（越位侧）
        const beyondLine = (m.y - offY) * dir;
        if (beyondLine > 0) lineGapDetail.offside++;
        else lineGapDetail.tooDeep++;
      }
    } else if (!(receiverGoalDist < 44)) failed = "4_receiverGoalDist(<44)";
    else if (!(safety > 0.28)) failed = "5_safety(>0.28)";
    else {
      // 前五门全过 → 这名队友是「几何可行的直塞接球人」
      sawGeometric = true;
      intentValues.push(throughIntent);
      if (offsideVerdict === "always") offsideBand.always++;
      else if (offsideVerdict === "sometimes") offsideBand.sometimes++;
      else offsideBand.never++;

      if (!cooldownOpen) failed = "7_teamCooldown(3.2s)";
      else if (offsideVerdict === "never") failed = "8_okOffside";
      else {
        pairsAllGatesPass++;
        sawFull = true;
      }
    }
    if (failed) firstFail.set(failed, firstFail.get(failed) + 1);
  }

  if (sawGeometric) decisions.anyGeometric++;
  if (sawFull) decisions.anyFull++;
}

/** 跑一场。instrument=false 时完全不插桩，用于决定性自检。 */
function runMatch(seed, instrument) {
  const original = Math.random;
  Math.random = seededRandom(seed);
  try {
    const engine = new SimEngine(
      makeClub(`home-${seed}`, 15),
      makeClub(`away-${seed}`, 15),
      { simulationProfile: "standard", timeStep, separationPasses: 8 }
    );

    if (instrument) {
      const originalCandidates = engine._passCandidates.bind(engine);
      engine._passCandidates = function wrapped(a) {
        // 必须在原方法前记账：原方法消费随机数，但读的是同一份状态
        auditCall(engine, a);
        return originalCandidates(a);
      };
    }

    const steps = Math.round((90 * 60) / timeStep);
    let eventCursor = 0;
    for (let step = 0; step < steps; step++) {
      engine.step(timeStep);
      if (!instrument) continue;
      for (; eventCursor < engine.events.length; eventCursor++) {
        const ev = engine.events[eventCursor];
        if (ev.type !== "pass") continue;
        actualPasses++;
        if (ev.through && !ev.cross) actualThroughPasses++;
        if (ev.through && ev.cross) actualCrossThroughPasses++;
      }
    }
    return { home: engine.score?.home ?? 0, away: engine.score?.away ?? 0 };
  } finally {
    Math.random = original;
  }
}

// —— 决定性自检：插桩不得改变比分 ——
const cleanScore = runMatch(seeds[0], false);
const instrumentedFirst = runMatch(seeds[0], true);
const deterministic =
  cleanScore.home === instrumentedFirst.home && cleanScore.away === instrumentedFirst.away;

for (const seed of seeds.slice(1)) runMatch(seed, true);
const matchesMeasured = seeds.length;

const perMatch = (n) => Number((n / matchesMeasured).toFixed(2));
const mapReport = (map, total) =>
  Object.fromEntries(
    [...map.entries()].map(([k, v]) => [k, `${v} (${pct(v, total)}%)`])
  );

console.log(
  `\n=== 直塞为什么只有 0.63 次/场：逐门淘汰率（${matchesMeasured} 场，种子 ${seeds[0]}..${seeds[seeds.length - 1]}）===`
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

console.log("\n[1] 与 match-realism-audit 对账 —— 确认量的是同一件事：");
console.log({
  "实际直塞(through && !cross)/场": perMatch(actualThroughPasses),
  "标定实测(24 场)": 0.63,
  "断言区间": "0.5 ~ 12",
  "传中式直塞(through && cross)/场": perMatch(actualCrossThroughPasses),
  "总传球/场": perMatch(actualPasses),
});

console.log("\n[2] 主结果 —— 顺序淘汰：每对(决策×队友)只在首个失败的门上记账");
console.log(`（分母 = 过了距离预筛 6~45 的候选对 ${pairsConsidered}，另有 ${pairsPrefiltered} 对被距离预筛掉）`);
console.log(mapReport(firstFail, pairsConsidered));
console.log({
  "八门全过(第6门按随机计,未含)": `${pairsAllGatesPass} (${pct(pairsAllGatesPass, pairsConsidered)}%)`,
});

console.log("\n[3] 独立通过率 —— 每道门单独看，不受前面门影响：");
console.log(mapReport(soloPass, pairsConsidered));

console.log("\n[4] 🔑 甲乙判定 —— 按「一次决策」看有没有人可传：");
console.log({
  决策次数: decisions.n,
  "有几何可行接球人(前5门全过)": `${decisions.anyGeometric} (${pct(decisions.anyGeometric, decisions.n)}%)`,
  "有完全可行接球人(含冷却/越位)": `${decisions.anyFull} (${pct(decisions.anyFull, decisions.n)}%)`,
  "被全队冷却挡住的决策": `${decisions.cooldownBlocked} (${pct(decisions.cooldownBlocked, decisions.n)}%)`,
});

console.log("\n[5] 卡在 lineGap(<11) 的接球人画像 —— 区分「没插上」与「已越位」：");
const lgTotal = lineGapDetail.tooDeep + lineGapDetail.offside;
console.log({
  "太靠后(在越位线后方 >11)": `${lineGapDetail.tooDeep} (${pct(lineGapDetail.tooDeep, lgTotal)}%)`,
  "已越位(在越位线前方)": `${lineGapDetail.offside} (${pct(lineGapDetail.offside, lgTotal)}%)`,
  无越位线: lineGapDetail.noOffsideLine,
  "lineGap 中位": median(lineGapDetail.values),
  p25: quantile(lineGapDetail.values, 0.25),
  p75: quantile(lineGapDetail.values, 0.75),
});

console.log("\n[6] advance(>0.35) 的严苛程度 —— 该门要求接球人比持球者近门约 14 单位(≈15m)：");
console.log({
  "全部候选 advance 中位": median(advanceValues),
  p75: quantile(advanceValues, 0.75),
  p90: quantile(advanceValues, 0.9),
  "仅已过第1门 advance 中位": median(advanceOfAheadOnly),
  "仅已过第1门 p75": quantile(advanceOfAheadOnly, 0.75),
});

console.log("\n[7] 第 6 门 randomIntent 的期望通过率（前5门全过者的 intent 分布）：");
console.log({
  样本数: intentValues.length,
  中位: median(intentValues),
  p25: quantile(intentValues, 0.25),
  p75: quantile(intentValues, 0.75),
  说明: "intent 即通过概率；中位 0.5 表示这道门期望淘汰一半",
});

console.log("\n[8] okOffside 区间判定（前5门全过者，leadY 前送 6~10 单位后是否仍合法）：");
const bandTotal = offsideBand.always + offsideBand.sometimes + offsideBand.never;
console.log({
  必过: `${offsideBand.always} (${pct(offsideBand.always, bandTotal)}%)`,
  可能过: `${offsideBand.sometimes} (${pct(offsideBand.sometimes, bandTotal)}%)`,
  必不过: `${offsideBand.never} (${pct(offsideBand.never, bandTotal)}%)`,
});
