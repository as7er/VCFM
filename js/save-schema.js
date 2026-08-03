export const CURRENT_SAVE_SCHEMA_VERSION = 2;

function isRecord(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function finiteIfPresent(value, label) {
  if (value != null && !Number.isFinite(Number(value))) {
    throw new Error(`invalid save: ${label} must be finite`);
  }
}

export function validateSaveStructure(world) {
  if (!isRecord(world)) throw new Error("invalid save: root must be an object");
  if (!Array.isArray(world.clubs) || world.clubs.length === 0) {
    throw new Error("invalid save: clubs are missing");
  }
  const clubIds = new Set();
  const playerIds = new Set();
  for (const club of world.clubs) {
    if (!isRecord(club) || typeof club.id !== "string" || !club.id.trim()) {
      throw new Error("invalid save: club id is missing");
    }
    if (clubIds.has(club.id)) throw new Error("invalid save: duplicate club id");
    if (!Array.isArray(club.players)) throw new Error("invalid save: club squad is missing");
    finiteIfPresent(club.money, `club ${club.id} money`);
    const localPlayerIds = new Set();
    for (const player of club.players) {
      if (!isRecord(player) || typeof player.id !== "string" || !player.id.trim()) {
        throw new Error(`invalid save: player id is missing at club ${club.id}`);
      }
      if (localPlayerIds.has(player.id) || playerIds.has(player.id)) {
        throw new Error(`invalid save: duplicate player id ${player.id}`);
      }
      localPlayerIds.add(player.id);
      playerIds.add(player.id);
      for (const field of ["age", "ovr", "potential", "fitness", "morale", "wage", "value"]) {
        finiteIfPresent(player[field], `player ${player.id} ${field}`);
      }
      if (player.attrs != null && !isRecord(player.attrs)) {
        throw new Error(`invalid save: player ${player.id} attributes are invalid`);
      }
      for (const [attribute, value] of Object.entries(player.attrs || {})) {
        finiteIfPresent(value, `player ${player.id} attribute ${attribute}`);
      }
    }
    if (club.tactics?.lineup != null) {
      if (!Array.isArray(club.tactics.lineup)) {
        throw new Error(`invalid save: club ${club.id} lineup is invalid`);
      }
      const lineupIds = new Set();
      for (const playerId of club.tactics.lineup) {
        if (!localPlayerIds.has(playerId)) {
          throw new Error(`invalid save: club ${club.id} lineup references missing player`);
        }
        if (lineupIds.has(playerId)) {
          throw new Error(`invalid save: club ${club.id} lineup contains duplicate player`);
        }
        lineupIds.add(playerId);
      }
    }
    clubIds.add(club.id);
  }
  if (typeof world.userClubId !== "string" || !clubIds.has(world.userClubId)) {
    throw new Error("invalid save: managed club is missing");
  }
  if (!Array.isArray(world.fixtures)) throw new Error("invalid save: fixtures are missing");
  if (!isRecord(world.table)) throw new Error("invalid save: table is missing");
  if (!Number.isFinite(Number(world.season)) || !Number.isFinite(Number(world.day))) {
    throw new Error("invalid save: season or day is missing");
  }
  const fixtureIds = new Set();
  for (const fixture of world.fixtures) {
    if (!isRecord(fixture) || typeof fixture.id !== "string" || !fixture.id.trim()) {
      throw new Error("invalid save: fixture id is missing");
    }
    if (fixtureIds.has(fixture.id)) throw new Error("invalid save: duplicate fixture id");
    fixtureIds.add(fixture.id);
    if (!clubIds.has(fixture.home) || !clubIds.has(fixture.away) || fixture.home === fixture.away) {
      throw new Error(`invalid save: fixture ${fixture.id} has invalid clubs`);
    }
    for (const field of ["day", "homeGoals", "awayGoals", "matchSeed"]) {
      finiteIfPresent(fixture[field], `fixture ${fixture.id} ${field}`);
    }
  }
  for (const [clubId, row] of Object.entries(world.table)) {
    if (!clubIds.has(clubId) || !isRecord(row)) {
      throw new Error("invalid save: table references an invalid club");
    }
    for (const field of ["played", "w", "d", "l", "gf", "ga", "pts"]) {
      finiteIfPresent(row[field], `table ${clubId} ${field}`);
    }
  }
  for (const listName of ["transferNegotiations", "dealNegotiations"]) {
    const list = world[listName];
    if (list == null) continue;
    if (!Array.isArray(list)) throw new Error(`invalid save: ${listName} is invalid`);
    const ids = new Set();
    for (const negotiation of list) {
      if (!isRecord(negotiation) || typeof negotiation.id !== "string" || !negotiation.id) {
        throw new Error(`invalid save: ${listName} contains an invalid record`);
      }
      if (ids.has(negotiation.id)) throw new Error(`invalid save: duplicate ${listName} id`);
      ids.add(negotiation.id);
      for (const field of ["buyerClubId", "sellerClubId", "clubId", "userClubId", "ownerClubId", "hostClubId", "payerClubId"]) {
        const clubId = negotiation[field];
        if (clubId != null && !clubIds.has(clubId)) {
          throw new Error(`invalid save: ${listName} references a missing club`);
        }
      }
      for (const field of ["fee", "askingFee", "wage", "signingBonus", "wageShare", "years", "decisionDay"]) {
        finiteIfPresent(negotiation[field], `${listName} ${negotiation.id} ${field}`);
      }
    }
  }

  const schemaVersion = world.schemaVersion == null ? 0 : Number(world.schemaVersion);
  if (!Number.isInteger(schemaVersion) || schemaVersion < 0) {
    throw new Error("invalid save: schema version is invalid");
  }
  if (schemaVersion > CURRENT_SAVE_SCHEMA_VERSION) {
    throw new Error("incompatible save: created by a newer VCFM version");
  }
  return world;
}

/**
 * Runs legacy repair before committing the new schema marker. Current saves still
 * run the idempotent repair pass so newly introduced derived fields stay healthy.
 */
export function migrateSaveSchema(world, config) {
  validateSaveStructure(world);
  const legacyRepair = typeof config === "function" ? config : null;
  const migrations = config?.migrations || {};
  const ensureCurrent = config?.ensureCurrent || null;
  const originalVersion = world.schemaVersion == null ? 0 : Number(world.schemaVersion);
  let version = originalVersion;
  while (version < CURRENT_SAVE_SCHEMA_VERSION) {
    const targetVersion = version + 1;
    const migrate = migrations[targetVersion] || legacyRepair;
    if (typeof migrate !== "function") {
      throw new Error(`save migration v${version}->v${targetVersion} is missing`);
    }
    migrate(world, { fromVersion: version, toVersion: targetVersion });
    world.schemaVersion = targetVersion;
    version = targetVersion;
  }
  if (originalVersion === CURRENT_SAVE_SCHEMA_VERSION && typeof ensureCurrent === "function") {
    ensureCurrent(world, { fromVersion: version, toVersion: version });
  }
  return world;
}
