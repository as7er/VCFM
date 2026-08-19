/**
 * 世界动态、球探任务、赛季徽章、财政摘要
 */

import { formatMoney } from "./models.js";
import { pushInbox, ensureInbox } from "./inbox.js";
import { pushMedia } from "./media.js";
import { ensureManagerCareer } from "./career.js";
import { ensureStaff } from "./staff.js";
import { ensureFacilities, stadiumInfo } from "./facilities.js";
import { clubWeeklyOperatingSnapshot, ensureClubFinance, financeLedgerSummary } from "./club-finance.js";
import { isTransferWindowOpen } from "./transfers.js";
import { DIVISIONS } from "./data.js";
import { recordFinanceEntry } from "./finance-ledger.js";
import { clubCashAvailability } from "./cash-reservations.js";
import {
  ensureScoutingKnowledge,
  observeScoutingPlayer,
  observeScoutingScope,
  rankScoutingCandidates,
} from "./scouting-knowledge.js";

// ---------- 球探任务 ----------

export function ensureScoutMissions(world) {
  ensureScoutingKnowledge(world);
  if (!Array.isArray(world.scoutMissions)) world.scoutMissions = [];
  return world.scoutMissions;
}

function normalizeMissionFilters(filters = {}) {
  const profile = ["development", "first_team", "expiring"].includes(filters.profile)
    ? filters.profile
    : "development";
  const position = ["GK", "DEF", "MID", "ATT"].includes(filters.position)
    ? filters.position
    : "";
  const maxValue = Math.max(0, Number(filters.maxValue) || 0);
  return { profile, position, maxValue };
}

function missionRegionLabel(region, lang = "zh") {
  const en = lang === "en";
  if (region === "div2") return en ? "second tiers" : "次级联赛";
  if (region === "intl") return en ? "top tiers" : "顶级联赛";
  return en ? "lower tiers" : "低级别联赛";
}

function missionFilterLabel(filters, lang = "zh") {
  const en = lang === "en";
  const profile = {
    development: en ? "development" : "培养潜力",
    first_team: en ? "first-team ability" : "即战力",
    expiring: en ? "expiring contracts" : "合同将尽",
  }[filters.profile];
  const position = filters.position || (en ? "all positions" : "全部位置");
  const budget = filters.maxValue > 0
    ? `${en ? "up to" : "预算"} ${formatMoney(filters.maxValue)}`
    : en ? "no fee limit" : "不限转会费";
  return `${position} · ${profile} · ${budget}`;
}

/** Send the scout to a competition scope with explicit recruitment criteria. */
export function startScoutMission(world, region = "div3", filters = {}) {
  if (!world || world.sacked) return { ok: false, msg: "无法派遣" };
  ensureScoutMissions(world);
  if (world.scoutMissions.some((m) => m.status === "active")) {
    return { ok: false, msg: "已有进行中的球探任务" };
  }
  const club = world.clubs.find((c) => c.id === world.userClubId);
  if (!club) return { ok: false, msg: "无球队" };
  const criteria = normalizeMissionFilters(filters);
  const cost = region === "div2" ? 25_000 : region === "intl" ? 40_000 : 15_000;
  const cash = clubCashAvailability(world, club, cost);
  if (!cash.ok) {
    return {
      ok: false,
      msg: cash.reserved > 0
        ? `未承诺现金不足：转会谈判已占用 ${formatMoney(cash.reserved)}，球探任务需 ${formatMoney(cost)}`
        : `资金不足 ${formatMoney(cost)}`,
    };
  }
  recordFinanceEntry(club, -cost, { category: "scouting", source: "scout-mission", season: world.season, day: world.day });
  const days = region === "intl" ? 10 : region === "div2" ? 7 : 5;
  const mission = {
    id: `sm_${world.season || 0}_${world.day}_${world.scoutMissions.length + 1}`,
    region,
    filters: criteria,
    startDay: world.day,
    doneDay: world.day + days,
    status: "active",
    cost,
  };
  world.scoutMissions.unshift(mission);
  world.news = world.news || [];
  const regLabel = missionRegionLabel(region);
  world.news.unshift({
    day: world.day,
    text: `🔍 球探出发：前往${regLabel}搜寻 ${missionFilterLabel(criteria)}（${days} 天，花费 ${formatMoney(cost)}）`,
  });
  return { ok: true, msg: `球探已出发（${days} 天后回报）`, mission };
}

