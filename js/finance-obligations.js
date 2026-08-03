/** Scheduled and conditional cash obligations shared by user and AI clubs. */

import { recordFinanceEntry } from "./finance-ledger.js";

export const FINANCE_OBLIGATIONS_VERSION = 1;
export const FINANCE_SEASON_DAYS = 220;

function money(value) {
  return Math.max(0, Math.round(Number(value) || 0));
}

function clubById(world, id) {
  return world?.clubs?.find((club) => club.id === id) || null;
}

function nextId(world) {
  world._financeObligationSerial = (Number(world._financeObligationSerial) || 0) + 1;
  return `fo_${world.season || 0}_${world.day || 0}_${world._financeObligationSerial}`;
}

function normalizedDate(season, day) {
  let dueSeason = Math.max(1, Math.round(Number(season) || 1));
  let dueDay = Math.max(1, Math.round(Number(day) || 1));
  while (dueDay > FINANCE_SEASON_DAYS) {
    dueDay -= FINANCE_SEASON_DAYS;
    dueSeason += 1;
  }
  return { dueSeason, dueDay };
}

function dateReached(world, obligation) {
  const season = Number(world?.season) || 0;
  const day = Number(world?.day) || 0;
  return season > obligation.dueSeason ||
    (season === obligation.dueSeason && day >= obligation.dueDay);
}

export function ensureFinanceObligations(world) {
  if (!world) return [];
  if (!Array.isArray(world.financeObligations)) world.financeObligations = [];
  if (!Number.isFinite(Number(world._financeObligationSerial))) {
    world._financeObligationSerial = world.financeObligations.length;
  }
  world.financeObligationsVersion = FINANCE_OBLIGATIONS_VERSION;
  return world.financeObligations;
}

export function buildTransferPaymentPlan(fee, upfrontPct = 100, installmentCount = 0) {
  const total = money(fee);
  const count = Math.max(0, Math.min(3, Math.round(Number(installmentCount) || 0)));
  const pct = count > 0
    ? Math.max(30, Math.min(90, Math.round(Number(upfrontPct) || 60)))
    : 100;
  const upfront = count > 0 ? Math.min(total, Math.round(total * pct / 100)) : total;
  const remaining = Math.max(0, total - upfront);
  const installments = [];
  let allocated = 0;
  for (let index = 0; index < count; index++) {
    const amount = index === count - 1
      ? remaining - allocated
      : Math.floor(remaining / count);
    installments.push(Math.max(0, amount));
    allocated += amount;
  }
  return { total, upfrontPct: pct, upfront, installmentCount: count, installments };
}

function createObligation(world, details) {
  const obligations = ensureFinanceObligations(world);
  const obligation = {
    id: details.id || nextId(world),
    kind: details.kind || "scheduled",
    status: "pending",
    payerClubId: details.payerClubId,
    payeeClubId: details.payeeClubId,
    amount: money(details.amount),
    category: details.category || "transfer",
    source: details.source || "scheduled-payment",
    createdSeason: world.season,
    createdDay: world.day,
    dueSeason: details.dueSeason ?? null,
    dueDay: details.dueDay ?? null,
    playerId: details.playerId || null,
    triggerClubId: details.triggerClubId || null,
    target: Math.max(0, Math.round(Number(details.target) || 0)),
    progress: Math.max(0, Math.round(Number(details.progress) || 0)),
    label: details.label || "",
    meta: details.meta ? structuredClone(details.meta) : {},
  };
  obligations.push(obligation);
  return obligation;
}

function validSellOnClause(clause, sellerClubId) {
  return clause &&
    clause.debtorClubId === sellerClubId &&
    clause.beneficiaryClubId &&
    clause.beneficiaryClubId !== sellerClubId &&
    Number(clause.pct) > 0;
}

export function trainingSolidarityShares(player) {
  const rows = Object.entries(player?.development?.clubYears || {})
    .map(([clubId, years]) => ({ clubId, years: Math.max(0, Number(years) || 0) }))
    .filter((item) => item.clubId && item.years > 0);
  const totalYears = rows.reduce((sum, item) => sum + item.years, 0);
  if (!totalYears) return [];
  const totalRate = Math.min(0.035, totalYears * 0.005);
  return rows.map((item) => ({
    clubId: item.clubId,
    years: item.years,
    rate: totalRate * (item.years / totalYears),
  }));
}

