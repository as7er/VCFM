import assert from "node:assert/strict";

import {
  processLeagueTransitionPayments,
  registerLeagueTransitionFinance,
} from "../js/league-transition-finance.js";
import { acceptSponsorshipOffer, ensureWorldSponsorships, sponsorshipSnapshot } from "../js/sponsorships.js";

function club(id, division) {
  return { id, name: id, division, power: 65, money: 0, finance: {} };
}

const promoted = club("promoted", 2);
const relegated = club("relegated", 1);
const world = { season: 1, day: 220, userClubId: promoted.id, clubs: [promoted, relegated] };
ensureWorldSponsorships(world);
const offer = sponsorshipSnapshot(world, promoted).offers[1];
assert.equal(acceptSponsorshipOffer(world, promoted.id, offer.id).ok, true);
const priorSponsorWeekly = sponsorshipSnapshot(world, promoted).next.weeklyBase;

const promotionPayments = registerLeagueTransitionFinance(world, promoted, {
  from: 2,
  to: 1,
  promoted: true,
});
const relegationPayments = registerLeagueTransitionFinance(world, relegated, {
  from: 1,
  to: 2,
  promoted: false,
});
assert.equal(promotionPayments.length, 1);
assert.equal(relegationPayments.length, 2);
assert.equal(sponsorshipSnapshot(world, promoted).next.weeklyBase, Math.round(priorSponsorWeekly * 1.25));
assert.equal(processLeagueTransitionPayments(world).length, 0);

world.season = 2;
world.day = 1;
const firstSeason = processLeagueTransitionPayments(world);
assert.equal(firstSeason.length, 2);
assert.equal(promoted.money, 1_800_000);
assert.equal(relegated.money, 2_600_000);
assert.equal(processLeagueTransitionPayments(world).length, 0);

world.season = 3;
assert.equal(processLeagueTransitionPayments(world).length, 1);
assert.equal(relegated.money, 4_000_000);
assert.equal(relegated.finance.financeLedger.filter((entry) => entry.source === "relegation-parachute").length, 2);

console.log("League transition finance audit passed: promotion support, two-season parachute and sponsor clauses");
