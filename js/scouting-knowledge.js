/** Persistent scouting knowledge, estimates and recruitment shortlisting. */

export const SCOUTING_KNOWLEDGE_VERSION = 1;

const DAYS_PER_SEASON = 220;
const PUBLIC_KNOWLEDGE = 6;
const ATTRIBUTE_KEYS = [
  "pace",
  "shooting",
  "passing",
  "dribbling",
  "defending",
  "physical",
  "finishing",
  "tackling",
  "marking",
  "strength",
  "stamina",
  "vision",
  "reflexes",
  "handling",
  "positioning",
  "kicking",
];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export function stableScoutingUnit(seed) {
  let hash = 2166136261;
  const text = String(seed || "");
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function scoutRatingOf(userClub) {
  return clamp(userClub?.staff?.scout?.rating || 8, 1, 20);
}

function seasonDay(world) {
  return {
    season: Number(world?.season) || 0,
    day: Math.max(1, Number(world?.day) || 1),
  };
}

function ageInDays(world, item) {
  if (!item || item.lastObservedSeason == null || item.lastObservedDay == null) return null;
  const current = seasonDay(world);
  const seasons = Math.max(0, current.season - Number(item.lastObservedSeason || current.season));
  return Math.max(0, seasons * DAYS_PER_SEASON + current.day - Number(item.lastObservedDay || 1));
}

function decayedLevel(world, item, floor = 0) {
  if (!item) return floor;
  const age = ageInDays(world, item);
  if (age == null) return Math.max(floor, clamp(item.level, 0, 100));
  const decay = Math.max(0, age - 28) * 0.12;
  return Math.max(floor, clamp(item.level, 0, 100) - decay);
}

function initializeHomeKnowledge(world, knowledge) {
  if (knowledge.initialized || !Array.isArray(world?.clubs)) return;
  const user = world.clubs.find((club) => club.id === world.userClubId);
  if (!user) return;
  const current = seasonDay(world);
  if (user.division != null) {
    knowledge.divisions[String(user.division)] = {
      level: 36,
      lastObservedSeason: current.season,
      lastObservedDay: current.day,
      source: "managed-competition",
    };
  }
  const nation = user.countryCode || user.countryId;
  if (nation) {
    knowledge.nations[String(nation)] = {
      level: 24,
      lastObservedSeason: current.season,
      lastObservedDay: current.day,
      source: "managed-country",
    };
  }
  knowledge.initialized = true;
}

export function ensureScoutingKnowledge(world) {
  if (!world) return null;
  const existing = record(world.scoutingKnowledge);
  existing.players = record(existing.players);
  existing.clubs = record(existing.clubs);
  existing.divisions = record(existing.divisions);
  existing.nations = record(existing.nations);
  existing.version = SCOUTING_KNOWLEDGE_VERSION;
  world.scoutingKnowledge = existing;
  if (!Array.isArray(world.scoutMissions)) world.scoutMissions = [];
  if (!Array.isArray(world.scoutWatch)) world.scoutWatch = [];
  initializeHomeKnowledge(world, existing);
  return existing;
}

function scopeRecord(knowledge, group, key) {
  if (key == null || key === "") return null;
  return knowledge[group]?.[String(key)] || null;
}

export function scoutClubKnowledge(world, club, userClub = null) {
  const knowledge = ensureScoutingKnowledge(world);
  if (!knowledge || !club) {
    return { level: PUBLIC_KNOWLEDGE, confidence: 20, fogLevel: 0, ageDays: null, stale: true };
  }
  const clubRecord = scopeRecord(knowledge, "clubs", club.id);
  const divisionRecord = scopeRecord(knowledge, "divisions", club.division);
  const nationKey = club.countryCode || club.countryId;
  const nationRecord = scopeRecord(knowledge, "nations", nationKey);
  const clubLevel = decayedLevel(world, clubRecord);
  const divisionLevel = decayedLevel(world, divisionRecord) * 0.72;
  const nationLevel = decayedLevel(world, nationRecord) * 0.48;
  const level = clamp(Math.max(PUBLIC_KNOWLEDGE, clubLevel, divisionLevel, nationLevel), 0, 100);
  const rating = scoutRatingOf(userClub);
  const confidence = clamp(Math.round(18 + level * 0.65 + rating), 20, 94);
  const ageDays = ageInDays(world, clubRecord || divisionRecord || nationRecord);
  const fogLevel = confidence >= 78 ? 3 : confidence >= 60 ? 2 : confidence >= 42 ? 1 : 0;
  return { level, confidence, fogLevel, ageDays, stale: ageDays == null || ageDays > 56 };
}

function touchScope(world, group, key, gain, source) {
  if (key == null || key === "") return;
  const knowledge = ensureScoutingKnowledge(world);
  const current = seasonDay(world);
  const prior = knowledge[group][String(key)] || {};
  const level = decayedLevel(world, prior);
  knowledge[group][String(key)] = {
    level: clamp(level + gain * (1 - level / 120), 0, 100),
    lastObservedSeason: current.season,
    lastObservedDay: current.day,
    source,
  };
}

export function observeScoutingScope(world, club, { gain = 16, source = "scout-mission" } = {}) {
  if (!world || !club) return;
  touchScope(world, "clubs", club.id, gain, source);
  touchScope(world, "divisions", club.division, gain * 0.45, source);
  touchScope(world, "nations", club.countryCode || club.countryId, gain * 0.28, source);
}

function metricEstimate(value, noise, seed, min = 1, max = 20) {
  const actual = clamp(Math.round(Number(value) || min), min, max);
  const span = Math.max(0, Math.round(noise));
  if (!span) return actual;
  const offset = Math.round((stableScoutingUnit(seed) * 2 - 1) * span);
  return clamp(actual + offset, min, max);
}

function estimateNoise(level, extra = 0) {
  return Math.max(1, Math.ceil((100 - clamp(level, 0, 100)) / 26) + extra);
}

function generatedEstimates(player, level, seed) {
  const ovrNoise = estimateNoise(level);
  const potentialNoise = estimateNoise(level, level < 60 ? 1 : 0);
  const ovr = metricEstimate(player?.ovr || 10, ovrNoise, `${seed}:ovr`);
  const potential = Math.max(
    ovr,
    metricEstimate(player?.potential ?? player?.ovr ?? 10, potentialNoise, `${seed}:pot`)
  );
  const value = Math.max(0, Number(player?.value) || 0);
  const valueNoise = Math.max(0.08, 0.38 - clamp(level, 0, 100) * 0.0028);
  const valueBias = (stableScoutingUnit(`${seed}:value`) * 2 - 1) * valueNoise;
  const valueEstimate = Math.max(10_000, Math.round(value * (1 + valueBias) / 10_000) * 10_000);
  const attrs = {};
  for (const key of ATTRIBUTE_KEYS) {
    attrs[key] = metricEstimate(player?.attrs?.[key] || 10, ovrNoise, `${seed}:attr:${key}`);
  }
  return { ovr, potential, value: valueEstimate, attrs };
}

function publicScopeLevel(world, player, clubHint = null) {
  const knowledge = ensureScoutingKnowledge(world);
  if (!knowledge || !player) return PUBLIC_KNOWLEDGE;
  const club = clubHint || world.clubs?.find((candidate) => candidate.id === player.clubId);
  if (!club) return PUBLIC_KNOWLEDGE;
  return scoutClubKnowledge(world, club).level * 0.35;
}

function knowledgeRecord(world, player) {
  const knowledge = ensureScoutingKnowledge(world);
  return knowledge?.players?.[player?.id] || null;
}

function range20(center, band) {
  return {
    estimate: clamp(Math.round(center), 1, 20),
    lo: clamp(Math.round(center) - band, 1, 20),
    hi: clamp(Math.round(center) + band, 1, 20),
  };
}

export function scoutPlayerSnapshot(world, player, userClub, options = {}) {
  if (!player) return null;
  const ownPlayer = options.ownPlayer || player.clubId === userClub?.id;
  if (ownPlayer) {
    const attrs = {};
    for (const key of ATTRIBUTE_KEYS) {
      const value = clamp(Math.round(player.attrs?.[key] || 10), 1, 20);
      attrs[key] = { estimate: value, lo: value, hi: value, exact: true };
    }
    const value = Math.max(0, Number(player.value) || 0);
    return {
      level: 100,
      confidence: 100,
      fogLevel: 3,
      ageDays: 0,
      stale: false,
      observations: 0,
      source: "own-player",
      ovrEstimate: player.ovr,
      ovrLo: player.ovr,
      ovrHi: player.ovr,
      ovrText: String(player.ovr ?? "-"),
      potentialEstimate: player.potential ?? player.ovr,
      potentialLo: player.potential ?? player.ovr,
      potentialHi: player.potential ?? player.ovr,
      potentialText: String(player.potential ?? player.ovr ?? "-"),
      valueEstimate: value,
      valueLo: value,
      valueHi: value,
      attrs,
    };
  }

  const stored = knowledgeRecord(world, player);
  const storedLevel = decayedLevel(world, stored, PUBLIC_KNOWLEDGE);
  const scopeLevel = publicScopeLevel(world, player, options.club);
  const level = clamp(
    options.levelOverride ?? Math.max(PUBLIC_KNOWLEDGE, storedLevel, scopeLevel),
    0,
    100
  );
  const rating = scoutRatingOf(userClub);
  const confidence = clamp(Math.round(18 + level * 0.65 + rating), 20, 94);
  const projected = options.projected || options.levelOverride != null || !stored;
  const seed = `${player.id}:${options.seedSalt || stored?.observations || "public"}:${Math.round(level)}`;
  const generated = generatedEstimates(player, level, seed);
  const estimates = projected
    ? generated
    : {
        ovr: Number(stored.ovrEstimate) || generated.ovr,
        potential: Number(stored.potentialEstimate) || generated.potential,
        value: Number(stored.valueEstimate) || generated.value,
        attrs: { ...generated.attrs, ...record(stored.attrs) },
      };
  const baseBand = Math.max(1, Math.ceil((100 - confidence) / 24));
  const potentialBand = Math.max(1, baseBand + (level < 55 ? 1 : 0));
  const ovrRange = range20(estimates.ovr, baseBand);
  const potentialRange = range20(Math.max(estimates.ovr, estimates.potential), potentialBand);
  const valueSpread = Math.max(0.08, 0.45 - confidence * 0.0036);
  const valueLo = Math.max(10_000, Math.round(estimates.value * (1 - valueSpread) / 10_000) * 10_000);
  const valueHi = Math.max(valueLo, Math.round(estimates.value * (1 + valueSpread) / 10_000) * 10_000);
  const attrs = {};
  for (const key of ATTRIBUTE_KEYS) attrs[key] = { ...range20(estimates.attrs[key] || 10, baseBand), exact: false };
  const ageDays = ageInDays(world, stored);
  const fogLevel = confidence >= 78 ? 3 : confidence >= 60 ? 2 : confidence >= 42 ? 1 : 0;

  return {
    level,
    confidence,
    fogLevel,
    ageDays,
    stale: ageDays == null || ageDays > 56,
    observations: Number(stored?.observations) || 0,
    source: stored?.source || "public-information",
    ovrEstimate: ovrRange.estimate,
    ovrLo: ovrRange.lo,
    ovrHi: ovrRange.hi,
    ovrText: `${ovrRange.lo}-${ovrRange.hi}`,
    potentialEstimate: potentialRange.estimate,
    potentialLo: potentialRange.lo,
    potentialHi: potentialRange.hi,
    potentialText: `${potentialRange.lo}-${potentialRange.hi}`,
    valueEstimate: estimates.value,
    valueLo,
    valueHi,
    attrs,
  };
}

export function observeScoutingPlayer(
  world,
  player,
  club,
  userClub,
  { intensity = 60, source = "scout-mission", seedSalt = "" } = {}
) {
  if (!world || !player) return null;
  const knowledge = ensureScoutingKnowledge(world);
  const prior = knowledge.players[player.id] || {};
  const priorLevel = Math.max(PUBLIC_KNOWLEDGE, decayedLevel(world, prior), publicScopeLevel(world, player, club));
  const rating = scoutRatingOf(userClub);
  const gain = clamp(14 + rating * 1.1 + Number(intensity) * 0.18, 18, 52);
  const level = clamp(priorLevel + gain * (1 - priorLevel / 115), PUBLIC_KNOWLEDGE, 96);
  const observations = Math.max(0, Number(prior.observations) || 0) + 1;
  const current = seasonDay(world);
  const estimates = generatedEstimates(
    player,
    level,
    `${player.id}:${seedSalt || source}:${observations}:${current.season}:${current.day}`
  );
  knowledge.players[player.id] = {
    level,
    observations,
    lastObservedSeason: current.season,
    lastObservedDay: current.day,
    source,
    clubId: club?.id || player.clubId || null,
    division: club?.division ?? null,
    nationality: player.nationality || null,
    ovrEstimate: estimates.ovr,
    potentialEstimate: estimates.potential,
    valueEstimate: estimates.value,
    attrs: estimates.attrs,
  };
  if (club) observeScoutingScope(world, club, { gain: 12 + intensity * 0.08, source });
  return scoutPlayerSnapshot(world, player, userClub);
}

function defaultMaxAge(profile) {
  if (profile === "development") return 23;
  if (profile === "first_team") return 31;
  return 35;
}

function recruitmentScore(snapshot, player, profile, seed) {
  const ovr = snapshot.ovrEstimate;
  const potential = snapshot.potentialEstimate;
  const age = Number(player.age) || 25;
  const contract = Number(player.contractYears) || 0;
  const form = Number(player.stats?.lastRating) || 6.5;
  let score;
  if (profile === "first_team") {
    score = ovr * 5 + potential * 0.7 + form * 1.5 - Math.max(0, age - 29) * 1.4;
  } else if (profile === "expiring") {
    score = ovr * 4 + potential * 0.45 + (contract <= 1 ? 16 : 0) - Math.max(0, age - 31);
  } else {
    score = potential * 5 + Math.max(0, potential - ovr) * 3 - Math.max(0, age - 20) * 1.2;
  }
  return score + stableScoutingUnit(seed) * 0.5;
}

export function rankScoutingCandidates(world, candidates, userClub, criteria = {}, options = {}) {
  const profile = ["development", "first_team", "expiring"].includes(criteria.profile)
    ? criteria.profile
    : "development";
  const position = ["GK", "DEF", "MID", "ATT"].includes(criteria.position)
    ? criteria.position
    : "";
  const maxAge = clamp(criteria.maxAge || defaultMaxAge(profile), 16, 40);
  const maxValue = Math.max(0, Number(criteria.maxValue) || 0);
  const rating = scoutRatingOf(userClub);
  const projectedLevel = clamp(options.projectedLevel || 24 + rating * 2.1, 30, 72);
  const seedSalt = options.seedSalt || `${world?.season || 0}:${world?.day || 0}:${profile}`;
  const ranked = [];
  for (const candidate of candidates || []) {
    const player = candidate?.player || candidate?.p;
    const club = candidate?.club || candidate?.c;
    if (!player || !club) continue;
    if (position && player.pos !== position) continue;
    if ((Number(player.age) || 99) > maxAge) continue;
    if ((player.injured || 0) > 0) continue;
    if (profile === "expiring" && (Number(player.contractYears) || 0) > 1) continue;
    const current = scoutPlayerSnapshot(world, player, userClub, { club });
    const snapshot = current.observations > 0
      ? current
      : scoutPlayerSnapshot(world, player, userClub, {
          projected: true,
          levelOverride: Math.max(current.level, projectedLevel),
          seedSalt,
          club,
        });
    if (maxValue > 0 && snapshot.valueEstimate > maxValue) continue;
    ranked.push({
      player,
      club,
      snapshot,
      score: recruitmentScore(snapshot, player, profile, `${seedSalt}:${player.id}`),
    });
  }
  ranked.sort((a, b) => b.score - a.score || String(a.player.id).localeCompare(String(b.player.id)));
  return ranked;
}

export function scoutingFreshnessLabel(snapshot, lang = "zh") {
  if (!snapshot || snapshot.observations <= 0) return lang === "en" ? "Public information" : "仅公开信息";
  if (snapshot.ageDays == null) return lang === "en" ? "Unknown date" : "观察日期未知";
  if (snapshot.ageDays <= 7) return lang === "en" ? "Observed this week" : "本周观察";
  if (snapshot.ageDays <= 28) return lang === "en" ? `${snapshot.ageDays} days old` : `${snapshot.ageDays} 天前观察`;
  return lang === "en" ? `Stale, ${snapshot.ageDays} days old` : `已过期，${snapshot.ageDays} 天前观察`;
}
