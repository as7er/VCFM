import assert from "node:assert/strict";

import {
  ensureCompetitionParticipationFinance,
  settleCompetitionFixtureFinance,
  settleContinentalLeagueQualification,
} from "../js/competition-finance.js";

function club(id) {
  return { id, name: id, money: 0, finance: {} };
}

const world = {
  season: 2026,
  day: 20,
  userClubId: "a",
  clubs: [club("a"), club("b"), club("c"), club("d")],
  news: [],
};

const continental = {
  id: "continental_champions",
  key: "champions",
  type: "continental",
  name: "欧洲冠军联赛",
  participants: ["a", "b", "c", "d"],
  fixtures: [],
};

assert.equal(ensureCompetitionParticipationFinance(world, continental), 9_600_000);
assert.equal(ensureCompetitionParticipationFinance(world, continental), 0);
assert.equal(world.clubs[0].money, 2_400_000);

const leagueFixture = {
  id: "lf1",
  competitionId: continental.id,
  competitionType: "continental-league-stage",
  home: "a",
  away: "b",
  homeGoals: 2,
  awayGoals: 0,
  played: true,
  round: 1,
};
assert.equal(settleCompetitionFixtureFinance(world, continental, leagueFixture), true);
assert.equal(settleCompetitionFixtureFinance(world, continental, leagueFixture), false);
assert.equal(world.clubs[0].money, 2_850_000);

assert.equal(settleContinentalLeagueQualification(world, continental, ["a", "b"]), 1_800_000);
assert.equal(settleContinentalLeagueQualification(world, continental, ["a", "b"]), 0);

const domestic = { id: "domestic_test", type: "domestic", name: "测试杯" };
const finalFixture = {
  id: "df1",
  competitionId: domestic.id,
  competitionType: "domestic-cup",
  home: "c",
  away: "d",
  homeGoals: 1,
  awayGoals: 1,
  winner: "d",
  penalties: true,
  played: true,
  round: "F",
  roundLabel: "测试杯决赛",
};
assert.equal(settleCompetitionFixtureFinance(world, domestic, finalFixture), true);
assert.equal(world.clubs.find((item) => item.id === "d").money, 3_300_000);
assert.equal(world.clubs.find((item) => item.id === "c").money, 2_760_000);

const entries = world.clubs.flatMap((item) => item.finance.financeLedger || []);
assert.ok(entries.every((entry) => entry.category === "competition"));
assert.ok(entries.some((entry) => entry.source === "continental-match-win"));
assert.ok(entries.some((entry) => entry.source === "domestic-cup-runner-up"));

console.log("Competition finance audit passed: participation, results, qualification, finals and idempotence");
