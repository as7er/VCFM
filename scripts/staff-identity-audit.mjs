import assert from "node:assert/strict";

import { NATIONALITIES } from "../js/data.js";
import {
  STAFF_PROFILE_VERSION,
  createStaff,
  ensureStaffProfile,
  staffNameCompatibilityScore,
} from "../js/staff.js";

for (const nation of NATIONALITIES) {
  for (let index = 0; index < 12; index++) {
    const staff = createStaff("coach", 12, { nationality: nation.code });
    assert.equal(staff.nationality, nation.code, "explicit staff nationality must be retained");
    assert.ok(
      staffNameCompatibilityScore(staff.name, staff.nationality) > 0,
      `${staff.name} must be explainable by the ${staff.nationality} name pool`
    );
  }
}

const legacyMismatch = {
  id: "legacy-pedro-muller",
  name: "Pedro Muller",
  role: "coach",
  nationality: "CHN",
  profileVersion: 1,
};
ensureStaffProfile(legacyMismatch);
assert.equal(legacyMismatch.name, "Pedro Muller", "legacy migration must preserve staff identity");
assert.equal(legacyMismatch.nationality, "GER", "Muller should use the strongest supported origin prior");
assert.ok(
  staffNameCompatibilityScore(legacyMismatch.name, legacyMismatch.nationality) > 0,
  "the repaired nationality must have a name-pool basis"
);
assert.equal(legacyMismatch.profileVersion, STAFF_PROFILE_VERSION, "legacy profile version must migrate");

const legacyCompatible = {
  id: "legacy-wang-wei",
  name: "Wang Wei",
  role: "scout",
  nationality: "CHN",
  profileVersion: 1,
};
ensureStaffProfile(legacyCompatible);
assert.equal(legacyCompatible.nationality, "CHN", "compatible legacy nationality must remain stable");
assert.equal(legacyCompatible.name, "Wang Wei", "compatible legacy name must remain stable");

let seed = 0x5f3759df;
const originalRandom = Math.random;
Math.random = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};

let domestic = 0;
const sampleSize = 900;
try {
  for (let index = 0; index < sampleSize; index++) {
    const staff = createStaff("coach", 12, { homeNation: "ENG" });
    if (staff.nationality === "ENG") domestic++;
    assert.ok(
      staffNameCompatibilityScore(staff.name, staff.nationality) > 0,
      "club staff name and nationality must share one identity source"
    );
  }
} finally {
  Math.random = originalRandom;
}

const domesticShare = domestic / sampleSize;
assert.ok(
  domesticShare >= 0.57 && domesticShare <= 0.71,
  `English clubs should have a realistic domestic staff majority, got ${(domesticShare * 100).toFixed(1)}%`
);

console.log(JSON.stringify({
  nationsChecked: NATIONALITIES.length,
  explicitSamples: NATIONALITIES.length * 12,
  legacyMismatchNation: legacyMismatch.nationality,
  domesticShare: Number(domesticShare.toFixed(3)),
}, null, 2));
