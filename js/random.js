/** Deterministic random helpers used by match simulation and replay audits. */

export function hashSeed(...parts) {
  let hash = 2166136261;
  for (const part of parts) {
    const text = String(part ?? "");
    for (let index = 0; index < text.length; index++) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    hash ^= 1249;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Mulberry32: compact, deterministic and adequate for simulation rolls. */
export function createSeededRandom(seed) {
  let state = Number(seed) >>> 0;
  const random = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  random.getState = () => state >>> 0;
  return random;
}

export function ensureMatchSeed(world, fixture) {
  if (!fixture) return hashSeed(world?.season, world?.day, "missing-fixture");
  if (fixture.matchSeed == null) {
    fixture.matchSeed = hashSeed(
      world?.season,
      fixture.day,
      fixture.id,
      fixture.home,
      fixture.away,
      fixture.competitionId || fixture.competition || "league"
    );
  }
  fixture.matchSeed = Number(fixture.matchSeed) >>> 0;
  return fixture.matchSeed;
}

export function matchRandom(world, fixture, resumeState = null) {
  return createSeededRandom(
    resumeState == null ? ensureMatchSeed(world, fixture) : Number(resumeState) >>> 0
  );
}
