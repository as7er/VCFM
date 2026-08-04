import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { CLUB_TEMPLATES } from "../js/data.js";
import { createWorld } from "../js/models.js";
import { ensureStaff } from "../js/staff.js";
import {
  ensureScoutingKnowledge,
  observeScoutingPlayer,
  rankScoutingCandidates,
  scoutPlayerSnapshot,
  scoutingFreshnessLabel,
} from "../js/scouting-knowledge.js";
import {
  ensureScoutMissions,
  processScoutMissions,
  startScoutMission,
} from "../js/worldpulse.js";
import { validateSaveStructure } from "../js/save-schema.js";

const repo = resolve(import.meta.dirname, "..");
const start = CLUB_TEMPLATES.find((club) => club.division === 3);
const world = createWorld(start.id, "Scouting Audit");
const user = world.clubs.find((club) => club.id === world.userClubId);
const sourceClub = world.clubs.find((club) => club.id !== user.id && club.division === user.division);
const player = sourceClub.players.find((candidate) => candidate.age <= 30 && !candidate.injured);
ensureStaff(user);
ensureScoutingKnowledge(world);

const publicView = scoutPlayerSnapshot(world, player, user);
assert.equal(publicView.observations, 0);
assert.ok(publicView.ovrHi > publicView.ovrLo, "public information must not reveal exact ability");
assert.ok(publicView.potentialHi > publicView.potentialLo, "public information must not reveal exact potential");

const observed = observeScoutingPlayer(world, player, sourceClub, user, {
  intensity: 64,
  source: "audit-observation",
  seedSalt: "audit",
});
assert.equal(observed.observations, 1);
assert.ok(observed.level > publicView.level);
assert.ok(observed.ovrHi - observed.ovrLo <= publicView.ovrHi - publicView.ovrLo);

const observedCenter = observed.ovrEstimate;
const observedPace = observed.attrs.pace.estimate;
player.ovr = Math.min(20, player.ovr + 2);
player.attrs.pace = Math.min(20, player.attrs.pace + 3);
const unchangedReport = scoutPlayerSnapshot(world, player, user);
assert.equal(unchangedReport.ovrEstimate, observedCenter, "unobserved growth must not rewrite a saved report");
assert.equal(unchangedReport.attrs.pace.estimate, observedPace, "saved attribute estimates must remain stable");

world.day += 90;
const stale = scoutPlayerSnapshot(world, player, user);
assert.ok(stale.level < observed.level, "knowledge must decay when reports age");
assert.equal(stale.stale, true);
assert.match(scoutingFreshnessLabel(stale, "en"), /Stale/);

world.day = 1;
const comparisonClub = world.clubs.find((club) => club.id !== user.id && club.id !== sourceClub.id);
const first = sourceClub.players[1];
const second = comparisonClub.players[1];
first.age = second.age = 24;
first.injured = second.injured = 0;
first.contractYears = second.contractYears = 3;
const attrs = Object.fromEntries(Object.keys(first.attrs).map((key) => [key, 10]));
world.scoutingKnowledge.players[first.id] = {
  level: 90,
  observations: 2,
  lastObservedSeason: world.season,
  lastObservedDay: world.day,
  ovrEstimate: 8,
  potentialEstimate: 9,
  valueEstimate: 300_000,
  attrs,
};
world.scoutingKnowledge.players[second.id] = {
  level: 90,
  observations: 2,
  lastObservedSeason: world.season,
  lastObservedDay: world.day,
  ovrEstimate: 18,
  potentialEstimate: 18,
  valueEstimate: 300_000,
  attrs,
};
first.ovr = first.potential = 20;
second.ovr = second.potential = 7;
const ranked = rankScoutingCandidates(
  world,
  [{ player: first, club: sourceClub }, { player: second, club: comparisonClub }],
  user,
  { profile: "first_team", maxAge: 30 },
  { seedSalt: "stored-ranking" }
);
assert.equal(ranked[0].player.id, second.id, "recruitment order must use stored estimates, not hidden true ability");

first.contractYears = 3;
second.contractYears = 1;
world.scoutingKnowledge.players[first.id].valueEstimate = 250_000;
world.scoutingKnowledge.players[second.id].valueEstimate = 750_000;
const constrained = rankScoutingCandidates(
  world,
  [{ player: first, club: sourceClub }, { player: second, club: comparisonClub }],
  user,
  { profile: "expiring", maxAge: 30, maxValue: 500_000 },
  { seedSalt: "strict-criteria" }
);
assert.deepEqual(constrained, [], "contract and displayed budget filters must both be hard limits");
world.scoutingKnowledge.players[second.id].valueEstimate = 450_000;
const expiring = rankScoutingCandidates(
  world,
  [{ player: first, club: sourceClub }, { player: second, club: comparisonClub }],
  user,
  { profile: "expiring", maxAge: 30, maxValue: 500_000 },
  { seedSalt: "strict-criteria" }
);
assert.deepEqual(expiring.map((candidate) => candidate.player.id), [second.id]);

ensureScoutMissions(world);
world.scoutMissions.length = 0;
const started = startScoutMission(world, "div3", {
  position: "GK",
  profile: "first_team",
  maxValue: 0,
});
assert.equal(started.ok, true);
world.day = started.mission.doneDay;
processScoutMissions(world);
assert.equal(started.mission.status, "done");
assert.ok(started.mission.resultPlayerIds.length > 0);
for (const playerId of started.mission.resultPlayerIds) {
  const result = world.clubs.flatMap((club) => club.players).find((candidate) => candidate.id === playerId);
  assert.equal(result.pos, "GK", "mission results must honor the requested position");
  assert.ok(world.scoutingKnowledge.players[playerId]?.observations >= 1);
}
const reportMail = world.inbox.find((mail) => mail.dedupeKey === `sm_done_${started.mission.id}`);
assert.match(reportMail.body, /能力 \d+-\d+ \/ 潜力 \d+-\d+/);

assert.equal(validateSaveStructure(world), world);
const invalid = structuredClone(world);
invalid.scoutingKnowledge.players[player.id].level = Number.NaN;
assert.throws(() => validateSaveStructure(invalid), /scouting knowledge players .* level must be finite/);

const worldPulseSource = readFileSync(resolve(repo, "js/worldpulse.js"), "utf8");
const missionSource = worldPulseSource.slice(
  worldPulseSource.indexOf("function completeScoutMission"),
  worldPulseSource.indexOf("// ---------- 世界动态")
);
assert.doesNotMatch(missionSource, /p\.(?:ovr|potential)/, "mission completion must not read hidden player ability directly");
const inboxSource = readFileSync(resolve(repo, "js/inbox.js"), "utf8");
const tipSource = inboxSource.slice(inboxSource.indexOf("function maybeScoutTip"), inboxSource.indexOf("/** 董事会目标新建时"));
assert.doesNotMatch(tipSource, /p\.(?:ovr|potential)/, "passive scout tips must not read hidden player ability directly");

console.log("Scouting knowledge audit passed: observations persist, decay, drive recruitment and never expose hidden truth directly");
