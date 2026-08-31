import assert from "node:assert/strict";

import {
  processAiFacilityInvestment,
  processFacilityDay,
} from "../js/facilities.js";

function club(id, { user = false, money = 30_000_000, debt = 0 } = {}) {
  return {
    id,
    name: id,
    division: 1,
    power: 72,
    money,
    players: [],
    youth: { level: 1, players: [] },
    facilities: { stadium: 3, training: 2, youth: 1, projects: [] },
    finance: {
      debtPlan: { ownerDebt: debt, transferEmbargo: debt > 0 },
      financeLedger: [],
      ledgerSeq: 0,
      ledgerSeason: 2026,
    },
    user,
  };
}

const user = club("user", { user: true });
const investor = club("investor");
const debtor = club("debtor", { debt: 4_000_000 });
const poor = club("poor", { money: 2_000_000 });
const world = {
  season: 2026,
  day: 28,
  seasonOver: false,
  userClubId: user.id,
  clubs: [user, investor, debtor, poor],
  news: [],
  transferNegotiations: [],
  dealNegotiations: [],
};

const beforeMoney = investor.money;
const actions = processAiFacilityInvestment(world);
assert.equal(actions.length, 1, "only the solvent AI club should invest");
assert.equal(actions[0].clubId, investor.id);
assert.equal(user.facilities.projects.length, 0, "the user club must remain player-controlled");
assert.equal(debtor.facilities.projects.length, 0, "a debt recovery club must retain cash");
assert.equal(poor.facilities.projects.length, 0, "the tier reserve must block unaffordable expansion");
assert.equal(investor.facilities.projects.length, 1);
assert.equal(investor.money, beforeMoney - actions[0].cost);
assert.ok(
  investor.finance.financeLedger.some(
    (entry) => entry.source === "facility-upgrade" && entry.amount === -actions[0].cost
  ),
  "capital expenditure must use the shared finance ledger"
);
assert.equal(world.news.length, 0, "bulk AI investment must not flood the player news feed");

processAiFacilityInvestment(world);
assert.equal(investor.facilities.projects.length, 1, "AI investment is limited to one project per season");

const project = investor.facilities.projects[0];
world.day = project.finishDay;
processFacilityDay(world);
assert.equal(investor.facilities[project.kind], project.to, "the normal construction clock must complete the asset");

console.log("AI facility investment audit passed: reserve, debt, ledger, ownership and construction");
