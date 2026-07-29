import assert from "node:assert/strict";
import { diagnoseInjury, injuryRiskMultiplier, processInjuryRecoveryDay } from "../js/injuries.js";
import { agePlayerOneYear, archiveAndResetSeasonStats, autoLineup, emptyMatchStats } from "../js/models.js";
import { generateClubSeasonPlan } from "../js/board.js";

function sequenceRandom(values, fallback = 0.99) {
  let index = 0;
  return () => values[index++] ?? fallback;
}

function makePlayer(id, pos, ovr, fitness = 100, age = 25) {
  const value = Math.max(1, Math.min(20, ovr));
  return {
    id, name: id, pos, age, ovr: value, potential: value, fitness, morale: 70, injured: 0,
    attrs: {
      pace: value, shooting: value, passing: value, dribbling: value,
      defending: value, physical: value, finishing: value, tackling: value,
      marking: value, strength: value, stamina: value, vision: value,
      reflexes: value, handling: value, positioning: value, kicking: value,
    },
    stats: emptyMatchStats(), leagueStats: {}, competitionStats: {},
    career: emptyMatchStats(), history: [],
  };
}

const injured = makePlayer("injured", "MID", 12);
const diagnosis = diagnoseInjury(injured, {
  cause: "training", day: 10, season: 3, random: sequenceRandom([0, 0.5, 0.99]),
});
assert.equal(diagnosis.key, "training-knock");
assert.equal(diagnosis.totalDays, 3);
assert.equal(injured.injuryHistory.length, 1);
assert.equal(injuryRiskMultiplier(injured), 1.054);

for (let day = 0; day < 3; day++) processInjuryRecoveryDay(injured, { random: () => 0.99 });
assert.equal(injured.injured, 0);
assert.equal(injured.returnToPlayDays, 2);
assert.ok(injuryRiskMultiplier(injured) > 1.2);
processInjuryRecoveryDay(injured, { random: () => 0.99 });
processInjuryRecoveryDay(injured, { random: () => 0.99 });
assert.equal(injured.returnToPlayDays, 0);
assert.equal(injured.injury, null);

const positions = ["GK", "DEF", "DEF", "DEF", "DEF", "MID", "MID", "MID", "ATT", "ATT", "ATT"];
const players = positions.map((pos, index) => makePlayer("fresh-" + index, pos, 14, 92));
const tired = players.map((player, index) => ({
  ...makePlayer("tired-" + index, player.pos, 16, 92), lastStartedDay: 100, recentStartDays: [94, 97, 100],
}));
const club = { id: "rotation", tactics: { formation: "4-3-3", lineup: [] }, players: [...tired, ...players] };
autoLineup(club, { day: 102, importance: 0.45 });
assert.ok(club.tactics.lineup.some((id) => id.startsWith("fresh-")), "congested schedule should rotate comparable players");

const oldAttacker = makePlayer("old-att", "ATT", 15, 100, 31);
const oldKeeper = makePlayer("old-gk", "GK", 15, 100, 31);
const originalRandom = Math.random;
Math.random = () => 0;
try { agePlayerOneYear(oldAttacker); agePlayerOneYear(oldKeeper); } finally { Math.random = originalRandom; }
assert.ok(oldAttacker.ageingLast.physical >= 1, "attacker should enter physical decline by age 32");
assert.equal(oldKeeper.ageingLast.physical, 0, "keeper should decline later than an attacker");

const resetPlayer = makePlayer("reset", "DEF", 12);
resetPlayer.injured = 7;
resetPlayer.injury = { key: "ankle", recurrence: 0.12, totalDays: 7, daysRemaining: 7 };
resetPlayer.returnToPlayDays = 3;
archiveAndResetSeasonStats(resetPlayer, 1, "club", "Club");
assert.equal(resetPlayer.injured, 0);
assert.equal(resetPlayer.injury, null);
assert.equal(resetPlayer.returnToPlayDays, 0);

const sustainableClub = {
  id: "sustainable", division: 1, power: 60, money: 100_000, facilities: { youth: 1 },
  players: Array.from({ length: 18 }, (_, index) => ({
    ...makePlayer("s-" + index, index === 0 ? "GK" : index < 7 ? "DEF" : index < 13 ? "MID" : "ATT", 12),
    wage: 10_000, value: 400_000,
  })),
};
const peer = { ...sustainableClub, id: "peer", power: 70, money: 5_000_000 };
assert.equal(generateClubSeasonPlan(sustainableClub, [sustainableClub, peer], 1).key, "sustainable");

console.log("Long-term reality audit passed: injuries, recovery, rotation, ageing and season plans");
