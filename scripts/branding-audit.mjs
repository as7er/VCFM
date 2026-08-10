import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  COUNTRIES,
  COUNTRY_LIST,
  DIVISIONS,
  DIVISION_IDS,
  CLUB_TEMPLATES,
  clubBrandingById,
  generatePlayerName,
} from "../js/data.js";
import {
  createWorld,
  ensureKit,
  ensureWorldClubTemplates,
  ensureWorldLeagueFixtures,
} from "../js/models.js";
import { playerAvatarKitColors } from "../js/avatar.js";
import {
  REAL_PLAYER_NAME_REPLACEMENTS,
  applyWorldClubBranding,
  isCssColor,
  isValidShortName,
} from "../js/branding.js";
import { ensureCompetitions } from "../js/cup.js";
import { simulateMatch } from "../js/engine.js";
import { listSlots, loadGame, saveGame } from "../js/save.js";

class MemoryStorage {
  constructor() {
    this.values = new Map();
  }
  getItem(key) {
    return this.values.has(String(key)) ? this.values.get(String(key)) : null;
  }
  setItem(key, value) {
    this.values.set(String(key), String(value));
  }
  removeItem(key) {
    this.values.delete(String(key));
  }
}

globalThis.localStorage = new MemoryStorage();

const expectedCountries = {
  ENG: ["英格兰", "England"],
  ESP: ["西班牙", "Spain"],
  ITA: ["意大利", "Italy"],
  GER: ["德国", "Germany"],
  FRA: ["法国", "France"],
  NED: ["荷兰", "Netherlands"],
  POR: ["葡萄牙", "Portugal"],
};
assert.equal(COUNTRY_LIST.length, 7);
for (const country of COUNTRY_LIST) {
  assert.deepEqual([country.nameZh, country.nameEn], expectedCountries[country.countryCode]);
}

assert.equal(DIVISION_IDS.length, 15);
for (const league of Object.values(DIVISIONS)) {
  const country = COUNTRIES[league.countryId];
  assert.ok(country, `league ${league.id} has a country`);
  assert.equal(league.countryCode, country.countryCode);
}

// 15 联赛 × 18 队双循环 = 270 队（七国体系，对齐德甲/法甲赛制）
const EXPECTED_CLUBS = 270;
const EXPECTED_LEAGUE_FIXTURES = 18 * 17 * DIVISION_IDS.length; // 3366
assert.equal(CLUB_TEMPLATES.length, EXPECTED_CLUBS);
assert.equal(Object.keys(clubBrandingById).length, EXPECTED_CLUBS);
assert.equal(new Set(CLUB_TEMPLATES.map((club) => club.id)).size, EXPECTED_CLUBS);
assert.equal(new Set(CLUB_TEMPLATES.map((club) => club.nameEn)).size, EXPECTED_CLUBS);
assert.equal(new Set(CLUB_TEMPLATES.map((club) => club.nameZh)).size, EXPECTED_CLUBS);
assert.equal(new Set(CLUB_TEMPLATES.map((club) => club.shortName)).size, EXPECTED_CLUBS);
assert.equal(new Set(CLUB_TEMPLATES.map((club) => club.city.en.toLowerCase())).size, EXPECTED_CLUBS);
assert.equal(new Set(CLUB_TEMPLATES.map((club) => club.city.zh)).size, EXPECTED_CLUBS);

for (const club of CLUB_TEMPLATES) {
  const league = DIVISIONS[club.leagueId];
  assert.ok(league, `${club.id} has a valid league`);
  assert.equal(league.countryId, club.countryId, `${club.id} country/league match`);
  assert.equal(club.countryCode, COUNTRIES[club.countryId].countryCode);
  assert.ok(isValidShortName(club.shortName), `${club.id} short name`);
  assert.equal(club.short, club.city.zh, `${club.id} readable default short name`);
  assert.ok(isCssColor(club.colors.primary), `${club.id} primary color`);
  assert.ok(isCssColor(club.colors.secondary), `${club.id} secondary color`);
  assert.notEqual(club.colors.primary, club.colors.secondary, `${club.id} distinct colors`);
  assert.ok(club.city?.en && club.city?.zh, `${club.id} bilingual city`);
  assert.ok(club.stadiumName?.en && club.stadiumName?.zh, `${club.id} bilingual stadium`);
  assert.ok(club.crest?.shape && club.crest?.symbol && club.crest?.monogram);
  assert.equal("url" in club.crest, false, `${club.id} crest has no external asset`);
  const kit = ensureKit({ ...club, kit: { primary: "#ffffff", secondary: "#ffffff", style: "solid" } });
  assert.equal(kit.primary, club.branding.kit.primary, `${club.id} stale kit overwritten`);
}

