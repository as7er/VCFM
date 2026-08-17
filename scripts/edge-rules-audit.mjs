import assert from "node:assert/strict";

import {
  EDGE_RESTART_TYPES,
  advantageDecision,
  backpassViolation,
  forwardProgress,
  goalkeeperBackpassControl,
  handballContactDecision,
  varReviewDecision,
} from "../js/edge-rules.js";
import { SimEngine } from "../js/sim/engine.js";

function makeClub(id) {
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
    },
  };
}

const forwardAdvantage = advantageDecision({
  ownerTeam: "home",
  foulTeam: "away",
  forwardProgress: 4,
  goalDistance: 36,
  pressure: 0.55,
});
assert.equal(forwardAdvantage.play, true, "clear forward space should activate advantage");
assert.ok(forwardAdvantage.window >= 2, "the referee needs a visible observation window");
assert.equal(
  advantageDecision({
    inPenaltyArea: true,
    ownerTeam: "home",
    foulTeam: "away",
    forwardProgress: 8,
    goalDistance: 12,
    pressure: 0.2,
  }).play,
  false,
  "penalty-area fouls must be whistled immediately"
);
assert.equal(
  advantageDecision({
    ownerTeam: "home",
    foulTeam: "away",
    forwardProgress: 0.2,
    goalDistance: 55,
    pressure: 0.9,
  }).play,
  false,
  "possession without a real spatial benefit is not advantage"
);
assert.equal(forwardProgress({ fromY: 48, toY: 40, attackDirection: -1 }), 8);

const defender = { id: "def", team: "home", role: "DEF" };
const goalkeeper = { id: "gk", team: "home", role: "GK" };
assert.equal(
  backpassViolation({ passer: defender, goalkeeper, pass: { deliberate: true } }).violation,
  true,
  "a deliberate foot pass to the goalkeeper must be tracked"
);
assert.equal(
  backpassViolation({ passer: defender, goalkeeper, pass: { deliberate: true, cross: true } }).violation,
  false,
  "crosses are not deliberate goalkeeper backpasses"
);
assert.equal(
  goalkeeperBackpassControl({ pressure: 0.8, decisions: 0.45, positioning: 0.45, roll: 0 }).useHands,
  true,
  "a seeded judgement error can produce the low-frequency handling violation"
);
assert.equal(
  goalkeeperBackpassControl({ pressure: 0.8, decisions: 0.45, positioning: 0.45, roll: 0.5 }).useHands,
  false,
  "goalkeepers must normally control a deliberate backpass with their feet"
);
assert.equal(
  handballContactDecision({ ballHeight: 0.2, ballSpeedMps: 18, roll: 0 }).handball,
  false,
  "ground passes must never become handballs"
);
assert.equal(
  handballContactDecision({
    ballHeight: 1.35,
    ballSpeedMps: 18,
    bodyExposure: 0.8,
    decisions: 0.45,
    isCross: true,
    roll: 0,
  }).handball,
  true,
  "an eligible upper-body cross contact must be able to produce a handball"
);
assert.equal(
  varReviewDecision({
    incident: "goal",
    onFieldDecision: "goal",
    evidence: { crossedGoalLine: true, insidePosts: true, underBar: true, offside: false },
  }).decision,
  "confirmed"
);
assert.equal(
  varReviewDecision({
    incident: "goal",
    onFieldDecision: "goal",
    evidence: { crossedGoalLine: true, insidePosts: true, underBar: true, offside: true },
  }).finalDecision,
  "no-goal",
  "a contradictory offside snapshot must overturn a goal"
);
assert.equal(
  varReviewDecision({
    incident: "penalty",
    onFieldDecision: "penalty",
    evidence: { inPenaltyArea: false, offenceType: "handball" },
  }).decision,
  "overturned"
);

const recycleEngine = new SimEngine(makeClub("recycle-home"), makeClub("recycle-away"), {
  random: () => 0.5,
});
const recycleDefender = recycleEngine.agents.find(
  (agent) => agent.team === "home" && agent.role === "DEF"
);
const recycleGoalkeeper = recycleEngine.agents.find(
  (agent) => agent.team === "home" && agent.role === "GK"
);
const pressingForward = recycleEngine.agents.find(
  (agent) => agent.team === "away" && agent.role === "ATT"
);
recycleDefender.x = 50;
recycleDefender.y = 72;
recycleGoalkeeper.x = 50;
recycleGoalkeeper.y = 94;
pressingForward.x = 53;
pressingForward.y = 72;
assert.ok(
  recycleEngine._passCandidates(recycleDefender).some(
    (candidate) => candidate.agent.id === recycleGoalkeeper.id && candidate.backpass
  ),
  "a genuinely pressed defender in the build-up zone must be able to recycle to the goalkeeper"
);

