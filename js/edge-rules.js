// 比赛边缘规则的纯判定：只读取空间、球权和已有球员事实。

export const EDGE_RESTART_TYPES = Object.freeze({
  DIRECT_FREE_KICK: "freekick",
  INDIRECT_FREE_KICK: "indirect",
});

export const ADVANTAGE_REASONS = Object.freeze({
  FORWARD_SPACE: "forward-space",
  GOAL_THREAT: "goal-threat",
  PRESSURE_RELIEF: "pressure-relief",
});

export const VAR_INCIDENTS = Object.freeze({
  GOAL: "goal",
  PENALTY: "penalty",
});

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * 判定犯规后是否应让比赛继续。
 * forwardProgress 使用场地坐标单位，goalDistance 使用米，pressure 为 0..1。
 * 这里不读取比分、球队强弱或任何结果修正，只使用犯规瞬间的空间事实。
 */
export function advantageDecision({
  inPenaltyArea = false,
  ownerTeam = null,
  foulTeam = null,
  forwardProgress = 0,
  goalDistance = Infinity,
  pressure = 1,
  touchline = false,
  phase = "open-play",
} = {}) {
  const progress = Math.max(0, Number(forwardProgress) || 0);
  const distance = Number.isFinite(Number(goalDistance))
    ? Number(goalDistance)
    : Infinity;
  const pressureValue = clamp(Number(pressure) || 0, 0, 1);
  const eligible =
    !inPenaltyArea &&
    ownerTeam &&
    foulTeam &&
    ownerTeam !== foulTeam &&
    phase === "open-play" &&
    !touchline;
  if (!eligible) {
    return { play: false, window: 0, reason: null };
  }

  const hasForwardSpace = progress >= 1.8 && pressureValue < 0.82;
  const threatensGoal = distance < 30 && pressureValue < 0.9;
  const escapedPressure = progress >= 1.1 && pressureValue < 0.48;
  if (!hasForwardSpace && !threatensGoal && !escapedPressure) {
    return { play: false, window: 0, reason: null };
  }
  const reason = hasForwardSpace
    ? ADVANTAGE_REASONS.FORWARD_SPACE
    : threatensGoal
      ? ADVANTAGE_REASONS.GOAL_THREAT
      : ADVANTAGE_REASONS.PRESSURE_RELIEF;
  return {
    play: true,
    window: 2.2,
    reason,
  };
}

/** 脚下有意回传给本方门将，并由门将获得球权时，构成回传违例候选。 */
export function backpassViolation({ passer, goalkeeper, pass } = {}) {
  const deliberateFootPass =
    pass?.deliberate !== false &&
    !pass?.cross &&
    !pass?.through &&
    pass?.kind !== "header";
  const violation =
    !!passer &&
    !!goalkeeper &&
    passer.team === goalkeeper.team &&
    passer.id !== goalkeeper.id &&
    passer.role !== "GK" &&
    goalkeeper.role === "GK" &&
    deliberateFootPass;
  return {
    violation,
    reason: violation ? "deliberate-foot-pass-to-goalkeeper" : null,
  };
}

/**
 * 门将面对有意脚下回传时通常用脚处理；贴身压力和较差判断只提高低频误用手概率。
 * roll 由比赛固定种子提供，阈值只读取公开球员属性与空间压力。
 */
export function goalkeeperBackpassControl({
  pressure = 0,
  decisions = 0.55,
  positioning = 0.55,
  roll = 1,
} = {}) {
  const pressureValue = clamp(Number(pressure) || 0, 0, 1);
  const judgement = clamp(
    (Number(decisions) || 0.55) * 0.62 + (Number(positioning) || 0.55) * 0.38,
    0,
    1
  );
  const handlingRisk = clamp(
    0.004 + pressureValue * 0.032 + Math.max(0, 0.58 - judgement) * 0.035,
    0.004,
    0.045
  );
  const rollValue = Number(roll);
  return {
    useHands: (Number.isFinite(rollValue) ? clamp(rollValue, 0, 1) : 1) < handlingRisk,
    handlingRisk,
  };
}

/**
 * 空间手球接触判定。只有球在真实上半身高度经过外场球员控制半径时才有资格；
 * 风险读取来球速度、身体暴露、传中/射门事实和判断属性，禁区内收手更明显。
 */