const leagueCounts = Object.fromEntries(
  DIVISION_IDS.map((id) => [id, CLUB_TEMPLATES.filter((club) => club.division === id).length])
);
assert.deepEqual(leagueCounts, {
  1: 18, 2: 18, 3: 18,
  4: 18, 5: 18, 6: 18, 7: 18, 8: 18, 9: 18, 10: 18, 11: 18,
  12: 18, 13: 18, 14: 18, 15: 18,
});

/** 与 models.calibrateWorldAbilityDistribution 同源的人口缩放配额 */
function expectedAbilityQuotas(population, reference = 3572) {
  const scaled = (base) => Math.max(1, Math.round(base * (population / reference)));
  return { 18: scaled(110), 19: scaled(24), 20: scaled(2) };
}

const world = createWorld("sunset", "Brand Audit", "zh");
ensureCompetitions(world);
const validClubIds = new Set(world.clubs.map((club) => club.id));
for (const club of world.clubs) {
  const kit = ensureKit(club);
  assert.deepEqual(
    playerAvatarKitColors(club),
    { primary: kit.primary, secondary: kit.secondary || null },
    `${club.id} avatar must use the same kit colors as shirt and number badges`
  );
}
assert.equal(world.userClubId, "sunset");
assert.equal(world.clubs.length, EXPECTED_CLUBS);
assert.equal(world.fixtures.length, EXPECTED_LEAGUE_FIXTURES);
assert.equal(world.domesticCups.crownland.name, "英格兰全国杯");
assert.equal(world.domesticCups.crownland.nameEn, "England National Cup");

const legacyWorld = createWorld("sunset", "Legacy Expansion Audit", "zh");
const englishIds = new Set(
  legacyWorld.clubs.filter((club) => club.countryCode === "ENG").map((club) => club.id)
);
legacyWorld.clubs = legacyWorld.clubs.filter((club) => englishIds.has(club.id));
legacyWorld.fixtures = legacyWorld.fixtures.filter(
  (fixture) => englishIds.has(fixture.home) && englishIds.has(fixture.away)
);
legacyWorld.table = Object.fromEntries(
  Object.entries(legacyWorld.table).filter(([clubId]) => englishIds.has(clubId))
);
const preservedEnglishFixtures = legacyWorld.fixtures.map((fixture) => fixture.id);
const englishClubCount = englishIds.size; // 54（3 × 18）
const nonEnglishClubCount = EXPECTED_CLUBS - englishClubCount; // 144
assert.equal(ensureWorldClubTemplates(legacyWorld, "zh"), nonEnglishClubCount);
const expandedFirstTeam = legacyWorld.clubs.flatMap((club) => club.players);
assert.deepEqual(
  Object.fromEntries([18, 19, 20].map((ovr) => [ovr, expandedFirstTeam.filter((player) => player.ovr === ovr).length])),
  expectedAbilityQuotas(expandedFirstTeam.length),
  "old saves expanded to five countries must be recalibrated as one world"
);
assert.equal(legacyWorld.abilityDistributionVersion, 1, "expanded old saves store the ability distribution version");
assert.equal(ensureWorldClubTemplates(legacyWorld, "zh"), 0, "club expansion is idempotent");
const addedLegacyFixtures = ensureWorldLeagueFixtures(legacyWorld);
assert.equal(legacyWorld.clubs.length, EXPECTED_CLUBS);
assert.equal(addedLegacyFixtures.length, EXPECTED_LEAGUE_FIXTURES - preservedEnglishFixtures.length);
assert.equal(legacyWorld.fixtures.length, EXPECTED_LEAGUE_FIXTURES);
assert.deepEqual(
  legacyWorld.fixtures.filter((fixture) => fixture.division <= 3).map((fixture) => fixture.id),
  preservedEnglishFixtures,
  "old English fixtures remain unchanged"
);
legacyWorld.day = 80;
for (const fixture of addedLegacyFixtures) {
  if (fixture.day <= legacyWorld.day) simulateMatch(legacyWorld, fixture);
}
for (const division of [4, 5, 6, 7, 8, 9, 10, 11]) {
  const clubs = legacyWorld.clubs.filter((club) => club.division === division);
  assert.ok(
    clubs.every((club) => legacyWorld.table[club.id].played > 0),
    `legacy expansion division ${division} has standings data`
  );
  assert.ok(
    clubs.some((club) => club.players.some((player) => player.stats.apps > 0)),
    `legacy expansion division ${division} has player data`
  );
}
assert.equal(
  legacyWorld.clubs
    .flatMap((club) => club.players)
    .filter((player) => player.pos === "GK")
    .reduce((n, player) => n + (player.stats.goals || 0) + (player.stats.assists || 0), 0),
  0,
  "background league simulation does not assign attacking stats to goalkeepers"
);
ensureCompetitions(legacyWorld);
for (const competition of [
  ...Object.values(legacyWorld.domesticCups),
  ...Object.values(legacyWorld.continentals),
]) {
  assert.ok(
    competition.fixtures.every((fixture) => fixture.day > legacyWorld.day),
    `${competition.id} starts after a mid-season expansion`
  );
}
assert.equal(
  generatePlayerName("CRO", (items) => items.includes("Luka") ? "Luka" : "Modric"),
  "Luka Modran"
);
for (const club of world.clubs) {
  for (const player of [...(club.players || []), ...(club.youth?.players || [])]) {
    assert.ok(validClubIds.has(player.clubId), `${player.id} has a valid club`);
    assert.equal(REAL_PLAYER_NAME_REPLACEMENTS[player.name], undefined, `${player.name} is fictionalized`);
  }
}
for (const fixture of world.fixtures) {
  assert.ok(validClubIds.has(fixture.home), `${fixture.id} home club`);
  assert.ok(validClubIds.has(fixture.away), `${fixture.id} away club`);
}

