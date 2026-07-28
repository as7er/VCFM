/**
 * 用户买入谈判：俱乐部审核 -> 球员合同审核 -> 成交。
 *
 * 存档只保存 ID、金额、合同条款与状态；球员和俱乐部始终从 world.clubs 解析，
 * 避免复制对象后出现阵容、财政与页面数据不一致。
 */

import {
  assignSquadNumbers,
  autoLineup,
  estimateValue,
  estimateWage,
  formatMoney,
} from "./models.js";
import { ensureContract } from "./contracts.js";
import { mediaTransfer } from "./media.js";
import { isTransferWindowOpen, transferWindowLabel } from "./transfers.js";
import { POS_LABEL } from "./data.js";

export const ACTIVE_TRANSFER_NEGOTIATION_STATUSES = new Set([
  "club_review",
  "club_counter",
  "player_review",
  "player_counter",
]);

const MAX_SQUAD = 28;
const MIN_SELLER_SQUAD = 14;
const MAX_HISTORY = 60;

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function money(n) {
  return Math.max(0, Math.round(Number(n) || 0));
}

function signingBonus(wage, years) {
  return Math.round(money(wage) * clamp(Math.round(Number(years) || 3), 1, 5) * 0.5);
}

function negotiationId(world) {
  const serial = (Number(world._transferNegotiationSerial) || 0) + 1;
  world._transferNegotiationSerial = serial;
  return `tn_${world.season || 0}_${world.day || 0}_${serial}`;
}

function clubById(world, id) {
  return world?.clubs?.find((club) => club.id === id) || null;
}

function playerAtClub(club, playerId) {
  return club?.players?.find((player) => player.id === playerId) || null;
}

function setStatus(world, negotiation, status, extra = {}) {
  negotiation.status = status;
  negotiation.updatedDay = world.day || 0;
  negotiation.revision = (Number(negotiation.revision) || 0) + 1;
  Object.assign(negotiation, extra);
  return negotiation;
}

function stopNegotiation(world, negotiation, status, reason, rejectedBy = null) {
  return setStatus(world, negotiation, status, {
    reason,
    rejectedBy,
    decisionDay: null,
    finishedDay: world.day || 0,
  });
}

function nextDecisionDay(world, random = Math.random) {
  return (world.day || 0) + (random() < 0.5 ? 1 : 2);
}

export function ensureTransferNegotiations(world) {
  if (!world) return [];
  if (!Array.isArray(world.transferNegotiations)) world.transferNegotiations = [];
  if (!Number.isFinite(Number(world._transferNegotiationSerial))) {
    world._transferNegotiationSerial = world.transferNegotiations.length;
  }
  return world.transferNegotiations;
}

export function isActiveTransferNegotiation(negotiation) {
  return !!negotiation && ACTIVE_TRANSFER_NEGOTIATION_STATUSES.has(negotiation.status);
}

export function findActiveTransferNegotiation(world, playerId) {
  return ensureTransferNegotiations(world).find(
    (negotiation) =>
      negotiation.kind === "user_buy" &&
      negotiation.playerId === playerId &&
      isActiveTransferNegotiation(negotiation)
  ) || null;
}

export function listTransferNegotiations(world, { limit = 16 } = {}) {
  return ensureTransferNegotiations(world)
    .slice()
    .sort((a, b) => {
      const activeDiff = Number(isActiveTransferNegotiation(b)) - Number(isActiveTransferNegotiation(a));
      if (activeDiff) return activeDiff;
      return (b.updatedDay || b.createdDay || 0) - (a.updatedDay || a.createdDay || 0);
    })
    .slice(0, Math.max(1, limit));
}

function currentDealCost(negotiation) {
  return money(negotiation.fee) + signingBonus(negotiation.wage, negotiation.years);
}

function validateLiveDeal(world, negotiation, { checkFunds = true } = {}) {
  if (!world || world.sacked) return { ok: false, reason: "经理当前无法处理俱乐部转会" };
  if (world.userClubId !== negotiation.buyerClubId) {
    return { ok: false, reason: "你已不再执教发起报价的俱乐部" };
  }
  if (!isTransferWindowOpen(world)) {
    return { ok: false, reason: `转会窗已关闭：${transferWindowLabel(world)}` };
  }
  const buyer = clubById(world, negotiation.buyerClubId);
  const seller = clubById(world, negotiation.sellerClubId);
  if (!buyer || !seller || buyer.id === seller.id) {
    return { ok: false, reason: "交易俱乐部已不存在" };
  }
  const player = playerAtClub(seller, negotiation.playerId);
  if (!player) return { ok: false, reason: "球员已经离开卖方俱乐部" };
  if (player.loan) return { ok: false, reason: "球员当前处于租借关系，无法完成永久转会" };
  if ((buyer.players || []).length >= MAX_SQUAD) {
    return { ok: false, reason: `买方阵容已满（最多 ${MAX_SQUAD} 人）` };
  }
  if ((seller.players || []).length <= MIN_SELLER_SQUAD) {
    return { ok: false, reason: "卖方一线队人数不足，无法继续出售" };
  }
  if (checkFunds && (Number(buyer.money) || 0) < currentDealCost(negotiation)) {
    return { ok: false, reason: `资金不足，需要 ${formatMoney(currentDealCost(negotiation))}` };
  }
  return { ok: true, buyer, seller, player };
}