export function processScoutMissions(world) {
  if (!world || world.seasonOver) return;
  ensureScoutMissions(world);
  for (const m of world.scoutMissions) {
    if (m.status !== "active") continue;
    if ((world.day || 0) < m.doneDay) continue;
    m.status = "done";
    completeScoutMission(world, m);
  }
}

function completeScoutMission(world, mission) {
  const user = world.clubs.find((c) => c.id === world.userClubId);
  if (!user) return;
  const region = mission.region;
  const pool = [];
  for (const c of world.clubs) {
    if (c.id === user.id) continue;
    const div = c.division || 3;
    const tier = DIVISIONS[div]?.tier || 3;
    if (region === "div3" && tier < 3) continue;
    if (region === "div2" && tier !== 2) continue;
    if (region === "intl" && tier !== 1) continue;
    for (const p of c.players || []) {
      pool.push({ player: p, club: c });
    }
  }
  const filters = normalizeMissionFilters(mission.filters);
  const ranked = rankScoutingCandidates(world, pool, user, filters, {
    seedSalt: mission.id,
  });
  if (!ranked.length) {
    pushInbox(world, {
      category: "scout",
      priority: 1,
      title: "球探任务结束：暂无亮点",
      titleEn: "Scout mission complete: no standout targets",
      body: `本次出行未发现符合“${missionFilterLabel(filters)}”的目标。`,
      bodyEn: `The trip found no targets matching ${missionFilterLabel(filters, "en")}.`,
      dedupeKey: `sm_done_${mission.id}`,
      actions: [{ id: "ack", label: "知道了", labelEn: "OK" }],
    });
    return;
  }
  const visitedClubs = new Set();
  for (const candidate of ranked.slice(0, 8)) {
    if (visitedClubs.has(candidate.club.id)) continue;
    visitedClubs.add(candidate.club.id);
    observeScoutingScope(world, candidate.club, { gain: 6, source: "scout-mission-visit" });
  }
  const hits = ranked.slice(0, 3);
  world.scoutWatch = world.scoutWatch || [];
  const lines = [];
  const linesEn = [];
  for (const { player: p, club: c } of hits) {
    const snapshot = observeScoutingPlayer(world, p, c, user, {
      intensity: region === "intl" ? 72 : region === "div2" ? 64 : 58,
      source: "scout-mission",
      seedSalt: mission.id,
    });
    if (!world.scoutWatch.includes(p.id)) world.scoutWatch.unshift(p.id);
    lines.push(
      `· ${p.name}（${c.short || c.name} · ${p.pos} · ${p.age} 岁 · 能力 ${snapshot.ovrText} / 潜力 ${snapshot.potentialText} · 估值 ${formatMoney(snapshot.valueLo)}-${formatMoney(snapshot.valueHi)}）`
    );
    linesEn.push(
      `· ${p.name} (${c.short || c.nameEn || c.name} · ${p.pos} · age ${p.age} · ability ${snapshot.ovrText} / potential ${snapshot.potentialText} · value ${formatMoney(snapshot.valueLo)}-${formatMoney(snapshot.valueHi)})`
    );
  }
  if (world.scoutWatch.length > 30) world.scoutWatch.length = 30;
  pushInbox(world, {
    category: "scout",
    priority: 2,
    title: `球探回报：发现 ${hits.length} 名目标`,
    titleEn: `Scout report: ${hits.length} target(s) found`,
    body: `任务条件：${missionFilterLabel(filters)}。以下均为本次观察估计，已自动加入关注列表。\n${lines.join("\n")}`,
    bodyEn: `Assignment: ${missionFilterLabel(filters, "en")}. All figures are observed estimates; targets were added to the watchlist.\n${linesEn.join("\n")}`,
    dedupeKey: `sm_done_${mission.id}`,
    ref: {
      kind: "scout_report",
      playerIds: hits.map((hit) => hit.player.id),
      clubIds: [...new Set(hits.map((hit) => hit.club.id))],
    },
    actions: [
      { id: "ack", label: "很好", labelEn: "Nice", primary: true },
    ],
  });
  mission.resultPlayerIds = hits.map((hit) => hit.player.id);
  pushMedia(world, {
    outlet: "转会电报",
    headline: `${user.short || user.name} 球探网动作频繁`,
    body: `有消息称该队正在物色年轻补强对象。`,
    tone: "rumor",
    category: "rumor",
  });
}

// ---------- 世界动态 ----------

