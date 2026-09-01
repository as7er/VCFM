// 越位事件完整性审计
//
// 为什么单独存在：`match-realism-audit` 从不统计越位（它覆盖射门/进球/扑救/传球/
// 抢断/角球/犯规/手球/VAR/伤病/停滞），所以越位相关的失真可以长期漂移而不触发
// 任何断言。2026-09-01 修掉的「每次越位发两条事件、第二条记在获得任意球的那一方」
// 就是在这个盲区里存活的——`adapt.js` 的 `pickFlavorEvents` 给 offside 设了
// cap:3，静默截断掉大部分重复，解说因此每次越位念两遍且第二遍念错队伍。
//
// 断言一（回归守卫，硬失败）：`type === "offside"` 的事件数必须等于 `_callOffside`
// 的调用次数。任何「整数倍」关系都说明重启通知又和判罚同名了。
// 断言二（判罚率，仅告警）：真实足球约 1~3 次/队/场（英超近季约 1.4）。当前实测
// 约 4.6，偏高约 3 倍，成因见 AGENTS.md v241；因为目标值尚未定案，这里只告警不失败。
//
// 用法：node scripts/offside-event-integrity-audit.mjs [场数]
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

const matches = Math.max(1, Number(process.argv[2]) || 8);
const REAL_PER_TEAM_MIN = 1;
const REAL_PER_TEAM_MAX = 3;

let totalCalls = 0;
let totalEvents = 0;
let totalDupPairs = 0;
const mismatches = [];
const shapeIssues = [];

for (let i = 0; i < matches; i++) {
  const seed = 372000 + i;
  const restore = Math.random;
  Math.random = seededRandom(seed);
  try {
    const eng = new SimEngine(club(`h${seed}`, 15), club(`a${seed}`, 15), {
      simulationProfile: "standard",
      timeStep: SIM.DT,
      separationPasses: 8,
    });
    let calls = 0;
    const orig = eng._callOffside.bind(eng);
    eng._callOffside = function (p) {
      calls++;
      return orig(p);
    };
    const steps = Math.round((90 * 60) / SIM.DT);
    for (let s = 0; s < steps; s++) eng.step(SIM.DT);

    const evs = eng.events.filter((e) => e.type === "offside");
    // 真实判罚由 `_callOffside` 发出，带 kickLineY/kickBallY（出脚瞬间的越位线与球位）；
    // 重启通知没有这两个字段。据此认「身份」，而不是只认 type 字符串：否则判罚事件一旦
    // 被改名，过滤结果与调用数会一起归零，断言相等而空转通过。
    const ruled = evs.filter((e) => e.kickLineY != null && e.kickBallY != null);
    if (ruled.length !== evs.length) {
      shapeIssues.push({ seed, events: evs.length, ruled: ruled.length });
    }
    const keys = evs.map((e) => `${e.t.toFixed(2)}|${e.agentId}`);
    const dup = keys.length - new Set(keys).size;

    totalCalls += calls;
    totalEvents += evs.length;
    totalDupPairs += dup;
    if (evs.length !== calls) mismatches.push({ seed, calls, events: evs.length });
  } finally {
    Math.random = restore;
  }
}

const perTeam = totalEvents / matches / 2;
console.log(
  JSON.stringify(
    {
      matches,
      offsideCalls: totalCalls,
      offsideEvents: totalEvents,
      perTeamPerMatch: Number(perTeam.toFixed(2)),
      sameTickSamePlayerDuplicates: totalDupPairs,
    },
    null,
    2,
  ),
);

let failed = false;
if (mismatches.length) {
  failed = true;
  console.error(
    `\n❌ 事件数与 _callOffside 调用数不符（重启通知可能又与判罚同名）：` +
      mismatches.map((m) => `seed ${m.seed} 调用 ${m.calls} / 事件 ${m.events}`).join("；"),
  );
}
if (totalDupPairs > 0) {
  failed = true;
  console.error(`\n❌ 出现同时刻同球员的重复越位事件 ${totalDupPairs} 对`);
}
if (shapeIssues.length) {
  failed = true;
  console.error(
    `\n❌ 存在缺少 kickLineY/kickBallY 的 offside 事件（疑似重启通知又与判罚同名，` +
      `或判罚字段被改名）：` +
      shapeIssues.map((s) => `seed ${s.seed} 事件 ${s.events} / 判罚 ${s.ruled}`).join("；"),
  );
}
if (!failed) {
  console.log(`\n✅ 越位事件数与判罚调用数一致（${totalEvents}/${totalCalls}），无重复事件`);
}
if (perTeam < REAL_PER_TEAM_MIN || perTeam > REAL_PER_TEAM_MAX) {
  console.warn(
    `\n⚠ 越位判罚率 ${perTeam.toFixed(2)} 次/队/场，超出真实足球区间 ` +
      `${REAL_PER_TEAM_MIN}~${REAL_PER_TEAM_MAX}（仅告警，目标值待定，见 AGENTS.md v241）`,
  );
}
process.exit(failed ? 1 : 0);
