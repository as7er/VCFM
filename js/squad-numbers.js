/**
 * 俱乐部球衣号码：持久化球员偏好、公开身份与赛季登记。
 *
 * 号码只影响展示和球队登记，不进入比赛能力、成功率或赛果计算。
 */

import { positionGroup } from "./player-positions.js";

export const SQUAD_NUMBER_VERSION = 1;
const NUMBER_MIN = 1;
const NUMBER_MAX = 99;
const YOUTH_NUMBER_MIN = 40;
const YOUTH_NUMBER_MAX = 99;

const POSITION_NUMBER_PREFERENCES = Object.freeze({
  GK: [1, 13, 23, 25, 31],
  LB: [3, 2, 12, 26, 32],
  CB: [4, 5, 6, 15, 24],
  RB: [2, 22, 14, 26, 32],
  DM: [6, 4, 8, 14, 16],
  CM: [8, 6, 10, 18, 20],
  LM: [11, 7, 17, 21, 28],
  RM: [7, 11, 17, 21, 28],
  AM: [10, 8, 18, 20, 30],
  LW: [11, 7, 17, 19, 27],
  RW: [7, 11, 17, 19, 27],
  CF: [10, 9, 11, 19, 21],
  ST: [9, 10, 7, 11, 19],
});

const GROUP_NUMBER_PREFERENCES = Object.freeze({
  GK: POSITION_NUMBER_PREFERENCES.GK,
  DEF: [4, 5, 2, 3, 6, 12, 14, 15, 22, 24, 26, 32],
  MID: [6, 8, 10, 7, 11, 14, 17, 18, 20, 21, 28, 30],
  ATT: [9, 7, 11, 10, 19, 17, 18, 21, 27, 29, 33],
});

const IMPORTANT_NUMBERS = new Set([7, 8, 9, 10, 11]);
const VALID_STRENGTHS = new Set(["light", "normal", "strong"]);

function stableUnit(seed) {
  let hash = 2166136261;
  for (const char of String(seed || "number")) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967296;
}

function uniqueNumbers(values, min = NUMBER_MIN, max = NUMBER_MAX) {
  return [...new Set((Array.isArray(values) ? values : []).map(Number).filter((n) => Number.isInteger(n) && n >= min && n <= max))];
}

function detailedPosition(player) {
  const primary = player?.positionProfile?.primary;
  if (primary && POSITION_NUMBER_PREFERENCES[primary]) return primary;
  const group = positionGroup(primary || player?.pos);
  return GROUP_NUMBER_PREFERENCES[group] ? group : player?.pos || "MID";
}

function preferencePool(player) {
  const code = detailedPosition(player);
  return POSITION_NUMBER_PREFERENCES[code] || GROUP_NUMBER_PREFERENCES[code] || GROUP_NUMBER_PREFERENCES.MID;
}

/** 为球员生成一次稳定偏好；之后只读档中的值，不随能力或赛季漂移。 */
export function ensurePlayerNumberPreferences(player) {
  if (!player) return false;
  const existing = uniqueNumbers(player.numberPreferences);
  const hasVersion = Number(player.numberPreferenceVersion || 0) >= SQUAD_NUMBER_VERSION;
  let changed = false;
  if (!hasVersion || existing.length < 3) {
    const pool = preferencePool(player);
    const roll = stableUnit(`${player.id || player.name || "player"}:number-preference`);
    const offset = Math.floor(roll * Math.min(3, pool.length));
    const rotated = [...pool.slice(offset), ...pool.slice(0, offset)];
    player.numberPreferences = uniqueNumbers([...existing, ...rotated]).slice(0, 5);
    changed = true;
  } else if (existing.join(",") !== player.numberPreferences.join(",")) {
    player.numberPreferences = existing.slice(0, 5);
    changed = true;
  }
  const strengthRoll = stableUnit(`${player.id || player.name || "player"}:number-preference-strength`);
  const strength = VALID_STRENGTHS.has(player.numberPreferenceStrength)
    ? player.numberPreferenceStrength
    : strengthRoll < 0.18
      ? "strong"
      : strengthRoll < 0.58
        ? "normal"
        : "light";
  if (player.numberPreferenceStrength !== strength) {
    player.numberPreferenceStrength = strength;
    changed = true;
  }
  if (player.numberPreferenceVersion !== SQUAD_NUMBER_VERSION) {
    player.numberPreferenceVersion = SQUAD_NUMBER_VERSION;
    changed = true;
  }
  return changed;
}

