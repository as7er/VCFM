import assert from "node:assert/strict";

import { CLUB_TEMPLATES } from "../js/data.js";
import { createWorld } from "../js/models.js";
import { validateSaveStructure } from "../js/save-schema.js";

function clone(value) {
  return structuredClone(value);
}

function rejects(world, pattern) {
  assert.throws(() => validateSaveStructure(world), pattern);
}

const startClub = CLUB_TEMPLATES.find((club) => club.division === 3);
const source = createWorld(startClub.id, "Save Schema Audit");
assert.equal(validateSaveStructure(source), source);

const duplicatePlayer = clone(source);
duplicatePlayer.clubs[1].players[0].id = duplicatePlayer.clubs[0].players[0].id;
rejects(duplicatePlayer, /duplicate player id/);

const missingFixtureClub = clone(source);
missingFixtureClub.fixtures[0].away = "missing-club";
rejects(missingFixtureClub, /fixture .* invalid clubs/);

const invalidMoney = clone(source);
invalidMoney.clubs[0].money = Number.NaN;
rejects(invalidMoney, /money must be finite/);

const brokenLineup = clone(source);
brokenLineup.clubs[0].tactics.lineup[0] = "missing-player";
rejects(brokenLineup, /lineup references missing player/);

const brokenNegotiation = clone(source);
brokenNegotiation.transferNegotiations = [{
  id: "bad-negotiation",
  buyerClubId: "missing-club",
  sellerClubId: source.clubs[0].id,
  playerId: source.clubs[0].players[0].id,
  status: "club_review",
}];
rejects(brokenNegotiation, /references a missing club/);

const invalidSponsor = clone(source);
invalidSponsor.clubs[0].sponsorship = {
  activeContract: { id: "bad-sponsor", weeklyBase: Number.NaN },
};
rejects(invalidSponsor, /active sponsorship weeklyBase must be finite/);

const duplicateDebt = clone(source);
duplicateDebt.clubs[0].finance.debt = {
  facilities: [
    { id: "same-debt", balance: 100_000 },
    { id: "same-debt", balance: 80_000 },
  ],
};
rejects(duplicateDebt, /duplicate debt facilities/);

const invalidTransitionPayment = clone(source);
invalidTransitionPayment.clubs[0].finance.leagueTransitionPayments = [
  { id: "bad-transition", season: source.season + 1, amount: Number.POSITIVE_INFINITY },
];
rejects(invalidTransitionPayment, /league transition payment .* amount must be finite/);

console.log("Save schema audit passed: IDs, references and football-finance values are validated");
