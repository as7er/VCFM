import assert from "node:assert/strict";
import { agePlayerOneYear, emptyMatchStats } from "../js/models.js";
import { processTrainingDay } from "../js/training.js";
import {
  ensurePlayerPathway,
  playingTimeProgress,
  processPlayingTimePromises,
  recordMatchPlayingTime,
  setPlayingTimeRole,
  playerDevelopmentTimeline,
} from "../js/player-pathway.js";

function player(id, ovr = 14) {
  return {
    id,
    name: id,
    pos: "MID",
    age: 22,
    ovr,
    potential: 18,
    fitness: 90,
    morale: 70,
    relation: 0,
    injured: 0,
    suspendedMatches: 0,
    wage: 1000,
    value: 100000,
    stats: emptyMatchStats(),
    attrs: {
      pace: ovr,
      shooting: ovr,
      passing: ovr,
      dribbling: ovr,
      defending: ovr,
      physical: ovr,
      finishing: ovr,
      tackling: ovr,
      marking: ovr,
      strength: ovr,
      stamina: ovr,
      vision: ovr,
      reflexes: 6,
      handling: 6,
      positioning: ovr,
      kicking: 6,
    },
  };
}

const neglected = player("neglected", 15);
const trusted = player("trusted", 14);
const substitute = player("substitute", 13);
const club = {
  id: "audit-club",
  name: "Audit Club",
  short: "AUD",
  power: 70,
  stature: 70,
  money: 1000000,
  players: [neglected, trusted, substitute],
  tactics: { lineup: [trusted.id] },
  training: { focus: "balanced", intensity: "normal" },
  facilities: { training: { level: 1 }, medical: { level: 1 } },
};
const world = {
  season: 2026,
  day: 1,
  userClubId: club.id,
  clubs: [club],
  fixtures: [],
  domesticCups: {},
  continentals: {},
  news: [],
};

assert.equal(setPlayingTimeRole(world, club, neglected, "important").ok, true);
assert.equal(setPlayingTimeRole(world, club, trusted, "rotation").ok, true);
const trustedMoraleAfterAgreement = trusted.morale;

for (const day of [3, 9, 16, 23]) {
  world.day = day;
  const fixture = { day, home: club.id, away: "opponent", competitionType: "league" };
  recordMatchPlayingTime(world, club, {
    fixture,
    startedIds: [trusted.id],
    events: day === 3
      ? [{ type: "sub", teamId: club.id, minute: 60, outId: trusted.id, inId: substitute.id }]
      : [],
    eligibleIds: new Set(club.players.map((candidate) => candidate.id)),
  });
}

const trustedProgress = playingTimeProgress(world, club, trusted);
const substituteProgress = playingTimeProgress(world, club, substitute);
assert.equal(trustedProgress.availableMatches, 4);
assert.equal(trustedProgress.starts, 4);
assert.equal(trustedProgress.minutes, 330, "a substituted starter should keep his real minutes");
assert.equal(substituteProgress.minutes, 30, "a substitute should receive minutes from his entry time");

world.day = 29;
const drafts = processPlayingTimePromises(world, club);
assert.equal(drafts.length, 2);
assert.match(drafts.find((draft) => draft.ref.playerId === neglected.id).title, /未兑现/);
assert.match(drafts.find((draft) => draft.ref.playerId === trusted.id).title, /已兑现/);
assert.equal(neglected.playingTime.breaches, 1);
assert.ok(neglected.morale < 70);
assert.ok(trusted.morale > trustedMoraleAfterAgreement);
const neglectedProgress = neglected.playingTime.lastAssessment;

const legacy = player("legacy");
legacy._promisedPlay = 40;
const migrated = ensurePlayerPathway(legacy, club, world);
assert.equal(migrated.committed, true);
assert.equal(migrated.promise.dueDay, 40);
assert.equal(legacy._promisedPlay, undefined);

const trainee = player("trainee", 11);
club.players = [trainee];
club.tactics.lineup = [trainee.id];
world.day = 35;
const originalRandom = Math.random;
Math.random = () => 0.01;
try {
  processTrainingDay(world);
} finally {
  Math.random = originalRandom;
}
assert.ok(
  playerDevelopmentTimeline(trainee).some((entry) => entry.type === "training"),
  "weekly first-team growth must record its training cause"
);

const veteran = player("veteran", 14);
veteran.pos = "ATT";
veteran.age = 29;
Math.random = () => 0;
try {
  agePlayerOneYear(veteran, { season: 2026, day: 365, record: true });
} finally {
  Math.random = originalRandom;
}
assert.ok(
  playerDevelopmentTimeline(veteran).some((entry) => entry.type === "ageing"),
  "seasonal ageing must record changed attributes and its cause"
);

console.log(JSON.stringify({
  neglected: neglectedProgress,
  trustedMinutes: trustedProgress.minutes,
  substituteMinutes: substituteProgress.minutes,
  trainingEntries: playerDevelopmentTimeline(trainee).length,
  ageingEntries: playerDevelopmentTimeline(veteran).length,
}, null, 2));
