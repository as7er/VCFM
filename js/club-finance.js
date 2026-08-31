/** Shared club finances: every club earns and pays from the same visible data. */

import { DIVISIONS } from "./data.js";
import { estimateWage } from "./models.js";
import { ensureFacilities, facilityWeeklyUpkeep, stadiumInfo, youthFacilityInfo } from "./facilities.js";
import { ensureLoans } from "./loans.js";
import { ensureStaff, staffWageBill } from "./staff.js";
import { ensureFinanceLedger, financeLedgerSummary, recordFinanceEntry, resetFinanceLedgerSeason } from "./finance-ledger.js";
import {
  ACTIVE_DEAL_NEGOTIATION_STATUSES,
  ACTIVE_TRANSFER_NEGOTIATION_STATUSES,
  dealNegotiationCashCost,
  transferNegotiationCashCost,
} from "./cash-reservations.js";
import { ensureContract } from "./contracts.js";
import { clubFinanceObligationSnapshot, ensureFinanceObligations } from "./finance-obligations.js";
import {
  clubCommercialBreakdown,
  ensureWorldSponsorships,
} from "./sponsorships.js";
import {
  clubDebtSnapshot,
  ensureWorldDebts,
  recordClubDebtInterest,
  reduceOwnerDebt,
  registerOwnerLoan,
} from "./club-debt.js";

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
    "seasonMatchdayIncome",
    "seasonCommercialIncome",
    "seasonWageOut",
    "seasonFacilityOut",
    "seasonTransferNet",
    "seasonBroadcastIncome",
    "seasonPrizeIncome",
    "seasonCompetitionIncome",
    "seasonLeagueTransitionIncome",
    "seasonFinancingNet",
    "seasonHomeGates",
  ];
  for (const field of seasonFields) finance[field] = number(finance[field]);
  finance.version = CLUB_FINANCE_VERSION;
  ensureFinanceLedger(club, finance, season);
  return finance;
}

export function ensureWorldFinances(world) {
  ensureFinanceObligations(world);
  for (const club of world?.clubs || []) ensureClubFinance(club, world?.season ?? null);
  ensureWorldSponsorships(world);
  ensureWorldDebts(world);
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
  const commercial = clubCommercialBreakdown(world, club);
  const commercialIncome = commercial.total;
  const debt = clubDebtSnapshot(world, club);
  const debtInterest = debt.weeklyInterest;
  const wageOut = Math.round(squadWage + youthWage + staffWage);
  const operatingOut = Math.round(wageOut + facilityUpkeep + debtInterest);
  return {
    squadWage,
    youthWage,
    staffWage,
    wageOut,
    facilityUpkeep,
    commercialIncome,
    commercial,
    debtInterest,
    debt,
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
    recordFinanceEntry(club, snapshot.commercial.sponsorship, {
      category: "commercial", source: "sponsorship-weekly", season: world.season, day: world.day,
    });
    recordFinanceEntry(club, snapshot.commercial.otherCommercial, {
      category: "commercial", source: "commercial-operations", season: world.season, day: world.day,
    });
    recordFinanceEntry(club, -snapshot.wageOut, {
      category: "wage", source: "weekly-settlement", season: world.season, day: world.day,
    });
    recordFinanceEntry(club, -snapshot.facilityUpkeep, {
      category: "facility", source: "weekly-settlement", season: world.season, day: world.day,
    });
    recordClubDebtInterest(world, club);
    reviewClubFinancialCompliance(world, club, snapshot);
    finance.lastWeeklySettlement = { day: world.day || 0, ...snapshot };
    settlements.push({ clubId: club.id, money: club.money, ...snapshot });
  }
  return settlements;
}

/**
 * AI 债务处置：先冻结引援和压低预算，再以可追踪的股东贷款提供有限流动性。
 * 贷款形成显式 ownerDebt，现金宽裕后自动偿还，不凭空抹掉经营失败。
 */