/**
 * 提交用户买入报价。条款使用实际金额，不保存球员/俱乐部对象。
 */
export function submitTransferNegotiation(
  world,
  playerId,
  sellerClubId,
  { fee, years = 3, wage, random = Math.random } = {}
) {
  ensureTransferNegotiations(world);
  if (!world || world.sacked) return { ok: false, msg: "你当前无法操作转会" };
  if (!isTransferWindowOpen(world)) {
    return { ok: false, msg: `转会窗已关闭。${transferWindowLabel(world)}` };
  }
  const buyer = clubById(world, world.userClubId);
  const seller = clubById(world, sellerClubId);
  if (!buyer || !seller || buyer.id === seller.id) return { ok: false, msg: "无效的卖方俱乐部" };
  const player = playerAtClub(seller, playerId);
  if (!player) return { ok: false, msg: "球员已不在该俱乐部" };
  if (player.loan) return { ok: false, msg: "租借球员不可进行永久转会谈判" };
  if (findActiveTransferNegotiation(world, playerId)) {
    return { ok: false, msg: "该球员已有一项进行中的买入谈判" };
  }
  if ((buyer.players || []).length >= MAX_SQUAD) return { ok: false, msg: "阵容已满（最多 28 人）" };
  if ((seller.players || []).length <= MIN_SELLER_SQUAD) {
    return { ok: false, msg: "对方一线队人数不足，拒绝开启谈判" };
  }

  const offeredFee = money(fee);
  const contractYears = clamp(Math.round(Number(years) || 3), 1, 5);
  const offeredWage = money(wage);
  if (offeredFee <= 0) return { ok: false, msg: "转会费报价必须大于 0" };
  if (offeredWage <= 0) return { ok: false, msg: "合同周薪必须大于 0" };
  const bonus = signingBonus(offeredWage, contractYears);
  if ((Number(buyer.money) || 0) < offeredFee + bonus) {
    return {
      ok: false,
      msg: `资金不足：报价与签约奖合计需要 ${formatMoney(offeredFee + bonus)}`,
    };
  }

  const negotiation = {
    id: negotiationId(world),
    kind: "user_buy",
    season: world.season,
    playerId,
    buyerClubId: buyer.id,
    sellerClubId: seller.id,
    initialFee: offeredFee,
    fee: offeredFee,
    initialYears: contractYears,
    years: contractYears,
    initialWage: offeredWage,
    wage: offeredWage,
    signingBonus: bonus,
    status: "club_review",
    createdDay: world.day || 0,
    updatedDay: world.day || 0,
    decisionDay: nextDecisionDay(world, random),
    revision: 1,
    clubCounterCount: 0,
    playerCounterCount: 0,
    reason: null,
    rejectedBy: null,
    finishedDay: null,
  };
  world.transferNegotiations.unshift(negotiation);
  if (world.transferNegotiations.length > MAX_HISTORY) {
    const active = world.transferNegotiations.filter(isActiveTransferNegotiation);
    const history = world.transferNegotiations.filter((item) => !isActiveTransferNegotiation(item));
    world.transferNegotiations = [...active, ...history.slice(0, Math.max(0, MAX_HISTORY - active.length))];
  }
  return {
    ok: true,
    msg: `已向 ${seller.name} 提交对 ${player.name} 的报价，预计 1–2 天答复`,
    negotiation,
  };
}

function sellerAskingFee(seller, player) {
  const value = Math.max(1, Number(player.value) || estimateValue(player));
  const lineup = new Set(seller.tactics?.lineup || []);
  const samePosition = (seller.players || []).filter((candidate) => candidate.pos === player.pos).length;
  ensureContract(player);
  let factor = 1.05;
  if (lineup.has(player.id)) factor += 0.12;
  if (samePosition <= 3) factor += 0.08;
  if ((seller.players || []).length <= 17) factor += 0.1;
  if ((player.contractYears || 0) <= 1) factor -= 0.15;
  if ((player.contractYears || 0) >= 4) factor += 0.05;
  if ((player.age || 0) >= 32) factor -= 0.08;
  if ((player.morale || 70) <= 50) factor -= 0.06;
  return Math.round(value * clamp(factor, 0.78, 1.38));
}

