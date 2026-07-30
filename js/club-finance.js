/** Shared club finances: every club earns and pays from the same visible data. */

import { DIVISIONS } from "./data.js";
import { ensureFacilities, facilityWeeklyUpkeep, youthFacilityInfo } from "./facilities.js";
import { ensureLoans } from "./loans.js";
import { ensureStaff, staffWageBill } from "./staff.js";

export const CLUB_FINANCE_VERSION = 1;

function number(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

export function ensureClubFinance(club) {
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
  return finance;
}

export function ensureWorldFinances(world) {
  for (const club of world?.clubs || []) ensureClubFinance(club);
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
    club.money = number(club.money) + snapshot.net;
    finance.seasonCommercialIncome += snapshot.commercialIncome;
    finance.seasonWageOut += snapshot.wageOut;
    finance.seasonFacilityOut += snapshot.facilityUpkeep;
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

export function recordMatchdayFinance(club, gate, day) {
  const finance = ensureClubFinance(club);
  const income = Math.max(0, Math.round(number(gate?.income ?? gate)));
  club.money = number(club.money) + income;
  finance.lastTicketIncome = income;
  finance.lastTicketDay = day;
  finance.lastAttendance = gate?.attendance ?? null;
  finance.lastCapacity = gate?.capacity ?? null;
  finance.lastFillPct = gate?.fill ?? null;
  finance.lastTicketFactors = Array.isArray(gate?.factors) ? gate.factors : [];
  finance.seasonTicketIncome += income;
  finance.seasonHomeGates += 1;
  return income;
}

export function resetClubSeasonFinance(club) {
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
  return finance;
}
