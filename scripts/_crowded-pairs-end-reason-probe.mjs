/**
 * 诊断：`crowdedPairs` 重叠段为什么**同时**结束——特别是 AGENTS.md #1 里
 * 「12 段中有 5 段持续时间恰好都是 5.1 秒」这条未解开的观察。
 *
 * 已排除的解释（勿重复走）：
 *   - `off-ball-movement.js` 的 `leaseSeconds` 是 1.5 秒，且 `holdPrevious` 分支
 *     原样透传旧的 `until`（不续租），所以租约本身封顶 1.5 秒，给不出 5.1。
 *   - `engine.js:3981` 的 `5.1` 是防守 support 距离、单位是**米**，与秒无关。
 *
 * 本次假设：`teamShapePhase` 的 ATTACKING_TRANSITION → IN_POSSESSION 翻转。
 * 该翻转发生在 `now - gainedAt >= attackSeconds`，而 attackSeconds 由战术推导
 * （`clamp(4.7 + (tempo-3)*0.55 + styleAdj, 2.8, 8.8)`，本探针的球队为 4.7）。
 * 翻转会让 off-ball 租约的 `sameContext`（要求 `previous.phase === phase`）
 * 整体失效，从而可能让所有 support 目标在同一帧重算。
 *
 * 口径与 `_crowded-pairs-probe.mjs` 完全一致（同种子、同能力、同档、同 1.6m/0.6s 门槛），
 * 只增记每段结束时的归因字段。只读观察，不消费随机数，不进 `verify.mjs`。
 */
import { SimEngine, SIM } from "../js/sim/engine.js";
import { teamShapeProfile } from "../js/team-shapes.js";

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
      "positioning", "kicking", "decisions",
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
const distanceMetres = (ax, ay, bx, by) =>
  Math.hypot((ax - bx) * METRES_X, (ay - by) * METRES_Y);

const roleOf = (id, engine) => engine.agents.find((a) => a.id === id)?.role || "?";

/** 一段重叠不再匹配时，判断是哪个条件先破——用于区分「目标重算」与「人真的散开」。 */
function endReasonFor(a, b, ownerId) {
  if (!a || !b) return "球员消失/被罚下";
  if (a.fsm !== "support" || b.fsm !== "support") return "离开 support 职责";
  if (a.offBallTarget?.ownerId == null || b.offBallTarget?.ownerId == null) return "目标无持球人";
  if (a.offBallTarget.ownerId !== ownerId || b.offBallTarget.ownerId !== ownerId) return "持球人易主";
  if (distanceMetres(a.tx, a.ty, b.tx, b.ty) >= 1.6) return "目标点被拉开";
  return "其他";
}

const episodes = [];
const seeds = [165000, 165001, 165002, 165003];
const step = SIM.DT;

for (const seed of seeds) {
  const original = Math.random;
  Math.random = seededRandom(seed);
  const openCrowding = new Map();
  try {
    const engine = new SimEngine(
      makeClub(`home-${seed}`, 12),
      makeClub(`away-${seed}`, 12),
      { simulationProfile: "standard", timeStep: step, separationPasses: 8 }
    );
    const attackSecondsOf = (team) =>
      teamShapeProfile(engine._teamTactics(team)).transition.attackSeconds;

    const steps = Math.round((90 * 60) / step);
    for (let index = 0; index < steps; index++) {
      engine.step(step);
      const ball = engine.ball;
      if (ball.restartType) {
        openCrowding.clear();
        continue;
      }
      const supports = engine.agents.filter(
        (agent) => !agent.sentOff && agent.fsm === "support" && agent.offBallTarget?.ownerId != null
      );
      const seen = new Set();
      for (let i = 0; i < supports.length; i++) {
        for (let j = i + 1; j < supports.length; j++) {
          const a = supports[i];
          const b = supports[j];
          if (a.team !== b.team) continue;
          if (a.offBallTarget.ownerId !== b.offBallTarget.ownerId) continue;
          if (distanceMetres(a.tx, a.ty, b.tx, b.ty) >= 1.6) continue;
          const pair = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
          const key = `${a.offBallTarget.ownerId}|${pair}`;
          seen.add(key);
          if (!openCrowding.has(key)) {
            openCrowding.set(key, {
              t: engine.t,
              team: a.team,
              idA: a.id,
              idB: b.id,
              ownerId: a.offBallTarget.ownerId,
              ownerRole: roleOf(a.offBallTarget.ownerId, engine),
              // 归因用：段开始时这次进攻已经持续多久、以及本队的相位翻转阈值
              gainedAt: engine._teamGainAt[a.team] || 0,
              attackAgeAtStart: Math.max(0, engine.t - (engine._teamGainAt[a.team] || 0)),
              attackSeconds: attackSecondsOf(a.team),
              phaseAtStart: engine.teamPhases[a.team],
            });
          }
        }
      }
      for (const [key, info] of [...openCrowding]) {
        if (seen.has(key)) continue;
        const held = engine.t - info.t;
        if (held >= 0.6) {
          const a = engine.agents.find((p) => p.id === info.idA);
          const b = engine.agents.find((p) => p.id === info.idB);
          const gainedAtEnd = engine._teamGainAt[info.team] || 0;
          const attackAgeAtEnd = Math.max(0, engine.t - gainedAtEnd);
          episodes.push({
            seed,
            minute: Math.floor(info.t / 60),
            heldSeconds: Number(held.toFixed(2)),
            ownerRole: info.ownerRole,
            attackSeconds: Number(info.attackSeconds.toFixed(2)),
            attackAgeAtStart: Number(info.attackAgeAtStart.toFixed(2)),
            attackAgeAtEnd: Number(attackAgeAtEnd.toFixed(2)),
            // 段中相位是否翻转过（gainedAt 未变 = 同一次进攻）
            sameAttack: Math.abs(gainedAtEnd - info.gainedAt) < 1e-9,
            phaseAtStart: info.phaseAtStart,
            phaseAtEnd: engine.teamPhases[info.team],
            endReason: endReasonFor(a, b, info.ownerId),
          });
        }
        openCrowding.delete(key);
      }
    }
  } finally {
    Math.random = original;
  }
}

console.log(`总段数 ${episodes.length}\n`);

console.log("持续时长分布：");
const byHeld = new Map();
for (const e of episodes) byHeld.set(e.heldSeconds, (byHeld.get(e.heldSeconds) || 0) + 1);
for (const [held, count] of [...byHeld].sort((x, y) => y[1] - x[1] || x[0] - y[0])) {
  console.log(`  ${held.toFixed(2)}s × ${count}`);
}

console.log("\n结束原因分布：");
const byReason = new Map();
for (const e of episodes) byReason.set(e.endReason, (byReason.get(e.endReason) || 0) + 1);
for (const [reason, count] of [...byReason].sort((x, y) => y[1] - x[1])) {
  console.log(`  ${reason} × ${count}`);
}

console.log("\n逐段明细：");
console.table(episodes);

// 关键判定：段结束时 attackAge 是否正好压在 attackSeconds 阈值上。
// 若成立，说明相位翻转（而非球员散开）是同步终止这些段的定时器。
const nearFlip = episodes.filter(
  (e) => e.sameAttack && Math.abs(e.attackAgeAtEnd - e.attackSeconds) <= 0.15
);
console.log(
  `\n结束时刻正好落在相位翻转阈值上（同一次进攻内、误差 ≤0.15s）：${nearFlip.length}/${episodes.length}`
);
