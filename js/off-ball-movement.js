const PITCH_WIDTH_METRES = 68;
const PITCH_LENGTH_METRES = 105;
const FIELD_UNITS = 100;

export const OFF_BALL_TARGET_DEFAULTS = Object.freeze({
  leaseSeconds: 1.5,
  targetChangeMetres: 5.5,
  oldTargetRemainingMetres: 2.4,
  reversalAngleRadians: Math.PI * 0.72,
  supportSpacingMetres: 1.8,
});

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function offBallDistanceMetres(a, b) {
  if (!a || !b) return Infinity;
  const dx = (finite(a.x) - finite(b.x)) * (PITCH_WIDTH_METRES / FIELD_UNITS);
  const dy = (finite(a.y) - finite(b.y)) * (PITCH_LENGTH_METRES / FIELD_UNITS);
  return Math.hypot(dx, dy);
}

function angleBetweenTargets(player, previous, candidate) {
  const oldX = (finite(previous.x) - finite(player.x)) * (PITCH_WIDTH_METRES / FIELD_UNITS);
  const oldY = (finite(previous.y) - finite(player.y)) * (PITCH_LENGTH_METRES / FIELD_UNITS);
  const newX = (finite(candidate.x) - finite(player.x)) * (PITCH_WIDTH_METRES / FIELD_UNITS);
  const newY = (finite(candidate.y) - finite(player.y)) * (PITCH_LENGTH_METRES / FIELD_UNITS);
  const oldLength = Math.hypot(oldX, oldY);
  const newLength = Math.hypot(newX, newY);
  if (oldLength < 1e-6 || newLength < 1e-6) return 0;
  return Math.acos(clamp((oldX * newX + oldY * newY) / (oldLength * newLength), -1, 1));
}

function supportOptions(candidate, player, attackDirection, spacingMetres, lateralOnly = false) {
  const lateralUnits = spacingMetres * (FIELD_UNITS / PITCH_WIDTH_METRES);
  const depthUnits = spacingMetres * 1.05 * (FIELD_UNITS / PITCH_LENGTH_METRES);
  const baseSide = finite(player.baseX, player.x) < 49
    ? -1
    : finite(player.baseX, player.x) > 51
      ? 1
      : Math.abs(finite(player.num)) % 2 ? -1 : 1;
  const trailsPlay = player.role === "MID" || player.role === "DEF";
  const depthSide = trailsPlay ? -attackDirection : attackDirection;
  const lateralTargets = [
    { x: candidate.x + baseSide * lateralUnits, y: candidate.y },
    { x: candidate.x - baseSide * lateralUnits, y: candidate.y },
    { x: candidate.x + baseSide * lateralUnits * 1.5, y: candidate.y },
    { x: candidate.x - baseSide * lateralUnits * 1.5, y: candidate.y },
    { x: candidate.x + baseSide * lateralUnits * 2, y: candidate.y },
    { x: candidate.x - baseSide * lateralUnits * 2, y: candidate.y },
  ];
  const targets = lateralOnly ? lateralTargets : [
    ...lateralTargets.slice(0, 2),
    { x: candidate.x, y: candidate.y + depthSide * depthUnits },
    { x: candidate.x + baseSide * lateralUnits * 0.72, y: candidate.y + depthSide * depthUnits * 0.72 },
    { x: candidate.x - baseSide * lateralUnits * 0.72, y: candidate.y + depthSide * depthUnits * 0.72 },
    ...lateralTargets.slice(2),
    { x: candidate.x, y: candidate.y - depthSide * depthUnits },
  ];
  return targets.map((target) => ({
    x: clamp(target.x, 3, 97),
    y: clamp(target.y, 3, 97),
  }));
}

function minimumReservationGap(target, reservations) {
  let gap = Infinity;
  for (const reservation of reservations) {
    gap = Math.min(gap, offBallDistanceMetres(target, reservation));
  }
  return gap;
}

