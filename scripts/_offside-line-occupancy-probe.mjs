/**
 * 诊断（为 `_through-pass-gate-probe` 的结论补一个**外部参照值**）：
 * 引擎里的进攻球员离越位线有多远，以及每场判了多少次越位。
 *
 * 背景：`_through-pass-gate-probe` 的第 3 门（`lineGap < 11`）淘汰的 3275 对候选中
 * **100% 是「太靠后」、0% 是「已越位」**，lineGap 中位 39.34 单位（≈41m）。
 * 这提示引擎里没有人真正去贴越位线。但那个探针只统计「被前两门放过的候选」，
 * 分母被前置门污染，无法回答「全场所有前锋平均离线多远」。
 *
 * 本探针改为**无条件按 tick 采样每一名进攻方外场球员**，并给出两个数字：
 *   甲 lineGap 分布（分角色）——引擎内部画像，无外部参照。
 *   乙 **每场越位判罚次数**——这条有外部参照：真实足球每队每场约 2~3 次
 *      （英超 2023/24 全季 1042 次 / 380 场 / 2 队 ≈ 1.37 次每队每场，
 *       含 VAR 后偏低；量级参照取 1~3）。
 *   越位判罚次数是**唯一不依赖引擎内部口径**的验证：如果引擎几乎不判越位，
 *   说明进攻球员从不试探最后防线——这在真实足球里不可能。
 *
 * **纯测量，不改引擎。** 只读 `_offsideLineY`（纯几何，不消费随机数）与事件流。
 * 同种子下开关本脚本不改变比分，脚本内有决定性自检。
 *
 * 口径与 `_through-pass-gate-probe` / `_player-stillness-probe` 一致：
 * 同种子 372000..372005、能力 15、标准档、0.1 秒步长。
 * 采样只取**本队控球**的 tick（无球时贴越位线没有意义）。
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
const median = (values) => {
  if (!values.length) return 0;
  const s = [...values].sort((x, y) => x - y);
  const m = s.length >> 1;
  return Number((s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2).toFixed(2));
};
const quantile = (values, q) => {
  if (!values.length) return 0;
  const s = [...values].sort((x, y) => x - y);
  return Number(s[Math.min(s.length - 1, Math.floor(s.length * q))].toFixed(2));
};
const pct = (num, den) => Number(((num / Math.max(1, den)) * 100).toFixed(1));
const toM = (units) => Number((units * METRES_Y).toFixed(1));

const matchCount = Math.max(1, Number(process.argv[2]) || 6);
const seeds = Array.from({ length: matchCount }, (_, i) => 372000 + i);
const timeStep = SIM.DT;

// lineGap = 球员到越位线的距离，带符号：>0 在越位线前方（越位侧），<0 在后方（安全侧）
const byRole = { ATT: [], MID: [], DEF: [] };
let samples = 0;
let beyondLine = 0;      // 处于越位侧的采样数
let within5 = 0;         // 距线 5 单位内（真实前锋的常态）
let within11 = 0;        // 距线 11 单位内（即第 3 门的阈值）
let offsideCalls = 0;
let attackingThirdSamples = 0;
const attLineGapFinalThird = []; // 只看球已进最后三区时的前锋

function runMatch(seed, instrument) {
  const original = Math.random;
  Math.random = seededRandom(seed);
  try {
    const engine = new SimEngine(
      makeClub(`home-${seed}`, 15),
      makeClub(`away-${seed}`, 15),
      { simulationProfile: "standard", timeStep, separationPasses: 8 }
    );
    const steps = Math.round((90 * 60) / timeStep);
    let eventCursor = 0;
    for (let step = 0; step < steps; step++) {
      engine.step(timeStep);
      if (!instrument) continue;

      for (; eventCursor < engine.events.length; eventCursor++) {
        if (engine.events[eventCursor].type === "offside") offsideCalls++;
      }

      const attTeam = engine.possession;
      if (attTeam !== "home" && attTeam !== "away") continue;
      const offY = engine._offsideLineY(attTeam);
      if (offY == null) continue;
      const dir = engine.attackDir(attTeam);
      const ownGoalY = attTeam === "home" ? SIM.HOME_GOAL_Y : SIM.AWAY_GOAL_Y;
      const prog = Math.abs(engine.ball.y - ownGoalY) / 100;
      const finalThird = prog > 0.64;
      if (finalThird) attackingThirdSamples++;

      for (const a of engine.agents) {
        if (a.team !== attTeam || a.sentOff || a.role === "GK") continue;
        // 带符号：正数 = 已越过越位线
        const gap = (a.y - offY) * dir;
        samples++;
        if (gap > 0) beyondLine++;
        if (Math.abs(gap) <= 5) within5++;
        if (Math.abs(gap) <= 11) within11++;
        const bucket = a.role === "ATT" ? byRole.ATT : a.role === "MID" ? byRole.MID : byRole.DEF;
        bucket.push(gap);
        if (finalThird && a.role === "ATT") attLineGapFinalThird.push(gap);
      }
    }
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

const perMatch = (n) => Number((n / seeds.length).toFixed(2));

console.log(
  `\n=== 进攻球员离越位线多远 + 越位判罚率（${seeds.length} 场，种子 ${seeds[0]}..${seeds[seeds.length - 1]}）===`
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

console.log("\n[1] 🔑 越位判罚次数 —— 唯一有外部参照的指标：");
console.log({
  "本引擎 越位/场(双队合计)": perMatch(offsideCalls),
  "本引擎 越位/队/场": Number((offsideCalls / seeds.length / 2).toFixed(2)),
  "真实足球 越位/队/场": "约 1~3（英超近季约 1.4）",
  判定:
    offsideCalls / seeds.length / 2 < 0.5
      ? "❌ 远低于真实足球：进攻球员几乎从不试探最后防线"
      : "在量级内",
});

console.log("\n[2] 带符号 lineGap 分布（正数=已越过越位线，单位为场地单位/米）：");
for (const [role, values] of Object.entries(byRole)) {
  if (!values.length) continue;
  console.log(`  ${role}（n=${values.length}）:`, {
    中位: `${median(values)} (${toM(median(values))}m)`,
    p10: `${quantile(values, 0.1)} (${toM(quantile(values, 0.1))}m)`,
    p90: `${quantile(values, 0.9)} (${toM(quantile(values, 0.9))}m)`,
    最大: `${quantile(values, 0.999)} (${toM(quantile(values, 0.999))}m)`,
  });
}

console.log("\n[3] 贴线程度 —— 全部进攻方外场球员采样：");
console.log({
  采样数: samples,
  "在越位侧(gap>0)": `${beyondLine} (${pct(beyondLine, samples)}%)`,
  "距线 5 单位内": `${within5} (${pct(within5, samples)}%)`,
  "距线 11 单位内(第3门阈值)": `${within11} (${pct(within11, samples)}%)`,
});

console.log("\n[4] 只看球已进最后三区时的前锋 —— 最该贴线的场景：");
console.log({
  采样数: attLineGapFinalThird.length,
  最后三区tick数: attackingThirdSamples,
  中位: `${median(attLineGapFinalThird)} (${toM(median(attLineGapFinalThird))}m)`,
  p90: `${quantile(attLineGapFinalThird, 0.9)} (${toM(quantile(attLineGapFinalThird, 0.9))}m)`,
  "距线 5 单位内": `${pct(
    attLineGapFinalThird.filter((g) => Math.abs(g) <= 5).length,
    attLineGapFinalThird.length
  )}%`,
});
