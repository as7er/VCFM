import assert from "node:assert/strict";

import {
  advanceDay,
  ensureWorldFinances,
  simulateMatch,
  startNextSeason,
} from "../js/engine.js";
import {
  clubWeeklyOperatingSnapshot,
  ensureClubFinance,
  settleWorldWeeklyFinances,
} from "../js/club-finance.js";
import { CLUB_TEMPLATES } from "../js/data.js";
import { createWorld } from "../js/models.js";
import { ensureWorldStaff } from "../js/staff.js";

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function percentile(values, ratio) {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * ratio))];
}

function median(values) {
  return percentile(values, 0.5);
}

function seasonSnapshot(world) {
  const clubs = world.clubs || [];
  const players = clubs.flatMap((club) => club.players || []);
  const money = clubs.map((club) => Number(club.money) || 0);
  const wages = players.map((player) => Number(player.wage) || 0).filter((value) => value > 0);
  const values = players.map((player) => Number(player.value) || 0).filter((value) => value > 0);
  const ages = players.map((player) => Number(player.age) || 0).filter((value) => value > 0);
  return {
    season: world.season,
    clubs: clubs.length,
    players: players.length,
    negativeClubs: money.filter((value) => value < 0).length,
    medianMoney: median(money),
    p10Money: percentile(money, 0.1),
    p90Money: percentile(money, 0.9),
    medianWage: median(wages),
    medianValue: median(values),
    averageAge: ages.reduce((sum, value) => sum + value, 0) / Math.max(1, ages.length),
    missingPositionClubs: clubs.filter((club) =>
      ["GK", "DEF", "MID", "ATT"].some((position) =>
        !(club.players || []).some((player) => player.pos === position)
      )
    ).length,
    invalidFinanceClubs: clubs.filter((club) => {
      const finance = ensureClubFinance(club);
      return [
        finance.seasonTicketIncome,
        finance.seasonCommercialIncome,
        finance.seasonWageOut,
        finance.seasonFacilityOut,
      ].some((value) => !Number.isFinite(value) || value < 0);
    }).length,
  };
}

function playUserFixturesAsBackground(world, fixtures) {
  const userClubId = world.userClubId;
  world.userClubId = "__ecosystem_audit__";
  try {
    for (const fixture of fixtures || []) {
      if (!fixture.played) simulateMatch(world, fixture);
    }
  } finally {
    world.userClubId = userClubId;
  }
}

const seasons = Math.max(3, Number(process.env.VCFM_ECO_SEASONS) || 5);
const progressEnabled = process.env.VCFM_ECO_PROGRESS === "1";
const progressDays = Math.max(1, Number(process.env.VCFM_ECO_PROGRESS_DAYS) || 30);
const startClub = CLUB_TEMPLATES.find((club) => club.division === 3);
assert.ok(startClub, "ecosystem audit needs a valid starting club");

const auditStartedAt = performance.now();
function logProgress(phase, details = {}) {
  if (!progressEnabled) return;
  console.log("ecosystem progress", JSON.stringify({
    phase,
    elapsedSeconds: Math.round((performance.now() - auditStartedAt) / 100) / 10,
    ...details,
  }));
}

const originalRandom = Math.random;
Math.random = seededRandom(0x1692026);

