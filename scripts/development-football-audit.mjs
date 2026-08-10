import assert from "node:assert/strict";

import { CLUB_TEMPLATES, START_DIVISIONS } from "../js/data.js";
import {
  archiveDevelopmentSeason,
  ensureDevelopmentFootball,
  processDevelopmentMatchesForDay,
  runDevelopmentMatch,
} from "../js/development-football.js";
import { simulateMatchSync } from "../js/match.js";
import { createWorld } from "../js/models.js";
import { createSeededRandom } from "../js/random.js";
import {
  developmentSharpness,
  ensureDevelopmentStats,
  playingTimeProgress,
} from "../js/player-pathway.js";

const start = CLUB_TEMPLATES.find((club) => START_DIVISIONS.includes(club.division));
assert.ok(start, "a playable starting club is required");

function createAuditWorld() {
  const originalRandom = Math.random;
  Math.random = createSeededRandom(2060828);
  try {
    return createWorld(start.id, "Development Football Audit");
  } finally {
    Math.random = originalRandom;
  }
}

function opponentFor(world, club) {
  return world.clubs.find((candidate) => candidate.id !== club.id && candidate.division === club.division);
}

function matchFingerprint(record) {
  return {
    score: record.score,
    shots: record.shots,
    goals: record.goals.map((goal) => [goal.team, goal.minute, goal.scorerId, goal.assistId]),
    playerIds: record.playerIds,
    injuries: record.injuries,
  };
}

function runDirect() {
  const world = createAuditWorld();
  const home = world.clubs.find((club) => club.id === world.userClubId);
  const away = opponentFor(world, home);
  const formalAppsBefore = new Map(
    [...home.players, ...home.youth.players, ...away.players, ...away.youth.players]
      .map((player) => [player.id, Number(player.stats?.apps || 0)])
  );
  const record = runDevelopmentMatch(world, home, away, { sequence: 1 });
  assert.ok(record, "development match should run when both clubs have a usable pool");
  return { world, home, away, record, formalAppsBefore };
}

const first = runDirect();
const second = runDirect();
assert.deepEqual(matchFingerprint(first.record), matchFingerprint(second.record), "development matches must reproduce from the same world facts and seed");
assert.equal(first.record.engine, "spatial-v2");
assert.equal(first.record.simulationProfile, "development");
assert.equal(first.record.timeStep, 0.5);
assert.equal(first.record.separationPasses, 2);
assert.equal(first.record.playerIds.length, 22, "development match must have two complete starting XIs");
assert.equal(new Set(first.record.playerIds).size, 22, "a player cannot appear for both sides or twice in one match");

const playerById = new Map(
  [...first.home.players, ...first.home.youth.players, ...first.away.players, ...first.away.youth.players]
    .map((player) => [player.id, player])
);
for (const playerId of first.record.playerIds) {
  const player = playerById.get(playerId);
  assert.ok(player, `participant ${playerId} must remain the real persisted player object`);
  const stats = ensureDevelopmentStats(player);
  assert.equal(stats.apps, 1);
  assert.ok(stats.minutes >= 1 && stats.minutes <= 90);
  assert.equal(Number(player.stats?.apps || 0), first.formalAppsBefore.get(playerId), "development football must not increment formal appearances");
  assert.ok(player.playingTime.history.some((entry) => entry.competitionType === "development" && entry.appeared));
  assert.ok(developmentSharpness(first.world, player) > 0, "actual development minutes must create visible match sharpness");
}

const samplePlayer = playerById.get(first.record.playerIds[0]);
assert.equal(
  playingTimeProgress(first.world, first.home, samplePlayer).availableMatches,
  0,
  "development football must not satisfy first-team playing-time promises"
);

const archived = archiveDevelopmentSeason(first.world);
assert.ok(archived.length >= 22, "season archive must preserve every development participant");
assert.equal(ensureDevelopmentStats(samplePlayer).apps, 0, "current development stats must reset after archive");
assert.equal(samplePlayer.developmentHistory[0].season, first.world.season);

const scheduledWorld = createAuditWorld();
scheduledWorld.day = 28;
const scheduledUser = scheduledWorld.clubs.find((club) => club.id === scheduledWorld.userClubId);
for (const player of scheduledUser.players) player.lastPlayedDay = scheduledWorld.day;
assert.equal(processDevelopmentMatchesForDay(scheduledWorld).length, 0, "an incomplete development XI must defer instead of playing short-handed");
assert.equal(ensureDevelopmentFootball(scheduledWorld).nextMatchDay, 28, "a deferred matchday must remain due");
scheduledWorld.day = 29;
const scheduled = processDevelopmentMatchesForDay(scheduledWorld);
assert.ok(scheduled.length >= 1 && scheduled.length <= 5, "development matchday should stay within its background performance budget");
assert.ok(scheduled.some((match) => match.home === scheduledWorld.userClubId || match.away === scheduledWorld.userClubId), "the user's development team must play on every development matchday");
assert.equal(processDevelopmentMatchesForDay(scheduledWorld).length, 0, "the same development matchday cannot settle twice");
assert.equal(ensureDevelopmentFootball(scheduledWorld).matches.length, scheduled.length);
assert.equal(ensureDevelopmentFootball(scheduledWorld).nextMatchDay, 57);

const officialWorld = createAuditWorld();
const officialFixture = officialWorld.fixtures.find(
  (fixture) => fixture.home !== officialWorld.userClubId && fixture.away !== officialWorld.userClubId
);
assert.ok(officialFixture, "an AI-only official fixture is required");
officialWorld.day = officialFixture.day;
simulateMatchSync(officialWorld, officialFixture, { engineMode: "probability" });
for (const clubId of [officialFixture.home, officialFixture.away]) {
  const club = officialWorld.clubs.find((candidate) => candidate.id === clubId);
  assert.ok(
    club.players.some((player) => player.playingTime?.history?.some((entry) => entry.day === officialFixture.day && entry.competitionType === "league")),
    "both clubs in an official AI match must persist the same playing-time fact"
  );
}

console.log(JSON.stringify({
  direct: {
    score: first.record.score,
    players: first.record.playerIds.length,
    injuries: first.record.injuries.length,
  },
  scheduledMatches: scheduled.length,
  archivedPlayers: archived.length,
  officialFixture: officialFixture.id,
}, null, 2));
console.log("Development football audit passed");
