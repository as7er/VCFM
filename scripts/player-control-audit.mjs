import assert from "node:assert/strict";

import { SimEngine } from "../js/sim/engine.js";
import {
  ballActionPreparation,
  bodyControlProfile,
  firstTouchPlan,
  shieldingMomentumAdjustment,
} from "../js/player-control.js";

const attrs = {
  pace: 0.72,
  passing: 0.7,
  vision: 0.68,
  shooting: 0.65,
  finishing: 0.64,
  dribbling: 0.74,
  tackling: 0.62,
  marking: 0.6,
  strength: 0.58,
  stamina: 0.7,
  physical: 0.64,
  positioning: 0.64,
  reflexes: 0.6,
  handling: 0.6,
  kicking: 0.62,
  heading: 0.56,
  crossing: 0.66,
  decisions: 0.72,
};

const strong = bodyControlProfile({ ...attrs, dribbling: 0.88, decisions: 0.86 });
const weak = bodyControlProfile({ ...attrs, dribbling: 0.42, decisions: 0.4 });
assert.ok(strong.firstTouch > weak.firstTouch, "first touch must follow public control attributes");
assert.ok(strong.agility > weak.agility, "agility must follow pace/dribbling/decisions");
assert.ok(strong.balance > weak.balance, "balance must follow strength/physical/control facts");

const rightTouch = firstTouchPlan({
  heading: 0,
  incomingVy: 3,
  incomingSpeedMps: 3,
  preferredFoot: "right",
  attackDirection: -1,
  attrs,
});
const leftTouch = firstTouchPlan({
  heading: 0,
  incomingVy: 3,
  incomingSpeedMps: 3,
  preferredFoot: "left",
  attackDirection: -1,
  attrs,
});
assert.equal(rightTouch.foot, "right", "right-footed players must use the right contact side when available");
assert.equal(leftTouch.foot, "left", "left-footed players must use the left contact side when available");
assert.ok(rightTouch.duration > 0.15, "first touch must occupy a continuous simulation interval");

const quickPreparation = ballActionPreparation({
  heading: 0,
  targetX: 50,
  targetY: 50,
  playerX: 49,
  playerY: 50,
  controlFoot: "right",
  preferredFoot: "right",
  attrs,
});
const turnPreparation = ballActionPreparation({
  heading: 0,
  targetX: 49,
  targetY: 30,
  playerX: 49,
  playerY: 50,
  controlFoot: "left",
  preferredFoot: "right",
  attrs,
  action: "shot",
});
assert.ok(turnPreparation.delay > quickPreparation.delay, "large body turns must delay the next ball action");

const shielded = shieldingMomentumAdjustment({ closingSpeedMps: 4, shieldAlignment: 1, balance: 0.8 });
const exposed = shieldingMomentumAdjustment({ closingSpeedMps: 4, shieldAlignment: 0, balance: 0.8 });
assert.ok(shielded < exposed, "body shielding must reduce the same closing tackle momentum");

function makePlayer(id, pos) {
  return {
    id,
    name: id,
    pos,
    number: Number(id.slice(-1)) + 1,
    fitness: 100,
    preferredFoot: "right",
    attrs: Object.fromEntries(Object.keys(attrs).map((key) => [key, 13])),
  };
}

function makeClub(id) {
  const players = [
    makePlayer(`${id}-gk`, "GK"),
    ...Array.from({ length: 4 }, (_, index) => makePlayer(`${id}-d${index}`, "DEF")),
    ...Array.from({ length: 3 }, (_, index) => makePlayer(`${id}-m${index}`, "MID")),
    ...Array.from({ length: 3 }, (_, index) => makePlayer(`${id}-a${index}`, "ATT")),
  ];
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
    },
  };
}

const engine = new SimEngine(makeClub("home-control"), makeClub("away-control"), { random: () => 0.5 });
const receiver = engine.agents.find((agent) => agent.team === "home" && agent.role === "MID");
const teammate = engine.agents.find((agent) => agent.team === "home" && agent.role === "ATT");
assert.ok(receiver && teammate);
receiver.x = 44;
receiver.y = 54;
teammate.x = 50;
teammate.y = 25;
receiver.heading = Math.PI;
engine.ball = {
  x: 42,
  y: 54,
  vx: 9,
  vy: -2,
  z: 0,
  vz: 0,
  owner: null,
  state: "pass",
  kickTeam: "home",
  lastKicker: "home-control-d1",
};
engine.t = 0;
const plan = engine._beginBallControl(receiver, { kind: "receive" });
assert.equal(engine.ball.owner, receiver.id);
assert.equal(engine.ball.state, "control");
assert.equal(receiver.controlPhase, "first-touch");
const contactX = engine.ball.x;
engine.t = plan.duration * 0.5;
engine._stepBall(0.1);
assert.notEqual(engine.ball.x, contactX, "first touch must move the ball through a real control path");
engine.t = plan.duration;
engine._stepBall(0.1);
assert.equal(engine.ball.state, "held");
assert.equal(receiver.controlPhase, "settled");

engine.ball.owner = receiver.id;
engine.ball.state = "held";
engine.ball.restartType = null;
engine.ball.x = receiver.x;
engine.ball.y = receiver.y;
receiver.heading = Math.PI / 2;
receiver.controlUntil = 0;
receiver.pendingBallAction = null;
engine.t = 10;
engine._pass(receiver, { agent: teammate, tx: teammate.x, ty: teammate.y });
assert.ok(receiver.pendingBallAction, "a large body turn must prepare before passing");
engine.t = receiver.pendingBallAction.readyAt;
engine._think(receiver, 0.1, receiver, "home", receiver);
assert.equal(engine.ball.state, "pass", "prepared action must execute after the body turn completes");

const snapshot = engine.snapshot();
assert.ok("state" in snapshot.ball, "spatial snapshots must expose the continuous ball state");
assert.ok("controlPhase" in snapshot.players[0], "spatial snapshots must expose player control phase");

console.log("Player control audit passed: first touch, body turn, preferred foot, shielding momentum and continuous snapshots");