function processClubReview(world, negotiation, live, random) {
  const asking = sellerAskingFee(live.seller, live.player);
  const acceptanceLine = asking * (0.96 + random() * 0.04);
  if (negotiation.fee >= acceptanceLine) {
    setStatus(world, negotiation, "player_review", {
      decisionDay: nextDecisionDay(world, random),
      reason: "卖方俱乐部已接受转会费报价，等待球员审核合同",
    });
    return;
  }
  if (negotiation.fee >= asking * 0.68 && (negotiation.clubCounterCount || 0) < 2) {
    const counterFee = Math.max(
      negotiation.fee + 1,
      Math.round(asking * (0.98 + random() * 0.04))
    );
    setStatus(world, negotiation, "club_counter", {
      fee: counterFee,
      signingBonus: signingBonus(negotiation.wage, negotiation.years),
      clubCounterCount: (negotiation.clubCounterCount || 0) + 1,
      decisionDay: null,
      reason: `卖方认为球员的阵容地位与合同情况对应 ${formatMoney(counterFee)} 的转会费`,
    });
    return;
  }
  stopNegotiation(
    world,
    negotiation,
    "rejected",
    `卖方拒绝报价：${formatMoney(negotiation.fee)} 明显低于其基于球员价值、合同与阵容地位的估价`,
    "club"
  );
}

function playerContractDemand(buyer, seller, player, years) {
  ensureContract(player);
  const marketWage = Math.max(1, estimateWage(player));
  const currentWage = Math.max(1, Number(player.wage) || marketWage);
  let factor = 1;
  const buyerPower = Math.max(1, Number(buyer.power) || 1);
  const sellerPower = Math.max(1, Number(seller.power) || 1);
  if (buyerPower < sellerPower) factor += clamp((sellerPower - buyerPower) / sellerPower, 0, 0.12);
  if (buyerPower > sellerPower) factor -= clamp((buyerPower - sellerPower) / buyerPower, 0, 0.05);
  const minYears = (player.age || 0) <= 27 ? 3 : (player.age || 0) <= 30 ? 2 : 1;
  if (years < minYears) factor += 0.05 * (minYears - years);
  return {
    wage: Math.round(Math.max(marketWage * 0.98, currentWage * 1.02) * factor),
    years: Math.max(years, minYears),
  };
}

function completeNegotiation(world, negotiation) {
  const live = validateLiveDeal(world, negotiation);
  if (!live.ok) {
    stopNegotiation(world, negotiation, "cancelled", live.reason);
    return { ok: false, msg: live.reason, negotiation };
  }
  const { buyer, seller, player } = live;
  const sellerIndex = seller.players.findIndex((candidate) => candidate.id === player.id);
  if (sellerIndex < 0) {
    stopNegotiation(world, negotiation, "cancelled", "球员已经离开卖方俱乐部");
    return { ok: false, msg: negotiation.reason, negotiation };
  }

  const fee = money(negotiation.fee);
  const bonus = signingBonus(negotiation.wage, negotiation.years);
  buyer.money -= fee + bonus;
  seller.money = (Number(seller.money) || 0) + fee;
  if (!buyer.finance || typeof buyer.finance !== "object") buyer.finance = {};
  if (!seller.finance || typeof seller.finance !== "object") seller.finance = {};
  buyer.finance.seasonTransferNet = (Number(buyer.finance.seasonTransferNet) || 0) - fee - bonus;
  seller.finance.seasonTransferNet = (Number(seller.finance.seasonTransferNet) || 0) + fee;

  seller.players.splice(sellerIndex, 1);
  player.clubId = buyer.id;
  player.morale = Math.min(100, (Number(player.morale) || 70) + 8);
  player.number = null;
  player.contractYears = negotiation.years;
  player.wage = negotiation.wage;
  player._needsRenew = false;
  player.value = estimateValue(player);
  buyer.players.push(player);
  assignSquadNumbers(buyer);
  autoLineup(seller);
  autoLineup(buyer);

  negotiation.signingBonus = bonus;
  setStatus(world, negotiation, "completed", {
    decisionDay: null,
    finishedDay: world.day || 0,
    reason: "俱乐部与球员均已接受条款，转会完成",
  });
  if (!Array.isArray(world.news)) world.news = [];
  world.news.unshift({
    day: world.day,
    text: `✍️ 转会：签下 ${player.name}（${POS_LABEL[player.pos] || player.pos}），转会费 ${formatMoney(fee)} · ${negotiation.years} 年合同 · 周薪 ${formatMoney(negotiation.wage)}`,
  });
  mediaTransfer(world, {
    type: "buy",
    playerName: player.name,
    clubName: buyer.name,
    otherName: seller.name,
    feeText: formatMoney(fee),
  });
  return {
    ok: true,
    msg: `成功签下 ${player.name}：转会费 ${formatMoney(fee)} + 签约奖 ${formatMoney(bonus)}`,
    negotiation,
  };
}

