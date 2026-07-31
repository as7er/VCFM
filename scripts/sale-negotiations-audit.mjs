import assert from "node:assert/strict";

import {
  acceptIncomingTransferOffer,
  findActiveSaleNegotiation,
  processTransferNegotiationsDay,
  respondTransferNegotiation,
  submitSaleListing,
} from "../js/transfer-negotiations.js";
import { syncTransferNegotiationsToInbox } from "../js/inbox.js";
import { acceptPoachBid } from "../js/poaching.js";

function player(id, pos = "MID", ovr = 14) {
  const attrs = {
    reflexes: ovr,
    handling: ovr,
    positioning: ovr,
    kicking: ovr,
    tackling: ovr,
    marking: ovr,
    strength: ovr,
    pace: ovr,
    passing: ovr,
    vision: ovr,
    stamina: ovr,
    shooting: ovr,
    dribbling: ovr,
    finishing: ovr,
  };
  return {
    id,
    name: `Player ${id}`,
    pos,
    age: 25,
    attrs,
    ovr,
    potential: ovr + 1,
    value: 1_000_000,
    wage: 10_000,
    contractYears: 3,
    fitness: 100,
    morale: 70,
    stats: {},
  };
}

function club(id, power, money = 20_000_000) {
  const positions = ["GK", "DEF", "DEF", "DEF", "DEF", "MID", "MID", "MID", "MID", "ATT", "ATT", "GK", "DEF", "MID", "ATT"];
  const players = positions.map((pos, index) => player(`${id}_${index}`, pos, 11 + (index % 4)));
  players.forEach((candidate) => {
    candidate.clubId = id;
  });
  return {
    id,
    name: `Club ${id}`,
    nameEn: `Club ${id}`,
    power,
    division: 1,
    money,
    finance: {},
    players,
    tactics: { formation: "4-3-3", lineup: players.slice(0, 11).map((candidate) => candidate.id) },
  };
}

function setup() {
  const seller = club("seller", 70);
  const buyer = club("buyer", 74);
  const target = player("target", "ATT", 15);
  target.clubId = seller.id;
  seller.players.push(target);
  seller.tactics.lineup[10] = target.id;
  return {
    world: {
      day: 1,
      season: 1,
      userClubId: seller.id,
      clubs: [seller, buyer],
      news: [],
      media: [],
      inbox: [],
      poachBids: [],
      loans: [],
    },
    seller,
    buyer,
    target,
  };
}

function due(world, day, random = () => 0) {
  world.day = day;
  return processTransferNegotiationsDay(world, { random });
}

// 挂牌不会即时移动球员；买方报价、卖方还价和球员审核依次推进。
{
  const { world, seller, buyer, target } = setup();
  const listed = submitSaleListing(world, target.id, { askingFee: 1_000_000, random: () => 0 });
  assert.equal(listed.ok, true);
  assert.equal(findActiveSaleNegotiation(world, target.id)?.status, "market_search");
  assert.equal(seller.players.includes(target), true);
  assert.equal(buyer.players.includes(target), false);
  assert.equal(
    submitSaleListing(world, target.id, { askingFee: 900_000 }).ok,
    false,
    "同一球员只能有一项进行中的出售谈判"
  );

  due(world, 2);
  assert.equal(listed.negotiation.status, "seller_review");
  assert.equal(listed.negotiation.buyerClubId, buyer.id);
  syncTransferNegotiationsToInbox(world);
  assert.ok(world.inbox.some((mail) => mail.ref?.negotiationId === listed.negotiation.id));

  const counterFee = Math.max(listed.negotiation.fee + 1, 1_000_000);
  assert.equal(
    respondTransferNegotiation(world, listed.negotiation.id, "counter", { fee: counterFee }).ok,
    true
  );
  assert.equal(listed.negotiation.status, "buyer_review");
  due(world, 3);
  assert.equal(listed.negotiation.status, "player_review");

  const sellerMoney = seller.money;
  const buyerMoney = buyer.money;
  due(world, listed.negotiation.decisionDay);
  assert.equal(listed.negotiation.status, "completed");
  assert.equal(seller.players.includes(target), false);
  assert.equal(buyer.players.includes(target), true);
  assert.equal(seller.money, sellerMoney + listed.negotiation.fee);
  assert.equal(
    buyer.money,
    buyerMoney - listed.negotiation.fee - listed.negotiation.signingBonus
  );
  assert.equal(target.clubId, buyer.id);
  assert.equal(target.contractYears, listed.negotiation.years);
  assert.equal(target.wage, listed.negotiation.wage);
}

