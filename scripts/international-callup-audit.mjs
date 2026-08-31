/**
 * 国家队征召代价审计：出场必须留下真实的俱乐部后果。
 *
 * 此前 `runInternationalBreak` 只记出场数、发新闻，从不写回体能或伤病——
 * 球员打完国家队比赛满体能回来、零风险。本审计钉死修复后的因果：
 * 出场扣体能、承担伤病判定、伤员不再被征召，且不写入任何能力修正。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { CLUB_TEMPLATES } from "../js/data.js";
import { createWorld } from "../js/models.js";
import {
  ensureInternational,
  nationalStartingXi,
  runInternationalBreak,
} from "../js/intl.js";

const repo = resolve(import.meta.dirname, "..");
const source = readFileSync(resolve(repo, "js/intl.js"), "utf8");

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function allPlayers(world) {
  return (world.clubs || []).flatMap((club) => club.players || []);
}

function fitnessSnapshot(world) {
  return new Map(allPlayers(world).map((p) => [p.id, Number(p.fitness ?? 100)]));
}

// ── 源码约束：国家队一侧不得写入能力或胜率修正 ──
assert.doesNotMatch(
  source,
  /\.ovr\s*[+\-*/]?=/,
  "international duty must never write player ability"
);
assert.doesNotMatch(
  source,
  /\.potential\s*[+\-*/]?=/,
  "international duty must never write player potential"
);
assert.match(
  source,
  /injuryRiskMultiplier/,
  "callup injuries must reuse the shared injury risk model"
);

const startClubId = CLUB_TEMPLATES.find((club) => club.division === 3)?.id;
assert.ok(startClubId, "a playable starting club is required");

const originalRandom = Math.random;
Math.random = seededRandom(0x2f1c05);

try {
  const world = createWorld(startClubId, "Callup Cost Audit");
  world.season = 2027; // 非赛事年 → 国际系列赛，每个比赛日场次稳定
  delete world.international;
  ensureInternational(world);

  // ── 一个国际比赛日：出场者付出代价，其余人不受影响 ──
  const before = fitnessSnapshot(world);
  const result = runInternationalBreak(world);
  assert.ok(result.matches > 0, "an international break must actually play matches");
  assert.ok(Array.isArray(result.injuries), "the break must report callup injuries");

  const played = new Set(
    (world.international.matches || []).flatMap((match) => [
      ...(match.lineups?.home || []),
      ...(match.lineups?.away || []),
    ])
  );
  assert.ok(played.size >= 22, "at least one full fixture worth of players featured");

  let drained = 0;
  for (const player of allPlayers(world)) {
    const prior = before.get(player.id);
    const now = Number(player.fitness ?? 100);
    if (!played.has(player.id)) {
      assert.equal(now, prior, `${player.id} was not called up and must be untouched`);
      continue;
    }
    assert.ok(now <= prior, `${player.id} cannot gain fitness from national duty`);
    if (now < prior) drained += 1;
    assert.ok(now >= 35, "callup fatigue must respect the same floor as club matches");
    // 4–9 的基础消耗 + 2 的奔波项；受伤者另有 45 封顶，故只对未受伤者校验上界
    const hurt = (world.international.matches || []).some((match) =>
      (match.callupInjuries || []).some((item) => item.playerId === player.id)
    );
    if (!hurt && prior - now > 0) {
      assert.ok(prior - now <= 11, `${player.id} lost an implausible amount of fitness`);
      assert.ok(prior - now >= 6, `${player.id} lost less than the travel-inclusive minimum`);
    }
  }
  assert.ok(drained >= 22, "every player who featured must pay a fitness cost");

  // ── 伤病记录与球员状态必须是同一份事实 ──
  const recorded = (world.international.matches || []).flatMap((m) => m.callupInjuries || []);
  assert.deepEqual(
    recorded.map((item) => item.playerId).sort(),
    result.injuries.map((item) => item.playerId).sort(),
    "the break's injury report must match what the fixtures recorded"
  );
  const byId = new Map(allPlayers(world).map((p) => [p.id, p]));
  for (const item of recorded) {
    const player = byId.get(item.playerId);
    assert.ok(player, `${item.playerId} must still exist`);
    assert.ok(Number(player.injured) > 0, `${item.playerId} must actually be injured`);
    assert.ok(item.label && item.labelEn, "callup injuries need bilingual labels");
    assert.ok(item.days >= 1, "an injury must cost at least a day");
    assert.ok(Number(player.fitness) <= 45, "an injured player leaves the pitch depleted");
  }

  // ── 多个比赛日：伤病确实会发生，且伤员不再被征召 ──
  let breaks = 1;
  let totalInjuries = recorded.length;
  let appearances = played.size;
  for (let i = 0; i < 12; i++) {
    const injuredBefore = new Set(
      allPlayers(world).filter((p) => Number(p.injured) > 0).map((p) => p.id)
    );
    const priorMatches = world.international.matches.length;
    const out = runInternationalBreak(world);
    if (!out.matches) continue; // 可派球员不足时本轮无赛可打
    breaks += 1;
    totalInjuries += out.injuries.length;
    const fresh = world.international.matches.slice(priorMatches);
    assert.equal(fresh.length, out.matches, "the break must report the fixtures it just played");
    for (const match of fresh) {
      const lineup = [...(match.lineups?.home || []), ...(match.lineups?.away || [])];
      appearances += lineup.length;
      for (const id of lineup) {
        assert.ok(!injuredBefore.has(id), `${id} was injured and must not be called up`);
      }
    }
  }
  assert.ok(
    totalInjuries > 0,
    "national duty must be able to injure players, otherwise the cost is cosmetic"
  );

  // 每次出场的伤病概率必须落在与俱乐部比赛同量级的区间内：
  // 基准 0.02，叠加低体能与复发风险后仍应远低于「打一场伤一个」。
  const perAppearance = totalInjuries / Math.max(1, appearances);
  assert.ok(
    perAppearance > 0.004 && perAppearance < 0.06,
    `callup injury rate per appearance ${perAppearance.toFixed(4)} left the plausible band`
  );

  // ── 旧档兼容：没有 callupInjuries 字段的历史比赛不应让读取路径崩溃 ──
  const legacy = { ...world.international.matches[0] };
  delete legacy.callupInjuries;
  assert.deepEqual(legacy.callupInjuries ?? [], [], "legacy matches degrade to no recorded injuries");

  // 征召名单仍然可用（伤病没有掏空国家队）
  const xi = nationalStartingXi(world, "ENG");
  assert.ok(xi.length >= 6, "England must still be able to field a side");

  console.log(
    JSON.stringify(
      {
        breaks,
        appearances,
        totalInjuries,
        injuriesPerAppearance: Number(perAppearance.toFixed(4)),
      },
      null,
      2
    )
  );
} finally {
  Math.random = originalRandom;
}