function transferPayment(world, payer, payee, amount, source, meta = {}) {
  const value = money(amount);
  if (!payer || !payee || value <= 0) return 0;
  recordFinanceEntry(payer, -value, {
    category: "transfer", source, season: world.season, day: world.day, meta,
  });
  recordFinanceEntry(payee, value, {
    category: "transfer", source, season: world.season, day: world.day, meta,
  });

  const clause = meta.priorSellOnClause;
  if (validSellOnClause(clause, payee.id)) {
    const beneficiary = clubById(world, clause.beneficiaryClubId);
    const sellOn = Math.min(value, money(value * Math.min(30, Number(clause.pct)) / 100));
    if (beneficiary && sellOn > 0) {
      recordFinanceEntry(payee, -sellOn, {
        category: "transfer", source: "transfer-sell-on", season: world.season, day: world.day,
        meta: { ...meta, sellOnPct: clause.pct, beneficiaryClubId: beneficiary.id },
      });
      recordFinanceEntry(beneficiary, sellOn, {
        category: "transfer", source: "transfer-sell-on", season: world.season, day: world.day,
        meta: { ...meta, sellOnPct: clause.pct, debtorClubId: payee.id },
      });
    }
  }
  for (const share of meta.trainingSolidarity || []) {
    if (share.clubId === payee.id) continue;
    const beneficiary = clubById(world, share.clubId);
    const solidarity = Math.min(value, money(value * Math.max(0, Number(share.rate) || 0)));
    if (!beneficiary || solidarity <= 0) continue;
    recordFinanceEntry(payee, -solidarity, {
      category: "transfer", source: "training-solidarity", season: world.season, day: world.day,
      meta: { ...meta, trainingClubId: beneficiary.id, trainingYears: share.years },
    });
    recordFinanceEntry(beneficiary, solidarity, {
      category: "transfer", source: "training-solidarity", season: world.season, day: world.day,
      meta: { ...meta, payingClubId: payee.id, trainingYears: share.years },
    });
  }
  return value;
}

function settleObligation(world, obligation) {
  if (!obligation || obligation.status !== "pending") return false;
  const payer = clubById(world, obligation.payerClubId);
  const payee = clubById(world, obligation.payeeClubId);
  if (!payer || !payee || payer.id === payee.id || obligation.amount <= 0) {
    obligation.status = "cancelled";
    obligation.settledSeason = world.season;
    obligation.settledDay = world.day;
    return false;
  }
  if (obligation.category === "transfer") {
    transferPayment(world, payer, payee, obligation.amount, obligation.source, obligation.meta);
  } else {
    recordFinanceEntry(payer, -obligation.amount, {
      category: obligation.category, source: obligation.source,
      season: world.season, day: world.day, meta: obligation.meta,
    });
    recordFinanceEntry(payee, obligation.amount, {
      category: obligation.category, source: obligation.source,
      season: world.season, day: world.day, meta: obligation.meta,
    });
  }
  obligation.status = "paid";
  obligation.settledSeason = world.season;
  obligation.settledDay = world.day;
  return true;
}

function cancelDepartedPlayerAppearanceClauses(world, playerId, formerClubId) {
  for (const obligation of ensureFinanceObligations(world)) {
    if (
      obligation.status !== "pending" ||
      obligation.kind !== "appearance" ||
      obligation.playerId !== playerId ||
      obligation.triggerClubId !== formerClubId
    ) continue;
    obligation.status = "cancelled";
    obligation.cancelledSeason = world.season;
    obligation.cancelledDay = world.day;
    obligation.cancelReason = "player-permanently-transferred";
  }
}

