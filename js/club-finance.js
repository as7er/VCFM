/** Shared club finances: every club earns and pays from the same visible data. */

import { DIVISIONS } from "./data.js";
import { estimateWage } from "./models.js";
import { ensureFacilities, facilityWeeklyUpkeep, stadiumInfo, youthFacilityInfo } from "./facilities.js";
import { ensureLoans } from "./loans.js";
import { ensureStaff, staffWageBill } from "./staff.js";
import { ensureFinanceLedger, financeLedgerSummary, recordFinanceEntry, resetFinanceLedgerSeason } from "./finance-ledger.js";
import {
  ensureTransferNegotiations,
  isActiveTransferNegotiation,
  transferNegotiationCashCost,
} from "./transfer-negotiations.js";
import { ensureContract } from "./contracts.js";

export const CLUB_FINANCE_VERSION = 2;

function number(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

export function ensureClubFinance(club, season = null) {
  if (!club) return null;
  if (!club.finance || typeof club.finance !== "object") club.finance = {};
  const finance = club.finance;
  const seasonFields = [
    "seasonTicketIncome",
    "seasonCommercialIncome",
    "seasonWageOut",
    "seasonFacilityOut",
    "seasonTransferNet",
    "seasonBroadcastIncome",
    "seasonPrizeIncome",
    "seasonHomeGates",
  ];
  for (const field of seasonFields) finance[field] = number(finance[field]);
  finance.version = CLUB_FINANCE_VERSION;
  ensureFinanceLedger(club, finance, season);
  return finance;
}

export function ensureWorldFinances(world) {
  for (const club of world?.clubs || []) ensureClubFinance(club, world?.season ?? null);
  return world;
}

/** Weekly first-team wage bill, including both sides of active loan wage sharing. */
export function clubSquadWageBill(world, club) {
  if (!club) return 0;
  ensureLoans(world);
  let total = 0;

  for (const player of club.players || []) {
    const wage = number(player.wage);
    if (player.loan && player.loan.toClubId === club.id) {
      total += Math.round(wage * number(player.loan.wageShare ?? 1));
    } else if (!player.loan) {
      total += wage;
    }
  }

  for (const loan of world.loans || []) {
    if (loan.fromClubId !== club.id) continue;
    const host = world.clubs?.find((candidate) => candidate.id === loan.toClubId);
    const player = host?.players?.find((candidate) => candidate.id === loan.playerId);
    const share = loan.wageShare ?? player?.loan?.wageShare ?? 0.75;
    total += Math.round(number(player?.wage) * (1 - number(share)));
  }
  return Math.round(total);
}

/** Sponsorship and commercial income uses public league level and club strength only. */
export function clubWeeklyCommercialIncome(club) {
  const tier = DIVISIONS[club?.division || 3]?.tier || 3;
  // Sponsorship is the stable base that complements volatile gates and annual TV/prize money.
  // Lower leagues depend more heavily on local partners because their broadcast pools are small.
  const base = { 1: 220_000, 2: 135_000, 3: 120_000 }[tier] || 120_000;
  const power = Math.max(40, Math.min(85, number(club?.power) || 55));
  const strengthFactor = 0.75 + ((power - 40) / 45) * 0.65;
  return Math.round(base * strengthFactor);
}

export function clubWeeklyOperatingSnapshot(world, club) {
  ensureStaff(club);
  ensureFacilities(club);
  const squadWage = clubSquadWageBill(world, club);
  const youthWage = (club.youth?.players || []).reduce(
    (sum, player) => sum + number(player.wage),
    0
  );
  const staffWage = staffWageBill(club);
  const facilityUpkeep = facilityWeeklyUpkeep(club) + number(youthFacilityInfo(club).upkeep);
  const commercialIncome = clubWeeklyCommercialIncome(club);
  const wageOut = Math.round(squadWage + youthWage + staffWage);
  const operatingOut = Math.round(wageOut + facilityUpkeep);
  return {
    squadWage,
    youthWage,
    staffWage,
    wageOut,
    facilityUpkeep,
    commercialIncome,
    operatingOut,
    net: commercialIncome - operatingOut,
  };
}

/** Settle the same weekly football operation for user and AI clubs. */
export function settleWorldWeeklyFinances(world) {
  const settlements = [];
  for (const club of world?.clubs || []) {
    const finance = ensureClubFinance(club);
    const snapshot = clubWeeklyOperatingSnapshot(world, club);
    ensureFinanceLedger(club, finance, world.season);
    recordFinanceEntry(club, snapshot.commercialIncome, {
      category: "commercial", source: "weekly-settlement", season: world.season, day: world.day,
    });
    recordFinanceEntry(club, -snapshot.wageOut, {
      category: "wage", source: "weekly-settlement", season: world.season, day: world.day,
    });
    recordFinanceEntry(club, -snapshot.facilityUpkeep, {
      category: "facility", source: "weekly-settlement", season: world.season, day: world.day,
    });
    finance.lastWeeklySettlement = { day: world.day || 0, ...snapshot };
    settlements.push({ clubId: club.id, money: club.money, ...snapshot });
  }
  return settlements;
}

/** AI reserves eight weeks of recurring cash burn before entering the market. */
export function clubTransferBudget(world, club, reserveWeeks = 8) {
  if (!club) return 0;
  const weekly = clubWeeklyOperatingSnapshot(world, club);
  const reserve = Math.max(0, weekly.operatingOut - weekly.commercialIncome) * reserveWeeks;
  return Math.max(0, Math.floor(number(club.money) - reserve));
}

export function recordMatchdayFinance(club, gate, day, season = null) {
  const finance = ensureClubFinance(club, season);
  const income = Math.max(0, Math.round(number(gate?.income ?? gate)));
  recordFinanceEntry(club, income, { category: "ticket", source: "matchday", season, day });
  finance.lastTicketIncome = income;
  finance.lastTicketDay = day;
  finance.lastAttendance = gate?.attendance ?? null;
  finance.lastCapacity = gate?.capacity ?? null;
  finance.lastFillPct = gate?.fill ?? null;
  finance.lastTicketFactors = Array.isArray(gate?.factors) ? gate.factors : [];
  finance.seasonHomeGates += 1;
  return income;
}

export function ensureClubFinanceBudget(club) {
  const finance = ensureClubFinance(club);
  if (!finance.budgetPlan || typeof finance.budgetPlan !== "object") {
    finance.budgetPlan = {};
  }
  const reserveWeeks = Math.round(number(finance.budgetPlan.reserveWeeks) || 8);
  const transferShare = Math.round(number(finance.budgetPlan.transferShare) || 70);
  finance.budgetPlan.reserveWeeks = Math.max(4, Math.min(20, reserveWeeks));
  finance.budgetPlan.transferShare = Math.max(25, Math.min(100, transferShare));
  return finance.budgetPlan;
}

export function updateClubFinanceBudget(club, patch = {}) {
  const plan = ensureClubFinanceBudget(club);
  if (patch.reserveWeeks != null) {
    plan.reserveWeeks = Math.max(4, Math.min(20, Math.round(number(patch.reserveWeeks))));
  }
  if (patch.transferShare != null) {
    plan.transferShare = Math.max(25, Math.min(100, Math.round(number(patch.transferShare))));
  }
  return plan;
}

function stableRenewalEstimate(player) {
  const years = player.age >= 34 ? 1 : player.age >= 32 ? 2 : 3;
  const currentWage = number(player.wage);
  const baseMultiplier = 1.13 + (player.ovr >= 15 ? 0.08 : 0);
  const yearBump = 1 + Math.max(0, years - 2) * 0.03;
  const newWage = Math.max(currentWage, Math.round(estimateWage(player) * baseMultiplier * yearBump));
  const fee = Math.round(newWage * 4 * years * 0.15);
  return { years, newWage, fee, weeklyWageIncrease: Math.max(0, newWage - currentWage) };
}

/** Cash and payroll already promised but not yet settled. */
export function clubFinanceCommitments(world, club) {
  if (!world || !club) {
    return { transfer: 0, contracts: 0, total: 0, weeklyWageIncrease: 0, items: [] };
  }
  const items = [];
  for (const negotiation of ensureTransferNegotiations(world)) {
    if (!isActiveTransferNegotiation(negotiation) || negotiation.buyerClubId !== club.id) continue;
    const wage = number(negotiation.wage);
    items.push({
      kind: "transfer",
      amount: transferNegotiationCashCost(negotiation),
      weeklyWageIncrease: wage,
      label: "pending transfer",
      id: negotiation.id,
    });
  }
  for (const player of club.players || []) {
    ensureContract(player);
    if (player.loan || (player.contractYears || 0) > 1 || !player._needsRenew) continue;
    // The contract screen remains stochastic; planning uses a stable midpoint
    // estimate so merely opening the finance page never changes the forecast.
    const estimate = stableRenewalEstimate(player);
    items.push({
      kind: "contract",
      amount: estimate.fee,
      weeklyWageIncrease: estimate.weeklyWageIncrease,
      label: "expiring contract",
      id: player.id,
    });
  }
  const transfer = items.filter((item) => item.kind === "transfer").reduce((sum, item) => sum + item.amount, 0);
  const contracts = items.filter((item) => item.kind === "contract").reduce((sum, item) => sum + item.amount, 0);
  const weeklyWageIncrease = items.reduce((sum, item) => sum + number(item.weeklyWageIncrease), 0);
  return { transfer, contracts, total: transfer + contracts, weeklyWageIncrease, items };
}

/** Conservative planning projection using only scheduled home gates and visible recurring costs. */
export function clubSeasonBudgetSnapshot(world, club) {
  if (!world || !club) return null;
  const finance = ensureClubFinance(club, world.season);
  const plan = ensureClubFinanceBudget(club);
  const commitments = clubFinanceCommitments(world, club);
  const operating = clubWeeklyOperatingSnapshot(world, club);
  const futureClubFixtures = (world.fixtures || []).filter(
    (fixture) =>
      !fixture.played &&
      (fixture.home === club.id || fixture.away === club.id) &&
      number(fixture.day) >= number(world.day)
  );
  const lastFixtureDay = futureClubFixtures.reduce(
    (latest, fixture) => Math.max(latest, number(fixture.day)),
    number(world.day)
  );
  const remainingWeeks = Math.max(0, Math.ceil((lastFixtureDay - number(world.day)) / 7));
  const remainingHomeMatches = futureClubFixtures.filter((fixture) => fixture.home === club.id).length;
  const estimatedGate = Math.round(number(stadiumInfo(club)?.matchday) * 0.88);
  const projectedTickets = remainingHomeMatches * estimatedGate;
  const recurringNet = operating.commercialIncome - operating.operatingOut;
  const projectedOperatingNet = recurringNet * remainingWeeks;
  const seasonPayoutAlreadyRecorded =
    number(finance.seasonBroadcastIncome) + number(finance.seasonPrizeIncome) > 0;
  const projectedLeaguePayout = seasonPayoutAlreadyRecorded
    ? 0
    : number(finance.lastBroadcastPayout) + number(finance.lastPrizePayout);
  const projectedEndCash = Math.round(
    number(club.money) + projectedOperatingNet + projectedTickets + projectedLeaguePayout
  );
  const projectedCommittedWages = Math.round(commitments.weeklyWageIncrease * remainingWeeks);
  const projectedCommitmentCost = commitments.total + projectedCommittedWages;
  const projectedEndAfterCommitments = projectedEndCash - projectedCommitmentCost;
  const reserveCash = Math.round(
    (operating.operatingOut + commitments.weeklyWageIncrease) * plan.reserveWeeks
  );
  const safeTransferCeiling = Math.max(0, Math.floor(number(club.money) - reserveCash - commitments.total));
  const plannedTransferBudget = Math.floor(safeTransferCeiling * (plan.transferShare / 100));
  const projectedEndAfterBudget = projectedEndAfterCommitments - plannedTransferBudget;
  const projectedWeeklyRevenue =
    operating.commercialIncome +
    (remainingWeeks > 0 ? projectedTickets / remainingWeeks : 0) +
    (remainingWeeks > 0 ? projectedLeaguePayout / remainingWeeks : 0);
  const projectedWeeklyWages = operating.wageOut + commitments.weeklyWageIncrease;
  const wageShare = projectedWeeklyRevenue > 0
    ? Math.round((projectedWeeklyWages / projectedWeeklyRevenue) * 100)
    : 999;
  const status =
    projectedEndAfterBudget < 0
      ? "critical"
      : projectedEndAfterBudget < reserveCash
        ? "tight"
        : "stable";
  return {
    plan,
    operating,
    remainingWeeks,
    remainingHomeMatches,
    estimatedGate,
    projectedTickets,
    projectedOperatingNet,
    projectedLeaguePayout,
    projectedEndCash,
    projectedCommittedWages,
    projectedCommitmentCost,
    projectedEndAfterCommitments,
    reserveCash,
    commitments,
    safeTransferCeiling,
    plannedTransferBudget,
    projectedEndAfterBudget,
    wageShare,
    status,
  };
}

export function resetClubSeasonFinance(club, season = null) {
  const finance = ensureClubFinance(club);
  for (const field of [
    "seasonTicketIncome",
    "seasonCommercialIncome",
    "seasonHomeGates",
    "seasonWageOut",
    "seasonFacilityOut",
    "seasonTransferNet",
    "seasonBroadcastIncome",
    "seasonPrizeIncome",
  ]) {
    finance[field] = 0;
  }
  resetFinanceLedgerSeason(club, season);
  return finance;
}

export { financeLedgerSummary, recordFinanceEntry };