const backpassEngine = new SimEngine(makeClub("backpass-home"), makeClub("backpass-away"), {
  random: () => 0,
});
backpassEngine.t = 12;
backpassEngine.deadBallUntil = 0;
const homeGoalkeeper = backpassEngine.agents.find(
  (agent) => agent.team === "home" && agent.role === "GK"
);
const homeDefender = backpassEngine.agents.find(
  (agent) => agent.team === "home" && agent.role === "DEF"
);
for (const agent of backpassEngine.agents) {
  agent.x = agent === homeGoalkeeper ? 50 : agent.team === "home" ? 15 : 85;
  agent.y = agent === homeGoalkeeper ? 89 : agent.team === "home" ? 55 : 35;
}
Object.assign(backpassEngine.ball, {
  x: homeGoalkeeper.x,
  y: homeGoalkeeper.y,
  z: 0,
  vx: 0,
  vy: 0,
  vz: 0,
  owner: null,
  state: "pass",
  kickTeam: "home",
  lastKicker: homeDefender.id,
  receiverId: homeGoalkeeper.id,
  settleUntil: 0,
  backpassCandidate: true,
  backpassFrom: homeDefender.id,
  backpassTargetId: homeGoalkeeper.id,
});
backpassEngine._resolvePossession(0.1);
assert.ok(
  backpassEngine.events.some(
    (event) => event.type === "backpass" && event.agentId === homeGoalkeeper.id
  ),
  "goalkeeper handling must emit the backpass fact"
);
assert.ok(
  backpassEngine.events.some((event) => event.type === EDGE_RESTART_TYPES.INDIRECT_FREE_KICK),
  "backpass handling must create an indirect free kick"
);
assert.equal(backpassEngine.ball.restartType, EDGE_RESTART_TYPES.INDIRECT_FREE_KICK);
const indirectTaker = backpassEngine.agentById(backpassEngine.ball.owner);
assert.equal(indirectTaker.team, "away", "the opponent must take the indirect free kick");
backpassEngine.t = backpassEngine.deadBallUntil + 0.1;
backpassEngine._decideOnBall(indirectTaker);
assert.equal(backpassEngine.ball.restartType, null, "the first indirect touch must release the restart");
assert.equal(backpassEngine.ball.state, "pass", "the indirect restart must begin with a pass");
assert.equal(
  backpassEngine.events.some(
    (event) => event.type === "shot" && event.agentId === indirectTaker.id
  ),
  false,
  "the taker cannot shoot directly from an indirect free kick"
);

const feetEngine = new SimEngine(makeClub("feet-home"), makeClub("feet-away"), {
  random: () => 0.5,
});
feetEngine.t = 12;
feetEngine.deadBallUntil = 0;
const feetGoalkeeper = feetEngine.agents.find(
  (agent) => agent.team === "home" && agent.role === "GK"
);
const feetDefender = feetEngine.agents.find(
  (agent) => agent.team === "home" && agent.role === "DEF"
);
for (const agent of feetEngine.agents) {
  agent.x = agent === feetGoalkeeper ? 50 : agent.team === "home" ? 15 : 85;
  agent.y = agent === feetGoalkeeper ? 89 : agent.team === "home" ? 55 : 35;
}
Object.assign(feetEngine.ball, {
  x: feetGoalkeeper.x,
  y: feetGoalkeeper.y,
  z: 0,
  vx: 0,
  vy: 0,
  vz: 0,
  owner: null,
  state: "pass",
  kickTeam: "home",
  lastKicker: feetDefender.id,
  receiverId: feetGoalkeeper.id,
  settleUntil: 0,
  backpassCandidate: true,
  backpassFrom: feetDefender.id,
  backpassTargetId: feetGoalkeeper.id,
});
feetEngine._resolvePossession(0.1);
assert.equal(feetEngine.ball.owner, feetGoalkeeper.id);
assert.equal(feetEngine.ball.state, "control");
assert.ok(
  feetEngine.events.some(
    (event) => event.type === "gk_backpass_control" && event.agentId === feetGoalkeeper.id
  ),
  "the normal backpass outcome must be visible foot control, not an automatic violation"
);
assert.equal(feetEngine.events.some((event) => event.type === "backpass"), false);

const handballEngine = new SimEngine(makeClub("handball-home"), makeClub("handball-away"), {
  random: () => 0,
});
handballEngine.t = 16;
handballEngine.deadBallUntil = 0;
handballEngine._teamInterceptUntil.home = 100;
const handballDefender = handballEngine.agents.find(
  (agent) => agent.team === "home" && agent.role === "DEF"
);
const handballPasser = handballEngine.agents.find(
  (agent) => agent.team === "away" && agent.role === "ATT"
);
for (const agent of handballEngine.agents) {
  agent.x = agent === handballDefender ? 50 : agent.team === "home" ? 15 : 85;
  agent.y = agent === handballDefender ? 88 : agent.team === "home" ? 55 : 35;
}
Object.assign(handballEngine.ball, {
  x: handballDefender.x,
  y: handballDefender.y,
  z: 1.35,
  vx: 10,
  vy: 0,
  vz: 0,
  owner: null,
  state: "pass",
  kickTeam: "away",
  lastKicker: handballPasser.id,
  receiverId: handballDefender.id,
  kickX: handballDefender.x,
  kickY: handballDefender.y - 10,
  settleUntil: 0,
  backpassCandidate: false,
  _handballChecked: new Set(),
});
handballEngine._resolvePossession(0.1);
assert.ok(
  handballEngine.events.some(
    (event) => event.type === "handball" && event.agentId === handballDefender.id
  ),
  "the spatial engine must emit the handball cause"
);
assert.ok(
  handballEngine.events.some(
    (event) => event.type === "var_decision" && event.incident === "penalty"
  ),
  "a penalty handball must enter the VAR evidence stream"
);
assert.ok(handballEngine.pendingPenalty, "a handball in the own penalty area must award a penalty");

