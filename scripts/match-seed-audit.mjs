import assert from "node:assert/strict";

import { simulateMatchSync } from "../js/match.js";
import { createWorld } from "../js/models.js";
import { CLUB_TEMPLATES } from "../js/data.js";
import { createSeededRandom, ensureMatchSeed } from "../js/random.js";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function matchFingerprint(result) {
  return {
    score: [result.homeGoals, result.awayGoals],
    seed: result.report?.matchSeed,
    weather: result.report?.weather?.key,
    events: (result.events || []).map((event) => ({
      minute: event.minute,
      type: event.type,
      teamId: event.teamId || null,
      playerId: event.playerId || null,
      assistId: event.assistId || null,
      ownGoal: !!event.ownGoal,
      penalty: !!event.penalty,
    })),
  };
}

const startClub = CLUB_TEMPLATES.find((club) => club.division === 3);
const source = createWorld(startClub.id, "Seed Audit");
const fixture = source.fixtures.find((item) => item.home === source.userClubId || item.away === source.userClubId);
assert.ok(fixture, "seed audit needs a user fixture");
const worldA = clone(source);
const worldB = clone(source);
const fixtureA = worldA.fixtures.find((item) => item.id === fixture.id);
const fixtureB = worldB.fixtures.find((item) => item.id === fixture.id);

const seedA = ensureMatchSeed(worldA, fixtureA);
const seedB = ensureMatchSeed(worldB, fixtureB);
assert.equal(seedA, seedB, "the same fixture must receive the same seed");

const randomA = createSeededRandom(seedA);
const randomB = createSeededRandom(seedA);
assert.deepEqual(
  Array.from({ length: 8 }, () => randomA()),
  Array.from({ length: 8 }, () => randomB()),
  "seeded random streams must be reproducible"
);

const resultA = simulateMatchSync(worldA, fixtureA);
const resultB = simulateMatchSync(worldB, fixtureB);
assert.deepEqual(matchFingerprint(resultA), matchFingerprint(resultB), "same seed must reproduce the complete match event stream");
assert.equal(fixtureA.matchSeed, seedA);
assert.equal(fixtureB.matchSeed, seedA);

const changed = clone(source);
const changedFixture = changed.fixtures.find((item) => item.id === fixture.id);
changedFixture.matchSeed = (seedA + 1) >>> 0;
const changedResult = simulateMatchSync(changed, changedFixture);
assert.equal(changedResult.report.matchSeed, changedFixture.matchSeed, "explicit seed override must be respected");

console.log(JSON.stringify({ seed: seedA, score: resultA.report.score, events: resultA.events.length }, null, 2));
console.log("Match seed audit passed: deterministic stream, fixture persistence, and explicit overrides");
