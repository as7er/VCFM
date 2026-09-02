/**
 * 诊断：4.56 次/队/场的越位判罚，究竟从哪条路径进来。
 *
 * 背景（AGENTS.md v241）：去重后实测 4.56，Opta 英超 VAR 时代真实值 **1.70**（带 1.4~2.1）。
 * 负结果留档八已证明 `_bestCross` 那条杠杆是死的（硬禁只到 2.88，且作用面 0.2%），
 * 明确写了「不要再回来拧 `_bestCross`」。本探针找下一个杠杆。
 *
 * 关键结构（读代码得到，本探针要把它量化）：`_pass:2925-2937` 的越位快照收的是
 * **出脚瞬间所有处于越位位置的队友**，不只是预定接球人。此后有两条独立的判罚路径：
 *
 *   路径 A `engine.js:1698-1708`（在 `_think` 里）：**预定接球人**向球做动作即吹，
 *            不等真正触球。
 *   路径 B `engine.js:5306-5326`（在 `_resolvePossession` 里）：**谁先拿到球**，
 *            只要他在快照集合里就吹——可以是完全没被瞄准的第三人。
 *
 * 这解释了归因探针里那个刺眼的不对称：判罚 69.8% 来自普通传球，但普通传球里
 * 「预定接球人出脚瞬间已越位」只占 **0.3%**。差额只能从路径 B 来。
 * 若确证如此，杠杆就不在「传给谁」的估值上（那是路径 A 的事），
 * 而在「出脚瞬间有多少人站在越位位置」这个暴露量上。
 *
 * 因此本探针给出三个量：
 *   ① 暴露：每次传球的 `offsideIds.size` 分布（有多少队友正站在越位位置）；
 *   ② 分流：判罚在路径 A / B 之间的比例，以及被吹的人是否就是预定接球人；
 *   ③ 转化：`有越位队友的传球` → `真的被吹` 的转化率，按传球种类拆开。
 *
 * **纯测量，不改引擎行为。** 只用不消费随机数、不改状态的包装器
 * （`_pass` 原样调用后读 `ball` 上的快照字段；`_think`/`_resolvePossession` 只置标志位）。
 * 脚本内含决定性自检：打桩与不打桩必须逐场同分，否则整份数据作废。
 *
 * 口径与既有探针一致：种子 372000..、能力 15、标准档、0.1 秒步长。
 * 越位与射门按「每队每场」报（真实参照值是那个口径），传球计数按合并双方的总量报。
 *
 * 用法：node scripts/_offside-trigger-decomposition-probe.mjs [场数]
 */
import { SimEngine, SIM } from "../js/sim/engine.js";

const M_PER_UNIT_Y = SIM.PITCH_H_METRES / SIM.FIELD_H; // 100 单位 = 105 m

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

// —— 打桩 ——
const ORIG = {
  pass: SimEngine.prototype._pass,
  think: SimEngine.prototype._think,
  resolve: SimEngine.prototype._resolvePossession,
  call: SimEngine.prototype._callOffside,
};

/** 置 null 关闭采集（自检的「不打桩」那一轮走这里）。 */
let S = null;
const newStats = () => ({
  passes: 0,
  passesWithOffside: 0,
  exposureHist: new Map(),   // offsideIds.size -> 次数
  exposureSum: 0,
  byKind: new Map(),         // kind -> {passes, withOffside, calls}
  calls: 0,
  pathThink: 0,
  pathResolve: 0,
  pathUnknown: 0,
  flaggedIsReceiver: 0,
  flaggedIsReceiverByPath: { think: 0, resolve: 0 },
  beyondLineM: [],           // 被吹者出脚瞬间越过越位线的米数
  latency: [],               // 出脚到吹哨的秒数
  callKind: new Map(),       // kind -> 判罚数
  exposureAtCall: [],        // 被吹那次传球的 offsideIds.size
});

/** 当前处于哪个调用栈：'think' | 'resolve' | null。用标志位而不是读 stack，稳定且零开销。 */
let inPath = null;
/** 出脚快照，键为 ball 上递增的探针 id。 */
let kickRecords = new Map();
let kickSeq = 0;

const passKind = (b) => (b.isCrossPass ? "传中" : b.isThroughPass ? "直塞" : "普通传球");

