/** Team shape phases derived from the existing public tactical instructions. */

export const TEAM_SHAPE_PHASES = Object.freeze({
  IN_POSSESSION: "in-possession",
  OUT_OF_POSSESSION: "out-of-possession",
  ATTACKING_TRANSITION: "attacking-transition",
  DEFENSIVE_TRANSITION: "defensive-transition",
});

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function level(tactics, key, fallback = 3) {
  return clamp(tactics?.[key] ?? fallback, 1, 5);
}

/**
 * Geometry and transition timing only. These values never change ability,
 * action success, xG, score, or any other result after the spatial fact.
 */
export function teamShapeProfile(tactics = {}) {
  const style = tactics.style || "balanced";
  const pressing = level(tactics, "pressing");
  const tempo = level(tactics, "tempo");
  const width = level(tactics, "width");

  const styleAttackDepth =
    style === "attack" ? 3 :
      style === "counter" ? 0 :
        style === "defend" ? -2.5 :
          style === "possession" ? -1 : 0;
  const styleWidth =
    style === "attack" ? 0.03 :
      style === "possession" ? -0.04 :
        style === "counter" ? -0.02 : 0;
  const supportPull =
    style === "possession" ? 0.16 :
      style === "defend" ? 0.1 :
        style === "balanced" ? 0.06 : 0.03;

  const counterPress = pressing >= 4 && style !== "defend";
  const regroup = style === "defend" || pressing <= 2;

  return Object.freeze({
    version: 1,
    inPossession: Object.freeze({
      widthMul: clamp(1 + (width - 3) * 0.09 + styleWidth, 0.78, 1.2),
      depthShift: styleAttackDepth,
      supportPull,
    }),
    outOfPossession: Object.freeze({
      widthMul: clamp(
        1 + (width - 3) * 0.04 + (pressing >= 4 ? 0.015 : pressing <= 2 ? -0.02 : 0),
        0.88,
        1.08
      ),
    }),
    transition: Object.freeze({
      attackSeconds: clamp(
        4.7 + (tempo - 3) * 0.55 + (style === "counter" ? 2.1 : style === "attack" ? 0.8 : style === "possession" ? -0.8 : 0),
        2.8,
        8.8
      ),
      defendSeconds: clamp(
        3.2 + (pressing - 3) * 0.45 + (counterPress ? 0.5 : 0) + (regroup ? -0.3 : 0),
        2.2,
        6.5
      ),
      attackDepthShift:
        style === "counter" ? 4 :
          style === "attack" ? 3 :
            style === "possession" ? -1 :
              style === "defend" ? -2.5 : 0,
      attackWidthMul: clamp(
        1 + (width - 3) * 0.06 + (style === "counter" ? -0.05 : style === "attack" ? 0.04 : 0),
        0.82,
        1.16
      ),
      counterPress,
      regroup,
    }),
  });
}

export function teamShapePhase({
  team,
  controlTeam,
  now = 0,
  gainedAt = 0,
  lostAt = 0,
  tactics = {},
} = {}) {
  const profile = teamShapeProfile(tactics);
  if (controlTeam === team) {
    return now - gainedAt < profile.transition.attackSeconds
      ? TEAM_SHAPE_PHASES.ATTACKING_TRANSITION
      : TEAM_SHAPE_PHASES.IN_POSSESSION;
  }
  return now - lostAt < profile.transition.defendSeconds
    ? TEAM_SHAPE_PHASES.DEFENSIVE_TRANSITION
    : TEAM_SHAPE_PHASES.OUT_OF_POSSESSION;
}

function widthLabel(multiplier, lang) {
  if (multiplier >= 1.07) return lang === "en" ? "wide occupation" : "宽位占位";
  if (multiplier <= 0.91) return lang === "en" ? "compact occupation" : "紧凑占位";
  return lang === "en" ? "balanced occupation" : "均衡占位";
}

function blockLabel(tactics, lang) {
  const line = level(tactics, "defensiveLine");
  const pressing = level(tactics, "pressing");
  if (line >= 4 && pressing >= 4) return lang === "en" ? "high compact block" : "高位紧凑防守";
  if (line <= 2) return lang === "en" ? "deep compact block" : "低位紧凑防守";
  return lang === "en" ? "mid-block" : "中位防守块";
}

export function teamShapeSummary(tactics = {}, lang = "zh") {
  const profile = teamShapeProfile(tactics);
  const transition = profile.transition.counterPress
    ? (lang === "en" ? "counter-press after losing it" : "丢球后就地反抢")
    : profile.transition.regroup
      ? (lang === "en" ? "regroup after losing it" : "丢球后优先回收")
      : (lang === "en" ? "balanced recovery" : "平衡反抢与回收");
  const attackTransition = tactics.style === "counter"
    ? (lang === "en" ? "fast vertical counter" : "得球后快速纵向反击")
    : (lang === "en" ? "controlled expansion" : "得球后有序展开");

  return [
    {
      key: TEAM_SHAPE_PHASES.IN_POSSESSION,
      title: lang === "en" ? "In possession" : "持球形态",
      detail: `${widthLabel(profile.inPossession.widthMul, lang)} · ${attackTransition}`,
    },
    {
      key: TEAM_SHAPE_PHASES.OUT_OF_POSSESSION,
      title: lang === "en" ? "Out of possession" : "无球形态",
      detail: blockLabel(tactics, lang),
    },
    {
      key: "transition",
      title: lang === "en" ? "Transitions" : "攻防转换",
      detail: transition,
    },
  ];
}
