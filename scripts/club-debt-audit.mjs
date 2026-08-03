import assert from "node:assert/strict";

import {
  clubDebtSnapshot,
  recordClubDebtInterest,
  repayClubFinancing,
  requestClubFinancing,
  settleWorldDebtSeason,
} from "../js/club-debt.js";
import { reviewClubFinancialCompliance } from "../js/club-finance.js";

const club = {
  id: "borrower",
  name: "Borrower",
  division: 1,
  power: 70,
  money: 0,
  players: [],
  youth: { level: 1, players: [] },
  staff: {},
  facilities: { stadium: 3, training: 1, youth: 1, projects: [] },
  finance: {},
};
const world = { season: 1, day: 7, userClubId: club.id, clubs: [club], loans: [] };

const financing = requestClubFinancing(world, club.id, 1_000_000, 2);
assert.equal(financing.ok, true);
assert.equal(club.money, 1_000_000);
assert.equal(financing.facility.balance, 1_000_000);
assert.equal(financing.facility.annualRate, 0.06);
assert.equal(clubDebtSnapshot(world, club).weeklyInterest, 1_875);

assert.equal(recordClubDebtInterest(world, club), 1_875);
assert.equal(recordClubDebtInterest(world, club), 0);
assert.equal(club.money, 998_125);

const seasonOne = settleWorldDebtSeason(world);
assert.equal(seasonOne.length, 1);
assert.equal(seasonOne[0].principal, 500_000);
assert.equal(financing.facility.balance, 500_000);
assert.equal(settleWorldDebtSeason(world).length, 0);

world.season = 2;
world.day = 7;
assert.equal(recordClubDebtInterest(world, club), 938);
world.transferNegotiations = [{
  id: "reserved-transfer",
  status: "club_review",
  buyerClubId: club.id,
  fee: 400_000,
}];
assert.equal(repayClubFinancing(world, club.id, financing.facility.id, 200_000).ok, false);
world.transferNegotiations = [];
assert.equal(repayClubFinancing(world, club.id, financing.facility.id, 200_000).ok, true);
assert.equal(financing.facility.balance, 300_000);
assert.equal(settleWorldDebtSeason(world)[0].principal, 300_000);
assert.equal(financing.facility.status, "repaid");

club.finance.debt.facilities.push({
  id: "stress",
  kind: "owner",
  lender: "Stress lender",
  originalPrincipal: 50_000_000,
  balance: 50_000_000,
  annualRate: 0.04,
  amortizing: false,
  status: "active",
});
const compliance = reviewClubFinancialCompliance(world, club);
assert.equal(compliance.status, "restricted");
assert.equal(compliance.transferEmbargo, true);

console.log("Club debt audit passed: financing, interest, amortization, reserved-cash repayment and compliance restriction");