export function processWorldPulse(world) {
  if (!world || world.seasonOver || world.sacked) return;
  if (Math.random() > 0.18) return;
  const user = world.clubs.find((c) => c.id === world.userClubId);
  const others = world.clubs.filter((c) => c.id !== world.userClubId);
  if (!others.length) return;
  const c = others[Math.floor(Math.random() * others.length)];
  const table = world.table?.[c.id];
  const templates = [
    () => ({
      headline: `${c.name} 主帅强调「稳中求进」`,
      body: `面对联赛形势，${c.short || c.name} 更衣室放出「一场一场踢」的信号。`,
      tone: "neutral",
    }),
    () => ({
      headline: `传闻：大俱乐部关注 ${c.short || c.name} 边路`,
      body: `转会圈有小道消息称某支高级别球队在观察其侧翼人选。`,
      tone: "rumor",
    }),
    () => ({
      headline: `${c.name} 近况${table && table.w >= 2 ? "火热" : "起伏"}`,
      body: table
        ? `联赛战绩 ${table.w || 0} 胜 ${table.d || 0} 平 ${table.l || 0} 负。`
        : `赛季仍在推进中。`,
      tone: table && (table.w || 0) > (table.l || 0) ? "positive" : "neutral",
    }),
    () => ({
      headline: `${c.short || c.name} 董事会对成绩表态`,
      body: `俱乐部高层表示「支持主帅，但也需要看见进步」。`,
      tone: "neutral",
    }),
  ];
  const t = templates[Math.floor(Math.random() * templates.length)]();
  pushMedia(world, {
    outlet: Math.random() > 0.5 ? "联赛日报" : "午夜足球",
    headline: t.headline,
    body: t.body,
    tone: t.tone,
    category: "feature",
  });
  // 偶尔进 news
  if (Math.random() < 0.5) {
    world.news = world.news || [];
    world.news.unshift({ day: world.day, text: `🌍 ${t.headline}` });
  }
}

// ---------- 财政 ----------

export function financeSnapshot(world) {
  const club = world?.clubs?.find((c) => c.id === world.userClubId);
  if (!club) return null;
  ensureStaff(club);
  ensureFacilities(club);
  const operating = clubWeeklyOperatingSnapshot(world, club);
  const { squadWage, youthWage, staffWage, facilityUpkeep: upkeep } = operating;
  const weekly = operating.operatingOut;
  const money = club.money || 0;
  const weeklyCashBurn = Math.max(0, weekly - operating.commercialIncome);
  const weeksCover = weeklyCashBurn > 0 ? Math.floor(money / weeklyCashBurn) : 99;
  // 赛季账本：赛后/发薪/转会写入 club.finance（无隐藏账）
  const fin = ensureClubFinance(club, world.season);
  const seasonTickets = Number(fin.seasonTicketIncome) || 0;
  const seasonMatchday = Number(fin.seasonMatchdayIncome) || 0;
  const lastTicket = fin.lastTicketIncome != null ? Number(fin.lastTicketIncome) : null;
  const lastMatchday = fin.lastMatchdayIncome != null ? Number(fin.lastMatchdayIncome) : null;
  const lastTicketDay = fin.lastTicketDay != null ? Number(fin.lastTicketDay) : null;
  const lastAttendance = fin.lastAttendance != null ? Number(fin.lastAttendance) : null;
  const lastCapacity = fin.lastCapacity != null ? Number(fin.lastCapacity) : null;
  const lastFillPct = fin.lastFillPct != null ? Number(fin.lastFillPct) : null;
  const lastTicketFactors = Array.isArray(fin.lastTicketFactors)
    ? fin.lastTicketFactors.filter((item) => item && typeof item.key === "string")
    : [];
  const seasonWageOut = Number(fin.seasonWageOut) || 0;
  const seasonFacilityOut = Number(fin.seasonFacilityOut) || 0;
  const seasonTransferNet = Number(fin.seasonTransferNet) || 0;
  const seasonHomeGates = Number(fin.seasonHomeGates) || 0;
  const seasonBroadcast = Number(fin.seasonBroadcastIncome) || 0;
  const seasonPrize = Number(fin.seasonPrizeIncome) || 0;
  const seasonCompetition = Number(fin.seasonCompetitionIncome) || 0;
  const seasonCommercial = Number(fin.seasonCommercialIncome) || 0;
  const lastBroadcast = fin.lastBroadcastPayout != null ? Number(fin.lastBroadcastPayout) : null;
  const lastPrize = fin.lastPrizePayout != null ? Number(fin.lastPrizePayout) : null;
  const lastPrizePos = fin.lastPrizePos != null ? Number(fin.lastPrizePos) : null;
  const lastPrizeDivName = fin.lastPrizeDivisionName || null;
  const lastLeaguePayoutSeason =
    fin.lastLeaguePayoutSeason != null ? Number(fin.lastLeaguePayoutSeason) : null;
  const st = stadiumInfo(club);
  const estTicket = st?.matchday != null ? Math.round(st.matchday * 0.88) : null;
  const ledgerSummary = financeLedgerSummary(club, world.season);
  const seasonNetApprox = ledgerSummary.net;
  return {
    money,
    squadWage,
    youthWage,
    staffWage,
    upkeep,
    commercialIncome: operating.commercialIncome,
    weeklyCashBurn,
    weekly,
    weeksCover,
    windowOpen: isTransferWindowOpen(world),
    warning: weeksCover < 8,
    critical: weeksCover < 4,
    seasonTickets,
    seasonMatchday,
    lastTicket,
    lastMatchday,
    lastTicketDay,
    lastAttendance,
    lastCapacity,
    lastFillPct,
    lastTicketFactors,
    estTicket,
    stadiumName: st?.name || "",
    capacity: st?.capacity || 0,
    seasonWageOut,
    seasonFacilityOut,
    seasonTransferNet,
    seasonHomeGates,
    seasonBroadcast,
    seasonPrize,
    seasonCompetition,
    seasonCommercial,
    lastBroadcast,
    lastPrize,
    lastPrizePos,
    lastPrizeDivName,
    lastLeaguePayoutSeason,
    seasonNetApprox,
    seasonLedgerByCategory: ledgerSummary.byCategory,
    recentFinanceEntries: ledgerSummary.entries.slice(-8).reverse(),
  };
}

