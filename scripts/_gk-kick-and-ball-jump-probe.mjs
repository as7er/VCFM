/**
 * 探针：量化用户 2026-09-03 在直播画面上肉眼报的两个缺陷。
 *
 * 1) **球瞬移**：逐 tick 采样球心，标出单 tick 位移超过物理可能的帧，
 *    并记下当帧的球状态与重启类型——用来区分「引擎把球搬到重启点」
 *    与「渲染层插值断裂」。前者是引擎行为（画面只能靠补间掩盖），
 *    后者才是 matchview 的问题。0.1 秒里球最快也走不到 6 单位
 *    （30 m/s ≈ 4.4 单位/tick，纵向），所以阈值取 6。
 *
 * 2) **门将大脚落点**：包装 `_gkDistribute`，记录每一脚是短传还是大脚、
 *    落点在哪、瞄没瞄接应人，以及**落地后第一个控住球的人是谁**
 *    （本方 vs 对手）。用户的说法是「100% 落在中场中路对方球员脚下」。
 *
 * 读代码先得到的可疑处（待本探针证实/证伪）：
 *   `engine.js:2070` 有接应人时 `targetY = clamp(m.y + dir * 2, 38, 62)`；
 *   `engine.js:2078` 无接应人时 `targetY = clamp(50 + dir * -(5+rand*8), 40, 60)`；
 *   `engine.js:2053` 的初值同样是 `clamp(50 + dir * -8, 40, 60)`。
 *   dir 对 home 是 -1（攻 y↓），所以后两处的 `dir * -X` 把球开向**本方半场**，
 *   与 2070 那处的符号相反；而 [38,62] 的硬夹让任何一脚都落不出中三区。
 *
 * 纯测量，不改仓库代码：包装只读状态、只打标记，不消费随机数。
 * 口径：标准档、0.1 秒步长、能力 15，与既有探针一致。
 * 用法：node scripts/_gk-kick-and-ball-jump-probe.mjs [场数] [种子基]
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
    tactics: { formation: "4-3-3", lineup: players.map((p) => p.id), pressing: 3, tempo: 3, defensiveLine: 3 },
  };
}

const matches = Math.max(1, Number(process.argv[2]) || 2);
const seedBase = Number(process.argv[3]) || 372000;
const JUMP_UNITS = 6;
/** 旧实现把落点硬夹在这个盒子里；留着当回归指标看落点有没有散开 */
const CENTRE_BOX = { x: [30, 70], y: [38, 62] };
/** 与 `engine.js:_gkDistribute` 的 `underHeavyPressure` 同阈值 */
const HEAVY_NEAR = 4;

const ORIG = {
  gk: SimEngine.prototype._gkDistribute,
  pass: SimEngine.prototype._pass,
  bestPass: SimEngine.prototype._bestPass,
};
let inGk = false;
let gkWentShort = false;
let bestPassCalled = false;
let bestPassOut = null;
let pending = null;

SimEngine.prototype._pass = function _passProbe(...args) {
  if (inGk) gkWentShort = true;
  return ORIG.pass.apply(this, args);
};
/**
 * 只读地记下短传分支的入口条件，**不复刻任何公式**：
 * `_bestPass` 压根没被调用 ⇒ `engine.js:2035` 的 `underHeavyPressure || bypassBuildUp`
 * 已经短路；被调用了才轮到 value 门槛与 `recvOk` 那两道。
 */
SimEngine.prototype._bestPass = function _bestPassProbe(a) {
  const out = ORIG.bestPass.call(this, a);
  if (inGk) {
    bestPassCalled = true;
    bestPassOut = out
      ? {
          value: Number((out.value ?? 0).toFixed(3)),
          recvY: out.agent ? Number(out.agent.y.toFixed(1)) : null,
          recvD: out.agent ? Number(Math.hypot(out.agent.x - a.x, out.agent.y - a.y).toFixed(1)) : null,
        }
      : null;
  }
  return out;
};
SimEngine.prototype._gkDistribute = function _gkProbe(a) {
  inGk = true;
  gkWentShort = false;
  bestPassCalled = false;
  bestPassOut = null;
  // 出球那一刻的逼抢实况。`engine.js:2026-2029` 用的就是这个格距，
  // 阈值 6.5 / 9 也在格距上，所以这里量的是同一个量，不是复刻公式。
  let nearestOpp = 99;
  let within9 = 0;
  let nearestWho = null;
  for (const o of this.agents) {
    if (o.team === a.team || o.role === "GK" || o.sentOff) continue;
    const d = Math.hypot(o.x - a.x, o.y - a.y);
    if (d < nearestOpp) {
      nearestOpp = d;
      nearestWho = { role: o.role, x: Number(o.x.toFixed(1)), y: Number(o.y.toFixed(1)) };
    }
    if (d < 9) within9++;
  }
  const restartType = this.ball?.restartType || null;
  try {
    return ORIG.gk.call(this, a);
  } finally {
    inGk = false;
    const b = this.ball;
    pending = {
      short: gkWentShort,
      team: a.team,
      targetX: b.targetX,
      targetY: b.targetY,
      aimed: !!b.receiverId,
      bestPassCalled,
      bestPass: bestPassOut,
      nearestOpp: Number(nearestOpp.toFixed(1)),
      nearestWho,
      gkAt: { x: Number(a.x.toFixed(1)), y: Number(a.y.toFixed(1)) },
      within9,
      restartType,
    };
  }
};

