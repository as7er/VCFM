import assert from "node:assert/strict";

import { CLUB_TEMPLATES, FORMATIONS, START_DIVISIONS } from "../js/data.js";
import { applyDelegatedTactics, ensureDelegation } from "../js/delegation.js";
import { createWorld } from "../js/models.js";
import { createMatchSession } from "../js/match.js";
import {
  applyCoachTacticalIdentity,
  ensureCoachIdentity,
} from "../js/manager-ecosystem.js";
import {
  ensureWorldStaff,
  processManagerEcosystemDay,
} from "../js/staff.js";

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

const originalRandom = Math.random;
Math.random = seededRandom(0x2052026);

try {
  const start = CLUB_TEMPLATES.find((club) => START_DIVISIONS.includes(club.division));
  assert.ok(start, "manager ecosystem audit needs a starting club");
  const world = createWorld(start.id, "Manager Ecosystem Audit");
  ensureWorldStaff(world);

  const coaches = world.clubs.map((club) => club.staff?.coach).filter(Boolean);
  assert.equal(coaches.length, world.clubs.length, "every club should have a head coach");
  const archetypes = new Set();
  for (const coach of coaches) {
    const identity = ensureCoachIdentity(coach);
    assert.ok(identity, `${coach.id} should have a coaching identity`);
    assert.ok(identity.label && identity.labelEn, `${coach.id} identity should be bilingual`);
    assert.ok(identity.preferredFormations.length >= 2, `${coach.id} should prefer multiple shapes`);
    assert.ok(identity.preferredFormations.every((formation) => FORMATIONS[formation]));
    assert.ok(identity.phaseFormations.possession.every((formation) => FORMATIONS[formation]));
    assert.ok(identity.phaseFormations.outOfPossession.every((formation) => FORMATIONS[formation]));
    for (const field of ["pressing", "tempo", "width", "defensiveLine", "youthTrust", "rotation", "adaptability"]) {
      assert.ok(identity[field] >= 1 && identity[field] <= 5, `${coach.id} ${field} should use the visible 1-5 scale`);
    }
    archetypes.add(identity.archetype);
  }
  assert.ok(archetypes.size >= 5, "the initial world should contain varied coaching identities");

  const stableCoach = coaches[0];
  const stableIdentity = structuredClone(stableCoach.footballIdentity);
  delete stableCoach.footballIdentity;
  assert.deepEqual(ensureCoachIdentity(stableCoach), stableIdentity, "identity repair should be stable from coach identity");

  const user = world.clubs.find((club) => club.id === world.userClubId);
  user.tactics.formation = "5-3-2";
  user.tactics.style = "defend";
  user.tactics.pressing = 1;
  delete user.tactics.coachIdentityId;
  world.managementMode = "head_coach";
  ensureWorldStaff(world);
  assert.equal(user.tactics.formation, "5-3-2", "normal manager mode should retain player tactics during migration");
  assert.equal(user.tactics.style, "defend", "normal manager mode should not be overwritten by staff identity");

  const userCoach = user.staff.coach;
  userCoach.footballIdentity = {
    version: 1,
    archetype: "counter",
    label: "快速反击",
    labelEn: "Direct counterattack",
    preferredFormations: ["4-5-1", "5-3-2"],
    style: "counter",
    pressing: 2,
    tempo: 4,
    width: 3,
    defensiveLine: 2,
    youthTrust: 4,
    rotation: 4,
    adaptability: 3,
  };
  world.managementMode = "club_director";
  ensureDelegation(world, user);
  const delegated = applyDelegatedTactics(world, user, null, { force: true });
  assert.equal(delegated.ok, true);
  assert.equal(user.tactics.style, "counter", "delegated tactics should read the coach's real style");
  assert.equal(user.tactics.pressing, 2);
  assert.ok(userCoach.footballIdentity.preferredFormations.includes(user.tactics.formation));
  assert.ok(FORMATIONS[user.tactics.possessionFormation || user.tactics.formation]);
  assert.ok(FORMATIONS[user.tactics.outOfPossessionFormation || user.tactics.formation]);

  const aiIdentityClub = world.clubs.find((club) => club.id !== world.userClubId);
  const aiOpponent = world.clubs.find(
    (club) => club.id !== world.userClubId && club.id !== aiIdentityClub.id
  );
  aiIdentityClub.staff.coach.footballIdentity = structuredClone(userCoach.footballIdentity);
  aiIdentityClub.staff.coach.footballIdentity.adaptability = 1;
  aiIdentityClub.form = [];
  createMatchSession(world, {
    id: "manager-identity-match",
    day: world.day,
    home: aiIdentityClub.id,
    away: aiOpponent.id,
    division: aiIdentityClub.division,
    played: false,
  }, { engineMode: "probability" });
  assert.equal(
    aiIdentityClub.tactics.style,
    "counter",
    "AI pre-match preparation should start from the same persistent coaching identity"
  );

  const aiPeers = world.clubs
    .filter((club) => club.id !== world.userClubId && club.division === user.division)
    .sort((a, b) => (b.power || 0) - (a.power || 0));
  const failing = aiPeers[0];
  assert.ok(failing, "audit needs an AI peer");
  const playerFacts = failing.players.map((player) => ({
    id: player.id,
    ovr: player.ovr,
    attrs: structuredClone(player.attrs),
  }));
  applyCoachTacticalIdentity(failing, failing.staff.coach, { force: true });
  assert.deepEqual(
    failing.players.map((player) => ({ id: player.id, ovr: player.ovr, attrs: player.attrs })),
    playerFacts,
    "coaching identity may change instructions and selection, not player ability"
  );

  const divisionPeers = world.clubs
    .filter((club) => club.division === failing.division)
    .sort((a, b) => (b.power || 0) - (a.power || 0));
  divisionPeers.forEach((club, index) => {
    world.table[club.id] = {
      played: 20,
      w: 12 - Math.min(8, index),
      d: 4,
      l: 4 + Math.min(8, index),
      gf: 40 - index,
      ga: 18 + index,
      pts: 40 - index,
    };
    club.form = index < 5 ? ["W", "D", "W", "W", "D"] : ["D", "L", "W", "D", "L"];
  });
  world.table[failing.id] = { played: 20, w: 1, d: 2, l: 17, gf: 8, ga: 48, pts: 5 };
  failing.form = ["L", "L", "L", "D", "L"];
  failing.staff.coach.joinedDay = 1;
  failing.managerReview.appointedDay = 1;
  failing.managerReview.graceUntilDay = 0;
  failing.managerReview.lastCheckDay = 0;
  failing.managerReview.warnings = 0;

  world.day = 80;
  processManagerEcosystemDay(world, { maxChanges: 4 });
  assert.ok(failing.managerReview.warnings >= 1, "one poor review should create pressure before dismissal");
  assert.equal(!!failing.staff.coach.isCaretaker, false, "one review should not immediately dismiss a permanent coach");

  const dismissedCoachId = failing.staff.coach.id;
  const moneyBeforeDismissal = failing.money;
  world.day = 94;
  const dismissalEvents = processManagerEcosystemDay(world, { maxChanges: 4 });
  assert.ok(
    dismissalEvents.some((event) => event.type === "manager_dismissal" && event.clubId === failing.id),
    "sustained severe underperformance should produce an auditable dismissal"
  );
  assert.equal(failing.staff.coach.isCaretaker, true, "dismissed clubs should enter a caretaker period");
  assert.ok(failing.money < moneyBeforeDismissal, "manager dismissal compensation should hit the club ledger");
  assert.ok(
    failing.finance?.financeLedger?.some((entry) => entry.source === "manager-dismissal"),
    "manager dismissal compensation should be auditable in the shared ledger"
  );
  assert.ok(
    world.staffMarket.some((coach) => coach.id === dismissedCoachId),
    "the dismissed coach should remain in the shared labour market"
  );
  assert.ok(
    failing.managerHistory.some((event) => event.type === "departure" && event.coachId === dismissedCoachId),
    "the departure should remain in club manager history"
  );

  world.day = 102;
  const appointmentEvents = processManagerEcosystemDay(world, {
    forceAppointments: true,
    maxChanges: 4,
  });
  assert.ok(
    appointmentEvents.some((event) => event.type === "manager_appointment" && event.clubId === failing.id),
    "a vacancy should be filled through the shared staff market"
  );
  assert.equal(failing.staff.coach.isCaretaker, false, "the appointed coach should be permanent");
  assert.notEqual(failing.staff.coach.id, dismissedCoachId, "a club should not immediately rehire the coach it dismissed");
  assert.equal(
    failing.tactics.coachIdentityId,
    failing.staff.coach.id,
    "the new coach's visible identity should own the club's actual tactical instructions"
  );
  assert.ok(
    failing.managerHistory.some((event) => event.type === "appointment" && event.coachId === failing.staff.coach.id),
    "the appointment should remain in club manager history"
  );

  console.log(JSON.stringify({
    clubs: world.clubs.length,
    archetypes: [...archetypes].sort(),
    dismissedCoachId,
    appointedCoachId: failing.staff.coach.id,
    managerEvents: dismissalEvents.length + appointmentEvents.length,
  }, null, 2));
  console.log("Manager ecosystem audit passed: stable identities, delegated tactics, causal reviews, dismissals, caretakers and appointments");
} finally {
  Math.random = originalRandom;
}
