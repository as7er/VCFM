/** Staged renewals and loans using live club/player objects throughout. */

import { estimateValue, estimateWage, formatMoney } from "./models.js";
import { ensureContract, renewPlayer } from "./contracts.js";
import { loanInPlayer, loanOutPlayer, loanUntilDay } from "./loans.js";
import { isTransferWindowOpen, transferWindowLabel } from "./transfers.js";
import { shouldBuyPosition } from "./squad-balance.js";
import { clubTransferBudget } from "./club-finance.js";
import {
  ACTIVE_DEAL_NEGOTIATION_STATUSES,
  ACTIVE_TRANSFER_NEGOTIATION_STATUSES,
  activeDealCashCommitments,
  activeTransferCashCommitments,
  clubCashAvailability,
  dealNegotiationCashCost,
} from "./cash-reservations.js";

export { ACTIVE_DEAL_NEGOTIATION_STATUSES, dealNegotiationCashCost };

const MAX_HISTORY = 60;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function money(value) {
  return Math.max(0, Math.round(Number(value) || 0));
}

function clubById(world, id) {
  return world?.clubs?.find((club) => club.id === id) || null;
}

function playerAtClub(club, playerId) {
  return club?.players?.find((player) => player.id === playerId) || null;
}

function hasTransferEmbargo(club) {
  return !!(club?.finance?.debtPlan?.transferEmbargo || club?.finance?.compliance?.transferEmbargo);
}

function nextDecisionDay(world, random = Math.random) {
  return (world.day || 0) + (random() < 0.5 ? 1 : 2);
}

