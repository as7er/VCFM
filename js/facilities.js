/**
 * 俱乐部设施：球场 / 训练基地 / 青训学院
 * 升级有建设工期，完工后生效。
 */

import { formatMoney, YOUTH_LEVELS, YOUTH_UPGRADE_COST, ensureYouthAcademy, fillYouthSquad } from "./models.js";
import { DIVISIONS } from "./data.js";
import { recordFinanceEntry } from "./finance-ledger.js";
import { clubCashAvailability } from "./cash-reservations.js";

export const FACILITY_MAX = 5;

/** 球场等级：容量、主场比赛日收入、周维护（调整：降低5级收入与提高维护成本，平衡经济） */
export const STADIUM_LEVELS = {
  1: { name: "社区球场", capacity: 4_000, matchday: 45_000, upkeep: 8_000 },
  2: { name: "区级球场", capacity: 8_000, matchday: 90_000, upkeep: 18_000 },
  3: { name: "职业球场", capacity: 15_000, matchday: 180_000, upkeep: 40_000 },
  4: { name: "现代化主场", capacity: 28_000, matchday: 350_000, upkeep: 85_000 },
  5: { name: "地标球场", capacity: 45_000, matchday: 480_000, upkeep: 180_000 },
};

/** 训练设施：成长加成、恢复加成、伤病风险系数 */
export const TRAINING_FACILITY_LEVELS = {
  1: { name: "简易训练场", growth: 0, heal: 0, injuryMod: 1.0, upkeep: 5_000 },
  2: { name: "标准训练中心", growth: 0.012, heal: 1, injuryMod: 0.92, upkeep: 15_000 },
  3: { name: "专业训练基地", growth: 0.025, heal: 2, injuryMod: 0.85, upkeep: 35_000 },
  4: { name: "高科技训练中心", growth: 0.04, heal: 3, injuryMod: 0.78, upkeep: 70_000 },
  5: { name: "世界级训练城", growth: 0.055, heal: 4, injuryMod: 0.7, upkeep: 120_000 },
};

/** 升级费用（升到该级）调整：降低4-5级成本30%，改善ROI */
export const STADIUM_UPGRADE_COST = {
  2: 3_000_000,
  3: 8_000_000,
  4: 13_000_000,
  5: 28_000_000,
};

export const TRAINING_FACILITY_COST = {
  2: 1_500_000,
  3: 4_000_000,
  4: 7_000_000,
  5: 15_000_000,
};

/** 建设天数（升到该级） */
export const BUILD_DAYS = {
  stadium: { 2: 14, 3: 21, 4: 28, 5: 35 },
  training: { 2: 10, 3: 14, 4: 21, 5: 28 },
  youth: { 2: 12, 3: 18, 4: 24, 5: 30 },
};

const LABELS = {
  stadium: "球场",
  training: "训练设施",
  youth: "青训设施",
};

export function ensureFacilities(club) {
  if (!club) return null;
  const ya = ensureYouthAcademy(club);
  if (!club.facilities || typeof club.facilities !== "object") {
    const tier = DIVISIONS[club.division || 3]?.tier || 3;
    club.facilities = {
      stadium: tier === 1 ? 3 : tier === 2 ? 2 : 1,
      training: tier === 1 ? 2 : 1,
      youth: ya.level || 1,
      projects: [], // { kind, from, to, finishDay, cost, name }
    };
  }
  const f = club.facilities;
  if (f.stadium == null) f.stadium = 1;
  if (f.training == null) f.training = 1;
  // 与 youth.level 双向对齐：取较高者
  if (f.youth == null) f.youth = ya.level || 1;
  if ((ya.level || 1) > f.youth) f.youth = ya.level;
  if (f.youth > (ya.level || 1)) ya.level = f.youth;
  if (!Array.isArray(f.projects)) f.projects = [];
  f.stadium = clampLv(f.stadium);
  f.training = clampLv(f.training);
  f.youth = clampLv(f.youth);
  return f;
}

function clampLv(n) {
  return Math.max(1, Math.min(FACILITY_MAX, Number(n) || 1));
}

