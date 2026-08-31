/** Multi-season sponsorship contracts with visible base income and performance risk. */

import { recordFinanceEntry } from "./finance-ledger.js";

export const SPONSORSHIP_VERSION = 1;

/**
 * 赞助市场的名义通胀。现实里转播与赞助合同每个周期都会重新定价，
 * 而球员工资和身价本来就随能力增长走高；市场价固定不动会让所有俱乐部
 * 的经常性收支逐年恶化。基准取开局赛季，每季 3%，略高于实测的单人工资
 * 通胀（约 2.7%/季），让健康经营的俱乐部还能慢慢攒下钱。
 *
 * 只影响新签合同的定价：已生效合同的 weeklyBase 存在存档里，不会被改写，
 * 所以老档是在合同到期换约时自然跟上，和现实中的续约涨价一致。
 */
const SPONSORSHIP_BASE_SEASON = 2026;
const SPONSORSHIP_SEASON_INFLATION = 0.03;

function marketInflation(season) {
  const value = Number(season);
  if (!Number.isFinite(value)) return 1;
  return Math.pow(1 + SPONSORSHIP_SEASON_INFLATION, Math.max(0, value - SPONSORSHIP_BASE_SEASON));
}

const SPONSOR_NAMES = [
  "Northstar Mobility", "Civic Union Bank", "Vertex Systems", "Summit Air",
  "Harbour Foods", "Coreline Energy", "Meridian Telecom", "Foundry Works",
  "Pioneer Health", "Atlas Logistics", "Oakfield Retail", "Clearwater Finance",
];

