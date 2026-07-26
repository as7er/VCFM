/**
 * 训练短期加成系统 (v154)
 * 赛前准备影响下场比赛：战术训练、体能储备、士气激励
 */

/**
 * 确保俱乐部有训练加成对象
 */
export function ensureTrainingBoost(club) {
  if (!club.trainingBoost) {
    club.trainingBoost = {
      mode: "balanced", // balanced | attack | defense | fitness | morale
      lastChanged: 0,
      boostedMatch: null, // 记录下场比赛ID，避免重复应用
    };
  }
  return club.trainingBoost;
}

/**
 * 训练模式定义
 */
export const TRAINING_MODES = {
  balanced: {
    label: "均衡训练",
    labelEn: "Balanced Training",
    desc: "常规训练节奏，无特殊加成",
    descEn: "Standard training rhythm, no special bonuses",
    fitness: 0,
    morale: 0,
    attacking: 0,
    defending: 0,
    injury: 0,
  },
  attack: {
    label: "进攻演练",
    labelEn: "Attack Drills",
    desc: "强化进攻套路，下场比赛进攻 +5%",
    descEn: "Enhance attacking patterns, +5% attack next match",
    fitness: -2,
    morale: +1,
    attacking: +5,
    defending: 0,
    injury: +0.05, // 轻微增加受伤风险
  },
  defense: {
    label: "防守演练",
    labelEn: "Defense Drills",
    desc: "强化防守组织，下场比赛防守 +5%",
    descEn: "Enhance defensive organization, +5% defense next match",
    fitness: -2,
    morale: +1,
    attacking: 0,
    defending: +5,
    injury: +0.05,
  },
  fitness: {
    label: "体能储备",
    labelEn: "Fitness Reserve",
    desc: "恢复训练为主，下场比赛体能 +3%、伤病风险 -10%",
    descEn: "Recovery focus, +3% fitness, -10% injury risk next match",
    fitness: +3,
    morale: -1, // 枯燥的恢复训练降低士气
    attacking: 0,
    defending: 0,
    injury: -0.10,
  },
  morale: {
    label: "士气激励",
    labelEn: "Morale Boost",
    desc: "轻松训练+团建，下场比赛士气 +5",
    descEn: "Light training + team building, +5 morale next match",
    fitness: +1,
    morale: +5,
    attacking: 0,
    defending: 0,
    injury: -0.05,
  },
  setpiece: {
    label: "定位球演练",
    labelEn: "Set Piece Practice",
    desc: "角球/任意球专项训练，下场比赛定位球效率 +15%",
    descEn: "Corner/free kick drills, +15% set piece efficiency next match",
    fitness: -1,
    morale: 0,
    attacking: +2,
    defending: +2,
    setpiece: +15,
    injury: +0.02,
  },
};

/**
 * 设置训练模式
 * @param {Object} club - 俱乐部
 * @param {string} mode - 训练模式键
 * @param {number} currentDay - 当前游戏日期
 * @returns {Object} - { ok, msg }
 */
export function setTrainingMode(club, mode, currentDay) {
  if (!TRAINING_MODES[mode]) {
    return { ok: false, msg: "未知训练模式", msgEn: "Unknown training mode" };
  }

  const boost = ensureTrainingBoost(club);

  // 冷却时间：至少3天才能更改（避免频繁切换）
  const daysSinceChange = currentDay - boost.lastChanged;
  if (daysSinceChange < 3 && boost.lastChanged > 0) {
    const wait = 3 - daysSinceChange;
    return {
      ok: false,
      wait,
      msg: `训练计划需要稳定性，请等待 ${wait} 天后再调整`,
      msgEn: `Training plans need stability — wait ${wait} more day(s)`,
    };
  }

  boost.mode = mode;
  boost.lastChanged = currentDay;
  boost.boostedMatch = null; // 重置加成标记

  const modeInfo = TRAINING_MODES[mode];
  return {
    ok: true,
    msg: `训练重心已调整为：${modeInfo.label}`,
    msgEn: `Match preparation set to: ${modeInfo.labelEn}`,
  };
}

/**
 * 获取下场比赛的训练加成
 * @param {Object} club - 俱乐部
 * @param {string} matchId - 比赛ID（用于防止重复应用）
 * @returns {Object} - 加成对象
 */
