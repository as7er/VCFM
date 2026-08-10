/** Reserve / youth football driven by the same spatial match facts as the first team. */

import { FORMATIONS } from "./data.js";
import {
  assignPlayersToFormationSlots,
  ensureLineupResponsibilities,
  ensureLineupRoles,
  ensureTactics,
  getLineupPlayers,
  pushRecentRating,
} from "./models.js";
import { diagnoseInjury } from "./injuries.js";
import { matchRandom, hashSeed } from "./random.js";
import { simMinuteOf } from "./match-presentation.js";
import { SimEngine } from "./sim/engine.js";
import { runSimPeriodRaw } from "./sim/adapt.js";
import {
  archiveDevelopmentStats,
  developmentSharpness,
  ensureDevelopmentStats,
  recordMatchPlayingTime,
} from "./player-pathway.js";

const DEVELOPMENT_VERSION = 1;
const MATCHDAY_INTERVAL = 28;
const MATCHES_PER_DAY = 4;
const MAX_MATCHES = 480;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function stablePlayerScore(player, youthIds, world) {
  const sharpness = developmentSharpness(world, player);
  const youthBonus = youthIds.has(player.id) ? 12 : 0;
  const ageBonus = Math.max(0, 24 - Number(player.age || 24));
  const fitness = clamp(player.fitness ?? 80, 0, 100) * 0.08;
  const minutesNeed = Math.max(0, 100 - sharpness) * 0.18;
  return youthBonus + ageBonus + minutesNeed + fitness + Number(player.ovr || 0) * 0.35;
}

function canPlay(player, world) {
  return player && Number(player.injured || 0) <= 0 && Number(player.suspendedMatches || 0) <= 0
    && Number(player.lastPlayedDay || -1) !== Number(world.day || 0)
    && Number(player.returnToPlayDays || 0) <= 0;
}

function positionGroup(pos) {
  if (pos === "GK") return "GK";
  if (pos === "DEF") return "DEF";
  if (pos === "ATT") return "ATT";
  return "MID";
}

function ensureDevelopmentState(world) {
  if (!world.development || typeof world.development !== "object" || Array.isArray(world.development)) {
    world.development = {
      version: DEVELOPMENT_VERSION,
      lastMatchDay: null,
      nextMatchDay: MATCHDAY_INTERVAL,
      nextMatchSeq: 1,
      matches: [],
      seasonArchive: [],
    };
  }
  const state = world.development;
  state.version = DEVELOPMENT_VERSION;
  state.nextMatchDay = Math.max(1, Math.floor(Number(state.nextMatchDay) || MATCHDAY_INTERVAL));
  state.nextMatchSeq = Math.max(1, Math.floor(Number(state.nextMatchSeq) || 1));
  if (!Array.isArray(state.matches)) state.matches = [];
  if (!Array.isArray(state.seasonArchive)) state.seasonArchive = [];
  return state;
}

export function ensureDevelopmentFootball(world) {
  return world ? ensureDevelopmentState(world) : null;
}

function developmentCandidates(world, club) {
  const youthPlayers = Array.isArray(club.youth?.players) ? club.youth.players : [];
  const youthIds = new Set(youthPlayers.map((player) => player.id));
  const starters = new Set(club.tactics?.lineup || []);
  const fringe = (club.players || [])
    .filter((player) => !starters.has(player.id))
    .filter((player) => canPlay(player, world));
  const academy = youthPlayers.filter((player) => canPlay(player, world));
  const all = [...academy, ...fringe]
    .filter((player, index, list) => list.findIndex((candidate) => candidate.id === player.id) === index)
    .sort((a, b) => stablePlayerScore(b, youthIds, world) - stablePlayerScore(a, youthIds, world) || String(a.id).localeCompare(String(b.id)));
  return { all, youthIds };
}

function pickDevelopmentXI(candidates, club) {
  const formation = FORMATIONS[club.tactics?.formation] || FORMATIONS["4-3-3"];
  const slots = formation.slots || [];
  const selected = [];
  const used = new Set();
  const take = (group, count) => {
    for (const player of candidates) {
      if (selected.length >= 11 || used.has(player.id) || positionGroup(player.pos) !== group) continue;
      selected.push(player);
      used.add(player.id);
      if (selected.filter((item) => positionGroup(item.pos) === group).length >= count) break;
    }
  };
  const required = { GK: 0, DEF: 0, MID: 0, ATT: 0 };
  for (const slot of slots) required[positionGroup(slot.pos)] += 1;
  for (const group of ["GK", "DEF", "MID", "ATT"]) take(group, required[group]);
  for (const player of candidates) {
    if (selected.length >= 11) break;
    if (!used.has(player.id)) {
      selected.push(player);
      used.add(player.id);
    }
  }
  if (selected.length < 11) return null;
  return selected.slice(0, 11);
}

