import assert from "node:assert/strict";

import { processAiDebtActions, ensureWorldFinances } from "../js/club-finance.js";
import { CLUB_TEMPLATES } from "../js/data.js";
import { createWorld } from "../js/models.js";

const startClub = CLUB_TEMPLATES.find((club) => club.division === 3);
const world = createWorld(startClub.id, "AI Debt Audit");
ensureWorldFinances(world);
const club = world.clubs.find((item) => item.id !== world.userClubId);
club.money = -5_000_000;

const actions = processAiDebtActions(world);
assert.ok(actions.some((action) => action.clubId === club.id && action.type === "owner-loan"));
assert.equal(club.finance.debtPlan.transferEmbargo, true);
assert.ok(club.finance.debtPlan.ownerDebt > 0);
assert.equal(club.finance.budgetPlan.reserveWeeks, 20);
assert.equal(club.finance.budgetPlan.transferShare, 25);
assert.ok(club.finance.financeLedger.some((entry) => entry.source === "owner-loan"));

club.money = 100_000_000;
processAiDebtActions(world);
assert.equal(club.finance.debtPlan.ownerDebt, 0);
assert.equal(club.finance.debtPlan.transferEmbargo, false);
assert.ok(club.finance.financeLedger.some((entry) => entry.source === "owner-loan-repayment"));

console.log("AI debt audit passed: embargo, explicit owner debt and repayment are linked");
