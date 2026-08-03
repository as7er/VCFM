import assert from "node:assert/strict";

import { matchdayIncome } from "../js/facilities.js";
import { recordMatchdayFinance } from "../js/club-finance.js";

const club = {
  id: "home",
  name: "Home",
  division: 1,
  power: 70,
  money: 1_000_000,
  youth: { level: 1, players: [] },
  facilities: { stadium: 3, training: 1, youth: 1, projects: [] },
  finance: {},
};

const gate = matchdayIncome(club, {
  detail: true,
  isDerby: true,
  clubStrength: 70,
  opponentStrength: 72,
  random: () => 0.5,
});

assert.equal(gate.attendance, gate.capacity);
assert.equal(gate.ticketIncome, gate.income);
assert.ok(gate.retailIncome > 0);
assert.ok(gate.hospitalityIncome > 0);
assert.equal(gate.totalIncome, gate.ticketIncome + gate.retailIncome + gate.hospitalityIncome);

const before = club.money;
const settlement = recordMatchdayFinance(club, gate, 30, 1);
assert.equal(settlement.total, gate.totalIncome);
assert.equal(club.money, before + gate.totalIncome);
assert.equal(club.finance.seasonTicketIncome, gate.ticketIncome);
assert.equal(club.finance.seasonMatchdayIncome, gate.retailIncome + gate.hospitalityIncome);
assert.equal(club.finance.financeLedger.filter((entry) => entry.category === "ticket").length, 1);
assert.equal(club.finance.financeLedger.filter((entry) => entry.category === "matchday").length, 2);

console.log("Matchday finance audit passed: locked attendance drives tickets, retail, hospitality and ledger totals");
