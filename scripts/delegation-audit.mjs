import assert from "node:assert/strict";

import { FORMATIONS } from "../js/data.js";
import {
  applyDelegatedLineup,
  applyDelegatedTactics,
  applyDelegatedTraining,
  ensureDelegation,
  setManagementMode,
} from "../js/delegation.js";
import { autoLineup, defaultTactics } from "../js/models.js";

function player(id, pos, ovr, options = {}) {
  return {
    id,
    name: id,
    pos,
    ovr,
    potential: options.potential ?? ovr + 1,
    age: options.age ?? 27,
    fitness: options.fitness ?? 90,
    morale: options.morale ?? 70,
    injured: options.injured ?? 0,
    suspendedMatches: 0,
    attrs: {},
  };
}

function squad() {
  const players = [player("gk", "GK", 14)];
  for (let i = 0; i < 7; i++) players.push(player(`d${i}`, "DEF", 16 - i * 0.3));
  for (let i = 0; i < 8; i++) players.push(player(`m${i}`, "MID", 16 - i * 0.25));
  for (let i = 0; i < 6; i++) players.push(player(`a${i}`, "ATT", 16 - i * 0.4));
  return players;
}

function fixture(day = 5) {
  return { day, home: "user", away: "opp", played: false };
}

function testWorld() {
  const club = {
    id: "user",
    name: "User",
    power: 70,
    players: squad(),
    tactics: defaultTactics(),
    staff: { coach: { id: "coach", name: "Coach", role: "coach", rating: 15, wage: 1000, age: 45, contractYears: 3, clubId: "user" } },
  };
  const opponent = { id: "opp", name: "Opponent", power: 65, players: squad(), tactics: defaultTactics() };
  const world = { day: 1, season: 1, userClubId: club.id, clubs: [club, opponent], fixtures: [fixture()] };
  return { world, club, opponent };
}

{
  const { world, club } = testWorld();
  const delegation = ensureDelegation(world, club);
  assert.equal(world.managementMode, "head_coach");
  assert.equal(delegation.training, "player");
  assert.equal(delegation.lineup, "player");
  assert.equal(delegation.tactics, "player");
}

{
  const { world, club } = testWorld();
  const delegation = ensureDelegation(world, club);
  delegation.training = "staff";
  for (const player of club.players) player.fitness = 55;
  const result = applyDelegatedTraining(world, club);
  assert.equal(result.ok, true);
  assert.equal(club.training.focus, "recovery");
  assert.equal(club.training.intensity, "light");
}

{
  const { world, club } = testWorld();
  const delegation = ensureDelegation(world, club);
  delegation.lineup = "staff";
  delegation.locks.playerIds = ["a5"];
  const result = applyDelegatedLineup(world, club);
  assert.equal(result.ok, true);
  assert.ok(result.lineup.includes("a5"));
  club.players.find((p) => p.id === "a5").injured = 10;
  const injuredResult = applyDelegatedLineup(world, club);
  assert.ok(!injuredResult.lineup.includes("a5"));
  assert.ok(injuredResult.unavailableLocked.includes("a5"));
}

{
  const { world, club } = testWorld();
  const delegation = ensureDelegation(world, club);
  club.tactics.formation = "5-3-2";
  delegation.tactics = "staff";
  delegation.locks.formation = true;
  const result = applyDelegatedTactics(world, club, fixture());
  assert.equal(result.ok, true);
  assert.equal(club.tactics.formation, "5-3-2");
  assert.ok(FORMATIONS[club.tactics.formation]);
}

{
  const { club } = testWorld();
  const senior = club.players.find((p) => p.id === "a0");
  const youth = club.players.find((p) => p.id === "a1");
  senior.ovr = 15;
  youth.ovr = 14.9;
  youth.age = 19;
  youth.potential = 18;
  autoLineup(club, { youthPriority: "high" });
  assert.ok(club.tactics.lineup.includes(youth.id));
  senior.ovr = 19;
  autoLineup(club, { youthPriority: "high" });
  assert.ok(club.tactics.lineup.includes(senior.id));
}

{
  const { world, club } = testWorld();
  delete club.staff.coach;
  const result = setManagementMode(world, club, "club_director");
  assert.equal(result.ok, false);
  assert.notEqual(world.managementMode, "club_director");
}

{
  const { world, club } = testWorld();
  const result = setManagementMode(world, club, "club_director");
  assert.equal(result.ok, true);
  const tactics = applyDelegatedTactics(world, club, fixture());
  assert.equal(tactics.ok, true);
  assert.equal("matchBonus" in club, false);
  assert.equal("delegationMod" in club.tactics, false);
  assert.equal("power" in tactics, false);
}

console.log("delegation audit passed");
