import assert from "node:assert/strict";

import { SimEngine, SIM } from "../js/sim/engine.js";

const matches = Math.max(8, Number(process.argv[2]) || 24);
const equalOnly = process.argv[4] === "equal-only";
const strongMatches = equalOnly ? 0 : Math.max(16, matches);
const simulationProfile = process.argv[3] === "background" ? "background" : "standard";
const timeStep = simulationProfile === "background" ? 0.3 : SIM.DT;
const separationPasses = simulationProfile === "background" ? 4 : 8;

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
    return {
      id,
      name: id,
      pos,
      number: index + 1,
      fitness: 100,
      attrs: {
        pace: rating,
        shooting: rating,
        passing: rating,
        dribbling: rating,
        defending: rating,
        physical: rating,
        finishing: rating,
        tackling: rating,
        marking: rating,
        strength: rating,
        stamina: rating,
        vision: rating,
        reflexes: rating,
        handling: rating,
        positioning: rating,
        kicking: rating,
      },
    };
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

function validateKickoff(engine, kickingTeam) {
  for (const agent of engine.agents) {
    assert.ok(
      agent.team === "home" ? agent.y >= 50 : agent.y <= 50,
      `${agent.id} is in the wrong half at kickoff`
    );
    if (agent.team !== kickingTeam) {
      assert.ok(
        Math.hypot(agent.x - 50, agent.y - 50) >= 9.1,
        `${agent.id} is inside the centre circle before kickoff`
      );
    }
  }
}

function distanceBin(distance) {
  if (distance < 16) return "under16";
  if (distance < 22) return "16to22";
  if (distance < 30) return "22to30";
  return "30plus";
}

function runMatch(homeAbility, awayAbility, seed) {
  const originalRandom = Math.random;
  Math.random = seededRandom(seed);
  try {
    const engine = new SimEngine(
      makeClub(`home-${seed}`, homeAbility),
      makeClub(`away-${seed}`, awayAbility),
      { simulationProfile, timeStep, separationPasses }
    );
    validateKickoff(engine, "home");
    const steps = Math.round((90 * 60) / timeStep);
    for (let step = 0; step < steps; step++) engine.step(timeStep);
    return engine;
  } finally {
    Math.random = originalRandom;
  }
}

const totals = {
  goals: 0,
  shots: 0,
  saves: 0,
  passes: 0,
  completedPasses: 0,
  crosses: 0,
  throughPasses: 0,
  tackles: 0,
  interceptions: 0,
  fouls: 0,
  yellows: 0,
  reds: 0,
  penalties: 0,
  corners: 0,
  cornerShots: 0,
  cornerGoals: 0,
  injuries: 0,
  stalls: 0,
  openGoalShots: 0,
  openGoalReasons: {},
  goalkeeperClaims: 0,
  goalkeeperBlocks: 0,
  goalkeeperChallenges: 0,
  goalkeeperFouls: 0,
  unattributedGoals: 0,
  ownGoals: 0,
  penaltyGoals: 0,
  distance: {
    under16: { shots: 0, goals: 0 },
    "16to22": { shots: 0, goals: 0 },
    "22to30": { shots: 0, goals: 0 },
    "30plus": { shots: 0, goals: 0 },
  },
};
const stallSeeds = [];

for (let match = 0; match < matches; match++) {
  const seed = 165000 + match;
  const engine = runMatch(13, 13, seed);
  const recentShots = [];
  const recentCorners = { home: -Infinity, away: -Infinity };
  for (const event of engine.events) {
    if (event.type === "shot") {
      const shot = {
        team: event.team,
        t: event.t,
        bin: distanceBin(Number(event.distance) || 18),
      };
      recentShots.push(shot);
      totals.shots++;
      totals.distance[shot.bin].shots++;
      if (event.openGoal) {
        totals.openGoalShots++;
        const reason = event.openGoalReason || "unknown";
        totals.openGoalReasons[reason] = (totals.openGoalReasons[reason] || 0) + 1;
      }
      if (event.t - recentCorners[event.team] <= 18) totals.cornerShots++;
    } else if (event.type === "goal") {
      totals.goals++;
      if (event.ownGoal) totals.ownGoals++;
      if (event.penalty) totals.penaltyGoals++;
      const shot = recentShots
        .slice()
        .reverse()
        .find((item) => item.team === event.team && event.t - item.t <= 8);
      if (shot) totals.distance[shot.bin].goals++;
      else totals.unattributedGoals++;
      if (event.t - recentCorners[event.team] <= 18) totals.cornerGoals++;
    } else if (event.type === "save") totals.saves++;
    else if (event.type === "gk_claim") totals.goalkeeperClaims++;
    else if (event.type === "gk_block") totals.goalkeeperBlocks++;
    else if (event.type === "gk_challenge") totals.goalkeeperChallenges++;
    else if (event.type === "pass") {
      totals.passes++;
      if (event.cross) totals.crosses++;
      if (event.through && !event.cross) totals.throughPasses++;
    } else if (event.type === "receive") totals.completedPasses++;
    else if (event.type === "tackle") totals.tackles++;
    else if (event.type === "intercept") totals.interceptions++;
    else if (event.type === "corner") {
      totals.corners++;
      recentCorners[event.team] = event.t;
    } else if (event.type === "foul") {
      totals.fouls++;
      if (engine.agentById(event.agentId)?.role === "GK") totals.goalkeeperFouls++;
      if (event.penalty) totals.penalties++;
      if (event.card === "yellow") totals.yellows++;
      if (event.card === "red" || event.card === "red2") totals.reds++;
    } else if (event.type === "injury") totals.injuries++;
    else if (event.type === "stall_clear") {
      totals.stalls++;
      stallSeeds.push(seed);
    }
  }
}

