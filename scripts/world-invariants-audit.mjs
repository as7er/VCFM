import assert from "node:assert/strict";

import { CLUB_TEMPLATES, START_DIVISIONS } from "../js/data.js";
import { createWorld } from "../js/models.js";
import { assertWorldInvariants } from "../js/world-invariants.js";

const start = CLUB_TEMPLATES.find((club) => START_DIVISIONS.includes(club.division));
assert.ok(start, "a playable starting club is required");

const world = createWorld(start.id, "World Invariants Audit");
assert.equal(assertWorldInvariants(world, "clean"), world);

const duplicate = structuredClone(world);
duplicate.clubs[1].players[0].id = duplicate.clubs[0].players[0].id;
assert.throws(() => assertWorldInvariants(duplicate, "duplicate"), /duplicate player id/);

const brokenLineup = structuredClone(world);
brokenLineup.clubs[0].tactics.lineup[0] = "missing-player";
assert.throws(() => assertWorldInvariants(brokenLineup, "lineup"), /lineup references missing-player/);

const brokenFixture = structuredClone(world);
brokenFixture.fixtures[0].away = "missing-club";
assert.throws(() => assertWorldInvariants(brokenFixture, "fixture"), /references invalid clubs/);

console.log("World invariants audit passed: clean world, duplicate IDs, lineup references, and fixture references");
