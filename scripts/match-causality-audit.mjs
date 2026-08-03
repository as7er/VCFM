import assert from "node:assert/strict";

import { CLUB_TEMPLATES } from "../js/data.js";
import { applyTeamTalk, createMatchSession } from "../js/match.js";
import { createWorld } from "../js/models.js";
import { ensureSimEngine, runSimPeriodRaw } from "../js/sim/adapt.js";
import { ensureWorldStaff } from "../js/staff.js";

function clone(value) {
  return structuredClone(value);
}

function build(source, fixtureId, talkId) {
  const world = clone(source);
  const fixture = world.fixtures.find((item) => item.id === fixtureId);
  const state = createMatchSession(world, fixture);
  assert.equal(applyTeamTalk(state, talkId, "pre").ok, true);
  const engine = ensureSimEngine(state);
  const period = runSimPeriodRaw(engine, 1, 45);
  return {
    state,
    engine,
    fingerprint: {
      score: period.scaled.score,
      shots: period.scaled.shots,
      xg: period.scaled.xg,
      events: engine.events.map((event) => [event.type, event.team, Math.round(event.t * 10)]),
    },
  };
}

const startClub = CLUB_TEMPLATES.find((club) => club.division === 3);
const source = createWorld(startClub.id, "Match Causality Audit");
ensureWorldStaff(source);
const fixture = source.fixtures.find(
  (item) => item.home === source.userClubId || item.away === source.userClubId
);
assert.ok(fixture);

const encourage = build(source, fixture.id, "encourage");
const solid = build(source, fixture.id, "solid");
const side = encourage.state.userSide;
assert.ok(encourage.state.simModifiers[side].atk > solid.state.simModifiers[side].atk);
assert.ok(encourage.state.simModifiers[side].def < solid.state.simModifiers[side].def);
assert.equal(encourage.engine.matchModifiers, encourage.state.simModifiers);
assert.notDeepEqual(
  encourage.fingerprint,
  solid.fingerprint,
  "different team talks must change the spatial match event stream"
);

console.log(JSON.stringify({
  side,
  encourage: encourage.state.simModifiers[side],
  solid: solid.state.simModifiers[side],
  scores: [encourage.fingerprint.score, solid.fingerprint.score],
}, null, 2));
console.log("Match causality audit passed: spatial matches consume shared match modifiers");