let strongPoints = 0;
let strongWins = 0;
let strongGoals = 0;
let weakGoals = 0;
for (let match = 0; match < strongMatches; match++) {
  const strongAtHome = match % 2 === 0;
  const engine = runMatch(strongAtHome ? 15 : 11, strongAtHome ? 11 : 15, 265000 + match);
  const scored = strongAtHome ? engine.score.home : engine.score.away;
  const conceded = strongAtHome ? engine.score.away : engine.score.home;
  strongGoals += scored;
  weakGoals += conceded;
  if (scored > conceded) strongWins++;
  strongPoints += scored > conceded ? 3 : scored === conceded ? 1 : 0;
}

const perMatch = (value) => Number((value / matches).toFixed(2));
const pct = (part, whole) => Number((whole ? (part / whole) * 100 : 0).toFixed(1));
const distance = Object.fromEntries(
  Object.entries(totals.distance).map(([bin, row]) => [
    bin,
    { ...row, sharePct: pct(row.shots, totals.shots), conversionPct: pct(row.goals, row.shots) },
  ])
);
const report = {
  simulationProfile,
  timeStep,
  separationPasses,
  stallSeeds,
  equalMatches: matches,
  perMatch: {
    goals: perMatch(totals.goals),
    shots: perMatch(totals.shots),
    saves: perMatch(totals.saves),
    passes: perMatch(totals.passes),
    completedPasses: perMatch(totals.completedPasses),
    crosses: perMatch(totals.crosses),
    throughPasses: perMatch(totals.throughPasses),
    tackles: perMatch(totals.tackles),
    interceptions: perMatch(totals.interceptions),
    fouls: perMatch(totals.fouls),
    yellows: perMatch(totals.yellows),
    reds: perMatch(totals.reds),
    penalties: perMatch(totals.penalties),
    corners: perMatch(totals.corners),
    cornerShots: perMatch(totals.cornerShots),
    cornerGoals: perMatch(totals.cornerGoals),
    injuries: perMatch(totals.injuries),
    stalls: perMatch(totals.stalls),
    openGoalShots: perMatch(totals.openGoalShots),
    goalkeeperClaims: perMatch(totals.goalkeeperClaims),
    goalkeeperBlocks: perMatch(totals.goalkeeperBlocks),
    goalkeeperChallenges: perMatch(totals.goalkeeperChallenges),
    goalkeeperFouls: perMatch(totals.goalkeeperFouls),
    unattributedGoals: perMatch(totals.unattributedGoals),
    ownGoals: perMatch(totals.ownGoals),
    penaltyGoals: perMatch(totals.penaltyGoals),
  },
  shotConversionPct: pct(totals.goals, totals.shots),
  passCompletionPct: pct(totals.completedPasses, totals.passes),
  crossSharePct: pct(totals.crosses, totals.passes),
  throughPassSharePct: pct(totals.throughPasses, totals.passes),
  openGoalReasons: Object.fromEntries(
    Object.entries(totals.openGoalReasons).map(([reason, count]) => [reason, perMatch(count)])
  ),
  outsideBoxSharePct: pct(
    totals.distance["16to22"].shots + totals.distance["22to30"].shots + totals.distance["30plus"].shots,
    totals.shots
  ),
  distance,
  strongVsWeak: {
    matches: strongMatches,
    pointsPerMatch: Number((strongPoints / strongMatches).toFixed(2)),
    winRatePct: pct(strongWins, strongMatches),
    goalsFor: strongGoals,
    goalsAgainst: weakGoals,
  },
};

console.log(JSON.stringify(report, null, 2));

assert.equal(totals.stalls, 0, "spatial engine must not need watchdog clearances");
assert.ok(report.perMatch.goals >= 2.5 && report.perMatch.goals <= 3.3, "goals per match left the calibration envelope");
assert.ok(report.shotConversionPct >= 9 && report.shotConversionPct <= 15, "shot conversion left the calibration envelope");
assert.ok(report.perMatch.passes >= 800 && report.perMatch.passes <= 1250, "pass volume left the calibration envelope");
assert.ok(report.passCompletionPct >= 72 && report.passCompletionPct <= 88, "pass completion left the calibration envelope");
assert.ok(report.crossSharePct >= 3 && report.crossSharePct <= 14, "cross share left the calibration envelope");
assert.ok(
  report.outsideBoxSharePct >= 25 && report.outsideBoxSharePct <= 50,
  "outside-box shot share left the calibration envelope"
);
assert.ok(report.distance["30plus"].conversionPct <= 1, "30+ distance conversion is too high");
assert.ok(report.perMatch.tackles <= 55, "successful tackles remain unrealistically frequent");
assert.ok(report.perMatch.interceptions <= 60, "clean interceptions remain unrealistically frequent");
assert.ok(report.perMatch.penalties >= 0.1 && report.perMatch.penalties <= 0.5, "penalty frequency left the calibration envelope");
assert.ok(report.perMatch.corners >= 3 && report.perMatch.corners <= 10, "corner frequency left the calibration envelope");
assert.ok(report.perMatch.cornerShots >= 0.5, "corners are not producing attacking shots");
// 24 场样本的胜率会被平局和单场随机性显著扰动；积分/净胜球更稳定地
// 检验能力差异仍然存在，同时避免把正常的足球方差误判为引擎回归。
if (!equalOnly) {
  assert.ok(report.strongVsWeak.pointsPerMatch >= 1.5, "strong teams must retain a visible ability advantage");
  assert.ok(strongGoals > weakGoals, "strong teams need a positive goal difference");
}
