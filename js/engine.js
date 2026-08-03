/** 比赛模拟、联赛推进、转会 */

import {
  teamStrength,
  getLineupPlayers,
  autoLineup,
  playerOverall,
  estimateValue,
  estimateWage,
  formatMoney,
  ensureYouthAcademy,
  createYouthPlayer,
  fillYouthSquad,
  YOUTH_LEVELS,
  agePlayerOneYear,
  retireChance,
  resetSeasonStats,
  archiveAndResetSeasonStats,
  ensurePlayerHistory,
  ensureLeagueStats,
  generateFixtures,
  generateAllDivisionFixtures,
  clubsInDivision,
  createPlayer,
  DIVISIONS,
  ensureKit,
  assignSquadNumbers,
  ensurePlayerNumber,
  ensureWorldClubTemplates,
} from "./models.js";
import { STYLE_MOD, FORMATIONS, POS_LABEL } from "./data.js";
import {
  mediaAfterUserMatch,
  mediaTransfer,
  mediaYouthPromote,
  mediaPromotion,
  mediaDailyPulse,
  mediaSeasonKickoff,
  mediaSeasonAwards,
  ensureMedia,
  narrativeAfterUserMatch,
  narrativeTablePulse,
  narrativeInjuryWave,
} from "./media.js";
import {
  ensureStaff,
  ensureWorldStaff,
  coachMatchMod,
  coachGrowthBonus,
  scoutBuyMod,
  scoutSellMod,
  scoutYouthPotBonus,
  doctorInjuryMod,
  generateStaffMarket,
  refreshStaffMarket,
  hireStaff,
  fireStaff,
  approachStaff,
  resolveStaffApproach,
  processStaffMarketDay,
  processStaffContractsEndOfSeason,
  ensureStaffApproaches,
  pendingStaffApproaches,
  listApproachableStaff,
  staffCompensationFee,
  staffSigningFee,
  staffTargetRating,
  ROLES,
} from "./staff.js";
import { runInternationalBreak, ensureIntl } from "./intl.js";
import { awardSeasonHonors, ensureHonors, grantHonor } from "./honors.js";
import {
  ensureContract,
  renewOffer,
  terminatePlayer,
  terminateCost,
  needsContractAttention,
  processContractsEndOfSeason,
  releaseUnrenewed,
  signFreeAgent,
} from "./contracts.js";
import {
  ensureLoans,
  recallLoan,
  returnLoan,
  processLoansDay,
  returnAllLoans,
  listUserLoans,
  userSquadWageBill,
  previewLoanOut,
  previewLoanIn,
  isOnLoan,
} from "./loans.js";
import {
  ensureCompetitions,
  resetCompetitions,
  competitionFixturesOnDay,
  getNextUserCompetitionMatch,
  allUserCompetitionFixtures,
  allCompetitionFixtures,
  competitionsComplete,
  buildContinentalQualifiers,
} from "./cup.js";
import { pushMedia } from "./media.js";
import {
  ensureBoardObjective,
  ensureClubSeasonPlan,
  ensureWorldSeasonPlans,
  clubPlanDef,
  evaluateBoardProgress,
  checkBoardMidSeason,
  settleBoardObjective,
  sackManager,
} from "./board.js";
import {
  ensureTraining,
  setTraining,
  processTrainingDay,
  trainingSummary,
  assistantTrainingPlan,
  youthTrainingMult,
  TRAINING_FOCUSES,
  TRAINING_INTENSITIES,
} from "./training.js";
import {
  applyDelegatedDevelopment,
  applyDelegatedTraining,
  ensureWorldDelegation,
} from "./delegation.js";
import {
  ensureTransferWindow,
  isTransferWindowOpen,
  getTransferPhase,
  transferWindowLabel,
  transferWindowShort,
  processTransferWindowDay,
  assertTransferOpen,
} from "./transfers.js";
import {
  analyzeSquadBalance,
  canSellPosition,
  shouldBuyPosition,
  selectPlayerToSell as selectPlayerToSellSmart,
  selectPositionToBuy,
} from "./squad-balance.js";
import {
  ensureFacilities,
  startFacilityUpgrade,
  upgradeYouthAcademy,
  processFacilityDay,
  matchdayIncome,
  applySeasonLeagueFinance,
  trainingGrowthBonus,
  trainingHealBonus,
  trainingInjuryMod,
  stadiumInfo,
  trainingFacilityInfo,
  youthFacilityInfo,
  facilitySummaryLine,
  isBuilding,
  getProject,
  FACILITY_MAX,
  STADIUM_LEVELS,
  TRAINING_FACILITY_LEVELS,
  FACILITY_LABELS,
} from "./facilities.js";
import {
  clubTransferBudget,
  ensureClubFinance,
  ensureWorldFinances,
  processAiDebtActions,
  resetClubSeasonFinance,
  settleWorldWeeklyFinances,
  recordFinanceEntry,
} from "./club-finance.js";
import { clubCashAvailability } from "./cash-reservations.js";
import {
  autoRegisterClub,
  availableRegistrationContexts,
  developmentStatus,
  eligiblePlayerIds,
  ensureWorldRegistrations,
  playerCompetitionEligibility,
  recordDevelopmentSeason,
  registrationSummary,
  setPlayerRegistered,
} from "./squad-registration.js";
import {
  simulateMatch,
  simulateMatchSync,
  createMatchSession,
  playFirstHalf,
  playSecondHalf,
  continueSecondHalf,
  applyUserHalfTime,
  applyTeamTalk,
  applyManagedTeamTalk,
  suggestHalfTimeTalk,
  applySubstitution,
  applyLiveTactics,
  buildRoleReview,
  getHalfTimeTips,
  finalizeMatch,
  getBenchPlayers,
  getOnFieldPlayers,
  ensureFixtureWeather,
  isDerby,
  isBigMatch,
  weatherByKey,
} from "./match.js";
import {
  ensureActiveCareer,
  ensureDirectorCareer,
  ensureManagerCareer,
  recordManagerMatch,
  settleManagerSeason,
  managerWinRate,
  ensureClubHonors,
  recordManagerSack,
} from "./career.js";
import {
  ensureManagerJob,
  enterUnemployment,
  resignManagership,
  acceptJobOffer,
  rejectJobOffer,
  pendingJobOffers,
  generateJobOffers,
  processManagerJobsDay,
  managerReputation,
  reputationTierLabel,
  resignCooldownLeft,
  isManagerEmployed,
} from "./manager-jobs.js";
import {
  processPoachingDay,
  expirePoachBids,
  acceptPoachBid,
  rejectPoachBid,
  pendingPoachBids,
  ensurePoachBids,
} from "./poaching.js";
import {
  buildScoutReport,
  formatScoutReportHtml,
  buildOpponentReport,
  formatOpponentReportHtml,
  opponentReportLogLines,
  scoutFogLevel,
  scoutAttrRows,
  formatScoutOvrFog,
  formatScoutPotFog,
} from "./scoutreport.js";
import { resetSeasonDiscipline, ensureDiscipline, isAvailable } from "./discipline.js";
import {
  processInboxDay,
  ensureInbox,
  listInbox,
  pendingInboxCount,
  resolveInboxAction,
  markInboxRead,
  syncPoachBidsToInbox,
  syncDealNegotiationsToInbox,
  syncTransferNegotiationsToInbox,
  pushInbox,
  inboxCatLabel,
} from "./inbox.js";
import {
  ensureTransferNegotiations,
  findActiveSaleNegotiation,
  findActiveTransferNegotiation,
  listTransferNegotiations,
  processTransferNegotiationsDay,
  respondTransferNegotiation,
  submitSaleListing,
  submitTransferNegotiation,
} from "./transfer-negotiations.js";
import {
  cancelActiveDealNegotiations,
  ensureDealNegotiations,
  findActiveDealNegotiation,
  listDealNegotiations,
  processDealNegotiationsDay,
  respondDealNegotiation,
  submitLoanNegotiation,
  submitRenewalNegotiation,
} from "./deal-negotiations.js";
import {
  processRelationsDay,
  ensureSquadRelations,
  clubAtmosphere,
  atmosphereLabel,
  relationLabel,
  applyPlayerTalk,
  ensurePlayerRelation,
} from "./relations.js";
import {
  processScoutMissions,
  startScoutMission,
  processWorldPulse,
  processYouthPulse,
  financeSnapshot,
  checkManagerBadges,
  noteUserMatchResult,
  ensureScoutMissions,
} from "./worldpulse.js";
import {
  ensurePlayerPathway,
  processPlayingTimePromises,
  recordPlayerDevelopment,
  setPlayingTimeRole,
  playingTimeProgress,
  playingTimeRoleLabel,
  playerDevelopmentTimeline,
  developmentAttrLabel,
  PLAYING_TIME_ROLES,
} from "./player-pathway.js";

