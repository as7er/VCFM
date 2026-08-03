import assert from "node:assert/strict";

import {
  clubFinanceObligationSnapshot,
  processFinanceObligationsDay,
  recordTransferAppearances,
  settleTransferAgreement,
} from "../js/finance-obligations.js";
import { transferNegotiationCashCost } from "../js/cash-reservations.js";

function club(id, money = 0) {
  return { id, name: id, money, finance: {} };
}

const buyer = club("buyer", 2_000_000);
const seller = club("seller");
const former = club("former");
const nextBuyer = club("next", 2_000_000);
const player = {
  id: "p1",
  name: "Test Player",
  sellOnClause: {
    beneficiaryClubId: former.id,
    debtorClubId: seller.id,
    pct: 10,
  },
};
const world = {
  season: 1,
  day: 20,
  clubs: [buyer, seller, former, nextBuyer],
};

const agreement = settleTransferAgreement(world, {
  transferId: "t1",
  buyerClubId: buyer.id,
  sellerClubId: seller.id,
  player,
  fee: 1_000_000,
  upfrontPct: 60,
  installmentCount: 2,
  appearanceBonus: 100_000,
  appearanceTarget: 20,
  sellOnPct: 10,
});

assert.equal(agreement.upfront, 600_000);
assert.deepEqual(agreement.installments, [200_000, 200_000]);
assert.equal(buyer.money, 1_400_000);
assert.equal(seller.money, 540_000);
assert.equal(former.money, 60_000);
assert.equal(clubFinanceObligationSnapshot(world, buyer.id).scheduledPayable, 400_000);
assert.equal(clubFinanceObligationSnapshot(world, buyer.id).conditionalPayable, 100_000);

world.day = 90;
assert.equal(processFinanceObligationsDay(world).length, 1);
assert.equal(processFinanceObligationsDay(world).length, 0);
assert.equal(buyer.money, 1_200_000);
assert.equal(seller.money, 720_000);
assert.equal(former.money, 80_000);

for (let appearance = 0; appearance < 19; appearance++) {
  assert.equal(recordTransferAppearances(world, buyer.id, [player.id]).length, 0);
}
assert.equal(recordTransferAppearances(world, buyer.id, [player.id]).length, 1);
assert.equal(recordTransferAppearances(world, buyer.id, [player.id]).length, 0);
assert.equal(buyer.money, 1_100_000);
assert.equal(seller.money, 810_000);
assert.equal(former.money, 90_000);

settleTransferAgreement(world, {
  transferId: "t2",
  buyerClubId: nextBuyer.id,
  sellerClubId: buyer.id,
  player,
  fee: 2_000_000,
  installmentCount: 0,
});
assert.equal(nextBuyer.money, 0);
assert.equal(buyer.money, 2_900_000);
assert.equal(seller.money, 1_010_000);

const resalePlayer = { id: "p2", name: "Resale Player" };
settleTransferAgreement(world, {
  transferId: "t3",
  buyerClubId: buyer.id,
  sellerClubId: seller.id,
  player: resalePlayer,
  fee: 0,
  appearanceBonus: 75_000,
  appearanceTarget: 10,
});
const staleAppearance = world.financeObligations.find((item) => item.playerId === resalePlayer.id);
assert.equal(staleAppearance.status, "pending");
settleTransferAgreement(world, {
  transferId: "t4",
  buyerClubId: nextBuyer.id,
  sellerClubId: buyer.id,
  player: resalePlayer,
  fee: 0,
});
assert.equal(staleAppearance.status, "cancelled");
assert.equal(staleAppearance.cancelReason, "player-permanently-transferred");
assert.equal(clubFinanceObligationSnapshot(world, buyer.id).conditionalPayable, 0);

assert.equal(transferNegotiationCashCost({
  fee: 1_000_000,
  upfrontPct: 60,
  installmentCount: 2,
  wage: 10_000,
  years: 3,
}), 615_000);

console.log("Finance obligations audit passed: installments, appearances, resale cancellation, sell-on shares and cash reservations");