/** 落点朝进攻方向推进了多少（正 = 进入对方半场，单位 = 场地格） */
function forwardOf(team, y) {
  return Number((team === "home" ? 50 - y : y - 50).toFixed(1));
}

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
    const kicks = [];
    const jumps = [];
    let watching = null;
    let prev = { x: eng.ball.x, y: eng.ball.y, state: eng.ball.state };
    for (let s = 0; s < steps; s++) {
      pending = null;
      eng.step(SIM.DT);
      const b = eng.ball;
      const moved = Math.hypot(b.x - prev.x, b.y - prev.y);
      if (moved > JUMP_UNITS) {
        jumps.push({
          d: Number(moved.toFixed(1)),
          transition: `${prev.state}→${b.state}`,
          restart: b.restartType || null,
        });
      }
      prev = { x: b.x, y: b.y, state: b.state };
      if (pending) {
        if (pending.short) kicks.push({ ...pending, outcome: "短传" });
        else watching = { ...pending, ticks: 0 };
      }
      if (watching) {
        watching.ticks++;
        // ⚠ `b.owner` 存的是**球员 id 字符串**（`engine.js:1082`），不是 agent 对象。
        // 第一版直接读 `owner.team` 得到 undefined，于是每一脚都被判成「对手拿到」，
        // 量出一个假的 100%。必须过 `agentById`。
        const owner = b.owner ? eng.agentById(b.owner) : null;
        if (owner) {
          kicks.push({
            ...watching,
            outcome: owner.team === watching.team ? "本方拿到" : "对手拿到",
            byRole: owner.role,
            landedFwd: forwardOf(watching.team, b.y),
          });
          watching = null;
        } else if (b.state !== "pass") {
          kicks.push({ ...watching, outcome: `中断:${b.state}` });
          watching = null;
        } else if (watching.ticks > 80) {
          kicks.push({ ...watching, outcome: "无人接管" });
          watching = null;
        }
      }
    }
    return { kicks, jumps };
  } finally {
    Math.random = restore;
  }
}

const allKicks = [];
const allJumps = [];
for (let i = 0; i < matches; i++) {
  const r = runMatch(seedBase + i);
  allKicks.push(...r.kicks);
  allJumps.push(...r.jumps);
}

const long = allKicks.filter((k) => !k.short);
const short = allKicks.filter((k) => k.short);
const pct = (n, d) => (d ? Number(((n / d) * 100).toFixed(1)) : 0);
const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

console.log(`\n=== 门将大脚落点 + 球瞬移（${matches} 场，种子 ${seedBase}..）===`);

console.log(`\n[1] 门将出球的分布：短传 ${short.length} 次 / 大脚 ${long.length} 次`);
const inBox = long.filter(
  (k) =>
    k.targetX >= CENTRE_BOX.x[0] && k.targetX <= CENTRE_BOX.x[1] &&
    k.targetY >= CENTRE_BOX.y[0] && k.targetY <= CENTRE_BOX.y[1]
);
const fwds = long.map((k) => forwardOf(k.team, k.targetY));
console.log({
  "落点在中路盒 x30~70/y38~62": `${inBox.length}/${long.length}（${pct(inBox.length, long.length)}%）`,
  "瞄了接应人": `${long.filter((k) => k.aimed).length}/${long.length}（${pct(long.filter((k) => k.aimed).length, long.length)}%）`,
  "落点朝前推进 中位/最小/最大": `${median(fwds)} / ${Math.min(...fwds)} / ${Math.max(...fwds)} 格`,
  "落点仍在本方半场（推进 ≤ 0）": `${fwds.filter((f) => f <= 0).length}/${long.length}（${pct(fwds.filter((f) => f <= 0).length, long.length)}%）`,
});