export {
  simulateMatch,
  simulateMatchSync,
  createMatchSession,
  playFirstHalf,
  playSecondHalf,
  continueSecondHalf,
  applyUserHalfTime,
  applyTeamTalk,
  applyManagedTeamTalk,
  suggestHalfTimeTalk,
  applySubstitution,
  applyLiveTactics,
  buildRoleReview,
  getHalfTimeTips,
  finalizeMatch,
  getBenchPlayers,
  getOnFieldPlayers,
  ensureFixtureWeather,
  isDerby,
  isBigMatch,
  weatherByKey,
  ensureActiveCareer,
  ensureDirectorCareer,
  ensureManagerCareer,
  recordManagerMatch,
  settleManagerSeason,
  managerWinRate,
  ensureClubHonors,
  processPoachingDay,
  acceptPoachBid,
  rejectPoachBid,
  pendingPoachBids,
  ensurePoachBids,
  buildScoutReport,
  formatScoutReportHtml,
  buildOpponentReport,
  formatOpponentReportHtml,
  opponentReportLogLines,
  scoutFogLevel,
  scoutAttrRows,
  formatScoutOvrFog,
  formatScoutPotFog,
  ensureDiscipline,
  isAvailable,
  resetSeasonDiscipline,
  processInboxDay,
  ensureInbox,
  listInbox,
  pendingInboxCount,
  resolveInboxAction,
  markInboxRead,
  syncPoachBidsToInbox,
  syncDealNegotiationsToInbox,
  syncTransferNegotiationsToInbox,
  pushInbox,
  inboxCatLabel,
  ensureTransferNegotiations,
  findActiveSaleNegotiation,
  findActiveTransferNegotiation,
  listTransferNegotiations,
  respondTransferNegotiation,
  submitSaleListing,
  submitTransferNegotiation,
  ensureDealNegotiations,
  findActiveDealNegotiation,
  listDealNegotiations,
  respondDealNegotiation,
  submitLoanNegotiation,
  submitRenewalNegotiation,
  cancelActiveDealNegotiations,
  autoRegisterClub,
  availableRegistrationContexts,
  developmentStatus,
  eligiblePlayerIds,
  ensureWorldRegistrations,
  playerCompetitionEligibility,
  registrationSummary,
  setPlayerRegistered,
  processRelationsDay,
  ensureSquadRelations,
  clubAtmosphere,
  atmosphereLabel,
  relationLabel,
  applyPlayerTalk,
  ensurePlayerRelation,
  processScoutMissions,
  startScoutMission,
  processWorldPulse,
  processYouthPulse,
  financeSnapshot,
  checkManagerBadges,
  noteUserMatchResult,
  ensureScoutMissions,
  ensureManagerJob,
  enterUnemployment,
  resignManagership,
  acceptJobOffer,
  rejectJobOffer,
  pendingJobOffers,
  generateJobOffers,
  processManagerJobsDay,
  managerReputation,
  reputationTierLabel,
  resignCooldownLeft,
  isManagerEmployed,
  ensurePlayerPathway,
  setPlayingTimeRole,
  playingTimeProgress,
  playingTimeRoleLabel,
  playerDevelopmentTimeline,
  developmentAttrLabel,
  PLAYING_TIME_ROLES,
};

function rng() {
  return Math.random();
}

function chance(p) {
  return rng() < p;
}

function clubById(world, id) {
  return world.clubs.find((c) => c.id === id);
}

const ATTR_KEYS = [
  "pace", "shooting", "passing", "dribbling", "defending", "physical",
  "finishing", "tackling", "marking", "strength", "stamina", "vision",
  "reflexes", "handling", "positioning", "kicking",
];

function staffRatingSafe(club, role) {
  ensureStaff(club);
  return club.staff[role]?.rating || 8;
}

function growYouthPlayer(player, growthRate, context = {}) {
  if (!player.potential) player.potential = Math.min(20, player.ovr + 3);
  if (player.ovr >= player.potential) return false;
  let grew = false;
  // 每周有机会涨 1 点某项属性
  if (chance(growthRate)) {
    const keys = ATTR_KEYS.filter((k) => (player.attrs[k] || 0) < 20);
    if (keys.length) {
      const k = keys[Math.floor(rng() * keys.length)];
      // 未达潜力时才涨
      const room = player.potential - player.ovr;
      if (room > 0 || player.attrs[k] < player.potential) {
        const before = Number(player.attrs[k] || 1);
        const ovrBefore = Number(player.ovr || playerOverall(player));
        player.attrs[k] = Math.min(20, (player.attrs[k] || 1) + 1);
        grew = true;
        if (context.record) {
          recordPlayerDevelopment(player, {
            season: context.world?.season,
            day: context.world?.day,
            type: "academy-training",
            source: "youth-development",
            changes: [{ attribute: k, before, after: player.attrs[k] }],
            ovrBefore,
            ovrAfter: playerOverall(player),
            reason: "青训设施、教练能力与本周培养计划共同推动成长",
            reasonEn: "Academy facilities, coaching and the weekly development plan drove improvement",
            details: { academyLevel: context.club?.youth?.level || 1, growthRate },
          });
        }
      }
    }
  }
  if (grew) {
    player.ovr = playerOverall(player);
    player.value = estimateValue(player);
    player.wage = Math.max(200, Math.round(estimateWage(player) * 0.25));
  }
  return grew;
}

/** 青训日更：成长 / 招生；维护费由全俱乐部统一周结算处理。 */
function processYouthDay(world) {
  for (const club of world.clubs) {
    const ya = ensureYouthAcademy(club);
    const cfg = YOUTH_LEVELS[ya.level] || YOUTH_LEVELS[1];
    ya.daysSinceIntake = (ya.daysSinceIntake || 0) + 1;

    // 每周成长（教练加成）
    if (world.day % 7 === 0) {
      const yMult = youthTrainingMult(club);
      const growth =
        (cfg.growth + coachGrowthBonus(club) + trainingGrowthBonus(club) * 0.5) * yMult;
      for (const yp of ya.players) {
        growYouthPlayer(yp, growth, { world, club, record: club.id === world.userClubId });
      }
      for (const p of club.players) {
        if (p.fromYouth && p.age <= 22 && p.potential && p.ovr < p.potential && chance(growth * 0.35)) {
          growYouthPlayer(p, growth * 0.5, { world, club, record: club.id === world.userClubId });
          p.wage = estimateWage(p);
        }
      }
    }

    // 约每 60 天招生（球探提升潜力），更符合现实青训周期
    if (ya.daysSinceIntake >= 60) {
      ya.daysSinceIntake = 0;
      const free = cfg.capacity - ya.players.length;
      const n = Math.min(cfg.intake, Math.max(0, free));
      const newcomers = [];
      const potBonus = scoutYouthPotBonus(club);
      for (let i = 0; i < n; i++) {
        const kid = createYouthPlayer(club);
        if (potBonus > 0) {
          kid.potential = Math.min(20, (kid.potential || kid.ovr) + potBonus);
        }
        ya.players.push(kid);
        newcomers.push(kid);
      }
      if (newcomers.length) assignSquadNumbers(club);
      if (club.id === world.userClubId && newcomers.length) {
        const names = newcomers.map((p) => p.name).join("、");
        world.news.unshift({
          day: world.day,
          text: `🌱 青训招生：${names} 加入学院（潜力 ${newcomers.map((p) => p.potential).join("/")}）`,
        });
      }
      // AI：自动提拔过高潜力/释放低潜
      if (club.id !== world.userClubId) {
        aiManageYouth(world, club);
      }
    }
  }
}

function aiManageYouth(world, club) {
  const ya = ensureYouthAcademy(club);
  // 提拔高潜力
  const promote = ya.players.filter((p) => p.potential >= 15 || p.ovr >= 12);
  for (const p of promote.slice(0, 1)) {
    if (club.players.length >= 28) break;
    promoteYouth(world, club.id, p.id, { silent: true });
  }
  // 名单过满则释放最弱
  const cfg = YOUTH_LEVELS[ya.level] || YOUTH_LEVELS[1];
  while (ya.players.length > cfg.capacity) {
    ya.players.sort((a, b) => a.potential - b.potential || a.ovr - b.ovr);
    ya.players.shift();
  }
}

export function promoteYouth(world, clubId, playerId, { silent = false } = {}) {
  const club = clubById(world, clubId);
  if (!club) return { ok: false, msg: "球队不存在" };
  const ya = ensureYouthAcademy(club);
  const idx = ya.players.findIndex((p) => p.id === playerId);
  if (idx < 0) return { ok: false, msg: "青训球员不存在" };
  if (club.players.length >= 28) return { ok: false, msg: "一线队已满（最多 28 人）" };

  const [player] = ya.players.splice(idx, 1);
  player.clubId = club.id;
  player.fromYouth = true;
  player.morale = Math.min(100, (player.morale || 70) + 10);
  player.wage = estimateWage(player);
  player.value = estimateValue(player);
  ensurePlayerHistory(player);
  // 换队后清旧号再分配，避免撞号
  player.number = null;
  club.players.push(player);
  assignSquadNumbers(club);
  autoLineup(club);

  if (!silent && clubId === world.userClubId) {
    recordPlayerDevelopment(player, {
      season: world.season,
      day: world.day,
      type: "milestone",
      source: "academy-promotion",
      reason: "从青训学院升入一线队",
      reasonEn: "Promoted from the academy to the first team",
      details: { clubId: club.id },
    });
    world.news.unshift({
      day: world.day,
      text: `🌟 青训提拔：${player.name}（${POS_LABEL[player.pos]}）升入一线队，能力 ${player.ovr} / 潜力 ${player.potential}`,
    });
    mediaYouthPromote(world, club.name, player.name, player.ovr, player.potential);
  }
  return {
    ok: true,
    msg: `已提拔 ${player.name} 至一线队（能力 ${player.ovr}，潜力 ${player.potential}）`,
    player,
  };
}

