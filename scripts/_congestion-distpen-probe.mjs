/**
 * 诊断：把 `distPen` 改成「对拥堵度敏感」之后，禁区内传球的排序会不会翻转到出禁区，
 * 以及这个改动会波及多少**非禁区**传球（= 对传球总量 800~1250 与成功率 72~88% 的风险）。
 *
 * 背景（AGENTS.md v239 遗留 #1）：已量出禁区内传球 value 的主导项是
 *     distPen = clamp(1 - d / 55, 0.2, 1)
 * 它单纯奖励短传，而禁区内的选项全是短传。最尖锐的一条：出禁区其实**更安全**
 * （safety 0.338 vs 0.219）却仍评分更低，因为距离惩罚吃掉了安全收益。
 * AGENTS.md 明确警告**不要全局调小 distPen**——那会让中后场长传一起变便宜。
 *
 * 因此候选改法是让距离惩罚只在拥堵时放宽：
 *     distPen = clamp(1 - d / (55 * (1 + k * c)), 0.2, 1)
 * c 为拥堵度 ∈ [0,1]。**c = 0 时与现状逐位相同**（这是安全性质，不是巧合）：
 * 不拥堵的传球按构造完全不受影响，中后场长传的定价不变。
 *
 * 本脚本只测量、不改引擎，回答三个问题：
 *   1. 拥堵度该怎么定标——先看「出脚人周围 8m 内对方球员数」的真实分布，
 *      而不是先猜一个断点（AGENTS.md 两次失败都源于「故事说得通就直接调参数」）。
 *   2. 翻转率——855 次「留在禁区」的传球里，有多少会把最佳出禁区备选排到前面。
 *   3. 波及面——非禁区传球里有多少条的 distPen 发生了实质变化（>2%）。
 *
 * 口径与 `_box-pass-value-probe.mjs` 完全一致（同种子 372000..372005、能力 15、标准档、
 * 同一套因子复算、同样不含直塞加成），以便与该探针已留档的基线直接对比。
 * 不调用 `_passCandidates`（它会消耗随机数：engine.js:2875/2878 的直塞识别与落点抖动），
 * 全程不消费随机数，同种子下开关本脚本不改变比分。
 *
 * `_` 前缀按仓库惯例表示诊断脚本，不进 `verify.mjs`。
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
const metresBetween = (ax, ay, bx, by) =>
  Math.hypot((ax - bx) * METRES_X, (ay - by) * METRES_Y);

const median = (values) => {
  if (!values.length) return 0;
  const s = [...values].sort((x, y) => x - y);
  const m = s.length >> 1;
  return Number((s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2).toFixed(3));
};
const pct = (num, den) => Number(((num / Math.max(1, den)) * 100).toFixed(1));

/**
 * 拥堵度：出脚人周围 `radiusMetres` 内的对方非门将球员数。
 * 注意单位——引擎坐标不是米（x 一格 0.68m、y 一格 1.05m），必须换算后再比距离。
 * AGENTS.md v238/v239 都记过混单位导致的误判，这里显式走 metresBetween。
 */
function opponentsNear(engine, x, y, team, radiusMetres) {
  let n = 0;
  for (const p of engine.agents) {
    if (p.team === team || p.sentOff || p.role === "GK") continue;
    if (metresBetween(x, y, p.x, p.y) <= radiusMetres) n++;
  }
  return n;
}

// 与 engine.js `_passCandidates` 的普通传球同式（不含直塞、越位、回做等修正项）。
// `divisorScale` = 1 时逐位等于现状；候选改法只通过放大分母来放宽长传扣分。
function baseFactors(engine, a, m, tx, ty, divisorScale = 1) {
  const goalY = engine.targetGoalY(a.team);
  const d = Math.hypot(a.x - m.x, a.y - m.y);
  const myProg = Math.abs(a.y - goalY);
  const mProg = Math.abs(m.y - goalY);
  const advance = Math.max(-0.5, Math.min(1, (myProg - mProg) / 40));
  const distPen = Math.max(0.2, Math.min(1, 1 - d / (55 * divisorScale)));
  const coreBoost = m.isCore ? 1.65 : 1;
  const safety = engine._laneSafety(a, m, tx, ty);
  const first = 0.35 + advance;
  return {
    first,
    advance,
    safety,
    distPen,
    coreBoost,
    value: first * safety * distPen * coreBoost,
    distanceUnits: d,
  };
}

