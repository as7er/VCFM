import assert from "node:assert/strict";

import { SimEngine, SIM } from "../js/sim/engine.js";
import { deriveMatchAnalysis, estimateShotXg } from "../js/match-analysis.js";

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let n = value;
    n = Math.imul(n ^ (n >>> 15), n | 1);
    n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}

function makeClub(id, ability, tactics = {}) {
  const roles = ["GK", "DEF", "DEF", "DEF", "DEF", "MID", "MID", "MID", "ATT", "ATT", "ATT"];
  const players = roles.map((pos, index) => {
    const rating = Math.max(1, Math.min(20, ability + ((index * 7 + ability) % 5) - 2));
    return {
      id: `${id}-p${index}`,
      name: `${id} Player ${index + 1}`,
      pos,
      number: index + 1,
      fitness: 100,
      attrs: {
        pace: rating,
        shooting: rating,
        passing: rating,
        dribbling: rating,
        finishing: rating,
        tackling: rating,
        marking: rating,
        strength: rating,
        stamina: rating,
        vision: rating,
        reflexes: rating,
        handling: rating,
        positioning: rating,
        kicking: rating,
      },
    };
  });
  return {
    id,
    name: id,
    players,
    tactics: {
      formation: "4-3-3",
      lineup: players.map((player) => player.id),
      pressing: 3,
      tempo: 3,
      width: 3,
      defensiveLine: 3,
      style: "balanced",
      ...tactics,
    },
  };
}

function run(seed) {
  const home = makeClub("Harbour", 13, { pressing: 5, defensiveLine: 4 });
  const away = makeClub("Vale", 13, { pressing: 2, defensiveLine: 2 });
  const engine = new SimEngine(home, away, { random: seededRandom(seed) });
  const steps = Math.round((90 * 60) / SIM.DT);
  for (let step = 0; step < steps; step++) engine.step();
  return { engine, home, away, analysis: deriveMatchAnalysis(engine.events, { home, away }) };
}

const first = run(180001);
const second = run(180001);
assert.deepEqual(first.analysis, second.analysis, "same seed must reproduce the full analysis");

const direct = first.engine.directResult();
for (const team of ["home", "away"]) {
  const side = first.analysis[team];
  const rawPasses = first.engine.events.filter((event) => event.type === "pass" && event.team === team).length;
  const rawPressures = first.engine.events.filter((event) => event.type === "pressure" && event.team === team).length;
  const rawRegains = first.engine.events.filter(
    (event) => (event.type === "tackle" || event.type === "intercept") && event.team === team
  ).length;
  const shotXg = first.engine.events
    .filter((event) => event.type === "shot" && event.team === team)
    .reduce((sum, shot) => sum + estimateShotXg(shot), 0);

  assert.equal(side.shots.length, direct.shots[team], `${team} shot map must contain every shot`);
  assert.equal(side.progression.passesAttempted, rawPasses, `${team} pass attempts must come from pass events`);
  assert.ok(side.progression.passesCompleted <= rawPasses, `${team} completed passes cannot exceed attempts`);
  assert.equal(side.pressing.pressures, rawPressures, `${team} pressure count must come from pressure events`);
  assert.equal(side.pressing.regains, rawRegains, `${team} regains must come from defensive events`);
  assert.ok(side.progression.progressivePasses <= side.progression.passesCompleted);
  assert.ok(side.progression.finalThirdEntries <= side.progression.passesCompleted);
  assert.ok(side.progression.boxEntries <= side.progression.passesCompleted);
  assert.ok(side.pressing.pressureSuccessPct >= 0 && side.pressing.pressureSuccessPct <= 100);
  assert.ok(side.heatmap.cells.some((value) => value > 0), `${team} heatmap must contain spatial actions`);
  assert.ok(side.network.nodes.length > 0, `${team} pass network must contain players`);
  assert.equal(side.xg, Math.round(shotXg * 100) / 100, `${team} analysis xG must sum shot xG`);
  assert.equal(side.xg, Math.round(direct.xg[team] * 100) / 100, `${team} report and analysis xG must agree`);
  for (const shot of side.shots) {
    assert.ok(shot.x >= 0 && shot.x <= 100 && shot.y >= 0 && shot.y <= 100);
    assert.ok(["goal", "saved", "blocked", "offTarget"].includes(shot.outcome));
  }
}

assert.equal(estimateShotXg({ penalty: true }), 0.76, "penalty xG must use the fixed historical rate");
const sameChance = { team: "home", x: 50, y: 14, distance: 14, pressure: 0.2 };
assert.equal(
  estimateShotXg(sameChance),
  estimateShotXg({ ...sameChance, offTarget: true }),
  "post-shot outcome must not alter pre-shot xG"
);

console.log(JSON.stringify({
  score: direct.score,
  shots: direct.shots,
  xg: { home: first.analysis.home.xg, away: first.analysis.away.xg },
  passes: {
    home: first.analysis.home.progression,
    away: first.analysis.away.progression,
  },
  pressing: {
    home: first.analysis.home.pressing,
    away: first.analysis.away.pressing,
  },
}, null, 2));

for (const team of ["home", "away"]) {
  const completion = first.analysis[team].progression.passCompletionPct;
  assert.ok(
    completion >= 68 && completion <= 90,
    `${team} pass completion ${completion}% left the plausible range`
  );
}

