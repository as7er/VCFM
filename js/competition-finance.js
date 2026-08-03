/** Competition distributions derived from the actual tournament and result. */

import { recordFinanceEntry } from "./finance-ledger.js";

export const COMPETITION_FINANCE_VERSION = 1;

const DOMESTIC_WIN_PRIZE = Object.freeze({
  R64: 20_000,
  R32: 40_000,
  R16: 80_000,
  QF: 175_000,
  SF: 350_000,
  F: 900_000,
});

const CONTINENTAL_SCALE = Object.freeze({
  champions: 1,
  union: 0.6,
  conference: 0.35,
});

const CONTINENTAL_BASE = Object.freeze({
  participation: 2_400_000,
  leagueWin: 450_000,
  leagueDraw: 150_000,
  quarterFinal: 900_000,
  QF: 1_200_000,
  SF: 2_000_000,
  F: 4_000_000,
  runnerUp: 1_500_000,
});

function money(value) {
  return Math.max(0, Math.round(Number(value) || 0));
}

function clubById(world, id) {
  return world?.clubs?.find((club) => club.id === id) || null;
}

function scaleFor(tournament) {
  return CONTINENTAL_SCALE[tournament?.key] || 0.35;
}

function scaled(tournament, key) {
  return money((CONTINENTAL_BASE[key] || 0) * scaleFor(tournament));
}

function recordCompetitionIncome(world, clubId, amount, source, tournament, fixture = null) {
  const club = clubById(world, clubId);
  const value = money(amount);
  if (!club || value <= 0) return null;
  return recordFinanceEntry(club, value, {
    category: "competition",
    source,
    season: world.season,
    day: world.day,
    meta: {
      competitionId: tournament?.id || fixture?.competitionId || null,
      competitionName: tournament?.name || fixture?.competitionName || null,
      fixtureId: fixture?.id || null,
      round: fixture?.round || null,
    },
  });
}

function notifyUser(world, clubId, text) {
  if (clubId !== world?.userClubId) return;
  if (!Array.isArray(world.news)) world.news = [];
  world.news.unshift({ day: world.day, text });
}

/**
 * New continental seasons receive participation money once. Existing in-progress
 * saves are marked as migrated without retroactively changing their cash balance.
 */
export function ensureCompetitionParticipationFinance(world, tournament) {
  if (!world || tournament?.type !== "continental") return 0;
  if (!tournament.finance || typeof tournament.finance !== "object") tournament.finance = {};
  if (!Array.isArray(tournament.finance.participationPaid)) {
    const inProgress = (tournament.fixtures || []).some((fixture) => fixture.played);
    tournament.finance.participationPaid = inProgress ? [...(tournament.participants || [])] : [];
  }
  tournament.finance.version = COMPETITION_FINANCE_VERSION;
  const paid = new Set(tournament.finance.participationPaid);
  let total = 0;
  for (const clubId of tournament.participants || []) {
    if (paid.has(clubId)) continue;
    const amount = scaled(tournament, "participation");
    if (recordCompetitionIncome(world, clubId, amount, "competition-participation", tournament)) {
      paid.add(clubId);
      total += amount;
      notifyUser(
        world,
        clubId,
        `📺 ${tournament.name}参赛分成 ${amount.toLocaleString()} 已入账。`
      );
    }
  }
  tournament.finance.participationPaid = [...paid];
  return total;
}

export function settleContinentalLeagueQualification(world, tournament, qualifierIds) {
  if (!world || tournament?.type !== "continental") return 0;
  if (!tournament.finance || typeof tournament.finance !== "object") tournament.finance = {};
  const paid = new Set(tournament.finance.quarterFinalPaid || []);
  let total = 0;
  for (const clubId of qualifierIds || []) {
    if (paid.has(clubId)) continue;
    const amount = scaled(tournament, "quarterFinal");
    if (recordCompetitionIncome(world, clubId, amount, "competition-quarter-final", tournament)) {
      paid.add(clubId);
      total += amount;
      notifyUser(world, clubId, `🌐 晋级${tournament.name}八强，奖金 ${amount.toLocaleString()} 已入账。`);
    }
  }
  tournament.finance.quarterFinalPaid = [...paid];
  return total;
}

