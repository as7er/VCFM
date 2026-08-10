import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { CLUB_TEMPLATES, DIVISION_IDS, clubBrandingById } from "../js/data.js";
import { applyClubBranding } from "../js/branding.js";

const codes = CLUB_TEMPLATES.map((club) => club.shortName);
assert.equal(CLUB_TEMPLATES.length, 270);
assert.equal(new Set(codes).size, CLUB_TEMPLATES.length, "club short names must be globally unique");
assert.ok(codes.every((code) => /^[A-Z]{3,4}$/.test(code)), "club short names must use 3-4 letters");
assert.ok(codes.filter((code) => code.length === 3).length >= 150, "three-letter codes should remain the default");

for (const club of CLUB_TEMPLATES) {
  assert.equal(club.crest.monogram, club.shortName, `${club.id} crest must share its club code`);
}

const expectedCodes = {
  vcc: "KIN",
  raven: "RBA",
  harbor3: "WBW",
  sol_4_06: "CRCF",
  eis_6_01: "FCE",
  eis_6_02: "SVW",
  eis_6_03: "VFRN",
  bel_8_01: "ACV",
  bel_8_02: "FMV",
  lum_10_03: "OMC",
};
for (const [clubId, code] of Object.entries(expectedCodes)) {
  assert.equal(clubBrandingById[clubId].shortName, code, `${clubId} needs a natural football code`);
}

const countryStats = Object.fromEntries(
  Object.entries(Object.groupBy(CLUB_TEMPLATES, (club) => club.countryCode)).map(([countryCode, clubs]) => {
    const firstLetters = new Set(clubs.map((club) => club.shortName[0]));
    const countryPrefixCount = clubs.filter((club) => club.shortName[0] === countryCode[0]).length;
    assert.ok(firstLetters.size >= 7, `${countryCode} club codes need varied first letters`);
    assert.ok(countryPrefixCount <= Math.ceil(clubs.length * 0.25), `${countryCode} must not dominate club prefixes`);
    return [countryCode, { clubs: clubs.length, firstLetters: firstLetters.size, countryPrefixCount }];
  })
);

for (const division of DIVISION_IDS) {
  const firstLetters = new Set(
    CLUB_TEMPLATES.filter((club) => club.division === division).map((club) => club.shortName[0])
  );
  assert.ok(firstLetters.size >= 7, `division ${division} needs scannable club-code prefixes`);
}

const staleClub = { id: "eis_6_01", shortName: "GEIS", shortCode: "GEIS", crest: { monogram: "GEIS" } };
applyClubBranding(staleClub, clubBrandingById[staleClub.id], "en");
assert.equal(staleClub.shortName, "FCE");
assert.equal(staleClub.shortCode, "FCE");
assert.equal(staleClub.crest.monogram, "FCE");

const clubsSource = readFileSync(resolve(import.meta.dirname, "../js/clubs.js"), "utf8");
assert.doesNotMatch(clubsSource, /countryCode\s*\[\s*0\s*\]/, "country codes must not prefix club identities");
assert.ok(clubsSource.includes("SHORT_NAME_OVERRIDES"), "awkward automatic codes need explicit curation");

console.log(JSON.stringify({
  clubs: CLUB_TEMPLATES.length,
  threeLetter: codes.filter((code) => code.length === 3).length,
  fourLetter: codes.filter((code) => code.length === 4).length,
  countryStats,
}, null, 2));
