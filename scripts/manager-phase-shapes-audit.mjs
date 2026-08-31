import assert from "node:assert/strict";

import { CLUB_TEMPLATES, FORMATIONS, START_DIVISIONS } from "../js/data.js";
import { createMatchSession } from "../js/match.js";
import {
  applyCoachPhaseFormations,
  applyCoachTacticalIdentity,
  coachPhaseFormationPlan,
  ensureCoachIdentity,
} from "../js/manager-ecosystem.js";
import { autoLineup, createWorld, ensureTactics } from "../js/models.js";
import { ensureWorldStaff } from "../js/staff.js";

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function shapeCounts(formationId) {
  const slots = FORMATIONS[formationId]?.slots || [];
  return {
    defenders: slots.filter((slot) => slot.pos === "DEF").length,
    attackers: slots.filter((slot) => slot.pos === "ATT").length,
  };
}

const originalRandom = Math.random;
Math.random = seededRandom(0x2272026);

try {
  const start = CLUB_TEMPLATES.find((club) => START_DIVISIONS.includes(club.division));
  assert.ok(start, "phase-shape audit needs a starting club");
  const world = createWorld(start.id, "Manager Phase Shapes Audit");
  ensureWorldStaff(world);

  const club = world.clubs.find((item) => item.id !== world.userClubId);
  const opponent = world.clubs.find((item) => item.id !== world.userClubId && item.id !== club.id);
  assert.ok(club && opponent, "phase-shape audit needs two AI clubs");
  ensureTactics(club);
  ensureTactics(opponent);
  club.tactics.formation = "4-3-3";
  autoLineup(club);
  club.staff.coach.footballIdentity = {
    version: 2,
    archetype: "balanced",
    label: "均衡应变",
    labelEn: "Balanced adaptation",
    preferredFormations: ["4-3-3", "4-2-3-1", "4-4-2"],
    phaseFormations: {
      possession: ["4-2-3-1", "3-4-3", "3-5-2"],
      outOfPossession: ["4-4-2", "5-3-2", "4-1-4-1"],
    },
    style: "balanced",
    pressing: 3,
    tempo: 3,
    width: 3,
    defensiveLine: 3,
    roleTags: ["balanced", "secure", "build-up"],
    youthTrust: 3,
    rotation: 3,
    adaptability: 5,
  };
  ensureCoachIdentity(club.staff.coach);
  opponent.tactics.formation = "3-4-3";
  opponent.tactics.possessionFormation = "3-4-3";
  opponent.tactics.outOfPossessionFormation = "5-3-2";
  opponent.tactics.width = 5;

  const levelPlan = coachPhaseFormationPlan(club, club.staff.coach, { opponent });
  const levelRepeat = coachPhaseFormationPlan(club, club.staff.coach, { opponent });
  assert.deepEqual(levelRepeat, levelPlan, "the same public facts should produce the same phase shapes");
  assert.ok(FORMATIONS[levelPlan.effectivePossessionFormation]);
  assert.ok(FORMATIONS[levelPlan.effectiveOutOfPossessionFormation]);

  const leadingPlan = coachPhaseFormationPlan(club, club.staff.coach, {
    opponent,
    scoreGap: 3,
    minute: 75,
  });
  const trailingPlan = coachPhaseFormationPlan(club, club.staff.coach, {
    opponent,
    scoreGap: -3,
    minute: 75,
  });
  assert.ok(
    shapeCounts(leadingPlan.effectiveOutOfPossessionFormation).defenders
      >= shapeCounts(trailingPlan.effectiveOutOfPossessionFormation).defenders,
    "a late lead should not produce a less protected defensive shape than a late deficit"
  );
  assert.ok(
    shapeCounts(trailingPlan.effectivePossessionFormation).attackers
      >= shapeCounts(leadingPlan.effectivePossessionFormation).attackers,
    "a late deficit should not produce fewer attacking slots than a late lead"
  );
  assert.notDeepEqual(
    [leadingPlan.effectivePossessionFormation, leadingPlan.effectiveOutOfPossessionFormation],
    [trailingPlan.effectivePossessionFormation, trailingPlan.effectiveOutOfPossessionFormation],
    "materially different match states should allow an adaptable coach to change phase shapes"
  );

  const playerFacts = club.players.map((player) => ({
    id: player.id,
    ovr: player.ovr,
    attrs: structuredClone(player.attrs),
  }));
  const baseFormation = club.tactics.formation;
  const baseLineup = [...club.tactics.lineup];
  const applied = applyCoachPhaseFormations(club, club.staff.coach, {
    opponent,
    scoreGap: -3,
    minute: 75,
  });
  assert.equal(applied.ok, true);
  assert.equal(club.tactics.formation, baseFormation, "phase-shape planning must not rewrite the base formation");
  assert.deepEqual(club.tactics.lineup, baseLineup, "phase-shape planning must not rewrite the selected XI");
  assert.deepEqual(
    club.players.map((player) => ({ id: player.id, ovr: player.ovr, attrs: player.attrs })),
    playerFacts,
    "phase-shape planning must not alter player ability"
  );

  applyCoachTacticalIdentity(club, club.staff.coach, { force: true });
  createMatchSession(world, {
    id: "manager-phase-shape-match",
    day: world.day,
    home: club.id,
    away: opponent.id,
    division: club.division,
    played: false,
  }, { engineMode: "spatial", simulationProfile: "background" });
  const effectivePossession = club.tactics.possessionFormation || club.tactics.formation;
  const effectiveOutOfPossession = club.tactics.outOfPossessionFormation || club.tactics.formation;
  assert.equal(
    effectivePossession,
    club.tactics.formation,
    "the first-half possession structure should remain linked to the base formation"
  );
  assert.ok(FORMATIONS[effectivePossession], "AI pre-match preparation should persist a valid possession shape");
  assert.ok(FORMATIONS[effectiveOutOfPossession], "AI pre-match preparation should persist a valid defensive shape");

  club.staff.coach.footballIdentity.adaptability = 4;
  const stableCoachPlan = applyCoachPhaseFormations(club, club.staff.coach, {
    opponent,
    scoreGap: -3,
    minute: 75,
  });
  assert.equal(stableCoachPlan.effectivePossessionFormation, club.tactics.formation);
  assert.equal(stableCoachPlan.effectiveOutOfPossessionFormation, club.tactics.formation);

  console.log(JSON.stringify({
    level: [levelPlan.effectivePossessionFormation, levelPlan.effectiveOutOfPossessionFormation],
    leading: [leadingPlan.effectivePossessionFormation, leadingPlan.effectiveOutOfPossessionFormation],
    trailing: [trailingPlan.effectivePossessionFormation, trailingPlan.effectiveOutOfPossessionFormation],
    preMatch: [effectivePossession, effectiveOutOfPossession],
  }, null, 2));
  console.log("Manager phase-shape audit passed: identity, lineup fit, opponent context and match state drive geometry-only plans");
} finally {
  Math.random = originalRandom;
}
