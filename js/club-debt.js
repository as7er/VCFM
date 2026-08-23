/** Explicit club financing: principal, interest, maturity and repayments. */

import { recordFinanceEntry } from "./finance-ledger.js";
import { sponsorshipMarketWeekly } from "./sponsorships.js";
import { clubCashAvailability } from "./cash-reservations.js";

export const CLUB_DEBT_VERSION = 1;
export const FINANCE_WEEKS_PER_SEASON = 32;

function money(value) {
  return Math.max(0, Math.round(Number(value) || 0));
}

function nextDebtId(club, world, kind) {
  const state = ensureClubDebt(club, world);
  state.serial = (Number(state.serial) || 0) + 1;
  return `debt_${club.id}_${world.season}_${kind}_${state.serial}`;
}

export function ensureClubDebt(club, world = null) {
  if (!club) return null;
  if (!club.finance || typeof club.finance !== "object") club.finance = {};
  if (!club.finance.debt || typeof club.finance.debt !== "object") {
    club.finance.debt = { version: CLUB_DEBT_VERSION, serial: 0, facilities: [] };
  }
  const state = club.finance.debt;
  if (!Array.isArray(state.facilities)) state.facilities = [];
  state.version = CLUB_DEBT_VERSION;

  const legacyOwnerDebt = money(club.finance.debtPlan?.ownerDebt);
  if (legacyOwnerDebt > 0 && !state.facilities.some((facility) => facility.kind === "owner" && facility.status === "active")) {
    state.serial += 1;
    state.facilities.push({
      id: `debt_${club.id}_${world?.season || 0}_owner_legacy`,
      kind: "owner",
      lender: "Club ownership",
      originalPrincipal: legacyOwnerDebt,
      balance: legacyOwnerDebt,
      annualRate: 0.035,
      termSeasons: 4,
      startSeason: world?.season || 1,
      maturitySeason: (world?.season || 1) + 4,
      amortizing: false,
      status: "active",
      legacy: true,
    });
  }
  return state;
}

export function ensureWorldDebts(world) {
  for (const club of world?.clubs || []) ensureClubDebt(club, world);
  return world;
}

export function clubDebtCapacity(club, season = null) {
  const annualRecurringRevenue = sponsorshipMarketWeekly(club, season) * FINANCE_WEEKS_PER_SEASON;
  return Math.max(250_000, Math.round(annualRecurringRevenue * 1.2));
}

export function clubDebtSnapshot(world, club) {
  const facilities = ensureClubDebt(club, world).facilities.filter((facility) => facility.status === "active");
  const outstanding = facilities.reduce((sum, facility) => sum + money(facility.balance), 0);
  const weeklyInterest = facilities.reduce(
    (sum, facility) => sum + Math.round(money(facility.balance) * Math.max(0, Number(facility.annualRate) || 0) / FINANCE_WEEKS_PER_SEASON),
    0
  );
  const principalDueThisSeason = facilities.reduce((sum, facility) => {
    if (!facility.amortizing || facility.lastPrincipalSeason === world?.season) return sum;
    return sum + Math.min(money(facility.balance), Math.ceil(money(facility.originalPrincipal) / Math.max(1, Number(facility.termSeasons) || 1)));
  }, 0);
  const capacity = clubDebtCapacity(club, world?.season);
  return {
    facilities,
    outstanding,
    weeklyInterest,
    principalDueThisSeason,
    capacity,
    headroom: Math.max(0, capacity - outstanding),
  };
}

export function requestClubFinancing(world, clubId, requestedAmount, termSeasons = 2) {
  const club = world?.clubs?.find((candidate) => candidate.id === clubId);
  if (!club || club.id !== world.userClubId) return { ok: false, msg: "只能为当前俱乐部申请融资" };
  const snapshot = clubDebtSnapshot(world, club);
  const amount = money(requestedAmount);
  const term = Math.max(1, Math.min(3, Math.round(Number(termSeasons) || 2)));
  if (amount < 100_000) return { ok: false, msg: "单笔融资不得低于 100K" };
  if (amount > snapshot.headroom) return { ok: false, msg: "申请金额超过俱乐部可承担的债务上限" };
  if (snapshot.facilities.filter((facility) => facility.kind === "bank").length >= 2) {
    return { ok: false, msg: "已有两笔银行融资，无法继续新增" };
  }
  const leverage = snapshot.capacity > 0 ? snapshot.outstanding / snapshot.capacity : 1;
  const annualRate = Math.min(0.12, 0.06 + leverage * 0.04 + (Number(club.money) < 0 ? 0.02 : 0));
  const facility = {
    id: nextDebtId(club, world, "bank"),
    kind: "bank",
    lender: "Football Finance Bank",
    originalPrincipal: amount,
    balance: amount,
    annualRate: Math.round(annualRate * 10000) / 10000,
    termSeasons: term,
    startSeason: world.season,
    maturitySeason: world.season + term - 1,
    amortizing: true,
    status: "active",
  };
  ensureClubDebt(club, world).facilities.push(facility);
  recordFinanceEntry(club, amount, {
    category: "financing", source: "bank-financing", season: world.season, day: world.day,
    meta: { debtId: facility.id, annualRate: facility.annualRate, termSeasons: term },
  });
  return { ok: true, msg: `融资 ${amount} 已到账`, facility };
}

