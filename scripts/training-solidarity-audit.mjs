import assert from "node:assert/strict";

import { settleTransferAgreement, trainingSolidarityShares } from "../js/finance-obligations.js";

function club(id, money = 0) {
  return { id, name: id, money, finance: {} };
}

const buyer = club("buyer", 2_000_000);
const seller = club("seller");
const academy = club("academy");
const former = club("former");
const player = {
  id: "trained-player",
  name: "Trained Player",
  development: {
    clubYears: { seller: 2, academy: 3, former: 2 },
  },
};
const world = { season: 1, day: 30, clubs: [buyer, seller, academy, former] };

const shares = trainingSolidarityShares(player);
assert.equal(shares.length, 3);
assert.equal(Math.round(shares.reduce((sum, item) => sum + item.rate, 0) * 1000), 35);

settleTransferAgreement(world, {
  transferId: "solidarity-test",
  buyerClubId: buyer.id,
  sellerClubId: seller.id,
  player,
  fee: 1_000_000,
  installmentCount: 0,
});

assert.equal(buyer.money, 1_000_000);
assert.equal(seller.money, 975_000);
assert.equal(academy.money, 15_000);
assert.equal(former.money, 10_000);
assert.equal(
  [buyer, seller, academy, former].reduce((sum, club) => sum + club.money, 0),
  2_000_000
);
assert.equal(
  academy.finance.financeLedger.some((entry) => entry.source === "training-solidarity"),
  true
);

console.log("Training solidarity audit passed: recorded development years distribute a balanced share of transfer payments");