export function releaseYouth(world, clubId, playerId) {
  const club = clubById(world, clubId);
  if (!club) return { ok: false, msg: "球队不存在" };
  const ya = ensureYouthAcademy(club);
  const idx = ya.players.findIndex((p) => p.id === playerId);
  if (idx < 0) return { ok: false, msg: "青训球员不存在" };
  const [player] = ya.players.splice(idx, 1);
  if (clubId === world.userClubId) {
    world.news.unshift({
      day: world.day,
      text: `青训：已与 ${player.name} 解约`,
    });
  }
  return { ok: true, msg: `已释放 ${player.name}` };
}

// 青训升级：走 facilities 工期系统（re-export 见文件底部 import）

/** 推进一天：训练恢复、AI 比赛、工资 */
export function advanceDay(world) {
  // 待业：日历仍推进（生成工作邀请），但不能经营旧队比赛
  if (world.sacked) {
    world.day += 1;
    processTransferNegotiationsDay(world);
    processDealNegotiationsDay(world);
    ensureManagerJob(world);
    processManagerJobsDay(world);
    return {
      userMatches: [],
      sacked: true,
      unemployed: world.managerJob?.status === "unemployed",
      events: [],
      offers: pendingJobOffers(world),
    };
  }

  world.day += 1;
  const events = []; // 收集关键事件用于反馈

  // 转会窗开/关提示
  ensureTransferWindow(world);
  processTransferWindowDay(world);
  processTransferNegotiationsDay(world);
  processDealNegotiationsDay(world);
  const twEvent = checkTransferWindowEvent(world);
  if (twEvent) events.push(twEvent);

  expirePoachBids(world);
  processPoachingDay(world);
  processStaffMarketDay(world);
  processManagerJobsDay(world);
  // 信箱：同步挖角、过期、偶发球员/球探邮件
  processInboxDay(world);
  // 关系/氛围 + 可能的约谈信草稿
  const relOut = processRelationsDay(world);
  if (relOut?.inboxDraft) {
    pushInbox(world, relOut.inboxDraft);
    events.push({ type: "player_unhappy", player: relOut.inboxDraft.playerName });
  }
  const userClub = clubById(world, world.userClubId);
  for (const draft of processPlayingTimePromises(world, userClub)) {
    pushInbox(world, draft);
    if (draft.priority >= 3) {
      events.push({ type: "playing_time_breach", playerId: draft.ref?.playerId });
    }
  }
  processScoutMissions(world);
  processWorldPulse(world);
  processYouthPulse(world);

  // 设施建设完工
  const facilityResult = processFacilityDay(world);
  if (facilityResult?.completed) {
    events.push({ type: "facility_completed", facility: facilityResult.kind });
  }

  // 训练日程：体能 / 伤愈 / 士气 / 周成长（替代原先统一恢复）
  ensureWorldDelegation(world);
  applyDelegatedTraining(world, userClub);
  applyDelegatedDevelopment(world, userClub);
  processTrainingDay(world);

  // 青训
  processYouthDay(world);
  const youthEvent = checkYouthRecruitmentEvent(world);
  if (youthEvent) events.push(youthEvent);

  // 国际比赛日（约每 50 天，更贴近现实频率）
  if (!world.lastIntlDay) world.lastIntlDay = 0;
  if (world.day - world.lastIntlDay >= 50 && !world.seasonOver) {
    runInternationalBreak(world);
    events.push({ type: "international_break", day: world.day });
  }

  ensureCompetitions(world);

  // 今天的比赛：国内联赛、国内杯与大陆赛事（非用户场次自动踢完）
  const todayLeague = world.fixtures.filter((f) => f.day === world.day && !f.played);
  const todayCompetitions = competitionFixturesOnDay(world, world.day);
  const today = [...todayLeague, ...todayCompetitions];
  const userMatches = [];
  const aiMatchResults = [];
  for (const f of today) {
    const isUser = f.home === world.userClubId || f.away === world.userClubId;
    if (isUser) {
      userMatches.push(f);
    } else {
      const result = simulateMatch(world, f);
      // 记录关键AI比赛（德比、争冠、保级）
      if (f.derby || isTopTableClash(world, f) || isRelegationClash(world, f)) {
        aiMatchResults.push({
          home: clubById(world, f.home)?.short || clubById(world, f.home)?.name,
          away: clubById(world, f.away)?.short || clubById(world, f.away)?.name,
          homeGoals: result?.homeGoals || f.homeGoals,
          awayGoals: result?.awayGoals || f.awayGoals,
          derby: f.derby,
        });
      }
    }
  }
  if (aiMatchResults.length > 0) {
    events.push({ type: "key_matches", matches: aiMatchResults });
  }

  // 租借到期归还
  ensureLoans(world);
  const loanResult = processLoansDay(world);
  if (loanResult?.returned?.length > 0) {
    events.push({ type: "loan_returned", count: loanResult.returned.length });
  }

  // 媒体日常脉搏
  if (userClub && !world.seasonOver) {
    mediaDailyPulse(world, userClub);
    narrativeTablePulse(world, userClub, getSortedTable);
    narrativeInjuryWave(world, userClub);
  }

  // 检查伤病事件
  const injuryEvent = checkInjuryEvent(world, userClub);
  if (injuryEvent) events.push(injuryEvent);

  // 检查董事会警告
  const boardEvent = checkBoardEvent(world);
  if (boardEvent) events.push(boardEvent);

  // 所有俱乐部使用同一套工资、设施维护与商业收入周结算。
  if (world.day % 7 === 0) {
    const settlements = settleWorldWeeklyFinances(world);
    const debtActions = processAiDebtActions(world);
    if (debtActions.length) events.push({ type: "ai_debt_actions", actions: debtActions });
    const user = clubById(world, world.userClubId);
    const userSettle = settlements.find((item) => item.clubId === world.userClubId);
    const total = userSettle?.operatingOut || 0;
    const commercial = userSettle?.commercialIncome || 0;
    world.news.unshift({
      day: world.day,
      text: `俱乐部周结算：商业收入 ${formatMoney(commercial)} - 运营支出 ${formatMoney(total)}（一线 ${formatMoney(userSettle?.squadWage || 0)} + 青训 ${formatMoney(userSettle?.youthWage || 0)} + 职员 ${formatMoney(userSettle?.staffWage || 0)} + 设施 ${formatMoney(userSettle?.facilityUpkeep || 0)}），资金 ${formatMoney(user.money)}`,
    });
  }

  // 赛季结束：只处理一次（年龄 / 下滑 / 退役；可能赛季末解雇）
  let finishResult = null;
  const allPlayed =
    world.fixtures.length > 0 &&
    world.fixtures.every((f) => f.played) &&
    competitionsComplete(world);
  if (allPlayed && !world.seasonOver) {
    finishResult = finishSeason(world);
  }

  // 董事会中期检查（可能解雇）+ 窗内 AI 转会
  let sackedResult = null;
  if (!world.seasonOver && !world.sacked) {
    sackedResult = checkBoardMidSeason(world, getSortedTable);
    if (!world.sacked && isTransferWindowOpen(world)) {
      processAiTransfers(world);
    }
  }

  const sacked =
    !!(sackedResult && sackedResult.sacked) ||
    !!(finishResult && finishResult.sacked) ||
    !!world.sacked;

  // 解雇/待业：生成工作邀请（保留存档可再就业）
  if (sacked && world.sacked) {
    ensureManagerJob(world);
    if (world.managerJob.status !== "unemployed" || !pendingJobOffers(world).length) {
      enterUnemployment(world, world.sackedReason || "被董事会解雇", { fromSack: true });
    }
  }
  // 标注事件发生日，便于多日推进后的摘要按时间排列
  for (const ev of events) {
    if (ev.day == null) ev.day = world.day;
  }
  return {
    userMatches,
    sacked,
    sackedResult:
      sackedResult ||
      finishResult?.sackedResult ||
      (world.sacked ? { sacked: true, msg: world.sackedReason } : null),
    events, // 返回事件列表供界面展示
  };
}

// 辅助函数：检查各种关键事件

function checkTransferWindowEvent(world) {
  const tw = world.transferWindow;
  if (!tw || !tw.lastPhase) return null;
  const phase = getTransferPhase(world);
  if (phase !== tw.lastPhase) {
    if (phase === "summer") return { type: "transfer_window", phase: "summer_open" };
    if (phase === "winter") return { type: "transfer_window", phase: "winter_open" };
    if (phase === "closed") return { type: "transfer_window", phase: "closed" };
  }
  return null;
}

