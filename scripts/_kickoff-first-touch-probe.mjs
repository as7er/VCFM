/**
 * 探针：开球的首脚到底是传球还是向后带球。
 *
 * 背景（两个独立调查的交汇点）：引擎里**没有「开球」这种重启类型**——`_kickoff`
 * 显式把 `ball.restartType = null`，所以界外球/间接任意球那条「首脚必须传」的规则
 * （`_decideOnBall:2217`）完全绕过了开球，开球掉进普通运动战逻辑。而开球时队友
 * 全在球身后 → `advance` 为负 → 传球价值被压到 ±0.05（正常运动战 0.4~0.85）。
 * 再叠上两处让球往后走的机制：
 *   1. `_kickoff` 重置了 x/y/tx/ty/vx/vy/intent/fsm，**漏了 heading**，而球被钉在
 *      持球者 heading 前方 1.4 格；丢球方在庆祝时朝自己球门走，那个朝向没被清。
 *   2. `hold` 意图把身体转成「背对最近对手」，而开球时按 Law 8 对手全在另半场，
 *      于是这个朝向必然指向自己球门。
 *
 * 本探针量三件事，逐次开球记录：首脚是不是传球、首脚耗时、开球后 2s 内球沿
 * **进攻方向**的净位移（负值 = 往自己球门走）。
 *
 * 口径：种子 372000..、能力 15、标准档、0.1s 步长，与其他探针一致。
 * 用法：node scripts/_kickoff-first-touch-probe.mjs [场数=6]
 */
import { SimEngine, SIM } from "../js/sim/engine.js";

const matches = Math.max(2, Number(process.argv[2]) || 6);
const seeds = Array.from({ length: matches }, (_, i) => 372000 + i);
const DT = SIM.DT;
const MX = SIM.PITCH_W_METRES / SIM.FIELD_W;
const MY = SIM.PITCH_H_METRES / SIM.FIELD_H;
const WINDOW = 2.0; // 量净位移的窗口（秒）
const PASS_WINDOW = 4.0; // 首脚必须在这个窗口内出现才算「传出去了」

const q = (v, p) => {
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b);
  return Number(s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(2));
};
const mean = (v) => (v.length ? Number((v.reduce((a, b) => a + b, 0) / v.length).toFixed(2)) : 0);
const pct = (n, d) => Number(((n / Math.max(1, d)) * 100).toFixed(1));

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
    ]) attrs[key] = rating;
    return { id, name: id, pos, number: index + 1, fitness: 100, attrs };
  });
  return {
    id: name, name, players,
    tactics: { formation: "4-3-3", lineup: players.map((p) => p.id), pressing: 3, tempo: 3, defensiveLine: 3, style: "balanced" },
  };
}

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

const kickoffs = [];
for (const seed of seeds) {
  const restore = Math.random;
  Math.random = seededRandom(seed);
  try {
    const engine = new SimEngine(makeClub(`h${seed}`, 15), makeClub(`a${seed}`, 15), {
      simulationProfile: "standard", timeStep: DT, separationPasses: 8,
    });
    const steps = Math.round((90 * 60) / DT);
    let pending = null;
    let prevKickoffFlag = 0;
    for (let s = 0; s < steps; s++) {
      engine.step(DT);
      const b = engine.ball;

      // 开球检测用 `_kickoff` 设的那个标志的**上升沿**：它只在 `_kickoff` 里被设，
      // 唯一无歧义。第一版用「球在中点且被持有」，会把运动战里带球经过中圈
      // 误判成开球（6 场检出 18 次，而 2 半场 + 约 2.9 个进球应有约 4.9 次/场）。
      const flag = b.kickoffPassUntil || 0;
      if (flag > prevKickoffFlag && !pending) {
        const taker = engine.agents.find((a) => a.id === b.owner);
        if (taker) {
          const dir = engine.attackDir(taker.team);
          let nd = Infinity;
          for (const a of engine.agents) {
            if (a.team !== taker.team || a.sentOff || a.role === "GK" || a.id === taker.id) continue;
            nd = Math.min(nd, Math.hypot((a.x - 50) * MX, (a.y - 50) * MY));
          }
          pending = {
            t0: engine.t, dir, team: taker.team, takerId: taker.id,
            nearestMateM: Number(nd.toFixed(2)),
            passed: false, passAt: null, netForwardM: null,
          };
        }
      }
      prevKickoffFlag = flag;

      if (pending) {
        const age = engine.t - pending.t0;
        // 首脚：球离脚进入飞行，且还是开球方踢的
        if (!pending.passed && age <= PASS_WINDOW && (b.state === "pass" || b.state === "shot")) {
          pending.passed = true;
          pending.passAt = Number(age.toFixed(2));
        }
        if (pending.netForwardM == null && age >= WINDOW) {
          // 沿进攻方向的净位移：正 = 朝对方球门
          pending.netForwardM = Number(((b.y - 50) * pending.dir * MY).toFixed(2));
        }
        if (age >= PASS_WINDOW) {
          if (pending.netForwardM == null) pending.netForwardM = 0;
          kickoffs.push(pending);
          pending = null;
        }
      }
    }
  } finally {
    Math.random = restore;
  }
}

const passed = kickoffs.filter((k) => k.passed);
const back = kickoffs.filter((k) => k.netForwardM < 0);
console.log(JSON.stringify({
  matches,
  seeds: { first: seeds[0], last: seeds.at(-1) },
  开球次数: kickoffs.length,
  每场开球: Number((kickoffs.length / matches).toFixed(2)),
  首脚是传球占比: pct(passed.length, kickoffs.length),
  首脚耗时中位s: q(passed.map((k) => k.passAt), 0.5),
  [`开球后${WINDOW}s球沿进攻方向净位移m`]: {
    中位: q(kickoffs.map((k) => k.netForwardM), 0.5),
    均值: mean(kickoffs.map((k) => k.netForwardM)),
    最小: q(kickoffs.map((k) => k.netForwardM), 0),
    往自己球门的占比: pct(back.length, kickoffs.length),
  },
  摆位时最近队友距球m: {
    中位: q(kickoffs.map((k) => k.nearestMateM), 0.5),
    最小: q(kickoffs.map((k) => k.nearestMateM), 0),
  },
}, null, 2));
console.log(`
想看到的：首脚是传球占比接近 100%、净位移中位为正（朝对方球门）、
最近队友距球 5~10m（真实开球旁边就有伙伴）。
「往自己球门的占比」是这次修复的主指标——你在画面上看到的就是它。`);
