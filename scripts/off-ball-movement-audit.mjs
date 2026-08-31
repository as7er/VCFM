import assert from "node:assert/strict";

import {
  OFF_BALL_TARGET_DEFAULTS,
  offBallDistanceMetres,
  resolveOffBallTarget,
  supportTargetSpacingSummary,
} from "../js/off-ball-movement.js";

const player = { id: "p8", num: 8, role: "MID", x: 50, y: 50, baseX: 50, baseY: 55 };
const context = {
  now: 1,
  player,
  candidate: { x: 25, y: 50, fsm: "support" },
  ball: { x: 51, y: 50 },
  phase: "stable-possession",
  ownerId: "p10",
  attackDirection: -1,
};
const previous = {
  x: 75,
  y: 50,
  fsm: "support",
  decision: "new",
  setAt: 0,
  until: OFF_BALL_TARGET_DEFAULTS.leaseSeconds,
  phase: context.phase,
  ownerId: context.ownerId,
  ball: { x: 50, y: 50 },
  playerId: player.id,
  team: "home",
};

const held = resolveOffBallTarget({ ...context, previous });
assert.equal(held.decision, "held", "unfinished opposite run should keep its leased target");
assert.equal(held.x, previous.x);

const ballMoved = resolveOffBallTarget({ ...context, previous, ball: { x: 65, y: 50 } });
assert.equal(ballMoved.decision, "held", "the same carrier moving must not cancel a committed run");

const expired = resolveOffBallTarget({ ...context, now: previous.until + 0.01, previous });
assert.notEqual(expired.decision, "held", "an expired route must allow a new support target");

const changedOwner = resolveOffBallTarget({ ...context, previous, ownerId: "p9" });
assert.notEqual(changedOwner.decision, "held", "new ball carrier must allow a new support route");

const urgent = resolveOffBallTarget({ ...context, previous, urgent: true });
assert.notEqual(urgent.decision, "held", "explicit combinations must override hysteresis");

const first = resolveOffBallTarget({
  ...context,
  previous: null,
  candidate: { x: 56, y: 42, fsm: "support" },
});
const reservation = { ...first, playerId: "p7", team: "home" };
const layered = resolveOffBallTarget({
  ...context,
  player: { ...player, id: "p6", num: 6 },
  previous: { ...first, playerId: "p6", team: "home" },
  candidate: { x: first.x, y: first.y, fsm: "support" },
  reservations: [reservation],
});
assert.equal(layered.decision, "layered");
assert.ok(
  offBallDistanceMetres(layered, first) >= OFF_BALL_TARGET_DEFAULTS.supportSpacingMetres - 0.01,
  "support targets should occupy distinct passing lanes"
);

const spacing = supportTargetSpacingSummary([
  { ...first, team: "home" },
  { ...layered, team: "home" },
]);
assert.equal(spacing.crowdedPairs, 0);
assert.ok(spacing.minimumGapMetres >= OFF_BALL_TARGET_DEFAULTS.supportSpacingMetres - 0.01);

console.log(JSON.stringify({
  leaseSeconds: OFF_BALL_TARGET_DEFAULTS.leaseSeconds,
  layeredGapMetres: Number(spacing.minimumGapMetres.toFixed(2)),
}, null, 2));
console.log("Off-ball movement audit passed: target leases preserve committed runs while support reservations create distinct layers");
