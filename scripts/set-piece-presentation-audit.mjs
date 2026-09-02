import assert from "node:assert/strict";
import { SimEngine, SIM } from "../js/sim/engine.js";
import { compactSimFrame } from "../js/sim/adapt.js";

function makeClub(name) {
  const positions = ["GK", "DEF", "DEF", "DEF", "DEF", "MID", "MID", "MID", "ATT", "ATT", "ATT"];
  const players = positions.map((pos, index) => ({
    id: `${name}-${index}`,
    name: `${name} ${index}`,
    pos,
    number: index + 1,
    fitness: 100,
    attrs: {
      pace: 12,
      strength: 12,
      passing: 12,
      vision: 12,
      shooting: 12,
      finishing: 12,
      dribbling: 12,
      tackling: 12,
      marking: 12,
      stamina: 12,
      positioning: 12,
      reflexes: 12,
      handling: 12,
      kicking: 12,
    },
  }));
  return {
    id: name,
    name,
    players,
    tactics: { formation: "4-3-3", lineup: players.map((player) => player.id) },
  };
}

const engine = new SimEngine(makeClub("home"), makeClub("away"), {
  random: () => 0.25,
});
engine._penaltyKick("home");

assert.ok(engine.pendingPenalty, "a penalty must remain pending long enough to be presented");
assert.equal(engine.ball.state, "penalty", "the ball must expose a penalty set-piece state");
assert.equal(compactSimFrame(engine).ball.setPiece, "penalty", "compact frames must identify penalties");

const takerId = engine.pendingPenalty.takerId;
const gkId = engine.pendingPenalty.gkId;

// 点球摆位的三条规则（Law 14）：除主罚者和守门员外，所有人必须
//  1. 在罚球区外
//  2. 距罚球点至少 9.15 m
//  3. 在球的后方（离对方球门更远的一侧）
// 坐标不是米：x 一格 = 68/100 m，y 一格 = 105/100 m，所以距离必须换算后再比，
// 直接对坐标取 hypot 和 9.15 比较是没有物理含义的（旧断言的写法）。
const M_PER_X = 0.68;
const M_PER_Y = 1.05;
const spotY = 12;                 // home 主罚：罚球点在客队禁区
const BOX_Y = 16;                 // 客队罚球区纵向边界（见 _inOwnFoulBox）
const metresFromSpot = (x, y) =>
  Math.hypot((x - 50) * M_PER_X, (y - spotY) * M_PER_Y);

const stagedPlayers = engine.agents.filter(
  (player) =>
    !player.sentOff &&
    player.id !== takerId &&
    player.id !== gkId &&
    player.role !== "GK"
);
assert.ok(stagedPlayers.length >= 18, "both teams must be staged for the penalty");

for (const player of stagedPlayers) {
  const insideBox = player.x > 22 && player.x < 78 && player.y <= BOX_Y;
  assert.ok(!insideBox, `${player.id} entered the penalty area before the kick`);
  assert.ok(
    metresFromSpot(player.x, player.y) >= 9.15,
    `${player.id} stood closer than 9.15 m to the penalty mark ` +
      `(${metresFromSpot(player.x, player.y).toFixed(2)} m)`
  );
  assert.ok(player.y >= spotY, `${player.id} stood ahead of the penalty mark`);
}

// 摆位必须像真实点球：松散弧形，而不是等距队列。
// 旧实现是 5 列 × 2 行的网格（x = 25 + col*12.5，y = 24/29），画面上是两条标尺横排。
const uniqueYBands = [];
for (const y of stagedPlayers.map((p) => p.y).sort((a, b) => a - b)) {
  if (!uniqueYBands.length || y - uniqueYBands[uniqueYBands.length - 1] > 1.5) {
    uniqueYBands.push(y);
  }
}
assert.ok(
  uniqueYBands.length >= 4,
  `staged players collapsed into ${uniqueYBands.length} row(s); expected a loose arc`
);

// 双方不该混在同一条带上：进攻方抢第二点站得更靠前，防守方更靠后准备解围。
const avgY = (team) => {
  const list = stagedPlayers.filter((p) => p.team === team);
  return list.reduce((sum, p) => sum + p.y, 0) / list.length;
};
assert.ok(
  avgY("away") > avgY("home"),
  "the defending side must sit further from its own goal than the attackers"
);

// 圆点直径约 1.6 m：任意两人不得挤成一坨
let penClosest = Infinity;
for (let i = 0; i < stagedPlayers.length; i++) {
  for (let j = i + 1; j < stagedPlayers.length; j++) {
    const a = stagedPlayers[i];
    const b = stagedPlayers[j];
    penClosest = Math.min(
      penClosest,
      Math.hypot((a.x - b.x) * M_PER_X, (a.y - b.y) * M_PER_Y)
    );
  }
}
assert.ok(
  penClosest >= 1.6,
  `staged players overlap (closest pair ${penClosest.toFixed(2)} m)`
);

for (let i = 0; i < 16; i++) engine.step(SIM.DT);
assert.ok(engine.pendingPenalty, "the setup and run-up must span recorded frames");
assert.equal(engine.ball.state, "penalty", "the ball must stay on the spot during setup");

