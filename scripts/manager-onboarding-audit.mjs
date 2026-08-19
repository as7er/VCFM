import assert from "node:assert/strict";

import { CLUB_TEMPLATES } from "../js/data.js";
import { createWorld } from "../js/models.js";
import {
  completeManagerOnboardingStep,
  dismissManagerOnboarding,
  ensureManagerOnboarding,
  managerOnboardingView,
} from "../js/manager-onboarding.js";

const startClub = CLUB_TEMPLATES.find((club) => club.division === 3);
assert.ok(startClub, "onboarding audit needs a starting club");

const fresh = createWorld(startClub.id, "Onboarding Audit");
const firstView = managerOnboardingView(fresh);
assert.equal(firstView?.total, 4, "new careers should expose four first-week steps");
assert.equal(firstView?.completed, 0, "new careers should begin before any onboarding step");

const progressing = createWorld(startClub.id, "Progression Audit");
assert.equal(managerOnboardingView(progressing)?.completed, 0, "progression audit should begin with onboarding visible");
progressing.day = 2;
assert.equal(managerOnboardingView(progressing)?.completed, 0, "new-career onboarding must survive pre-match date progression");

for (const step of ["squad", "tactics", "training"]) {
  assert.equal(completeManagerOnboardingStep(fresh, step), true, `${step} should complete once`);
  assert.equal(completeManagerOnboardingStep(fresh, step), false, `${step} should be idempotent`);
}
assert.equal(managerOnboardingView(fresh)?.completed, 3, "management checks should leave only the match step");

const saved = structuredClone(fresh);
assert.equal(managerOnboardingView(saved)?.completed, 3, "save clones must retain onboarding progress");
assert.equal(completeManagerOnboardingStep(saved, "match"), true, "finishing the first match should complete onboarding");
assert.equal(managerOnboardingView(saved), null, "completed onboarding should leave the workbench");

const skipped = createWorld(startClub.id, "Skipped Onboarding Audit");
assert.equal(dismissManagerOnboarding(skipped), true, "the guide should be skippable");
assert.equal(managerOnboardingView(skipped), null, "skipped onboarding should stay hidden");

const oldSave = createWorld(startClub.id, "Old Save Audit");
oldSave.day = 8;
delete oldSave.managerOnboarding;
ensureManagerOnboarding(oldSave);
assert.equal(managerOnboardingView(oldSave), null, "established old saves must not receive a new first-week guide");

console.log("Manager onboarding audit passed: new careers, persistence, completion, skip and old-save fallback");