export function facilityLevel(club, kind) {
  const f = ensureFacilities(club);
  return f?.[kind] || 1;
}

export function stadiumInfo(club) {
  const lv = facilityLevel(club, "stadium");
  return { level: lv, ...(STADIUM_LEVELS[lv] || STADIUM_LEVELS[1]) };
}

export function trainingFacilityInfo(club) {
  const lv = facilityLevel(club, "training");
  return { level: lv, ...(TRAINING_FACILITY_LEVELS[lv] || TRAINING_FACILITY_LEVELS[1]) };
}

export function youthFacilityInfo(club) {
  const lv = facilityLevel(club, "youth");
  const y = YOUTH_LEVELS[lv] || YOUTH_LEVELS[1];
  return {
    level: lv,
    name: y.name,
    capacity: y.capacity,
    intake: y.intake,
    growth: y.growth,
    upkeep: y.upkeep,
  };
}

export function isBuilding(club, kind) {
  const f = ensureFacilities(club);
  return (f.projects || []).some((p) => p.kind === kind);
}

export function getProject(club, kind) {
  const f = ensureFacilities(club);
  return (f.projects || []).find((p) => p.kind === kind) || null;
}

function upgradeCost(kind, nextLv) {
  if (kind === "stadium") return STADIUM_UPGRADE_COST[nextLv];
  if (kind === "training") return TRAINING_FACILITY_COST[nextLv];
  if (kind === "youth") return YOUTH_UPGRADE_COST[nextLv];
  return null;
}

function levelName(kind, lv) {
  if (kind === "stadium") return STADIUM_LEVELS[lv]?.name || `Lv.${lv}`;
  if (kind === "training") return TRAINING_FACILITY_LEVELS[lv]?.name || `Lv.${lv}`;
  if (kind === "youth") return YOUTH_LEVELS[lv]?.name || `Lv.${lv}`;
  return `Lv.${lv}`;
}

/**
 * 开工升级（扩建/新建看台/训练/青训）
 * world.day 用于计算完工日
 */
export function startFacilityUpgrade(world, clubId, kind) {
  if (!["stadium", "training", "youth"].includes(kind)) {
    return { ok: false, msg: "未知设施类型" };
  }
  const club = world.clubs.find((c) => c.id === clubId);
  if (!club) return { ok: false, msg: "球队不存在" };
  if (world.sacked && clubId === world.userClubId) {
    return { ok: false, msg: "你已被解雇，无法动工" };
  }

  const f = ensureFacilities(club);
  if (isBuilding(club, kind)) {
    const p = getProject(club, kind);
    return {
      ok: false,
      msg: `${LABELS[kind]}施工中（约第 ${p.finishDay} 天完工）`,
    };
  }

  const cur = f[kind] || 1;
  if (cur >= FACILITY_MAX) return { ok: false, msg: `${LABELS[kind]}已满级` };

  const next = cur + 1;
  const cost = upgradeCost(kind, next);
  if (cost == null) return { ok: false, msg: "无法升级" };
  const cash = clubCashAvailability(world, club, cost);
  if (!cash.ok) {
    return {
      ok: false,
      msg: cash.reserved > 0
        ? `未承诺现金不足：转会谈判已占用 ${formatMoney(cash.reserved)}，升级需要 ${formatMoney(cost)}`
        : `资金不足，需要 ${formatMoney(cost)}`,
    };
  }

  const days = (BUILD_DAYS[kind] && BUILD_DAYS[kind][next]) || 14;
  recordFinanceEntry(club, -cost, { category: "facility", source: "facility-upgrade", season: world.season, day: world.day });

  const verb =
    kind === "stadium"
      ? next >= 4
        ? "新建"
        : "扩建"
      : kind === "training"
        ? next >= 4
          ? "新建"
          : "升级"
        : "升级";

  const project = {
    kind,
    from: cur,
    to: next,
    finishDay: (world.day || 1) + days,
    cost,
    name: levelName(kind, next),
    verb,
  };
  f.projects.push(project);

  const label = LABELS[kind];
  world.news.unshift({
    day: world.day,
    text: `🏗️ ${club.name} ${verb}${label}：目标「${project.name}」（Lv.${next}），工期 ${days} 天，花费 ${formatMoney(cost)}`,
  });

  return {
    ok: true,
    msg: `已开工${verb}${label} → ${project.name}（${days} 天后完工，${formatMoney(cost)}）`,
    project,
  };
}