try {
  const world = createWorld(startClub.id, "Ecosystem Audit");
  logProgress("parity-world-created");
  ensureWorldStaff(world);
  logProgress("parity-staff-ready");
  ensureWorldFinances(world);
  logProgress("parity-finances-ready");

  // Direct parity check: user and AI clubs both receive the exact shared weekly settlement.
  const user = world.clubs.find((club) => club.id === world.userClubId);
  const ai = world.clubs.find((club) => club.id !== world.userClubId && club.division === user.division);
  const before = new Map([user, ai].map((club) => [club.id, Number(club.money) || 0]));
  const expected = new Map([user, ai].map((club) => [club.id, clubWeeklyOperatingSnapshot(world, club)]));
  world.day = 7;
  settleWorldWeeklyFinances(world);
  logProgress("parity-settled");
  for (const club of [user, ai]) {
    const snapshot = expected.get(club.id);
    assert.equal(club.money, before.get(club.id) + snapshot.net, `${club.id} shared weekly settlement`);
    assert.equal(club.finance.seasonCommercialIncome, snapshot.commercialIncome);
    assert.equal(club.finance.seasonWageOut, snapshot.wageOut);
    assert.equal(club.finance.seasonFacilityOut, snapshot.facilityUpkeep);
  }

  // Restart after the parity probe so the longitudinal sample begins from a clean day-one world.
  const longWorld = createWorld(startClub.id, "Long Ecosystem Audit");
  logProgress("long-world-created");
  ensureWorldStaff(longWorld);
  logProgress("long-staff-ready");
  ensureWorldFinances(longWorld);
  logProgress("long-finances-ready");
  const snapshots = [];

  for (let index = 0; index < seasons; index++) {
    let guard = 0;
    let advanceMs = 0;
    let userMatchMs = 0;
    const seasonStartedAt = performance.now();
    while (!longWorld.seasonOver && guard < 420) {
      if (longWorld.board) {
        longWorld.board.targetPos = 18;
        longWorld.board.sackWarnings = 0;
      }
      const advanceStartedAt = performance.now();
      const result = advanceDay(longWorld);
      advanceMs += performance.now() - advanceStartedAt;
      const userMatchStartedAt = performance.now();
      playUserFixturesAsBackground(longWorld, result.userMatches);
      userMatchMs += performance.now() - userMatchStartedAt;
      guard++;
      if (progressEnabled && guard % progressDays === 0) {
        console.log("ecosystem progress", JSON.stringify({
          season: longWorld.season,
          days: guard,
          elapsedSeconds: Math.round((performance.now() - seasonStartedAt) / 100) / 10,
          advanceSeconds: Math.round(advanceMs / 100) / 10,
          userMatchSeconds: Math.round(userMatchMs / 100) / 10,
        }));
      }
    }
    assert.ok(longWorld.seasonOver, `season ${longWorld.season} should complete within 420 days`);
    const snapshot = seasonSnapshot(longWorld);
    snapshots.push(snapshot);
    console.log("ecosystem season", JSON.stringify(snapshot));
    assert.equal(snapshot.clubs, 270, "seven-country club population remains stable");
    assert.ok(snapshot.players >= 270 * 16, "every club retains a viable first team");
    assert.ok(snapshot.players <= 270 * 25, "first-team population should not exceed a realistic 25-player average");
    assert.equal(snapshot.missingPositionClubs, 0, "every club retains all four position groups");
    assert.equal(snapshot.invalidFinanceClubs, 0, "all club ledgers remain finite and non-negative");
    assert.ok(snapshot.negativeClubs <= Math.ceil(snapshot.clubs * 0.15), "widespread insolvency detected");
    assert.ok(snapshot.averageAge >= 22 && snapshot.averageAge <= 30, "player age structure left a plausible range");

    if (index < seasons - 1) {
      const next = startNextSeason(longWorld);
      assert.ok(next.ok, next.msg || "next season should start");
      if (longWorld.board) longWorld.board.targetPos = 18;
    }
  }

  const first = snapshots[0];
  const last = snapshots[snapshots.length - 1];
  assert.ok(last.medianWage <= first.medianWage * 2.5, "median wages inflated too quickly");
  assert.ok(last.medianValue <= first.medianValue * 2.5, "median transfer values inflated too quickly");
  assert.ok(last.p90Money <= Math.max(250_000_000, first.p90Money * 8), "club wealth concentration exploded");

  console.log(JSON.stringify({ seasons, snapshots }, null, 2));
  console.log("Ecosystem audit passed: shared finances, solvency, squads, ages and inflation");
} finally {
  Math.random = originalRandom;
}
