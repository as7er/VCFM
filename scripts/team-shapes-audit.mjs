import assert from "node:assert/strict";

import { SimEngine } from "../js/sim/engine.js";
import {
  TEAM_SHAPE_PHASES,
  teamShapeProfile,
  teamShapeSummary,
} from "../js/team-shapes.js";

function makeClub(id, tactics = {}) {
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
      pressing: 3,
      tempo: 3,
      width: 3,
      defensiveLine: 3,
      ...tactics,
    },
  };
}

const counterProfile = teamShapeProfile({
  style: "counter",
  pressing: 5,
  tempo: 5,
  width: 5,
  defensiveLine: 4,
});
const balancedProfile = teamShapeProfile({
  style: "balanced",
  pressing: 3,
  tempo: 3,
  width: 3,
  defensiveLine: 3,
});
const regroupProfile = teamShapeProfile({
  style: "defend",
  pressing: 1,
  tempo: 2,
  width: 2,
  defensiveLine: 1,
});

assert.ok(
  counterProfile.transition.attackSeconds > balancedProfile.transition.attackSeconds,
  "counter-attacking instructions must preserve a longer attacking transition"
);
assert.ok(
  counterProfile.inPossession.widthMul > counterProfile.outOfPossession.widthMul,
  "the settled defensive block must be more compact than the attacking occupation"
);
assert.equal(counterProfile.transition.counterPress, true);
assert.equal(regroupProfile.transition.counterPress, false);
assert.equal(regroupProfile.transition.regroup, true);
assert.equal(teamShapeSummary({}, "zh").length, 3, "the tactics UI must expose all three team-shape facts");

const home = makeClub("shape-home", {
  style: "counter",
  pressing: 3,
  tempo: 5,
  width: 4,
});
const away = makeClub("shape-away", {
  style: "balanced",
  pressing: 4,
  tempo: 3,
  width: 3,
});
const engine = new SimEngine(home, away, { random: () => 0.5 });
const owner = engine.agents.find((agent) => agent.team === "home" && agent.role === "MID");
const runner = engine.agents.find(
  (agent) => agent.team === "home" && agent.role === "MID" && agent !== owner
);
assert.ok(owner && runner);

engine._phaseTeam = "home";
engine._teamGainAt.home = 0;
engine._teamLoseAt.away = 0;
engine.t = 0;
engine._refreshTeamShapePhases("home");
assert.equal(engine.teamPhases.home, TEAM_SHAPE_PHASES.ATTACKING_TRANSITION);
assert.equal(engine.teamPhases.away, TEAM_SHAPE_PHASES.DEFENSIVE_TRANSITION);
assert.deepEqual(engine.snapshot().teamPhases, engine.teamPhases, "recorded spatial frames must expose the real shape phases");

runner.tx = 50;
runner.ty = 50;
engine._applyAttackTactics(runner, owner);
const transitionTargetY = runner.ty;
const homeShape = engine._shapeProfile("home");
engine.t = homeShape.transition.attackSeconds + 0.2;
engine._refreshTeamShapePhases("home");
runner.tx = 50;
runner.ty = 50;
engine._applyAttackTactics(runner, owner);
const settledTargetY = runner.ty;
assert.equal(engine.teamPhases.home, TEAM_SHAPE_PHASES.IN_POSSESSION);
assert.ok(
  transitionTargetY < settledTargetY - 1,
  "a counter-attacking transition must produce more immediate forward depth than settled possession"
);

owner.x = 50;
owner.y = 50;
engine.ball.owner = owner.id;
engine.ball.state = "held";
engine.ball.x = 50;
engine.ball.y = 50;
const awayDefenders = engine.agents.filter((agent) => agent.team === "away" && agent.role !== "GK");
awayDefenders.forEach((agent, index) => {
  agent.x = 45 + (index % 5) * 2.2;
  agent.y = 44 + Math.floor(index / 5) * 4;
  agent.vx = 0;
  agent.vy = 0;
});

engine.t = 0;
engine._teamLoseAt.away = 0;
engine._defPlans.away.until = 0;
const transitionPhase = engine._teamShapePhase("away", "home");
const transitionPlan = engine._refreshDefPlan("away", owner, transitionPhase);
assert.equal(
  [...transitionPlan.jobs.values()].filter((job) => job.type === "press").length,
  1,
  "counter-pressing must retain one real ball presser"
);
assert.equal(
  [...transitionPlan.jobs.values()].filter((job) => job.type === "intercept").length,
  2,
  "high pressing must use both passing-lane interceptors during the turnover window"
);

const awayShape = engine._shapeProfile("away");
engine.t = awayShape.transition.defendSeconds + 0.2;
engine._defPlans.away.until = 0;
const settledPhase = engine._teamShapePhase("away", "home");
const settledPlan = engine._refreshDefPlan("away", owner, settledPhase);
assert.equal(settledPhase, TEAM_SHAPE_PHASES.OUT_OF_POSSESSION);
assert.equal(
  [...settledPlan.jobs.values()].filter((job) => job.type === "intercept").length,
  1,
  "the settled block must release the extra transition interceptor"
);

const shapeDefender = awayDefenders.find(
  (agent) => settledPlan.jobs.get(agent.id)?.type === "shape"
);
assert.ok(shapeDefender, "a settled defensive block needs formation players outside the pressure unit");
shapeDefender.x = shapeDefender.baseX;
shapeDefender.y = shapeDefender.baseY;
engine._thinkDefend(shapeDefender, owner);
assert.ok(
  Math.abs(shapeDefender.tx - 50) < Math.abs(shapeDefender.baseX - 50),
  "the out-of-possession shape must compact the weak-side width"
);

console.log("Team shapes audit passed: public tactics derive possession, defensive and transition geometry without ability or result weighting");
