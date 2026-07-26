import assert from "node:assert/strict";

import {
  CLUB_TEMPLATES,
  NATIONALITIES,
  NATIONAL_TEAM_BASE_STRENGTH,
  NATIONAL_TEAM_KITS,
} from "../js/data.js";
import { nationFlagHtml } from "../js/flags.js";
import { createWorld, ensureRealisticPlayerTalent } from "../js/models.js";
import {
  ensureInternational,
  internationalLeaders,
  internationalMatches,
  listInternationalCompetitions,
  listNationalTeams,
  nationalCompetitionStats,
  nationalCallupScore,
  nationalRecord,
  nationalRecords,
  nationalSquad,
  nationalStartingXi,
  nationName,
  runInternationalBreak,
} from "../js/intl.js";

function actualXiStrength(world, code) {
  const picked = nationalStartingXi(world, code);
  return picked.length ? picked.reduce((sum, player) => sum + player.ovr, 0) / picked.length : 0;
}

const startClubId = CLUB_TEMPLATES.find((club) => club.division === 3)?.id;
assert.ok(startClubId, "a playable starting club is required");
const japanRanks = [];

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
  assert.ok(NATIONALITIES.every((nation) => nation.name && nation.nameEn), "all nations need bilingual names");
  assert.equal(new Set(NATIONALITIES.map((nation) => nation.code)).size, NATIONALITIES.length, "nation codes are unique");
  assert.equal(new Set(NATIONALITIES.map((nation) => nation.nameEn)).size, NATIONALITIES.length, "English nation names are unique");
  assert.ok(
    NATIONALITIES.every((nation) => !nationFlagHtml(nation.code).includes("nation-flag-code")),
    "all national teams need local SVG flags"
  );
  assert.ok(nations.every((nation) => nation.name && nation.nameEn), "national browser exposes bilingual names");
  assert.ok(
    NATIONALITIES.every((nation) => Number.isFinite(NATIONAL_TEAM_BASE_STRENGTH[nation.code])),
    "every national team needs a realistic base strength"
  );
  assert.ok(
    NATIONALITIES.every((nation) => NATIONAL_TEAM_KITS[nation.code]?.primary && NATIONAL_TEAM_KITS[nation.code]?.secondary),
    "every national team needs a home kit"
  );
  assert.ok(
    world.clubs.flatMap((club) => club.players).every((player) => player.talentModelVersion === 1),
    "new players use the realistic shared talent model"
  );
  for (const nation of nations) {
    assert.equal(nation.strength, Math.round(actualXiStrength(world, nation.code) * 10) / 10, `${nation.code} strength must come directly from its XI`);
  }
  const strengthByCode = new Map(nations.map((nation) => [nation.code, nation.strength]));
  assert.ok(strengthByCode.get("ENG") > strengthByCode.get("JPN"), "England should rank above Japan");
  assert.ok(strengthByCode.get("JPN") > strengthByCode.get("CHN"), "Japan should rank above China");
  assert.ok(strengthByCode.get("BRA") > strengthByCode.get("USA"), "Brazil should rank above USA");
  const japanRank = nations.findIndex((nation) => nation.code === "JPN") + 1;
  japanRanks.push(japanRank);
  const legacyProbe = { ...world.clubs[0].players[0], attrs: { ...world.clubs[0].players[0].attrs } };
  delete legacyProbe.talentModelVersion;
  assert.equal(ensureRealisticPlayerTalent(legacyProbe), true, "legacy players should be calibrated once");
  assert.equal(ensureRealisticPlayerTalent(legacyProbe), false, "legacy calibration must be idempotent");
  const probeClub = world.clubs[0];
  const probeBase = probeClub.players.find((player) => player.pos === "ATT") || probeClub.players[0];
  const hotPlayer = {
    ...probeBase,
    id: "callup_hot",
    ovr: 15,
    potential: 16,
    fitness: 92,
    morale: 82,
    intl: { caps: 4 },
    stats: { apps: 10, goals: 7, assists: 3, ratingSum: 74, lastRating: 8.1 },
  };
  const coldPeer = {
    ...hotPlayer,
    id: "callup_cold",
    fitness: 58,
    morale: 55,
    intl: { caps: 0 },
    stats: { apps: 3, goals: 0, assists: 0, ratingSum: 17.4, lastRating: 5.6 },
  };
  const strongerPlayer = {
    ...coldPeer,
    id: "callup_stronger",
    ovr: 18,
    potential: 18,
    fitness: 82,
    morale: 70,
    stats: { apps: 8, goals: 2, assists: 1, ratingSum: 52.8, lastRating: 6.6 },
  };
  const scoreWorld = {
    ...world,
    table: {
      ...world.table,
      [probeClub.id]: { ...(world.table[probeClub.id] || {}), played: 10 },
    },
  };
  assert.ok(
    nationalCallupScore(scoreWorld, hotPlayer, probeClub) > nationalCallupScore(scoreWorld, coldPeer, probeClub),
    "form, fitness and playing time should separate equal-ability call-up candidates"
  );
  assert.ok(
    nationalCallupScore(scoreWorld, strongerPlayer, probeClub) > nationalCallupScore(scoreWorld, hotPlayer, probeClub),
    "short-term form must not erase a clear ability gap against a fit, active player"
  );
  const englandSquad = nationalSquad(world, "ENG");
  const englandXi = nationalStartingXi(world, "ENG");
  const englandNumbers = englandSquad.map(({ squadNumber }) => squadNumber);
  assert.equal(new Set(englandNumbers).size, englandNumbers.length, "national squad numbers must be unique");
  assert.ok(englandNumbers.every((number) => number >= 1 && number <= 23), "national squad numbers must stay within 1-23");
  assert.deepEqual(
    englandSquad.filter(({ player }) => player.pos === "GK").map(({ squadNumber }) => squadNumber),
    [1, 12, 23],
    "goalkeepers should receive conventional national-team numbers"
  );
  const numberProbe = englandSquad[0]?.player;
  const clubNumberBefore = numberProbe?.number;
  nationalSquad(world, "ENG");
  assert.equal(numberProbe?.number, clubNumberBefore, "national numbers must not overwrite club numbers");
  const englandSquadIds = new Set(englandSquad.map(({ player }) => player.id));
  assert.ok(englandXi.every((player) => englandSquadIds.has(player.id)), "the match XI must come from the 23-player squad");
  const injuryProbe = englandSquad[0]?.player;
  assert.ok(injuryProbe, "England needs a call-up candidate for injury checks");
  const previousInjury = injuryProbe.injured || 0;
  injuryProbe.injured = 2;
  assert.ok(!nationalSquad(world, "ENG").some(({ player }) => player.id === injuryProbe.id), "injured players must be excluded");
  injuryProbe.injured = previousInjury;
  assert.equal(nationName("ENG", "zh"), "英格兰", "Chinese nation name");
  assert.equal(nationName("ENG", "en"), "England", "English nation name");
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
  const squad = nationalSquad(world, nation);
  assert.ok(squad.length > 0, "national squad should be available");
  assert.ok(
    squad.every(({ player, club }) => club?.players?.includes(player) && player.clubId === club.id),
    "national squad entries must reference their live club player objects"
  );
  assert.ok(nationalCompetitionStats(world, nation, competition.id).size > 0, "national player event stats should be available");
  return { champion: competition.champion, matches: matches.length };
}

// 世界杯 32 队：小组 48 + 十六强 8 + 八强 4 + 半决 2 + 决赛 1 = 63，共 7 个国际比赛日
// 欧洲杯 16 队：小组 24 + 八强 4 + 半决 2 + 决赛 1 = 31，共 6 个国际比赛日
const worldCup = simulateTournament(2026, "world", 7, 63);
const european = simulateTournament(2028, "europe", 6, 31);

for (let i = 0; i < 6; i++) {
  const probeWorld = createWorld(startClubId, `Rank Audit ${i + 1}`);
  const teams = listNationalTeams(probeWorld);
  japanRanks.push(teams.findIndex((nation) => nation.code === "JPN") + 1);
}
const japanAverageRank = japanRanks.reduce((sum, rank) => sum + rank, 0) / japanRanks.length;
assert.ok(japanRanks.every((rank) => rank >= 8 && rank <= 30), `Japan has an implausible rank outlier: ${japanRanks.join(", ")}`);
assert.ok(japanAverageRank >= 14 && japanAverageRank <= 23, `Japan average rank should stay near the realistic chasing tier, got ${japanAverageRank}`);

console.log(JSON.stringify({ worldCup, european, japanRanks, japanAverageRank }, null, 2));