/** 兼容旧青训升级按钮：走设施工期系统 */
export function upgradeYouthAcademy(world, clubId) {
  return startFacilityUpgrade(world, clubId, "youth");
}

/**
 * 每日：检查完工
 */
export function processFacilityDay(world) {
  if (!world || world.seasonOver) return;
  for (const club of world.clubs || []) {
    const f = ensureFacilities(club);
    if (!f.projects.length) continue;
    const remain = [];
    for (const p of f.projects) {
      if ((world.day || 0) < p.finishDay) {
        remain.push(p);
        continue;
      }
      // 完工
      f[p.kind] = p.to;
      if (p.kind === "youth") {
        const ya = ensureYouthAcademy(club);
        ya.level = p.to;
        fillYouthSquad(
          club,
          Math.min(ya.players.length + 1, (YOUTH_LEVELS[p.to] || YOUTH_LEVELS[1]).capacity)
        );
      }
      if (club.id === world.userClubId) {
        world.news.unshift({
          day: world.day,
          text: `✅ 设施竣工：${LABELS[p.kind]}「${p.name}」已投入使用（Lv.${p.to}）`,
        });
      }
    }
    f.projects = remain;
  }
}

/** 周维护：球场 + 训练 + 青训（青训在 processYouthDay 已扣一份，这里只扣球场和训练，避免双扣） */
export function facilityWeeklyUpkeep(club) {
  ensureFacilities(club);
  const st = stadiumInfo(club);
  const tr = trainingFacilityInfo(club);
  return (st.upkeep || 0) + (tr.upkeep || 0);
}

/**
 * 主场比赛日收入（含上座波动 + 动态加成）
 * @param {Object} club - 俱乐部对象
 * @param {Object} options - 比赛选项
 * @param {boolean} options.isCup - 是否杯赛
 * @param {boolean} options.isDerby - 是否德比（同城/同级别对手）
 * @param {boolean} options.isRelegationBattle - 是否保级大战
 * @param {boolean} options.isTitleRace - 是否争冠关键战
 * @param {string} options.cupStage - 杯赛阶段 ('final', 'semi', 'quarter', 'r16', 'group')
 * @param {number} options.winStreak - 连胜场次
 * @param {number} options.opponentStrength - 对手实力（用于判断强强对话）
 * @param {number} options.formBonus - 表现加成（1.0 = 无加成）
 * @param {number} options.seasonPhaseBonus - 赛季阶段加成（1.0 = 无加成）
 */