export function registerOwnerLoan(world, club, amount) {
  const value = money(amount);
  if (!club || !value) return null;
  const facility = {
    id: nextDebtId(club, world, "owner"),
    kind: "owner",
    lender: "Club ownership",
    originalPrincipal: value,
    balance: value,
    annualRate: 0.035,
    termSeasons: 4,
    startSeason: world.season,
    maturitySeason: world.season + 4,
    amortizing: false,
    status: "active",
  };
  ensureClubDebt(club, world).facilities.push(facility);
  return facility;
}

export function reduceOwnerDebt(club, amount) {
  let remaining = money(amount);
  for (const facility of ensureClubDebt(club).facilities) {
    if (facility.kind !== "owner" || facility.status !== "active" || remaining <= 0) continue;
    const reduction = Math.min(remaining, money(facility.balance));
    facility.balance -= reduction;
    remaining -= reduction;
    if (facility.balance <= 0) facility.status = "repaid";
  }
  return money(amount) - remaining;
}

export function recordClubDebtInterest(world, club) {
  const snapshot = clubDebtSnapshot(world, club);
  let total = 0;
  for (const facility of snapshot.facilities) {
    const key = `${world.season}:${world.day}`;
    if (facility.lastInterestKey === key) continue;
    const interest = Math.round(money(facility.balance) * Math.max(0, Number(facility.annualRate) || 0) / FINANCE_WEEKS_PER_SEASON);
    if (interest > 0) {
      recordFinanceEntry(club, -interest, {
        category: "financing", source: "debt-interest", season: world.season, day: world.day,
        meta: { debtId: facility.id, lender: facility.lender, annualRate: facility.annualRate },
      });
      total += interest;
    }
    facility.lastInterestKey = key;
  }
  return total;
}

export function settleWorldDebtSeason(world) {
  const settled = [];
  for (const club of world?.clubs || []) {
    for (const facility of ensureClubDebt(club, world).facilities) {
      if (facility.status !== "active" || !facility.amortizing || facility.lastPrincipalSeason === world.season) continue;
      const principal = Math.min(
        money(facility.balance),
        Math.ceil(money(facility.originalPrincipal) / Math.max(1, Number(facility.termSeasons) || 1))
      );
      if (principal > 0) {
        recordFinanceEntry(club, -principal, {
          category: "financing", source: "debt-principal", season: world.season, day: world.day,
          meta: { debtId: facility.id, lender: facility.lender },
        });
        facility.balance -= principal;
      }
      facility.lastPrincipalSeason = world.season;
      if (facility.balance <= 0) facility.status = "repaid";
      settled.push({ clubId: club.id, debtId: facility.id, principal });
    }
  }
  return settled;
}

export function repayClubFinancing(world, clubId, debtId, requestedAmount) {
  const club = world?.clubs?.find((candidate) => candidate.id === clubId);
  if (!club || club.id !== world.userClubId) return { ok: false, msg: "只能偿还当前俱乐部债务" };
  const facility = ensureClubDebt(club, world).facilities.find((item) => item.id === debtId && item.status === "active");
  if (!facility) return { ok: false, msg: "债务记录不存在或已结清" };
  const amount = Math.min(money(requestedAmount), money(facility.balance));
  if (amount <= 0) return { ok: false, msg: "还款金额无效" };
  const cash = clubCashAvailability(world, club, amount);
  if (!cash.ok) return { ok: false, msg: "未承诺现金不足，无法提前还款" };
  recordFinanceEntry(club, -amount, {
    category: "financing", source: "debt-principal", season: world.season, day: world.day,
    meta: { debtId: facility.id, lender: facility.lender, early: true },
  });
  facility.balance -= amount;
  if (facility.kind === "owner" && club.finance.debtPlan) {
    club.finance.debtPlan.ownerDebt = Math.max(0, money(club.finance.debtPlan.ownerDebt) - amount);
  }
  if (facility.balance <= 0) facility.status = "repaid";
  return { ok: true, msg: `已偿还 ${amount}`, facility };
}