function settleDomesticFixture(world, tournament, fixture) {
  const winnerId = fixture.winner ||
    (fixture.homeGoals > fixture.awayGoals ? fixture.home : fixture.away);
  const stage = String(fixture.round || "");
  const winnerPrize = DOMESTIC_WIN_PRIZE[stage] || 20_000;
  recordCompetitionIncome(world, winnerId, winnerPrize, "domestic-cup-prize", tournament, fixture);
  notifyUser(world, winnerId, `🏆 ${fixture.roundLabel || tournament.name}奖金 ${winnerPrize.toLocaleString()} 已入账。`);
  if (stage === "F") {
    const runnerId = winnerId === fixture.home ? fixture.away : fixture.home;
    const runnerPrize = Math.round(winnerPrize * 0.4);
    recordCompetitionIncome(world, runnerId, runnerPrize, "domestic-cup-runner-up", tournament, fixture);
    notifyUser(world, runnerId, `🏆 ${tournament.name}亚军奖金 ${runnerPrize.toLocaleString()} 已入账。`);
  }
}

function settleContinentalFixture(world, tournament, fixture) {
  if (fixture.competitionType === "continental-league-stage") {
    if (fixture.homeGoals > fixture.awayGoals) {
      const amount = scaled(tournament, "leagueWin");
      recordCompetitionIncome(world, fixture.home, amount, "continental-match-win", tournament, fixture);
      notifyUser(world, fixture.home, `🌐 ${tournament.name}胜场奖金 ${amount.toLocaleString()} 已入账。`);
    } else if (fixture.homeGoals < fixture.awayGoals) {
      const amount = scaled(tournament, "leagueWin");
      recordCompetitionIncome(world, fixture.away, amount, "continental-match-win", tournament, fixture);
      notifyUser(world, fixture.away, `🌐 ${tournament.name}胜场奖金 ${amount.toLocaleString()} 已入账。`);
    } else {
      const amount = scaled(tournament, "leagueDraw");
      for (const clubId of [fixture.home, fixture.away]) {
        recordCompetitionIncome(world, clubId, amount, "continental-match-draw", tournament, fixture);
        notifyUser(world, clubId, `🌐 ${tournament.name}平局奖金 ${amount.toLocaleString()} 已入账。`);
      }
    }
    return;
  }

  const winnerId = fixture.winner ||
    (fixture.homeGoals > fixture.awayGoals ? fixture.home : fixture.away);
  const stage = String(fixture.round || "");
  const amount = scaled(tournament, stage);
  recordCompetitionIncome(world, winnerId, amount, "continental-progress-prize", tournament, fixture);
  notifyUser(world, winnerId, `🌐 ${fixture.roundLabel || tournament.name}晋级奖金 ${amount.toLocaleString()} 已入账。`);
  if (stage === "F") {
    const runnerId = winnerId === fixture.home ? fixture.away : fixture.home;
    const runnerPrize = scaled(tournament, "runnerUp");
    recordCompetitionIncome(world, runnerId, runnerPrize, "continental-runner-up", tournament, fixture);
    notifyUser(world, runnerId, `🌐 ${tournament.name}亚军奖金 ${runnerPrize.toLocaleString()} 已入账。`);
  }
}

/** Settle one played fixture exactly once for both user and AI clubs. */
export function settleCompetitionFixtureFinance(world, tournament, fixture) {
  if (!world || !tournament || !fixture?.played || fixture._competitionFinanceSettled) return false;
  if (tournament.type === "domestic") settleDomesticFixture(world, tournament, fixture);
  else settleContinentalFixture(world, tournament, fixture);
  fixture._competitionFinanceSettled = COMPETITION_FINANCE_VERSION;
  return true;
}
