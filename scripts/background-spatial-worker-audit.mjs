import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { CLUB_TEMPLATES } from "../js/data.js";
import { simulateMatchSync } from "../js/match.js";
import { createWorld } from "../js/models.js";
import { ensureWorldStaff } from "../js/staff.js";

const clone = (value) => structuredClone(value);

const start = CLUB_TEMPLATES.find((club) => club.division === 3);
const source = createWorld(start.id, "Background Spatial Worker Audit");
ensureWorldStaff(source);
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

assert.equal(first.fixture.matchEngine, "spatial-v2");
assert.equal(first.fixture.simulationProfile, "background");
assert.equal(first.result.report.engine, "spatial-v2");
assert.equal(first.result.report.simulationProfile, "background");
assert.equal(first.result.report.simulationMeta?.timeStep, 0.2);
assert.equal(first.result.report.simulationMeta?.separationPasses, 4);
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
const mainSource = readFileSync(new URL("../js/main.js", import.meta.url), "utf8");
assert.match(workerSource, /aiEngineMode:\s*"spatial"/);
assert.match(workerSource, /aiSimulationProfile:\s*"background"/);
assert.match(workerSource, /advanceToNextMatchDay/);
assert.match(workerSource, /advanceToSeasonEnd/);
assert.match(clientSource, /type:\s*"module"/);
assert.match(clientSource, /replaceWorldState/);
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
      reportBytes: JSON.stringify(first.result.report).length,
      analysisEvents: first.result.report.analysis?.summary?.events || null,
    },
    null,
    2
  )
);
console.log("Background spatial worker audit passed");
