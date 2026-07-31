import assert from "node:assert/strict";

import {
  processDealNegotiationsDay,
  respondDealNegotiation,
  submitLoanNegotiation,
  submitRenewalNegotiation,
} from "../js/deal-negotiations.js";
import { activeDealCashCommitments } from "../js/cash-reservations.js";
import { clubFinanceCommitments } from "../js/club-finance.js";
import { resolveInboxAction, syncDealNegotiationsToInbox } from "../js/inbox.js";
import { submitSaleListing, submitTransferNegotiation } from "../js/transfer-negotiations.js";

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
    contractYears: 1,
    _needsRenew: true,
    fitness: 100,
    morale: 70,
    stats: {},
  };
}

function club(id, power = 70, money = 20_000_000) {
  const positions = ["GK", "DEF", "DEF", "DEF", "DEF", "MID", "MID", "MID", "MID", "ATT", "ATT", "GK", "DEF", "MID", "ATT"];
  const players = positions.map((pos, index) => player(`${id}_${index}`, pos, 11 + (index % 4)));
  players.forEach((candidate) => {
    candidate.clubId = id;
    candidate.contractYears = 3;
    candidate._needsRenew = false;
  });
  return {
    id,
    name: `Club ${id}`,
    nameEn: `Club ${id}`,
    short: id,
    division: 1,
    power,
    money,
    players,
    youth: { level: 1, players: [] },
    facilities: { stadium: 1, training: 1, youth: 1, projects: [] },
    staff: {},
    finance: { financeLedger: [], ledgerSeq: 0 },
    tactics: { formation: "4-3-3", lineup: players.slice(0, 11).map((candidate) => candidate.id) },
  };
}

function setup({ userMoney = 20_000_000 } = {}) {
  const user = club("user", 72, userMoney);
  const other = club("other", 68);
  const third = club("third", 66);
  const ownTarget = player("own_target", "MID", 14);
  const loanTarget = player("loan_target", "ATT", 14);
  ownTarget.clubId = user.id;
  loanTarget.clubId = other.id;
  user.players.push(ownTarget);
  other.players.push(loanTarget);
  return {
    world: {
      day: 1,
      season: 2026,
      userClubId: user.id,
      clubs: [user, other, third],
      fixtures: [],
      news: [],
      media: [],
      inbox: [],
      poachBids: [],
      loans: [],
      transferNegotiations: [],
      dealNegotiations: [],
    },
    user,
    other,
    third,
    ownTarget,
    loanTarget,
  };
}

function due(world, day, random = () => 0) {
  world.day = day;
  return processDealNegotiationsDay(world, { random });
}

// 续约报价占用签约奖，并替代财政页的稳定续约估算；球员还价后可从信箱成交。
{
  const { world, user, ownTarget } = setup();
  const submitted = submitRenewalNegotiation(world, ownTarget.id, {
    years: 3,
    wage: 8_000,
    random: () => 0,
  });
  assert.equal(submitted.ok, true);
  assert.equal(submitted.negotiation.signingBonus, 14_400);
  assert.equal(activeDealCashCommitments(world, user.id), 14_400);
  assert.equal(user.players.includes(ownTarget), true);
  assert.equal(
    submitLoanNegotiation(world, "loan_out", ownTarget.id, null, { fee: 10_000 }).ok,
    false,
    "同一球员不能同时续约和外租"
  );
  assert.equal(submitSaleListing(world, ownTarget.id, { askingFee: 1_000_000 }).ok, false);

  const commitments = clubFinanceCommitments(world, user);
  assert.equal(commitments.contracts, submitted.negotiation.signingBonus);
  assert.equal(commitments.items.filter((item) => item.kind === "contract").length, 1);

  due(world, 2);
  assert.equal(submitted.negotiation.status, "party_counter");
  assert.ok(submitted.negotiation.wage > 8_000);
  syncDealNegotiationsToInbox(world);
  const mail = world.inbox.find(
    (item) => item.ref?.negotiationId === submitted.negotiation.id && item.status === "pending"
  );
  assert.ok(mail, "续约还价应进入信箱");
  const moneyBefore = user.money;
  assert.equal(resolveInboxAction(world, mail.id, "accept").ok, true);
  assert.equal(submitted.negotiation.status, "completed");
  assert.equal(ownTarget.contractYears, submitted.negotiation.years);
  assert.equal(ownTarget.wage, submitted.negotiation.wage);
  assert.equal(user.money, moneyBefore - submitted.negotiation.signingBonus);
  assert.equal(activeDealCashCommitments(world, user.id), 0);
  syncDealNegotiationsToInbox(world);
  assert.equal(
    world.inbox.filter((item) => item.ref?.negotiationId === submitted.negotiation.id).length,
    1,
    "亲自接受还价后不应重复生成成交邮件"
  );
}

// 明显偏低的续约报价会被拒绝，合同与现金均不改变。
{
  const { world, user, ownTarget } = setup();
  const moneyBefore = user.money;
  const submitted = submitRenewalNegotiation(world, ownTarget.id, {
    years: 3,
    wage: 1_000,
    random: () => 0,
  });
  due(world, 2);
  assert.equal(submitted.negotiation.status, "rejected");
  assert.equal(ownTarget.wage, 10_000);
  assert.equal(ownTarget.contractYears, 1);
  assert.equal(user.money, moneyBefore);
}