/** Create the immediate and future cash legs of one permanent transfer. */
export function settleTransferAgreement(world, details) {
  const buyer = clubById(world, details.buyerClubId);
  const seller = clubById(world, details.sellerClubId);
  const player = details.player || null;
  if (!buyer || !seller || !player) throw new Error("invalid transfer agreement");

  cancelDepartedPlayerAppearanceClauses(world, player.id, seller.id);

  const plan = buildTransferPaymentPlan(details.fee, details.upfrontPct, details.installmentCount);
  const priorSellOnClause = validSellOnClause(player.sellOnClause, seller.id)
    ? structuredClone(player.sellOnClause)
    : null;
  const commonMeta = {
    transferId: details.transferId || null,
    playerId: player.id,
    totalFee: plan.total,
    priorSellOnClause,
    trainingSolidarity: trainingSolidarityShares(player),
  };
  transferPayment(world, buyer, seller, plan.upfront, details.source || "transfer-upfront", commonMeta);

  const scheduled = [];
  for (let index = 0; index < plan.installments.length; index++) {
    const amount = plan.installments[index];
    if (amount <= 0) continue;
    const due = normalizedDate(world.season, world.day + (index + 1) * 70);
    scheduled.push(createObligation(world, {
      kind: "scheduled",
      payerClubId: buyer.id,
      payeeClubId: seller.id,
      amount,
      category: "transfer",
      source: "transfer-installment",
      dueSeason: due.dueSeason,
      dueDay: due.dueDay,
      playerId: player.id,
      label: `${player.name} transfer installment ${index + 1}/${plan.installments.length}`,
      meta: { ...commonMeta, installmentIndex: index + 1, installmentCount: plan.installments.length },
    }));
  }

  const appearanceBonus = money(details.appearanceBonus);
  let conditional = null;
  if (appearanceBonus > 0) {
    conditional = createObligation(world, {
      kind: "appearance",
      payerClubId: buyer.id,
      payeeClubId: seller.id,
      amount: appearanceBonus,
      category: "transfer",
      source: "transfer-appearance-bonus",
      playerId: player.id,
      triggerClubId: buyer.id,
      target: Math.max(5, Math.round(Number(details.appearanceTarget) || 20)),
      label: `${player.name} appearance bonus`,
      meta: commonMeta,
    });
  }

  const sellOnPct = Math.max(0, Math.min(30, Math.round(Number(details.sellOnPct) || 0)));
  player.sellOnClause = sellOnPct > 0
    ? {
        beneficiaryClubId: seller.id,
        debtorClubId: buyer.id,
        pct: sellOnPct,
        originTransferId: details.transferId || null,
      }
    : null;
  return { ...plan, scheduled, conditional, appearanceBonus, sellOnPct };
}

export function processFinanceObligationsDay(world) {
  const settled = [];
  for (const obligation of ensureFinanceObligations(world)) {
    if (
      obligation.status === "pending" &&
      obligation.kind === "scheduled" &&
      dateReached(world, obligation) &&
      settleObligation(world, obligation)
    ) {
      settled.push(obligation);
    }
  }
  return settled;
}

/** Count actual match participants against appearance-based transfer clauses. */
export function recordTransferAppearances(world, clubId, playerIds) {
  const ids = new Set(playerIds || []);
  const settled = [];
  for (const obligation of ensureFinanceObligations(world)) {
    if (
      obligation.status !== "pending" ||
      obligation.kind !== "appearance" ||
      obligation.triggerClubId !== clubId ||
      !ids.has(obligation.playerId)
    ) continue;
    obligation.progress = Math.min(obligation.target, (Number(obligation.progress) || 0) + 1);
    if (obligation.progress >= obligation.target && settleObligation(world, obligation)) {
      settled.push(obligation);
    }
  }
  return settled;
}

export function clubFinanceObligationSnapshot(world, clubId) {
  const pending = ensureFinanceObligations(world).filter((item) => item.status === "pending");
  const payable = pending.filter((item) => item.payerClubId === clubId);
  const receivable = pending.filter((item) => item.payeeClubId === clubId);
  const sum = (items, kind) => items
    .filter((item) => !kind || item.kind === kind)
    .reduce((total, item) => total + money(item.amount), 0);
  const dueThisSeason = (items) => items
    .filter((item) => item.kind === "scheduled" && Number(item.dueSeason) <= Number(world?.season))
    .reduce((total, item) => total + money(item.amount), 0);
  return {
    payable,
    receivable,
    scheduledPayable: sum(payable, "scheduled"),
    conditionalPayable: sum(payable, "appearance"),
    scheduledReceivable: sum(receivable, "scheduled"),
    conditionalReceivable: sum(receivable, "appearance"),
    dueThisSeasonPayable: dueThisSeason(payable),
    dueThisSeasonReceivable: dueThisSeason(receivable),
  };
}