function negotiationId(world) {
  const serial = (Number(world._dealNegotiationSerial) || 0) + 1;
  world._dealNegotiationSerial = serial;
  return `dn_${world.season || 0}_${world.day || 0}_${serial}`;
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

function trimHistory(world) {
  if (world.dealNegotiations.length <= MAX_HISTORY) return;
  const active = world.dealNegotiations.filter(isActiveDealNegotiation);
  const history = world.dealNegotiations.filter((item) => !isActiveDealNegotiation(item));
  world.dealNegotiations = [...active, ...history.slice(0, Math.max(0, MAX_HISTORY - active.length))];
}

export function ensureDealNegotiations(world) {
  if (!world) return [];
  if (!Array.isArray(world.dealNegotiations)) world.dealNegotiations = [];
  if (!Number.isFinite(Number(world._dealNegotiationSerial))) {
    world._dealNegotiationSerial = world.dealNegotiations.length;
  }
  return world.dealNegotiations;
}

export function isActiveDealNegotiation(negotiation) {
  return !!negotiation && ACTIVE_DEAL_NEGOTIATION_STATUSES.has(negotiation.status);
}

export function findActiveDealNegotiation(world, playerId, kind = null) {
  return ensureDealNegotiations(world).find(
    (negotiation) =>
      negotiation.playerId === playerId &&
      (!kind || negotiation.kind === kind) &&
      isActiveDealNegotiation(negotiation)
  ) || null;
}

export function listDealNegotiations(world, { limit = 16 } = {}) {
  return ensureDealNegotiations(world)
    .slice()
    .sort((a, b) => {
      const activeDiff = Number(isActiveDealNegotiation(b)) - Number(isActiveDealNegotiation(a));
      if (activeDiff) return activeDiff;
      return (b.updatedDay || b.createdDay || 0) - (a.updatedDay || a.createdDay || 0);
    })
    .slice(0, Math.max(1, limit));
}

export function cancelActiveDealNegotiations(world, reason = "赛季已结束，谈判自动关闭") {
  for (const negotiation of ensureDealNegotiations(world)) {
    if (isActiveDealNegotiation(negotiation)) {
      stopNegotiation(world, negotiation, "cancelled", reason);
    }
  }
}

function hasPermanentTransferTalk(world, playerId) {
  return (world.transferNegotiations || []).some(
    (negotiation) =>
      negotiation.playerId === playerId &&
      ACTIVE_TRANSFER_NEGOTIATION_STATUSES.has(negotiation.status)
  );
}

function renewalBonus(wage, years) {
  return Math.round(money(wage) * 4 * clamp(Math.round(Number(years) || 1), 1, 5) * 0.15);
}

function renewalDemand(player, years) {
  ensureContract(player);
  const age = Number(player.age) || 25;
  const maxYears = age >= 34 ? 1 : age >= 32 ? 2 : 5;
  const minYears = age <= 27 ? 3 : age <= 31 ? 2 : 1;
  const wantedYears = clamp(Math.max(years, minYears), 1, maxYears);
  const current = Math.max(1, Number(player.wage) || estimateWage(player));
  const market = Math.max(1, estimateWage(player));
  const moraleFactor = (player.morale || 70) <= 50 ? 1.06 : 1;
  const statusFactor = (player.ovr || 0) >= 15 ? 1.08 : 1;
  const yearFactor = 1 + Math.max(0, wantedYears - 2) * 0.03;
  return {
    years: wantedYears,
    wage: Math.round(Math.max(current * 1.03, market * 1.05) * moraleFactor * statusFactor * yearFactor),
  };
}

function validateRenewal(world, negotiation, { checkFunds = true } = {}) {
  if (!world || world.sacked) return { ok: false, reason: "经理当前无法处理续约" };
  if (world.userClubId !== negotiation.clubId) return { ok: false, reason: "你已不再执教发起续约的俱乐部" };
  const club = clubById(world, negotiation.clubId);
  const player = playerAtClub(club, negotiation.playerId);
  if (!club || !player) return { ok: false, reason: "球员已不在俱乐部" };
  if (player.loan) return { ok: false, reason: "租借球员的合同由母队管理" };
  if (hasPermanentTransferTalk(world, player.id)) {
    return { ok: false, reason: "球员已有进行中的永久转会谈判" };
  }
  if (checkFunds) {
    const cash = clubCashAvailability(world, club, negotiation.signingBonus, {
      excludeDealId: negotiation.id,
    });
    if (!cash.ok) return { ok: false, reason: `未承诺现金不足，签约奖需要 ${formatMoney(negotiation.signingBonus)}` };
  }
  return { ok: true, club, player };
}

export function submitRenewalNegotiation(
  world,
  playerId,
  { years = 3, wage, random = Math.random } = {}
) {
  ensureDealNegotiations(world);
  const club = clubById(world, world?.userClubId);
  const player = playerAtClub(club, playerId);
  if (!club || !player) return { ok: false, msg: "球员不在你的阵容中" };
  if (player.loan) return { ok: false, msg: "租借球员无法续约" };
  if (findActiveDealNegotiation(world, playerId)) return { ok: false, msg: "该球员已有进行中的合同或租借谈判" };
  if (hasPermanentTransferTalk(world, playerId)) return { ok: false, msg: "该球员已有进行中的永久转会谈判" };
  ensureContract(player);
  const maxYears = (player.age || 0) >= 34 ? 1 : (player.age || 0) >= 32 ? 2 : 5;
  const contractYears = clamp(Math.round(Number(years) || 3), 1, maxYears);
  const offeredWage = money(wage);
  if (offeredWage <= 0) return { ok: false, msg: "周薪报价必须大于 0" };
  const bonus = renewalBonus(offeredWage, contractYears);
  const cash = clubCashAvailability(world, club, bonus);
  if (!cash.ok) return { ok: false, msg: `未承诺现金不足，签约奖需要 ${formatMoney(bonus)}` };
  const negotiation = {
    id: negotiationId(world),
    kind: "renewal",
    season: world.season,
    playerId,
    playerName: player.name,
    clubId: club.id,
    payerClubId: club.id,
    initialYears: contractYears,
    years: contractYears,
    initialWage: offeredWage,
    wage: offeredWage,
    signingBonus: bonus,
    status: "party_review",
    createdDay: world.day || 0,
    updatedDay: world.day || 0,
    decisionDay: nextDecisionDay(world, random),
    revision: 1,
    counterCount: 0,
    reason: "球员与经纪人正在审核合同年限、周薪和签约奖",
    rejectedBy: null,
    finishedDay: null,
  };
  world.dealNegotiations.unshift(negotiation);
  trimHistory(world);
  return { ok: true, msg: `已向 ${player.name} 提交续约报价，预计 1–2 天答复`, negotiation };
}

function completeRenewal(world, negotiation) {
  const live = validateRenewal(world, negotiation);
  if (!live.ok) {
    stopNegotiation(world, negotiation, "cancelled", live.reason);
    return { ok: false, msg: live.reason, negotiation };
  }
  const result = renewPlayer(live.club, live.player, {
    years: negotiation.years,
    newWage: negotiation.wage,
    fee: negotiation.signingBonus,
    negotiationId: negotiation.id,
  }, world);
  if (!result.ok) {
    stopNegotiation(world, negotiation, "cancelled", result.msg);
    return { ...result, negotiation };
  }
  setStatus(world, negotiation, "completed", {
    decisionDay: null,
    finishedDay: world.day || 0,
    reason: "球员与俱乐部已签署新合同",
  });
  world.news = world.news || [];
  world.news.unshift({ day: world.day, text: `📝 ${result.msg}` });
  return { ...result, negotiation };
}

function processRenewalReview(world, negotiation, live, random) {
  const demand = renewalDemand(live.player, negotiation.years);
  const acceptance = demand.wage * (0.97 + random() * 0.03);
  if (negotiation.years >= demand.years && negotiation.wage >= acceptance) {
    return completeRenewal(world, negotiation);
  }
  if (negotiation.wage >= demand.wage * 0.72 && (negotiation.counterCount || 0) < 2) {
    const wage = Math.max(negotiation.wage + 1, Math.round(demand.wage * (1 + random() * 0.025)));
    const years = demand.years;
    setStatus(world, negotiation, "party_counter", {
      years,
      wage,
      signingBonus: renewalBonus(wage, years),
      counterCount: (negotiation.counterCount || 0) + 1,
      decisionDay: null,
      reason: "球员根据现薪、市场工资、年龄与合同长度提出还价",
    });
    return { ok: true, negotiation };
  }
  stopNegotiation(world, negotiation, "rejected", "球员认为续约报价明显低于合理合同水平", "player");
  return { ok: false, negotiation };
}

function validateLoan(world, negotiation, { checkFunds = true } = {}) {
  if (!world || world.sacked) return { ok: false, reason: "经理当前无法处理租借" };
  if (!isTransferWindowOpen(world)) return { ok: false, reason: `转会窗已关闭：${transferWindowLabel(world)}` };
  if (world.userClubId !== negotiation.userClubId) return { ok: false, reason: "你已不再执教发起租借的俱乐部" };
  const owner = clubById(world, negotiation.ownerClubId);
  const host = clubById(world, negotiation.hostClubId);
  const player = playerAtClub(owner, negotiation.playerId);
  if (!owner || !player) return { ok: false, reason: "球员已不在母队" };
  if (player.loan) return { ok: false, reason: "球员已经处于租借关系" };
  if (hasPermanentTransferTalk(world, player.id)) {
    return { ok: false, reason: "球员已有进行中的永久转会谈判" };
  }
  if (owner.players.length <= 14) return { ok: false, reason: "母队阵容过少，无法外租" };
  if (player.pos === "GK" && owner.players.filter((candidate) => candidate.pos === "GK" && candidate.id !== player.id).length < 1) {
    return { ok: false, reason: "母队不能外租最后一名门将" };
  }
  if (host && host.players.length >= 28) return { ok: false, reason: "租入方阵容已满" };
  if (!host && negotiation.kind !== "loan_out") return { ok: false, reason: "租入方俱乐部已不存在" };
  if (host && hasTransferEmbargo(host)) return { ok: false, reason: "租入方处于财政转会限制期" };
  if (checkFunds && negotiation.payerClubId) {
    const payer = clubById(world, negotiation.payerClubId);
    if (!payer) return { ok: false, reason: "支付租借费的俱乐部已不存在" };
    if (payer.id !== world.userClubId) {
      const otherDeals = activeDealCashCommitments(world, payer.id, { excludeId: negotiation.id });
      const otherTransfers = activeTransferCashCommitments(world, payer.id);
      if (clubTransferBudget(world, payer) - otherDeals - otherTransfers < negotiation.fee) {
        return { ok: false, reason: `租入方扣除运营储备与其他谈判后无法承担 ${formatMoney(negotiation.fee)}` };
      }
    } else {
      const cash = clubCashAvailability(world, payer, negotiation.fee, {
        excludeDealId: negotiation.id,
      });
      if (!cash.ok) return { ok: false, reason: `支付方未承诺现金不足，租借费需要 ${formatMoney(negotiation.fee)}` };
    }
  }
  return { ok: true, owner, host, player };
}

export function submitLoanNegotiation(
  world,
  kind,
  playerId,
  otherClubId = null,
  { term = "half", fee, wageShare, random = Math.random } = {}
) {
  ensureDealNegotiations(world);
  if (kind !== "loan_in" && kind !== "loan_out") return { ok: false, msg: "无效租借类型" };
  if (!world || world.sacked) return { ok: false, msg: "你当前无法操作租借" };
  if (!isTransferWindowOpen(world)) return { ok: false, msg: `转会窗已关闭：${transferWindowLabel(world)}` };
  if (findActiveDealNegotiation(world, playerId)) return { ok: false, msg: "该球员已有进行中的合同或租借谈判" };
  if (hasPermanentTransferTalk(world, playerId)) return { ok: false, msg: "该球员已有进行中的永久转会谈判" };
  const user = clubById(world, world.userClubId);
  const owner = kind === "loan_out" ? user : clubById(world, otherClubId);
  const host = kind === "loan_in" ? user : null;
  const player = playerAtClub(owner, playerId);
  if (!user || !owner || !player) return { ok: false, msg: "俱乐部或球员不存在" };
  if (player.loan) return { ok: false, msg: "球员已经处于租借关系" };
  const loanTerm = term === "season" ? "season" : "half";
  const offeredFee = money(fee);
  const offeredShare = clamp(Number(wageShare) || 0.75, 0.5, 1);
  const negotiation = {
    id: negotiationId(world),
    kind,
    season: world.season,
    playerId,
    playerName: player.name,
    userClubId: user.id,
    ownerClubId: owner.id,
    hostClubId: host?.id || null,
    payerClubId: kind === "loan_in" ? user.id : null,
    initialFee: offeredFee,
    fee: offeredFee,
    initialWageShare: offeredShare,
    wageShare: offeredShare,
    term: loanTerm,
    untilDay: loanUntilDay(world, loanTerm),
    status: kind === "loan_in" ? "club_review" : "market_search",
    createdDay: world.day || 0,
    updatedDay: world.day || 0,
    decisionDay: nextDecisionDay(world, random),
    revision: 1,
    counterCount: 0,
    reason: kind === "loan_in" ? "母队正在审核租借费、工资分摊与期限" : "球员已进入租借市场，等待合适俱乐部报价",
    rejectedBy: null,
    finishedDay: null,
  };
  const live = validateLoan(world, negotiation, { checkFunds: kind === "loan_in" });
  if (!live.ok) return { ok: false, msg: live.reason };
  world.dealNegotiations.unshift(negotiation);
  trimHistory(world);
  return {
    ok: true,
    msg: kind === "loan_in"
      ? `已提交对 ${player.name} 的租借报价，预计 1–2 天答复`
      : `${player.name} 已进入租借市场，预计 1–2 天获得反馈`,
    negotiation,
  };
}

function loanClubDemand(player) {
  const value = Math.max(1, Number(player.value) || estimateValue(player));
  return { fee: Math.round(value * 0.065), wageShare: 0.72 };
}

function processLoanInClubReview(world, negotiation, live, random) {
  const demand = loanClubDemand(live.player);
  if (negotiation.fee >= demand.fee * (0.96 + random() * 0.04) && negotiation.wageShare >= demand.wageShare) {
    setStatus(world, negotiation, "player_review", {
      decisionDay: nextDecisionDay(world, random),
      reason: "母队接受租借条款，等待球员评估出场机会",
    });
    return;
  }
  if (negotiation.fee >= demand.fee * 0.65 && negotiation.wageShare >= 0.55 && (negotiation.counterCount || 0) < 2) {
    const fee = Math.max(negotiation.fee + 1, Math.round(demand.fee * (0.98 + random() * 0.04)));
    const wageShare = Math.max(negotiation.wageShare, demand.wageShare);
    setStatus(world, negotiation, "club_counter", {
      fee,
      wageShare,
      counterCount: (negotiation.counterCount || 0) + 1,
      decisionDay: null,
      reason: `母队要求租借费 ${formatMoney(fee)}，并由租入方承担 ${Math.round(wageShare * 100)}% 周薪`,
    });
    return;
  }
  stopNegotiation(world, negotiation, "rejected", "母队拒绝明显偏低的租借费或工资分摊", "club");
}

function findLoanHost(world, negotiation, owner, player, random) {
  const value = Math.max(1, Number(player.value) || estimateValue(player));
  const askingFee = money(negotiation.fee);
  const candidates = [];
  for (const host of world.clubs || []) {
    if (host.id === owner.id || host.players.length >= 26 || hasTransferEmbargo(host)) continue;
    const need = shouldBuyPosition(host.players || [], player.pos);
    const offerFee = Math.min(askingFee, Math.round(value * (0.045 + random() * 0.04 + (need ? 0.015 : 0))));
    const wageShare = clamp(0.62 + random() * 0.28 + (need ? 0.06 : 0), 0.5, 1);
    const otherDeals = activeDealCashCommitments(world, host.id, { excludeId: negotiation.id });
    const otherTransfers = activeTransferCashCommitments(world, host.id);
    if (clubTransferBudget(world, host) - otherDeals - otherTransfers < offerFee) continue;
    const score = (need ? 5 : 0) + ((owner.division || 3) - (host.division || 3)) * 0.4 + random() * 2;
    candidates.push({ host, fee: offerFee, wageShare, score });
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0] || null;
}

function processLoanOutMarket(world, negotiation, live, random) {
  const offer = findLoanHost(world, negotiation, live.owner, live.player, random);
  if (!offer) {
    stopNegotiation(world, negotiation, "rejected", "租借市场没有兼具阵容需求和支付能力的俱乐部", "market");
    return;
  }
  setStatus(world, negotiation, "offer_review", {
    hostClubId: offer.host.id,
    payerClubId: offer.host.id,
    fee: offer.fee,
    wageShare: offer.wageShare,
    buyerOfferFee: offer.fee,
    buyerOfferWageShare: offer.wageShare,
    decisionDay: null,
    reason: `${offer.host.name} 提交正式租借报价`,
  });
}

function processLoanOutBuyerReview(world, negotiation, live, random) {
  const value = Math.max(1, Number(live.player.value) || estimateValue(live.player));
  const need = shouldBuyPosition(live.host.players || [], live.player.pos);
  const maxFee = Math.round(value * (0.075 + (need ? 0.025 : 0)));
  const minShare = need ? 0.62 : 0.72;
  if (negotiation.fee <= maxFee && negotiation.wageShare >= minShare) {
    setStatus(world, negotiation, "player_review", {
      decisionDay: nextDecisionDay(world, random),
      reason: "租入方接受还价，等待球员评估出场机会",
    });
    return;
  }
  if ((negotiation.counterCount || 0) <= 2) {
    const fee = Math.max(negotiation.buyerOfferFee || 0, Math.min(maxFee, Math.round((negotiation.fee + maxFee) / 2)));
    const wageShare = Math.max(minShare, Math.min(negotiation.wageShare, negotiation.buyerOfferWageShare || minShare));
    setStatus(world, negotiation, "offer_review", {
      fee,
      wageShare,
      buyerOfferFee: fee,
      buyerOfferWageShare: wageShare,
      decisionDay: null,
      reason: `租入方还价：租借费 ${formatMoney(fee)}，承担 ${Math.round(wageShare * 100)}% 周薪`,
    });
    return;
  }
  stopNegotiation(world, negotiation, "rejected", "租入方拒绝超出其预算或工资分摊意愿的还价", "buyer");
}

function playerAcceptsLoan(negotiation, owner, host, player, random) {
  let chance = shouldBuyPosition(host.players || [], player.pos) ? 0.9 : 0.68;
  if ((host.division || 3) > (owner.division || 3)) chance -= 0.12;
  if ((player.age || 0) <= 23) chance += 0.06;
  if ((player.morale || 70) <= 50) chance += 0.08;
  return random() < clamp(chance, 0.35, 0.98);
}

function completeLoan(world, negotiation) {
  const live = validateLoan(world, negotiation);
  if (!live.ok) {
    stopNegotiation(world, negotiation, "cancelled", live.reason);
    return { ok: false, msg: live.reason, negotiation };
  }
  const options = {
    term: negotiation.term,
    fee: negotiation.fee,
    wageShare: negotiation.wageShare,
    negotiationId: negotiation.id,
  };
  const result = negotiation.kind === "loan_in"
    ? loanInPlayer(world, negotiation.playerId, negotiation.ownerClubId, options)
    : loanOutPlayer(world, negotiation.playerId, { ...options, toClubId: negotiation.hostClubId });
  if (!result.ok) {
    stopNegotiation(world, negotiation, "cancelled", result.msg);
    return { ...result, negotiation };
  }
  setStatus(world, negotiation, "completed", {
    decisionDay: null,
    finishedDay: world.day || 0,
    reason: "母队、租入方与球员均已接受条款，租借生效",
  });
  return { ...result, negotiation };
}

function processLoanPlayerReview(world, negotiation, live, random) {
  if (playerAcceptsLoan(negotiation, live.owner, live.host, live.player, random)) {
    return completeLoan(world, negotiation);
  }
  stopNegotiation(world, negotiation, "rejected", "球员认为预期出场时间或竞技环境不适合本次租借", "player");
  return { ok: false, negotiation };
}

export function processDealNegotiationsDay(world, { random = Math.random } = {}) {
  const events = [];
  for (const negotiation of ensureDealNegotiations(world)) {
    if (!isActiveDealNegotiation(negotiation)) continue;
    if (negotiation.kind === "renewal") {
      const live = validateRenewal(world, negotiation);
      if (!live.ok) {
        stopNegotiation(world, negotiation, "cancelled", live.reason);
      } else if (negotiation.status === "party_review" && (world.day || 0) >= (negotiation.decisionDay || 0)) {
        processRenewalReview(world, negotiation, live, random);
      }
    } else {
      const live = validateLoan(world, negotiation);
      if (!live.ok) {
        stopNegotiation(world, negotiation, "cancelled", live.reason);
      } else if ((world.day || 0) >= (negotiation.decisionDay || 0)) {
        if (negotiation.kind === "loan_in" && negotiation.status === "club_review") {
          processLoanInClubReview(world, negotiation, live, random);
        } else if (negotiation.kind === "loan_out" && negotiation.status === "market_search") {
          processLoanOutMarket(world, negotiation, live, random);
        } else if (negotiation.kind === "loan_out" && negotiation.status === "buyer_review") {
          processLoanOutBuyerReview(world, negotiation, live, random);
        } else if (negotiation.status === "player_review") {
          processLoanPlayerReview(world, negotiation, live, random);
        }
      }
    }
    events.push({ id: negotiation.id, status: negotiation.status, reason: negotiation.reason });
  }
  return events;
}

export function respondDealNegotiation(
  world,
  negotiationId,
  actionId,
  { random = Math.random, fee = null, wageShare = null } = {}
) {
  const negotiation = ensureDealNegotiations(world).find((item) => item.id === negotiationId);
  if (!negotiation) return { ok: false, msg: "谈判不存在" };
  if (actionId === "withdraw") {
    if (!isActiveDealNegotiation(negotiation)) return { ok: false, msg: "该谈判已经结束" };
    stopNegotiation(world, negotiation, "cancelled", "你撤回了报价或挂牌");
    negotiation.userHandledRevision = negotiation.revision;
    return { ok: true, msg: "已撤回，谈判结束", negotiation };
  }
  if (actionId === "reject") {
    const actionable = negotiation.status === "party_counter" || negotiation.status === "club_counter" || negotiation.status === "offer_review";
    if (!actionable) return { ok: false, msg: "该谈判当前无需回应" };
    stopNegotiation(world, negotiation, "cancelled", "你拒绝了对方条款");
    negotiation.userHandledRevision = negotiation.revision;
    return { ok: true, msg: "已拒绝条款，谈判结束", negotiation };
  }
  if (actionId === "counter") {
    if (negotiation.kind !== "loan_out" || negotiation.status !== "offer_review") {
      return { ok: false, msg: "当前不能还价" };
    }
    const counterFee = money(fee);
    const counterShare = clamp(Number(wageShare) || negotiation.wageShare, 0.5, 1);
    if (counterFee < negotiation.fee && counterShare <= negotiation.wageShare) {
      return { ok: false, msg: "还价必须提高租借费或工资承担比例" };
    }
    setStatus(world, negotiation, "buyer_review", {
      fee: counterFee,
      wageShare: counterShare,
      counterCount: (negotiation.counterCount || 0) + 1,
      decisionDay: (world.day || 0) + 1,
      reason: `你要求租借费 ${formatMoney(counterFee)}，由租入方承担 ${Math.round(counterShare * 100)}% 周薪`,
    });
    negotiation.userHandledRevision = negotiation.revision;
    return { ok: true, msg: "已提交租借还价，预计 1 天答复", negotiation };
  }
  if (actionId !== "accept") return { ok: false, msg: "未知谈判操作" };

  if (negotiation.kind === "renewal" && negotiation.status === "party_counter") {
    const live = validateRenewal(world, negotiation);
    if (!live.ok) {
      stopNegotiation(world, negotiation, "cancelled", live.reason);
      return { ok: false, msg: live.reason, negotiation };
    }
    const result = completeRenewal(world, negotiation);
    if (result.ok) negotiation.userHandledRevision = negotiation.revision;
    return result;
  }
  if (negotiation.kind === "loan_in" && negotiation.status === "club_counter") {
    const live = validateLoan(world, negotiation);
    if (!live.ok) {
      stopNegotiation(world, negotiation, "cancelled", live.reason);
      return { ok: false, msg: live.reason, negotiation };
    }
    setStatus(world, negotiation, "player_review", {
      decisionDay: nextDecisionDay(world, random),
      reason: "你已接受母队还价，等待球员评估出场机会",
    });
    negotiation.userHandledRevision = negotiation.revision;
    return { ok: true, msg: "已接受母队还价，球员将在 1–2 天内答复", negotiation };
  }
  if (negotiation.kind === "loan_out" && negotiation.status === "offer_review") {
    const live = validateLoan(world, negotiation);
    if (!live.ok) {
      stopNegotiation(world, negotiation, "cancelled", live.reason);
      return { ok: false, msg: live.reason, negotiation };
    }
    setStatus(world, negotiation, "player_review", {
      decisionDay: nextDecisionDay(world, random),
      reason: "你已接受租入方报价，等待球员评估出场机会",
    });
    negotiation.userHandledRevision = negotiation.revision;
    return { ok: true, msg: "已接受租借报价，球员将在 1–2 天内答复", negotiation };
  }
  return { ok: false, msg: "该谈判当前无需回应" };
}
