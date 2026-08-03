import assert from "node:assert/strict";

import {
  acceptSponsorshipOffer,
  clubCommercialBreakdown,
  ensureWorldSponsorships,
  settleSponsorshipSeason,
  sponsorshipMarketWeekly,
  sponsorshipSnapshot,
} from "../js/sponsorships.js";
import { clubWeeklyOperatingSnapshot, settleWorldWeeklyFinances } from "../js/club-finance.js";

function club(id, power) {
  return {
    id,
    name: id,
    division: 1,
    power,
    money: 0,
    players: [],
    youth: { players: [] },
    staff: {},
    facilities: { stadium: 1, training: 1, youth: 1, projects: [] },
    finance: { financeLedger: [] },
  };
}

const first = club("first", 72);
const second = club("second", 60);
const third = club("third", 52);
const world = { season: 1, day: 7, userClubId: first.id, clubs: [first, second, third] };

ensureWorldSponsorships(world);
const before = sponsorshipMarketWeekly(first);
const breakdown = clubCommercialBreakdown(world, first);
assert.equal(breakdown.total, before);
assert.equal(clubWeeklyOperatingSnapshot(world, first).commercialIncome, before);
assert.equal(sponsorshipSnapshot(world, first).offers.length, 3);

const selected = sponsorshipSnapshot(world, first).offers[2];
assert.equal(acceptSponsorshipOffer(world, first.id, selected.id).ok, true);
assert.equal(sponsorshipSnapshot(world, first).next.id, selected.id);

settleWorldWeeklyFinances(world);
assert.equal(first.finance.financeLedger.filter((entry) => entry.source === "sponsorship-weekly").length, 1);
assert.equal(first.finance.financeLedger.filter((entry) => entry.source === "commercial-operations").length, 1);

const table = () => [first, second, third].map((club) => ({ id: club.id }));
const result = settleSponsorshipSeason(world, table);
assert.equal(result.length, 3);
assert.equal(settleSponsorshipSeason(world, table).length, 0);

world.season = 2;
world.day = 1;
ensureWorldSponsorships(world);
const active = sponsorshipSnapshot(world, first).active;
assert.equal(active.id, selected.id);
assert.equal(first.finance.financeLedger.some((entry) => entry.source === "sponsorship-signing"), true);

console.log("Sponsorship audit passed: stable commercial split, offers, selection, renewal and performance settlement");
