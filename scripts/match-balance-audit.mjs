import assert from "node:assert/strict";

import { CLUB_TEMPLATES } from "../js/data.js";
import { simulateMatchSync } from "../js/match.js";
import { createWorld } from "../js/models.js";

const topDivisions = [1, 4, 6, 8, 10];
const samplesPerDivision = 80;
const startClub = CLUB_TEMPLATES.find((club) => club.division === 3);
const sourceWorld = createWorld(startClub.id, "Match Balance Audit");

function lineupAverage(club) {
  const players = club.tactics.lineup
    .map((id) => club.players.find((player) => player.id === id))
    .filter(Boolean);
  return players.reduce((sum, player) => sum + player.ovr, 0) / players.length;
}

function isolatedWorld(home, away) {
  return {
    userClubId: "audit-observer",
    day: 10,
    season: 2026,
    clubs: [home, away],
    fixtures: [],
    table: Object.fromEntries([home, away].map((club) => [club.id, {
      played: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0,
    }])),
    news: [],
    media: [],
    inbox: [],
  };
}

const divisions = [];
let totalPoints = 0;
let totalGoalsFor = 0;
let totalGoalsAgainst = 0;

for (const division of topDivisions) {
  const clubs = sourceWorld.clubs
    .filter((club) => club.division === division)
    .sort((a, b) => lineupAverage(b) - lineupAverage(a));
  const strongSource = clubs[0];
  const weakSource = clubs.at(-1);
  const strongOvr = lineupAverage(strongSource);
  const weakOvr = lineupAverage(weakSource);
  assert.ok(strongOvr >= weakOvr + 0.8, `division ${division} mapped top slot fell behind its tail slot`);

  let points = 0;
  let goalsFor = 0;
  let goalsAgainst = 0;
  for (let sample = 0; sample < samplesPerDivision; sample++) {
    const strongAtHome = sample % 2 === 0;
    const strong = structuredClone(strongSource);
    const weak = structuredClone(weakSource);
    const home = strongAtHome ? strong : weak;
    const away = strongAtHome ? weak : strong;
    const world = isolatedWorld(home, away);
    const fixture = {
      id: `balance-${division}-${sample}`,
      home: home.id,
      away: away.id,
      day: 10,
      division,
      competition: "league",
      round: sample + 1,
      played: false,
    };
    const result = simulateMatchSync(world, fixture);
    const scored = strongAtHome ? result.homeGoals : result.awayGoals;
    const conceded = strongAtHome ? result.awayGoals : result.homeGoals;
    goalsFor += scored;
    goalsAgainst += conceded;
    points += scored > conceded ? 3 : scored === conceded ? 1 : 0;
  }
  const ppg = points / samplesPerDivision;
  divisions.push({
    division,
    strong: strongSource.id,
    weak: weakSource.id,
    strongOvr: Number(strongOvr.toFixed(2)),
    weakOvr: Number(weakOvr.toFixed(2)),
    ppg: Number(ppg.toFixed(2)),
    goalsFor,
    goalsAgainst,
  });
  totalPoints += points;
  totalGoalsFor += goalsFor;
  totalGoalsAgainst += goalsAgainst;
}

console.log(JSON.stringify({
  matches: samplesPerDivision * topDivisions.length,
  aggregate: {
    ppg: Number((totalPoints / (samplesPerDivision * topDivisions.length)).toFixed(2)),
    goalsFor: totalGoalsFor,
    goalsAgainst: totalGoalsAgainst,
  },
  divisions,
}, null, 2));

for (const row of divisions) {
  assert.ok(row.ppg >= 1.45, `division ${row.division} top slot PPG is too low: ${row.ppg.toFixed(2)}`);
  assert.ok(row.goalsFor > row.goalsAgainst, `division ${row.division} top slot needs positive goal difference`);
}
assert.ok(totalPoints / (samplesPerDivision * topDivisions.length) >= 1.65, "top slots should outperform over the full five-league sample");