// 候选变体：c 由对手数经断点映射到 [0,1]，k 为放宽强度。
// 变体只在此处定义，engine 完全不动；目的是先拿到翻转率与波及面再决定动哪一个。
const VARIANTS = [
  { id: "k0.6/断点1-4", k: 0.6, minOpp: 1, maxOpp: 4 },
  { id: "k1.0/断点1-4", k: 1.0, minOpp: 1, maxOpp: 4 },
  { id: "k1.0/断点2-5", k: 1.0, minOpp: 2, maxOpp: 5 },
  { id: "k1.6/断点2-5", k: 1.6, minOpp: 2, maxOpp: 5 },
];
const congestionOf = (opp, v) =>
  Math.max(0, Math.min(1, (opp - v.minOpp) / Math.max(1e-9, v.maxOpp - v.minOpp)));
const scaleOf = (opp, v) => 1 + v.k * congestionOf(opp, v);

const CONGESTION_RADIUS_M = 8;
const seeds = [372000, 372001, 372002, 372003, 372004, 372005];
const timeStep = SIM.DT;

// 拥堵度定标用的原始分布
const oppCounts = { boxStay: [], boxExit: [], nonBox: [] };
// 每个变体的翻转统计与波及面
const stats = VARIANTS.map((v) => ({
  variant: v,
  flips: 0,
  considered: 0,
  marginBefore: [],
  marginAfter: [],
  nonBoxTouched: 0,
  nonBoxTotal: 0,
  nonBoxDistPenLift: [],
}));

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
    let prevOwnerId = null;
    let prevOwnerX = 0;
    let prevOwnerY = 0;
    let prevOwnerTeam = null;
    let lastSeenPassAt = -1;

    for (let step = 0; step < steps; step++) {
      engine.step(timeStep);
      const b = engine.ball;
      const passAt = b.lastPassAt || 0;
      const isFreshPass =
        b.state === "pass" && passAt !== lastSeenPassAt && b.lastPasserId != null;

      if (isFreshPass) {
        lastSeenPassAt = passAt;
        const passer = engine.agentById(b.lastPasserId);
        const px = passer && b.lastPasserId === prevOwnerId ? prevOwnerX : passer?.x;
        const py = passer && b.lastPasserId === prevOwnerId ? prevOwnerY : passer?.y;
        const team = passer?.team || prevOwnerTeam;
        if (passer && Number.isFinite(px) && Number.isFinite(py) && team) {
          const defendingTeam = team === "home" ? "away" : "home";
          const inBox = engine._inOwnFoulBox(defendingTeam, px, py);
          const opp = opponentsNear(engine, px, py, team, CONGESTION_RADIUS_M);
          const receiver = b.receiverId ? engine.agentById(b.receiverId) : null;
          const shell = { x: px, y: py, team, attr: passer.attr, isCore: passer.isCore };

          if (!inBox && receiver && Number.isFinite(b.targetX) && Number.isFinite(b.targetY)) {
            // 波及面：非禁区的真实传球，distPen 是否被这个变体动了
            oppCounts.nonBox.push(opp);
            const cur = baseFactors(engine, shell, receiver, b.targetX, b.targetY, 1);
            for (const s of stats) {
              s.nonBoxTotal++;
              const alt = baseFactors(
                engine, shell, receiver, b.targetX, b.targetY, scaleOf(opp, s.variant)
              );
              const lift = alt.distPen / Math.max(1e-9, cur.distPen) - 1;
              if (lift > 0.02) {
                s.nonBoxTouched++;
                s.nonBoxDistPenLift.push(lift);
              }
            }
          }

          if (
            inBox &&
            receiver &&
            Number.isFinite(b.targetX) &&
            Number.isFinite(b.targetY)
          ) {
            const stays = engine._inOwnFoulBox(defendingTeam, b.targetX, b.targetY);
            (stays ? oppCounts.boxStay : oppCounts.boxExit).push(opp);

            if (stays) {
              // 找最佳出禁区备选，同一套可行域（与 _box-pass-value-probe 一致）
              const exitCandidates = [];
              for (const m of engine.agents) {
                if (m === passer || m.team !== team || m.sentOff) continue;
                if (m.role === "GK") continue;
                const d = Math.hypot(px - m.x, py - m.y);
                if (d < 6 || d > 45) continue;
                if (engine._inOwnFoulBox(defendingTeam, m.x, m.y)) continue;
                exitCandidates.push(m);
              }
              if (exitCandidates.length) {
                for (const s of stats) {
                  const scale = scaleOf(opp, s.variant);
                  // 留在禁区的这一脚同样按新公式重算（短传，放宽后几乎不变，但要一致处理）
                  const stayNew = baseFactors(
                    engine, shell, receiver, b.targetX, b.targetY, scale
                  );
                  const stayOld = baseFactors(
                    engine, shell, receiver, b.targetX, b.targetY, 1
                  );
                  let bestNew = null;
                  let bestOld = null;
                  for (const m of exitCandidates) {
                    const fNew = baseFactors(engine, shell, m, m.x, m.y, scale);
                    const fOld = baseFactors(engine, shell, m, m.x, m.y, 1);
                    if (!bestNew || fNew.value > bestNew.value) bestNew = fNew;
                    if (!bestOld || fOld.value > bestOld.value) bestOld = fOld;
                  }
                  s.considered++;
                  s.marginBefore.push(stayOld.value - bestOld.value);
                  s.marginAfter.push(stayNew.value - bestNew.value);
                  // 翻转 = 改动前留在禁区占优，改动后出禁区占优
                  if (stayOld.value >= bestOld.value && bestNew.value > stayNew.value) s.flips++;
                }
              }
            }
          }
        }
      }

      const owner = b.owner ? engine.agentById(b.owner) : null;
      if (owner) {
        prevOwnerId = owner.id;
        prevOwnerX = owner.x;
        prevOwnerY = owner.y;
        prevOwnerTeam = owner.team;
      }
    }
  } finally {
    Math.random = original;
  }
}
const histogram = (values) => {
  const h = {};
  for (const v of values) h[v] = (h[v] || 0) + 1;
  return Object.fromEntries(
    Object.entries(h)
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([k, n]) => [`${k}人`, `${n} (${pct(n, values.length)}%)`])
  );
};