function preferenceScore(player, number) {
  ensurePlayerNumberPreferences(player);
  const index = (player.numberPreferences || []).indexOf(number);
  if (index < 0) return 0;
  const base = player.numberPreferenceStrength === "strong" ? 74 : player.numberPreferenceStrength === "normal" ? 52 : 34;
  return Math.max(8, base - index * 13);
}

function traditionalScore(player, number) {
  const pool = preferencePool(player);
  const index = pool.indexOf(number);
  if (index >= 0) return Math.max(10, 42 - index * 7);
  const pos = detailedPosition(player);
  if (number === 1) return pos === "GK" ? 80 : -24;
  if (IMPORTANT_NUMBERS.has(number)) {
    if (pos === "ST" && number === 9) return 34;
    if ((pos === "AM" || pos === "CF") && number === 10) return 38;
    if ((pos === "LW" || pos === "LM") && number === 11) return 34;
    if ((pos === "RW" || pos === "RM") && number === 7) return 34;
    if ((pos === "CM" || pos === "DM") && number === 8) return 34;
    return 12;
  }
  if (number >= 40) return -4;
  return 0;
}

function statusScore(club, player, number, rankById) {
  const lineup = new Set(club?.tactics?.lineup || []);
  const core = club?.tactics?.corePlayerId === player.id;
  const role = player.playingTime?.role;
  const star = role === "star";
  const important = role === "important";
  const topRank = (rankById.get(player.id) || 99) <= 3;
  let score = 0;
  if (core) score += number === 10 ? 58 : IMPORTANT_NUMBERS.has(number) ? 38 : 8;
  if (star) score += IMPORTANT_NUMBERS.has(number) ? 22 : 4;
  else if (important) score += IMPORTANT_NUMBERS.has(number) ? 10 : 3;
  if (lineup.has(player.id)) score += IMPORTANT_NUMBERS.has(number) ? 8 : 2;
  if (topRank) score += IMPORTANT_NUMBERS.has(number) ? 9 : 2;
  return score;
}

/** 公开候选评价：界面、AI 与审计读取同一组可解释事实。 */
export function evaluateSquadNumberCandidate(club, player, number, options = {}) {
  const normalized = validNumber(number);
  if (!player || normalized == null) return { score: -Infinity, preference: 0, tradition: 0, status: 0, reasons: [] };
  const rankById = options.rankById || rankPlayers(club?.players || [player]);
  const preference = preferenceScore(player, normalized);
  const tradition = traditionalScore(player, normalized);
  const status = statusScore(club, player, normalized, rankById);
  const youthPenalty = normalized >= 40 ? -8 : 0;
  const reasons = [];
  if ((player.numberPreferences || [])[0] === normalized) reasons.push("favorite");
  else if ((player.numberPreferences || []).includes(normalized)) reasons.push("preferred");
  if (tradition >= 30) reasons.push("position-tradition");
  if (club?.tactics?.corePlayerId === player.id && IMPORTANT_NUMBERS.has(normalized)) reasons.push("core-player");
  if (player.playingTime?.role === "star" || player.playingTime?.role === "important") reasons.push("squad-status");
  if ((club?.tactics?.lineup || []).includes(player.id)) reasons.push("starter");
  return {
    score: preference + tradition + status + youthPenalty,
    preference,
    tradition,
    status,
    youthPenalty,
    reasons,
  };
}

function candidateScore(club, player, number, rankById) {
  return evaluateSquadNumberCandidate(club, player, number, { rankById }).score;
}

function validNumber(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= NUMBER_MIN && number <= NUMBER_MAX ? number : null;
}

function ensureRegistration(club, season = null, reason = "assignment") {
  const current = club.numberRegistration;
  if (!current || typeof current !== "object" || Number(current.version || 0) < SQUAD_NUMBER_VERSION) {
    club.numberRegistration = {
      version: SQUAD_NUMBER_VERSION,
      season,
      registeredDay: null,
      reason,
      entries: {},
      youthEntries: {},
    };
    return club.numberRegistration;
  }
  if (season != null && current.season !== season) {
    current.season = season;
    current.registeredDay = null;
    current.reason = reason;
    current.entries = {};
    current.youthEntries = {};
  }
  if (!current.entries || typeof current.entries !== "object" || Array.isArray(current.entries)) current.entries = {};
  if (!current.youthEntries || typeof current.youthEntries !== "object" || Array.isArray(current.youthEntries)) current.youthEntries = {};
  current.version = SQUAD_NUMBER_VERSION;
  return current;
}

function rankPlayers(players) {
  const sorted = [...players].sort((a, b) => Number(b.ovr || 0) - Number(a.ovr || 0) || String(a.id).localeCompare(String(b.id)));
  return new Map(sorted.map((player, index) => [player.id, index + 1]));
}

