import assert from "node:assert/strict";

import {
  findActiveTransferNegotiation,
  processTransferNegotiationsDay,
  respondTransferNegotiation,
  submitTransferNegotiation,
} from "../js/transfer-negotiations.js";
import {
  resolveInboxAction,
  syncTransferNegotiationsToInbox,
} from "../js/inbox.js";

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

function club(id, power) {
  const positions = ["GK", "DEF", "DEF", "DEF", "DEF", "MID", "MID", "MID", "MID", "ATT", "ATT", "GK", "DEF", "MID", "ATT"];
  const players = positions.map((pos, index) => player(`${id}_${index}`, pos, 12 + (index % 4)));
  players.forEach((candidate) => {
    candidate.clubId = id;
  });
  return {
    id,
    name: `Club ${id}`,
    nameEn: `Club ${id}`,
    power,
    money: 20_000_000,
    finance: {},
    players,
    tactics: { formation: "4-3-3", lineup: players.slice(0, 11).map((candidate) => candidate.id) },
  };
}

function setup() {
  const buyer = club("buyer", 72);
  const seller = club("seller", 78);
  const target = player("target", "ATT", 16);
  target.clubId = seller.id;
  seller.players.push(target);
  seller.tactics.lineup[10] = target.id;
  return {
    world: {
      day: 1,
      season: 1,
      userClubId: buyer.id,
      clubs: [buyer, seller],
      news: [],
      media: [],
      inbox: [],
    },
    buyer,
    seller,
    target,
  };
}

function due(world, day) {
  world.day = day;
  return processTransferNegotiationsDay(world, { random: () => 0 });
}

// 卖方还价 -> 信箱接受 -> 球员自动接受 -> 成交与财政落账。
{
  const { world, buyer, seller, target } = setup();
  const submitted = submitTransferNegotiation(world, target.id, seller.id, {
    fee: 1_000_000,
    years: 3,
    wage: 16_000,
    random: () => 0,
  });
  assert.equal(submitted.ok, true);
  assert.equal(findActiveTransferNegotiation(world, target.id)?.status, "club_review");
  assert.equal(
    submitTransferNegotiation(world, target.id, seller.id, {
      fee: 2_000_000,
      years: 3,
      wage: 16_000,
    }).ok,
    false,
    "同一球员不能同时发起两项买入谈判"
  );

  due(world, 2);
  assert.equal(submitted.negotiation.status, "club_counter");
  syncTransferNegotiationsToInbox(world);
  const counterMail = world.inbox.find(
    (mail) => mail.ref?.negotiationId === submitted.negotiation.id && mail.status === "pending"
  );
  assert.ok(counterMail, "卖方还价应进入信箱");
  assert.equal(resolveInboxAction(world, counterMail.id, "accept").ok, true);
  assert.equal(submitted.negotiation.status, "player_review");

  const buyerMoneyBefore = buyer.money;
  const sellerMoneyBefore = seller.money;
  due(world, submitted.negotiation.decisionDay);
  assert.equal(submitted.negotiation.status, "completed");
  assert.equal(seller.players.some((candidate) => candidate.id === target.id), false);
  assert.equal(buyer.players.some((candidate) => candidate.id === target.id), true);
  assert.equal(buyer.money, buyerMoneyBefore - submitted.negotiation.fee - submitted.negotiation.signingBonus);
  assert.equal(seller.money, sellerMoneyBefore + submitted.negotiation.fee);
  assert.equal(buyer.finance.seasonTransferNet, -submitted.negotiation.fee - submitted.negotiation.signingBonus);
  assert.equal(seller.finance.seasonTransferNet, submitted.negotiation.fee);
}

// 俱乐部接受 -> 球员还价 -> 信箱接受后即时成交，且不再生成重复终局邮件。
{
  const { world, buyer, seller, target } = setup();
  const submitted = submitTransferNegotiation(world, target.id, seller.id, {
    fee: 2_000_000,
    years: 3,
    wage: 10_000,
    random: () => 0,
  });
  due(world, 2);
  assert.equal(submitted.negotiation.status, "player_review");
  due(world, 3);
  assert.equal(submitted.negotiation.status, "player_counter");
  syncTransferNegotiationsToInbox(world);
  const counterMail = world.inbox.find((mail) => mail.status === "pending");
  assert.ok(counterMail);
  assert.equal(resolveInboxAction(world, counterMail.id, "accept").ok, true);
  assert.equal(submitted.negotiation.status, "completed");
  assert.equal(buyer.players.some((candidate) => candidate.id === target.id), true);
  syncTransferNegotiationsToInbox(world);
  assert.equal(
    world.inbox.filter((mail) => mail.ref?.negotiationId === submitted.negotiation.id).length,
    1,
    "用户亲自接受球员还价后不应再生成重复成交邮件"
  );
}

// 明显低价被拒后只产生一封结果邮件。
{
  const { world, seller, target } = setup();
  const submitted = submitTransferNegotiation(world, target.id, seller.id, {
    fee: 100_000,
    years: 3,
    wage: 16_000,
    random: () => 0,
  });
  due(world, 2);
  assert.equal(submitted.negotiation.status, "rejected");
  syncTransferNegotiationsToInbox(world);
  syncTransferNegotiationsToInbox(world);
  assert.equal(world.inbox.length, 1);
  assert.equal(world.inbox[0].ref.negotiationRevision, submitted.negotiation.revision);
}

// 审核中可撤回；窗口关闭会取消仍在进行的交易。
{
  const first = setup();
  const submitted = submitTransferNegotiation(first.world, first.target.id, first.seller.id, {
    fee: 2_000_000,
    years: 3,
    wage: 16_000,
    random: () => 0,
  });
  assert.equal(respondTransferNegotiation(first.world, submitted.negotiation.id, "withdraw").ok, true);
  assert.equal(submitted.negotiation.status, "cancelled");

  const second = setup();
  const pending = submitTransferNegotiation(second.world, second.target.id, second.seller.id, {
    fee: 2_000_000,
    years: 3,
    wage: 16_000,
    random: () => 0,
  });
  due(second.world, 51);
  assert.equal(pending.negotiation.status, "cancelled");
  assert.match(pending.negotiation.reason, /转会窗已关闭/);
}

console.log("transfer-negotiations audit passed: staged review, counters, inbox, finance, withdrawal, and window closure");
