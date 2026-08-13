/** Development-only consistency checks for the mutable world graph. */

function fail(stage, message) {
  throw new Error(`[world-invariants:${stage}] ${message}`);
}

function finite(value) {
  return Number.isFinite(Number(value));
}

function checkPlayer(player, clubId, seen, stage) {
  if (!player || typeof player.id !== "string" || !player.id) {
    fail(stage, `invalid player at club ${clubId}`);
  }
  if (seen.has(player.id)) fail(stage, `duplicate player id ${player.id}`);
  seen.add(player.id);
  for (const field of ["age", "ovr", "potential", "fitness", "morale", "wage", "value"]) {
    if (player[field] != null && !finite(player[field])) {
      fail(stage, `player ${player.id} ${field} is not finite`);
    }
  }
}

/**
 * Validate cross-module references after a state transition.
 * Disabled by default; set VCFM_DEV_INVARIANTS=1 in Node or
 * window.__VCFM_DEV_INVARIANTS__ = true in a browser to enable it.
 */
export function assertWorldInvariants(world, stage = "unknown") {
  if (!world || typeof world !== "object") fail(stage, "world is missing");
  if (!Array.isArray(world.clubs) || !world.clubs.length) fail(stage, "clubs are missing");
  const clubIds = new Set();
  const playerIds = new Set();

  for (const club of world.clubs) {
    if (!club || typeof club.id !== "string" || !club.id) fail(stage, "invalid club id");
    if (clubIds.has(club.id)) fail(stage, `duplicate club id ${club.id}`);
    clubIds.add(club.id);
    if (!Array.isArray(club.players)) fail(stage, `club ${club.id} players are missing`);
    for (const player of club.players) checkPlayer(player, club.id, playerIds, stage);
    for (const player of club.youth?.players || []) checkPlayer(player, `${club.id}:youth`, playerIds, stage);

    const lineup = club.tactics?.lineup;
    if (lineup != null) {
      if (!Array.isArray(lineup)) fail(stage, `club ${club.id} lineup is invalid`);
      const squadIds = new Set(club.players.map((player) => player.id));
      const lineupIds = new Set();
      for (const playerId of lineup) {
        if (!squadIds.has(playerId)) fail(stage, `club ${club.id} lineup references ${playerId}`);
        if (lineupIds.has(playerId)) fail(stage, `club ${club.id} lineup repeats ${playerId}`);
        lineupIds.add(playerId);
      }
    }
    if (club.finance?.financeLedger != null && !Array.isArray(club.finance.financeLedger)) {
      fail(stage, `club ${club.id} finance ledger is invalid`);
    }
  }

  if (!clubIds.has(world.userClubId)) fail(stage, "user club is missing");
  if (!Array.isArray(world.fixtures)) fail(stage, "fixtures are missing");
  const fixtureIds = new Set();
  for (const fixture of world.fixtures) {
    if (!fixture || typeof fixture.id !== "string" || !fixture.id) fail(stage, "invalid fixture id");
    if (fixtureIds.has(fixture.id)) fail(stage, `duplicate fixture id ${fixture.id}`);
    fixtureIds.add(fixture.id);
    if (!clubIds.has(fixture.home) || !clubIds.has(fixture.away) || fixture.home === fixture.away) {
      fail(stage, `fixture ${fixture.id} references invalid clubs`);
    }
    for (const field of ["day", "homeGoals", "awayGoals", "matchSeed"]) {
      if (fixture[field] != null && !finite(fixture[field])) fail(stage, `fixture ${fixture.id} ${field} is not finite`);
    }
  }
  if (!world.table || typeof world.table !== "object" || Array.isArray(world.table)) {
    fail(stage, "table is missing");
  }
  for (const [clubId, row] of Object.entries(world.table)) {
    if (!clubIds.has(clubId)) fail(stage, `table references ${clubId}`);
    for (const field of ["played", "w", "d", "l", "gf", "ga", "pts"]) {
      if (row?.[field] != null && !finite(row[field])) fail(stage, `table ${clubId} ${field} is not finite`);
    }
  }
  return world;
}

export function worldInvariantsEnabled() {
  if (globalThis.__VCFM_DEV_INVARIANTS__ === true) return true;
  return typeof process !== "undefined" && process.env?.VCFM_DEV_INVARIANTS === "1";
}

export function assertWorldInvariantsWhenEnabled(world, stage) {
  return worldInvariantsEnabled() ? assertWorldInvariants(world, stage) : world;
}
