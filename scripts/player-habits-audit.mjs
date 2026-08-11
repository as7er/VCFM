import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { CLUB_TEMPLATES } from "../js/data.js";
import {
  createWorld,
  defaultTactics,
  ensureFootballProfile,
} from "../js/models.js";
import {
  PLAYER_HABIT_IDS,
  availableHabitTraining,
  ensurePlayerHabits,
  processHabitTrainingWeek,
  startHabitTraining,
} from "../js/player-habits.js";
import {
  ensureScoutingKnowledge,
  observeScoutingPlayer,
  scoutPlayerSnapshot,
} from "../js/scouting-knowledge.js";
import { SimEngine } from "../js/sim/engine.js";
import { validateSaveStructure } from "../js/save-schema.js";
import { ensureStaff } from "../js/staff.js";

const repo = resolve(import.meta.dirname, "..");
const ATTR_KEYS = [
  "pace", "shooting", "passing", "dribbling", "defending", "physical", "finishing",
  "tackling", "marking", "strength", "stamina", "vision", "reflexes", "handling",
  "positioning", "kicking", "heading", "crossing", "decisions",
];

function attrs(value = 13, extra = {}) {
  return Object.fromEntries(ATTR_KEYS.map((key) => [key, extra[key] ?? value]));
}

function player(id, pos, number, extra = {}) {
  const item = {
    id,
    name: id,
    pos,
    number,
    age: extra.age ?? 24,
    ovr: extra.ovr ?? 13,
    potential: extra.potential ?? 16,
    fitness: 100,
    morale: 75,
    injured: 0,
    suspendedMatches: 0,
    attrs: attrs(13, extra.attrs || {}),
  };
  ensureFootballProfile(item);
  return item;
}

function club(id) {
  const players = [
    player(`${id}-gk`, "GK", 1),
    player(`${id}-d1`, "DEF", 2),
    player(`${id}-d2`, "DEF", 3),
    player(`${id}-d3`, "DEF", 4),
    player(`${id}-d4`, "DEF", 5),
    player(`${id}-m1`, "MID", 6),
    player(`${id}-m2`, "MID", 7),
    player(`${id}-m3`, "MID", 8),
    player(`${id}-a1`, "ATT", 9),
    player(`${id}-a2`, "ATT", 10),
    player(`${id}-a3`, "ATT", 11),
  ];
  const tactics = defaultTactics();
  tactics.lineup = players.map((item) => item.id);
  return { id, name: id, short: id, power: 70, players, tactics };
}

function seeded(seed = 12345) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

assert.equal(PLAYER_HABIT_IDS.length, 14, "the first release must expose fourteen causal habits");

{
  const legacyA = {
    id: "legacy-habit-player",
    name: "Legacy",
    pos: "MID",
    age: 23,
    ovr: 13,
    attrs: attrs(),
  };
  const legacyB = structuredClone(legacyA);
  ensureFootballProfile(legacyA);
  ensureFootballProfile(legacyB);
  assert.deepEqual(legacyA.playingHabits, legacyB.playingHabits, "legacy migration must be deterministic");
  assert.ok(legacyA.playingHabits.length >= 1 && legacyA.playingHabits.length <= 3);
  assert.equal(ensurePlayerHabits(legacyA), false, "a stable player profile must not be marked dirty repeatedly");
}

{
  const trainee = player("habit-trainee", "MID", 8, {
    age: 20,
    attrs: { decisions: 20, passing: 18, vision: 18 },
  });
  trainee.playingHabits = [];
  trainee.habitsVersion = 1;
  const target = availableHabitTraining(trainee).learn.find((item) => item.id === "tries_through_balls");
  assert.ok(target, "a suitable midfielder must be able to train through balls");
  const beforeAttrs = structuredClone(trainee.attrs);
  assert.equal(
    startHabitTraining(trainee, target.id, "learn", { season: 1, day: 1 }).ok,
    true
  );
  trainee.injured = 4;
  const paused = processHabitTrainingWeek(trainee, {
    season: 1,
    day: 7,
    coachRating: 20,
    intensity: "normal",
  });
  assert.equal(paused.paused, "injured", "injured players must not progress personal work");
  assert.equal(paused.progress, 0);
  trainee.injured = 0;
  let completed = null;
  for (let week = 2; week <= 20; week++) {
    completed = processHabitTrainingWeek(trainee, {
      season: 1,
      day: week * 7,
      coachRating: 20,
      intensity: "normal",
    });
    if (completed.completed) break;
  }
  assert.equal(completed?.completed, true, "a realistic multi-week programme must eventually complete");
  assert.ok(trainee.playingHabits.includes(target.id));
  assert.deepEqual(trainee.attrs, beforeAttrs, "habit training must not change player attributes");
  assert.equal(startHabitTraining(trainee, target.id, "unlearn", { season: 1, day: 150 }).ok, true);
  for (let week = 22; week <= 40 && trainee.habitTraining; week++) {
    processHabitTrainingWeek(trainee, {
      season: 1,
      day: week * 7,
      coachRating: 20,
      intensity: "normal",
    });
  }
  assert.ok(!trainee.playingHabits.includes(target.id), "trained habits must also be correctable");
}

