import assert from "node:assert/strict";

import { clubFinanceCommitments, clubSeasonBudgetSnapshot } from "../js/club-finance.js";

const club = {
  id: "commit-club",
  division: 1,
  power: 70,
  money: 5_000_000,
  players: [
    { id: "expiring", pos: "MID", age: 27, ovr: 12, wage: 5_000, contractYears: 1, _needsRenew: true, attrs: { passing: 12, vision: 12, stamina: 12, pace: 12, shooting: 12 } },
  ],
  youth: { players: [], level: 1 },
  staff: {},
  facilities: { stadium: 2, training: 1, youth: 1, projects: [] },
  finance: { version: 2, ledgerVersion: 1, financeLedger: [], ledgerSeq: 0 },
};
const world = {
  season: 2026,
  day: 40,
  userClubId: club.id,
  clubs: [club, { id: "seller", players: [] }],
  loans: [],
  transferNegotiations: [
    {
      id: "pending-1",
      kind: "user_buy",
      buyerClubId: club.id,
      sellerClubId: "seller",
      playerId: "target",
      fee: 700_000,
      wage: 10_000,
      years: 3,
      status: "player_review",
    },
    {
      id: "done",
      kind: "user_buy",
      buyerClubId: club.id,
      fee: 900_000,
      wage: 9_000,
      years: 3,
      status: "completed",
    },
  ],
  fixtures: [],
};

const commitments = clubFinanceCommitments(world, club);
assert.equal(commitments.transfer, 715_000);
assert.ok(commitments.contracts > 0);
assert.equal(commitments.total, commitments.transfer + commitments.contracts);
assert.equal(commitments.items.length, 2);

const budget = clubSeasonBudgetSnapshot(world, club);
assert.equal(budget.commitments.total, commitments.total);
assert.ok(budget.safeTransferCeiling <= club.money - budget.reserveCash - commitments.total);

console.log("Finance commitments audit passed: pending deals, expiring contracts, and safe budget ceiling");