function checkYouthRecruitmentEvent(world) {
  const userClub = clubById(world, world.userClubId);
  if (!userClub) return null;
  const ya = userClub.youth;
  if (!ya) return null;
  // 检查是否刚招生（daysSinceIntake === 0 表示刚重置）
  if (ya.daysSinceIntake === 0 && ya.players.length > 0) {
    const newcomers = ya.players.slice(-3); // 假设最多3个新人
    if (newcomers.length > 0) {
      return {
        type: "youth_recruitment",
        count: newcomers.length,
        avgPotential: Math.round(
          newcomers.reduce((s, p) => s + (p.potential || p.ovr || 0), 0) /
            newcomers.length
        ),
      };
    }
  }
  return null;
}

function isTopTableClash(world, fixture) {
  if (!world?.table) return false;
  const homeClub = clubById(world, fixture.home);
  const awayClub = clubById(world, fixture.away);
  if (!homeClub || !awayClub || homeClub.division !== awayClub.division) return false;

  const table = getSortedTable(world, homeClub.division);
  const homePos = table.findIndex(r => r.id === fixture.home) + 1;
  const awayPos = table.findIndex(r => r.id === fixture.away) + 1;

  // 双方都在前4名
  return homePos > 0 && awayPos > 0 && homePos <= 4 && awayPos <= 4;
}

function isRelegationClash(world, fixture) {
  if (!world?.table) return false;
  const homeClub = clubById(world, fixture.home);
  const awayClub = clubById(world, fixture.away);
  const relegate = DIVISIONS[homeClub?.division]?.relegate || 0;
  if (!homeClub || !awayClub || homeClub.division !== awayClub.division || relegate <= 0) return false;

  const table = getSortedTable(world, homeClub.division);
  const homePos = table.findIndex(r => r.id === fixture.home) + 1;
  const awayPos = table.findIndex(r => r.id === fixture.away) + 1;
  const total = table.length;
  const dangerStart = Math.max(1, total - relegate - 1);

  // 双方都在保级区附近（倒数5名）
  return homePos > 0 && awayPos > 0 && homePos >= dangerStart && awayPos >= dangerStart;
}

function checkInjuryEvent(world, userClub) {
  if (!userClub) return null;
  const injured = userClub.players.filter((p) => (p.injured || 0) > 0);
  if (injured.length >= 3) {
    return { type: "injury_wave", count: injured.length };
  }
  return null;
}

function checkBoardEvent(world) {
  const userClub = clubById(world, world.userClubId);
  if (!userClub) return null;
  const board = world.boardObjective;
  if (!board) return null;
  // 检查是否有新警告
  const warnings = board.warnings || 0;
  if (warnings > (board._lastWarnings || 0)) {
    board._lastWarnings = warnings;
    return { type: "board_warning", warnings, maxWarnings: 4 };
  }
  return null;
}

/**
 * 赛季末：排名新闻 + 全员年龄+1 + 高龄下滑 + 退役
 * 不会自动开新赛季，需调用 startNextSeason
 */
export function finishSeason(world) {
  if (world.seasonOver) return { retired: [] };

  // Record the actual club and association where each 15-21-year-old trained
  // before ages advance and loans return for the next season.
  recordDevelopmentSeason(world, world.season);

  // 个人荣誉（用本赛季 stats，在归档/升降级前）
  awardSeasonHonors(world);

  // 合同年限 -1 / 到期
  processContractsEndOfSeason(world);

  // 大陆席位取升降级前的本赛季最终排名。
  world._nextContinentalQualifiers = buildContinentalQualifiers(world);

  // 转播分成 + 名次奖金：须在升降级改写 division 之前，按本赛季最终积分榜
  const leaguePay = applySeasonLeagueFinance(world, getSortedTable);

  // 先算本级排名与升降级（在年龄变化前，用本赛季积分）
  const promoNews = applyPromotionRelegation(world);

  const userClub = getUserClub(world);
  const userDivForAward = world._lastUserDiv || userClub.division || 3;
  const pos = world._lastUserPos > 0 ? world._lastUserPos : 1;
  const divName = DIVISIONS[userDivForAward]?.name || `第${userDivForAward}级`;
  // 经理生涯 / 俱乐部荣誉墙 / 结算快照
  ensureManagerCareer(world);
  settleManagerSeason(world, pos, userDivForAward, promoNews);
  world.news.unshift({
    day: world.day,
    text: `🏆 ${world.season} 赛季结束！${userClub.name} 在${divName}排名第 ${pos} 名。可进入下一赛季。`,
  });
  if (leaguePay?.userPayout) {
    const up = leaguePay.userPayout;
    world.news.unshift({
      day: world.day,
      text: `📺 联赛分红：第 ${up.pos} 名 · 转播分成 ${formatMoney(up.broadcast)} + 名次奖金 ${formatMoney(up.prize)} = ${formatMoney(up.total)}（已入账）`,
    });
  }
  mediaSeasonAwards(world, userClub, pos, divName);
  const boardSettle = settleBoardObjective(world, pos, getSortedTable);
  for (const t of promoNews) {
    world.news.unshift({ day: world.day, text: t });
  }
  delete world._lastUserDiv;
  delete world._lastUserPos;

  const retiredUser = [];
  const declinedUser = [];
  if (!Array.isArray(world.retiredPlayers)) world.retiredPlayers = [];

  for (const club of world.clubs) {
    const ya = ensureYouthAcademy(club);

    // 一线队
    const kept = [];
    for (const p of club.players) {
      // 退役前先归档本赛季，保留生涯/分赛季历史
      const declined = agePlayerOneYear(p, {
        season: world.season,
        day: world.day,
        record: club.id === world.userClubId,
      });
      if (declined && club.id === world.userClubId) declinedUser.push(p.name);
      const rc = retireChance(p.age);
      if (rc > 0 && chance(rc)) {
        archiveAndResetSeasonStats(p, world.season, club.id, club.name);
        world.retiredPlayers.unshift({
          ...JSON.parse(JSON.stringify(p)),
          retiredSeason: world.season,
          lastClubId: club.id,
          lastClubName: club.name,
        });
        if (world.retiredPlayers.length > 80) world.retiredPlayers.length = 80;
        if (club.id === world.userClubId) retiredUser.push({ name: p.name, age: p.age });
        continue;
      }
      kept.push(p);
    }
    club.players = kept;

    // 青训
    const yKept = [];
    for (const p of ya.players) {
      agePlayerOneYear(p, {
        season: world.season,
        day: world.day,
        record: club.id === world.userClubId,
      });
      // 青训一般不退役；满 20 岁仍在青训则强制释放或提拔潜力高的
      if (p.age >= 20) {
        if (p.potential >= 14 && club.players.length < 23) {
          p.fromYouth = true;
          p.wage = estimateWage(p);
          ensurePlayerHistory(p);
          club.players.push(p);
          if (club.id === world.userClubId) {
            recordPlayerDevelopment(p, {
              season: world.season,
              day: world.day,
              type: "milestone",
              source: "academy-age-promotion",
              reason: "达到青训年龄上限后升入一线队",
              reasonEn: "Promoted after reaching the academy age limit",
              details: { clubId: club.id },
            });
            world.news.unshift({
              day: world.day,
              text: `🌱 ${p.name} 已超龄，自动升入一线队（能力 ${p.ovr} / 潜力 ${p.potential}）`,
            });
          }
        } else {
          // 离开学院前归档
          archiveAndResetSeasonStats(p, world.season, club.id, club.name);
        }
        continue;
      }
      yKept.push(p);
    }
    ya.players = yKept;

    // 退役、合同到期后先保证每个位置组仍能组成现实的一线队骨架。
    const minimumByPosition = { GK: 2, DEF: 5, MID: 5, ATT: 3 };
    for (const [position, minimum] of Object.entries(minimumByPosition)) {
      while (club.players.filter((player) => player.pos === position).length < minimum) {
        club.players.push(
          createPlayer(position, club.power - 5 + Math.floor(rng() * 8), club.id, {
            homeNation: club.countryCode,
          })
        );
      }
    }

    // 阵容过少则继续补充轮换球员。
    while (club.players.length < 16) {
      const posPick = ["GK", "DEF", "MID", "ATT"][Math.floor(rng() * 4)];
      club.players.push(
        createPlayer(posPick, club.power - 5 + Math.floor(rng() * 8), club.id, {
          homeNation: club.countryCode,
        })
      );
    }
    fillYouthSquad(club);
    autoLineup(club);
    club.form = [];
  }

  if (retiredUser.length) {
    world.news.unshift({
      day: world.day,
      text: `👋 退役：${retiredUser.map((r) => `${r.name}（${r.age}岁）`).join("、")}`,
    });
  }
  if (declinedUser.length) {
    const sample = declinedUser.slice(0, 5).join("、");
    const more = declinedUser.length > 5 ? ` 等 ${declinedUser.length} 人` : "";
    world.news.unshift({
      day: world.day,
      text: `📉 高龄状态下滑：${sample}${more}`,
    });
  }

  world.seasonOver = true;
  return {
    retired: retiredUser,
    sacked: !!(boardSettle && boardSettle.sacked) || !!world.sacked,
    sackedResult: boardSettle?.sack || (world.sacked ? { sacked: true, msg: world.sackedReason } : null),
  };
}