console.log(`\n=== 1. 拥堵度定标：出脚人 ${CONGESTION_RADIUS_M}m 内对方非门将球员数 ===`);
console.log(`禁区内传球·落点留在禁区 (n=${oppCounts.boxStay.length})  中位 ${median(oppCounts.boxStay)}`);
console.log(histogram(oppCounts.boxStay));
console.log(`禁区内传球·落点出禁区 (n=${oppCounts.boxExit.length})  中位 ${median(oppCounts.boxExit)}`);
console.log(histogram(oppCounts.boxExit));
console.log(`非禁区传球 (n=${oppCounts.nonBox.length})  中位 ${median(oppCounts.nonBox)}`);
console.log(histogram(oppCounts.nonBox));

console.log("\n=== 2&3. 各变体：翻转率（想要的效果） vs 非禁区波及面（标定风险） ===");
console.table(
  stats.map((s) => ({
    变体: s.variant.id,
    "禁区样本": s.considered,
    "翻转数": s.flips,
    "翻转率%": pct(s.flips, s.considered),
    "改前留区优势(中位)": median(s.marginBefore),
    "改后留区优势(中位)": median(s.marginAfter),
    "非禁区被波及%": pct(s.nonBoxTouched, s.nonBoxTotal),
    "被波及者distPen涨幅(中位)": s.nonBoxDistPenLift.length
      ? `${(median(s.nonBoxDistPenLift) * 100).toFixed(1)}%`
      : "—",
  }))
);

console.log(
  [
    "",
    "读法：",
    "  · 「翻转率」= 原本选择留在禁区、改后最佳出禁区备选反超的比例，即想要的效果。",
    "  · 「非禁区被波及%」= 对传球总量(800~1250)与成功率(72~88%)的风险代理指标；",
    "    该值越低，说明放宽越集中在拥堵处，越不会让中后场长传一起变便宜。",
    "  · 「留区优势」由正转负即代表排序反转；中位数仍为正说明只有尾部翻转。",
    "  · 口径限制（与 _box-pass-value-probe 相同）：只比「实际那一脚」与「最佳出禁区备选」，",
    "    不是引擎完整候选池的 softmax；不含直塞加成。可靠的是排序与相对量级，不是绝对概率。",
  ].join("\n")
);