function repairDuplicateNumbers(players, club, used) {
  const byNumber = new Map();
  for (const player of players) {
    const number = validNumber(player.number);
    if (number == null) {
      player.number = null;
      continue;
    }
    if (!byNumber.has(number)) byNumber.set(number, []);
    byNumber.get(number).push(player);
  }
  used.clear();
  const rankById = rankPlayers(players);
  for (const [number, holders] of byNumber) {
    holders.sort((a, b) => candidateScore(club, b, number, rankById) - candidateScore(club, a, number, rankById) || String(a.id).localeCompare(String(b.id)));
    const keeper = holders[0];
    used.add(number);
    for (const displaced of holders.slice(1)) displaced.number = null;
    keeper.number = number;
  }
}

function registerPlayers(registration, players, field) {
  registration[field] = Object.fromEntries(players.filter((player) => validNumber(player.number) != null).map((player) => [player.id, player.number]));
}

function allocateMissingPlayers(club, players, used) {
  const rankById = rankPlayers(players);
  const need = players.filter((player) => validNumber(player.number) == null);
  const ordered = [...need].sort((a, b) => {
    const aImportance = Math.max(...Array.from({ length: NUMBER_MAX }, (_, index) => candidateScore(club, a, index + 1, rankById)));
    const bImportance = Math.max(...Array.from({ length: NUMBER_MAX }, (_, index) => candidateScore(club, b, index + 1, rankById)));
    return bImportance - aImportance || Number(b.ovr || 0) - Number(a.ovr || 0) || String(a.id).localeCompare(String(b.id));
  });
  for (const player of ordered) {
    let best = null;
    let bestScore = -Infinity;
    for (let number = NUMBER_MIN; number <= NUMBER_MAX; number++) {
      if (used.has(number)) continue;
      const score = candidateScore(club, player, number, rankById);
      if (score > bestScore || (score === bestScore && (best == null || number < best))) {
        best = number;
        bestScore = score;
      }
    }
    player.number = best || 99;
    used.add(player.number);
  }
}

function assignYouthNumbers(club, used) {
  const youth = Array.isArray(club.youth?.players) ? club.youth.players : [];
  for (const player of youth) ensurePlayerNumberPreferences(player);
  const youthUsed = new Set([...used]);
  for (const player of youth) {
    const current = validNumber(player.number);
    if (current != null && current >= YOUTH_NUMBER_MIN && !youthUsed.has(current)) {
      youthUsed.add(current);
      continue;
    }
    player.number = null;
    const prefs = player.numberPreferences || [];
    const candidate = [...prefs, ...Array.from({ length: YOUTH_NUMBER_MAX - YOUTH_NUMBER_MIN + 1 }, (_, index) => YOUTH_NUMBER_MIN + index)]
      .find((number) => number >= YOUTH_NUMBER_MIN && number <= YOUTH_NUMBER_MAX && !youthUsed.has(number));
    player.number = candidate || YOUTH_NUMBER_MIN;
    youthUsed.add(player.number);
  }
  return youth;
}

/** 给一线队及青训登记不重复号码；旧号优先保留，缺号按候选评分分配。 */
export function assignSquadNumbers(club, options = {}) {
  if (!club || !Array.isArray(club.players)) return;
  const registration = ensureRegistration(club, options.season ?? null, options.reason || "assignment");
  const players = club.players;
  for (const player of players) ensurePlayerNumberPreferences(player);
  const rankById = rankPlayers(players);
  const used = new Set();
  repairDuplicateNumbers(players, club, used);
  allocateMissingPlayers(club, players, used);
  const youth = assignYouthNumbers(club, used);
  registration.reason = options.reason || registration.reason || "assignment";
  registration.registeredDay = options.day ?? registration.registeredDay ?? null;
  registerPlayers(registration, players, "entries");
  registerPlayers(registration, youth, "youthEntries");
}

/**
 * 新赛季正式登记：上季仍在队的号码受保护；核心/主力可主动领取已经空缺的
 * 钟情或传统号码，归队、提拔和新补充球员随后竞争剩余号码。
 */