function buildDevelopmentTeam(club, xi, suffix) {
  const tactics = { ...(club.tactics || {}) };
  tactics.lineup = xi.map((player) => player.id);
  tactics.lineupRoles = Array(xi.length).fill(null);
  tactics.responsibilities = { ...(club.tactics?.responsibilities || {}) };
  const team = {
    id: `${club.id}:development:${suffix}`,
    name: `${club.name} 发展队`,
    nameEn: `${club.nameEn || club.name} Development XI`,
    short: `${club.short || club.id} II`,
    shortName: `${club.shortName || club.short || club.id} II`,
    power: club.power,
    countryCode: club.countryCode,
    division: club.division,
    players: xi,
    tactics,
    staff: club.staff,
    training: club.training,
    facilities: club.facilities,
  };
  ensureTactics(team);
  ensureLineupRoles(team);
  ensureLineupResponsibilities(team);
  const assigned = assignPlayersToFormationSlots(getLineupPlayers(team), (FORMATIONS[team.tactics.formation] || FORMATIONS["4-3-3"]).slots || []);
  team.tactics.lineup = assigned.filter(Boolean).map((player) => player.id);
  return team;
}

function developmentFixture(world, home, away, sequence) {
  const id = `development-${world.season}-${world.day}-${home.id}-${away.id}-${sequence}`;
  return {
    id,
    day: world.day,
    season: world.season,
    home: home.id,
    away: away.id,
    competitionType: "development",
    competitionId: "development",
    matchSeed: hashSeed(world.season, world.day, home.id, away.id, sequence, "development"),
  };
}

function eventTeamId(event, home, away) {
  return event.team === "home" ? home.id : event.team === "away" ? away.id : null;
}

function addMatchStats(world, club, pool, xi, team, opponentTeam, result, engine, random, events = []) {
  const goals = result.goals.filter((goal) => goal.team === team);
  const goalByPlayer = new Map();
  const assistByPlayer = new Map();
  for (const goal of goals) {
    if (!goal.ownGoal && goal.scorerId) goalByPlayer.set(goal.scorerId, (goalByPlayer.get(goal.scorerId) || 0) + 1);
    if (!goal.penalty && goal.assistId) assistByPlayer.set(goal.assistId, (assistByPlayer.get(goal.assistId) || 0) + 1);
  }
  const teamScore = Number(result.score[team] || 0);
  const opponentScore = Number(result.score[opponentTeam] || 0);
  const agentMap = new Map(engine.agents.filter((agent) => agent.team === team).map((agent) => [agent.id, agent]));
  const forcedOff = new Map(events.filter((event) => event.teamId === club.id && event.type === "injury").map((event) => [event.playerId, event.minute]));
  for (const player of pool) {
    const started = xi.some((candidate) => candidate.id === player.id);
    const stats = ensureDevelopmentStats(player);
    const agent = agentMap.get(player.id);
    if (agent) player.fitness = clamp(Math.round(agent.fitness), 20, 100);
    if (!started) continue;
    const minutes = Math.max(1, Math.round(forcedOff.get(player.id) || 90));
    const goalsFor = goalByPlayer.get(player.id) || 0;
    const assistsFor = assistByPlayer.get(player.id) || 0;
    const rating = clamp(6.35 + (teamScore - opponentScore) * 0.22 + goalsFor * 0.7 + assistsFor * 0.35 + (random() - 0.5) * 0.3, 4.8, 9.7);
    stats.apps += 1;
    stats.starts += 1;
    stats.minutes += minutes;
    stats.goals += goalsFor;
    stats.assists += assistsFor;
    stats.ratingSum += rating;
    stats.lastDay = world.day;
    player.lastPlayedDay = world.day;
    pushRecentRating(player, rating);
  }
}

