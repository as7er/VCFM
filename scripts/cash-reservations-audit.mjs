import assert from "node:assert/strict";

import { clubCashAvailability } from "../js/cash-reservations.js";
import { renewPlayer } from "../js/contracts.js";
import { startFacilityUpgrade } from "../js/facilities.js";
import { startScoutMission } from "../js/worldpulse.js";

function player(id = "p1") {
  return {
    id,
    name: `Player ${id}`,
    pos: "MID",
    age: 26,
    ovr: 12,
    potential: 13,
    wage: 5_000,
    contractYears: 1,
    fitness: 100,
    morale: 70,
    value: 500_000,
    attrs: { passing: 12, vision: 12, stamina: 12, pace: 12, shooting: 12 },
  };
}

function club(id, money) {
  return {
    id,
    name: `Club ${id}`,
    division: 1,
    power: 65,
    money,
    players: [player()],
    youth: { level: 1, players: [] },
    facilities: { stadium: 1, training: 1, youth: 1, projects: [] },
    staff: {},
    finance: { financeLedger: [], ledgerSeq: 0 },
  };
}

function worldWithReservation(userClub, negotiation) {
  return {
    season: 2026,
    day: 10,
    userClubId: userClub.id,
    clubs: [userClub],
    news: [],
    scoutMissions: [],
    transferNegotiations: [{
      id: "reserved-deal",
      buyerClubId: userClub.id,
      fee: 2_000_000,
      wage: 100_000,
      years: 3,
      status: "player_review",
      ...negotiation,
    }],
  };
}

// Pure availability uses cash less every active transfer fee and signing bonus.
{
  const user = club("availability", 3_000_000);
  const world = worldWithReservation(user);
  assert.deepEqual(
    clubCashAvailability(world, user, 850_000),
    { ok: true, cash: 3_000_000, reserved: 2_150_000, available: 850_000, required: 850_000, shortfall: 0 }
  );
  assert.equal(clubCashAvailability(world, user, 850_001).ok, false);
}

// Facility construction cannot consume transfer-reserved cash; cancellation releases it.
{
  const user = club("facility", 3_000_000);
  const world = worldWithReservation(user);
  const blocked = startFacilityUpgrade(world, user.id, "training");
  assert.equal(blocked.ok, false);
  assert.match(blocked.msg, /转会谈判已占用/);
  assert.equal(user.money, 3_000_000);
  assert.equal(user.facilities.projects.length, 0);

  world.transferNegotiations[0].status = "cancelled";
  assert.equal(startFacilityUpgrade(world, user.id, "training").ok, true);
  assert.equal(user.money, 1_500_000);
  assert.equal(user.facilities.projects.length, 1);
}

// Renewal and scouting also remain side-effect free while cash is reserved.
{
  const user = club("operations", 1_000_000);
  const world = worldWithReservation(user, { fee: 820_000, wage: 100_000 });
  const squadPlayer = user.players[0];
  const offer = { years: 3, newWage: 8_000, fee: 100_000 };
  const blockedRenewal = renewPlayer(user, squadPlayer, offer, world);
  assert.equal(blockedRenewal.ok, false);
  assert.match(blockedRenewal.msg, /转会谈判已占用/);
  assert.equal(squadPlayer.wage, 5_000);
  assert.equal(user.money, 1_000_000);

  const blockedScout = startScoutMission(world, "intl");
  assert.equal(blockedScout.ok, false);
  assert.equal(world.scoutMissions.length, 0);

  world.transferNegotiations[0].status = "cancelled";
  assert.equal(renewPlayer(user, squadPlayer, offer, world).ok, true);
  assert.equal(startScoutMission(world, "intl").ok, true);
  assert.equal(user.money, 860_000);
}

console.log("Cash reservations audit passed: shared availability, blocked side effects, and release after cancellation");