/** 开启下一赛季：归档个人赛季数据 → 重置积分榜、赛程 */
export function startNextSeason(world) {
  ensureCompetitions(world);
  if (
    !world.seasonOver &&
    (world.fixtures.some((f) => !f.played) || !competitionsComplete(world))
  ) {
    return { ok: false, msg: "本赛季尚未结束" };
  }

  // 若尚未做过赛季末处理（年龄/退役）
  if (!world.seasonOver) finishSeason(world);

  const endedSeason = world.season;

  // 归档本赛季个人数据到 history + career（在赛季号 +1 之前）
  for (const c of world.clubs) {
    for (const p of c.players) {
      archiveAndResetSeasonStats(p, endedSeason, c.id, c.name);
    }
    const ya = ensureYouthAcademy(c);
    for (const p of ya.players) {
      archiveAndResetSeasonStats(p, endedSeason, c.id, c.name);
    }
    ya.daysSinceIntake = 0;
  }

  // 全部租借归还，再处理未续约离队
  cancelActiveDealNegotiations(world);
  returnAllLoans(world);
  releaseUnrenewed(world);

  const expandedClubs = ensureWorldClubTemplates(world);
  ensureWorldFinances(world);

  world.season += 1;
  world.day = 1;
  world.seasonOver = false;
  // 新赛季重置解雇标记与转会窗状态
  world.sacked = false;
  world.sackedDay = null;
  world.sackedReason = null;
  ensureTransferWindow(world);
  world.transferWindow.lastPhase = null;
  processTransferWindowDay(world);
  ensurePoachBids(world);
  world.poachBids = [];
  processStaffContractsEndOfSeason(world);
  ensureStaffApproaches(world);
  world.staffApproaches = (world.staffApproaches || []).filter((a) => a.status === "pending");

  for (const c of world.clubs) {
    world.table[c.id] = { played: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 };
    if (!c.division) c.division = 3;
    resetClubSeasonFinance(c, world.season);
    for (const p of c.players) {
      ensureContract(p);
      ensureDiscipline(p);
      resetSeasonDiscipline(p);
    }
    autoLineup(c);
  }
  ensureWorldSeasonPlans(world);

  world.fixtures = generateAllDivisionFixtures(world.clubs);
  const qualifiers = world._nextContinentalQualifiers || null;
  delete world._nextContinentalQualifiers;
  resetCompetitions(world, qualifiers);
  ensureWorldRegistrations(world);
  const user = getUserClub(world);
  const divName = DIVISIONS[user.division]?.name || "";
  world.news.unshift({
    day: 1,
    text: `📅 ${world.season} 赛季开始！${user.name} 征战${divName}。国内联赛、杯赛与大陆赛事赛程已生成。${expandedClubs ? ` 世界联赛新增 ${expandedClubs} 家俱乐部。` : ""}`,
  });
  mediaSeasonKickoff(world, user, divName);
  ensureBoardObjective(world);

  return { ok: true, msg: `${world.season} 赛季 · ${divName} 已开始` };
}

export function renewUserPlayer(world, playerId, opts = {}) {
  const club = getUserClub(world);
  if (!club) return { ok: false, msg: "无球队" };
  const p = club.players.find((x) => x.id === playerId);
  if (!p) return { ok: false, msg: "球员不在阵中" };
  if (p.loan) return { ok: false, msg: "租借球员无法续约" };
  const offer = opts.wage != null
    ? { years: opts.years || 3, newWage: opts.wage }
    : renewOffer(p, opts.years != null ? { years: opts.years } : {});
  return submitRenewalNegotiation(world, playerId, {
    years: offer.years,
    wage: offer.newWage,
  });
}

export function loanOutPlayer(world, playerId, opts = {}) {
  const preview = previewLoanOut(world, playerId, opts.term || "half");
  if (!preview) return { ok: false, msg: "无法外租该球员" };
  return submitLoanNegotiation(world, "loan_out", playerId, null, {
    term: opts.term,
    fee: opts.fee ?? preview.fee,
    wageShare: opts.wageShare ?? preview.wageShare,
  });
}

export function loanInPlayer(world, playerId, fromClubId, opts = {}) {
  const preview = previewLoanIn(world, playerId, fromClubId, opts.term || "half");
  if (!preview) return { ok: false, msg: "无法租入该球员" };
  return submitLoanNegotiation(world, "loan_in", playerId, fromClubId, {
    term: opts.term,
    fee: opts.fee ?? preview.fee,
    wageShare: opts.wageShare ?? preview.wageShare,
  });
}

export function terminateUserPlayer(world, playerId) {
  if (world.sacked) return { ok: false, msg: "你已被解雇，无法操作" };
  const club = getUserClub(world);
  if (!club) return { ok: false, msg: "无球队" };
  const p = club.players.find((x) => x.id === playerId);
  if (!p) return { ok: false, msg: "球员不在阵中" };
  if (findActiveDealNegotiation(world, playerId) || findActiveTransferNegotiation(world, playerId)) {
    return { ok: false, msg: "该球员仍有进行中的合同、租借或转会谈判" };
  }
  const res = terminatePlayer(world, club, p);
  if (res.ok) {
    world.news.unshift({ day: world.day, text: `📝 ${res.msg}` });
  }
  return res;
}

export function previewTerminate(world, playerId) {
  const club = getUserClub(world);
  const p = club?.players?.find((x) => x.id === playerId);
  if (!p) return null;
  return { player: p, cost: terminateCost(p) };
}

export function previewRenew(world, playerId, years) {
  const club = getUserClub(world);
  const p = club?.players?.find((x) => x.id === playerId);
  if (!p) return null;
  return { player: p, offer: renewOffer(p, years != null ? { years } : {}) };
}

export function getNextPlayableMatch(world) {
  return getNextUserMatch(world);
}

export {
  ensureCompetitions,
  getNextUserCompetitionMatch,
  allUserCompetitionFixtures,
  allCompetitionFixtures,
  renewOffer,
  ensureContract,
  signFreeAgent,
  needsContractAttention,
  terminateCost,
  ensureTraining,
  setTraining,
  trainingSummary,
  assistantTrainingPlan,
  TRAINING_FOCUSES,
  TRAINING_INTENSITIES,
  ensureTransferWindow,
  isTransferWindowOpen,
  getTransferPhase,
  transferWindowLabel,
  transferWindowShort,
  processTransferWindowDay,
  assertTransferOpen,
  sackManager,
  ensureFacilities,
  startFacilityUpgrade,
  upgradeYouthAcademy,
  stadiumInfo,
  trainingFacilityInfo,
  youthFacilityInfo,
  facilitySummaryLine,
  isBuilding,
  getProject,
  FACILITY_MAX,
  STADIUM_LEVELS,
  TRAINING_FACILITY_LEVELS,
  FACILITY_LABELS,
  ensureClubFinance,
  ensureWorldFinances,
  // 租借
  ensureLoans,
  recallLoan,
  returnLoan,
  processLoansDay,
  returnAllLoans,
  listUserLoans,
  userSquadWageBill,
  previewLoanOut,
  previewLoanIn,
  isOnLoan,
};

/** 按各国联赛配置执行相邻级别升降级。 */
export function applyPromotionRelegation(world) {
  const news = [];
  const sortDiv = (d) => getSortedTable(world, d);
  const clubMap = new Map(world.clubs.map((c) => [c.id, c]));

  // 记录用户升降前级别与排名（供赛季总结）
  const user = getUserClub(world);
  const userDivBefore = user.division || 3;
  const ranked = sortDiv(userDivBefore);
  world._lastUserDiv = userDivBefore;
  world._lastUserPos = ranked.findIndex((r) => r.id === user.id) + 1;
  const nameOf = (id) => clubMap.get(id)?.name || id;
  const list = (ids) => ids.map(nameOf).join("、");
  const moves = [];
  const countryIds = [...new Set(Object.values(DIVISIONS).map((d) => d.countryId))];
  for (const countryId of countryIds) {
    const leagues = Object.values(DIVISIONS)
      .filter((d) => d.countryId === countryId)
      .sort((a, b) => a.tier - b.tier);
    for (let i = 0; i < leagues.length - 1; i++) {
      const upper = leagues[i];
      const lower = leagues[i + 1];
      const count = Math.min(upper.relegate || 0, lower.promote || 0);
      if (!count) continue;
      const upperTable = sortDiv(upper.id);
      const lowerTable = sortDiv(lower.id);
      if (upperTable.length < count || lowerTable.length < count) continue;
      const relegated = upperTable.slice(-count).map((r) => r.id);
      const promoted = lowerTable.slice(0, count).map((r) => r.id);
      for (const id of relegated) moves.push({ id, from: upper.id, to: lower.id, promoted: false });
      for (const id of promoted) moves.push({ id, from: lower.id, to: upper.id, promoted: true });
      news.push(`⬆️ ${lower.name}升级：${list(promoted)} → ${upper.name}`);
      news.push(`⬇️ ${upper.name}降级：${list(relegated)} → ${lower.name}`);
    }
  }

  for (const move of moves) {
    const club = clubMap.get(move.id);
    if (club) club.division = move.to;
  }

  const userMove = moves.find((m) => m.id === user.id);
  if (userMove?.promoted) {
    news.push(`🎉 恭喜！${user.name} 成功升级至${DIVISIONS[user.division]?.name}！`);
  }
  if (userMove && !userMove.promoted) {
    news.push(`😢 ${user.name} 不幸降级至${DIVISIONS[user.division]?.name}。`);
  }

  // 媒体通稿（用户相关）
  if (userMove) {
    mediaPromotion(
      world,
      user.name,
      DIVISIONS[userDivBefore]?.name || "",
      DIVISIONS[user.division]?.name || "",
      userMove.promoted
    );
  }

  return news;
}

