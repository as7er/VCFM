import assert from "node:assert/strict";
import { CLUB_TEMPLATES } from "../js/data.js";
import { createWorld } from "../js/models.js";
import { ensureWorldStaff } from "../js/staff.js";
import {
  applySubstitution,
  createMatchSession,
  finalizeMatch,
  getBenchPlayers,
} from "../js/match.js";

const startClub = CLUB_TEMPLATES.find((club) => club.division === 3);
const world = createWorld(startClub.id, "Appearance Audit");
ensureWorldStaff(world);
const fixture = world.fixtures.find((item) =>
  item.home === world.userClubId || item.away === world.userClubId
);
assert.ok(fixture);
world.day = fixture.day;

const state = createMatchSession(world, fixture);
const club = state.userClub;
const side = state.userSide;
const startedIds = state.startingLineups[side];
const out = club.players.find((player) => startedIds.includes(player.id) && player.pos !== "GK");
const bench = getBenchPlayers(club, state);
const incoming = bench.find((player) => player.pos === out.pos) || bench.find((player) => player.pos !== "GK");
assert.ok(out && incoming, "audit needs an outfield substitution pair");

assert.equal(applySubstitution(state, club, out.id, incoming.id, 46).ok, true);
const result = finalizeMatch(state);
const report = result.report;
const ratings = report.ratings?.[side] || [];

assert.equal(out.stats.apps, 1, "substituted starter must retain an appearance");
assert.equal(incoming.stats.apps, 1, "incoming substitute must receive an appearance");
assert.ok(
  ratings.some((row) => row.playerId === out.id),
  `substituted starter must receive a rating (${side}: ${ratings.map((row) => row.playerId).join(", ")})`
);
assert.ok(
  ratings.some((row) => row.playerId === incoming.id),
  `incoming substitute must receive a rating (${side}: ${ratings.map((row) => row.playerId).join(", ")})`
);

const outEntry = out.playingTime.history.at(-1);
const inEntry = incoming.playingTime.history.at(-1);
assert.equal(outEntry.started, true);
assert.equal(outEntry.minutes, 46);
assert.equal(inEntry.started, false);
assert.equal(inEntry.minutes, 44);

console.log(JSON.stringify({
  starter: { id: out.id, apps: out.stats.apps, minutes: outEntry.minutes },
  substitute: { id: incoming.id, apps: incoming.stats.apps, minutes: inEntry.minutes },
  ratings: ratings.length,
}, null, 2));
