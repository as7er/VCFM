import assert from "node:assert/strict";

import { CLUB_TEMPLATES, FORMATIONS, START_DIVISIONS } from "../js/data.js";
import {
  applyCoachPhaseFormations,
  ensureCoachIdentity,
  phaseFormationMovementDistance,
} from "../js/manager-ecosystem.js";
import {
  commitPreparedMatch,
  prepareMatchSimulation,
  runPreparedMatchSimulation,
  simulateMatchSync,
} from "../js/match.js";
import { autoLineup, createWorld, ensureTactics, resetIdCounter } from "../js/models.js";
import { SimEngine } from "../js/sim/engine.js";
import { ensureWorldStaff } from "../js/staff.js";

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function stableHash(value) {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createSeededWorld(seed, managerName) {
  const originalRandom = Math.random;
  const originalNow = Date.now;
  Math.random = seededRandom(seed);
  Date.now = () => 1787061720042;
  try {
    resetIdCounter(1);
    const start = CLUB_TEMPLATES.find((club) => club.division === 3)
      || CLUB_TEMPLATES.find((club) => START_DIVISIONS.includes(club.division));
    assert.ok(start, "phase-shape evidence audit needs a starting club");
    const world = createWorld(start.id, managerName);
    ensureWorldStaff(world);
    return world;
  } finally {
    Math.random = originalRandom;
    Date.now = originalNow;
  }
}

function abilitySnapshot(clubs) {
  return clubs.flatMap((club) => club.players.map((player) => ({
    id: player.id,
    ovr: player.ovr,
    attrs: structuredClone(player.attrs),
  })));
}

function assertUsage(side, { positions }) {
  assert.ok(side, "spatial reports should persist phase usage");
  assert.ok(
    Math.abs(Number(side.totalSeconds) - 5400) <= 1.5,
    `phase usage should cover the match clock (${side.totalSeconds})`
  );
  const phaseTotal = Object.values(side.phaseSeconds || {}).reduce((sum, value) => sum + Number(value || 0), 0);
  assert.ok(Math.abs(phaseTotal - Number(side.totalSeconds)) <= 1.5, "phase seconds should reconcile to total time");
  const pctTotal = Object.values(side.phasePct || {}).reduce((sum, value) => sum + Number(value || 0), 0);
  assert.ok(Math.abs(pctTotal - 100) <= 0.3, "phase percentages should reconcile to 100%");
  assert.ok((side.phaseFormations || []).every((entry) => FORMATIONS[entry.formation]));
  if (positions) {
    assert.equal(side.averagePositions?.length, 11, "full reports should retain eleven average positions");
    assert.ok(side.averagePositions.every((position) =>
      position.x >= 0 && position.x <= 100 && position.y >= 0 && position.y <= 100
    ));
  } else {
    assert.equal(side.averagePositions, undefined, "compact background reports should omit player positions");
  }
}

function auditFullReport() {
  const world = createSeededWorld(0x2281001, "Phase Shape Evidence Audit");
  const fixture = world.fixtures.find((item) =>
    !item.played && (item.home === world.userClubId || item.away === world.userClubId)
  );
  assert.ok(fixture, "audit needs a user fixture");
  const user = world.clubs.find((club) => club.id === world.userClubId);
  const opponentId = fixture.home === user.id ? fixture.away : fixture.home;
  const opponent = world.clubs.find((club) => club.id === opponentId);
  ensureTactics(user);
  user.tactics.possessionFormation = "3-4-3";
  user.tactics.outOfPossessionFormation = "5-3-2";
  user.tactics.coachPhaseIdentityId = null;
  user.tactics.coachPhaseIdentityVersion = null;
  const abilities = abilitySnapshot([user, opponent]);
  const result = simulateMatchSync(world, fixture, {
    engineMode: "spatial",
    simulationProfile: "standard",
  });
  const evidence = result.report.phaseShapes;
  assert.equal(evidence.version, 1);
  assert.equal(evidence.usage.compact, false);
  assert.equal(evidence.timeline.filter((entry) => entry.minute === 0).length, 2);
  const opponentSide = fixture.home === opponent.id ? "home" : "away";
  assert.deepEqual(
    evidence.timeline.filter((entry) => entry.team === opponentSide).map((entry) => entry.minute),
    [0, 45, 60, 75],
    "AI reports should retain every scheduled shape review"
  );
  assertUsage(evidence.usage.home, { positions: true });
  assertUsage(evidence.usage.away, { positions: true });
  assert.deepEqual(abilitySnapshot([user, opponent]), abilities, "shape evidence must not alter player ability");
  return {
    score: result.report.score,
    timelineEntries: evidence.timeline.length,
    homePhasePct: evidence.usage.home.phasePct,
    awayPhasePct: evidence.usage.away.phasePct,
  };
}

function auditWorkerReport() {
  const world = createSeededWorld(0xabcdef01, "Phase Shape Worker Audit");
  const fixture = world.fixtures.find((item) =>
    !item.played && item.home !== world.userClubId && item.away !== world.userClubId
  );
  assert.ok(fixture, "audit needs an AI fixture");
  const prepared = prepareMatchSimulation(world, fixture, {
    engineMode: "spatial",
    simulationProfile: "background",
  });
  const completed = runPreparedMatchSimulation(prepared);
  const result = commitPreparedMatch(world, fixture, completed);
  const evidence = result.report.phaseShapes;
  assert.equal(evidence.usage.compact, true);
  assert.equal(evidence.timeline.length, 8, "AI-AI reports should retain 0/45/60/75 reviews for both teams");
  assertUsage(evidence.usage.home, { positions: false });
  assertUsage(evidence.usage.away, { positions: false });
  const integration = result.report.simulationMeta?.integration;
  assert.ok(
    integration?.fineSharePct <= 20,
    `evidence collection must preserve the background fine-step budget (${integration?.fineSharePct}%)`
  );
  // 预算由 32 上调到 34（v237）：恢复禁区盯人后后卫真的贴到球边（实测最近防守者
  // 由 2.42 米收到 2.05 米），`_contactFineReason` 的 close-contest 细步窗口因此更
  // 常触发——这正是改动的预期后果，细步本身就是为了让禁区接触判定更准。
  // 实测代价：8 场后台档 16.6 → 17.4 秒（+4.8%），占比 31.9% → 32.3%。
  // 基线 31.9% 原本只剩 0.1pp 余量，这里恢复到与此前相当的余量。
  assert.ok(
    integration?.extraStepSharePct <= 34,
    `evidence collection must preserve the background extra-step budget (${integration?.extraStepSharePct}%)`
  );
  return { score: result.report.score, integration };
}

function auditSeasonPlans() {
  const world = createSeededWorld(0x2282026, "Phase Shape Season Audit");
  for (const club of world.clubs) {
    ensureTactics(club);
    autoLineup(club);
  }
  const fixtures = world.fixtures.filter((fixture) => !fixture.played && fixture.home && fixture.away);
  let highAdaptPlans = 0;
  let activePlans = 0;
  let stableCoachActivations = 0;
  let movementTotal = 0;
  let movementCount = 0;
  let maxMovement = 0;
  let deterministicChecks = 0;

  for (const fixture of fixtures) {
    const home = world.clubs.find((club) => club.id === fixture.home);
    const away = world.clubs.find((club) => club.id === fixture.away);
    if (!home || !away) continue;
    for (const [club, opponent] of [[home, away], [away, home]]) {
      const identity = ensureCoachIdentity(club.staff?.coach);
      if (!identity) continue;
      const hash = stableHash(`${fixture.id}:${club.id}`);
      const scoreGap = (hash % 5) - 2;
      const minute = [45, 60, 75][hash % 3];
      const before = {
        possessionFormation: club.tactics.possessionFormation ?? null,
        outOfPossessionFormation: club.tactics.outOfPossessionFormation ?? null,
        coachPhaseIdentityId: club.tactics.coachPhaseIdentityId ?? null,
        coachPhaseIdentityVersion: club.tactics.coachPhaseIdentityVersion ?? null,
      };
      const plan = applyCoachPhaseFormations(club, club.staff.coach, { opponent, scoreGap, minute });
      assert.equal(plan.ok, true);
      if (deterministicChecks < 24) {
        const repeat = applyCoachPhaseFormations(club, club.staff.coach, { opponent, scoreGap, minute });
        assert.equal(repeat.effectivePossessionFormation, plan.effectivePossessionFormation);
        assert.equal(repeat.effectiveOutOfPossessionFormation, plan.effectiveOutOfPossessionFormation);
        deterministicChecks++;
      }
      const active = plan.effectivePossessionFormation !== plan.baseFormation
        || plan.effectiveOutOfPossessionFormation !== plan.baseFormation;
      if (identity.adaptability >= 5) {
        highAdaptPlans++;
        if (active) activePlans++;
      } else if (active) {
        stableCoachActivations++;
      }
      for (const formation of [plan.effectivePossessionFormation, plan.effectiveOutOfPossessionFormation]) {
        if (formation === plan.baseFormation) continue;
        const movement = phaseFormationMovementDistance(plan.baseFormation, formation);
        movementTotal += movement;
        movementCount++;
        maxMovement = Math.max(maxMovement, movement);
      }
      Object.assign(club.tactics, before);
    }
  }

  const activePct = highAdaptPlans ? activePlans * 100 / highAdaptPlans : 0;
  assert.ok(fixtures.length >= 1000, "season audit should scan the full fixture calendar");
  assert.ok(highAdaptPlans > 0 && activePlans > 0, "high-adaptability coaches should use distinct phase shapes");
  assert.equal(stableCoachActivations, 0, "lower-adaptability coaches should retain the stable base shape");
  assert.ok(activePct >= 10 && activePct <= 100, "phase-shape activation frequency should remain material and bounded");
  assert.ok(maxMovement <= 40, "phase shapes should not require an implausible average whole-team move");
  return {
    fixtures: fixtures.length,
    highAdaptPlans,
    activePlans,
    activePct: Number(activePct.toFixed(1)),
    averageMovement: Number((movementTotal / Math.max(1, movementCount)).toFixed(1)),
    maxMovement: Number(maxMovement.toFixed(1)),
  };
}

function makeEngineClub(id, splitShapes) {
  const positions = ["GK", "DEF", "DEF", "DEF", "DEF", "MID", "MID", "MID", "ATT", "ATT", "ATT"];
  const players = positions.map((pos, index) => ({
    id: `${id}-${index}`,
    name: `${id}-${index}`,
    pos,
    number: index + 1,
    fitness: 100,
    attrs: Object.fromEntries([
      "pace", "shooting", "passing", "dribbling", "defending", "physical", "finishing",
      "tackling", "marking", "strength", "stamina", "vision", "reflexes", "handling",
      "positioning", "kicking",
    ].map((key) => [key, 12 + ((index * 3 + key.length) % 3)])),
  }));
  const coach = { id: `${id}-coach`, role: "coach", rating: 16, age: 50 };
  return {
    id,
    name: id,
    players,
    staff: { coach },
    tactics: {
      formation: "4-3-3",
      possessionFormation: splitShapes ? "3-4-3" : null,
      outOfPossessionFormation: splitShapes ? "4-1-4-1" : null,
      coachPhaseIdentityId: splitShapes ? coach.id : null,
      lineup: players.map((player) => player.id),
      pressing: 3,
      tempo: 3,
      width: 3,
      defensiveLine: 3,
      style: "balanced",
    },
  };
}

function runEngineMatch(seed, splitShapes, simulationProfile = "background") {
  const home = makeEngineClub(`home-${seed}`, false);
  const away = makeEngineClub(`away-${seed}`, false);
  const timeStep = simulationProfile === "background" ? 0.3 : 0.1;
  const engine = new SimEngine(
    home,
    away,
    {
      random: seededRandom(seed),
      simulationProfile,
      timeStep,
      separationPasses: simulationProfile === "background" ? 4 : 8,
    }
  );
  const steps = simulationProfile === "background" ? 18000 : 54000;
  for (let step = 0; step < steps; step++) {
    if (splitShapes && step === steps / 2) {
      home.tactics.possessionFormation = "3-4-3";
      home.tactics.outOfPossessionFormation = "4-1-4-1";
      home.tactics.coachPhaseIdentityId = home.staff.coach.id;
      away.tactics.possessionFormation = "3-5-2";
      away.tactics.outOfPossessionFormation = "5-3-2";
      away.tactics.coachPhaseIdentityId = away.staff.coach.id;
    }
    engine.step(timeStep);
  }
  const result = engine.directResult();
  return {
    goals: result.score.home + result.score.away,
    shots: result.shots.home + result.shots.away,
    passes: engine.events.filter((event) => event.type === "pass").length,
    integration: engine.integrationSummary(),
    evidence: engine.tacticalShapeEvidence({ compact: true }),
  };
}

function auditPairedImpact() {
  const totals = { linked: { goals: 0, shots: 0, passes: 0 }, split: { goals: 0, shots: 0, passes: 0 } };
  const integrations = [];
  for (const seed of [22801, 22802]) {
    const linked = runEngineMatch(seed, false, "standard");
    const split = runEngineMatch(seed, true, "standard");
    for (const key of ["goals", "shots", "passes"]) {
      totals.linked[key] += linked[key];
      totals.split[key] += split[key];
    }
    assertUsage(linked.evidence.home, { positions: false });
    assertUsage(split.evidence.home, { positions: false });
    integrations.push(split.integration);
  }
  const matches = 2;
  const perMatch = (group, key) => totals[group][key] / matches;
  assert.ok(Math.abs(perMatch("split", "goals") - perMatch("linked", "goals")) <= 3);
  assert.ok(Math.abs(perMatch("split", "shots") - perMatch("linked", "shots")) <= 12);
  assert.ok(Math.abs(perMatch("split", "passes") - perMatch("linked", "passes")) <= 300);
  assert.ok(integrations.every((item) => item.fineSharePct === 0 && item.extraStepSharePct === 0));
  return {
    linked: Object.fromEntries(["goals", "shots", "passes"].map((key) => [key, Number(perMatch("linked", key).toFixed(2))])),
    split: Object.fromEntries(["goals", "shots", "passes"].map((key) => [key, Number(perMatch("split", key).toFixed(2))])),
    maxFineSharePct: Math.max(...integrations.map((item) => item.fineSharePct)),
    maxExtraStepSharePct: Math.max(...integrations.map((item) => item.extraStepSharePct)),
  };
}

const output = {
  report: auditFullReport(),
  worker: auditWorkerReport(),
  season: auditSeasonPlans(),
  pairedImpact: auditPairedImpact(),
};

console.log(JSON.stringify(output, null, 2));
console.log("Phase-shape evidence audit passed: reports persist decisions, actual usage and positions while season-wide plans remain deterministic and geometry-only");
