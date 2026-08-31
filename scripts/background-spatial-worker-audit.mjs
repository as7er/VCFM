import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { CLUB_TEMPLATES } from "../js/data.js";
import {
  commitPreparedMatch,
  prepareMatchSimulation,
  runPreparedMatchSimulation,
  simulateMatchSync,
} from "../js/match.js";
import { createWorld, resetIdCounter } from "../js/models.js";
import { ensureWorldStaff } from "../js/staff.js";

const clone = (value) => structuredClone(value);

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

const start = CLUB_TEMPLATES.find((club) => club.division === 3);
const originalRandom = Math.random;
const originalNow = Date.now;
Math.random = seededRandom(0xabcdef01);
Date.now = () => 1787061720042;
let source;
try {
  resetIdCounter(1);
  source = createWorld(start.id, "Background Spatial Worker Audit");
  ensureWorldStaff(source);
} finally {
  Math.random = originalRandom;
  Date.now = originalNow;
}
const sourceFixture = source.fixtures.find(
  (fixture) => fixture.home !== source.userClubId && fixture.away !== source.userClubId
);
assert.ok(sourceFixture, "an AI-only fixture is required");

function run() {
  const world = clone(source);
  const fixture = world.fixtures.find((item) => item.id === sourceFixture.id);
  const result = simulateMatchSync(world, fixture, {
    engineMode: "spatial",
    simulationProfile: "background",
  });
  return {
    world,
    fixture,
    result,
    fingerprint: {
      score: [result.homeGoals, result.awayGoals],
      events: result.events.map((event) => [
        event.minute,
        event.type,
        event.teamId || null,
        event.playerId || null,
      ]),
      shots: [result.report.home.shots, result.report.away.shots],
      xg: [result.report.home.xg, result.report.away.xg],
    },
  };
}

const first = run();
const second = run();

const splitWorld = clone(source);
const splitFixture = splitWorld.fixtures.find((item) => item.id === sourceFixture.id);
const prepared = prepareMatchSimulation(splitWorld, splitFixture, {
  engineMode: "spatial",
  simulationProfile: "background",
});
const completed = runPreparedMatchSimulation(prepared, {
  engineMode: "spatial",
  simulationProfile: "background",
});
assert.equal(completed.simEvents, null, "background worker must not return raw spatial events");
assert.equal(completed.analysis?.compact, true, "background worker must return compact analysis");
commitPreparedMatch(splitWorld, splitFixture, completed);

const committedState = (world, fixtureId) => {
  const fixture = world.fixtures.find((item) => item.id === fixtureId);
  return {
    fixture,
    home: world.clubs.find((club) => club.id === fixture.home),
    away: world.clubs.find((club) => club.id === fixture.away),
    table: world.table,
    financeObligations: world.financeObligations,
  };
};
assert.deepEqual(
  committedState(splitWorld, sourceFixture.id),
  committedState(first.world, sourceFixture.id),
  "prepared worker clock and ordered commit must equal the synchronous result"
);

assert.equal(first.fixture.matchEngine, "spatial-v2");
assert.equal(first.fixture.simulationProfile, "background");
assert.equal(first.result.report.engine, "spatial-v2");
assert.equal(first.result.report.simulationProfile, "background");
assert.equal(first.result.report.simulationMeta?.timeStep, 0.3);
assert.equal(first.result.report.simulationMeta?.separationPasses, 4);
assert.equal(first.result.report.simulationMeta?.integration?.adaptive, true);
assert.ok(
  first.result.report.simulationMeta?.integration?.fineSharePct > 0,
  "background match must substep critical ball interactions"
);
assert.ok(
  first.result.report.simulationMeta?.integration?.fineSharePct <= 20,
  "background critical ball windows exceeded their time budget"
);
// 预算由 32 上调到 34（v237，与 phase-shape-evidence-audit 同步）：恢复禁区盯人后
// 后卫真的贴到球边（最近防守者 2.42 → 2.05 米），close-contest 细步窗口因此更常
// 触发——这正是改动的预期后果，细步本身就是为了让禁区接触判定更准。
// 实测代价：8 场后台档 16.6 → 17.4 秒（+4.8%），占比 31.9% → 32.3%。
assert.ok(
  first.result.report.simulationMeta?.integration?.extraStepSharePct <= 34,
  "background critical ball substeps exceeded their execution budget"
);
assert.ok(
  first.result.report.simulationMeta?.integration?.reasons?.["pass-interaction"] > 0,
  "background match must preserve pass contact resolution"
);
assert.ok(
  first.result.report.simulationMeta?.integration?.reasons?.["goalkeeper-motion"] > 0,
  "background match must preserve goalkeeper reaction movement"
);
assert.ok(first.result.report.analysis, "AI spatial match must persist match analysis");
assert.ok(
  JSON.stringify(first.result.report).length <= 25_000,
  "background match report grew beyond the current save-size budget"
);
assert.ok(
  first.result.events.some((event) => event.fromSim),
  "AI spatial match must translate emergent engine events"
);
assert.deepEqual(
  first.fingerprint,
  second.fingerprint,
  "same world, fixture seed and background profile must reproduce the same match"
);

