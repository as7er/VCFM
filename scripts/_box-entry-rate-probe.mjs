/**
 * 诊断（往上游走）：球每场**进入**对方禁区多少次、靠什么机制进去、每次进去能待多久。
 *
 * 为什么查这个（AGENTS.md v239 遗留 #1 + 留档五/六）：
 * 禁区时长 1092 秒/场（真实推测 60~90），差 10 倍量级。但已封死三个单边杠杆：
 * 放开射门破上限（留档二）、收紧 support 目标破下限（留档五）、distPen 拥堵敏感
 * 波及全场传球（留档四）。留档六进一步证明产出与循环是同一批长停留，
 * **任何只压缩停留时长的手段都会按比例削掉进球**。而留档五那个已破下限的硬 clamp
 * 也只把 1092 压到 980（−10%）——手段的天花板远低于 10 倍的差距。
 *
 * 所以问题要换成：**球凭什么能一场进禁区那么多次**。
 *
 * ⚠️ 先纠正一个容易搞错的量级（我自己先错过一次）：
 * `box-possession-sampling-audit` 的 `boxSpells` = 346/场是**禁区内持球回合数**，
 * 不是进入次数——禁区内传给队友会结束一个回合、开启下一个（留区传球占 58.3%），
 * 所以 346 里含大量同一次进入内部的连续倒脚。本脚本量的是**球跨过禁区线的次数**，
 * 两者不可混用。
 *
 * 输出五组：
 *   1. 每场进入次数，以及 1092 秒的分解：进入次数 × 每次时长 = 总时长。
 *      这决定该攻「进入率」还是「每次时长」——前者是上游，后者已被留档六封死。
 *   2. 进入机制归因：传中 / 直塞 / 普通传球 / 带球越线 / 二次球（无主进入）/ 定位球。
 *      占比最大的那一类就是上游杠杆所在。
 *   3. 每次进入的时长分布与「撑出几个回合」，验证 346 与进入次数的关系。
 *   4. 每次进入的结束方式：射门 / 被清 / 丢失 / 传出禁区 / 死球。
 *      真实足球里一次进入通常很快终结，若这里以「传出又传回」为主则是循环的来源。
 *   5. 重复进入：同一波进攻（未被对方夺回）内球反复进出禁区的次数。
 *
 * 口径与 `_box-receiver-occupancy-probe.mjs` / `_box-dwell-outcome-probe.mjs` 一致：
 * 同种子起点 372000、能力 15、标准档、禁区判定沿用引擎 `_inOwnFoulBox`。
 * 全程只读引擎公开状态，不消费随机数，同种子下开关本脚本不改变比分。
 * `_` 前缀按仓库惯例表示诊断脚本，不进 `verify.mjs`。
 *
 * 两个必须知道的口径限制：
 *   · 「进入」以**球的坐标**跨线计，且要求进攻方在该帧持球或刚起脚；门将在自己禁区
 *     持球不计。飞行中的传球在**落点/被接管那一刻**才算进入，与 `boxSeconds` 的
 *     「持球者在禁区内」口径不同，所以本脚本同时报 ownedSeconds 供对账。
 *   · 机制归因读的是进入那一帧的 `b.isCrossPass` / `b.isThroughPass` / `b.restartType`，
 *     二次球（无 owner 的散球滚入）归为 rebound。快攻里连续事件可能错配，
 *     量级可信、绝对值不可当精确数。
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

let entries = 0;
let ownedSeconds = 0;
let ballInsideSeconds = 0;
const entryMechanism = new Map();
const entryEndReason = new Map();
const entryDurations = [];
const spellsPerEntry = [];
const reEntriesPerAttack = [];

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

    // —— 纯几何 episode 判定 ——
    // 早期版本用「进攻方是否在场」开合，结果在相邻帧反复触发（时长中位 0 秒、
    // 定位球占 50%）：传球飞行途中 owner 为 null、散球或防守方短暂触球又翻回 false。
    // 改为以球的坐标跨禁区线为准，并把短于 EXIT_GRACE 的出线合并进同一次进入
    // （球在边线上蹭一下不算离开）。
    // 宽限期可由第二个参数覆盖，用于敏感度测试：进入次数若随它剧烈变化，
    // 说明大量「进入」其实是球在禁区线上蹭动，不是真的新进攻。
    const EXIT_GRACE = Number(process.argv[3]) || 0.4;
    let episode = null; // { defender, attacker, start, owners:Set, sawShot, lastInsideAt }
    let attackTeam = null;
    let reEntries = 0;
    let seenEvents = 0;

    const closeEpisode = (reason, endedAt) => {
      if (!episode) return;
      entries++;
      entryDurations.push(Math.max(0, endedAt - episode.start));
      spellsPerEntry.push(episode.owners.size);
      bump(entryEndReason, reason);
      episode = null;
    };

    for (let step = 0; step < steps; step++) {
      engine.step(timeStep);
      const b = engine.ball;
      const owner = b.owner ? engine.agentById(b.owner) : null;

      for (; seenEvents < engine.events.length; seenEvents++) {
        const ev = engine.events[seenEvents];
        if (ev.type === "shot" && episode) episode.sawShot = true;
      }

      // 球此刻几何上在哪一方的禁区内
      let inBoxDefender = null;
      if (engine._inOwnFoulBox("home", b.x, b.y)) inBoxDefender = "home";
      else if (engine._inOwnFoulBox("away", b.x, b.y)) inBoxDefender = "away";
      const attackingSide = inBoxDefender ? (inBoxDefender === "home" ? "away" : "home") : null;

      if (inBoxDefender) ballInsideSeconds += timeStep;
      // 与 boxSeconds 对账口径：进攻方球员持球且在对方禁区内
      if (owner && inBoxDefender && owner.team === attackingSide) {
        ownedSeconds += timeStep;
      }

      // 追踪「这波进攻」的持球方，用于重复进入统计
      if (owner) {
        if (attackTeam && owner.team !== attackTeam) {
          // 攻防转换：结算上一波的重复进入
          if (reEntries > 0) reEntriesPerAttack.push(reEntries);
          reEntries = 0;
        }
        attackTeam = owner.team;
      }

      // —— 同一次进入内部：球短暂出线不算离开 ——
      if (episode && inBoxDefender === episode.defender) {
        episode.lastInsideAt = engine.t;
        if (owner && owner.team === episode.attacker) episode.owners.add(owner.id);
      }

      // —— 开新的一次进入：球跨线进入某方禁区，且不是死球摆位 ——
      if (inBoxDefender && (!episode || episode.defender !== inBoxDefender)) {
        const liveBall = b.state !== "dead" && b.state !== "held";
        if (liveBall) {
          if (episode) closeEpisode("切换到另一侧禁区", episode.lastInsideAt);
          episode = {
            defender: inBoxDefender,
            attacker: attackingSide,
            start: engine.t,
            owners: new Set(),
            sawShot: false,
            lastInsideAt: engine.t,
          };
          reEntries++;
          if (owner && owner.team === attackingSide) episode.owners.add(owner.id);

          // 机制归因：读进入那一帧的球状态
          const kickFromOutside =
            Number.isFinite(b.kickX) && Number.isFinite(b.kickY)
              ? !engine._inOwnFoulBox(inBoxDefender, b.kickX, b.kickY)
              : true;
          let mechanism;
          if (b.restartType) mechanism = `定位球(${b.restartType})`;
          else if (b.state === "penalty") mechanism = "定位球(penalty)";
          else if (b.state === "shot") mechanism = "射门/折射滚入";
          else if (b.state === "pass" && b.kickTeam === attackingSide) {
            // 起脚点在同一禁区内 = 球被从禁区里传出去、又滚/传回来。
            // 这类本身就是循环的一部分，不是一次新的进攻进入。
            if (!kickFromOutside) mechanism = "出区后又回流(非新进攻)";
            else if (b.isCrossPass) mechanism = "传中";
            else if (b.isThroughPass) mechanism = "直塞";
            else mechanism = "普通传球";
          } else if (b.state === "pass") mechanism = "防守方解围/回传滚入";
          else if (owner && owner.team === attackingSide) mechanism = "带球越线";
          else if (!owner) mechanism = "二次球/散球滚入";
          else mechanism = "防守方持球带回";
          bump(entryMechanism, mechanism);
        }
      }

      // —— 结束判定：出线超过宽限期，或死球 ——
      if (episode) {
        const outFor = engine.t - episode.lastInsideAt;
        if (b.state === "dead") {
          closeEpisode(episode.sawShot ? "射门后死球" : "死球", episode.lastInsideAt);
        } else if (outFor > EXIT_GRACE) {
          const reason = episode.sawShot
            ? "射门后出区"
            : owner && owner.team === episode.defender
              ? "被防守方夺回/清空"
              : "传/带出禁区";
          closeEpisode(reason, episode.lastInsideAt);
        }
      }
    }
    if (reEntries > 0) reEntriesPerAttack.push(reEntries);
    if (episode) closeEpisode("终场未结算", episode.lastInsideAt);
  } finally {
    Math.random = original;
  }
}

const per = (value) => Number((value / seeds.length).toFixed(2));
const mapReport = (map, total) =>
  Object.fromEntries(
    [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => [k, `${v} (${pct(v, total)}%)  ${per(v)}/场`])
  );

console.log(`\n=== 球进入对方禁区的频率与机制（${seeds.length} 场，种子 ${seeds[0]}..${seeds[seeds.length - 1]}）===`);

console.log("\n[1] 时长分解——决定该攻「进入率」还是「每次时长」：");
console.log({
  "进入次数/场": per(entries),
  "进攻方持球在禁区内秒数/场": per(ownedSeconds),
  "球在禁区内秒数/场(含飞行/防守方)": per(ballInsideSeconds),
  "每次进入的持续秒数(中位)": median(entryDurations),
  "对账 boxSeconds 基线": 1092.12,
});

console.log("\n[2] 进入机制归因（占比最大者即上游杠杆）：");
console.log(mapReport(entryMechanism, entries));

console.log("\n[3] 每次进入的时长分布（秒）与撑出的回合数：");
console.log({
  n: entryDurations.length,
  中位: median(entryDurations),
  p25: quantile(entryDurations, 0.25),
  p75: quantile(entryDurations, 0.75),
  p90: quantile(entryDurations, 0.9),
  最长: Number(Math.max(0, ...entryDurations).toFixed(2)),
  "每次进入的不同持球人数(中位)": median(spellsPerEntry),
  "对账 boxSpells 基线(回合/场)": 346,
});

console.log("\n[4] 每次进入的结束方式：");
console.log(mapReport(entryEndReason, entries));

console.log("\n[5] 同一波进攻内球反复进出禁区的次数：");
console.log({
  n: reEntriesPerAttack.length,
  中位: median(reEntriesPerAttack),
  p75: quantile(reEntriesPerAttack, 0.75),
  p90: quantile(reEntriesPerAttack, 0.9),
  最多: Math.max(0, ...reEntriesPerAttack),
});

console.log(`
判别：
  · 若「进入次数/场」远超真实足球量级（真实一场约 30~50 次），且时长分解显示
    总时长主要由**次数**而非**每次时长**贡献 → 上游杠杆在「球凭什么进禁区」，
    即 [2] 里占比最大的那类机制，与留档六封死的「压缩停留」是不同的着力点。
  · 若总时长主要由**每次时长**贡献（次数不多但每次很久）→ 回到停留问题，
    而停留已被留档六证明与进球同源，需另找出路（成对改动）。
  · [4] 若以「传/带出禁区」为主而射门占比极低，说明球进禁区后被倒出又倒回，
    结合 [5] 的重复进入次数即可确认循环是「进出型」还是「驻留型」。
  · 口径限制见文件头：ownedSeconds 与 boxSeconds 口径接近可对账，
    ballInsideSeconds 含飞行与防守方持球，必然更大，不可与 1092 直接比。
`);