export function runDevelopmentMatch(world, home, away, options = {}) {
  if (!world || !home || !away || home.id === away.id) return null;
  const homePool = developmentCandidates(world, home);
  const awayPool = developmentCandidates(world, away);
  const homeXI = pickDevelopmentXI(homePool.all, home);
  const awayXI = pickDevelopmentXI(awayPool.all, away);
  if (!homeXI || !awayXI) return null;
  const state = ensureDevelopmentState(world);
  const sequence = options.sequence || state.nextMatchSeq++;
  const fixture = developmentFixture(world, home, away, sequence);
  const random = matchRandom(world, fixture);
  const homeTeam = buildDevelopmentTeam(home, homeXI, `${sequence}-home`);
  const awayTeam = buildDevelopmentTeam(away, awayXI, `${sequence}-away`);
  const engine = new SimEngine(homeTeam, awayTeam, {
    random,
    simulationProfile: "development",
    timeStep: 0.5,
    separationPasses: 2,
  });
  runSimPeriodRaw(engine, 1, 45, { record: false, timeStep: 0.5, sampleEvery: 10 });
  runSimPeriodRaw(engine, 46, 90, { record: false, timeStep: 0.5, sampleEvery: 10 });
  const result = engine.directResult();
  const events = engine.events
    .filter((event) => event.type === "injury")
    .map((event) => ({
      type: "injury",
      teamId: eventTeamId(event, home, away),
      playerId: event.agentId || null,
      minute: simMinuteOf(event.t),
    }));
  for (const event of events) {
    const player = [...homePool.all, ...awayPool.all].find((candidate) => candidate.id === event.playerId);
    if (player && Number(player.injured || 0) <= 0) {
      diagnoseInjury(player, { cause: "development", random, day: world.day, season: world.season });
    }
  }
  addMatchStats(world, home, homePool.all, homeXI, "home", "away", result, engine, random, events);
  addMatchStats(world, away, awayPool.all, awayXI, "away", "home", result, engine, random, events);
  const homeEntries = recordMatchPlayingTime(world, home, {
    fixture,
    players: homePool.all,
    availableIds: new Set(homePool.all.map((player) => player.id)),
    startedIds: new Set(homeXI.map((player) => player.id)),
    events,
    historyLimit: home.id === world.userClubId ? 72 : 12,
  });
  const awayEntries = recordMatchPlayingTime(world, away, {
    fixture,
    players: awayPool.all,
    availableIds: new Set(awayPool.all.map((player) => player.id)),
    startedIds: new Set(awayXI.map((player) => player.id)),
    events,
    historyLimit: away.id === world.userClubId ? 72 : 12,
  });
  const record = {
    ...fixture,
    engine: "spatial-v2",
    simulationProfile: "development",
    timeStep: 0.5,
    separationPasses: 2,
    score: { ...result.score },
    shots: { ...result.shots },
    xg: { ...result.xg },
    goals: result.goals.map((goal) => ({ ...goal })),
    injuries: events,
    playerIds: [
      ...[...homeEntries.entries()].filter(([, entry]) => entry.appeared).map(([playerId]) => playerId),
      ...[...awayEntries.entries()].filter(([, entry]) => entry.appeared).map(([playerId]) => playerId),
    ],
  };
  state.matches.push(record);
  if (state.matches.length > MAX_MATCHES) state.matches.splice(0, state.matches.length - MAX_MATCHES);
  return record;
}

function pairKey(club) {
  return `${club.countryCode || "world"}:${club.division || club.leagueId || "unknown"}`;
}

function developmentPairs(world) {
  const groups = new Map();
  for (const club of world.clubs || []) {
    const key = pairKey(club);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(club);
  }
  const pairs = [];
  for (const clubs of groups.values()) {
    clubs.sort((a, b) => String(a.id).localeCompare(String(b.id)));
    for (let index = 0; index + 1 < clubs.length; index += 2) pairs.push([clubs[index], clubs[index + 1]]);
  }
  return pairs;
}

export function processDevelopmentMatchesForDay(world, options = {}) {
  if (!world || !Array.isArray(world.clubs)) return [];
  const state = ensureDevelopmentState(world);
  if (Number(world.day || 0) < state.nextMatchDay) return [];
  if (state.lastMatchDay === world.day) return [];
  const pairs = developmentPairs(world);
  const dayIndex = Math.floor(Number(world.day || 0) / MATCHDAY_INTERVAL);
  const userId = world.userClubId;
  const records = [];
  const selected = new Set();
  const offset = ((Math.max(0, dayIndex - 1) * MATCHES_PER_DAY) % Math.max(1, pairs.length));
  for (let step = 0; step < Math.min(MATCHES_PER_DAY, pairs.length); step++) {
    selected.add((offset + step) % pairs.length);
  }
  const userPairIndex = pairs.findIndex(([home, away]) => home.id === userId || away.id === userId);
  if (userPairIndex >= 0) {
    const [userHome, userAway] = pairs[userPairIndex];
    if (!pickDevelopmentXI(developmentCandidates(world, userHome).all, userHome)
      || !pickDevelopmentXI(developmentCandidates(world, userAway).all, userAway)) {
      return [];
    }
  }
  state.lastMatchDay = world.day;
  state.nextMatchDay = Number(world.day || 0) + MATCHDAY_INTERVAL;
  if (userPairIndex >= 0) selected.add(userPairIndex);
  [...selected].sort((a, b) => a - b).forEach((index) => {
    const [home, away] = pairs[index];
    const record = runDevelopmentMatch(world, home, away, options);
    if (record) records.push(record);
  });
  return records;
}

export function archiveDevelopmentSeason(world) {
  if (!world) return [];
  const archived = [];
  for (const club of world.clubs || []) {
    for (const player of [...(club.players || []), ...(club.youth?.players || [])]) {
      const item = archiveDevelopmentStats(player, world.season, club.id, club.name);
      if (item) archived.push({ playerId: player.id, clubId: club.id, ...item });
    }
  }
  const state = ensureDevelopmentState(world);
  state.seasonArchive.unshift({ season: world.season, matches: state.matches.filter((match) => match.season === world.season).length, players: archived.length });
  if (state.seasonArchive.length > 8) state.seasonArchive.length = 8;
  state.lastMatchDay = null;
  state.nextMatchDay = MATCHDAY_INTERVAL;
  return archived;
}

export const DEVELOPMENT_MATCH_CONFIG = Object.freeze({
  version: DEVELOPMENT_VERSION,
  matchdayInterval: MATCHDAY_INTERVAL,
  matchesPerDay: MATCHES_PER_DAY,
});