const originalFixtureCount = world.fixtures.length;
const originalTableKeys = Object.keys(world.table).sort();
world.clubs[0].name = world.clubs[0].legacyName;
world.clubs[0].short = world.clubs[0].legacyShortName;
world.clubs[0].kit = { primary: "#ffffff", secondary: "#ffffff", style: "solid" };
world.transferHistory = [{ fromClubId: "vcc", toClubId: "harbor", playerId: world.clubs[0].players[0].id }];
assert.equal(saveGame(world, 1, { immediate: true }), true);
const loaded = loadGame(1);
assert.ok(loaded);
const managedBefore = loaded.userClubId;
const fixtureRefsBefore = loaded.fixtures.map((fixture) => `${fixture.home}|${fixture.away}`);
assert.equal(applyWorldClubBranding(loaded, clubBrandingById, "zh"), EXPECTED_CLUBS);
assert.equal(loaded.userClubId, managedBefore);
assert.equal(loaded.fixtures.length, originalFixtureCount);
assert.deepEqual(loaded.fixtures.map((fixture) => `${fixture.home}|${fixture.away}`), fixtureRefsBefore);
assert.deepEqual(Object.keys(loaded.table).sort(), originalTableKeys);
assert.equal(loaded.clubs[0].name, clubBrandingById[loaded.clubs[0].id].nameZh);
assert.equal(loaded.clubs[0].short, clubBrandingById[loaded.clubs[0].id].displayShortZh);
applyWorldClubBranding(loaded, clubBrandingById, "en");
assert.equal(loaded.clubs[0].short, clubBrandingById[loaded.clubs[0].id].displayShortEn);
applyWorldClubBranding(loaded, clubBrandingById, "zh");
assert.equal(ensureKit(loaded.clubs[0]).primary, clubBrandingById[loaded.clubs[0].id].kit.primary);
assert.equal(loaded.transferHistory[0].fromClubId, "vcc");
assert.equal(loaded.transferHistory[0].toClubId, "harbor");
localStorage.setItem("vcfm_slots_meta", JSON.stringify({
  1: { clubId: "sunset", clubName: "Westend Town", season: 2026, day: 1 },
}));
assert.equal(listSlots()[0].clubName, clubBrandingById.sunset.nameZh);

const promoted = { id: "sunset", division: 2 };
applyWorldClubBranding({ clubs: [promoted], userClubId: "sunset" }, clubBrandingById, "en");
assert.equal(promoted.leagueId, 2, "current division wins over original branding league");

const visibleData = [
  ...COUNTRY_LIST.flatMap((country) => [country.nameZh, country.nameEn, country.cupName, country.cupNameEn]),
  ...Object.values(DIVISIONS).flatMap((league) => [league.nameZh, league.nameEn, league.shortName]),
  ...CLUB_TEMPLATES.flatMap((club) => [club.nameZh, club.nameEn, club.shortName]),
].join("\n");
const bannedBrands = /Premier League|LaLiga|Serie A|Bundesliga|Ligue 1|Manchester United|Liverpool FC|Arsenal FC|Chelsea FC|FC Barcelona|Real Madrid|Juventus|Bayern Munich|Paris Saint-Germain|\bPSG\b/i;
assert.equal(bannedBrands.test(visibleData), false, "visible/default data contains no banned brand");

for (const relative of ["../index.html", "../js/main.js", "../js/data.js", "../js/cup.js"]) {
  const source = readFileSync(resolve(import.meta.dirname, relative), "utf8");
  assert.equal(bannedBrands.test(source), false, `${relative} contains no visible/default banned brand`);
}

console.log(JSON.stringify({
  countries: COUNTRY_LIST.length,
  leagues: DIVISION_IDS.length,
  clubs: CLUB_TEMPLATES.length,
  fixtures: world.fixtures.length,
  players: world.clubs.reduce((sum, club) => sum + club.players.length + club.youth.players.length, 0),
  leagueCounts,
  oldSaveBrandingsMigrated: EXPECTED_CLUBS,
  abilityQuotas: expectedAbilityQuotas(world.clubs.reduce((sum, club) => sum + club.players.length, 0)),
}, null, 2));
