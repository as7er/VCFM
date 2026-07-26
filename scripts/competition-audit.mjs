import assert from "node:assert/strict";

import {
  CONTINENTAL_COMPETITIONS,
  CLUB_TEMPLATES,
  DIVISIONS,
  START_DIVISIONS,
} from "../js/data.js";
import { createWorld } from "../js/models.js";
import { ensureCompetitions, continentalPlayerLeaders } from "../js/cup.js";
import { ensureInternational } from "../js/intl.js";
import { applyLang, t } from "../js/i18n.js";
import { simulateMatch } from "../js/match.js";

const startingClub = CLUB_TEMPLATES.find((club) => START_DIVISIONS.includes(club.division));
const world = createWorld(startingClub.id, "Competition Audit", "zh");
ensureCompetitions(world);

const clubMap = new Map(world.clubs.map((club) => [club.id, club]));
const countryOf = (clubId) => {
  const club = clubMap.get(clubId);
  return club?.countryId || DIVISIONS[club?.division]?.countryId;
};

for (const config of Object.values(CONTINENTAL_COMPETITIONS)) {
  const competition = world.continentals[config.id];
  assert.ok(competition, `${config.id} competition missing`);
  assert.equal(competition.name, config.name);
  assert.equal(competition.nameEn, config.nameEn);
  assert.equal(competition.participants.length, 20, `${config.id} participant count`);
  assert.equal(competition.fixtures.length, 80, `${config.id} league-phase fixture count`);

  const appearances = new Map(competition.participants.map((id) => [id, 0]));
  const homeMatches = new Map(competition.participants.map((id) => [id, 0]));
  const pairings = new Set();
  const matchDays = new Map();
  for (const fixture of competition.fixtures) {
    appearances.set(fixture.home, appearances.get(fixture.home) + 1);
    appearances.set(fixture.away, appearances.get(fixture.away) + 1);
    homeMatches.set(fixture.home, homeMatches.get(fixture.home) + 1);
    assert.notEqual(countryOf(fixture.home), countryOf(fixture.away), `${config.id} same-country pairing`);
    const pairing = [fixture.home, fixture.away].sort().join("|");
    assert.ok(!pairings.has(pairing), `${config.id} repeated pairing ${pairing}`);
    pairings.add(pairing);
    matchDays.set(fixture.round, (matchDays.get(fixture.round) || 0) + 1);
  }
  for (const [clubId, count] of appearances) {
    assert.equal(count, 8, `${config.id} ${clubId} match count`);
    assert.equal(homeMatches.get(clubId), 4, `${config.id} ${clubId} home match count`);
  }
  assert.equal(matchDays.size, 8, `${config.id} matchday count`);
  for (const count of matchDays.values()) assert.equal(count, 10, `${config.id} matches per matchday`);
}

const auditedFixtures = world.continentals.champions.fixtures.slice(0, 4);
for (const fixture of auditedFixtures) simulateMatch(world, fixture);
const auditedCompetitionId = auditedFixtures[0].competitionId;
const auditedPlayers = world.clubs
  .flatMap((club) => club.players)
  .filter((player) => (player.competitionStats?.[auditedCompetitionId]?.apps || 0) > 0);
assert.ok(auditedPlayers.length >= 80, "continental match appearances were not recorded");
assert.ok(
  auditedPlayers.every((player) => (player.stats?.apps || 0) === 0),
  "continental appearances leaked into league totals"
);
assert.ok(
  auditedPlayers.every((player) => (player.competitionStats[auditedCompetitionId].ratingSum || 0) > 0),
  "continental ratings were not recorded"
);
const personalGoals = auditedFixtures.flatMap((fixture) => fixture.events || []).filter(
  (event) => event.type === "goal" && !event.ownGoal && event.playerId
);
const recordedGoals = auditedPlayers.reduce(
  (sum, player) => sum + (player.competitionStats[auditedCompetitionId].goals || 0),
  0
);
const recordedAssists = auditedPlayers.reduce(
  (sum, player) => sum + (player.competitionStats[auditedCompetitionId].assists || 0),
  0
);
assert.equal(recordedGoals, personalGoals.length, "continental goals do not match events");
assert.equal(recordedAssists, personalGoals.filter((event) => event.assistId).length, "continental assists do not match events");
const leaders = continentalPlayerLeaders(world, auditedCompetitionId);
assert.equal(leaders.keepers.length, 8, "continental goalkeeper leaders missing");

const legacyChampions = world.continentals.champions;
legacyChampions.name = "大陆冠军联赛";
legacyChampions.nameEn = "Continental Champions League";
legacyChampions.fixtures[0].competitionName = legacyChampions.name;
legacyChampions.fixtures[0].roundLabel = `${legacyChampions.name}联赛阶段 第1比赛日`;
ensureCompetitions(world);
assert.equal(legacyChampions.name, "欧洲冠军联赛");
assert.equal(legacyChampions.nameEn, "Champions League");
assert.equal(legacyChampions.fixtures[0].competitionName, "欧洲冠军联赛");
assert.match(legacyChampions.fixtures[0].roundLabel, /^欧洲冠军联赛/);

world.international = {
  version: 1,
  activeCompetitionId: null,
  competitions: {
    intl_europe_0: {
      id: "intl_europe_0",
      key: "europe",
      season: 0,
      completed: true,
      name: "欧洲国家锦标赛",
      nameEn: "European Nations Championship",
      fixtureIds: ["legacy_euro_match"],
      table: {},
    },
  },
  matches: [
    {
      id: "legacy_euro_match",
      competitionKey: "europe",
      competitionName: "欧洲国家锦标赛",
      competitionNameEn: "European Nations Championship",
    },
  ],
  history: [
    {
      id: "intl_europe_0",
      key: "europe",
      season: 0,
      name: "欧洲国家锦标赛",
      nameEn: "European Nations Championship",
    },
  ],
};
ensureInternational(world);
const migratedEurope = world.international.competitions.intl_europe_0;
assert.equal(migratedEurope.name, "欧洲杯");
assert.equal(migratedEurope.nameEn, "European Championship");
assert.equal(world.international.matches[0].competitionName, "欧洲杯");
assert.equal(world.international.history[0].name, "欧洲杯");

applyLang("zh");
assert.equal(t("competitionCentre.clubs"), "俱乐部赛事");
assert.match(t("intl.hint"), /欧洲杯/);
applyLang("en");
assert.equal(t("competitionCentre.clubs"), "Club competitions");
assert.match(t("intl.hint"), /European Championship/);

console.log("Competition audit passed: 3 competitions, 20 clubs, 8 matchdays, 4 home and 4 away per club, legacy names migrated.");
