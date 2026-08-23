import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { CLUB_TEMPLATES } from "../js/data.js";
import { createWorld } from "../js/models.js";
import {
  MANAGER_ONBOARDING_STEPS,
  MANAGER_ONBOARDING_TAB_STEPS,
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

// activateMainTab 用步骤 id 当页签名，所以两者必须同名且页签真的存在，
// 否则改名后引导会永远停在最后一步而不报错。
const shell = readFileSync(new URL("../index.html", import.meta.url), "utf8");
for (const step of MANAGER_ONBOARDING_STEPS) {
  if (step.id === "match") continue;
  assert.equal(step.id, step.tab, `${step.id} step must keep its id aligned with its tab`);
  assert.ok(MANAGER_ONBOARDING_TAB_STEPS.includes(step.id), `${step.id} must be completable by opening its tab`);
  assert.ok(shell.includes(`data-tab="${step.tab}"`), `${step.tab} tab must exist in the shell`);
}
assert.ok(!MANAGER_ONBOARDING_TAB_STEPS.includes("match"), "the match step must require an actual match, not a tab visit");

// 版本迁移不能撤销玩家已经做过的选择，也不该丢掉已完成的步骤。
const migratedSkip = createWorld(startClub.id, "Migration Skip Audit");
assert.equal(dismissManagerOnboarding(migratedSkip), true, "migration fixture should start from a skipped guide");
migratedSkip.managerOnboarding.version = -1;
ensureManagerOnboarding(migratedSkip);
assert.equal(managerOnboardingView(migratedSkip), null, "a schema bump must not re-open a guide the player skipped");

const migratedProgress = createWorld(startClub.id, "Migration Progress Audit");
assert.equal(completeManagerOnboardingStep(migratedProgress, "squad"), true, "migration fixture should record one step");
migratedProgress.managerOnboarding.version = -1;
ensureManagerOnboarding(migratedProgress);
assert.equal(managerOnboardingView(migratedProgress)?.completed, 1, "a schema bump must keep finished steps");

console.log("Manager onboarding audit passed: new careers, persistence, completion, skip, old-save fallback, tab mapping and schema migration");
