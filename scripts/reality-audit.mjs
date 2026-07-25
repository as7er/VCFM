import assert from "node:assert/strict";

import { CLUB_TEMPLATES, DIVISIONS } from "../js/data.js";
import { createWorld } from "../js/models.js";

const topDivisions = [1, 4, 6, 8, 10];
const expectedTopPowers = new Map([
  [1, [82, 80, 79, 78, 77, 76, 75, 74, 74, 73, 73, 72, 72, 71, 71, 70, 70, 69, 69, 68]],
  [4, [82, 81, 77, 76, 74, 73, 72, 71, 70, 69, 68, 67, 66, 65, 64, 63]],
  [6, [82, 78, 77, 75, 74, 73, 72, 71, 70, 69, 68, 67, 66, 65, 64, 63]],
  [8, [79, 78, 77, 76, 75, 74, 73, 72, 71, 70, 69, 68, 67, 66, 65, 64]],
  [10, [81, 76, 75, 73, 72, 71, 70, 69, 68, 67, 66, 65, 64, 63, 62, 61]],
]);

assert.equal(CLUB_TEMPLATES.length, 188, "the five-country pyramid should keep all 188 clubs");
assert.ok(CLUB_TEMPLATES.every((club) => club.realityProfile?.version === 1), "every club needs a reality profile");
const slots = CLUB_TEMPLATES.map((club) => club.realityProfile.referenceSlot);
assert.equal(new Set(slots).size, CLUB_TEMPLATES.length, "anonymous reality slots must be unique");
assert.ok(
  CLUB_TEMPLATES.every((club) => club.name === club.nameZh && club.name !== club.legacyName),
  "display names must use the fictional branding layer"
);
assert.ok(
  CLUB_TEMPLATES.every((club) => !Object.hasOwn(club.realityProfile, "realClub") && !Object.hasOwn(club.realityProfile, "sourceName")),
  "reality profiles must not store real club identities"
);

for (const division of topDivisions) {
  const clubs = CLUB_TEMPLATES.filter((club) => club.division === division);
  assert.deepEqual(clubs.map((club) => club.power), expectedTopPowers.get(division), `division ${division} power curve`);
  assert.ok(clubs.every((club, index) => club.realityProfile.domesticRankSeed === index + 1), `division ${division} stable rank slots`);
  assert.ok(clubs.every((club, index) => index === 0 || club.money <= clubs[index - 1].money), `division ${division} finance order`);
}

assert.equal(CLUB_TEMPLATES.filter((club) => club.division === 4 && club.realityProfile.stature === "global_power").length, 2, "Spain needs two global powers");
assert.equal(CLUB_TEMPLATES.filter((club) => club.division === 6 && club.realityProfile.stature === "global_power").length, 1, "Germany needs one dominant global power");
assert.equal(CLUB_TEMPLATES.filter((club) => club.division === 10 && club.realityProfile.stature === "global_power").length, 1, "France needs one dominant global power");

const startClub = CLUB_TEMPLATES.find((club) => club.division === 3);
const worlds = [];
for (let run = 0; run < 4; run++) worlds.push(createWorld(startClub.id, `Reality Audit ${run + 1}`));

const abilityRuns = worlds.map((world) => {
  const players = world.clubs.flatMap((club) => club.players);
  const counts = Object.fromEntries([18, 19, 20].map((ovr) => [ovr, players.filter((player) => player.ovr === ovr).length]));
  assert.deepEqual(counts, { 18: 110, 19: 24, 20: 2 }, "world ability scarcity quotas");
  assert.ok(world.clubs.every((club) => club.realityProfile?.referenceSlot), "runtime clubs retain anonymous mappings");
  assert.ok(
    world.clubs.every((club) => club.youth.level === club.realityProfile.youthLevel),
    "reality profiles initialize youth levels"
  );
  assert.ok(
    world.clubs.every((club) => club.facilities.training === club.realityProfile.trainingLevel),
    "reality profiles initialize training facilities"
  );
  const byPosition = Object.fromEntries(["GK", "DEF", "MID", "ATT"].map((pos) => [pos, players.filter((player) => player.pos === pos && player.ovr >= 19).length]));
  const tierAverages = Object.fromEntries([1, 2, 3].map((tier) => {
    const tierPlayers = world.clubs
      .filter((club) => (DIVISIONS[club.division]?.tier || 3) === tier)
      .flatMap((club) => club.players);
    return [tier, Number((tierPlayers.reduce((sum, player) => sum + player.ovr, 0) / tierPlayers.length).toFixed(2))];
  }));
  assert.ok(tierAverages[1] > tierAverages[2] && tierAverages[2] > tierAverages[3], "league tiers retain a realistic ability gradient");
  return { counts, byPosition, tierAverages };
});

const eliteByPosition = abilityRuns.reduce((totals, run) => {
  for (const [pos, count] of Object.entries(run.byPosition)) totals[pos] = (totals[pos] || 0) + count;
  return totals;
}, {});
assert.ok(
  Math.max(...Object.values(eliteByPosition)) < Object.values(eliteByPosition).reduce((sum, count) => sum + count, 0) * 0.55,
  `one position dominates elite players: ${JSON.stringify(eliteByPosition)}`
);

console.log(JSON.stringify({
  clubs: CLUB_TEMPLATES.length,
  countries: new Set(CLUB_TEMPLATES.map((club) => club.countryCode)).size,
  topPowerCurves: Object.fromEntries(topDivisions.map((division) => [division, expectedTopPowers.get(division)])),
  abilityRuns,
  eliteByPosition,
}, null, 2));