export function registerSquadNumbers(club, options = {}) {
  if (!club || !Array.isArray(club.players)) return { changes: [], entries: {} };
  const priorEntries = options.protectedEntries && typeof options.protectedEntries === "object"
    ? { ...options.protectedEntries }
    : { ...(club.numberRegistration?.entries || {}) };
  const before = new Map(club.players.map((player) => [player.id, validNumber(player.number)]));
  for (const player of club.players) ensurePlayerNumberPreferences(player);
  const rankById = rankPlayers(club.players);
  const protectedPlayers = [];
  const used = new Set();
  for (const player of club.players) {
    const current = validNumber(player.number);
    const protectedNumber = validNumber(priorEntries[player.id]);
    if (current != null && current === protectedNumber && !used.has(current)) {
      protectedPlayers.push(player);
      used.add(current);
    } else {
      player.number = null;
    }
  }

  const claims = [];
  for (const player of protectedPlayers) {
    const current = player.number;
    const currentScore = candidateScore(club, player, current, rankById);
    // 已有号码默认受保护；只有球员明确偏好的号码（以及核心空缺的 10 号）
    // 才足以触发赛季换号，位置传统本身不会让全队每季洗牌。
    const targets = uniqueNumbers([
      player.numberPreferences?.[0],
      ...(club.tactics?.corePlayerId === player.id ? [10] : []),
    ]);
    for (const number of targets) {
      if (number === current || used.has(number)) continue;
      const evaluation = evaluateSquadNumberCandidate(club, player, number, { rankById });
      const gain = evaluation.score - currentScore;
      const favorite = player.numberPreferences?.[0] === number;
      const coreTen = club.tactics?.corePlayerId === player.id && number === 10;
      const threshold = coreTen ? 12 : favorite && player.numberPreferenceStrength === "strong" ? 14 : favorite ? 22 : 30;
      if (gain >= threshold) claims.push({ player, number, gain, score: evaluation.score });
    }
  }
  claims.sort((a, b) => b.gain - a.gain || b.score - a.score || Number(b.player.ovr || 0) - Number(a.player.ovr || 0) || String(a.player.id).localeCompare(String(b.player.id)) || a.number - b.number);
  const moved = new Set();
  for (const claim of claims) {
    if (moved.has(claim.player.id) || used.has(claim.number)) continue;
    used.delete(claim.player.number);
    claim.player.number = claim.number;
    used.add(claim.number);
    moved.add(claim.player.id);
  }

  allocateMissingPlayers(club, club.players, used);
  const youth = assignYouthNumbers(club, used);
  const registration = ensureRegistration(club, options.season ?? null, options.reason || "new-season");
  registration.reason = options.reason || "new-season";
  registration.registeredDay = options.day ?? 1;
  registerPlayers(registration, club.players, "entries");
  registerPlayers(registration, youth, "youthEntries");
  const changes = club.players
    .map((player) => ({ playerId: player.id, name: player.name, from: before.get(player.id) ?? null, to: player.number }))
    .filter((change) => change.from !== change.to);
  return { changes, entries: { ...registration.entries }, season: registration.season };
}

export function ensurePlayerNumber(club, player) {
  if (!player) return null;
  ensurePlayerNumberPreferences(player);
  if (validNumber(player.number) != null) return player.number;
  if (club) assignSquadNumbers(club);
  if (validNumber(player.number) != null) return player.number;
  const prefs = player.numberPreferences || [];
  player.number = prefs[0] || 99;
  return player.number;
}

export function numberPreferenceLabel(player) {
  ensurePlayerNumberPreferences(player);
  return {
    numbers: [...(player?.numberPreferences || [])],
    strength: player?.numberPreferenceStrength || "normal",
  };
}

/** 玩家手动指定号码；与自动登记共用唯一性和持久化登记。 */
export function setSquadNumber(club, playerId, number, options = {}) {
  if (!club || !Array.isArray(club.players)) return { ok: false, msg: "球队不存在" };
  const requested = validNumber(number);
  if (requested == null) return { ok: false, msg: "球衣号码须为 1–99" };
  const player = club.players.find((item) => item.id === playerId);
  if (!player) return { ok: false, msg: "球员不在一线队" };
  const holder = club.players.find((item) => item.id !== player.id && validNumber(item.number) === requested);
  const previous = validNumber(player.number);
  if (holder && options.swap === false) return { ok: false, msg: `号码 ${requested} 已被 ${holder.name} 使用` };
  player.number = requested;
  if (holder) holder.number = previous;
  const registration = ensureRegistration(club, options.season ?? club.numberRegistration?.season ?? null, options.reason || "manual");
  registration.reason = options.reason || "manual";
  registration.registeredDay = options.day ?? registration.registeredDay ?? null;
  registerPlayers(registration, club.players, "entries");
  return {
    ok: true,
    playerId: player.id,
    number: requested,
    swappedPlayerId: holder?.id || null,
    swappedNumber: holder?.number ?? null,
  };
}
