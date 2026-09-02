/**
 * 诊断：把引擎的「对方禁区内触球数」与 Opta 公布的真实值对账。
 *
 * 为什么这条重要：AGENTS.md 从 v239 起把「禁区内 1092 秒/场」当作主线根因，但对照值
 * 「真实足球 60~90 秒」一直被标注为**推测量级、无实测来源**（AGENTS.md:41、336）。
 * Opta 不公布「球在禁区内的时长」（已联网确认为 NOT FOUND），但公布
 * **touches_in_opp_box = 26.1 次/队/场**（英超 2021/22~2024/25 四季均值，8 季区间
 * 22.5~28.0，来源：官方 PL/Pulselive API，`"source":"OPTA"`）。这是同一现象的
 * **可对账替代量**，也是禁区循环问题的第一个真实外部参照值。
 *
 * Opta 定义（statsperform.com/opta-event-definitions）：
 *   Touches = 所有「球员触球」事件之和（不含争顶失败/对抗失败）；压线算界内。
 *   注意 Opta 的 touches **包含带球过程中的每一次触球**，所以它的口径比本探针宽。
 *
 * 本探针刻意只数**离散触球事件**（出脚 pass / 射门 shot / 接球 receive），
 * 不含带球中的连续触球——即结果是**真实口径的下界**。若下界已数倍于 Opta 的总量，
 * 结论不受口径差异影响。
 *
 * **纯测量，不改引擎。** 只读事件流与 `_inOwnFoulBox`（纯几何、不消费随机数）。
 * 同种子下开关本脚本不改变比分，脚本内有决定性自检。
 * 口径与 `_box-entry-rate-probe` / `_through-pass-gate-probe` 一致：
 * 种子 372000..、能力 15、标准档、0.1 秒步长。
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

// —— Opta 真实参照值（英超，per team per match）——
const OPTA_BOX_TOUCHES_MEAN = 26.1;   // 2021/22~2024/25 四季均值
const OPTA_BOX_TOUCHES_RANGE = [22.5, 28.0]; // 2018/19~2025/26 八季区间

const matches = Math.max(1, Number(process.argv[2]) || 6);
const seeds = Array.from({ length: matches }, (_, i) => 372000 + i);

const byType = { pass: 0, shot: 0, receive: 0 };
let boxTouches = 0;
let allTouchEvents = 0;

function runMatch(seed, instrument) {
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
    if (!instrument) return { h: eng.score.home, a: eng.score.away };

    for (const ev of eng.events) {
      if (ev.type !== "pass" && ev.type !== "shot" && ev.type !== "receive") continue;
      if (ev.team !== "home" && ev.team !== "away") continue;
      if (!Number.isFinite(ev.x) || !Number.isFinite(ev.y)) continue;
      allTouchEvents++;
      // 触球者所在球队的进攻方向 → 对方禁区 = 对手的「自家禁区」
      const oppTeam = ev.team === "home" ? "away" : "home";
      if (eng._inOwnFoulBox(oppTeam, ev.x, ev.y)) {
        boxTouches++;
        byType[ev.type]++;
      }
    }
    return { h: eng.score.home, a: eng.score.away };
  } finally {
    Math.random = restore;
  }
}

const clean = runMatch(seeds[0], false);
const inst = runMatch(seeds[0], true);
const deterministic = clean.h === inst.h && clean.a === inst.a;
for (const seed of seeds.slice(1)) runMatch(seed, true);

const perTeamPerMatch = boxTouches / matches / 2;
const ratio = perTeamPerMatch / OPTA_BOX_TOUCHES_MEAN;

console.log(`\n=== 对方禁区内触球数 vs Opta 真实值（${matches} 场，种子 ${seeds[0]}..）===`);

console.log("\n[0] 决定性自检 —— 插桩是否污染了 RNG 流：");
console.log({
  无插桩比分: `${clean.h}-${clean.a}`,
  有插桩比分: `${inst.h}-${inst.a}`,
  判定: deterministic ? "✅ 一致，插桩只读" : "❌ 不一致，下面所有数字作废",
});
if (!deterministic) {
  console.error("\n插桩改变了比赛结果，测量无效。终止。");
  process.exit(1);
}

console.log("\n[1] 🔑 主结果（本探针只数离散触球，是真实口径的下界）：");
console.log({
  "本引擎 禁区触球/队/场": Number(perTeamPerMatch.toFixed(1)),
  "Opta 英超 四季均值": OPTA_BOX_TOUCHES_MEAN,
  "Opta 八季区间": OPTA_BOX_TOUCHES_RANGE.join(" ~ "),
  倍数: `${ratio.toFixed(1)}×`,
  判定:
    perTeamPerMatch > OPTA_BOX_TOUCHES_RANGE[1]
      ? `❌ 超出真实上界 ${OPTA_BOX_TOUCHES_RANGE[1]}，且这是下界估计`
      : perTeamPerMatch < OPTA_BOX_TOUCHES_RANGE[0]
        ? "低于真实下界"
        : "✅ 在真实区间内",
});

console.log("\n[2] 构成（哪一类触球把总数撑起来）：");
const share = (n) => `${n} (${((n / Math.max(1, boxTouches)) * 100).toFixed(1)}%)`;
console.log({
  出脚_pass: share(byType.pass),
  接球_receive: share(byType.receive),
  射门_shot: share(byType.shot),
  合计: boxTouches,
  "每队每场 出脚": Number((byType.pass / matches / 2).toFixed(1)),
  "每队每场 接球": Number((byType.receive / matches / 2).toFixed(1)),
  "每队每场 射门": Number((byType.shot / matches / 2).toFixed(1)),
});

console.log("\n[3] 口径提醒：");
console.log(
  [
    "· 本探针不含带球过程中的连续触球，Opta 的 touches 含；故本值是下界。",
    "· Opta 压线算界内；本探针用 `_inOwnFoulBox`，与引擎判罚口径一致。",
    "· 真实值仅英超（官方 PL/Pulselive API，source=OPTA）；其他四大联赛未公布。",
    "· 「球在禁区内的时长」Opta 不公布，已联网确认 NOT FOUND —— 所以用触球数对账，",
    "  不要再引用 AGENTS.md 里那个无来源的「真实 60~90 秒」。",
  ].join("\n")
);
