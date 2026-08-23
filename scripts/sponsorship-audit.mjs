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

// 赞助市场必须随赛季重新定价。收入端名义固定而工资和身价逐年走高，会让全联赛
// 的经常性收支持续恶化（ecosystem 审计的 recurringDeficitClubs / medianRecurringNet）。
const baseSeasonMarket = sponsorshipMarketWeekly(first, 2026);
assert.ok(
  sponsorshipMarketWeekly(first, 2036) > baseSeasonMarket * 1.3,
  "sponsorship market must reprice across seasons"
);
assert.equal(
  sponsorshipMarketWeekly(first, 2020),
  baseSeasonMarket,
  "seasons before the base season must not shrink the market"
);
assert.equal(
  sponsorshipMarketWeekly(first),
  baseSeasonMarket,
  "an unknown season must fall back to base-season pricing"
);

// 重新定价只作用于新合同：晚开局的世界拿到更高的报价，已生效合同不被改写。
const offersAt = (season) => {
  const home = club(`market_${season}`, 72);
  const scopedWorld = { season, day: 1, userClubId: home.id, clubs: [home] };
  ensureWorldSponsorships(scopedWorld);
  return sponsorshipSnapshot(scopedWorld, home).offers;
};
const earlyOffers = offersAt(2026);
const lateOffers = offersAt(2040);
assert.ok(
  lateOffers[0].weeklyBase > earlyOffers[0].weeklyBase * 1.4,
  "later seasons must offer repriced sponsorship contracts"
);
assert.equal(active.weeklyBase, selected.weeklyBase, "an active contract keeps the price it was signed at");

console.log("Sponsorship audit passed: stable commercial split, offers, selection, renewal, season repricing and performance settlement");
