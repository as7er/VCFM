import assert from "node:assert/strict";
import { SimEngine, SIM } from "../js/sim/engine.js";

function makeClub(id, pressing = 3) {
  const positions = ["GK", "DEF", "DEF", "DEF", "DEF", "MID", "MID", "MID", "ATT", "ATT", "ATT"];
  const players = positions.map((pos, index) => ({
    id: `${id}-${index}`,
    name: `${id} ${index}`,
    pos,
    number: index + 1,
    fitness: 100,
    attrs: Object.fromEntries(
      [
        "pace", "strength", "passing", "vision", "shooting", "finishing",
        "dribbling", "tackling", "marking", "stamina", "positioning",
        "reflexes", "handling", "kicking", "heading", "crossing", "decisions",
      ].map((key) => [key, 13])
    ),
  }));
  return {
    id,
    name: id,
    players,
    tactics: {
      formation: "4-3-3",
      lineup: players.map((player) => player.id),
      style: "balanced",
      pressing,
      tempo: 3,
      width: 3,
      defensiveLine: 3,
    },
  };
}

function prepareEngine(pressing, ball = { x: 50, y: 50 }) {
  const engine = new SimEngine(makeClub("spacing-home"), makeClub("spacing-away", pressing), {
    random: () => 0.5,
  });
  const owner = engine.agents.find((player) => player.team === "home" && player.role === "MID");
  const defenders = engine.agents.filter((player) => player.team === "away" && player.role !== "GK");
  owner.x = ball.x;
  owner.y = ball.y;
  owner.vx = 0;
  owner.vy = 0;
  engine.ball.owner = owner.id;
  engine.ball.state = "held";
  engine.ball.x = owner.x;
  engine.ball.y = owner.y;
  engine.ball.vx = 0;
  engine.ball.vy = 0;
  defenders.forEach((player, index) => {
    player.x = ball.x - 2.5 + (index % 4) * 1.6;
    player.y = ball.y - 2.5 + Math.floor(index / 4) * 1.6;
    player.vx = 0;
    player.vy = 0;
  });
  engine._defPlans.away.until = 0;
  return { engine, owner, defenders };
}

function distanceMetres(ax, ay, bx, by) {
  return Math.hypot((ax - bx) * 0.68, (ay - by) * 1.05);
}

function targetDistance(player, ball) {
  return distanceMetres(player.tx ?? player.x, player.ty ?? player.y, ball.x, ball.y);
}

const standard = prepareEngine(3);
const standardPlan = standard.engine._refreshDefPlan("away", standard.owner);
const standardJobs = [...standardPlan.jobs.values()];
assert.equal(standardJobs.filter((job) => job.type === "press").length, 1, "exactly one defender must press");
assert.equal(
  standardJobs.filter((job) => job.type === "intercept").length,
  1,
  "standard pressing assigned multiple channel interceptors"
);

for (const defender of standard.defenders) {
  standard.engine._thinkDefend(defender, standard.owner);
  const job = standardPlan.jobs.get(defender.id);
  if (job.type !== "press") {
    assert.ok(
      targetDistance(defender, standard.engine.ball) >= 4.05,
      `${job.type} defender was sent into the ball carrier's immediate pressure circle`
    );
  }
}

for (let step = 0; step < 30; step++) {
  standard.engine.t += SIM.DT;
  for (const defender of standard.defenders) {
    standard.engine._thinkDefend(defender, standard.owner);
    standard.engine._integrate(defender, SIM.DT);
  }
}
const closeDefenders = standard.defenders.filter(
  (player) => distanceMetres(player.x, player.y, standard.engine.ball.x, standard.engine.ball.y) < 4
);
assert.ok(closeDefenders.length <= 1, "several defenders still surrounded one stationary ball carrier");

