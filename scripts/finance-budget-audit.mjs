import assert from "node:assert/strict";

import {
  clubSeasonBudgetSnapshot,
  ensureClubFinanceBudget,
  updateClubFinanceBudget,
} from "../js/club-finance.js";

const club = {
  id: "budget-club",
  division: 1,
  power: 70,
  money: 5_000_000,
  players: [
    { id: "p1", wage: 20_000 },
    { id: "p2", wage: 15_000 },
  ],
  youth: { players: [{ id: "y1", wage: 1_000 }], level: 1 },
  staff: {},
  facilities: { stadium: 2, training: 1, youth: 1, projects: [] },
  finance: {
    version: 2,
    ledgerVersion: 1,
    ledgerSeason: 2026,
    ledgerSeq: 0,
    financeLedger: [],
    seasonBroadcastIncome: 0,
    seasonPrizeIncome: 0,
    lastBroadcastPayout: 500_000,
    lastPrizePayout: 100_000,
  },
};
const world = {
  season: 2026,
  day: 14,
  clubs: [club],
  loans: [],
  fixtures: [
    { id: "f1", day: 21, home: club.id, away: "a", played: false },
    { id: "f2", day: 28, home: "b", away: club.id, played: false },
    { id: "f3", day: 35, home: club.id, away: "c", played: false },
    { id: "old", day: 7, home: club.id, away: "d", played: true },
  ],
};

const defaults = ensureClubFinanceBudget(club);
assert.deepEqual(defaults, { reserveWeeks: 8, transferShare: 70 });
updateClubFinanceBudget(club, { reserveWeeks: 30, transferShare: 5 });
assert.deepEqual(club.finance.budgetPlan, { reserveWeeks: 20, transferShare: 25 });
updateClubFinanceBudget(club, { reserveWeeks: 8, transferShare: 70 });

const snapshot = clubSeasonBudgetSnapshot(world, club);
assert.equal(snapshot.remainingWeeks, 3);
assert.equal(snapshot.remainingHomeMatches, 2);
assert.equal(snapshot.projectedTickets, snapshot.estimatedGate * 2);
assert.equal(snapshot.reserveCash, snapshot.operating.operatingOut * 8);
assert.equal(snapshot.plannedTransferBudget, Math.floor(snapshot.safeTransferCeiling * 0.7));
assert.equal(
  snapshot.projectedEndCash,
  club.money + snapshot.projectedOperatingNet + snapshot.projectedTickets + 600_000
);
assert.ok(["stable", "tight", "critical"].includes(snapshot.status));

console.log("Finance budget audit passed: persisted limits, scheduled gates, reserve and season projection");
