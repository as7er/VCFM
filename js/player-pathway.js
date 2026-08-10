/** Player squad-status promises and explainable development history. */

export const PLAYING_TIME_ROLES = {
  prospect: { key: "prospect", label: "培养球员", labelEn: "Prospect", minutesShare: 0.06 },
  squad: { key: "squad", label: "阵容球员", labelEn: "Squad player", minutesShare: 0.16 },
  rotation: { key: "rotation", label: "轮换球员", labelEn: "Rotation", minutesShare: 0.34 },
  important: { key: "important", label: "重要球员", labelEn: "Important player", minutesShare: 0.56 },
  star: { key: "star", label: "核心主力", labelEn: "Star player", minutesShare: 0.74 },
};

const ROLE_ORDER = ["prospect", "squad", "rotation", "important", "star"];
const DEVELOPMENT_LOG_LIMIT = 48;
const PLAYING_TIME_HISTORY_LIMIT = 72;
const DEVELOPMENT_HISTORY_LIMIT = 12;

export const DEVELOPMENT_ATTR_LABELS = {
  pace: ["速度", "Pace"],
  shooting: ["射门", "Shooting"],
  passing: ["传球", "Passing"],
  dribbling: ["盘带", "Dribbling"],
  defending: ["防守", "Defending"],
  physical: ["身体", "Physical"],
  finishing: ["终结", "Finishing"],
  tackling: ["抢断", "Tackling"],
  marking: ["盯人", "Marking"],
  strength: ["力量", "Strength"],
  stamina: ["耐力", "Stamina"],
  vision: ["视野", "Vision"],
  reflexes: ["反应", "Reflexes"],
  handling: ["手控球", "Handling"],
  positioning: ["站位", "Positioning"],
  kicking: ["开球", "Kicking"],
  potential: ["潜力", "Potential"],
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function roleIndex(role) {
  return Math.max(0, ROLE_ORDER.indexOf(role));
}

export function playingTimeRoleLabel(role, lang = "zh") {
  const def = PLAYING_TIME_ROLES[role] || PLAYING_TIME_ROLES.squad;
  return lang === "en" ? def.labelEn : def.label;
}

export function developmentAttrLabel(attribute, lang = "zh") {
  const labels = DEVELOPMENT_ATTR_LABELS[attribute];
  return labels ? labels[lang === "en" ? 1 : 0] : attribute || "—";
}

export function inferPlayingTimeRole(club, player) {
  if (!club || !player) return "squad";
  const players = (club.players || [])
    .filter((candidate) => !candidate.loan || candidate.loan.toClubId === club.id)
    .slice()
    .sort((a, b) => Number(b.ovr || 0) - Number(a.ovr || 0));
  const rank = players.findIndex((candidate) => candidate.id === player.id);
  const inLineup = (club.tactics?.lineup || []).includes(player.id);
  const developmentGap = Number(player.potential || player.ovr || 0) - Number(player.ovr || 0);
  if ((player.age || 30) <= 21 && developmentGap >= 2 && !inLineup) return "prospect";
  if (rank >= 0 && rank < 3 && inLineup) return "star";
  if (rank >= 0 && rank < 9) return inLineup ? "important" : "rotation";
  if (rank >= 0 && rank < 16) return "rotation";
  return "squad";
}

export function ensurePlayerPathway(player, club = null, world = null) {
  if (!player) return null;
  if (!Array.isArray(player.developmentLog)) player.developmentLog = [];
  if (!player.playingTime || typeof player.playingTime !== "object" || Array.isArray(player.playingTime)) {
    player.playingTime = {};
  }
  const status = player.playingTime;
  if (!Array.isArray(status.history)) status.history = [];
  if (!Array.isArray(status.roleHistory)) status.roleHistory = [];
  if (club?.id && status.clubId && status.clubId !== club.id) {
    status.committed = false;
    status.promise = null;
    status.history = [];
    status.breaches = 0;
    status.nextChangeDay = 0;
    delete player.wantsTransfer;
  }
  if (club?.id) status.clubId = club.id;
  if (!PLAYING_TIME_ROLES[status.role] || !status.committed) {
    status.role = inferPlayingTimeRole(club, player);
    if (status.committed == null) status.committed = false;
  }
  status.version = 1;

  if (player._promisedPlay && !status.promise) {
    status.role = roleIndex(status.role) < roleIndex("rotation") ? "rotation" : status.role;
    status.committed = true;
    status.promise = {
      role: status.role,
      season: world?.season ?? null,
      startDay: world?.day ?? Math.max(1, Number(player._promisedPlay) - 14),
      dueDay: Number(player._promisedPlay),
      status: "active",
      source: "legacy-promise",
    };
  }
  delete player._promisedPlay;
  delete player._promiseAppsBase;
  return status;
}

export function emptyDevelopmentStats() {
  return {
    apps: 0,
    starts: 0,
    minutes: 0,
    goals: 0,
    assists: 0,
    ratingSum: 0,
    lastDay: null,
  };
}

export function ensureDevelopmentStats(player) {
  if (!player) return emptyDevelopmentStats();
  if (!player.developmentStats || typeof player.developmentStats !== "object" || Array.isArray(player.developmentStats)) {
    player.developmentStats = emptyDevelopmentStats();
  }
  const stats = player.developmentStats;
  for (const key of ["apps", "starts", "minutes", "goals", "assists", "ratingSum"]) {
    if (!Number.isFinite(Number(stats[key]))) stats[key] = 0;
  }
  if (!Array.isArray(player.developmentHistory)) player.developmentHistory = [];
  return stats;
}

export function recentMatchMinutes(world, player, windowDays = 28) {
  if (!player) return 0;
  ensurePlayerPathway(player);
  const endDay = Number(world?.day || 0);
  const startDay = endDay > 0 ? endDay - Math.max(1, Number(windowDays || 28)) + 1 : -Infinity;
  const season = world?.season;
  return player.playingTime.history
    .filter((entry) => season == null || entry.season === season)
    .filter((entry) => Number(entry.day || 0) >= startDay && Number(entry.day || 0) <= endDay)
    .reduce((sum, entry) => sum + Math.max(0, Number(entry.minutes || 0)), 0);
}

export function developmentSharpness(world, player, windowDays = 28) {
  const minutes = recentMatchMinutes(world, player, windowDays);
  return clamp(Math.round((minutes / 180) * 100), 0, 100);
}

export function developmentGrowthMultiplier(world, player) {
  return clamp(0.84 + developmentSharpness(world, player) * 0.0024, 0.84, 1.08);
}

export function archiveDevelopmentStats(player, season, clubId = null, clubName = null) {
  const stats = ensureDevelopmentStats(player);
  let archived = null;
  if (Number(stats.apps || 0) > 0 || Number(stats.minutes || 0) > 0) {
    archived = {
      season,
      clubId,
      clubName,
      apps: Number(stats.apps || 0),
      starts: Number(stats.starts || 0),
      minutes: Number(stats.minutes || 0),
      goals: Number(stats.goals || 0),
      assists: Number(stats.assists || 0),
      avgRating: stats.apps ? Number((Number(stats.ratingSum || 0) / stats.apps).toFixed(2)) : 0,
    };
    player.developmentHistory.unshift(archived);
    if (player.developmentHistory.length > DEVELOPMENT_HISTORY_LIMIT) {
      player.developmentHistory.length = DEVELOPMENT_HISTORY_LIMIT;
    }
  }
  player.developmentStats = emptyDevelopmentStats();
  return archived;
}

export function recordPlayerDevelopment(player, event = {}) {
  if (!player) return null;
  ensurePlayerPathway(player);
  const changes = (event.changes || [])
    .map((change) => ({
      attribute: String(change.attribute || ""),
      before: Number(change.before),
      after: Number(change.after),
      delta: Number(change.delta ?? Number(change.after) - Number(change.before)),
    }))
    .filter((change) => change.attribute && Number.isFinite(change.delta) && change.delta !== 0);
  if (!changes.length && event.type !== "milestone") return null;
  const entry = {
    season: event.season ?? null,
    day: event.day ?? null,
    type: event.type || "development",
    source: event.source || "unknown",
    changes,
    ovrBefore: Number.isFinite(Number(event.ovrBefore)) ? Number(event.ovrBefore) : null,
    ovrAfter: Number.isFinite(Number(event.ovrAfter)) ? Number(event.ovrAfter) : null,
    reason: event.reason || "球员发展变化",
    reasonEn: event.reasonEn || "Player development change",
    details: event.details || null,
  };
  player.developmentLog.unshift(entry);
  if (player.developmentLog.length > DEVELOPMENT_LOG_LIMIT) {
    player.developmentLog.length = DEVELOPMENT_LOG_LIMIT;
  }
  return entry;
}

export function playerDevelopmentTimeline(player, limit = 10) {
  ensurePlayerPathway(player);
  return player.developmentLog.slice(0, Math.max(1, limit));
}

export function setPlayingTimeRole(world, club, player, role, options = {}) {
  if (!world || !club || !player || !PLAYING_TIME_ROLES[role]) {
    return { ok: false, msg: "无效的出场定位" };
  }
  const status = ensurePlayerPathway(player, club, world);
  const day = Number(world.day || 1);
  if (!options.force && Number(status.nextChangeDay || 0) > day) {
    return { ok: false, msg: `出场定位刚刚沟通过，第 ${status.nextChangeDay} 天后再调整` };
  }
  const previous = status.role;
  const delta = roleIndex(role) - roleIndex(previous);
  status.role = role;
  status.committed = true;
  status.agreedSeason = world.season;
  status.agreedDay = day;
  status.nextChangeDay = day + 14;
  status.promise = {
    role,
    season: world.season,
    startDay: day,
    dueDay: day + 28,
    status: "active",
    source: options.source || "manager",
  };
  status.roleHistory.unshift({ season: world.season, day, from: previous, to: role, source: options.source || "manager" });
  if (status.roleHistory.length > 12) status.roleHistory.length = 12;

  if (delta > 0) {
    player.morale = clamp(Math.round(Number(player.morale || 70) + 3), 20, 100);
    player.relation = clamp(Math.round(Number(player.relation || 0) + 1), -2, 2);
  } else if (delta < 0) {
    player.morale = clamp(Math.round(Number(player.morale || 70) - 4), 20, 100);
    player.relation = clamp(Math.round(Number(player.relation || 0) - 1), -2, 2);
  }
  const label = playingTimeRoleLabel(role);
  return {
    ok: true,
    msg: `已与 ${player.name} 约定定位：${label}，未来 28 天按真实出场时间评估`,
    role,
    previous,
  };
}

export function promiseMorePlayingTime(world, club, player, requestedRole = null) {
  const status = ensurePlayerPathway(player, club, world);
  const currentIndex = roleIndex(status.role);
  const role = PLAYING_TIME_ROLES[requestedRole]
    ? requestedRole
    : ROLE_ORDER[Math.min(ROLE_ORDER.length - 1, currentIndex + 1)];
  return setPlayingTimeRole(world, club, player, role, { source: "player-request", force: true });
}

function playingTimeEntryKey(world, fixture) {
  return [world?.season, fixture?.day, fixture?.home, fixture?.away, fixture?.competitionId || fixture?.competitionType || "league"].join(":");
}

export function recordMatchPlayingTime(world, club, context = {}) {
  if (!world || !club) return new Map();
  const started = new Set(context.startedIds || []);
  const events = (context.events || []).filter((event) => event.teamId === club.id);
  const subIn = new Map();
  const subOut = new Map();
  const forcedOff = new Map();
  for (const event of events) {
    const minute = clamp(Number(event.minute || 0), 0, 90);
    if (event.type === "sub") {
      if (event.inId) subIn.set(event.inId, Math.min(subIn.get(event.inId) ?? 90, minute));
      if (event.outId) subOut.set(event.outId, Math.min(subOut.get(event.outId) ?? 90, minute));
    } else if ((event.type === "red" || event.type === "injury") && event.playerId) {
      forcedOff.set(event.playerId, Math.min(forcedOff.get(event.playerId) ?? 90, minute));
    }
  }
  const eligibleIds = context.eligibleIds instanceof Set ? context.eligibleIds : null;
  const availableIds = context.availableIds instanceof Set ? context.availableIds : null;
  const historyLimit = clamp(Math.floor(Number(context.historyLimit) || PLAYING_TIME_HISTORY_LIMIT), 4, PLAYING_TIME_HISTORY_LIMIT);
  const key = playingTimeEntryKey(world, context.fixture);
  const result = new Map();
  const players = Array.isArray(context.players) ? context.players : (club.players || []);
  for (const player of players) {
    const status = ensurePlayerPathway(player, club, world);
    const start = started.has(player.id);
    const inMinute = subIn.get(player.id);
    const appeared = start || inMinute != null;
    const offMinute = Math.min(subOut.get(player.id) ?? 90, forcedOff.get(player.id) ?? 90);
    const minutes = start
      ? Math.max(1, Math.round(offMinute))
      : inMinute != null
        ? Math.max(1, Math.round(offMinute - inMinute))
        : 0;
    const registered = availableIds ? availableIds.has(player.id) : (!eligibleIds || eligibleIds.has(player.id));
    const available = appeared || (registered && !(player.injured > 0) && !(player.suspendedMatches > 0));
    const entry = {
      key,
      season: world.season,
      day: Number(context.fixture?.day ?? world.day ?? 0),
      competitionId: context.fixture?.competitionId || null,
      competitionType: context.fixture?.competitionType || (context.isCup ? "cup" : "league"),
      started: start,
      appeared,
      minutes,
      available,
    };
    const existing = status.history.findIndex((item) => item.key === key);
    if (existing >= 0) status.history[existing] = entry;
    else status.history.push(entry);
    if (status.history.length > historyLimit) {
      status.history = status.history.slice(-historyLimit);
    }
    result.set(player.id, entry);
  }
  return result;
}

export function playingTimeProgress(world, club, player, options = {}) {
  const status = ensurePlayerPathway(player, club, world);
  const promise = options.promise || status.promise;
  const season = promise?.season ?? world?.season;
  const startDay = Number(promise?.startDay ?? Math.max(1, Number(world?.day || 1) - 27));
  const endDay = Number(options.endDay ?? world?.day ?? promise?.dueDay ?? startDay);
  const entries = status.history.filter((entry) =>
    entry.season === season && entry.competitionType !== "development"
    && Number(entry.day) >= startDay && Number(entry.day) <= endDay && entry.available
  );
  const availableMatches = entries.length;
  const appearances = entries.filter((entry) => entry.appeared).length;
  const starts = entries.filter((entry) => entry.started).length;
  const minutes = entries.reduce((sum, entry) => sum + Number(entry.minutes || 0), 0);
  const minutesShare = availableMatches ? minutes / (availableMatches * 90) : 0;
  const role = promise?.role || status.role;
  const target = PLAYING_TIME_ROLES[role]?.minutesShare ?? PLAYING_TIME_ROLES.squad.minutesShare;
  return {
    role,
    target,
    availableMatches,
    appearances,
    starts,
    minutes,
    minutesShare,
    fulfilment: target > 0 ? minutesShare / target : 1,
  };
}

export function processPlayingTimePromises(world, club) {
  if (!world || !club) return [];
  const drafts = [];
  const day = Number(world.day || 1);
  for (const player of club.players || []) {
    const status = ensurePlayerPathway(player, club, world);
    const promise = status.promise;
    if (!status.committed || !promise || promise.status !== "active") continue;
    if (promise.season !== world.season) {
      promise.season = world.season;
      promise.startDay = day;
      promise.dueDay = day + 28;
      continue;
    }
    if (day < Number(promise.dueDay || 0)) continue;
    const progress = playingTimeProgress(world, club, player, { promise, endDay: day });
    if (progress.availableMatches < 3) {
      promise.dueDay = day + 7;
      continue;
    }
    const outcome = progress.fulfilment >= 0.9 ? "fulfilled" : progress.fulfilment >= 0.7 ? "partial" : "broken";
    if (outcome === "fulfilled") {
      player.morale = clamp(Math.round(Number(player.morale || 70) + 4), 20, 100);
      player.relation = clamp(Math.round(Number(player.relation || 0) + 1), -2, 2);
      status.breaches = Math.max(0, Number(status.breaches || 0) - 1);
      if (status.breaches === 0) delete player.wantsTransfer;
    } else if (outcome === "partial") {
      player.morale = clamp(Math.round(Number(player.morale || 70) - 2), 20, 100);
    } else {
      status.breaches = Number(status.breaches || 0) + 1;
      player.morale = clamp(Math.round(Number(player.morale || 70) - (status.breaches >= 2 ? 10 : 6)), 20, 100);
      player.relation = clamp(Math.round(Number(player.relation || 0) - (status.breaches >= 2 ? 2 : 1)), -2, 2);
      if (status.breaches >= 2) player.wantsTransfer = true;
    }
    const pct = Math.round(progress.minutesShare * 100);
    const targetPct = Math.round(progress.target * 100);
    status.lastAssessment = { season: world.season, day, outcome, ...progress };
    status.promise = {
      role: status.role,
      season: world.season,
      startDay: day + 1,
      dueDay: day + 28,
      status: "active",
      source: "rolling-review",
    };
    const title = outcome === "fulfilled"
      ? `${player.name} 的出场承诺已兑现`
      : outcome === "partial"
        ? `${player.name} 对出场安排仍有保留`
        : `${player.name} 认为出场承诺未兑现`;
    const titleEn = outcome === "fulfilled"
      ? `${player.name}'s playing-time promise was fulfilled`
      : outcome === "partial"
        ? `${player.name} remains unsure about his playing time`
        : `${player.name} says his playing-time promise was broken`;
    const consequence = outcome === "broken" && status.breaches >= 2
      ? "连续违约已使球员考虑离队。"
      : outcome === "broken"
        ? "关系与士气下降。"
        : outcome === "partial"
          ? "球员希望下个周期获得更稳定机会。"
          : "球员认可当前安排。";
    drafts.push({
      category: "player",
      priority: outcome === "broken" ? 3 : 1,
      title,
      titleEn,
      body: `${playingTimeRoleLabel(status.role)}目标约 ${targetPct}% 比赛时间；本周期 ${progress.availableMatches} 场可用比赛中出场 ${progress.appearances} 次、首发 ${progress.starts} 次、累计 ${progress.minutes} 分钟（${pct}%）。${consequence}`,
      bodyEn: `${playingTimeRoleLabel(status.role, "en")} target about ${targetPct}% of available minutes; this period: ${progress.appearances} appearances, ${progress.starts} starts and ${progress.minutes} minutes across ${progress.availableMatches} available matches (${pct}%).`,
      dedupeKey: `playing_time_review_${player.id}_${world.season}_${day}`,
      ref: { kind: "playing_time_review", playerId: player.id },
      actions: [{ id: "ack", label: "知道了", labelEn: "OK" }],
    });
    world.news = world.news || [];
    world.news.unshift({ day, text: `${outcome === "fulfilled" ? "✅" : outcome === "partial" ? "⚠️" : "😤"} ${title}：${pct}% / 目标 ${targetPct}%` });
  }
  return drafts;
}