function processPlayerReview(world, negotiation, live, random) {
  const demand = playerContractDemand(
    live.buyer,
    live.seller,
    live.player,
    negotiation.years
  );
  const acceptanceLine = demand.wage * (0.96 + random() * 0.04);
  if (negotiation.wage >= acceptanceLine && negotiation.years >= demand.years) {
    return completeNegotiation(world, negotiation);
  }
  if (negotiation.wage >= demand.wage * 0.7 && (negotiation.playerCounterCount || 0) < 2) {
    const counterWage = Math.max(
      negotiation.wage + 1,
      Math.round(demand.wage * (1 + random() * 0.03))
    );
    setStatus(world, negotiation, "player_counter", {
      wage: counterWage,
      years: demand.years,
      signingBonus: signingBonus(counterWage, demand.years),
      playerCounterCount: (negotiation.playerCounterCount || 0) + 1,
      decisionDay: null,
      reason: `球员根据现有薪资、市场工资、合同年限与两队竞技水平提出新合同`,
    });
    return { ok: true, negotiation };
  }
  stopNegotiation(
    world,
    negotiation,
    "rejected",
    `球员拒绝合同：周薪 ${formatMoney(negotiation.wage)} 与其现有薪资和市场水平差距过大`,
    "player"
  );
  return { ok: false, negotiation };
}

/** 每日处理到期的俱乐部/球员审核。 */
export function processTransferNegotiationsDay(world, { random = Math.random } = {}) {
  const events = [];
  for (const negotiation of ensureTransferNegotiations(world)) {
    if (!isActiveTransferNegotiation(negotiation)) continue;
    const live = validateLiveDeal(world, negotiation);
    if (!live.ok) {
      stopNegotiation(world, negotiation, "cancelled", live.reason);
      events.push({ id: negotiation.id, status: negotiation.status, reason: negotiation.reason });
      continue;
    }
    if (negotiation.status === "club_counter" || negotiation.status === "player_counter") continue;
    if ((world.day || 0) < (negotiation.decisionDay || 0)) continue;
    if (negotiation.status === "club_review") {
      processClubReview(world, negotiation, live, random);
    } else if (negotiation.status === "player_review") {
      processPlayerReview(world, negotiation, live, random);
    }
    events.push({ id: negotiation.id, status: negotiation.status, reason: negotiation.reason });
  }
  return events;
}

/** 处理信箱中的俱乐部或球员还价。 */
export function respondTransferNegotiation(world, negotiationId, actionId, { random = Math.random } = {}) {
  const negotiation = ensureTransferNegotiations(world).find((item) => item.id === negotiationId);
  if (!negotiation) return { ok: false, msg: "谈判不存在" };
  if (actionId === "withdraw") {
    if (!isActiveTransferNegotiation(negotiation)) {
      return { ok: false, msg: "该谈判已经结束" };
    }
    stopNegotiation(world, negotiation, "cancelled", "你撤回了报价");
    negotiation.userHandledRevision = negotiation.revision;
    return { ok: true, msg: "已撤回报价，谈判结束", negotiation };
  }
  if (actionId === "reject") {
    if (negotiation.status !== "club_counter" && negotiation.status !== "player_counter") {
      return { ok: false, msg: "该谈判当前无需回应" };
    }
    stopNegotiation(world, negotiation, "cancelled", "你拒绝了对方提出的还价");
    negotiation.userHandledRevision = negotiation.revision;
    return { ok: true, msg: "已拒绝还价，谈判结束", negotiation };
  }
  if (actionId !== "accept") return { ok: false, msg: "未知谈判操作" };

  const live = validateLiveDeal(world, negotiation);
  if (!live.ok) {
    stopNegotiation(world, negotiation, "cancelled", live.reason);
    return { ok: false, msg: live.reason, negotiation };
  }
  if (negotiation.status === "club_counter") {
    setStatus(world, negotiation, "player_review", {
      decisionDay: nextDecisionDay(world, random),
      reason: "你已接受卖方还价，等待球员审核合同",
    });
    negotiation.userHandledRevision = negotiation.revision;
    return { ok: true, msg: "已接受俱乐部还价，球员将在 1–2 天内答复合同", negotiation };
  }
  if (negotiation.status === "player_counter") {
    const result = completeNegotiation(world, negotiation);
    if (result.ok) negotiation.userHandledRevision = negotiation.revision;
    return result;
  }
  return { ok: false, msg: "该谈判当前无需回应" };
}