export function handballContactDecision({
  ballHeight = 0,
  ballSpeedMps = 0,
  bodyExposure = 0,
  decisions = 0.55,
  intendedReceive = false,
  isCross = false,
  isShot = false,
  inPenaltyArea = false,
  roll = 1,
} = {}) {
  const height = Number(ballHeight) || 0;
  const speed = Math.max(0, Number(ballSpeedMps) || 0);
  const eligible = height >= 0.85 && height <= 2.2 && speed >= 5.5;
  if (!eligible) {
    return { handball: false, risk: 0, eligible: false, reason: null };
  }
  const heightRisk = clamp(1 - Math.abs(height - 1.35) / 0.85, 0, 1);
  const speedRisk = clamp((speed - 5.5) / 20, 0, 1);
  const exposure = clamp(Number(bodyExposure) || 0, 0, 1);
  const judgement = clamp(Number(decisions) || 0.55, 0, 1);
  let risk =
    0.002 +
    heightRisk *
      (0.005 +
        speedRisk * 0.009 +
        exposure * 0.006 +
        (isCross ? 0.003 : 0) +
        (isShot ? 0.006 : 0));
  risk *= 1.08 - judgement * 0.2;
  if (intendedReceive) risk *= 0.72;
  // 禁区内抑制：本模型只读球高、来球速度与身体朝向暴露，**不建模手臂位置**，
  // 因此无法区分「自然摆臂」与「主动扩大身体」。该系数原为 0.42，是在后卫被推到
  // 离球 3.5 米外时定的；恢复禁区盯人后后卫贴到 2.05 米，禁区内手球点球由 0
  // 升到 0.25/场（手球总数未变，只是发生地点从禁区外挪进禁区）。按实测压回原
  // 量级，代偿的是模型缺少手臂位置这一项，不是现实里禁区手球更不易判罚。
  if (inPenaltyArea) risk *= 0.14;
  risk = clamp(risk, 0.001, inPenaltyArea ? 0.016 : 0.036);
  const rollValue = Number(roll);
  return {
    handball: (Number.isFinite(rollValue) ? clamp(rollValue, 0, 1) : 1) < risk,
    risk,
    eligible: true,
    reason: "upper-body-ball-path",
  };
}

/**
 * VAR 只复核可审查事件的已存空间证据，不按比分或球队身份决定结果。
 * 引擎的正常判罚通常会被确认；构造/导入的场上判罚与证据冲突时才推翻。
 */
export function varReviewDecision({
  incident,
  onFieldDecision,
  evidence = {},
} = {}) {
  if (incident === VAR_INCIDENTS.GOAL) {
    const supported =
      !!evidence.crossedGoalLine &&
      !!evidence.insidePosts &&
      !!evidence.underBar &&
      !evidence.offside;
    const onFieldAwarded = onFieldDecision === "goal";
    return {
      reviewable: true,
      decision: supported === onFieldAwarded ? "confirmed" : "overturned",
      finalDecision: supported ? "goal" : "no-goal",
      reason: supported ? "goal-line-evidence" : evidence.offside ? "offside-evidence" : "goal-line-contradiction",
    };
  }
  if (incident === VAR_INCIDENTS.PENALTY) {
    const supported =
      !!evidence.inPenaltyArea &&
      ["foul", "handball"].includes(evidence.offenceType);
    const onFieldAwarded = onFieldDecision === "penalty";
    return {
      reviewable: true,
      decision: supported === onFieldAwarded ? "confirmed" : "overturned",
      finalDecision: supported ? "penalty" : "no-penalty",
      reason: supported ? `${evidence.offenceType}-in-penalty-area` : "penalty-area-contradiction",
    };
  }
  return {
    reviewable: false,
    decision: null,
    finalDecision: onFieldDecision || null,
    reason: null,
  };
}

/**
 * Referee perception for penalty-area classification. The exact spatial
 * evidence remains authoritative for VAR; this only models the on-field view,
 * which is less reliable close to the painted line or for obscured handballs.
 */
export function penaltyOnFieldDecision({
  exactInPenaltyArea = false,
  boundaryDistance = Infinity,
  offenceType = "foul",
  bodyExposure = 1,
  roll = 1,
} = {}) {
  const distance = Math.max(0, Number(boundaryDistance) || 0);
  const rollValue = clamp(Number.isFinite(Number(roll)) ? Number(roll) : 1, 0, 1);
  if (exactInPenaltyArea) {
    const lineUncertainty = clamp(1 - distance / 3, 0, 1);
    const visibilityPenalty = offenceType === "handball"
      ? (1 - clamp(Number(bodyExposure) || 0, 0, 1)) * 0.12
      : 0;
    const missRisk = clamp(0.05 + lineUncertainty * 0.32 + visibilityPenalty, 0.05, 0.48);
    return {
      onFieldDecision: rollValue < missRisk ? "no-penalty" : "penalty",
      missRisk,
      reason: lineUncertainty > 0 ? "penalty-area-line-view" : "official-view",
    };
  }
  if (distance > 1.4) {
    return { onFieldDecision: "no-penalty", missRisk: 0, reason: "clear-outside" };
  }
  const lineUncertainty = clamp(1 - distance / 1.4, 0, 1);
  const falseAwardRisk = clamp(0.03 + lineUncertainty * 0.2, 0.03, 0.23);
  return {
    onFieldDecision: rollValue < falseAwardRisk ? "penalty" : "no-penalty",
    missRisk: falseAwardRisk,
    reason: "penalty-area-line-view",
  };
}

/** 用于回放/审计的前进距离：按球队进攻方向把纵向位移转成正值。 */
export function forwardProgress({ fromY = 0, toY = 0, attackDirection = -1 } = {}) {
  return Math.max(0, (Number(toY) - Number(fromY)) * (Number(attackDirection) || -1));
}