export function matchdayIncome(club, options = {}) {
  const {
    isCup = false,
    isDerby = false,
    isRelegationBattle = false,
    isTitleRace = false,
    cupStage = null,
    winStreak = 0,
    opponentStrength = 0,
    formBonus = 1.0,
    seasonPhaseBonus = 1.0,
    random = Math.random,
  } = options;

  const st = stadiumInfo(club);
  let base = st.matchday || 40_000;
  const factors = [];

  // 基础收入调整
  if (isCup) {
    base *= 0.75;
    factors.push({ key: "cupBase", multiplier: 0.75 });
  }

  // 上座率：基础 75%–100%
  let fillMin = 0.75;
  let fillMax = 1.0;

  // 动态上座率加成
  if (isDerby) {
    fillMin = 0.92; // 德比战几乎满座
    fillMax = 1.0;
  } else if (isRelegationBattle) {
    fillMin = 0.85; // 保级生死战
    fillMax = 0.98;
  } else if (isTitleRace) {
    fillMin = 0.88; // 争冠关键战
    fillMax = 1.0;
  } else if (winStreak >= 5) {
    fillMin = 0.82; // 连胜吸引球迷
    fillMax = 0.98;
  } else if (winStreak >= 3) {
    fillMin = 0.78;
    fillMax = 0.95;
  }

  // 强强对话（对手实力接近）
  const clubStrength = club.strength || 50;
  if (opponentStrength > 0 && Math.abs(clubStrength - opponentStrength) < 5 && opponentStrength >= 60) {
    fillMin = Math.min(1.0, fillMin + 0.08); // 强强对话吸引球迷
  }

  const fill = fillMin + random() * (fillMax - fillMin);
  const capacity = st.capacity || 0;
  const attendance = Math.max(0, Math.round(capacity * fill));
  const gateIncome = Math.round(base * fill);
  let income = gateIncome;

  // 杯赛阶段加成
  if (isCup && cupStage) {
    const cupBonus = {
      final: 1.6,      // 决赛
      semi: 1.4,       // 半决赛
      quarter: 1.25,   // 八强
      r16: 1.15,       // 十六强
      group: 1.0,      // 小组赛
    };
    const multiplier = cupBonus[cupStage] || 1.0;
    income = Math.round(income * multiplier);
    if (multiplier !== 1) factors.push({ key: `cup-${cupStage}`, multiplier });
  }

  // 德比额外加成（票价溢价）
  if (isDerby) {
    income = Math.round(income * 1.25);
    factors.push({ key: "derby", multiplier: 1.25 });
  }

  // 保级/争冠紧张氛围加成
  if (isRelegationBattle) {
    income = Math.round(income * 1.3);
    factors.push({ key: "relegation", multiplier: 1.3 });
  } else if (isTitleRace) {
    income = Math.round(income * 1.2);
    factors.push({ key: "title", multiplier: 1.2 });
  }

  // 表现加成（最近战绩）- v154新增
  if (formBonus !== 1.0) {
    income = Math.round(income * formBonus);
    factors.push({ key: "form", multiplier: formBonus });
  }

  // 赛季阶段加成（赛季末冲刺期）- v154新增
  if (seasonPhaseBonus !== 1.0) {
    income = Math.round(income * seasonPhaseBonus);
    factors.push({ key: "season", multiplier: seasonPhaseBonus });
  }

  // 联赛级别微调
  const tier = DIVISIONS[club.division || 3]?.tier || 3;
  if (tier === 1) {
    income = Math.round(income * 1.25);
    factors.push({ key: "tier1", multiplier: 1.25 });
  } else if (tier === 2) {
    income = Math.round(income * 1.1);
    factors.push({ key: "tier2", multiplier: 1.1 });
  }

  // 所有加成都必须受同一上限约束，避免顶级联赛系数在封顶后再次放大。
  const incomeCap = Math.round(gateIncome * 2.5);
  const capped = income > incomeCap;
  income = Math.min(income, incomeCap);
  if (capped) factors.push({ key: "cap", multiplier: null });

  // options.detail === true 时返回明细（上座/容量），默认仍返回金额以兼容旧调用
  if (options.detail) {
    return {
      income,
      attendance,
      capacity,
      fill: Math.round(fill * 1000) / 10,
      stadiumName: st.name || "",
      gateBase: gateIncome,
      factors,
      capped,
    };
  }
  return income;
}

export function trainingGrowthBonus(club) {
  return trainingFacilityInfo(club).growth || 0;
}

export function trainingHealBonus(club) {
  return trainingFacilityInfo(club).heal || 0;
}

export function trainingInjuryMod(club) {
  return trainingFacilityInfo(club).injuryMod ?? 1;
}

export function facilitySummaryLine(club) {
  const st = stadiumInfo(club);
  const tr = trainingFacilityInfo(club);
  const y = youthFacilityInfo(club);
  const building = (ensureFacilities(club).projects || [])
    .map((p) => `${LABELS[p.kind]}施工中`)
    .join(" · ");
  const base = `球场 Lv.${st.level} · 训练 Lv.${tr.level} · 青训 Lv.${y.level}`;
  return building ? `${base}（${building}）` : base;
}