SimEngine.prototype._pass = function _passProbe(a, passTo, prepared = false) {
  const r = ORIG.pass.call(this, a, passTo, prepared);
  if (!S) return r;
  const b = this.ball;
  // `_queueBallAction` 会让 `_pass` 提前返回而不真正出球；只在快照真的更新了时采集。
  if (b.state !== "pass" || !(b.offsideIds instanceof Set) || b.lastKicker !== a.id) return r;
  const kind = passKind(b);
  const size = b.offsideIds.size;
  S.passes++;
  S.exposureSum += size;
  S.exposureHist.set(size, (S.exposureHist.get(size) || 0) + 1);
  if (size > 0) S.passesWithOffside++;
  let k = S.byKind.get(kind);
  if (!k) S.byKind.set(kind, (k = { passes: 0, withOffside: 0, calls: 0 }));
  k.passes++;
  if (size > 0) k.withOffside++;

  const dir = b.offsideDir; // engine.js:636 → home -1（向 y=0 进攻）、away +1
  const beyond = new Map();
  for (const m of this.agents) {
    if (b.offsideIds.has(m.id)) {
      // 越过越位线的距离，正数 = 已越线（两队同号：home 的 y 更小、away 的更大）
      beyond.set(m.id, (m.y - b.offsideLineY) * dir * M_PER_UNIT_Y);
    }
  }
  const id = ++kickSeq;
  b._probeKickId = id;
  kickRecords.set(id, {
    kind,
    size,
    t: this.t,
    receiverId: b.receiverId,
    receiverOffside: b.receiverId ? b.offsideIds.has(b.receiverId) : false,
    beyond,
  });
  // 只保留最近若干次，避免 90 分钟累积
  if (kickRecords.size > 64) {
    for (const key of kickRecords.keys()) {
      if (kickRecords.size <= 32) break;
      kickRecords.delete(key);
    }
  }
  return r;
};

SimEngine.prototype._think = function _thinkProbe(...args) {
  if (!S) return ORIG.think.apply(this, args);
  const prev = inPath;
  inPath = "think";
  try {
    return ORIG.think.apply(this, args);
  } finally {
    inPath = prev;
  }
};

SimEngine.prototype._resolvePossession = function _resolveProbe(...args) {
  if (!S) return ORIG.resolve.apply(this, args);
  const prev = inPath;
  inPath = "resolve";
  try {
    return ORIG.resolve.apply(this, args);
  } finally {
    inPath = prev;
  }
};

SimEngine.prototype._callOffside = function _callOffsideProbe(player) {
  if (!S) return ORIG.call.call(this, player);
  const b = this.ball;
  const rec = kickRecords.get(b?._probeKickId);
  S.calls++;
  if (inPath === "think") S.pathThink++;
  else if (inPath === "resolve") S.pathResolve++;
  else S.pathUnknown++;
  const isReceiver = !!player && b?.receiverId === player.id;
  if (isReceiver) {
    S.flaggedIsReceiver++;
    if (inPath === "think") S.flaggedIsReceiverByPath.think++;
    else if (inPath === "resolve") S.flaggedIsReceiverByPath.resolve++;
  }
  if (rec) {
    S.callKind.set(rec.kind, (S.callKind.get(rec.kind) || 0) + 1);
    const k = S.byKind.get(rec.kind);
    if (k) k.calls++;
    S.exposureAtCall.push(rec.size);
    S.latency.push(this.t - rec.t);
    const bm = player ? rec.beyond.get(player.id) : undefined;
    if (Number.isFinite(bm)) S.beyondLineM.push(bm);
  }
  return ORIG.call.call(this, player);
};

// —— 跑场 ——
const matches = Math.max(1, Number(process.argv[2]) || 8);
const seeds = Array.from({ length: matches }, (_, i) => 372000 + i);

function runMatch(seed) {
  const restore = Math.random;
  Math.random = seededRandom(seed);
  kickRecords = new Map();
  kickSeq = 0;
  inPath = null;
  try {
    const eng = new SimEngine(club(`h${seed}`, 15), club(`a${seed}`, 15), {
      simulationProfile: "standard",
      timeStep: SIM.DT,
      separationPasses: 8,
    });
    const steps = Math.round((90 * 60) / SIM.DT);
    for (let s = 0; s < steps; s++) eng.step(SIM.DT);
    let offsideEvents = 0;
    for (const ev of eng.events) if (ev.type === "offside") offsideEvents++;
    return { score: `${eng.score.home}-${eng.score.away}`, offsideEvents };
  } finally {
    Math.random = restore;
  }
}

console.log(`\n=== 越位判罚路径分解（${matches} 场，种子 ${seeds[0]}..）===`);

// [0] 自检：打桩不得改变行为
S = null;
const clean = seeds.map((s) => runMatch(s));
S = newStats();
const probed = seeds.map((s) => runMatch(s));
const sameScore = clean.map((r) => r.score).join(",") === probed.map((r) => r.score).join(",");
const sameOffside =
  clean.reduce((n, r) => n + r.offsideEvents, 0) === probed.reduce((n, r) => n + r.offsideEvents, 0);
console.log("\n[0] 打桩自检 —— 打桩与不打桩必须逐场同分、越位数相同：");
console.log({
  不打桩: clean.map((r) => r.score).join(" "),
  打桩: probed.map((r) => r.score).join(" "),
  判定: sameScore && sameOffside ? "✅ 一致，插桩无副作用" : "❌ 不一致，数据作废",
});
if (!sameScore || !sameOffside) {
  console.error("\n插桩改变了模拟行为，分解无效。终止。");
  process.exit(1);
}