console.log("\n[1b] 短传分支为什么不触发（逐道门统计，仅大脚样本）：");
const nears = long.map((k) => k.nearestOpp);
const gkRestarts = long.filter((k) => k.restartType === "goalkick");
console.log({
  "出球瞬间最近对手距离 中位/最小/最大": `${median(nears)} / ${Math.min(...nears)} / ${Math.max(...nears)} 格`,
  [`靠「最近对手 < ${HEAVY_NEAR} 格」触发压迫`]: `${long.filter((k) => k.nearestOpp < HEAVY_NEAR).length}/${long.length}`,
  "靠「9 格内 ≥ 2 人」触发压迫": `${long.filter((k) => k.within9 >= 2).length}/${long.length}`,
  "两者合计判为贴身压迫": `${long.filter((k) => k.nearestOpp < HEAVY_NEAR || k.within9 >= 2).length}/${long.length}`,
  "这一脚是门球重启": `${gkRestarts.length}/${long.length}（门球时对手本该在禁区外）`,
  "　门球那批的最近对手距离 中位": gkRestarts.length ? median(gkRestarts.map((k) => k.nearestOpp)) : "—",
});
console.log("  门球时站得离门将最近的是谁（前 6 例，格坐标）：");
for (const k of gkRestarts.slice(0, 6)) {
  console.log(
    `    ${k.team} 门将 @(${k.gkAt.x},${k.gkAt.y})  最近对手 ${k.nearestWho?.role} ` +
      `@(${k.nearestWho?.x},${k.nearestWho?.y})  距 ${k.nearestOpp} 格`
  );
}
const roleNear = {};
for (const k of gkRestarts) roleNear[k.nearestWho?.role] = (roleNear[k.nearestWho?.role] || 0) + 1;
console.log(`    门球时最近对手的位置分布：${JSON.stringify(roleNear)}`);
const noBestPass = long.filter((k) => !k.bestPassCalled);
const bestPassNull = long.filter((k) => k.bestPassCalled && !k.bestPass);
const hasCand = long.filter((k) => k.bestPass);
const recvOkFail = hasCand.filter((k) => {
  const farEnough = k.bestPass.recvD > 8;
  const notTooDeep = k.team === "home" ? k.bestPass.recvY < 82 : k.bestPass.recvY > 18;
  return !(farEnough && notTooDeep);
});
const vals = hasCand.map((k) => k.bestPass.value);
console.log({
  "第 1 道 `_bestPass` 未被调用（贴身压迫/反击习惯短路）": `${noBestPass.length}/${long.length}（${pct(noBestPass.length, long.length)}%）`,
  "第 2 道 `_bestPass` 返回 null（无候选）": `${bestPassNull.length}/${long.length}`,
  "有候选": `${hasCand.length}/${long.length}`,
  "　候选 value 中位/最大": hasCand.length ? `${median(vals)} / ${Math.max(...vals)}（门槛 ≈ 0.22）` : "—",
  "　第 3 道 value 过不了门槛": `${hasCand.filter((k) => k.bestPass.value <= 0.22).length}/${hasCand.length}`,
  "　第 4 道 recvOk 不合格（太深或距离 ≤ 8）": `${recvOkFail.length}/${hasCand.length}`,
});

console.log("\n[2] 大脚落地后第一个控住球的人：");
const byOutcome = {};
for (const k of long) byOutcome[k.outcome] = (byOutcome[k.outcome] || 0) + 1;
for (const [k, v] of Object.entries(byOutcome).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k.padEnd(14)} ${String(v).padStart(4)} 次（${pct(v, long.length)}%）`);
}
const contested = long.filter((k) => k.outcome === "本方拿到" || k.outcome === "对手拿到");
const oppGot = contested.filter((k) => k.outcome === "对手拿到");
console.log(
  `  → 有人控住的 ${contested.length} 次里，对手拿到 ${oppGot.length} 次` +
    `（${pct(oppGot.length, contested.length)}%）。真实门球的本方保有率约 5 成上下，` +
    `远高于「100% 给对手」，但也不该反过来。`
);
const roles = {};
for (const k of oppGot) roles[k.byRole] = (roles[k.byRole] || 0) + 1;
console.log(`  → 对手是谁抢到的：${JSON.stringify(roles)}`);

console.log(`\n[3] 球单 tick 位移 > ${JUMP_UNITS} 格（物理不可能）的帧：${allJumps.length} 次`);
const byTransition = {};
for (const j of allJumps) {
  const key = `${j.transition}${j.restart ? ` [${j.restart}]` : ""}`;
  byTransition[key] = (byTransition[key] || 0) + 1;
}
for (const [k, v] of Object.entries(byTransition).sort((a, b) => b[1] - a[1]).slice(0, 12)) {
  console.log(`  ${k.padEnd(30)} ${String(v).padStart(4)} 次`);
}
const ds = allJumps.map((j) => j.d);
if (ds.length) {
  console.log(`  位移 中位/最大：${median(ds)} / ${Math.max(...ds)} 格（场地纵向 100 格）`);
}

console.log("\n[4] 读法：");
console.log(
  [
    "· [3] 里凡是伴随重启类型的瞬移都是**引擎行为**：球被搬到重启点，",
    "  不是渲染 bug。要让画面不突兀，得在表现层补一段「球被拿回摆好」的过渡，",
    "  或者引擎给重启加一个短暂的摆球阶段——两条路都不改判罚。",
    "· 若出现不带重启类型、且状态没变的瞬移，那才是模拟内部的位置跳变，要单独查。",
    "· [1] 的「落点朝前推进」是本探针的关键列：负数意味着门将把球开向自己半场。",
  ].join("\n")
);