/** @param division 不传则全世界；传联赛 ID 则仅该联赛 */
export function getSortedTable(world, division = null) {
  let clubs = world.clubs;
  if (division != null) {
    clubs = clubsInDivision(world.clubs, division);
  }
  return clubs
    .map((c) => {
      const t = world.table[c.id] || { played: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 };
      return {
        id: c.id,
        name: c.name,
        division: c.division || 3,
        ...t,
        gd: t.gf - t.ga,
      };
    })
    .sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf);
}

export function getUserClub(world) {
  return clubById(world, world.userClubId);
}

export function getNextUserMatch(world) {
  // 国内联赛、国内杯与大陆赛事里用户下场最早的未赛
  const league = world.fixtures
    .filter(
      (f) =>
        !f.played &&
        (f.home === world.userClubId || f.away === world.userClubId)
    )
    .sort((a, b) => a.day - b.day || (a.round || 0) - (b.round || 0));
  const competition = getNextUserCompetitionMatch(world);
  if (league[0] && competition) {
    return league[0].day <= competition.day ? league[0] : competition;
  }
  return league[0] || competition || null;
}

/** 下一场用户比赛的日期（联赛/杯）；无则 null */
export function nextUserMatchDay(world) {
  const m = getNextUserMatch(world);
  return m ? m.day : null;
}

/**
 * 连续推进到下一场用户比赛日（或赛季结束）。
 * 若当天已有可踢比赛，不推进，返回 stopped 提示。
 * 返回值包含关键事件摘要，用于界面展示。
 */
export function advanceToNextMatchDay(world, maxDays = 60) {
  if (world.sacked) {
    return { ok: false, msg: "你已被解雇", days: 0, userMatches: [], sacked: true, events: [] };
  }
  if (world.seasonOver) {
    return { ok: false, msg: "赛季已结束", days: 0, userMatches: [], events: [] };
  }
  const ready = getNextPlayableMatch(world);
  if (ready && ready.day <= world.day && !ready.played) {
    return {
      ok: false,
      msg: "今天有比赛，请先进入比赛！",
      days: 0,
      userMatches: [ready],
      pendingMatch: ready,
      events: [],
    };
  }

  let days = 0;
  let last = { userMatches: [], events: [] };
  const allEvents = []; // 累积所有事件

  while (days < maxDays && !world.seasonOver && !world.sacked) {
    const target = nextUserMatchDay(world);
    if (target != null && world.day >= target) {
      const m = getNextPlayableMatch(world) || getNextUserMatch(world);
      return {
        ok: true,
        days,
        userMatches: m ? [m] : [],
        pendingMatch: m,
        msg: m ? `比赛日到了（推进 ${days} 天）` : `已推进 ${days} 天`,
        events: allEvents,
      };
    }
    last = advanceDay(world);
    if (last.events && last.events.length > 0) {
      allEvents.push(...last.events);
    }
    days += 1;
    if (last.sacked || world.sacked) {
      return {
        ok: false,
        days,
        userMatches: [],
        sacked: true,
        sackedResult: last.sackedResult,
        msg: last.sackedResult?.msg || "你已被解雇",
        events: allEvents,
      };
    }
    if (last.userMatches && last.userMatches.length) {
      return {
        ok: true,
        days,
        userMatches: last.userMatches,
        pendingMatch: last.userMatches[0],
        msg: `推进 ${days} 天，比赛日到了`,
        events: allEvents,
      };
    }
    if (world.seasonOver) {
      return {
        ok: true,
        days,
        userMatches: [],
        msg: `推进 ${days} 天，赛季结束`,
        sacked: !!world.sacked,
        events: allEvents,
      };
    }
  }
  return {
    ok: true,
    days,
    userMatches: last.userMatches || [],
    msg: `已推进 ${days} 天`,
    events: allEvents,
  };
}

/**
 * 推进到赛季末：自动连推，遇到我方比赛日则停下。
 * stopOnUserMatch=true（默认）适合通勤。
 */
export function advanceToSeasonEnd(world, { maxDays = 400, stopOnUserMatch = true } = {}) {
  if (world.sacked) {
    return { ok: false, msg: "你已被解雇", days: 0, userMatches: [], sacked: true };
  }
  if (world.seasonOver) {
    return { ok: false, msg: "赛季已结束", days: 0, userMatches: [] };
  }
  const ready = getNextPlayableMatch(world);
  if (ready && ready.day <= world.day && !ready.played) {
    return {
      ok: false,
      msg: "今天有比赛，请先进入比赛！",
      days: 0,
      userMatches: [ready],
      pendingMatch: ready,
    };
  }

  let days = 0;
  let last = { userMatches: [] };
  const allEvents = []; // 累积事件供界面摘要展示
  while (days < maxDays && !world.seasonOver && !world.sacked) {
    last = advanceDay(world);
    if (last.events && last.events.length > 0) {
      allEvents.push(...last.events);
    }
    days += 1;
    if (last.sacked || world.sacked) {
      return {
        ok: false,
        days,
        userMatches: [],
        sacked: true,
        sackedResult: last.sackedResult,
        msg: last.sackedResult?.msg || "你已被解雇",
        events: allEvents,
      };
    }
    if (stopOnUserMatch && last.userMatches && last.userMatches.length) {
      return {
        ok: true,
        days,
        userMatches: last.userMatches,
        pendingMatch: last.userMatches[0],
        stoppedForMatch: true,
        msg: `推进 ${days} 天，遇到我方比赛，已停下`,
        events: allEvents,
      };
    }
    if (world.seasonOver) {
      return {
        ok: true,
        days,
        userMatches: [],
        stoppedForMatch: false,
        msg: `推进 ${days} 天，赛季结束`,
        sacked: !!world.sacked,
        events: allEvents,
      };
    }
  }
  return {
    ok: true,
    days,
    userMatches: last.userMatches || [],
    stoppedForMatch: !!(last.userMatches && last.userMatches.length),
    msg: `已推进 ${days} 天（未到赛季末）`,
    events: allEvents,
  };
}


function posCount(players, pos) {
  return players.filter((p) => p.pos === pos).length;
}

/** 队与队之间转会 */
function transferBetween(world, buyer, seller, player) {
  const idx = seller.players.findIndex((p) => p.id === player.id);
  if (idx < 0) return { ok: false, msg: "球员不存在" };
  if (seller.players.length <= 14) return { ok: false, msg: "卖方阵容过少" };
  if (buyer.players.length >= 25) return { ok: false, msg: "买方阵容已满" };
  const price = Math.round((player.value || estimateValue(player)) * (0.9 + rng() * 0.2));
  if (clubTransferBudget(world, buyer) < price) return { ok: false, msg: "扣除运营储备后资金不足" };

  recordFinanceEntry(buyer, -price, { category: "transfer", source: "ai-transfer", season: world.season, day: world.day });
  recordFinanceEntry(seller, price, { category: "transfer", source: "ai-transfer", season: world.season, day: world.day });
  seller.players.splice(idx, 1);
  player.clubId = buyer.id;
  player.morale = Math.min(100, (player.morale || 70) + 5);
  player.number = null;
  buyer.players.push(player);
  assignSquadNumbers(buyer);
  autoLineup(buyer);
  autoLineup(seller);
  return { ok: true, price, player };
}

/**
 * AI 转会：窗内约每 3 天；按短板/年龄结构买卖，可能挖用户队。
 * v153: 增强阵容平衡检查，避免8后卫3前锋等失衡情况。
 */
