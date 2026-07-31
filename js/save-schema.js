export const CURRENT_SAVE_SCHEMA_VERSION = 2;

function isRecord(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function validateSaveStructure(world) {
  if (!isRecord(world)) throw new Error("invalid save: root must be an object");
  if (!Array.isArray(world.clubs) || world.clubs.length === 0) {
    throw new Error("invalid save: clubs are missing");
  }
  const clubIds = new Set();
  for (const club of world.clubs) {
    if (!isRecord(club) || typeof club.id !== "string" || !club.id.trim()) {
      throw new Error("invalid save: club id is missing");
    }
    if (clubIds.has(club.id)) throw new Error("invalid save: duplicate club id");
    if (!Array.isArray(club.players)) throw new Error("invalid save: club squad is missing");
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
