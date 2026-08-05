import assert from "node:assert/strict";

import {
  defaultTactics,
  ensureFootballProfile,
  ensureLineupResponsibilities,
  getCaptainId,
  getSetPieceTakerId,
  setCaptainId,
  setSetPieceTakerId,
} from "../js/models.js";
import { SimEngine } from "../js/sim/engine.js";

const ATTR_KEYS = [
  "pace",
  "shooting",
  "passing",
  "dribbling",
  "defending",
  "physical",
  "finishing",
  "tackling",
  "marking",
  "strength",
  "stamina",
  "vision",
  "reflexes",
  "handling",
  "positioning",
  "kicking",
  "heading",
  "crossing",
  "decisions",
];

function attrs(extra = {}) {
  return Object.fromEntries(ATTR_KEYS.map((key) => [key, extra[key] ?? 12]));
}

function player(id, pos, number, extra = {}) {
  return {
    id,
    name: id,
    pos,
    number,
    age: extra.age ?? 27,
    ovr: extra.ovr ?? 13,
    potential: extra.potential ?? 14,
    fitness: 100,
    morale: 75,
    injured: 0,
    suspendedMatches: 0,
    heightCm: extra.heightCm,
    preferredFoot: extra.preferredFoot,
    attrs: attrs(extra.attrs || {}),
  };
}

function club(id) {
  const players = [
    player(`${id}-gk`, "GK", 1),
    player(`${id}-def1`, "DEF", 2),
    player(`${id}-def2`, "DEF", 3),
    player(`${id}-def3`, "DEF", 4),
    player(`${id}-def4`, "DEF", 5),
    player(`${id}-captain`, "MID", 6, { age: 31, attrs: { decisions: 19, positioning: 17, stamina: 16 } }),
    player(`${id}-corner`, "MID", 7, { attrs: { crossing: 20, passing: 18, decisions: 17, kicking: 17 } }),
    player(`${id}-fk`, "MID", 8, { attrs: { kicking: 20, shooting: 18, crossing: 16, decisions: 18 } }),
    player(`${id}-target`, "ATT", 9, { heightCm: 199, attrs: { heading: 20, strength: 18, finishing: 14 } }),
    player(`${id}-pen`, "ATT", 10, { attrs: { finishing: 20, shooting: 18, decisions: 18, kicking: 16 } }),
    player(`${id}-att2`, "ATT", 11, { heightCm: 170, attrs: { heading: 6, strength: 8, finishing: 14 } }),
  ];
  const tactics = defaultTactics();
  tactics.lineup = players.map((p) => p.id);
  return { id, name: id, short: id, power: 70, players, tactics };
}

{
  const legacy = {
    id: "legacy",
    name: "Legacy",
    pos: "ATT",
    age: 24,
    ovr: 12,
    attrs: attrs({ heading: undefined, crossing: undefined, decisions: undefined }),
  };
  delete legacy.heightCm;
  delete legacy.preferredFoot;
  delete legacy.attrs.heading;
  delete legacy.attrs.crossing;
  delete legacy.attrs.decisions;
  assert.equal(ensureFootballProfile(legacy), true, "legacy players must be repairable");
  assert.ok(["right", "left", "both"].includes(legacy.preferredFoot), "preferred foot must be stable");
  assert.ok(legacy.heightCm >= 150 && legacy.heightCm <= 215, "height must be realistic");
  for (const key of ["heading", "crossing", "decisions"]) {
    assert.ok(Number.isFinite(legacy.attrs[key]), `${key} must be added`);
    assert.ok(legacy.attrs[key] >= 1 && legacy.attrs[key] <= 20, `${key} must stay 1-20`);
  }
}

const home = club("home");
const away = club("away");
for (const c of [home, away]) {
  for (const p of c.players) ensureFootballProfile(p);
  ensureLineupResponsibilities(c, { force: true });
  assert.ok(getCaptainId(c), "a valid captain must be selected");
  for (const type of ["penalty", "directFreeKick", "corner"]) {
    assert.ok(getSetPieceTakerId(c, type), `${type} taker must be selected`);
  }
}

assert.equal(setCaptainId(home, "home-captain").ok, true, "manual captain must be accepted");
assert.equal(setSetPieceTakerId(home, "penalty", "home-pen").ok, true, "manual penalty taker must be accepted");
assert.equal(setSetPieceTakerId(home, "directFreeKick", "home-fk").ok, true, "manual free kick taker must be accepted");
assert.equal(setSetPieceTakerId(home, "corner", "home-corner").ok, true, "manual corner taker must be accepted");

let seed = 123456789;
const engine = new SimEngine(home, away, {
  random: () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff),
});

engine._penaltyKick("home");
assert.equal(engine.pendingPenalty?.takerId, "home-pen", "penalty must use the assigned taker");

engine._restart("corner", "home", 2, 4);
assert.equal(engine.ball.owner, "home-corner", "corner must use the assigned taker");

engine._restart("freekick", "home", 50, 24);
assert.equal(engine.ball.owner, "home-fk", "direct free kick must use the assigned taker");

const crosser = engine.agentById("home-corner");
const target = engine.agentById("home-target");
const short = engine.agentById("home-att2");
for (const a of engine.agents) {
  if (a.team !== "home") {
    a.x = 92;
    a.y = 92;
  }
  if (a.team === "home") {
    a.isCore = false;
    if (!["home-corner", "home-target", "home-att2"].includes(a.id)) {
      a.x = 30;
      a.y = 62;
    }
  }
}
crosser.x = 10;
crosser.y = 32;
target.x = 50;
target.y = 12;
target.heightCm = 199;
target.attr.heading = 0.95;
target.attr.strength = 0.9;
short.x = 52;
short.y = 12;
short.heightCm = 170;
short.attr.heading = 0.35;
short.attr.strength = 0.35;
const cross = engine._bestCross(crosser);
assert.equal(cross?.agent?.id, "home-target", "crosses must prefer the stronger aerial target");

console.log("player traits and set-piece responsibilities audit passed");
