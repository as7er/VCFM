import assert from "node:assert/strict";
import { matchdayIncome } from "../js/facilities.js";

const club = {
  id: "finance-audit",
  name: "Finance Audit FC",
  division: 1,
  strength: 72,
  youth: { level: 1, players: [] },
  facilities: { stadium: 3, training: 2, youth: 1, projects: [] },
};

const originalRandom = Math.random;
Math.random = () => 0.5;

try {
  const baseOptions = {
    isCup: false,
    isDerby: false,
    isRelegationBattle: false,
    isTitleRace: false,
    winStreak: 0,
    opponentStrength: 50,
    formBonus: 1,
    seasonPhaseBonus: 1,
    detail: true,
  };
  const beforeResult = matchdayIncome(club, { ...baseOptions, won: false });
  const afterWin = matchdayIncome(club, { ...baseOptions, won: true });

  assert.equal(
    afterWin.income,
    beforeResult.income,
    "gate receipts must not depend on a result learned after kickoff"
  );
  assert.equal(afterWin.attendance, beforeResult.attendance);

  const stacked = matchdayIncome(club, {
    ...baseOptions,
    isCup: true,
    cupStage: "final",
    isDerby: true,
    isTitleRace: true,
    formBonus: 1.15,
    seasonPhaseBonus: 1.1,
  });
  assert.ok(stacked.capped, "stacked modifiers should reach the income cap");
  assert.ok(
    stacked.income <= Math.round(stacked.gateBase * 2.5),
    "league-tier modifiers must remain inside the global 2.5x cap"
  );
  assert.ok(stacked.factors.some((factor) => factor.key === "cap"));
  assert.ok(stacked.factors.some((factor) => factor.key === "cup-final"));

  console.log(
    `Finance audit passed: base ${beforeResult.income}, stacked ${stacked.income}, cap ${Math.round(stacked.gateBase * 2.5)}`
  );
} finally {
  Math.random = originalRandom;
}
