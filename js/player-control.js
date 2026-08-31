/** Continuous body orientation and ball-control facts for the spatial engine. */

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function value(attrs, key, fallback = 0.55) {
  return clamp(attrs?.[key] ?? fallback, 0.05, 1);
}

export function angleDelta(from, to) {
  let delta = Number(to || 0) - Number(from || 0);
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

export function moveAngleToward(from, to, maxStep) {
  const delta = angleDelta(from, to);
  if (Math.abs(delta) <= maxStep) return from + delta;
  return from + Math.sign(delta) * maxStep;
}

function blendHeadings(weightedHeadings) {
  let x = 0;
  let y = 0;
  for (const [heading, weight] of weightedHeadings) {
    if (!Number.isFinite(heading) || weight <= 0) continue;
    x += Math.cos(heading) * weight;
    y += Math.sin(heading) * weight;
  }
  return Math.atan2(y, x);
}

/** Derived only from visible player attributes; it is not an extra ability roll. */
export function bodyControlProfile(attrs = {}) {
  const pace = value(attrs, "pace");
  const dribbling = value(attrs, "dribbling");
  const passing = value(attrs, "passing");
  const decisions = value(attrs, "decisions");
  const vision = value(attrs, "vision");
  const strength = value(attrs, "strength");
  const stamina = value(attrs, "stamina");
  const physical = value(attrs, "physical", (strength + stamina + pace) / 3);
  const firstTouch = clamp(
    dribbling * 0.42 + passing * 0.28 + decisions * 0.2 + vision * 0.1,
    0.12,
    0.96
  );
  const agility = clamp(
    pace * 0.34 + dribbling * 0.36 + decisions * 0.18 + stamina * 0.12,
    0.12,
    0.96
  );
  const balance = clamp(
    strength * 0.38 + physical * 0.24 + dribbling * 0.2 + agility * 0.18,
    0.12,
    0.96
  );
  return Object.freeze({ firstTouch, agility, balance });
}

function normalizedFoot(foot) {
  return foot === "left" || foot === "both" ? foot : "right";
}

function arrivalFoot(heading, incomingVx, incomingVy) {
  if (Math.hypot(incomingVx, incomingVy) < 0.01) return null;
  const sourceHeading = Math.atan2(-incomingVy, -incomingVx);
  const rightX = -Math.sin(heading);
  const rightY = Math.cos(heading);
  const sourceX = Math.cos(sourceHeading);
  const sourceY = Math.sin(sourceHeading);
  return sourceX * rightX + sourceY * rightY >= 0 ? "right" : "left";
}

export function firstTouchPlan({
  playerX = 50,
  playerY = 50,
  heading = 0,
  incomingVx = 0,
  incomingVy = 0,
  incomingSpeedMps = 0,
  attackDirection = -1,
  preferredFoot = "right",
  attrs = {},
  pressure = 0,
  escapeHeading = null,
  aerial = false,
} = {}) {
  const profile = bodyControlProfile(attrs);
  const decisions = value(attrs, "decisions");
  const preferred = normalizedFoot(preferredFoot);
  const naturalForward = attackDirection < 0 ? -Math.PI / 2 : Math.PI / 2;
  const faceSource = Math.hypot(incomingVx, incomingVy) > 0.01
    ? Math.atan2(-incomingVy, -incomingVx)
    : heading;
  const desiredHeading = blendHeadings([
    [naturalForward, 0.46 + decisions * 0.08],
    [faceSource, 0.36],
    [heading, 0.18],
    [escapeHeading, clamp(pressure, 0, 1) * 0.32],
  ]);
  const incomingFoot = arrivalFoot(heading, incomingVx, incomingVy);
  const foot = preferred === "both"
    ? incomingFoot || (Math.sin(desiredHeading - heading) >= 0 ? "right" : "left")
    : incomingFoot && incomingFoot !== preferred && incomingSpeedMps > 8
      ? incomingFoot
      : preferred;
  const weakFoot = preferred !== "both" && foot !== preferred;
  const turn = Math.abs(angleDelta(heading, desiredHeading));
  const duration = clamp(
    0.14 +
      incomingSpeedMps * 0.004 +
      turn * (0.035 + (1 - profile.agility) * 0.045) +
      clamp(pressure, 0, 1) * (0.05 + (1 - profile.balance) * 0.05) +
      (weakFoot ? 0.07 : 0) +
      (aerial ? 0.12 : 0) -
      profile.firstTouch * 0.05,
    0.12,
    0.56
  );
  const footSign = foot === "left" ? -1 : 1;
  const front = 1.4;
  const lateral = 0.24 * footSign;
  const rightX = -Math.sin(desiredHeading);
  const rightY = Math.cos(desiredHeading);
  return Object.freeze({
    ...profile,
    foot,
    weakFoot,
    desiredHeading,
    duration,
    targetX: playerX + Math.cos(desiredHeading) * front + rightX * lateral,
    targetY: playerY + Math.sin(desiredHeading) * front + rightY * lateral,
  });
}

export function ballActionPreparation({
  heading = 0,
  targetX = 50,
  targetY = 50,
  playerX = 50,
  playerY = 50,
  preferredFoot = "right",
  controlFoot = null,
  attrs = {},
  action = "pass",
} = {}) {
  const profile = bodyControlProfile(attrs);
  const targetHeading = Math.atan2(targetY - playerY, targetX - playerX);
  const turn = Math.abs(angleDelta(heading, targetHeading));
  const preferred = normalizedFoot(preferredFoot);
  const weakFoot = preferred !== "both" && controlFoot && controlFoot !== preferred;
  const turnRate = 6 + profile.agility * 5;
  const delay = clamp(
    (turn / turnRate) * (0.45 + (1 - profile.balance) * 0.15) +
      (weakFoot ? 0.06 : 0) +
      (action === "shot" && turn > 0.55 ? 0.02 : 0),
    0,
    0.3
  );
  return Object.freeze({ ...profile, targetHeading, turn, weakFoot, delay });
}

export function shieldingMomentumAdjustment({
  closingSpeedMps = 0,
  shieldAlignment = 0,
  balance = 0.55,
} = {}) {
  const closing = clamp(closingSpeedMps / 8, -1, 1);
  const protectedBall = clamp(shieldAlignment, 0, 1);
  return clamp(
    closing * 0.055 - protectedBall * (0.025 + clamp(balance, 0, 1) * 0.055),
    -0.08,
    0.06
  );
}
