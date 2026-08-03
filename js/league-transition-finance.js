/** Promotion support and multi-season relegation parachute payments. */

import { DIVISIONS } from "./data.js";
import { recordFinanceEntry } from "./finance-ledger.js";

export const LEAGUE_TRANSITION_FINANCE_VERSION = 1;

function tierOf(divisionId) {
  return Math.max(1, Math.min(3, Number(DIVISIONS[divisionId]?.tier) || 3));
}

function scaleContract(contract, factor) {
  if (!contract) return contract;
  contract.weeklyBase = Math.max(1, Math.round((Number(contract.weeklyBase) || 0) * factor));
  contract.signingBonus = Math.max(0, Math.round((Number(contract.signingBonus) || 0) * factor));
  contract.performanceBonus = Math.max(0, Math.round((Number(contract.performanceBonus) || 0) * factor));
  contract.transitionFactor = Math.round(factor * 100) / 100;
  return contract;
}

function addPayment(club, payment) {
  if (!club.finance || typeof club.finance !== "object") club.finance = {};
  if (!Array.isArray(club.finance.leagueTransitionPayments)) {
    club.finance.leagueTransitionPayments = [];
  }
  if (!club.finance.leagueTransitionPayments.some((item) => item.id === payment.id)) {
    club.finance.leagueTransitionPayments.push(payment);
  }
}

export function registerLeagueTransitionFinance(world, club, move) {
  if (!world || !club || !move) return [];
  const payments = [];
  const fromTier = tierOf(move.from);
  const toTier = tierOf(move.to);
  const nextSeason = Number(world.season) + 1;
  if (move.promoted) {
    const amount = { 1: 1_800_000, 2: 550_000, 3: 180_000 }[toTier];
    payments.push({
      id: `lt_${club.id}_${nextSeason}_promotion`,
      season: nextSeason,
      amount,
      kind: "promotion",
      status: "pending",
      fromDivision: move.from,
      toDivision: move.to,
    });
  } else {
    const total = { 1: 4_000_000, 2: 1_000_000, 3: 300_000 }[fromTier];
    payments.push({
      id: `lt_${club.id}_${nextSeason}_parachute_1`,
      season: nextSeason,
      amount: Math.round(total * 0.65),
      kind: "parachute",
      status: "pending",
      fromDivision: move.from,
      toDivision: move.to,
      installment: 1,
    });
    payments.push({
      id: `lt_${club.id}_${nextSeason + 1}_parachute_2`,
      season: nextSeason + 1,
      amount: total - Math.round(total * 0.65),
      kind: "parachute",
      status: "pending",
      fromDivision: move.from,
      toDivision: move.to,
      installment: 2,
    });
  }
  for (const payment of payments) addPayment(club, payment);

  const factor = move.promoted ? 1.25 : 0.72;
  const sponsorship = club.sponsorship;
  if (sponsorship) {
    scaleContract(sponsorship.nextContract, factor);
    for (const offer of sponsorship.offers || []) scaleContract(offer, factor);
    sponsorship.transitionSeason = nextSeason;
  }
  return payments;
}

export function processLeagueTransitionPayments(world) {
  const settled = [];
  for (const club of world?.clubs || []) {
    for (const payment of club.finance?.leagueTransitionPayments || []) {
      if (payment.status !== "pending" || Number(payment.season) > Number(world.season)) continue;
      recordFinanceEntry(club, payment.amount, {
        category: "league",
        source: payment.kind === "promotion" ? "promotion-support" : "relegation-parachute",
        season: world.season,
        day: world.day,
        meta: {
          paymentId: payment.id,
          fromDivision: payment.fromDivision,
          toDivision: payment.toDivision,
          installment: payment.installment || null,
        },
      });
      payment.status = "paid";
      payment.paidSeason = world.season;
      payment.paidDay = world.day;
      settled.push({ clubId: club.id, ...payment });
    }
  }
  return settled;
}