export function processAiDebtActions(world) {
  const actions = [];
  for (const club of world?.clubs || []) {
    if (club.id === world.userClubId) continue;
    const finance = ensureClubFinance(club, world.season);
    const operating = clubWeeklyOperatingSnapshot(world, club);
    if (!finance.debtPlan || typeof finance.debtPlan !== "object") {
      finance.debtPlan = { weeksNegative: 0, transferEmbargo: false, ownerDebt: 0 };
    }
    const plan = finance.debtPlan;
    plan.ownerDebt = Math.max(0, number(plan.ownerDebt));
    if (number(club.money) < 0) {
      plan.weeksNegative = Math.max(0, number(plan.weeksNegative)) + 1;
      plan.transferEmbargo = true;
      plan.status = "recovery";
      plan.lastReviewDay = world.day;
      const budget = ensureClubFinanceBudget(club);
      budget.reserveWeeks = 20;
      budget.transferShare = 25;

      const critical = club.money < -Math.max(operating.operatingOut * 2, 500_000);
      if (critical || plan.weeksNegative % 4 === 0) {
        const tier = DIVISIONS[club.division || 3]?.tier || 3;
        const cap = { 1: 5_000_000, 2: 2_500_000, 3: 1_500_000 }[tier] || 1_500_000;
        const support = Math.min(
          cap,
          Math.max(operating.operatingOut * 2, Math.ceil(Math.abs(club.money) * 0.65))
        );
        if (support > 0) {
          recordFinanceEntry(club, support, {
            category: "board",
            source: "owner-loan",
            season: world.season,
            day: world.day,
          });
          registerOwnerLoan(world, club, support);
          plan.ownerDebt += support;
          actions.push({ clubId: club.id, type: "owner-loan", amount: support });
        }
      } else {
        actions.push({ clubId: club.id, type: "transfer-embargo", amount: 0 });
      }
      continue;
    }

    plan.weeksNegative = 0;
    const reserve = operating.operatingOut * 12;
    if (plan.ownerDebt > 0 && club.money > reserve) {
      const repayment = Math.min(plan.ownerDebt, Math.max(0, Math.floor(club.money - reserve)));
      if (repayment > 0) {
        recordFinanceEntry(club, -repayment, {
          category: "board",
          source: "owner-loan-repayment",
          season: world.season,
          day: world.day,
        });
        plan.ownerDebt -= repayment;
        reduceOwnerDebt(club, repayment);
        actions.push({ clubId: club.id, type: "owner-loan-repayment", amount: repayment });
      }
    }
    if (club.money >= operating.operatingOut * 4 && plan.ownerDebt <= 0) {
      plan.transferEmbargo = false;
      plan.status = "stable";
    }
    plan.lastReviewDay = world.day;
  }
  return actions;
}

/** AI reserves eight weeks of recurring cash burn before entering the market. */
export function clubTransferBudget(world, club, reserveWeeks = 8) {
  if (!club) return 0;
  const weekly = clubWeeklyOperatingSnapshot(world, club);
  const reserve = Math.max(0, weekly.operatingOut - weekly.commercialIncome) * reserveWeeks;
  const obligations = clubFinanceObligationSnapshot(world, club.id);
  const debt = clubDebtSnapshot(world, club);
  return Math.max(0, Math.floor(
    number(club.money) - reserve - obligations.scheduledPayable - debt.principalDueThisSeason
  ));
}

export function reviewClubFinancialCompliance(world, club, operatingSnapshot = null) {
  if (!club) return null;
  const operating = operatingSnapshot || clubWeeklyOperatingSnapshot(world, club);
  const debt = clubDebtSnapshot(world, club);
  const annualRevenue = Math.max(
    1,
    operating.commercialIncome * 32 + Math.round(number(stadiumInfo(club)?.matchday) * 17)
  );
  const weeklyRevenue = annualRevenue / 32;
  const wageRatio = operating.wageOut / Math.max(1, weeklyRevenue);
  const debtRatio = debt.outstanding / annualRevenue;
  const critical = debtRatio > 1.1 || (wageRatio > 1.2 && number(club.money) < 0);
  const warning = critical || debtRatio > 0.75 || wageRatio > 0.9;
  const compliance = {
    version: 1,
    status: critical ? "restricted" : warning ? "warning" : "compliant",
    wageRatio: Math.round(wageRatio * 1000) / 10,
    debtRatio: Math.round(debtRatio * 1000) / 10,
    annualRevenue: Math.round(annualRevenue),
    transferEmbargo: critical,
    reviewedSeason: world?.season ?? null,
    reviewedDay: world?.day ?? null,
  };
  ensureClubFinance(club).compliance = compliance;
  return compliance;
}

