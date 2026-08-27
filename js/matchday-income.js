/**
 * 比赛日收入的正交加成
 *
 * 德比、对手排名、争冠/保级、杯赛阶段的票房加成由 `facilities.js` 的
 * `matchdayIncome()` 独占，本模块只提供它没有覆盖的两个正交因子，
 * 由 `match.js` 的结算处一并传入。**不要在这里重新实现前者的因子**，
 * 两份实现叠加会重复计算票房。
 */

/**
 * 表现加成：主队最近战绩越好，票房越高
 * @param {Object} world - 世界状态
 * @param {string} clubId - 主队 id
 * @returns {number} 加成倍数（1.0 = 无加成）
 */
export function getFormBonus(world, clubId) {
  if (!world?.table?.[clubId]) return 1.0;

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
 * 赛季阶段加成：赛季末关键期票房走高
 * @param {Object} world - 世界状态
 * @returns {number} 加成倍数（1.0 = 无加成）
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