export function getMatchTrainingBoost(club, matchId) {
  const boost = ensureTrainingBoost(club);
  const mode = TRAINING_MODES[boost.mode] || TRAINING_MODES.balanced;

  // 如果已经对这场比赛应用过加成，返回空加成
  if (boost.boostedMatch === matchId) {
    return TRAINING_MODES.balanced;
  }

  // 标记已应用
  boost.boostedMatch = matchId;

  return mode;
}

/**
 * 应用训练加成到球员/球队属性
 * @param {Object} player - 球员对象
 * @param {Object} boost - 训练加成对象
 * @returns {Object} - 修改后的属性快照
 */
export function applyBoostToPlayer(player, boost) {
  if (!player || !boost) return null;

  const modified = {};

  // 体能加成
  if (boost.fitness !== 0) {
    const currentFitness = player.fitness || 100;
    modified.fitness = Math.max(0, Math.min(100, currentFitness + boost.fitness));
  }

  // 士气加成
  if (boost.morale !== 0) {
    const currentMorale = player.morale || 50;
    modified.morale = Math.max(0, Math.min(100, currentMorale + boost.morale));
  }

  return modified;
}

/**
 * 计算训练加成对比赛引擎的影响
 * @param {Object} boost - 训练加成对象
 * @returns {Object} - 比赛修正器 { attackMod, defenseMod, injuryMod, setpieceMod }
 */
export function trainingBoostToMatchMods(boost) {
  if (!boost) return { attackMod: 1.0, defenseMod: 1.0, injuryMod: 1.0, setpieceMod: 1.0 };

  return {
    attackMod: 1.0 + (boost.attacking || 0) / 100,
    defenseMod: 1.0 + (boost.defending || 0) / 100,
    injuryMod: 1.0 + (boost.injury || 0),
    setpieceMod: 1.0 + (boost.setpiece || 0) / 100,
  };
}

/**
 * 赛前准备加成（比赛引擎入口）
 *
 * recomputeSides() 会在一场比赛内被多次调用（换人、战术调整、中场），
 * 因此本函数必须幂等：同一场比赛内任意次调用都返回相同结果。
 * "每场只生效一次" 的语义由 resetMatchPrepCounter() 在赛后清除标记来保证。
 *
 * @param {Object} club - 参赛俱乐部
 * @param {Object} opponent - 对手（保留参数，当前不影响加成）
 * @returns {Object} - { mode, fitness, morale, attacking, defending, setpiece, injury }
 */
export function applyMatchPrepBonus(club, opponent) {
  const boost = ensureTrainingBoost(club);
  const mode = TRAINING_MODES[boost.mode] || TRAINING_MODES.balanced;

  // 标记本场已应用的模式，赛后由 resetMatchPrepCounter 清除
  boost.boostedMatch = boost.mode;

  return {
    mode: boost.mode,
    fitness: mode.fitness || 0,
    morale: mode.morale || 0,
    attacking: mode.attacking || 0,
    defending: mode.defending || 0,
    setpiece: mode.setpiece || 0,
    injury: mode.injury || 0,
  };
}

/**
 * 赛后重置赛前准备标记，让下场比赛可以重新应用加成
 * @param {Object} club - 俱乐部
 */
export function resetMatchPrepCounter(club) {
  if (!club) return;
  const boost = ensureTrainingBoost(club);
  boost.boostedMatch = null;
}

/**
 * 获取训练模式的描述文本（用于UI）
 */
export function getTrainingModeLabel(mode, lang = "zh") {
  const modeInfo = TRAINING_MODES[mode];
  if (!modeInfo) return "未知模式";
  return lang === "en" ? modeInfo.labelEn : modeInfo.label;
}

export function getTrainingModeDesc(mode, lang = "zh") {
  const modeInfo = TRAINING_MODES[mode];
  if (!modeInfo) return "";
  return lang === "en" ? modeInfo.descEn : modeInfo.desc;
}

/**
 * 列出所有可用的训练模式（用于UI选择）
 */
export function listTrainingModes(lang = "zh") {
  return Object.keys(TRAINING_MODES).map(key => ({
    key,
    label: getTrainingModeLabel(key, lang),
    desc: getTrainingModeDesc(key, lang),
  }));
}