export function recordMatchdayFinance(club, gate, day, season = null) {
  const finance = ensureClubFinance(club, season);
  const ticket = Math.max(0, Math.round(number(gate?.ticketIncome ?? gate?.income ?? gate)));
  const retail = Math.max(0, Math.round(number(gate?.retailIncome)));
  const hospitality = Math.max(0, Math.round(number(gate?.hospitalityIncome)));
  recordFinanceEntry(club, ticket, { category: "ticket", source: "matchday-ticket", season, day });
  recordFinanceEntry(club, retail, { category: "matchday", source: "matchday-retail", season, day });
  recordFinanceEntry(club, hospitality, { category: "matchday", source: "matchday-hospitality", season, day });
  finance.lastTicketIncome = ticket;
  finance.lastMatchdayAncillaryIncome = retail + hospitality;
  finance.lastMatchdayIncome = ticket + retail + hospitality;
  finance.lastTicketDay = day;
  finance.lastAttendance = gate?.attendance ?? null;
  finance.lastCapacity = gate?.capacity ?? null;
  finance.lastFillPct = gate?.fill ?? null;
  finance.lastTicketFactors = Array.isArray(gate?.factors) ? gate.factors : [];
  finance.seasonHomeGates += 1;
  return { ticket, retail, hospitality, total: ticket + retail + hospitality };
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
    return { transfer: 0, contracts: 0, loans: 0, total: 0, weeklyWageIncrease: 0, items: [] };
  }
  const items = [];
  for (const negotiation of Array.isArray(world.transferNegotiations) ? world.transferNegotiations : []) {
    if (
      !ACTIVE_TRANSFER_NEGOTIATION_STATUSES.has(negotiation?.status) ||
      negotiation.buyerClubId !== club.id
    ) continue;
    const wage = number(negotiation.wage);
    items.push({
      kind: "transfer",
      amount: transferNegotiationCashCost(negotiation),
      weeklyWageIncrease: wage,
      label: "pending transfer",
      id: negotiation.id,
    });
  }
  const activeRenewalPlayers = new Set();
  for (const negotiation of Array.isArray(world.dealNegotiations) ? world.dealNegotiations : []) {
    if (
      !ACTIVE_DEAL_NEGOTIATION_STATUSES.has(negotiation?.status) ||
      negotiation.payerClubId !== club.id
    ) continue;
    if (negotiation.kind === "renewal") activeRenewalPlayers.add(negotiation.playerId);
    const player = (world.clubs || [])
      .flatMap((candidate) => candidate.players || [])
      .find((candidate) => candidate.id === negotiation.playerId);
    const currentWage = number(player?.wage);
    const weeklyWageIncrease = negotiation.kind === "renewal"
      ? Math.max(0, number(negotiation.wage) - currentWage)
      : negotiation.kind === "loan_in" || negotiation.kind === "loan_out"
        ? Math.round(number(player?.wage) * number(negotiation.wageShare))
        : 0;
    items.push({
      kind: negotiation.kind === "renewal" ? "contract" : "loan",
      amount: dealNegotiationCashCost(negotiation),
      weeklyWageIncrease,
      label: negotiation.kind === "renewal" ? "pending renewal" : "pending loan",
      id: negotiation.id,
    });
  }
  for (const player of club.players || []) {
    ensureContract(player);
    if (
      player.loan ||
      activeRenewalPlayers.has(player.id) ||
      (player.contractYears || 0) > 1 ||
      !player._needsRenew
    ) continue;
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
  const loans = items.filter((item) => item.kind === "loan").reduce((sum, item) => sum + item.amount, 0);
  const weeklyWageIncrease = items.reduce((sum, item) => sum + number(item.weeklyWageIncrease), 0);
  return { transfer, contracts, loans, total: transfer + contracts + loans, weeklyWageIncrease, items };
}

/** Conservative planning projection using only scheduled home gates and visible recurring costs. */
export function clubSeasonBudgetSnapshot(world, club) {
  if (!world || !club) return null;
  const finance = ensureClubFinance(club, world.season);
  const plan = ensureClubFinanceBudget(club);
  const commitments = clubFinanceCommitments(world, club);
  const obligations = clubFinanceObligationSnapshot(world, club.id);
  const debt = clubDebtSnapshot(world, club);
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
  const projectedEndAfterObligations = projectedEndAfterCommitments
    - obligations.dueThisSeasonPayable
    + obligations.dueThisSeasonReceivable
    - debt.principalDueThisSeason;
  const reserveCash = Math.round(
    (operating.operatingOut + commitments.weeklyWageIncrease) * plan.reserveWeeks
  );
  const safeTransferCeiling = Math.max(0, Math.floor(
    number(club.money) - reserveCash - commitments.total - obligations.scheduledPayable - debt.principalDueThisSeason
  ));
  const plannedTransferBudget = Math.floor(safeTransferCeiling * (plan.transferShare / 100));
  const projectedEndAfterBudget = projectedEndAfterObligations - plannedTransferBudget;
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
    projectedEndAfterObligations,
    reserveCash,
    commitments,
    obligations,
    debt,
    compliance: reviewClubFinancialCompliance(world, club, operating),
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
    "seasonMatchdayIncome",
    "seasonCommercialIncome",
    "seasonHomeGates",
    "seasonWageOut",
    "seasonFacilityOut",
    "seasonTransferNet",
    "seasonBroadcastIncome",
    "seasonPrizeIncome",
    "seasonCompetitionIncome",
    "seasonLeagueTransitionIncome",
    "seasonFinancingNet",
  ]) {
    finance[field] = 0;
  }
  resetFinanceLedgerSeason(club, season);
  return finance;
}

export { financeLedgerSummary, recordFinanceEntry };
