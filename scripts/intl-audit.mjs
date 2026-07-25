import assert from "node:assert/strict";

import { CLUB_TEMPLATES } from "../js/data.js";
import { createWorld } from "../js/models.js";
import {
  ensureInternational,
  internationalLeaders,
  internationalMatches,
  listInternationalCompetitions,
  listNationalTeams,
  nationalCompetitionStats,
  nationalRecord,
  nationalRecords,
  nationalSquad,
  runInternationalBreak,
} from "../js/intl.js";

const startClubId = CLUB_TEMPLATES.find((club) => club.division === 3)?.id;
assert.ok(startClubId, "a playable starting club is required");

function simulateTournament(season, expectedKey, breaks, expectedMatches) {
  const world = createWorld(startClubId, "International Audit");
  world.season = season;
  const preservedPlayer = world.clubs[0].players[0];
  preservedPlayer.intl.caps = 9;
  delete world.international;
  ensureInternational(world);
  assert.equal(preservedPlayer.intl.caps, 9, "old player international stats must be preserved");

  const competition = listInternationalCompetitions(world).find((item) => item.key === expectedKey);
  assert.ok(competition, `${expectedKey} competition should be created`);
  const expectedTeams = expectedKey === "world" ? 32 : 16;
  assert.equal(competition.participants.length, expectedTeams, `${expectedKey} team count`);
  assert.equal(competition.groups?.length, expectedKey === "world" ? 8 : 4, `${expectedKey} group count`);
  for (const code of ["ENG", "ESP", "ITA", "GER", "FRA"]) {
    assert.ok(competition.participants.includes(code), `${code} must be in ${expectedKey}`);
  }
  const nations = listNationalTeams(world);
  assert.ok(nations.length >= 30, "national team browser should list most nations");
  assert.ok(nations.filter((n) => n.eligible).length >= 16, "enough eligible national teams");
  assert.ok(nationalRecord(world, "ENG").played >= 0, "national record helper works");
  for (let i = 0; i < breaks; i++) {
    world.day = (i + 1) * 30;
    runInternationalBreak(world);
  }

  const matches = internationalMatches(world, competition.id);
  assert.equal(matches.length, expectedMatches, `${expectedKey} fixture count`);
  assert.equal(new Set(matches.map((match) => match.id)).size, matches.length, "match IDs must be unique");
  assert.equal(competition.stage, "done", `${expectedKey} should finish`);
  assert.ok(competition.champion, `${expectedKey} should have a champion`);
  assert.ok(
    world.international.history.some((item) => item.id === competition.id && item.champion),
    "champion history should be stored"
  );
  const leaders = internationalLeaders(world, competition.id);
  assert.ok(leaders.appearances.length, "appearance leaders should be available");
  assert.ok(leaders.keepers.length, "goalkeeper data should be available");
  const nation = competition.participants[0];
  // 批量战绩必须与逐国统计一致，且总场次等于每场记两队
  const records = nationalRecords(world);
  const single = nationalRecord(world, nation);
  assert.deepEqual(records.get(nation), single, "batch and single national records must agree");
  assert.equal(
    [...records.values()].reduce((sum, row) => sum + row.played, 0),
    world.international.matches.length * 2,
    "every match must count for both nations"
  );
  assert.ok(nationalSquad(world, nation).length > 0, "national squad should be available");
  assert.ok(nationalCompetitionStats(world, nation, competition.id).size > 0, "national player event stats should be available");
  return { champion: competition.champion, matches: matches.length };
}

// 世界杯 32 队：小组 48 + 十六强 8 + 八强 4 + 半决 2 + 决赛 1 = 63，共 7 个国际比赛日
// 欧锦赛 16 队：小组 24 + 八强 4 + 半决 2 + 决赛 1 = 31，共 6 个国际比赛日
const worldCup = simulateTournament(2026, "world", 7, 63);
const european = simulateTournament(2028, "europe", 6, 31);

console.log(JSON.stringify({ worldCup, european }, null, 2));