const workerSource = readFileSync(
  new URL("../js/sim/calendar-worker.js", import.meta.url),
  "utf8"
);
const clientSource = readFileSync(
  new URL("../js/sim/calendar-worker-client.js", import.meta.url),
  "utf8"
);
const matchWorkerSource = readFileSync(
  new URL("../js/sim/match-worker.js", import.meta.url),
  "utf8"
);
const matchPoolSource = readFileSync(
  new URL("../js/sim/match-worker-pool.js", import.meta.url),
  "utf8"
);
const benchmarkSource = readFileSync(
  new URL("./performance-benchmark.mjs", import.meta.url),
  "utf8"
);
const mainSource = readFileSync(new URL("../js/main.js", import.meta.url), "utf8");
assert.match(workerSource, /aiEngineMode:\s*"spatial"/);
assert.match(workerSource, /aiSimulationProfile:\s*"background"/);
assert.match(workerSource, /advanceToNextMatchDay/);
assert.match(workerSource, /advanceToSeasonEnd/);
assert.match(clientSource, /type:\s*"module"/);
assert.match(clientSource, /replaceWorldState/);
assert.match(matchWorkerSource, /runPreparedMatchSimulation/);
assert.match(matchPoolSource, /prepareMatchSimulation/);
assert.match(matchPoolSource, /commitPreparedMatch/);
assert.match(matchPoolSource, /new Worker\(/);
assert.match(matchPoolSource, /const workerSlots = \[\]/);
assert.match(matchPoolSource, /shutdownMatchWorkerPool/);
const workerWaveSource = matchPoolSource.slice(
  matchPoolSource.indexOf("function runWorkerWave"),
  matchPoolSource.indexOf("export function shutdownMatchWorkerPool")
);
assert.doesNotMatch(
  workerWaveSource,
  /terminate\(/,
  "successful fixture waves must retain their match workers"
);
assert.match(benchmarkSource, /totalAdvanceMs/);
assert.match(benchmarkSource, /totalSerializeMs/);
assert.match(benchmarkSource, /totalCompressMs/);
assert.match(benchmarkSource, /totalWallMs/);
assert.doesNotMatch(benchmarkSource, /totalBenchmarkMs/);
assert.match(mainSource, /advanceDayAsync\(world\)/);
assert.match(mainSource, /advanceToNextMatchDayAsync\(world\)/);
assert.match(mainSource, /advanceToSeasonEndAsync\(world/);

console.log(
  JSON.stringify(
    {
      fixture: first.fixture.id,
      score: first.fingerprint.score,
      shots: first.fingerprint.shots,
      xg: first.fingerprint.xg,
      engine: first.fixture.matchEngine,
      profile: first.fixture.simulationProfile,
      integration: first.result.report.simulationMeta?.integration,
      reportBytes: JSON.stringify(first.result.report).length,
      workerTransferBytes: JSON.stringify(completed).length,
      analysisEvents: first.result.report.analysis?.summary?.events || null,
    },
    null,
    2
  )
);
console.log("Background spatial worker audit passed");