/**
 * 联赛转播分成 + 名次奖金（赛季末、升降级前按最终积分榜结算）。
 * 现实口径：转播约一半均分、一半按名次；奖金随名次递减；顶级联赛体量远大于次级。
 *
 * @param {number} position 1-based 名次
 * @param {number} nTeams 联赛队数
 * @param {number} tier 联赛层级 1|2|3
 * @returns {{ broadcast: number, prize: number, total: number }}
 */
export function leagueEndSeasonPayout(position, nTeams = 18, tier = 2) {
  const n = Math.max(2, Math.round(Number(nTeams) || 18));
  const pos = Math.max(1, Math.min(n, Math.round(Number(position) || n)));
  const t = Math.max(1, Math.min(3, Math.round(Number(tier) || 2)));

  // 联赛转播总池 / 名次奖金总池（与开局资金、门票量级对齐）
  const TV_POT = { 1: 54_000_000, 2: 12_000_000, 3: 3_200_000 };
  const PRIZE_POT = { 1: 10_000_000, 2: 2_400_000, 3: 700_000 };
  const tvPot = TV_POT[t] || TV_POT[2];
  const prizePot = PRIZE_POT[t] || PRIZE_POT[2];

  // 转播：50% 均分 + 50% 名次权重（第1名权重 n … 末名 1）
  const equalShare = tvPot * 0.5 / n;
  const weight = n - pos + 1;
  const weightSum = (n * (n + 1)) / 2;
  const meritShare = (tvPot * 0.5) * (weight / weightSum);
  const broadcast = Math.round(equalShare + meritShare);

  // 名次奖金：权重平方，冠军显著更高（接近现实）
  const prizeWeight = weight * weight;
  let prizeWeightSum = 0;
  for (let i = 1; i <= n; i++) prizeWeightSum += i * i;
  const prize = Math.round(prizePot * (prizeWeight / prizeWeightSum));

  return { broadcast, prize, total: broadcast + prize };
}

/**
 * 为世界内全部俱乐部结算赛季转播/名次奖金，写入 money 与 finance 账本。
 * 须在升降级改写 division 之前调用。
 * @returns {{ userPayout: object|null, paidClubs: number }}
 */
export function applySeasonLeagueFinance(world, getSortedTableFn) {
  if (!world?.clubs?.length || typeof getSortedTableFn !== "function") {
    return { userPayout: null, paidClubs: 0 };
  }
  let paidClubs = 0;
  let userPayout = null;
  const divIds = [
    ...new Set(
      world.clubs.map((c) => c.division).filter((d) => d != null)
    ),
  ];

  for (const divId of divIds) {
    const ranked = getSortedTableFn(world, divId) || [];
    if (!ranked.length) continue;
    const tier = DIVISIONS[divId]?.tier || 2;
    const n = ranked.length;
    const divName = DIVISIONS[divId]?.name || `联赛${divId}`;

    ranked.forEach((row, idx) => {
      const pos = idx + 1;
      const club = world.clubs.find((c) => c.id === row.id);
      if (!club) return;
      const pay = leagueEndSeasonPayout(pos, n, tier);
      if (pay.total <= 0) return;
      recordFinanceEntry(club, pay.broadcast, { category: "broadcast", source: "season-broadcast", season: world.season, day: world.day });
      recordFinanceEntry(club, pay.prize, { category: "prize", source: "season-prize", season: world.season, day: world.day });
      if (!club.finance || typeof club.finance !== "object") club.finance = {};
      club.finance.lastBroadcastPayout = pay.broadcast;
      club.finance.lastPrizePayout = pay.prize;
      club.finance.lastPrizePos = pos;
      club.finance.lastPrizeDivision = divId;
      club.finance.lastPrizeDivisionName = divName;
      club.finance.lastLeaguePayoutSeason = world.season;
      paidClubs++;
      if (club.id === world.userClubId) {
        userPayout = {
          club,
          pos,
          divName,
          tier,
          ...pay,
        };
      }
    });
  }
  return { userPayout, paidClubs };
}

export { LABELS as FACILITY_LABELS };