export function resolveOffBallTarget({
  now,
  player,
  candidate,
  previous = null,
  reservations = [],
  ball,
  phase,
  ownerId = null,
  attackDirection = 1,
  urgent = false,
  lateralOnly = false,
  thresholds = {},
} = {}) {
  const config = { ...OFF_BALL_TARGET_DEFAULTS, ...thresholds };
  const safeCandidate = {
    x: clamp(finite(candidate?.x, player?.x), 3, 97),
    y: clamp(finite(candidate?.y, player?.y), 3, 97),
    fsm: candidate?.fsm || "home",
    kind: candidate?.kind || null,
  };
  const sameContext = !!previous &&
    previous.phase === phase &&
    previous.ownerId === ownerId;
  const targetChanged = previous
    ? offBallDistanceMetres(previous, safeCandidate) >= config.targetChangeMetres
    : false;
  const oldTargetRemaining = previous
    ? offBallDistanceMetres(player, previous)
    : 0;
  const reversal = previous
    ? angleBetweenTargets(player, previous, safeCandidate) >= config.reversalAngleRadians
    : false;
  const leaseActive = sameContext && finite(now) < finite(previous?.until, -Infinity);
  const holdPrevious = !urgent && leaseActive && targetChanged && reversal &&
    oldTargetRemaining >= config.oldTargetRemainingMetres;

  if (holdPrevious) {
    return {
      x: previous.x,
      y: previous.y,
      fsm: previous.fsm || safeCandidate.fsm,
      kind: previous.kind || safeCandidate.kind,
      decision: "held",
      setAt: previous.setAt,
      until: previous.until,
      phase,
      ownerId,
      ball: { x: finite(ball?.x), y: finite(ball?.y) },
    };
  }

  let target = { x: safeCandidate.x, y: safeCandidate.y };
  let decision = previous ? "updated" : "new";
  const activeReservations = safeCandidate.fsm === "support"
    ? reservations.filter((reservation) =>
        reservation &&
        reservation.playerId !== player?.id &&
        reservation.fsm === "support" &&
        reservation.phase === phase &&
        reservation.ownerId === ownerId
      )
    : [];
  if (
    activeReservations.length &&
    minimumReservationGap(target, activeReservations) < config.supportSpacingMetres
  ) {
    const options = supportOptions(target, player || {}, attackDirection, config.supportSpacingMetres, lateralOnly);
    let best = target;
    let bestGap = minimumReservationGap(target, activeReservations);
    let bestDetour = Infinity;
    for (const option of options) {
      const gap = minimumReservationGap(option, activeReservations);
      const detour = offBallDistanceMetres(target, option);
      const hasSpacing = gap >= config.supportSpacingMetres - 0.01;
      if (hasSpacing) {
        best = option;
        break;
      }
      if (
        gap > bestGap + 0.01 ||
        (Math.abs(gap - bestGap) <= 0.01 && detour < bestDetour)
      ) {
        best = option;
        bestGap = gap;
        bestDetour = detour;
      }
    }
    target = best;
    decision = "layered";
  }

  return {
    x: target.x,
    y: target.y,
    fsm: safeCandidate.fsm,
    kind: safeCandidate.kind,
    decision,
    setAt: finite(now),
    until: finite(now) + config.leaseSeconds,
    phase,
    ownerId,
    ball: { x: finite(ball?.x), y: finite(ball?.y) },
  };
}

export function supportTargetSpacingSummary(targets = []) {
  let minimumGapMetres = Infinity;
  let crowdedPairs = 0;
  for (let left = 0; left < targets.length; left++) {
    for (let right = left + 1; right < targets.length; right++) {
      if (targets[left]?.team !== targets[right]?.team) continue;
      const gap = offBallDistanceMetres(targets[left], targets[right]);
      minimumGapMetres = Math.min(minimumGapMetres, gap);
      if (gap < OFF_BALL_TARGET_DEFAULTS.supportSpacingMetres) crowdedPairs++;
    }
  }
  return {
    minimumGapMetres: Number.isFinite(minimumGapMetres) ? minimumGapMetres : null,
    crowdedPairs,
  };
}