for (let i = 0; i < 14; i++) engine.step(SIM.DT);
assert.equal(engine.pendingPenalty, null, "the penalty must resolve after the visible flight");
assert.ok(engine.events.some((event) => event.type === "shot" && event.penalty));
assert.ok(engine.events.some((event) => event.type === "goal" && event.penalty));

const cornerEngine = new SimEngine(makeClub("corner-home"), makeClub("corner-away"), {
  random: () => 0.5,
});
cornerEngine._restart("corner", "home", 2, 4);
const active = cornerEngine.agents.filter((player) => !player.sentOff);
// 与上面的点球段同一条纪律：坐标不是米，必须先按 x 0.68 / y 1.05 换算再比距离。
// 旧写法直接对坐标取 hypot 再和 3.3 比，同一个 3.3 可以是 2.24 m（纯横向）
// 也可以是 3.47 m（纯纵向），没有物理含义。实测本场景真实最小间距 3.44 m，
// 阈值沿用本仓库统一的 1.6 m 重叠判定（与点球段、support-target-crowding 一致）。
let closest = Infinity;
for (let i = 0; i < active.length; i++) {
  for (let j = i + 1; j < active.length; j++) {
    closest = Math.min(
      closest,
      Math.hypot(
        (active[i].x - active[j].x) * M_PER_X,
        (active[i].y - active[j].y) * M_PER_Y
      )
    );
  }
}
assert.ok(closest >= 1.6, `corner slots overlap: closest pair is ${closest.toFixed(2)} m`);

const first = active.find((player) => player.role !== "GK");
const second = active.find((player) => player.role !== "GK" && player.id !== first.id);
first.x = 40;
first.y = 50;
first.vx = 2;
first.vy = 0;
second.x = 41;
second.y = 50;
second.vx = -2;
second.vy = 0;
cornerEngine._separateAgents(3);
const separatedDistance = Math.hypot(first.x - second.x, first.y - second.y);
const ux = (second.x - first.x) / separatedDistance;
const uy = (second.y - first.y) / separatedDistance;
const closingSpeed = (second.vx - first.vx) * ux + (second.vy - first.vy) * uy;
assert.ok(separatedDistance >= 2.8, "collision solver must separate overlapping players");
assert.ok(closingSpeed >= -1e-9, "collision solver must remove inward normal velocity");

// 录像里的实际症状是十余名球员挤在小禁区，而不只是两人重叠。
// 把全部出场球员压进 6x4 的门前区域，检查一次 step 的求解量能否解开。
const crowdEngine = new SimEngine(makeClub("crowd-home"), makeClub("crowd-away"), {
  random: () => 0.5,
});
const crowd = crowdEngine.agents.filter((player) => !player.sentOff);
crowd.forEach((player, index) => {
  player.x = 47 + (index % 3);
  player.y = 6 + Math.floor(index / 3) * 0.5;
  player.vx = 0;
  player.vy = 0;
  player.tx = player.x;
  player.ty = player.y;
});
crowdEngine._separateAgents(8);
let crowdClosest = Infinity;
let crowdKeeperGap = Infinity;
for (let i = 0; i < crowd.length; i++) {
  for (let j = i + 1; j < crowd.length; j++) {
    const gap = Math.hypot(crowd[i].x - crowd[j].x, crowd[i].y - crowd[j].y);
    crowdClosest = Math.min(crowdClosest, gap);
    if (crowd[i].role === "GK" || crowd[j].role === "GK") {
      crowdKeeperGap = Math.min(crowdKeeperGap, gap);
    }
  }
}
assert.ok(
  crowdClosest >= 2.0,
  `crowded box still overlaps: closest pair is ${crowdClosest.toFixed(2)}`
);
assert.ok(
  crowdKeeperGap >= 2.0,
  `an outfield player shares the keeper's position: gap is ${crowdKeeperGap.toFixed(2)}`
);

// 门将权重低意味着它守住球门，由外场球员让开，而不是被挤出门线。
const keeperEngine = new SimEngine(makeClub("keeper-home"), makeClub("keeper-away"), {
  random: () => 0.5,
});
const keeper = keeperEngine.agents.find((player) => player.role === "GK");
const striker = keeperEngine.agents.find(
  (player) => player.role !== "GK" && player.team !== keeper.team
);
const keeperStartX = keeper.x;
const keeperStartY = keeper.y;
striker.x = keeper.x + 0.4;
striker.y = keeper.y + 0.3;
striker.vx = 0;
striker.vy = 0;
keeperEngine._separateAgents(8);
const keeperDrift = Math.hypot(keeper.x - keeperStartX, keeper.y - keeperStartY);
const strikerGap = Math.hypot(keeper.x - striker.x, keeper.y - striker.y);
assert.ok(strikerGap >= 2.8, `striker still overlaps the keeper: gap is ${strikerGap.toFixed(2)}`);
assert.ok(
  keeperDrift <= 0.35,
  `the keeper was pushed off its line by ${keeperDrift.toFixed(2)} instead of holding position`
);

console.log("Set-piece presentation audit passed.");