// 租入依次经过母队还价和球员审核，成交前球员始终留在母队。
{
  const { world, user, other, loanTarget } = setup();
  const submitted = submitLoanNegotiation(world, "loan_in", loanTarget.id, other.id, {
    term: "half",
    fee: 50_000,
    wageShare: 0.6,
    random: () => 0,
  });
  assert.equal(submitted.ok, true);
  assert.equal(activeDealCashCommitments(world, user.id), 50_000);
  assert.equal(other.players.includes(loanTarget), true);
  assert.equal(user.players.includes(loanTarget), false);
  assert.equal(
    submitTransferNegotiation(world, loanTarget.id, other.id, {
      fee: 1_000_000,
      years: 3,
      wage: 12_000,
    }).ok,
    false,
    "租借谈判中的球员不能同时开启永久转会谈判"
  );

  due(world, 2);
  assert.equal(submitted.negotiation.status, "club_counter");
  syncDealNegotiationsToInbox(world);
  const mail = world.inbox.find((item) => item.ref?.negotiationId === submitted.negotiation.id);
  assert.ok(mail);
  assert.equal(resolveInboxAction(world, mail.id, "accept").ok, true);
  assert.equal(submitted.negotiation.status, "player_review");
  assert.equal(other.players.includes(loanTarget), true);

  const commitments = clubFinanceCommitments(world, user);
  assert.equal(commitments.loans, submitted.negotiation.fee);
  const loanCommitment = commitments.items.find((item) => item.id === submitted.negotiation.id);
  assert.equal(
    loanCommitment.weeklyWageIncrease,
    Math.round(loanTarget.wage * submitted.negotiation.wageShare)
  );
  const userMoney = user.money;
  const ownerMoney = other.money;
  due(world, submitted.negotiation.decisionDay);
  assert.equal(submitted.negotiation.status, "completed");
  assert.equal(other.players.includes(loanTarget), false);
  assert.equal(user.players.includes(loanTarget), true);
  assert.equal(user.money, userMoney - submitted.negotiation.fee);
  assert.equal(other.money, ownerMoney + submitted.negotiation.fee);
  assert.equal(loanTarget.loan?.fromClubId, other.id);
}

// 外租经过市场报价、我方还价、接收方复核和球员审核；接收方承诺同步计入工资。
{
  const { world, user, ownTarget } = setup();
  const submitted = submitLoanNegotiation(world, "loan_out", ownTarget.id, null, {
    term: "half",
    fee: 100_000,
    wageShare: 0.75,
    random: () => 0,
  });
  assert.equal(submitted.ok, true);
  due(world, 2);
  assert.equal(submitted.negotiation.status, "offer_review");
  const host = world.clubs.find((clubItem) => clubItem.id === submitted.negotiation.hostClubId);
  assert.ok(host);
  assert.equal(user.players.includes(ownTarget), true);
  const hostCommitments = clubFinanceCommitments(world, host);
  assert.equal(hostCommitments.loans, submitted.negotiation.fee);
  const hostLoanCommitment = hostCommitments.items.find((item) => item.id === submitted.negotiation.id);
  assert.equal(
    hostLoanCommitment.weeklyWageIncrease,
    Math.round(ownTarget.wage * submitted.negotiation.wageShare)
  );

  assert.equal(
    respondDealNegotiation(world, submitted.negotiation.id, "counter", {
      fee: submitted.negotiation.fee + 1,
      wageShare: submitted.negotiation.wageShare,
    }).ok,
    true
  );
  assert.equal(submitted.negotiation.status, "buyer_review");
  due(world, 3);
  assert.equal(submitted.negotiation.status, "player_review");
  assert.equal(user.players.includes(ownTarget), true);
  const userMoney = user.money;
  const hostMoney = host.money;
  due(world, submitted.negotiation.decisionDay);
  assert.equal(submitted.negotiation.status, "completed");
  assert.equal(user.players.includes(ownTarget), false);
  assert.equal(host.players.includes(ownTarget), true);
  assert.equal(user.money, userMoney + submitted.negotiation.fee);
  assert.equal(host.money, hostMoney - submitted.negotiation.fee);
}

// 撤回立即释放占款；资金或窗口变化会无副作用地取消未完成交易。
{
  const first = setup();
  const pending = submitLoanNegotiation(first.world, "loan_in", first.loanTarget.id, first.other.id, {
    fee: 50_000,
    wageShare: 0.75,
    random: () => 0,
  });
  assert.equal(activeDealCashCommitments(first.world, first.user.id), 50_000);
  assert.equal(respondDealNegotiation(first.world, pending.negotiation.id, "withdraw").ok, true);
  assert.equal(activeDealCashCommitments(first.world, first.user.id), 0);

  const second = setup({ userMoney: 60_000 });
  const cashPending = submitLoanNegotiation(second.world, "loan_in", second.loanTarget.id, second.other.id, {
    fee: 50_000,
    wageShare: 0.75,
    random: () => 0,
  });
  second.user.money = 0;
  due(second.world, 2);
  assert.equal(cashPending.negotiation.status, "cancelled");
  assert.equal(second.other.players.includes(second.loanTarget), true);
  assert.equal(second.world.loans.length, 0);

  const third = setup();
  const windowPending = submitLoanNegotiation(third.world, "loan_out", third.ownTarget.id, null, {
    fee: 50_000,
    wageShare: 0.75,
    random: () => 0,
  });
  due(third.world, 51);
  assert.equal(windowPending.negotiation.status, "cancelled");
  assert.equal(third.user.players.includes(third.ownTarget), true);
  assert.equal(third.world.loans.length, 0);
}

console.log("Deal negotiations audit passed: renewals, incoming and outgoing loans, reservations, inbox, live validation, and finance");
