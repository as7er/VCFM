import assert from "node:assert/strict";
import { SimEngine, SIM } from "../js/sim/engine.js";

const PITCH_METRES = { x: 68, y: 105 };
const METRES_PER_UNIT = {
  x: PITCH_METRES.x / 100,
  y: PITCH_METRES.y / 100,
};

function makeClub(id, rating = 12) {
  const positions = ["GK", "DEF", "DEF", "DEF", "DEF", "MID", "MID", "MID", "ATT", "ATT", "ATT"];
  const players = positions.map((pos, index) => ({
    id: `${id}-${index}`,
    name: `${id} ${index}`,
    pos,
    number: index + 1,
    age: 25,
    ovr: rating,
    potential: rating,
    fitness: 100,
    attrs: Object.fromEntries(
      [
        "pace", "strength", "passing", "vision", "shooting", "finishing",
        "dribbling", "tackling", "marking", "stamina", "positioning",
        "reflexes", "handling", "kicking", "heading", "crossing", "decisions",
      ].map((key) => [key, rating])
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
      pressing: 3,
      tempo: 3,
      width: 3,
      defensiveLine: 3,
      roles: [],
      duties: [],
    },
  };
}

function physicalSpeed(ball) {
  return Math.hypot(
    ball.vx * METRES_PER_UNIT.x,
    ball.vy * METRES_PER_UNIT.y
  );
}

function measurePass({ metres, axis, rating = 12, kind = "standard" }) {
  const engine = new SimEngine(makeClub("speed-home", rating), makeClub("speed-away", rating), {
    random: () => 0.5,
  });
  const passer = engine.agents.find((player) => player.team === "home" && player.role === "MID");
  const origin = { x: 20, y: 30 };
  const diagonalMetres = metres / Math.sqrt(2);
  const target = {
    x: origin.x + (axis === "x" ? metres : axis === "diagonal" ? diagonalMetres : 0) / METRES_PER_UNIT.x,
    y: origin.y + (axis === "y" ? metres : axis === "diagonal" ? diagonalMetres : 0) / METRES_PER_UNIT.y,
  };
  passer.x = origin.x;
  passer.y = origin.y;
  engine.ball.x = origin.x;
  engine.ball.y = origin.y;
  engine.ball.z = 0;
  engine.ball.vx = 0;
  engine.ball.vy = 0;
  engine.ball.vz = 0;
  engine.ball.owner = passer.id;
  engine.ball.state = "held";
  engine._pass(passer, {
    tx: target.x,
    ty: target.y,
    through: kind === "through",
    cross: kind === "cross",
  });

  const initialSpeed = physicalSpeed(engine.ball);
  const expectedSec = engine.ball.expectedAt - engine.t;
  const pathX = target.x - origin.x;
  const pathY = target.y - origin.y;
  const pathLengthSq = pathX * pathX + pathY * pathY;
  let previousProgress = 0;
  let previousTime = 0;
  let previousSpeed = initialSpeed;
  let previousHeight = engine.ball.z || 0;
  let maxHeight = engine.ball.z;
  let arrivalSec = null;
  let arrivalSpeed = null;
  let arrivalHeight = null;

  for (let step = 0; step < 100; step++) {
    engine._stepBall(SIM.DT);
    const time = (step + 1) * SIM.DT;
    maxHeight = Math.max(maxHeight, engine.ball.z || 0);
    const progress =
      ((engine.ball.x - origin.x) * pathX + (engine.ball.y - origin.y) * pathY) /
      pathLengthSq;
    const speed = physicalSpeed(engine.ball);
    if (progress >= 1) {
      const span = Math.max(1e-9, progress - previousProgress);
      const alpha = Math.max(0, Math.min(1, (1 - previousProgress) / span));
      arrivalSec = previousTime + (time - previousTime) * alpha;
      arrivalSpeed = previousSpeed + (speed - previousSpeed) * alpha;
      arrivalHeight = previousHeight + ((engine.ball.z || 0) - previousHeight) * alpha;
      break;
    }
    previousProgress = progress;
    previousTime = time;
    previousSpeed = speed;
    previousHeight = engine.ball.z || 0;
  }

  return {
    metres,
    axis,
    kind,
    rating,
    initialMps: initialSpeed,
    arrivalSec,
    arrivalMps: arrivalSpeed,
    arrivalHeight,
    expectedSec,
    maxHeight,
  };
}

function measureGroundRoll() {
  const engine = new SimEngine(makeClub("roll-home"), makeClub("roll-away"), {
    random: () => 0.5,
  });
  engine.ball.owner = null;
  engine.ball.state = "loose";
  engine.ball.x = 50;
  engine.ball.y = 50;
  engine.ball.z = 0;
  engine.ball.vx = 10;
  engine.ball.vy = 0;
  engine.ball.vz = 0;
  const speeds = [];
  for (let step = 0; step < 10; step++) {
    engine._stepBall(SIM.DT);
    speeds.push(Math.hypot(engine.ball.vx, engine.ball.vy));
    assert.equal(engine.ball.z, 0, "a rolling ball left the grass without an upward impulse");
    assert.equal(engine.ball.vz, 0, "gravity restarted a landing collision for a rolling ball");
  }
  return speeds;
}

function measureProfilePass(timeStep) {
  const engine = new SimEngine(makeClub(`profile-${timeStep}-home`), makeClub(`profile-${timeStep}-away`), {
    random: () => 0.5,
    timeStep,
    simulationProfile: timeStep === SIM.DT ? "standard" : "background",
  });
  const passer = engine.agents.find((player) => player.team === "home" && player.role === "MID");
  engine.ball.owner = passer.id;
  engine.ball.x = passer.x = 20;
  engine.ball.y = passer.y = 30;
  engine.ball.z = 0;
  engine._pass(passer, { tx: 20, ty: 30 + 30 / METRES_PER_UNIT.y });
  const duration = 0.9;
  for (let elapsed = 0; elapsed < duration - 1e-9; elapsed += timeStep) {
    engine._stepBall(Math.min(timeStep, duration - elapsed));
  }
  return {
    x: engine.ball.x,
    y: engine.ball.y,
    z: engine.ball.z,
    speed: physicalSpeed(engine.ball),
  };
}

function assertBounceSettles() {
  const engine = new SimEngine(makeClub("bounce-home"), makeClub("bounce-away"), {
    random: () => 0.5,
  });
  engine.ball.owner = null;
  engine.ball.state = "pass";
  engine.ball.x = 50;
  engine.ball.y = 50;
  engine.ball.z = 0.2;
  engine.ball.vx = 0;
  engine.ball.vy = 0;
  engine.ball.vz = 14;
  for (let step = 0; step < 60; step++) engine._stepBall(SIM.DT);
  assert.equal(engine.ball.z, 0, "a bouncing pass never returned to the grass");
  assert.equal(engine.ball.vz, 0, "vertical bounce entered a fixed-step limit cycle");
  assert.equal(engine.ball.state, "loose", "a stopped pass remained permanently in flight");
}

function measureGoalkeeperClearance() {
  const engine = new SimEngine(makeClub("gk-home"), makeClub("gk-away"), {
    random: () => 0.5,
  });
  const goalkeeper = engine.agents.find((player) => player.team === "home" && player.role === "GK");
  const opponent = engine.agents.find((player) => player.team === "away" && player.role !== "GK");
  goalkeeper.x = 50;
  goalkeeper.y = 92;
  opponent.x = 52;
  opponent.y = 91;
  engine.ball.owner = goalkeeper.id;
  engine.ball.x = goalkeeper.x;
  engine.ball.y = goalkeeper.y;
  engine.ball.z = 0;
  engine._gkDistribute(goalkeeper);
  const distance = Math.hypot(
    (engine.ball.targetX - engine.ball.x) * METRES_PER_UNIT.x,
    (engine.ball.targetY - engine.ball.y) * METRES_PER_UNIT.y
  );
  const initialSpeed = physicalSpeed(engine.ball);
  const expectedSec = engine.ball.expectedAt - engine.t;
  let elapsed = 0;
  let travelled = 0;
  const origin = { x: engine.ball.x, y: engine.ball.y };
  while (elapsed < 4 && travelled < distance) {
    engine._stepBall(SIM.DT);
    elapsed += SIM.DT;
    travelled = Math.hypot(
      (engine.ball.x - origin.x) * METRES_PER_UNIT.x,
      (engine.ball.y - origin.y) * METRES_PER_UNIT.y
    );
  }
  assert.equal(engine.ball.state, "pass", "goalkeeper distribution did not use pass physics");
  assert.ok(initialSpeed >= 18 && initialSpeed <= 27.5, "goalkeeper clearance speed left the physical envelope");
  assert.ok(travelled >= distance, "goalkeeper clearance did not reach its target corridor");
  assert.ok(Math.abs(elapsed - expectedSec) <= SIM.DT, "goalkeeper receiver timing disagrees with ball flight");
}

const rows = [];
for (const axis of ["x", "y", "diagonal"]) {
  for (const metres of [5, 10, 20, 30, 40]) {
    rows.push(measurePass({ metres, axis }));
  }
}

console.table(rows.map((row) => ({
  axis: row.axis,
  metres: row.metres,
  initialMps: row.initialMps.toFixed(1),
  arrivalSec: row.arrivalSec?.toFixed(2) || "not reached",
  arrivalMps: row.arrivalMps?.toFixed(1) || "-",
  expectedSec: row.expectedSec.toFixed(2),
  maxHeight: row.maxHeight.toFixed(1),
})));

for (const metres of [5, 10, 20, 30, 40]) {
  const horizontal = rows.find((row) => row.axis === "x" && row.metres === metres);
  const vertical = rows.find((row) => row.axis === "y" && row.metres === metres);
  const diagonal = rows.find((row) => row.axis === "diagonal" && row.metres === metres);
  for (const comparison of [vertical, diagonal]) {
    assert.ok(horizontal.arrivalSec && comparison.arrivalSec, `${metres}m passes must reach their target`);
    assert.ok(
      Math.abs(horizontal.initialMps - comparison.initialMps) < 0.35,
      `${metres}m initial speed depends on pass direction`
    );
    assert.ok(
      Math.abs(horizontal.arrivalSec - comparison.arrivalSec) < 0.08,
      `${metres}m arrival time depends on pass direction`
    );
    assert.ok(
      Math.abs(horizontal.arrivalMps - comparison.arrivalMps) < 0.8,
      `${metres}m arrival speed depends on pass direction`
    );
  }
}

for (const row of rows) {
  assert.ok(row.initialMps >= 11 && row.initialMps <= 27.5, "pass initial speed left the physical envelope");
  assert.ok(row.arrivalMps >= 6.5, "an ordinary pass nearly stopped before reaching its target");
  assert.ok(
    Math.abs(row.arrivalSec - row.expectedSec) <= 0.22,
    "receiver timing no longer matches the ball's physical arrival"
  );
}

const groundSpeeds = measureGroundRoll();
for (let index = 1; index < groundSpeeds.length; index++) {
  assert.ok(groundSpeeds[index] < groundSpeeds[index - 1], "ground friction must slow the ball monotonically");
  assert.ok(
    Math.abs(groundSpeeds[index] / groundSpeeds[index - 1] - SIM.BALL_FRICTION) < 1e-9,
    "a rolling ball lost speed through a repeated landing collision"
  );
}

assertBounceSettles();
measureGoalkeeperClearance();

const standardProfilePass = measureProfilePass(SIM.DT);
const backgroundProfilePass = measureProfilePass(0.3);
assert.ok(
  Math.hypot(
    standardProfilePass.x - backgroundProfilePass.x,
    standardProfilePass.y - backgroundProfilePass.y
  ) < 1e-6,
  "background time step changed the pass distance"
);
assert.ok(
  Math.abs(standardProfilePass.speed - backgroundProfilePass.speed) < 1e-6,
  "background time step changed the pass speed"
);
assert.ok(
  Math.abs(standardProfilePass.z - backgroundProfilePass.z) < 1e-6,
  "background time step changed the pass height"
);

console.log("Pass speed audit passed: physical pace, arrival and bounce are consistent");
