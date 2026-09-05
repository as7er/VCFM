function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// 与 css/style.css 耦合的镜头几何常量（改 CSS 必须同步；推导与验证见
// scripts/_camera-framing-geometry-probe.mjs 文件头）：
export const CAMERA_WIDTH_FRAC = 0.89; // .mp-camera left/right 5.5% → 宽 = 场宽 89%
export const GRASS_MARGIN = 2; // .mp-grass inset -2% → 草皮边缘在相机坐标 -2 / 102

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

  // Number()||50 会把合法的 0 当缺省（球贴上/左边线时镜头误判为居中），用 isFinite 判缺省。
  const nx = Number(ball?.x);
  const ny = Number(ball?.y);
  const x = clamp(Number.isFinite(nx) ? nx : 50, 0, 100);
  const y = clamp(Number.isFinite(ny) ? ny : 50, 0, 100);
  const ox = (x - 50) / 50;
  const oy = (y - 50) / 50;
  const deep = y < 22 || y > 78;
  const tight = mode === "box" || goalSequence;
  // 2026-09-05（表现层 A2）：旧版 follow 档 scale 1.015~1.055 ≈ 永远全球场，
  // 球员只有 ~20px；且位移钳制 (±1.45%) 是按 scale≈1.03 手调的，放大倍率一改
  // 镜头就跟不动球。这里把两件事按真实 CSS 几何参数化：
  //   · 真实 CSS：transform-origin 50% 50%（中心），.mp-camera 左右内缩 5.5%、
  //     垂直满高，.mp-grass inset -2%。可见窗口中心 = 50 − t/s，窗口半宽
  //     横轴 50/(0.89s)、纵轴 50/s（相机窄于场，同倍率下横轴看到的内容更多）。
  //   · 居中球 → t = −50·s·o；窗口钳回草皮 [-2,102] → |t| ≤ 52s − 50/0.89（横）、
  //     52s − 50（纵）。球到边线时镜头钉在草皮边缘，不露场外。
  //   · full/tactical 档保持 scale 1 不动（战术总览仍可用）。
  //   （本段首版推导误用「scale 关于左上原点」模型且横纵同钳，实机球会被推离
  //     屏心 ~11%、贴左/上边线时出画——几何探针证伪后重推，见上述探针。）
  const scale = tight
    ? (boosted ? 1.5 : 1.45)
    : boosted
      ? 1.34
      : deep
        ? 1.3
        : 1.28;
  const spanH = Math.max(0, (50 + GRASS_MARGIN) * scale - 50 / CAMERA_WIDTH_FRAC);
  const spanV = Math.max(0, (50 + GRASS_MARGIN) * scale - 50);
  const kx = clamp(-50 * scale * ox, -spanH, spanH);
  const ky = clamp(-50 * scale * oy, -spanV, spanV);
  return { x: kx, y: ky, scale };
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
  // 与 cameraFraming 同款 falsy-zero 修复：||50 会把合法的 0 当缺省。
  const bx = Number(ball.x);
  const by = Number(ball.y);
  const ballY = clamp(Number.isFinite(by) ? by : 50, 0, 100);
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
    pan: clamp(((Number.isFinite(bx) ? bx : 50) - 50) / 85, -0.5, 0.5),
  };
}