// ---------- 青年周报 ----------

export function processYouthPulse(world) {
  if (!world || world.seasonOver) return;
  if ((world.day || 0) % 7 !== 0) return;
  const club = world.clubs.find((c) => c.id === world.userClubId);
  const youth = club?.youth?.players || [];
  if (!youth.length) return;
  const star = [...youth].sort((a, b) => (b.potential || b.ovr) - (a.potential || a.ovr))[0];
  if (!star) return;
  if (Math.random() > 0.55) return;
  world.news = world.news || [];
  world.news.unshift({
    day: world.day,
    text: `🌱 青训周报：${star.name}（${star.pos}）训练积极，潜力档 ${star.potential || "?"} · 教练建议持续观察。`,
  });
}

// ---------- 赛季徽章 ----------

export function checkManagerBadges(world, ctx = {}) {
  const c = ensureManagerCareer(world);
  if (!Array.isArray(c.badges)) c.badges = [];
  const have = new Set(c.badges.map((b) => b.id));
  const grant = (id, title, detail) => {
    if (have.has(id)) return;
    c.badges.unshift({
      id,
      title,
      detail: detail || "",
      season: world.season,
      day: world.day,
    });
    have.add(id);
    world.news = world.news || [];
    world.news.unshift({
      day: world.day,
      text: `🏅 成就解锁：${title}${detail ? ` — ${detail}` : ""}`,
    });
  };

  if ((c.wins || 0) >= 1) grant("first_win", "首胜", "取得任职后第一场胜利");
  if ((c.wins || 0) >= 10) grant("ten_wins", "十场胜利", "生涯胜场达到 10");
  if ((c.matches || 0) >= 50) grant("veteran_mgr", "百炼成钢", "执教满 50 场");
  if ((c.promotions || 0) >= 1) grant("promoted", "升级功臣", "带队升级");
  if ((c.titles || 0) >= 1) grant("champion", "联赛冠军", "捧起联赛奖杯");
  if ((c.cups || 0) >= 1) grant("cup_king", "杯赛荣耀", "问鼎 VCFM 杯");
  if (ctx.winStreak >= 5) grant("streak5", "五连胜", "联赛/杯赛连胜 5 场");
  if (ctx.cleanYouthPromote) grant("youth_star", "青训伯乐", "提拔青训球员进入一线队");

  return c.badges;
}

/** 用户连胜追踪 */
export function noteUserMatchResult(world, myG, opG) {
  if (!world) return;
  if (myG > opG) {
    world._winStreak = (world._winStreak || 0) + 1;
  } else {
    world._winStreak = 0;
  }
  checkManagerBadges(world, { winStreak: world._winStreak || 0 });
}
