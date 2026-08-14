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

function prepareEngine(pressing) {
  const engine = new SimEngine(makeClub("spacing-home"), makeClub("spacing-away", pressing), {
    random: () => 0.5,
  });
  const owner = engine.agents.find((player) => player.team === "home" && player.role === "MID");
  const defenders = engine.agents.filter((player) => player.team === "away" && player.role !== "GK");
  owner.x = 50;
  owner.y = 50;
  owner.vx = 0;
  owner.vy = 0;
  engine.ball.owner = owner.id;
  engine.ball.state = "held";
  engine.ball.x = owner.x;
  engine.ball.y = owner.y;
  engine.ball.vx = 0;
  engine.ball.vy = 0;
  defenders.forEach((player, index) => {
    player.x = 47.5 + (index % 4) * 1.6;
    player.y = 47.5 + Math.floor(index / 4) * 1.6;
    player.vx = 0;
    player.vy = 0;
  });
  engine._defPlans.away.until = 0;
  return { engine, owner, defenders };
}

function targetDistance(player, ball) {
  return Math.hypot((player.tx ?? player.x) - ball.x, (player.ty ?? player.y) - ball.y);
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
      targetDistance(defender, standard.engine.ball) >= 4.75,
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
  (player) => Math.hypot(player.x - standard.engine.ball.x, player.y - standard.engine.ball.y) < 4
);
assert.ok(closeDefenders.length <= 1, "several defenders still surrounded one stationary ball carrier");

const maximum = prepareEngine(5);
const maximumPlan = maximum.engine._refreshDefPlan("away", maximum.owner);
const interceptors = [...maximumPlan.jobs.values()].filter((job) => job.type === "intercept");
assert.equal(interceptors.length, 2, "maximum pressing should cover two passing channels");
assert.deepEqual(
  new Set(interceptors.map((job) => job.side)),
  new Set([-1, 1]),
  "maximum pressing interceptors must split across opposite channels"
);

console.log("Defensive spacing audit passed: one direct presser, staggered cover and split intercept lanes");