{
  const start = CLUB_TEMPLATES.find((item) => item.division === 3);
  const world = createWorld(start.id, "Player Habits Audit");
  const user = world.clubs.find((item) => item.id === world.userClubId);
  const source = world.clubs.find((item) => item.id !== user.id && item.division === user.division);
  const target = source.players.find((item) => item.playingHabits?.length);
  assert.ok(target, "world generation must create observable player identities");
  ensureStaff(user);
  ensureScoutingKnowledge(world);
  const publicView = scoutPlayerSnapshot(world, target, user);
  assert.deepEqual(publicView.habitIds, [], "public information must not expose personal habits");
  user.staff.scout.rating = 20;
  observeScoutingPlayer(world, target, source, user, {
    intensity: 100,
    source: "habit-audit",
    seedSalt: "first",
  });
  const observed = observeScoutingPlayer(world, target, source, user, {
    intensity: 100,
    source: "habit-audit",
    seedSalt: "second",
  });
  assert.ok(observed.habitIds.length >= 1, "sufficient observation must reveal at least one habit");
  const savedHabitIds = [...observed.habitIds];
  target.playingHabits = [];
  const unchanged = scoutPlayerSnapshot(world, target, user);
  assert.deepEqual(unchanged.habitIds, savedHabitIds, "old reports must not refresh hidden habit changes");
  assert.equal(validateSaveStructure(world), world);
}

{
  const home = club("home");
  const away = club("away");
  const engine = new SimEngine(home, away, { random: seeded(91) });
  const passer = engine.agentById("home-m2");
  const returnTarget = engine.agentById("home-m1");
  passer.x = 50;
  passer.y = 52;
  returnTarget.x = 56;
  returnTarget.y = 43;
  for (const opponent of engine.agents.filter((item) => item.team === "away")) {
    opponent.x = 12;
    opponent.y = 20;
  }
  engine.ball.x = passer.x;
  engine.ball.y = passer.y;
  engine.ball.lastPasserId = returnTarget.id;
  engine.ball.lastPassTeam = "home";
  engine.ball.lastPassAt = engine.t;
  passer.habits = new Set();
  const ordinaryReturn = engine._passCandidates(passer).find((item) => item.agent.id === returnTarget.id)?.value;
  passer.habits = new Set(["plays_one_twos"]);
  const oneTwoReturn = engine._passCandidates(passer).find((item) => item.agent.id === returnTarget.id)?.value;
  assert.ok(oneTwoReturn > ordinaryReturn * 5, "one-two habit must materially alter the return-pass choice");

  returnTarget.x = 78;
  returnTarget.y = 46;
  engine.ball.lastPasserId = null;
  passer.habits = new Set();
  const ordinarySwitch = engine._passCandidates(passer).find((item) => item.agent.id === returnTarget.id)?.value;
  passer.habits = new Set(["switches_play"]);
  const switched = engine._passCandidates(passer).find((item) => item.agent.id === returnTarget.id)?.value;
  assert.ok(switched > ordinarySwitch, "switching habit must raise far-side preference without changing pass skill");

  const goalkeeper = engine.agentById("home-gk");
  const receiver = engine.agentById("home-d1");
  receiver.x = 50;
  receiver.y = 70;
  goalkeeper.habits = new Set(["distributes_short"]);
  engine.ball.owner = goalkeeper.id;
  engine._bestPass = () => ({ agent: receiver, value: 0.18, through: false, tx: receiver.x, ty: receiver.y });
  let shortPasses = 0;
  engine._pass = () => { shortPasses += 1; };
  engine._gkDistribute(goalkeeper);
  assert.equal(shortPasses, 1, "short-distribution habit must accept a safe option an ordinary keeper rejects");
}

const engineSource = readFileSync(resolve(repo, "js/sim/engine.js"), "utf8");
for (const habitId of PLAYER_HABIT_IDS) {
  assert.match(engineSource, new RegExp(`\\b${habitId}\\b`), `${habitId} must be consumed by the spatial engine`);
}

console.log("Player habits audit passed: stable identities, trainable behaviour, scouting persistence and spatial-engine causality");