function number(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function stableHash(value) {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function sponsorshipMarketWeekly(club, season = null) {
  const division = Math.max(1, Math.round(number(club?.division) || 3));
  const tier = division === 1 || division === 4 || division === 6 || division === 8 || division === 10
    ? 1
    : division === 2 || division === 5 || division === 7 || division === 9 || division === 11
      ? 2
      : 3;
  const base = { 1: 220_000, 2: 135_000, 3: 120_000 }[tier] || 120_000;
  const power = Math.max(40, Math.min(85, number(club?.power) || 55));
  const strengthFactor = 0.75 + ((power - 40) / 45) * 0.65;
  return Math.round(base * strengthFactor * marketInflation(season));
}

function sponsorName(club, season, offset) {
  const index = stableHash(`${club.id}:${season}:${offset}`) % SPONSOR_NAMES.length;
  return SPONSOR_NAMES[index];
}

function makeOffer(club, startSeason, kind, index) {
  const market = sponsorshipMarketWeekly(club, startSeason);
  const profiles = {
    stable: { years: 3, baseFactor: 0.82 * 1.02, targetRate: 0.4, bonusWeeks: 8, signingWeeks: 4 },
    balanced: { years: 2, baseFactor: 0.82 * 0.93, targetRate: 0.3, bonusWeeks: 14, signingWeeks: 5 },
    performance: { years: 1, baseFactor: 0.82 * 0.82, targetRate: 0.2, bonusWeeks: 22, signingWeeks: 6 },
  };
  const profile = profiles[kind];
  const weeklyBase = Math.max(10_000, Math.round(market * profile.baseFactor));
  return {
    id: `sp_${club.id}_${startSeason}_${kind}`,
    sponsor: sponsorName(club, startSeason, index),
    kind,
    startSeason,
    endSeason: startSeason + profile.years - 1,
    years: profile.years,
    weeklyBase,
    signingBonus: Math.round(weeklyBase * profile.signingWeeks),
    targetRate: profile.targetRate,
    performanceBonus: Math.round(weeklyBase * profile.bonusWeeks),
  };
}

function offersFor(club, startSeason) {
  return ["stable", "balanced", "performance"].map((kind, index) =>
    makeOffer(club, startSeason, kind, index)
  );
}

function initialContract(world, club) {
  const market = sponsorshipMarketWeekly(club, world.season);
  return {
    id: `sp_${club.id}_${world.season}_incumbent`,
    sponsor: sponsorName(club, world.season, 9),
    kind: "incumbent",
    startSeason: world.season,
    endSeason: world.season,
    years: 1,
    weeklyBase: Math.round(market * 0.82),
    signingBonus: 0,
    targetRate: 0.5,
    performanceBonus: Math.round(market * 0.82 * 6),
    activationPaid: true,
  };
}

function chooseAiOffer(club, offers) {
  const season = offers[0]?.startSeason ?? null;
  if (number(club.money) < sponsorshipMarketWeekly(club, season) * 6) return offers[0];
  return (number(club.power) || 50) >= 68 ? offers[2] : offers[1];
}

function activateContract(world, club, state, contract) {
  state.activeContract = { ...contract };
  state.nextContract = null;
  if (!state.activeContract.activationPaid && state.activeContract.signingBonus > 0) {
    recordFinanceEntry(club, state.activeContract.signingBonus, {
      category: "commercial",
      source: "sponsorship-signing",
      season: world.season,
      day: world.day,
      meta: { contractId: state.activeContract.id, sponsor: state.activeContract.sponsor },
    });
    state.activeContract.activationPaid = true;
  }
}

export function ensureClubSponsorship(world, club) {
  if (!world || !club) return null;
  if (!club.sponsorship || typeof club.sponsorship !== "object") club.sponsorship = {};
  const state = club.sponsorship;
  state.version = SPONSORSHIP_VERSION;
  if (!state.activeContract) state.activeContract = initialContract(world, club);

  if (number(state.activeContract.endSeason) < number(world.season)) {
    const startSeason = world.season;
    const offers = offersFor(club, startSeason);
    const selected = state.nextContract?.startSeason === startSeason
      ? state.nextContract
      : chooseAiOffer(club, offers);
    activateContract(world, club, state, selected);
  }

  const nextSeason = number(state.activeContract.endSeason) + 1;
  if (state.offerSeason !== nextSeason || !Array.isArray(state.offers) || state.offers.length !== 3) {
    state.offerSeason = nextSeason;
    state.offers = offersFor(club, nextSeason);
    if (state.nextContract?.startSeason !== nextSeason) state.nextContract = null;
  }
  return state;
}

export function ensureWorldSponsorships(world) {
  for (const club of world?.clubs || []) ensureClubSponsorship(world, club);
  return world;
}

export function acceptSponsorshipOffer(world, clubId, offerId) {
  const club = world?.clubs?.find((candidate) => candidate.id === clubId);
  if (!club || club.id !== world.userClubId) return { ok: false, msg: "只能管理当前俱乐部的赞助合同" };
  const state = ensureClubSponsorship(world, club);
  const offer = state.offers.find((candidate) => candidate.id === offerId);
  if (!offer) return { ok: false, msg: "赞助报价已失效" };
  state.nextContract = { ...offer };
  return { ok: true, msg: `已与 ${offer.sponsor} 签署下一份赞助合同`, contract: state.nextContract };
}

export function clubCommercialBreakdown(world, club) {
  const market = sponsorshipMarketWeekly(club, world?.season);
  const state = world ? ensureClubSponsorship(world, club) : null;
  const sponsorship = Math.max(0, Math.round(number(state?.activeContract?.weeklyBase) || market * 0.82));
  const otherCommercial = Math.max(0, Math.round(market * 0.18));
  return { sponsorship, otherCommercial, total: sponsorship + otherCommercial };
}

export function settleSponsorshipSeason(world, getSortedTable) {
  const settlements = [];
  for (const club of world?.clubs || []) {
    const state = ensureClubSponsorship(world, club);
    const contract = state.activeContract;
    if (!contract || contract.bonusSettledSeason === world.season) continue;
    const table = getSortedTable(world, club.division);
    const tableIndex = table.findIndex((row) => row?.id === club.id || row?.club?.id === club.id);
    const position = tableIndex >= 0 ? tableIndex + 1 : Math.max(1, table.length);
    const targetPosition = Math.max(1, Math.ceil(table.length * number(contract.targetRate)));
    const achieved = position <= targetPosition;
    if (achieved && contract.performanceBonus > 0) {
      recordFinanceEntry(club, contract.performanceBonus, {
        category: "commercial",
        source: "sponsorship-performance",
        season: world.season,
        day: world.day,
        meta: { contractId: contract.id, sponsor: contract.sponsor, position, targetPosition },
      });
    }
    contract.bonusSettledSeason = world.season;
    contract.lastResult = { season: world.season, position, targetPosition, achieved };
    settlements.push({ clubId: club.id, position, targetPosition, achieved, amount: achieved ? contract.performanceBonus : 0 });
  }
  return settlements;
}

export function sponsorshipSnapshot(world, club) {
  const state = ensureClubSponsorship(world, club);
  const active = state.activeContract;
  const teamCount = Math.max(1, (world.clubs || []).filter((candidate) => candidate.division === club.division).length);
  return {
    active,
    next: state.nextContract,
    offers: state.offers,
    targetPosition: Math.max(1, Math.ceil(teamCount * number(active.targetRate))),
    otherCommercialWeekly: Math.round(sponsorshipMarketWeekly(club, world?.season) * 0.18),
  };
}
