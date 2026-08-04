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
for (const player of engine.agents) {
  if (player.sentOff || player.id === takerId || player.id === gkId || player.role === "GK") continue;
  assert.ok(player.y >= 24, `${player.id} entered the penalty area before the kick`);
  assert.ok(
    Math.hypot(player.x - 50, player.y - 12) >= 9.15,
    `${player.id} entered the penalty arc before the kick`
  );
}

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
let closest = Infinity;
for (let i = 0; i < active.length; i++) {
  for (let j = i + 1; j < active.length; j++) {
    closest = Math.min(
      closest,
      Math.hypot(active[i].x - active[j].x, active[i].y - active[j].y)
    );
  }
}
assert.ok(closest >= 3.3, `corner slots overlap: closest pair is ${closest.toFixed(2)}`);

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