const goalReviewEngine = new SimEngine(makeClub("goal-var-home"), makeClub("goal-var-away"), {
  random: () => 0.5,
});
const reviewedScorer = goalReviewEngine.agents.find(
  (agent) => agent.team === "home" && agent.role === "ATT"
);
goalReviewEngine.ball.lastKicker = reviewedScorer.id;
goalReviewEngine.ball.kickTeam = "home";
goalReviewEngine._goal("home", {
  crossedGoalLine: true,
  insidePosts: true,
  underBar: true,
  crossX: 50,
  crossZ: 1,
});
assert.equal(goalReviewEngine.score.home, 1);
assert.ok(
  goalReviewEngine.events.some(
    (event) => event.type === "var_decision" && event.incident === "goal" && event.decision === "confirmed"
  ),
  "valid goal-line evidence must confirm the goal"
);

const overturnedGoalEngine = new SimEngine(
  makeClub("overturn-home"),
  makeClub("overturn-away"),
  { random: () => 0.5 }
);
const overturnedScorer = overturnedGoalEngine.agents.find(
  (agent) => agent.team === "home" && agent.role === "ATT"
);
overturnedGoalEngine.ball.lastKicker = overturnedScorer.id;
overturnedGoalEngine.ball.kickTeam = "home";
overturnedGoalEngine._goal("home", {
  crossedGoalLine: true,
  insidePosts: true,
  underBar: true,
  offside: true,
  crossX: 50,
  crossZ: 1,
});
assert.equal(overturnedGoalEngine.score.home, 0);
assert.equal(overturnedGoalEngine.ball.restartType, "goalkick");
assert.ok(
  overturnedGoalEngine.events.some(
    (event) => event.type === "var_decision" && event.decision === "overturned"
  ),
  "contradictory goal evidence must change the restart outcome"
);

function prepareAdvantageEngine(id) {
  const engine = new SimEngine(makeClub(`${id}-home`), makeClub(`${id}-away`), {
    random: () => 0.5,
  });
  engine.t = 18;
  engine.deadBallUntil = 0;
  const victim = engine.agents.find((agent) => agent.team === "home" && agent.role === "MID");
  const fouler = engine.agents.find((agent) => agent.team === "away" && agent.role === "DEF");
  for (const agent of engine.agents) {
    agent.x = agent.team === "home" ? 30 : 78;
    agent.y = agent.team === "home" ? 60 : 65;
  }
  victim.x = 50;
  victim.y = 38;
  victim.ty = 28;
  victim.controlPhase = "settled";
  fouler.x = 52.5;
  fouler.y = 38;
  engine.ball.owner = victim.id;
  engine.ball.state = "held";
  engine.ball.x = victim.x;
  engine.ball.y = victim.y;
  engine._phaseTeam = "home";
  let roll = 0;
  engine.random = () => (roll++ === 0 ? 0 : 0.5);
  return { engine, victim, fouler };
}

const playedScenario = prepareAdvantageEngine("played");
assert.equal(
  playedScenario.engine._commitFoul(playedScenario.fouler, playedScenario.victim),
  true
);
assert.ok(playedScenario.engine._advantage, "eligible fouls must open an advantage window");
assert.ok(
  playedScenario.engine.events.some((event) => event.type === "advantage"),
  "the referee signal must enter the same event stream"
);
playedScenario.victim.y = 33;
playedScenario.engine.ball.y = 33;
playedScenario.engine._processAdvantage();
assert.equal(playedScenario.engine._advantage, null);
assert.ok(
  playedScenario.engine.events.some((event) => event.type === "advantage_played"),
  "real forward progress must complete the advantage"
);
assert.equal(playedScenario.engine.ball.restartType || null, null);

const recalledScenario = prepareAdvantageEngine("recalled");
recalledScenario.engine._commitFoul(recalledScenario.fouler, recalledScenario.victim);
recalledScenario.engine.ball.owner = recalledScenario.fouler.id;
recalledScenario.engine._processAdvantage();
assert.equal(
  recalledScenario.engine.ball.restartType,
  EDGE_RESTART_TYPES.DIRECT_FREE_KICK,
  "lost advantage must return to the original free-kick location"
);
assert.ok(
  recalledScenario.engine.events.some(
    (event) => event.type === "foul" && event.advantage && event.whistle
  )
);

const snapshot = recalledScenario.engine.snapshot();
assert.equal(snapshot.ball.restartType, EDGE_RESTART_TYPES.DIRECT_FREE_KICK);
assert.equal(snapshot.edgeRules.advantage, null);

console.log("edge rules audit passed");
