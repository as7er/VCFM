/**
 * 诊断（区分「没人拦」与「有人但拦不住」）：带球越线进禁区的那一刻，防守侧在哪。
 *
 * 背景（AGENTS.md v239 遗留 #1，上游测量段）：`_box-entry-rate-probe.mjs` 量出
 * 1092 秒主要由「进入次数」贡献（202.3 次/场 × 中位 4.5 秒），而最大的新进攻进入
 * 机制是**带球越线 42 次/场**，比传中 26.7 次还多 1.6 倍。这个比例免参照即可判定为错：
 * 真实足球进禁区绝大多数靠传球与传中，带球杀进去是少数事件。
 *
 * 代码侧观察（**尚未实测确认，本脚本就是来验它的**）：`_inOwnFoulBox` 在 engine.js
 * 里只被引用 5 处，全部服务于裁判判罚（手球、点球、VAR），**防守规划区间
 * （`_defPlan` 3663~4206）一次都没出现**。即防守侧似乎没有「持球人正在逼近禁区」
 * 这个概念。但「代码里没这个概念」≠「加上就能降进入率」——留档三/四/六已三次证明
 * 「机制说得通但数据不支持」，所以先量。
 *
 * —— 为什么必须先区分这两种情况（决定改法完全相反）——
 *   甲「无人拦阻」：越线瞬间最近防守者很远 / 不在身前 / 无人被派去管他。
 *                   → 杠杆在防守派工：禁区边缘缺一个拦阻职责。
 *   乙「有人但拦不住」：最近防守者本就贴身（≤2~3m）却没能阻止越线。
 *                   → 杠杆不在派工，而在对抗判定/减速/身体阻挡，改派工无用。
 *
 * 输出五组：
 *   1. 越线瞬间最近防守者的距离分布，以及「身前 vs 身后」（是否在持球人与球门之间）。
 *      这是区分甲/乙的主证据。
 *   2. 越线瞬间 3m / 5m 内的防守者人数，以及最近者的 fsm（press/mark/cover/其他）。
 *      有人贴着但 fsm 不是 press/mark，说明他不是被派来管这个人的。
 *   3. 越线者画像：role、是否边锋、越线瞬间速度。决定要改 `_attackPlan` 哪条分支。
 *   4. **产出对照（防重演留档五）**：带球越线的进入里有多少最终产生射门/进球，
 *      对照「传球进入」的同一比例。若带球越线产出很低 → 砍它较安全；
 *      若产出很高 → 会像留档五那样把强队进攻一起铲掉。
 *   5. 对照组：传球进入时接球人身边的防守者密度，用于判断带球越线是否特别无人看管。
 *
 * 口径与 `_box-entry-rate-probe.mjs` 一致：同种子起点 372000、能力 15、标准档、
 * 纯几何跨线判定（球跨 `_inOwnFoulBox` 边界）、出线宽限期合并短暂出线。
 * 全程只读引擎公开状态，不消费随机数，同种子下开关本脚本不改变比分。
 * `_` 前缀按仓库惯例表示诊断脚本，不进 `verify.mjs`。
 *
 * 口径限制（读结论前必须知道）：
 *   · 「带球越线」判定为：跨线那一帧球有 owner 且 owner 是进攻方，且该 owner 就是
 *     上一次触球者（不是刚接到传球）。刚接传球的归入「传球进入」对照组。
 *   · 距离为米（x 一格 0.68m、y 一格 1.05m），已按引擎 SIM 常量换算。
 *   · 「身前」定义为防守者沿进攻方向比持球人更靠近本方球门（goal-side），
 *     这是能否拦阻的必要条件，不是充分条件（横向偏移未计入）。
 *   · 门将不计入防守者密度（他在禁区内本就贴着球门，会污染 3m/5m 计数），
 *     但单独报最近门将距离。
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

const METRES_X = SIM.PITCH_W_METRES / SIM.FIELD_W;
const METRES_Y = SIM.PITCH_H_METRES / SIM.FIELD_H;
const distM = (ax, ay, bx, by) =>
  Math.hypot((ax - bx) * METRES_X, (ay - by) * METRES_Y);
const speedMps = (a) => Math.hypot((a.vx || 0) * METRES_X, (a.vy || 0) * METRES_Y);

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
const dist = (values) => ({
  n: values.length,
  中位: median(values),
  p25: quantile(values, 0.25),
  p75: quantile(values, 0.75),
  p90: quantile(values, 0.9),
});

const matchCount = Math.max(1, Number(process.argv[2]) || 6);
const EXIT_GRACE = Number(process.argv[3]) || 2.0;
const seeds = Array.from({ length: matchCount }, (_, i) => 372000 + i);
const timeStep = SIM.DT;

// 带球越线组
const carry = {
  n: 0,
  nearestDist: [],
  nearestGoalSide: 0,
  nearestFsm: new Map(),
  within3: [],
  within5: [],
  keeperDist: [],
  speed: [],
  role: new Map(),
  shots: 0,
  goals: 0,
};
// 传球进入组（对照）
const passEntry = {
  n: 0,
  nearestDist: [],
  nearestGoalSide: 0,
  within3: [],
  within5: [],
  shots: 0,
  goals: 0,
};

const bump = (map, key) => map.set(key, (map.get(key) || 0) + 1);

for (const seed of seeds) {
  const original = Math.random;
  Math.random = seededRandom(seed);
  try {
    const engine = new SimEngine(
      makeClub(`home-${seed}`, 15),
      makeClub(`away-${seed}`, 15),
      { simulationProfile: "standard", timeStep, separationPasses: 8 }
    );
    const steps = Math.round((90 * 60) / timeStep);

    let episode = null;
    let seenEvents = 0;

    const closeEpisode = () => {
      if (!episode) return;
      const group = episode.kind === "carry" ? carry : episode.kind === "pass" ? passEntry : null;
      if (group) {
        if (episode.sawShot) group.shots++;
        if (episode.sawGoal) group.goals++;
      }
      episode = null;
    };

    for (let step = 0; step < steps; step++) {
      engine.step(timeStep);
      const b = engine.ball;
      const owner = b.owner ? engine.agentById(b.owner) : null;

      for (; seenEvents < engine.events.length; seenEvents++) {
        const ev = engine.events[seenEvents];
        if (!episode) continue;
        if (ev.type === "shot" && ev.team === episode.attacker) episode.sawShot = true;
        if (ev.type === "goal" && ev.team === episode.attacker && !ev.ownGoal) {
          episode.sawGoal = true;
        }
      }

      let inBoxDefender = null;
      if (engine._inOwnFoulBox("home", b.x, b.y)) inBoxDefender = "home";
      else if (engine._inOwnFoulBox("away", b.x, b.y)) inBoxDefender = "away";
      const attackingSide = inBoxDefender ? (inBoxDefender === "home" ? "away" : "home") : null;

      if (episode && inBoxDefender === episode.defender) episode.lastInsideAt = engine.t;

      // —— 新的一次进入 ——
      if (inBoxDefender && (!episode || episode.defender !== inBoxDefender)) {
        const liveBall = b.state !== "dead" && b.state !== "held";
        if (liveBall) {
          closeEpisode();
          // 分类必须与 `_box-entry-rate-probe.mjs` 逐字一致，否则两个探针对不上账。
          // 早期版本额外要求 `b.lastKicker === owner.id`，检出 0 次——带球时
          // lastKicker 往往是早先把球传给他的人，不是他自己。
          const byPass = b.state === "pass" && b.kickTeam === attackingSide;
          const carrying =
            !byPass &&
            b.state !== "shot" &&
            !!owner &&
            owner.team === attackingSide;
          const kind = carrying ? "carry" : byPass ? "pass" : "other";
          episode = {
            defender: inBoxDefender,
            attacker: attackingSide,
            kind,
            lastInsideAt: engine.t,
            sawShot: false,
            sawGoal: false,
          };

          // —— 越线那一帧的防守侧快照 ——
          const subject = carrying
            ? owner
            : b.receiverId
              ? engine.agentById(b.receiverId)
              : null;
          if ((kind === "carry" || kind === "pass") && subject) {
            const dir = engine.attackDir(attackingSide);
            let nearest = null;
            let nearestD = Infinity;
            let keeperD = Infinity;
            let n3 = 0;
            let n5 = 0;
            for (const d of engine.agents) {
              if (d.team !== inBoxDefender || d.sentOff) continue;
              const dd = distM(d.x, d.y, subject.x, subject.y);
              if (d.role === "GK") {
                keeperD = Math.min(keeperD, dd);
                continue;
              }
              if (dd < nearestD) {
                nearestD = dd;
                nearest = d;
              }
              if (dd <= 3) n3++;
              if (dd <= 5) n5++;
            }
            const group = kind === "carry" ? carry : passEntry;
            group.n++;
            if (nearest) {
              group.nearestDist.push(nearestD);
              // goal-side：防守者沿进攻方向比持球人更靠近本方球门
              const goalSide = dir > 0 ? nearest.y > subject.y : nearest.y < subject.y;
              if (goalSide) group.nearestGoalSide++;
              if (kind === "carry") bump(carry.nearestFsm, nearest.fsm || "?");
            }
            group.within3.push(n3);
            group.within5.push(n5);
            if (kind === "carry") {
              carry.keeperDist.push(Number.isFinite(keeperD) ? keeperD : 0);
              carry.speed.push(speedMps(subject));
              const label = engine._isWinger(subject)
                ? `${subject.role}(边)`
                : subject.role || "?";
              bump(carry.role, label);
            }
          }
        }
      }

      if (episode) {
        if (b.state === "dead") closeEpisode();
        else if (engine.t - episode.lastInsideAt > EXIT_GRACE) closeEpisode();
      }
    }
    closeEpisode();
  } finally {
    Math.random = original;
  }
}

const per = (value) => Number((value / seeds.length).toFixed(2));
const mapReport = (map, total) =>
  Object.fromEntries(
    [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => [k, `${v} (${pct(v, total)}%)`])
  );

console.log(`\n=== 带球越线进禁区时防守侧在哪（${seeds.length} 场，种子 ${seeds[0]}..${seeds[seeds.length - 1]}，宽限期 ${EXIT_GRACE}s）===`);
console.log(`\n带球越线 ${carry.n} 次（${per(carry.n)}/场）、传球进入 ${passEntry.n} 次（${per(passEntry.n)}/场）`);

console.log("\n[1] 越线瞬间最近防守者距离（米）——区分甲「无人拦阻」/ 乙「拦不住」的主证据：");
console.log(dist(carry.nearestDist));
console.log({
  "最近者在身前(goal-side)占比%": pct(carry.nearestGoalSide, carry.nearestDist.length),
  "最近者≤2m占比%": pct(carry.nearestDist.filter((d) => d <= 2).length, carry.nearestDist.length),
  "最近者≤3m占比%": pct(carry.nearestDist.filter((d) => d <= 3).length, carry.nearestDist.length),
  "最近者>5m占比%": pct(carry.nearestDist.filter((d) => d > 5).length, carry.nearestDist.length),
});

console.log("\n[2] 越线瞬间周边防守者人数（不含门将）与最近者的 fsm：");
console.log({
  "3m内人数(中位)": median(carry.within3),
  "5m内人数(中位)": median(carry.within5),
  "3m内为0人占比%": pct(carry.within3.filter((n) => n === 0).length, carry.within3.length),
  "最近门将距离(中位)": median(carry.keeperDist),
});
console.log("最近防守者的 fsm：", mapReport(carry.nearestFsm, carry.nearestDist.length));

console.log("\n[3] 越线者画像：");
console.log("role 分布：", mapReport(carry.role, carry.n));
console.log("越线瞬间速度(m/s)：", dist(carry.speed));

console.log("\n[4] 产出对照（防重演留档五：砍掉它会不会连进攻一起铲）：");
console.table([
  {
    进入方式: "带球越线",
    次数: carry.n,
    "每场": per(carry.n),
    "产生射门%": pct(carry.shots, carry.n),
    "产生进球%": pct(carry.goals, carry.n),
  },
  {
    进入方式: "传球进入",
    次数: passEntry.n,
    "每场": per(passEntry.n),
    "产生射门%": pct(passEntry.shots, passEntry.n),
    "产生进球%": pct(passEntry.goals, passEntry.n),
  },
]);

console.log("\n[5] 对照组：传球进入时接球人身边的防守者：");
console.log({
  "最近者距离(中位)": median(passEntry.nearestDist),
  "最近者在身前占比%": pct(passEntry.nearestGoalSide, passEntry.nearestDist.length),
  "3m内人数(中位)": median(passEntry.within3),
  "3m内为0人占比%": pct(passEntry.within3.filter((n) => n === 0).length, passEntry.within3.length),
});

console.log(`
判别：
  · 甲「无人拦阻」成立的标志——[1] 最近防守者距离中位偏大（>3~4m）或「在身前」占比低，
    且 [2] 3m 内为 0 人占比高。→ 杠杆在防守派工：禁区边缘缺一个拦阻职责，
    这是一条与留档一~六都不同的着力点。
  · 乙「拦不住」成立的标志——[1] 最近防守者本就贴身（≤2~3m 占多数）且多在身前。
    → 改派工无用，杠杆在对抗判定/减速/身体阻挡，需另找。
  · [4] 是动手前的安全闸门：若带球越线的射门/进球产出率明显低于传球进入，
    说明它主要是循环而非产出，压制它较安全；若持平或更高，任何压制都会重演
    留档五（进球 2.88→2.29、强队 62–33 被反超）。**先看这一栏再决定改不改。**
  · 口径限制见文件头；「身前」只算纵向 goal-side，未计横向偏移，是必要非充分条件。
`);