const events = probed.reduce((n, r) => n + r.offsideEvents, 0);
const pct = (n, d) => `${((n / Math.max(1, d)) * 100).toFixed(1)}%`;
const q = (arr, f) => {
  if (!arr.length) return null;
  const s = arr.slice().sort((a, b) => a - b);
  return Number(s[Math.floor((s.length - 1) * f)].toFixed(2));
};

console.log("\n[1] 🔑 判罚路径分流（这是本探针的主结论）：");
console.log({
  越位事件数: events,
  "_callOffside 调用数": S.calls,
  "每队每场": Number((S.calls / matches / 2).toFixed(2)),
  "路径 A：预定接球人向球移动（_think:1698）": `${S.pathThink}（${pct(S.pathThink, S.calls)}）`,
  "路径 B：谁先拿到球就吹（_resolvePossession:5306）": `${S.pathResolve}（${pct(S.pathResolve, S.calls)}）`,
  未知路径: S.pathUnknown,
  "被吹者就是预定接球人": `${S.flaggedIsReceiver}（${pct(S.flaggedIsReceiver, S.calls)}）`,
  "  其中经路径 B（本可传给别人却吹到第三人）": S.flaggedIsReceiverByPath.resolve,
  "被吹者是**没被瞄准的第三人**": `${S.calls - S.flaggedIsReceiver}（${pct(S.calls - S.flaggedIsReceiver, S.calls)}）`,
});

console.log("\n[2] 🔑 暴露量 —— 每次传球有多少队友正站在越位位置：");
{
  const hist = [...S.exposureHist.entries()].sort((a, b) => a[0] - b[0]);
  console.log({
    传球总数: S.passes,
    "至少一人越位的传球": `${S.passesWithOffside}（${pct(S.passesWithOffside, S.passes)}）`,
    平均越位人数每次传球: Number((S.exposureSum / Math.max(1, S.passes)).toFixed(3)),
    分布: hist.map(([k, v]) => `${k}人:${v}(${pct(v, S.passes)})`).join("  "),
  });
}

console.log("\n[3] 🔑 转化率 —— 有越位队友的传球里，多少真的被吹：");
for (const [kind, k] of [...S.byKind.entries()].sort((a, b) => b[1].passes - a[1].passes)) {
  console.log(
    `  ${kind.padEnd(6)} 传球 ${String(k.passes).padStart(6)}  ` +
      `含越位队友 ${String(k.withOffside).padStart(5)}（${pct(k.withOffside, k.passes)}）  ` +
      `被吹 ${String(k.calls).padStart(4)}  ` +
      `转化 ${pct(k.calls, k.withOffside)}  ` +
      `占全部判罚 ${pct(k.calls, S.calls)}`
  );
}

console.log("\n[4] 被吹者的画像：");
console.log({
  "越过越位线米数 中位/p90": `${q(S.beyondLineM, 0.5)} / ${q(S.beyondLineM, 0.9)} m`,
  "其中不足 0.5m（擦线，真实里多半被 VAR/边裁放过或本就够呛）":
    `${S.beyondLineM.filter((v) => v < 0.5).length}（${pct(S.beyondLineM.filter((v) => v < 0.5).length, S.beyondLineM.length)}）`,
  "不足 1m": `${S.beyondLineM.filter((v) => v < 1).length}（${pct(S.beyondLineM.filter((v) => v < 1).length, S.beyondLineM.length)}）`,
  "出脚到吹哨秒数 中位/p90": `${q(S.latency, 0.5)} / ${q(S.latency, 0.9)} s`,
  "被吹那次传球的越位人数 中位/p90": `${q(S.exposureAtCall, 0.5)} / ${q(S.exposureAtCall, 0.9)}`,
});

console.log("\n[5] 读法：");
console.log(
  [
    "· 若路径 B 占多数 → 杠杆不在「传给谁」的估值（`_bestCross`/`_passCandidates` 都只管路径 A），",
    "  而在**暴露量**：出脚瞬间站在越位位置的人太多。着力点是 `_clampOffside:3468` 的",
    "  缓冲与失误率、以及无球跑位何时越线。",
    "· 若「越过线不足 0.5m」占比很高 → 是判定容差问题（`_isOffsidePosition` 的 tol=0.45 单位",
    `  ≈ ${(0.45 * M_PER_UNIT_Y).toFixed(2)}m），真实里半自动越位也有毫米级判定，但**攻方受益**的擦线球`,
    "  在真实足球里更常被放过；这条要对着 Opta 的 1.70 谨慎调，不能当成免费降低手段。",
    "· 真实参照：越位 1.70 次/队/场（带 1.4~2.1，Opta 英超 VAR 时代十二季）。",
  ].join("\n")
);
