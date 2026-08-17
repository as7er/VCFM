import assert from "node:assert/strict";

import {
  PRESS_TRIGGER_KINDS,
  collectiveDefenseProfile,
  defensiveAwarenessProfile,
  pressingTrigger,
  shouldHandoffMark,
  weakSideTargetX,
} from "../js/collective-defense.js";
import { SimEngine } from "../js/sim/engine.js";

function makeClub(id, tactics = {}) {
  const positions = ["GK", "DEF", "DEF", "DEF", "DEF", "MID", "MID", "MID", "ATT", "ATT", "ATT"];
  const players = positions.map((pos, index) => ({
    id: `${id}-${index}`,
    name: `${id} ${index}`,
    pos,
    number: index + 1,
    fitness: 100,
    preferredFoot: index % 3 === 0 ? "left" : "right",
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
      roles: [],
      duties: [],
      ...tactics,
    },
  };
}

function setHomePossession(engine, { x = 50, y = 50, settled = false } = {}) {
  const owner = engine.agents.find((agent) => agent.team === "home" && agent.role === "MID");
  owner.x = x;
  owner.y = y;
  owner.heading = -Math.PI / 2;
  owner.controlPhase = "settled";
  engine.ball.owner = owner.id;
  engine.ball.state = "held";
  engine.ball.x = x;
  engine.ball.y = y;
  engine.ball.vx = 0;
  engine.ball.vy = 0;
  engine._phaseTeam = "home";
  engine._teamLoseAt.away = 0;
  engine.t = settled ? 12 : 0;
  engine._defPlans.away.until = 0;
  return owner;
}

const highProfile = collectiveDefenseProfile({ style: "balanced", pressing: 5, width: 3, defensiveLine: 4 });
const regroupProfile = collectiveDefenseProfile({ style: "defend", pressing: 1, width: 2, defensiveLine: 1 });
assert.equal(highProfile.counterPress, true);
assert.equal(regroupProfile.regroup, true);
assert.ok(highProfile.counterPressRadiusMetres > regroupProfile.counterPressRadiusMetres);
assert.ok(
  defensiveAwarenessProfile({ marking: 0.85, positioning: 0.85, decisions: 0.85 }).standoffMultiplier <
    defensiveAwarenessProfile({ marking: 0.4, positioning: 0.4, decisions: 0.4 }).standoffMultiplier,
  "better defensive awareness must produce more accurate spatial standoff"
);
assert.ok(
  weakSideTargetX({ baseX: 82, ballX: 12, profile: highProfile }) < 82,
  "the weak side must narrow toward the centre"
);

const poorTouch = pressingTrigger({
  tactics: { style: "balanced", pressing: 3 },
  phase: "out-of-possession",
  ballX: 50,
  ballY: 50,
  ownGoalY: 100,
  ownerHeading: 0,
  ownerAttackDirection: -1,
  ownerControlPhase: "first-touch",
  ballState: "control",
  nearestDistanceMetres: 9,
});
assert.equal(poorTouch.kind, PRESS_TRIGGER_KINDS.POOR_TOUCH);
assert.equal(poorTouch.active, true);

const regroupTrigger = pressingTrigger({
  tactics: { style: "defend", pressing: 1 },
  phase: "defensive-transition",
  nearestDistanceMetres: 4,
});
assert.equal(regroupTrigger.kind, PRESS_TRIGGER_KINDS.REGROUP);
assert.equal(regroupTrigger.active, false);
assert.equal(
  shouldHandoffMark({
    currentDistanceMetres: 7,
    bestDistanceMetres: 6,
    currentMarking: 0.7,
    currentDecisions: 0.7,
    profile: highProfile,
  }),
  false,
  "small distance changes must not cause marking swaps"
);
assert.equal(
  shouldHandoffMark({
    currentDistanceMetres: 12,
    bestDistanceMetres: 5,
    currentMarking: 0.7,
    currentDecisions: 0.7,
    profile: highProfile,
  }),
  true,
  "a clearly better defender must take over the mark"
);

const counterEngine = new SimEngine(
  makeClub("collective-home"),
  makeClub("collective-away", { pressing: 5, defensiveLine: 4 }),
  { random: () => 0.5 }
);
const counterOwner = setHomePossession(counterEngine);
const counterDefenders = counterEngine.agents.filter(
  (agent) => agent.team === "away" && agent.role !== "GK"
);
counterDefenders.forEach((defender, index) => {
  defender.x = 43 + (index % 5) * 3.2;
  defender.y = 44 + Math.floor(index / 5) * 6;
});
const counterPlan = counterEngine._refreshDefPlan("away", counterOwner);
const counterJobs = [...counterPlan.jobs.values()];
assert.equal(counterPlan.trigger.kind, PRESS_TRIGGER_KINDS.COUNTER_PRESS);
assert.equal(counterJobs.filter((job) => job.type === "press").length, 1);
assert.equal(counterJobs.filter((job) => job.type === "intercept").length, 2);
assert.ok(counterJobs.some((job) => job.type === "recover"), "players outside the counter-press unit must recover");
const pressJob = counterJobs.find((job) => job.type === "press");
assert.ok(pressJob.shadowId, "the presser must carry a cover-shadow receiver");
const counterSnapshot = counterEngine.snapshot();
assert.equal(counterSnapshot.defensiveCoordination.away.trigger, PRESS_TRIGGER_KINDS.COUNTER_PRESS);
assert.equal(counterSnapshot.defensiveCoordination.away.jobs.press, 1);
assert.ok(
  counterSnapshot.players.some((player) => player.defensiveJob === "recover"),
  "player snapshots must expose their current defensive task"
);

const lowEngine = new SimEngine(
  makeClub("regroup-home"),
  makeClub("regroup-away", { style: "defend", pressing: 1, width: 2, defensiveLine: 1 }),
  { random: () => 0.5 }
);
const lowOwner = setHomePossession(lowEngine);
const lowPlan = lowEngine._refreshDefPlan("away", lowOwner);
const lowJobs = [...lowPlan.jobs.values()];
assert.equal(lowPlan.trigger.kind, PRESS_TRIGGER_KINDS.REGROUP);
assert.equal(lowJobs.filter((job) => job.type === "press").length, 0);
assert.equal(lowJobs.filter((job) => job.type === "contain").length, 1);
assert.ok(lowJobs.some((job) => job.type === "recover"));

const flankEngine = new SimEngine(
  makeClub("flank-home"),
  makeClub("flank-away", { pressing: 4 }),
  { random: () => 0.5 }
);
const flankOwner = setHomePossession(flankEngine, { x: 8, y: 42, settled: true });
const flankPlan = flankEngine._refreshDefPlan("away", flankOwner);
const flankCoverEntry = [...flankPlan.jobs.entries()].find(([, job]) => job.type === "wide-cover");
assert.ok(flankCoverEntry, "a wide press must reserve an inside covering defender");
const flankCover = flankEngine.agentById(flankCoverEntry[0]);
flankEngine._thinkDefend(flankCover, flankOwner);
assert.ok(flankCover.tx > flankEngine.ball.x, "left-flank cover must protect the inside channel");

const handoffEngine = new SimEngine(
  makeClub("handoff-home"),
  makeClub("handoff-away", { pressing: 3 }),
  { random: () => 0.5 }
);
const handoffOwner = setHomePossession(handoffEngine, { x: 50, y: 42, settled: true });
const target = handoffEngine.agents.find(
  (agent) => agent.team === "home" && agent.role === "ATT"
);
for (const attacker of handoffEngine.agents) {
  if (attacker.team === "home" && attacker !== handoffOwner && attacker !== target) attacker.sentOff = true;
}
target.x = 48;
target.y = 18;
const markingCandidates = handoffEngine.agents.filter(
  (agent) => agent.team === "away" && agent.role !== "GK"
);
const currentMarker = markingCandidates.find((agent) => agent.role === "DEF");
const challenger = markingCandidates.find((agent) => agent.role === "DEF" && agent !== currentMarker);
for (const defender of markingCandidates) {
  defender.x = 85;
  defender.y = 60;
}
currentMarker.x = 50;
currentMarker.y = 21;
challenger.x = 49;
challenger.y = 20.5;
const stableJobs = new Map(markingCandidates.map((defender) => [defender.id, { type: "shape" }]));
const previousJobs = new Map([[currentMarker.id, { type: "mark", markId: target.id }]]);
handoffEngine._assignMarkingJobs(
  "away",
  handoffOwner,
  stableJobs,
  markingCandidates,
  previousJobs,
  handoffEngine._collectiveDefenseProfile("away"),
  0
);
assert.equal(stableJobs.get(currentMarker.id)?.markId, target.id, "the current marker must survive a marginal overlap");

currentMarker.x = 62;
currentMarker.y = 32;
challenger.x = 48.5;
challenger.y = 19.5;
const changedJobs = new Map(markingCandidates.map((defender) => [defender.id, { type: "shape" }]));
const handoffs = handoffEngine._assignMarkingJobs(
  "away",
  handoffOwner,
  changedJobs,
  markingCandidates,
  previousJobs,
  handoffEngine._collectiveDefenseProfile("away"),
  0
);
assert.equal(changedJobs.get(challenger.id)?.markId, target.id, "the closer defender must take over an abandoned mark");
assert.equal(changedJobs.get(challenger.id)?.handoffFrom, currentMarker.id);
assert.equal(handoffs, 1);

console.log("Collective defense audit passed: triggers, cover shadows, marking handoffs, weak-side cover and layered recovery");