export function processAiTransfers(world) {
  if (world.seasonOver || world.sacked) return [];
  if (!isTransferWindowOpen(world)) return [];
  if (world.day % 3 !== 0) return [];

  const moves = [];
  const clubs = world.clubs.filter((c) => c.id !== world.userClubId);
  const shuffled = clubs.slice().sort(() => rng() - 0.5);
  // 夏窗更活跃
  let budgetMoves = getTransferPhase(world) === "summer" ? 6 : 3;

  for (const club of shuffled) {
    if (budgetMoves <= 0) break;
    ensureStaff(club);
    if (club.players.length < 14) continue;
    const plan = ensureClubSeasonPlan(club, world.clubs, world.season);
    const planDef = clubPlanDef(plan);

    const avgAge =
      club.players.reduce((s, p) => s + (p.age || 25), 0) / Math.max(1, club.players.length);
    const needCash = club.money < (plan?.key === "sustainable" ? 1_200_000 : 350_000) || club.players.length >= 26;
    const tooOld = avgAge >= (plan?.key === "rebuild" ? 27.3 : 29) && club.players.length > 16;

    // 卖：优先卖出过剩位置的最弱球员（而非全队最弱）
    if (needCash || tooOld || chance(plan?.key === "sustainable" || plan?.key === "rebuild" ? 0.24 : 0.15)) {
      // 使用阵容平衡系统选择卖出球员
      const victim = selectPlayerToSellSmart(club.players, (p, players) => {
        const posCount = players.filter((x) => x.pos === p.pos).length;
        if (p.pos === "GK" && posCount <= 1) return false;
        if (plan?.key === "youth" && (p.age || 25) <= 22 && (p.potential || p.ovr || 0) >= (p.ovr || 0) + 2) return false;
        if (plan?.key === "compete" && (p.ovr || 0) >= Math.max(...players.map((x) => x.ovr || 0)) - 1) return false;
        return true;
      });
      if (victim && club.players.length > 15) {
        const buyers = world.clubs
          .filter(
            (c) =>
              c.id !== club.id &&
              c.id !== world.userClubId &&
              c.players.length < 25 &&
              clubTransferBudget(world, c) > (victim.value || 0) * 0.8
          )
          .sort((a, b) => {
            // 缺该位置的优先
            const da = posCount(a.players, victim.pos);
            const db = posCount(b.players, victim.pos);
            return da - db || b.money - a.money;
          });
        if (buyers.length) {
          const buyer = buyers[0];
          const res = transferBetween(world, buyer, club, victim);
          if (res.ok) {
            moves.push(res);
            budgetMoves -= 1;
            const involvesUser =
              buyer.id === world.userClubId || club.id === world.userClubId;
            if (involvesUser) {
              world.news.unshift({
                day: world.day,
                text: `🔄 ${buyer.name} 从 ${club.name} 签下 ${victim.name}，费 ${formatMoney(res.price)}`,
              });
              mediaTransfer(world, {
                type: club.id === world.userClubId ? "sell" : "buy",
                playerName: victim.name,
                clubName: buyer.name,
                otherName: club.name,
                feeText: formatMoney(res.price),
              });
            } else if (chance(0.35)) {
              world.news.unshift({
                day: world.day,
                text: `🔄 ${buyer.name} 签下 ${victim.name}（来自 ${club.name}）`,
              });
            }
            continue;
          }
        }
      }
    }

    // 买：使用阵容平衡系统确定需要补强的位置
    const transferBudget = clubTransferBudget(world, club);
    if (club.finance?.debtPlan?.transferEmbargo) continue;
    const needPos = selectPositionToBuy(club.players, transferBudget);
    if (!needPos || transferBudget < 150000 || club.players.length >= 25) continue;

    // 同时检查：如果该位置已经够用，也跳过（双重保险）
    const counts = {
      GK: posCount(club.players, "GK"),
      DEF: posCount(club.players, "DEF"),
      MID: posCount(club.players, "MID"),
      ATT: posCount(club.players, "ATT"),
    };
    if (!shouldBuyPosition(club.players, needPos)) continue;

    const minOvr = Math.max(6, Math.floor((club.power || 50) / 8) - 1);
    const candidates = [];
    for (const other of world.clubs) {
      if (other.id === club.id) continue;
      // 用户球员只能通过可处理的正式报价离队，不能被后台 AI 即时卖走。
      if (other.id === world.userClubId) continue;
      // 略偏好同级
      const sameDiv = (other.division || 3) === (club.division || 3);
      for (const p of other.players) {
        if (p.pos !== needPos) continue;
        if (other.players.length <= 14) continue;
        if (p.pos === "GK" && posCount(other.players, "GK") <= 1) continue;
        if ((p.ovr || 0) < minOvr) continue;
        // 别买高龄废柴
        if ((p.age || 0) >= 33 && (p.ovr || 0) < 12) continue;
        const price = (p.value || estimateValue(p)) * (0.9 + rng() * 0.15);
        if (price > transferBudget) continue;
        const pot = p.potential || p.ovr || 10;
        const age = p.age || 25;
        const youthBonus = age <= 23 ? planDef.youthWeight * 2.2 : age >= 31 ? -planDef.youthWeight : 0;
        const identityPosBonus =
          plan?.key === "attacking" && (p.pos === "MID" || p.pos === "ATT") ? 1.1 :
          plan?.key === "resilient" && (p.pos === "GK" || p.pos === "DEF") ? 1.1 : 0;
        const score =
          (p.ovr || 0) * planDef.ovrWeight +
          pot * (0.22 + planDef.youthWeight * 0.18) +
          youthBonus +
          identityPosBonus +
          (sameDiv ? 0.5 : 0) -
          (price / 1_200_000) * (0.7 + planDef.valueWeight);
        candidates.push({ player: p, club: other, score, price });
      }
    }
    candidates.sort((a, b) => b.score - a.score);
    const pick = candidates[0];
    if (!pick) continue;
    // 挖用户队：窗内更积极
    if (pick.club.id === world.userClubId && !chance(0.55)) continue;

    const res = transferBetween(world, club, pick.club, pick.player);
    if (res.ok) {
      moves.push(res);
      budgetMoves -= 1;
      if (pick.club.id === world.userClubId) {
        world.news.unshift({
          day: world.day,
          text: `⚠️ ${club.name} 挖走了你的 ${pick.player.name}！转会费 ${formatMoney(res.price)}`,
        });
        mediaTransfer(world, {
          type: "sell",
          playerName: pick.player.name,
          clubName: club.name,
          otherName: pick.club.name,
          feeText: formatMoney(res.price),
        });
      } else if (chance(0.28)) {
        world.news.unshift({
          day: world.day,
          text: `🔄 ${club.name} 补强${POS_LABEL[needPos] || needPos}：签下 ${pick.player.name}`,
        });
      }
    }
  }
  return moves;
}


/**
 * 买入球员
 * options: { years?: number, wageMult?: number } 合同谈判
 */
export function buyPlayer(world, playerId, fromClubId, options = {}) {
  if (world.sacked) return { ok: false, msg: "你已被解雇，无法操作转会" };
  const win = assertTransferOpen(world);
  if (!win.ok) return win;

  const user = getUserClub(world);
  const from = clubById(world, fromClubId);
  if (!from || from.id === user.id) return { ok: false, msg: "无效的卖家" };
  const idx = from.players.findIndex((p) => p.id === playerId);
  if (idx < 0) return { ok: false, msg: "球员不存在" };
  const player = from.players[idx];
  if (player.loan) return { ok: false, msg: "租借球员不可转会买入（可谈租借）" };
  ensureStaff(user);
  ensureContract(player);
  const price = Math.round(player.value * (1.05 + rng() * 0.15) * scoutBuyMod(user));
  const priceCash = clubCashAvailability(world, user, price);
  if (!priceCash.ok) {
    return {
      ok: false,
      msg: priceCash.reserved > 0
        ? `未承诺现金不足：转会谈判已占用 ${formatMoney(priceCash.reserved)}，本交易需要 ${formatMoney(price)}`
        : `资金不足，需要 ${formatMoney(price)}`,
    };
  }
  if (user.players.length >= 28) return { ok: false, msg: "阵容已满（最多 28 人）" };
  if (from.players.length <= 14) return { ok: false, msg: "对方拒绝出售（阵容过少）" };

  // 合同谈判：年限 1–5，周薪倍率
  let years = options.years != null ? Math.max(1, Math.min(5, +options.years)) : 2 + Math.floor(rng() * 3);
  const wageMult = options.wageMult != null ? Math.max(0.9, Math.min(1.5, +options.wageMult)) : 1.05 + rng() * 0.2;
  // 短约略贵 / 长约略便宜身价已固定；拒签：过低周薪
  if (wageMult < 0.95 && player.ovr >= 14) {
    return { ok: false, msg: `${player.name} 拒绝过低周薪条件` };
  }
  const newWage = Math.max(player.wage || 800, Math.round(estimateWage(player) * wageMult));
  const signingBonus = Math.round(newWage * years * 0.5);
  const dealCash = clubCashAvailability(world, user, price + signingBonus);
  if (!dealCash.ok) {
    return {
      ok: false,
      msg: dealCash.reserved > 0
        ? `未承诺现金不足：转会谈判已占用 ${formatMoney(dealCash.reserved)}，转会费与签约奖需 ${formatMoney(price + signingBonus)}`
        : `资金不足：转会费 ${formatMoney(price)} + 签约奖 ${formatMoney(signingBonus)}`,
    };
  }

  recordFinanceEntry(user, -price, { category: "transfer", source: "transfer-fee", season: world.season, day: world.day });
  recordFinanceEntry(user, -signingBonus, { category: "transfer", source: "signing-bonus", season: world.season, day: world.day });
  recordFinanceEntry(from, price, { category: "transfer", source: "transfer-fee", season: world.season, day: world.day });
  from.players.splice(idx, 1);
  player.clubId = user.id;
  player.morale = Math.min(100, player.morale + 8);
  player.number = null; // 新队重新占号
  player.contractYears = years;
  player.wage = newWage;
  player._needsRenew = false;
  player.value = estimateValue(player);
  user.players.push(player);
  assignSquadNumbers(user);
  autoLineup(from);
  autoLineup(user);

  world.news.unshift({
    day: world.day,
    text: `✍️ 转会：签下 ${player.name}（${POS_LABEL[player.pos]}），转会费 ${formatMoney(price)} · ${years} 年合同 · 周薪 ${formatMoney(newWage)}`,
  });
  mediaTransfer(world, {
    type: "buy",
    playerName: player.name,
    clubName: user.name,
    otherName: from.name,
    feeText: formatMoney(price),
  });
  return {
    ok: true,
    msg: `成功签下 ${player.name}：费 ${formatMoney(price)} + 签约奖 ${formatMoney(signingBonus)} · ${years} 年 · 周薪 ${formatMoney(newWage)}`,
    price,
    years,
    wage: newWage,
  };
}

