/** Competition squad registration and 15-21 development history. */

import { DIVISIONS } from "./data.js";
import { isTransferWindowOpen } from "./transfers.js";

export const REGISTRATION_VERSION = 1;
export const DEVELOPMENT_VERSION = 1;
export const MAX_REGISTERED_PLAYERS = 25;
export const MAX_NON_ASSOCIATION_TRAINED = 17;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function clubCountryId(club) {
  return club?.countryId || DIVISIONS[club?.division || 3]?.countryId || null;
}

function stableHash(value) {
  let hash = 2166136261;
  for (const char of String(value || "player")) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function trainingYearsAtAge(player) {
  return clamp((Number(player?.age) || 15) - 15, 0, 3);
}

function firstKnownClub(world, player, fallbackClub) {
  const firstHistory = (player?.history || []).find((row) => row.clubId);
  return world?.clubs?.find((club) => club.id === firstHistory?.clubId) || fallbackClub || null;
}

/**
 * Old saves have no youth biography. Seed one explicit background once from the
 * earliest known club, nationality, academy flag, and stable player identity.
 */
export function ensurePlayerDevelopment(world, player, currentClub = null) {
  if (!player) return null;
  if (!player.development || typeof player.development !== "object") {
    player.development = {
      version: DEVELOPMENT_VERSION,
      clubYears: {},
      associationYears: {},
      recordedSeasons: [],
      recentClubId: null,
      consecutiveClubYears: 0,
      seeded: false,
    };
  }
  const development = player.development;
  if (!development.clubYears || typeof development.clubYears !== "object") development.clubYears = {};
  if (!development.associationYears || typeof development.associationYears !== "object") {
    development.associationYears = {};
  }
  if (!Array.isArray(development.recordedSeasons)) development.recordedSeasons = [];
  development.version = DEVELOPMENT_VERSION;

  if (!development.seeded) {
    const origin = firstKnownClub(world, player, currentClub);
    const countryId = clubCountryId(origin);
    const localNationality = !!origin?.countryCode && player.nationality === origin.countryCode;
    const priorYears = trainingYearsAtAge(player);
    if (priorYears > 0 && countryId && (player.fromYouth || localNationality)) {
      development.associationYears[countryId] = Math.max(
        Number(development.associationYears[countryId]) || 0,
        priorYears
      );
      // Existing worlds need a stable academy biography. The fact is persisted
      // and visible after this migration; it never affects ability or results.
      const academyBackground = player.fromYouth || stableHash(player.id) % 100 < 45;
      if (academyBackground && origin?.id) {
        development.clubYears[origin.id] = Math.max(
          Number(development.clubYears[origin.id]) || 0,
          priorYears
        );
        development.recentClubId = origin.id;
        development.consecutiveClubYears = Math.max(
          Number(development.consecutiveClubYears) || 0,
          priorYears
        );
      }
    }
    development.seeded = true;
    development.seededAtSeason = world?.season ?? null;
  }
  return development;
}

export function recordDevelopmentSeason(world, season = world?.season) {
  if (!world || season == null) return 0;
  let recorded = 0;
  for (const club of world.clubs || []) {
    const countryId = clubCountryId(club);
    for (const player of [...(club.players || []), ...(club.youth?.players || [])]) {
      const development = ensurePlayerDevelopment(world, player, club);
      const age = Number(player.age) || 0;
      if (age < 15 || age > 21 || development.recordedSeasons.includes(season)) continue;
      development.clubYears[club.id] = (Number(development.clubYears[club.id]) || 0) + 1;
      development.consecutiveClubYears = development.recentClubId === club.id
        ? (Number(development.consecutiveClubYears) || 0) + 1
        : 1;
      development.recentClubId = club.id;
      if (countryId) {
        development.associationYears[countryId] =
          (Number(development.associationYears[countryId]) || 0) + 1;
      }
      development.recordedSeasons.push(season);
      if (development.recordedSeasons.length > 8) development.recordedSeasons.shift();
      recorded++;
    }
  }
  return recorded;
}

export function developmentStatus(world, club, player) {
  const development = ensurePlayerDevelopment(world, player, club);
  const countryId = clubCountryId(club);
  const clubYears = Number(development?.clubYears?.[club?.id]) || 0;
  const associationYears = Number(development?.associationYears?.[countryId]) || 0;
  const consecutiveClubYears = development?.recentClubId === club?.id
    ? Number(development.consecutiveClubYears) || 0
    : 0;
  return {
    clubYears,
    associationYears,
    consecutiveClubYears,
    clubTrained: clubYears >= 3,
    associationTrained: associationYears >= 3,
    listB: (Number(player?.age) || 99) <= 21 && consecutiveClubYears >= 2,
  };
}

export function registrationContextForFixture(club, fixture = null) {
  const type = fixture?.competitionType || (fixture?.competition === "cup" ? "domestic-cup" : "league");
  if (type === "continental-league-stage" || type === "continental-knockout" || fixture?.competition === "continental") {
    const competitionId = fixture?.competitionId || "continental";
    return {
      key: `continental:${competitionId}`,
      type: "continental",
      competitionId,
      name: fixture?.competitionName || "Continental competition",
    };
  }
  if (type === "domestic-cup") {
    return { key: "domestic-cup", type: "domestic-cup", competitionId: fixture?.competitionId || null, name: fixture?.competitionName || "Domestic cup" };
  }
  return {
    key: "league",
    type: "league",
    competitionId: club?.division || null,
    name: DIVISIONS[club?.division || 3]?.name || "League",
  };
}

export function availableRegistrationContexts(world, club) {
  const contexts = [registrationContextForFixture(club, null)];
  for (const competition of Object.values(world?.continentals || {})) {
    if (!(competition.participants || []).includes(club.id)) continue;
    contexts.push({
      key: `continental:${competition.id}`,
      type: "continental",
      competitionId: competition.id,
      name: competition.name || competition.nameEn || competition.id,
    });
  }
  return contexts;
}

function isExempt(world, club, player, context) {
  if (context.type === "league") return (Number(player.age) || 99) <= 21;
  if (context.type === "continental") return developmentStatus(world, club, player).listB;
  return true;
}

function registrationScore(player) {
  const positionFloor = player.pos === "GK" ? 0.3 : player.pos === "DEF" ? 0.2 : 0;
  return (Number(player.ovr) || 0) * 100 + (Number(player.potential) || 0) + positionFloor;
}

function automaticPlayerIds(world, club, context) {
  if (context.type === "domestic-cup") return (club.players || []).map((player) => player.id);
  const candidates = (club.players || []).filter((player) => !isExempt(world, club, player, context));
  const rows = candidates.map((player) => ({ player, status: developmentStatus(world, club, player) }));
  const clubTrained = rows.filter((row) => row.status.clubTrained).sort((a, b) => registrationScore(b.player) - registrationScore(a.player));
  const associationOnly = rows.filter((row) => row.status.associationTrained && !row.status.clubTrained).sort((a, b) => registrationScore(b.player) - registrationScore(a.player));
  const nonHomegrown = rows.filter((row) => !row.status.associationTrained).sort((a, b) => registrationScore(b.player) - registrationScore(a.player));

  const selected = [];
  const selectedIds = new Set();
  const add = (row) => {
    if (!row || selectedIds.has(row.player.id) || selected.length >= MAX_REGISTERED_PLAYERS) return;
    selected.push(row);
    selectedIds.add(row.player.id);
  };
  // Reserve the real quota categories first, then fill remaining places by ability.
  clubTrained.slice(0, 4).forEach(add);
  [...clubTrained.slice(4), ...associationOnly]
    .sort((a, b) => registrationScore(b.player) - registrationScore(a.player))
    .slice(0, Math.max(0, 8 - selected.length))
    .forEach(add);
  const remainder = rows
    .filter((row) => !selectedIds.has(row.player.id))
    .sort((a, b) => registrationScore(b.player) - registrationScore(a.player));
  for (const row of remainder) {
    if (!row.status.associationTrained) {
      const nonHomeCount = selected.filter((item) => !item.status.associationTrained).length;
      if (nonHomeCount >= MAX_NON_ASSOCIATION_TRAINED) continue;
    }
    if (context.type === "continental") {
      const nextClubTrained = selected.filter((item) => item.status.clubTrained).length + Number(row.status.clubTrained);
      if (selected.length + 1 > 21 + Math.min(4, nextClubTrained)) continue;
    }
    add(row);
  }
  return selected.map((row) => row.player.id);
}

function squadSignature(club) {
  return (club.players || []).map((player) => player.id).sort().join("|");
}

export function ensureClubRegistrations(world, club) {
  if (!club) return null;
  if (!club.registrations || club.registrations.season !== world?.season) {
    club.registrations = { version: REGISTRATION_VERSION, season: world?.season, entries: {} };
  }
  if (!club.registrations.entries || typeof club.registrations.entries !== "object") {
    club.registrations.entries = {};
  }
  club.registrations.version = REGISTRATION_VERSION;
  for (const player of [...(club.players || []), ...(club.youth?.players || [])]) {
    ensurePlayerDevelopment(world, player, club);
  }
  return club.registrations;
}

export function ensureRegistration(world, club, contextOrFixture = null) {
  const registrations = ensureClubRegistrations(world, club);
  const context = contextOrFixture?.key
    ? contextOrFixture
    : registrationContextForFixture(club, contextOrFixture);
  if (context.type === "domestic-cup") return { context, playerIds: (club.players || []).map((player) => player.id), auto: true };
  const signature = squadSignature(club);
  let entry = registrations.entries[context.key];
  if (!entry) {
    entry = {
      contextType: context.type,
      competitionId: context.competitionId,
      playerIds: automaticPlayerIds(world, club, context),
      auto: true,
      updatedDay: world?.day || 0,
      squadSignature: signature,
    };
    registrations.entries[context.key] = entry;
  } else {
    const currentIds = new Set((club.players || []).map((player) => player.id));
    entry.playerIds = (entry.playerIds || []).filter((id) => currentIds.has(id));
    if (entry.auto && entry.squadSignature !== signature && isTransferWindowOpen(world)) {
      entry.playerIds = automaticPlayerIds(world, club, context);
      entry.updatedDay = world?.day || 0;
    } else if (!entry.auto && entry.squadSignature !== signature) {
      const listed = new Set(entry.playerIds);
      const listedClub = { ...club, players: (club.players || []).filter((player) => listed.has(player.id)) };
      entry.playerIds = automaticPlayerIds(world, listedClub, context);
    }
    entry.squadSignature = signature;
  }
  return { ...entry, context };
}

export function ensureWorldRegistrations(world) {
  for (const club of world?.clubs || []) {
    ensureClubRegistrations(world, club);
    for (const context of availableRegistrationContexts(world, club)) {
      ensureRegistration(world, club, context);
    }
  }
  return world;
}

export function registrationSummary(world, club, contextOrFixture = null) {
  const entry = ensureRegistration(world, club, contextOrFixture);
  const context = entry.context;
  const listed = new Set(entry.playerIds || []);
  const registered = (club.players || []).filter((player) => listed.has(player.id));
  const statuses = registered.map((player) => developmentStatus(world, club, player));
  const clubTrained = statuses.filter((status) => status.clubTrained).length;
  const associationTrained = statuses.filter((status) => status.associationTrained).length;
  const nonAssociation = registered.length - associationTrained;
  const exempt = (club.players || []).filter((player) => isExempt(world, club, player, context)).length;
  const maxByClubQuota = context.type === "continental" ? 21 + Math.min(4, clubTrained) : MAX_REGISTERED_PLAYERS;
  const valid =
    registered.length <= MAX_REGISTERED_PLAYERS &&
    nonAssociation <= MAX_NON_ASSOCIATION_TRAINED &&
    registered.length <= maxByClubQuota;
  return {
    context,
    entry,
    registered: registered.length,
    clubTrained,
    associationTrained,
    nonAssociation,
    exempt,
    maxByClubQuota,
    valid,
    locked: !isTransferWindowOpen(world),
  };
}

export function autoRegisterClub(world, club, contextOrFixture = null) {
  const entry = ensureRegistration(world, club, contextOrFixture);
  if (entry.context.type === "domestic-cup") return { ok: false, msg: "国内杯无需报名" };
  if (!isTransferWindowOpen(world)) return { ok: false, msg: "报名名单仅可在转会窗内调整" };
  const stored = club.registrations.entries[entry.context.key];
  stored.playerIds = automaticPlayerIds(world, club, entry.context);
  stored.auto = true;
  stored.updatedDay = world.day || 0;
  stored.squadSignature = squadSignature(club);
  return { ok: true, msg: "已自动提交合规报名名单", summary: registrationSummary(world, club, entry.context) };
}

export function setPlayerRegistered(world, club, contextOrFixture, playerId, registered) {
  const entry = ensureRegistration(world, club, contextOrFixture);
  if (entry.context.type === "domestic-cup") return { ok: false, msg: "国内杯无需报名" };
  if (!isTransferWindowOpen(world)) return { ok: false, msg: "报名名单已锁定，需等待转会窗" };
  const player = (club.players || []).find((candidate) => candidate.id === playerId);
  if (!player) return { ok: false, msg: "球员不在一线队" };
  if (isExempt(world, club, player, entry.context)) {
    return { ok: false, msg: entry.context.type === "league" ? "U21 球员无需占报名名额" : "该球员符合洲际 B 名单资格" };
  }
  const stored = club.registrations.entries[entry.context.key];
  const ids = new Set(stored.playerIds || []);
  if (registered) ids.add(playerId);
  else ids.delete(playerId);
  const previous = stored.playerIds;
  stored.playerIds = [...ids];
  const summary = registrationSummary(world, club, entry.context);
  if (!summary.valid) {
    stored.playerIds = previous;
    return { ok: false, msg: "该变更会超过 25 人、17 名非本土培养或洲际俱乐部培养名额限制" };
  }
  stored.auto = false;
  stored.updatedDay = world.day || 0;
  stored.squadSignature = squadSignature(club);
  return { ok: true, msg: registered ? "球员已报名" : "球员已移出报名名单", summary };
}

export function playerCompetitionEligibility(world, club, fixture, player) {
  if (!player || !club) return { eligible: false, reason: "球员不在俱乐部" };
  const context = registrationContextForFixture(club, fixture);
  if (context.type === "domestic-cup") return { eligible: true, route: "cup", context };
  const entry = ensureRegistration(world, club, context);
  if (isExempt(world, club, player, context)) {
    return {
      eligible: true,
      route: context.type === "league" ? "u21" : "list-b",
      context,
    };
  }
  if ((entry.playerIds || []).includes(player.id)) return { eligible: true, route: "registered", context };
  return { eligible: false, route: "unregistered", reason: "未进入本赛事报名名单", context };
}

export function eligiblePlayerIds(world, club, fixture) {
  return new Set(
    (club?.players || [])
      .filter((player) => playerCompetitionEligibility(world, club, fixture, player).eligible)
      .map((player) => player.id)
  );
}