const supportDirections = [
  { dx: 1, dy: 0, label: "horizontal" },
  { dx: 0, dy: 1, label: "vertical" },
  { dx: 1, dy: 1, label: "diagonal" },
];
for (const ball of [
  { x: 50, y: 50, label: "centre" },
  { x: 6, y: 50, label: "left touchline" },
  { x: 94, y: 50, label: "right touchline" },
  { x: 50, y: 8, label: "upper end" },
  { x: 50, y: 92, label: "lower end" },
]) {
  const sample = prepareEngine(3, ball);
  for (const direction of supportDirections) {
    const xSign = ball.x > 50 ? -1 : 1;
    const ySign = ball.y > 50 ? -1 : 1;
    const target = sample.engine._defensiveSupportTarget(
      ball.x + direction.dx * xSign,
      ball.y + direction.dy * ySign,
      ball.y < 50 ? SIM.HOME_GOAL_Y : SIM.AWAY_GOAL_Y,
      4.8,
      xSign
    );
    const actual = distanceMetres(target.x, target.y, ball.x, ball.y);
    assert.ok(
      Math.abs(actual - 4.8) < 0.01,
      `${ball.label} ${direction.label} support distance drifted to ${actual.toFixed(3)}m`
    );
  }
}

function canControlAtOffset(dx, dy) {
  const sample = prepareEngine(3);
  const candidate = sample.defenders[0];
  for (const player of sample.engine.agents) player.sentOff = player !== candidate;
  candidate.sentOff = false;
  candidate.x = sample.engine.ball.x + dx;
  candidate.y = sample.engine.ball.y + dy;
  sample.engine.ball.owner = null;
  sample.engine.ball.state = "loose";
  sample.engine.ball.kickTeam = candidate.team;
  sample.engine.ball.vx = 0;
  sample.engine.ball.vy = 0;
  sample.engine._resolvePossession(SIM.DT);
  return sample.engine.ball.owner === candidate.id;
}

const insideMetres = 2.55;
const outsideMetres = 2.65;
assert.equal(canControlAtOffset(insideMetres / 0.68, 0), true, "horizontal 2.55m control failed");
assert.equal(canControlAtOffset(0, insideMetres / 1.05), true, "vertical 2.55m control failed");
assert.equal(canControlAtOffset(outsideMetres / 0.68, 0), false, "horizontal 2.65m control was accepted");
assert.equal(canControlAtOffset(0, outsideMetres / 1.05), false, "vertical 2.65m control was accepted");

function goalkeeperCanChallengeAtOffset(dx, dy) {
  const sample = prepareEngine(3);
  const goalkeeper = sample.engine.agents.find(
    (player) => player.team === "away" && player.role === "GK"
  );
  sample.engine.random = () => 0;
  sample.engine.t = 100;
  sample.owner.x = 50;
  sample.owner.y = 10;
  sample.owner.protectUntil = 0;
  sample.engine.ball.owner = sample.owner.id;
  sample.engine.ball.state = "held";
  sample.engine.ball.x = 50;
  sample.engine.ball.y = 10;
  goalkeeper.x = 50 + dx;
  goalkeeper.y = 10 + dy;
  goalkeeper.challengeCdUntil = 0;
  goalkeeper.challengeOwnerUntil = 0;
  return sample.engine._tryGoalkeeperChallenge(sample.owner);
}

const keeperInsideMetres = 2.2;
const keeperOutsideMetres = 2.3;
assert.equal(
  goalkeeperCanChallengeAtOffset(keeperInsideMetres / 0.68, 0),
  true,
  "goalkeeper failed to challenge horizontally at 2.2m"
);
assert.equal(
  goalkeeperCanChallengeAtOffset(0, keeperInsideMetres / 1.05),
  true,
  "goalkeeper failed to challenge vertically at 2.2m"
);
assert.equal(
  goalkeeperCanChallengeAtOffset(keeperOutsideMetres / 0.68, 0),
  false,
  "goalkeeper challenged horizontally beyond reach"
);
assert.equal(
  goalkeeperCanChallengeAtOffset(0, keeperOutsideMetres / 1.05),
  false,
  "goalkeeper challenged vertically beyond reach"
);

const maximum = prepareEngine(5);
const maximumPlan = maximum.engine._refreshDefPlan("away", maximum.owner);
const interceptors = [...maximumPlan.jobs.values()].filter((job) => job.type === "intercept");
assert.equal(interceptors.length, 2, "maximum pressing should cover two passing channels");
assert.deepEqual(
  new Set(interceptors.map((job) => job.side)),
  new Set([-1, 1]),
  "maximum pressing interceptors must split across opposite channels"
);

console.log("Defensive spacing audit passed: metre-based control and goalkeeper reach, one presser, staggered cover and split lanes");