/** 预览买入合同条款（不扣款） */
export function previewBuyDeal(world, playerId, fromClubId, years = 3, wageMult = 1.1) {
  const user = getUserClub(world);
  const from = clubById(world, fromClubId);
  if (!from) return null;
  const player = from.players.find((p) => p.id === playerId);
  if (!player) return null;
  ensureStaff(user);
  ensureContract(player);
  const price = Math.round(player.value * (1.08) * scoutBuyMod(user));
  const y = Math.max(1, Math.min(5, +years || 3));
  const wm = Math.max(0.9, Math.min(1.5, +wageMult || 1.1));
  const newWage = Math.max(player.wage || 800, Math.round(estimateWage(player) * wm));
  const signingBonus = Math.round(newWage * y * 0.5);
  return {
    player,
    price,
    years: y,
    wageMult: wm,
    newWage,
    signingBonus,
    total: price + signingBonus,
    report: buildScoutReport(world, player, user),
  };
}

export function sellPlayer(world, playerId, options = {}) {
  if (world.sacked) return { ok: false, msg: "你已被解雇，无法操作转会" };
  const win = assertTransferOpen(world);
  if (!win.ok) return win;

  const user = getUserClub(world);
  const idx = user.players.findIndex((p) => p.id === playerId);
  if (idx < 0) return { ok: false, msg: "球员不在阵中" };
  if (user.players.length <= 14) return { ok: false, msg: "阵容过少，无法再出售" };
  const player = user.players[idx];
  if (player.loan) return { ok: false, msg: "租借球员不可出售" };
  ensureStaff(user);
  const askingFee = Math.max(
    1,
    Math.round(Number(options.askingFee) || player.value * scoutSellMod(user))
  );
  return submitSaleListing(world, playerId, { askingFee });
}

/** 球员列表（带球队信息）；division 限制同级 */
export function allPlayersWithClub(world, division = null) {
  const list = [];
  for (const club of world.clubs) {
    if (division != null && (club.division || 3) !== division) continue;
    for (const p of club.players) {
      ensurePlayerHistory(p);
      list.push({ player: p, club });
    }
  }
  return list;
}

/** 射手榜 / 助攻榜 / 门将榜 / 评分榜；division="all" 时汇总所有国内联赛。 */
export function getStatLeaders(world, division = null) {
  const user = getUserClub(world);
  const div = division === "all" ? null : division != null ? Number(division) : user?.division || 3;
  const clubsById = new Map((world.clubs || []).map((club) => [club.id, club]));
  const all = allPlayersWithClub(world, null)
    .map((entry) => {
      const { player, club } = entry;
      ensureLeagueStats(player, club.division, club.id);
      const stats = div == null ? player.stats : player.leagueStats?.[String(div)];
      if (!stats) return null;
      const statClub = stats.clubId ? clubsById.get(stats.clubId) || club : club;
      return { player, club: statClub, stats };
    })
    .filter(Boolean);

  const goals = [...all]
    .filter((x) => x.stats.goals > 0)
    .sort(
      (a, b) =>
        b.stats.goals - a.stats.goals ||
        b.stats.assists - a.stats.assists ||
        b.player.ovr - a.player.ovr
    )
    .slice(0, 20);

  const assists = [...all]
    .filter((x) => x.stats.assists > 0)
    .sort(
      (a, b) =>
        b.stats.assists - a.stats.assists ||
        b.stats.goals - a.stats.goals ||
        b.player.ovr - a.player.ovr
    )
    .slice(0, 20);

  // 门将：至少出场 1 次；优先零封，再看出场，再看失球少
  const keepers = all
    .filter((x) => x.player.pos === "GK" && x.stats.apps > 0)
    .map((x) => {
      const s = x.stats;
      const gaPerGame = s.apps ? s.goalsConceded / s.apps : 99;
      return { ...x, gaPerGame };
    })
    .sort(
      (a, b) =>
        b.stats.cleanSheets - a.stats.cleanSheets ||
        a.gaPerGame - b.gaPerGame ||
        b.stats.apps - a.stats.apps
    )
    .slice(0, 15);

  // 场均评分：至少 3 场（避免一两场高分刷榜）
  const ratings = all
    .map((x) => {
      const s = x.stats || {};
      const apps = s.apps || 0;
      const avg =
        apps > 0 && s.ratingSum > 0
          ? Math.round((s.ratingSum / apps) * 10) / 10
          : null;
      return {
        ...x,
        avgRating: avg,
        lastRating: s.lastRating ?? null,
        apps,
      };
    })
    .filter((x) => x.avgRating != null && x.apps >= 3)
    .sort(
      (a, b) =>
        b.avgRating - a.avgRating ||
        b.apps - a.apps ||
        b.player.ovr - a.player.ovr
    )
    .slice(0, 20);

  return { goals, assists, keepers, ratings };
}

export function refreshStaffMarketForUser(world) {
  return refreshStaffMarket(world, 12);
}

export function hireStaffForUser(world, candidateId) {
  const user = getUserClub(world);
  ensureStaff(user);
  ensureWorldStaff(world);
  const cand = (world.staffMarket || []).find((s) => s.id === candidateId);
  if (!cand) return { ok: false, msg: "自由身候选人不存在，请刷新市场" };
  const res = hireStaff(world, user, cand);
  if (res.ok) {
    world.news.unshift({
      day: world.day,
      text: `👔 职员：${res.msg}`,
    });
  }
  return res;
}

/** 接触他队在职职员或（备用）自由身 */
export function approachStaffForUser(world, staffId, fromClubId = null) {
  const user = getUserClub(world);
  if (!user) return { ok: false, msg: "无俱乐部" };
  const res = approachStaff(world, user.id, staffId, fromClubId);
  return res;
}

export function respondStaffApproachForUser(world, approachId, accept) {
  return resolveStaffApproach(world, approachId, accept);
}

export function fireStaffForUser(world, role) {
  const user = getUserClub(world);
  const res = fireStaff(world, user, role);
  if (res.ok) {
    world.news.unshift({
      day: world.day,
      text: `👔 ${res.msg}`,
    });
  }
  return res;
}

export {
  ensureStaff,
  ensureWorldStaff,
  ROLES,
  ensureIntl,
  ensureHonors,
  listApproachableStaff,
  pendingStaffApproaches,
  staffCompensationFee,
  staffSigningFee,
  approachStaff,
  staffTargetRating,
  processStaffMarketDay,
  processStaffContractsEndOfSeason,
  refreshStaffMarket,
};

/** 球探模糊估值区间（对方球员） */
export function scoutValueRange(world, player) {
  const user = getUserClub(world);
  ensureStaff(user);
  const r = staffRatingSafe(user, "scout");
  // rating 6–18 → 误差约 ±35% 到 ±8%
  const err = Math.max(0.06, 0.42 - (r / 20) * 0.38);
  const v = player.value || estimateValue(player);
  // 用球员 id 做稳定抖动，避免每次刷新数字乱跳
  let h = 0;
  const id = String(player.id || "");
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const bias = ((h % 1000) / 1000 - 0.5) * err * 0.5;
  const center = Math.round(v * (1 + bias));
  const lo = Math.max(50_000, Math.round(center * (1 - err) / 10_000) * 10_000);
  const hi = Math.round(center * (1 + err) / 10_000) * 10_000;
  return { lo, hi, err, rating: r };
}

export function formatScoutValue(world, player) {
  const { lo, hi, rating } = scoutValueRange(world, player);
  if (rating >= 16) return formatMoney(player.value || estimateValue(player));
  return formatMoney(lo) + "–" + formatMoney(hi);
}

export function formatScoutOvr(world, player) {
  const user = getUserClub(world);
  ensureStaff(user);
  const r = staffRatingSafe(user, "scout");
  const ovr = player.ovr || playerOverall(player);
  if (r >= 16) return String(ovr);
  const band = r >= 12 ? 1 : r >= 9 ? 2 : 3;
  return Math.max(1, ovr - band) + "–" + Math.min(20, ovr + band);
}

export function getMarketPlayers(world, posFilter = "") {
  const user = getUserClub(world);
  const list = [];
  for (const club of world.clubs) {
    if (club.id === user.id) continue;
    for (const p of club.players) {
      if (posFilter && p.pos !== posFilter) continue;
      // 只挂牌部分球员：非绝对主力
      list.push({ player: p, club });
    }
  }
  list.sort((a, b) => b.player.ovr - a.player.ovr);
  return list.slice(0, 40);
}

/*
 * P6 清理：simulateMatchLive（v1 逐分钟直播包装）已删除——
 * 用户直播由 main.js 直调 playFirstHalf/continueSecondHalf（v2 空间模拟录帧投影）。
 */

export { FORMATIONS, formatMoney, playerOverall, estimateValue };
