import { FORMATIONS } from "./data.js";

export const CURRENT_SAVE_SCHEMA_VERSION = 3;

function isRecord(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function finiteIfPresent(value, label) {
  if (value != null && !Number.isFinite(Number(value))) {
    throw new Error(`invalid save: ${label} must be finite`);
  }
}

function validateSponsorshipContract(contract, label) {
  if (contract == null) return;
  if (!isRecord(contract) || typeof contract.id !== "string" || !contract.id) {
    throw new Error(`invalid save: ${label} is invalid`);
  }
  for (const field of [
    "startSeason", "endSeason", "years", "weeklyBase", "signingBonus",
    "targetRate", "performanceBonus", "bonusSettledSeason",
  ]) {
    finiteIfPresent(contract[field], `${label} ${field}`);
  }
}

function validatePlayerHabits(player, label) {
  if (
    player.playingHabits != null &&
    (!Array.isArray(player.playingHabits) ||
      player.playingHabits.some((habitId) => typeof habitId !== "string" || !habitId))
  ) {
    throw new Error(`invalid save: ${label} habits are invalid`);
  }
  if (player.habitTraining == null) return;
  if (
    !isRecord(player.habitTraining) ||
    typeof player.habitTraining.habitId !== "string" ||
    !["learn", "unlearn"].includes(player.habitTraining.mode)
  ) {
    throw new Error(`invalid save: ${label} habit training is invalid`);
  }
  for (const field of [
    "progress", "startedSeason", "startedDay", "lastProcessedSeason", "lastProcessedDay",
  ]) {
    finiteIfPresent(player.habitTraining[field], `${label} habit training ${field}`);
  }
}

export function validateSaveStructure(world, options = {}) {
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
    if (club.sponsorship != null) {
      if (!isRecord(club.sponsorship)) throw new Error(`invalid save: club ${club.id} sponsorship is invalid`);
      validateSponsorshipContract(club.sponsorship.activeContract, `club ${club.id} active sponsorship`);
      validateSponsorshipContract(club.sponsorship.nextContract, `club ${club.id} next sponsorship`);
      if (club.sponsorship.offers != null && !Array.isArray(club.sponsorship.offers)) {
        throw new Error(`invalid save: club ${club.id} sponsorship offers are invalid`);
      }
      const offerIds = new Set();
      for (const offer of club.sponsorship.offers || []) {
        validateSponsorshipContract(offer, `club ${club.id} sponsorship offer`);
        if (offerIds.has(offer.id)) throw new Error(`invalid save: club ${club.id} has duplicate sponsorship offers`);
        offerIds.add(offer.id);
      }
    }
    if (club.finance?.debt != null) {
      if (!isRecord(club.finance.debt) || !Array.isArray(club.finance.debt.facilities)) {
        throw new Error(`invalid save: club ${club.id} debt is invalid`);
      }
      const debtIds = new Set();
      for (const facility of club.finance.debt.facilities) {
        if (!isRecord(facility) || typeof facility.id !== "string" || !facility.id) {
          throw new Error(`invalid save: club ${club.id} debt facility is invalid`);
        }
        if (debtIds.has(facility.id)) throw new Error(`invalid save: club ${club.id} has duplicate debt facilities`);
        debtIds.add(facility.id);
        for (const field of [
          "originalPrincipal", "balance", "annualRate", "termSeasons", "startSeason",
          "maturitySeason", "lastPrincipalSeason",
        ]) {
          finiteIfPresent(facility[field], `debt facility ${facility.id} ${field}`);
        }
      }
    }
    if (club.finance?.leagueTransitionPayments != null) {
      if (!Array.isArray(club.finance.leagueTransitionPayments)) {
        throw new Error(`invalid save: club ${club.id} league transition payments are invalid`);
      }
      const paymentIds = new Set();
      for (const payment of club.finance.leagueTransitionPayments) {
        if (!isRecord(payment) || typeof payment.id !== "string" || !payment.id) {
          throw new Error(`invalid save: club ${club.id} league transition payment is invalid`);
        }
        if (paymentIds.has(payment.id)) throw new Error(`invalid save: club ${club.id} has duplicate league transition payments`);
        paymentIds.add(payment.id);
        for (const field of ["season", "amount", "installment", "paidSeason", "paidDay"]) {
          finiteIfPresent(payment[field], `league transition payment ${payment.id} ${field}`);
        }
      }
    }
    for (const field of ["wageRatio", "debtRatio", "annualRevenue", "reviewedSeason", "reviewedDay"]) {
      finiteIfPresent(club.finance?.compliance?.[field], `club ${club.id} compliance ${field}`);
    }
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
      validatePlayerHabits(player, `player ${player.id}`);
      if (player.developmentStats != null) {
        if (!isRecord(player.developmentStats)) throw new Error(`invalid save: player ${player.id} development stats are invalid`);
        for (const field of ["apps", "starts", "minutes", "goals", "assists", "ratingSum", "lastDay"]) {
          finiteIfPresent(player.developmentStats[field], `player ${player.id} development ${field}`);
        }
      }
    }
    for (const player of club.youth?.players || []) {
      if (!isRecord(player) || typeof player.id !== "string" || !player.id.trim()) {
        throw new Error(`invalid save: youth player id is missing at club ${club.id}`);
      }
      if (playerIds.has(player.id)) throw new Error(`invalid save: duplicate player id ${player.id}`);
      playerIds.add(player.id);
      for (const field of ["age", "ovr", "potential", "fitness", "morale", "wage", "value"]) {
        finiteIfPresent(player[field], `youth player ${player.id} ${field}`);
      }
      validatePlayerHabits(player, `youth player ${player.id}`);
      if (player.developmentStats != null) {
        if (!isRecord(player.developmentStats)) throw new Error(`invalid save: youth player ${player.id} development stats are invalid`);
        for (const field of ["apps", "starts", "minutes", "goals", "assists", "ratingSum", "lastDay"]) {
          finiteIfPresent(player.developmentStats[field], `youth player ${player.id} development ${field}`);
        }
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
    for (const field of ["possessionFormation", "outOfPossessionFormation"]) {
      const formationId = club.tactics?.[field];
      if (formationId != null && (typeof formationId !== "string" || !FORMATIONS[formationId])) {
        throw new Error(`invalid save: club ${club.id} ${field} is invalid`);
      }
    }
    // 战术角色与职责：结构与 lineup 同长、每项为非空字符串；合法角色/职责 id
    // 由 ensureTactics / ensureLineupRoles 在读取时兜底，这里只做可解释的结构校验。
    if (club.tactics?.roles != null || club.tactics?.duties != null) {
      if (!Array.isArray(club.tactics.roles) || !Array.isArray(club.tactics.duties)) {
        throw new Error(`invalid save: club ${club.id} tactics roles/duties are invalid`);
      }
      for (const [index, roleId] of club.tactics.roles.entries()) {
        if (typeof roleId !== "string" || !roleId.trim()) {
          throw new Error(`invalid save: club ${club.id} tactics role ${index} is invalid`);
        }
      }
      for (const [index, dutyId] of club.tactics.duties.entries()) {
        if (typeof dutyId !== "string" || !dutyId.trim()) {
          throw new Error(`invalid save: club ${club.id} tactics duty ${index} is invalid`);
        }
      }
    }
    if (
      club.tactics?.coachRoleIdentityId != null &&
      typeof club.tactics.coachRoleIdentityId !== "string"
    ) {
      throw new Error(`invalid save: club ${club.id} coach role identity is invalid`);
    }
    if (
      club.tactics?.coachRoleIdentityVersion != null &&
      !Number.isFinite(Number(club.tactics.coachRoleIdentityVersion))
    ) {
      throw new Error(`invalid save: club ${club.id} coach role identity version is invalid`);
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
  if (world.development != null) {
    if (!isRecord(world.development) || !Array.isArray(world.development.matches)) {
      throw new Error("invalid save: development football is invalid");
    }
    for (const field of ["version", "lastMatchDay", "nextMatchDay", "nextMatchSeq", "matchdayCount"]) {
      finiteIfPresent(world.development[field], `development football ${field}`);
    }
    const developmentIds = new Set();
    for (const match of world.development.matches) {
      if (!isRecord(match) || typeof match.id !== "string" || !match.id) {
        throw new Error("invalid save: development football contains an invalid match");
      }
      if (developmentIds.has(match.id)) throw new Error("invalid save: duplicate development match id");
      developmentIds.add(match.id);
      if (!clubIds.has(match.home) || !clubIds.has(match.away) || match.home === match.away) {
        throw new Error(`invalid save: development match ${match.id} has invalid clubs`);
      }
      for (const field of ["day", "season", "matchSeed", "timeStep", "separationPasses"]) {
        finiteIfPresent(match[field], `development match ${match.id} ${field}`);
      }
      for (const side of ["home", "away"]) {
        finiteIfPresent(match.score?.[side], `development match ${match.id} ${side} score`);
      }
      if (!Array.isArray(match.playerIds) || match.playerIds.some((playerId) => typeof playerId !== "string" || !playerId)) {
        throw new Error(`invalid save: development match ${match.id} has invalid player references`);
      }
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
      for (const field of [
        "fee", "askingFee", "wage", "signingBonus", "wageShare", "years", "decisionDay",
        "upfrontPct", "installmentCount", "appearanceBonus", "appearanceTarget", "sellOnPct",
      ]) {
        finiteIfPresent(negotiation[field], `${listName} ${negotiation.id} ${field}`);
      }
    }
  }
  if (world.scoutingKnowledge != null) {
    const knowledge = world.scoutingKnowledge;
    if (!isRecord(knowledge)) throw new Error("invalid save: scouting knowledge is invalid");
    for (const group of ["players", "clubs", "divisions", "nations"]) {
      if (!isRecord(knowledge[group])) {
        throw new Error(`invalid save: scouting knowledge ${group} is invalid`);
      }
      for (const [key, item] of Object.entries(knowledge[group])) {
        if (!key || !isRecord(item)) {
          throw new Error(`invalid save: scouting knowledge ${group} contains an invalid record`);
        }
        for (const field of [
          "level", "observations", "lastObservedSeason", "lastObservedDay",
          "division", "ovrEstimate", "potentialEstimate", "valueEstimate",
        ]) {
          finiteIfPresent(item[field], `scouting knowledge ${group} ${key} ${field}`);
        }
        if (item.attrs != null) {
          if (!isRecord(item.attrs)) {
            throw new Error(`invalid save: scouting knowledge ${group} ${key} attributes are invalid`);
          }
          for (const [attribute, value] of Object.entries(item.attrs)) {
            finiteIfPresent(value, `scouting knowledge ${group} ${key} attribute ${attribute}`);
          }
        }
        if (
          item.habitIds != null &&
          (!Array.isArray(item.habitIds) || item.habitIds.some((habitId) => typeof habitId !== "string" || !habitId))
        ) {
          throw new Error(`invalid save: scouting knowledge ${group} ${key} habits are invalid`);
        }
      }
    }
  } else if (Number(world.schemaVersion) >= 3 && !options.allowMissingScoutingKnowledge) {
    throw new Error("invalid save: scouting knowledge is missing");
  }
  if (world.scoutMissions != null) {
    if (!Array.isArray(world.scoutMissions)) throw new Error("invalid save: scout missions are invalid");
    for (const mission of world.scoutMissions) {
      if (!isRecord(mission) || typeof mission.id !== "string" || !mission.id) {
        throw new Error("invalid save: scout missions contain an invalid record");
      }
      for (const field of ["startDay", "doneDay", "cost", "filters.maxValue"]) {
        const value = field === "filters.maxValue" ? mission.filters?.maxValue : mission[field];
        finiteIfPresent(value, `scout mission ${mission.id} ${field}`);
      }
    }
  }
  if (world.financeObligations != null) {
    if (!Array.isArray(world.financeObligations)) {
      throw new Error("invalid save: finance obligations are invalid");
    }
    const obligationIds = new Set();
    for (const obligation of world.financeObligations) {
      if (!isRecord(obligation) || typeof obligation.id !== "string" || !obligation.id) {
        throw new Error("invalid save: finance obligations contain an invalid record");
      }
      if (obligationIds.has(obligation.id)) {
        throw new Error("invalid save: duplicate finance obligation id");
      }
      obligationIds.add(obligation.id);
      for (const field of ["payerClubId", "payeeClubId", "triggerClubId"]) {
        if (obligation[field] != null && !clubIds.has(obligation[field])) {
          throw new Error("invalid save: finance obligation references a missing club");
        }
      }
      for (const field of ["amount", "createdSeason", "createdDay", "dueSeason", "dueDay", "target", "progress"]) {
        finiteIfPresent(obligation[field], `finance obligation ${obligation.id} ${field}`);
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
  validateSaveStructure(world, { allowMissingScoutingKnowledge: true });
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
  validateSaveStructure(world);
  return world;
}
