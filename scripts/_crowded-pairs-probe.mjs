/**
 * 诊断：把 `box-defending-audit` 的 crowdedPairs episode 逐条打出来。
 *
 * 背景：该审计断言 `crowdedPairs <= 14`，注释写的实测基线是「4 场共 9 段」，
 * 但当前干净引擎实测已是 **12**——余量只剩 2，且这次漂移不是某一次改动引入的，
 * 是历次改动累积的结果。下次谁碰防守摆位/跑位都很容易撞上它。
 *
 * 本脚本复用审计完全相同的条件（种子 165000..165003、能力 12、标准档），
 * 把每一段重叠的「谁和谁、盯的哪个持球人、持续多久、在场上哪个位置、第几分钟」
 * 打出来，用于判断这 12 段是系统性模式（同一角色对、同一区域）还是零散噪声。
 *
 * 只读观察，不消费随机数，不进 `verify.mjs`（`_` 前缀按仓库惯例表示诊断脚本）。
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

// 场地纵向分区（按进攻方向归一化后描述），用于看重叠是否集中在某一带。
// 注意方向：SIM.HOME_GOAL_Y = 100，即主队**防守** y=100、进攻朝 y=0。
// 所以主队的推进度是 100 - y，客队是 y。（写反过一次，会把对方禁区标成本方三区。）
function zoneOf(y, team) {
  const attackY = team === "home" ? 100 - y : y;
  if (attackY >= 84) return "对方禁区纵深";
  if (attackY >= 66) return "进攻三区";
  if (attackY >= 34) return "中场";
  return "本方三区";
}

const roleOf = (id, engine) => engine.agents.find((a) => a.id === id)?.role || "?";

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
              // 记录开始时的现场，便于事后归因
              roleA: a.role,
              roleB: b.role,
              team: a.team,
              zone: zoneOf((a.ty + b.ty) / 2, a.team),
              targetKindA: a.offBallTarget?.kind || "?",
              targetKindB: b.offBallTarget?.kind || "?",
              ownerRole: roleOf(a.offBallTarget.ownerId, engine),
              gap: distanceMetres(a.tx, a.ty, b.tx, b.ty),
            });
          }
        }
      }
      for (const [key, info] of [...openCrowding]) {
        if (seen.has(key)) continue;
        const held = engine.t - info.t;
        if (held >= 0.6) {
          episodes.push({
            seed,
            minute: Math.floor(info.t / 60),
            heldSeconds: Number(held.toFixed(2)),
            team: info.team,
            rolePair: [info.roleA, info.roleB].sort().join("+"),
            ownerRole: info.ownerRole,
            zone: info.zone,
            targetKinds: [info.targetKindA, info.targetKindB].sort().join("+"),
            startGapMetres: Number(info.gap.toFixed(2)),
          });
        }
        openCrowding.delete(key);
      }
    }
  } finally {
    Math.random = original;
  }
}

const tally = (key) => {
  const counts = {};
  for (const e of episodes) counts[e[key]] = (counts[e[key]] || 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1]));
};

console.log(JSON.stringify({
  totalEpisodes: episodes.length,
  threshold: 14,
  auditCommentBaseline: 9,
  byRolePair: tally("rolePair"),
  byZone: tally("zone"),
  byOwnerRole: tally("ownerRole"),
  byTargetKinds: tally("targetKinds"),
  bySeed: tally("seed"),
  longestHeld: episodes.length
    ? Math.max(...episodes.map((e) => e.heldSeconds))
    : 0,
  medianHeld: (() => {
    if (!episodes.length) return 0;
    const s = episodes.map((e) => e.heldSeconds).sort((a, b) => a - b);
    const m = s.length >> 1;
    return Number((s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2).toFixed(2));
  })(),
  episodes,
}, null, 2));
