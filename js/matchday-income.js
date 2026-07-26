/**
 * 比赛日收入动态化系统
 * v154: 基于表现、对手、赛事类型的收入加成
 */

/**
 * 计算比赛日收入加成（完整版）
 *
 * ⚠️ 注意：facilities.js 的 matchdayIncome() 已自行处理德比、杯赛阶段、
 * 争冠/保级加成。本函数包含同样的因子，两者叠加会重复计算。
 * 与 matchdayIncome() 配合时请改用 getFormBonus() 与 getSeasonPhaseBonus()。
 *
 * @param {Object} world - 世界状态
 * @param {Object} club - 主队
 * @param {Object} opponent - 客队
 * @param {Object} fixture - 比赛信息
 * @returns {number} - 加成倍数（1.0 = 无加成）
 */
export function calculateMatchdayBonus(world, club, opponent, fixture) {
  if (!world || !club || !opponent) return 1.0;

  let bonus = 1.0;

  // 1. 表现加成：基于最近5场战绩
  bonus *= getFormBonus(world, club.id);

  // 2. 对手质量加成：豪门来访
  bonus *= getOpponentBonus(world, club, opponent);

  // 3. 德比加成
  if (fixture?.derby || isDerby(club, opponent)) {
    bonus *= 1.25;
  }

  // 4. 争冠/保级大战加成
  if (isChampionshipClash(world, club, opponent)) {
    bonus *= 1.30;
  } else if (isRelegationBattle(world, club, opponent)) {
    bonus *= 1.30;
  }

  // 5. 杯赛加成
  if (fixture?.competition) {
    bonus *= getCupBonus(fixture.competition, fixture.round);
  }

  // 6. 赛季阶段加成：赛季末关键期
  bonus *= getSeasonPhaseBonus(world);

  // 上限：最高2.5倍（欧冠决赛级别）
  return Math.min(2.5, bonus);
}

/**
 * 表现加成：基于最近战绩
 */
export function getFormBonus(world, clubId) {
  if (!world?.table?.[clubId]) return 1.0;

  // 简化版：基于积分率
  const stats = world.table[clubId];
  if (stats.played < 3) return 1.0;

  const pointsPerGame = stats.pts / stats.played;

  // 连胜/高积分率：+15%
  if (pointsPerGame >= 2.5) return 1.15;
  // 良好表现：+8%
  if (pointsPerGame >= 2.0) return 1.08;
  // 糟糕表现：-5%
  if (pointsPerGame < 1.0) return 0.95;

  return 1.0;
}

/**
 * 对手质量加成：豪门来访吸引更多球迷
 */
function getOpponentBonus(world, club, opponent) {
  if (club.division !== opponent.division) return 1.0;

  const table = getSortedTableByDivision(world, club.division);
  if (!table || table.length === 0) return 1.0;

  const oppPos = table.findIndex(r => r.id === opponent.id) + 1;
  if (oppPos === 0) return 1.0;

  // 前3名豪门来访：+20%
  if (oppPos <= 3) return 1.20;
  // 前6名强队来访：+10%
  if (oppPos <= 6) return 1.10;

  return 1.0;
}

/**
 * 判断是否为德比
 */
function isDerby(club1, club2) {
  // 简化判断：同城市或同国家前缀
  if (!club1?.nation || !club2?.nation) return false;
  if (club1.nation !== club2.nation) return false;

  // 同国同级别视为潜在德比（真实德比应由fixture.derby标记）
  return club1.division === club2.division;
}

/**
 * 判断是否为争冠大战
 */
function isChampionshipClash(world, club1, club2) {
  if (club1.division !== club2.division) return false;

  const table = getSortedTableByDivision(world, club1.division);
  if (!table || table.length === 0) return false;

  const pos1 = table.findIndex(r => r.id === club1.id) + 1;
  const pos2 = table.findIndex(r => r.id === club2.id) + 1;

  // 双方都在前4名
  return pos1 > 0 && pos2 > 0 && pos1 <= 4 && pos2 <= 4;
}

/**
 * 判断是否为保级大战
 */
function isRelegationBattle(world, club1, club2) {
  if (club1.division !== club2.division || club1.division >= 3) return false;

  const table = getSortedTableByDivision(world, club1.division);
  if (!table || table.length === 0) return false;

  const pos1 = table.findIndex(r => r.id === club1.id) + 1;
  const pos2 = table.findIndex(r => r.id === club2.id) + 1;
  const total = table.length;
  const relegationZone = total - 2;

  // 双方都在保级区附近（倒数5名）
  return pos1 > 0 && pos2 > 0 && pos1 >= relegationZone - 2 && pos2 >= relegationZone - 2;
}

/**
 * 杯赛加成：越往后轮次加成越高
 */
function getCupBonus(competitionType, round) {
  if (!competitionType) return 1.0;

  const type = competitionType.toLowerCase();

  // 欧冠/欧联/欧协联
  if (type.includes("ucl") || type.includes("champions")) {
    if (round >= 5) return 1.50; // 半决赛/决赛
    if (round >= 4) return 1.35; // 八强
    if (round >= 3) return 1.25; // 十六强
    return 1.15; // 小组赛/附加赛
  }

  if (type.includes("europa") || type.includes("uel")) {
    if (round >= 5) return 1.40;
    if (round >= 4) return 1.30;
    if (round >= 3) return 1.20;
    return 1.10;
  }

  if (type.includes("conference") || type.includes("uecl")) {
    if (round >= 5) return 1.35;
    if (round >= 4) return 1.25;
    if (round >= 3) return 1.15;
    return 1.08;
  }

  // 国内杯赛
  if (round >= 4) return 1.40; // 决赛/半决赛
  if (round >= 3) return 1.25; // 八强
  if (round >= 2) return 1.15; // 十六强
  return 1.10;
}

/**
 * 赛季阶段加成：赛季末关键期
 */
export function getSeasonPhaseBonus(world) {
  if (!world || world.seasonOver) return 1.0;

  // 优先按赛程完成度衡量：赛季长度会随赛制调整，比绝对日期可靠
  let progress = 0;
  if (Array.isArray(world.fixtures) && world.fixtures.length) {
    progress =
      world.fixtures.filter((f) => f.played).length / world.fixtures.length;
  } else if (world.day) {
    progress = world.day / 220; // v152 标准赛季长度，无赛程时的兜底
  }

  // 赛季末最后10场（约85%+）：+10%
  if (progress >= 0.85) return 1.10;
  // 赛季末冲刺期（约70-85%）：+5%
  if (progress >= 0.70) return 1.05;

  return 1.0;
}

/**
 * 辅助函数：获取指定联赛的积分榜
 */
function getSortedTableByDivision(world, divisionId) {
  if (!world?.clubs || !world?.table) return [];

  const divClubs = world.clubs.filter(c => c.division === divisionId);

  return divClubs
    .map(c => {
      const t = world.table[c.id] || { played: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 };
      return {
        id: c.id,
        name: c.name,
        ...t,
        gd: t.gf - t.ga,
      };
    })
    .sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf);
}