// 不现实的挂牌价会得到无报价结果，球员与财政保持原状。
{
  const { world, seller, buyer, target } = setup();
  const sellerMoney = seller.money;
  const buyerMoney = buyer.money;
  const listed = submitSaleListing(world, target.id, { askingFee: 2_000_000, random: () => 0 });
  due(world, 2);
  assert.equal(listed.negotiation.status, "rejected");
  assert.equal(listed.negotiation.rejectedBy, "market");
  assert.equal(seller.players.includes(target), true);
  assert.equal(seller.money, sellerMoney);
  assert.equal(buyer.money, buyerMoney);
}

// 接受外部报价只进入球员审核；成交前买方资金变化会取消交易且无副作用。
{
  const { world, seller, buyer, target } = setup();
  const accepted = acceptIncomingTransferOffer(world, {
    playerId: target.id,
    buyerClubId: buyer.id,
    fee: 1_000_000,
    sourceBidId: "bid_1",
    random: () => 0,
  });
  assert.equal(accepted.ok, true);
  assert.equal(accepted.negotiation.status, "player_review");
  assert.equal(seller.players.includes(target), true, "接受报价时不能即时转移球员");
  buyer.money = 0;
  due(world, accepted.negotiation.decisionDay);
  assert.equal(accepted.negotiation.status, "cancelled");
  assert.match(accepted.negotiation.reason, /无法承担/);
  assert.equal(seller.players.includes(target), true);
}

// 新报价复核失败时不能先取消原有挂牌。
{
  const { world, buyer, target } = setup();
  const listed = submitSaleListing(world, target.id, { askingFee: 1_000_000, random: () => 0 });
  buyer.money = 0;
  const failed = acceptIncomingTransferOffer(world, {
    playerId: target.id,
    buyerClubId: buyer.id,
    fee: 1_000_000,
    random: () => 0,
  });
  assert.equal(failed.ok, false);
  assert.equal(listed.negotiation.status, "market_search");
  assert.equal(findActiveSaleNegotiation(world, target.id)?.id, listed.negotiation.id);
}

// 既有挖角报价复用同一出售状态机，不再点击后即时成交。
{
  const { world, seller, buyer, target } = setup();
  const bid = {
    id: "poach_test",
    day: world.day,
    playerId: target.id,
    playerName: target.name,
    pos: target.pos,
    ovr: target.ovr,
    fromClubId: seller.id,
    buyerId: buyer.id,
    buyerName: buyer.name,
    fee: 1_000_000,
    status: "pending",
    expiresDay: world.day + 5,
  };
  world.poachBids.push(bid);
  const accepted = acceptPoachBid(world, bid.id);
  assert.equal(accepted.ok, true);
  assert.equal(bid.status, "negotiating");
  assert.equal(seller.players.includes(target), true);
  due(world, accepted.negotiation.decisionDay);
  assert.equal(accepted.negotiation.status, "completed");
  assert.equal(bid.status, "accepted");
  assert.equal(buyer.players.includes(target), true);
}

// 审核期间可以撤牌，窗口关闭也会取消交易。
{
  const first = setup();
  const listed = submitSaleListing(first.world, first.target.id, { askingFee: 1_000_000, random: () => 0 });
  assert.equal(respondTransferNegotiation(first.world, listed.negotiation.id, "withdraw").ok, true);
  assert.equal(listed.negotiation.status, "cancelled");

  const second = setup();
  const pending = submitSaleListing(second.world, second.target.id, { askingFee: 1_000_000, random: () => 0 });
  due(second.world, 51);
  assert.equal(pending.negotiation.status, "cancelled");
  assert.match(pending.negotiation.reason, /转会窗已关闭/);
}

console.log("sale-negotiations audit passed: listing, offers, counters, player review, live validation, and withdrawal");
