/**
 * AI阵容平衡检查系统
 *
 * 为AI转会提供智能决策，避免出现8后卫3前锋等失衡情况。
 * 根据现实足球俱乐部的阵容配置标准设计。
 */

/**
 * 理想阵容配置（基于现实足球俱乐部标准）
 * 一线队通常22-25人，各位置比例相对稳定
 */
const SQUAD_TARGETS = {
  GK: { min: 2, ideal: 2, max: 3 },
  DEF: { min: 5, ideal: 7, max: 9 },
  MID: { min: 5, ideal: 7, max: 9 },
  ATT: { min: 3, ideal: 5, max: 7 },
};

/**
 * 分析阵容平衡状况
 * @param {object[]} players - 球员数组
 * @returns {object} 阵容分析结果
 */
export function analyzeSquadBalance(players) {
  const counts = {
    GK: players.filter((p) => p.pos === "GK").length,
    DEF: players.filter((p) => p.pos === "DEF").length,
    MID: players.filter((p) => p.pos === "MID").length,
    ATT: players.filter((p) => p.pos === "ATT").length,
  };

  const total = players.length;
  const issues = [];
  const priorities = [];

  // 检查各位置状态
  for (const [pos, target] of Object.entries(SQUAD_TARGETS)) {
    const count = counts[pos];

    if (count < target.min) {
      issues.push({ pos, type: "shortage", severity: "high", count });
      priorities.push({ pos, action: "buy", priority: 10 - count });
    } else if (count < target.ideal) {
      issues.push({ pos, type: "below_ideal", severity: "medium", count });
      priorities.push({ pos, action: "buy", priority: 5 });
    } else if (count > target.max) {
      issues.push({ pos, type: "excess", severity: "high", count });
      priorities.push({ pos, action: "sell", priority: count - target.max });
    } else if (count > target.ideal) {
      issues.push({ pos, type: "above_ideal", severity: "low", count });
      priorities.push({ pos, action: "sell", priority: 2 });
    }
  }

  // 按优先级排序
  priorities.sort((a, b) => b.priority - a.priority);

  return {
    counts,
    total,
    issues,
    priorities,
    isBalanced: issues.filter((i) => i.severity === "high").length === 0,
  };
}

/**
 * 判断是否可以卖出该位置的球员
 * @param {object[]} players - 当前阵容
 * @param {string} pos - 要卖出球员的位置
 * @returns {boolean}
 */
export function canSellPosition(players, pos) {
  const analysis = analyzeSquadBalance(players);
  const count = analysis.counts[pos];
  const target = SQUAD_TARGETS[pos];

  // 低于最小值，绝对不能卖
  if (count <= target.min) return false;

  // 刚好等于理想值，不优先卖（除非其他位置严重短缺需要腾出空间）
  if (count === target.ideal) {
    const hasUrgentNeed = analysis.issues.some(
      (issue) => issue.severity === "high" && issue.type === "shortage"
    );
    return hasUrgentNeed && analysis.total >= 25;
  }

  // 高于理想值，可以卖
  return true;
}

/**
 * 判断是否需要买入该位置的球员
 * @param {object[]} players - 当前阵容
 * @param {string} pos - 要买入球员的位置
 * @returns {boolean}
 */
export function shouldBuyPosition(players, pos) {
  const analysis = analyzeSquadBalance(players);
  const count = analysis.counts[pos];
  const target = SQUAD_TARGETS[pos];

  // 已达到或超过上限，不再买
  if (count >= target.max) return false;

  // 低于理想值，应该买
  return count < target.ideal;
}

/**
 * 获取卖人优先级列表（优先卖过剩位置的球员）
 * @param {object[]} players - 当前阵容
 * @returns {string[]} 位置优先级数组，如 ['DEF', 'MID', 'ATT', 'GK']
 */
export function getSellPriorities(players) {
  const analysis = analyzeSquadBalance(players);
  const counts = analysis.counts;
  const targets = SQUAD_TARGETS;

  // 计算每个位置的过剩程度
  const positions = ["GK", "DEF", "MID", "ATT"];
  const scored = positions.map((pos) => {
    const count = counts[pos];
    const ideal = targets[pos].ideal;
    const max = targets[pos].max;
    const min = targets[pos].min;

    // 不能卖到低于最小值
    if (count <= min) return { pos, score: -1000 };

    // 过剩程度：超过理想值越多，优先级越高
    const excess = count - ideal;
    return { pos, score: excess };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.pos);
}

/**
 * 获取买人优先级列表（优先补强短缺位置）
 * @param {object[]} players - 当前阵容
 * @returns {string[]} 位置优先级数组，如 ['ATT', 'MID', 'DEF', 'GK']
 */
export function getBuyPriorities(players) {
  const analysis = analyzeSquadBalance(players);
  const counts = analysis.counts;
  const targets = SQUAD_TARGETS;

  const positions = ["GK", "DEF", "MID", "ATT"];
  const scored = positions.map((pos) => {
    const count = counts[pos];
    const ideal = targets[pos].ideal;
    const max = targets[pos].max;

    // 已达上限，不再买
    if (count >= max) return { pos, score: -1000 };

    // 短缺程度：低于理想值越多，优先级越高
    const shortage = ideal - count;
    return { pos, score: shortage };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.pos);
}

/**
 * 为AI选择最佳卖出球员（考虑位置平衡）
 * @param {object[]} players - 球队阵容
 * @param {function} filterFn - 额外的过滤条件（如门将至少保留1人）
 * @returns {object|null} 最佳卖出球员
 */
export function selectPlayerToSell(players, filterFn = null) {
  const sellPriorities = getSellPriorities(players);

  // 按位置优先级尝试选择球员
  for (const pos of sellPriorities) {
    if (!canSellPosition(players, pos)) continue;

    const candidates = players
      .filter((p) => p.pos === pos)
      .filter((p) => !filterFn || filterFn(p, players));

    if (candidates.length === 0) continue;

    // 在该位置中选择最弱的球员
    candidates.sort((a, b) => {
      const sa = (a.ovr || 0) - (a.age >= 32 ? 3 : 0) + ((a.potential || a.ovr) < a.ovr ? -1 : 0);
      const sb = (b.ovr || 0) - (b.age >= 32 ? 3 : 0) + ((b.potential || b.ovr) < b.ovr ? -1 : 0);
      return sa - sb;
    });

    return candidates[0];
  }

  return null;
}

/**
 * 为AI选择最需要补强的位置
 * @param {object[]} players - 球队阵容
 * @param {number} money - 可用资金
 * @returns {string|null} 最需要补强的位置，如 'ATT'，或 null
 */
export function selectPositionToBuy(players, money) {
  // 阵容已满（27人上限）
  if (players.length >= 27) return null;

  // 资金不足基本操作
  if (money < 150000) return null;

  const buyPriorities = getBuyPriorities(players);

  for (const pos of buyPriorities) {
    if (shouldBuyPosition(players, pos)) {
      return pos;
    }
  }

  return null;
}
