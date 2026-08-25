import assert from "node:assert/strict";

import {
  CLUB_TEMPLATES,
  NAMES_BY_NATION,
} from "../js/data.js";
import {
  createClub,
  fillYouthSquad,
  resetIdCounter,
  ensureDistinctClubPlayerNames,
} from "../js/models.js";

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function identity(player) {
  const order = NAMES_BY_NATION[player.nationality]?.order || "given-family";
  const parts = String(player.name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return { given: parts[0] || "", family: "" };
  return order === "family-given"
    ? { given: parts.slice(1).join(" "), family: parts[0] }
    : { given: parts[0], family: parts.slice(1).join(" ") };
}

function assertDistinct(club, label) {
  const players = [...(club.players || []), ...(club.youth?.players || [])];
  const fullNames = new Set();
  const given = new Set();
  const family = new Set();
  for (const player of players) {
    assert.ok(player.name, `${label}: ${player.id} needs a name`);
    assert.equal(fullNames.has(player.name), false, `${label}: duplicate full name ${player.name}`);
    fullNames.add(player.name);
    const parts = identity(player);
    assert.equal(given.has(parts.given), false, `${label}: duplicate given name ${parts.given}`);
    assert.equal(family.has(parts.family), false, `${label}: duplicate family name ${parts.family}`);
    given.add(parts.given);
    family.add(parts.family);
  }
  return players.length;
}

const originalRandom = Math.random;
Math.random = seededRandom(0x2345ace);
try {
  resetIdCounter();
  let players = 0;
  for (const template of CLUB_TEMPLATES) {
    const club = createClub(template);
    fillYouthSquad(club);
    players += assertDistinct(club, template.id);
  }

  const repairClub = createClub(CLUB_TEMPLATES[0]);
  repairClub.players[1].name = repairClub.players[0].name;
  repairClub.players[2].name = repairClub.players[0].name;
  const changed = ensureDistinctClubPlayerNames(repairClub);
  assert.ok(changed >= 2, "legacy duplicate names should be repaired");
  assertDistinct(repairClub, "legacy-repair");

  console.log(JSON.stringify({ clubs: CLUB_TEMPLATES.length, players, repaired: changed }));
  console.log("Player names audit passed: team names avoid duplicate given/family components and repair legacy collisions");
} finally {
  Math.random = originalRandom;
}
