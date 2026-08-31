function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export const CAMERA_PRESETS = Object.freeze({
  full: Object.freeze({ id: "full", label: "Full pitch" }),
  tv: Object.freeze({ id: "tv", label: "TV" }),
  tactical: Object.freeze({ id: "tactical", label: "Tactical" }),
});

export const CAMERA_PRESET_IDS = Object.freeze(Object.keys(CAMERA_PRESETS));

export function normalizeCameraPreset(value) {
  return CAMERA_PRESETS[value] ? value : "tv";
}

/**
 * Return only presentational camera targets. The simulation remains in
 * full-pitch coordinates, so changing this value can never affect play.
 */
export function cameraFraming({ preset, ball, mode = "follow", goalSequence = false, boosted = false } = {}) {
  const selected = normalizeCameraPreset(preset);
  if (selected === "full" || selected === "tactical") {
    return { x: 0, y: 0, scale: 1 };
  }

  const x = clamp(Number(ball?.x) || 50, 0, 100);
  const y = clamp(Number(ball?.y) || 50, 0, 100);
  const ox = (x - 50) / 50;
  const oy = (y - 50) / 50;
  const deep = y < 22 || y > 78;
  const tight = mode === "box" || goalSequence;
  if (tight) {
    return {
      x: clamp(-ox * 1.6, -2.4, 2.4),
      y: clamp(-oy * 1.8, -2.8, 2.8),
      scale: boosted ? 1.075 : 1.055,
    };
  }
  return {
    x: clamp(-ox * (deep ? 0.92 : 0.5), -1.45, 1.45),
    y: clamp(-oy * (deep ? 1.05 : 0.45), -1.55, 1.55),
    scale: boosted ? 1.055 : deep ? 1.035 : 1.015,
  };
}

/** Keep the ball and decisive movement readable without drawing cues for all 22 players. */
export function visualCuePolicy({ preset, speed = 0, hasBall = false, focused = false, pressing = false, diving = false } = {}) {
  const selected = normalizeCameraPreset(preset);
  const sprinting = speed >= 0.9;
  return {
    drawStructure: selected === "tactical",
    drawTrail: !hasBall && (selected === "tv" || focused) && sprinting,
    drawArrow: hasBall || focused || (selected === "tv" && pressing && speed >= 0.62),
    drawPossessionRing: hasBall,
    drawDiveTrail: diving,
  };
}

/**
 * A 0..1 crowd-bed target from pre-match context and live spatial facts.
 * It is intentionally presentation-only: no score, decision or probability reads it back.
 */
export function crowdAtmosphere({
  context = {},
  ball = {},
  ownerTeam = null,
  minute = 0,
  homeGoals = 0,
  awayGoals = 0,
  reaction = 0,
} = {}) {
  const attendance = clamp(Number(context.attendanceRatio) || 0.84, 0.35, 1);
  const importance = clamp(Number(context.importance) || 0, 0, 1);
  const ballY = clamp(Number(ball.y) || 50, 0, 100);
  const lead = Math.abs((Number(homeGoals) || 0) - (Number(awayGoals) || 0));
  const attackingDepth = ownerTeam === "home"
    ? clamp((52 - ballY) / 38, 0, 1)
    : ownerTeam === "away"
      ? clamp((ballY - 48) / 38, 0, 1)
      : 0;
  const occasion = (context.derby ? 0.14 : 0) + (context.bigMatch ? 0.1 : 0) + (context.knockout ? 0.08 : 0);
  const lateTension = minute >= 72 && lead <= 1 ? clamp((minute - 72) / 18, 0, 1) * 0.15 : 0;
  const intensity = clamp(0.12 + attendance * 0.31 + importance * 0.1 + occasion + attackingDepth * 0.18 + lateTension + reaction, 0.06, 1);
  return {
    intensity,
    pan: clamp(((Number(ball.x) || 50) - 50) / 85, -0.5, 0.5),
  };
}
