/** 一线队训练日程：重点 + 强度，影响恢复 / 成长 / 伤病 / 士气 */

import { playerOverall, estimateValue, estimateWage } from "./models.js";
import { ensureStaff, staffRating, coachGrowthBonus, doctorHealBonus, doctorInjuryMod } from "./staff.js";
import { trainingGrowthBonus, trainingHealBonus, trainingInjuryMod } from "./facilities.js";
import { allCompetitionFixtures } from "./cup.js";
import {
  diagnoseInjury,
  ensurePlayerInjury,
  injuryRiskMultiplier,
  processInjuryRecoveryDay,
} from "./injuries.js";
import {
  developmentGrowthMultiplier,
  developmentSharpness,
  recordPlayerDevelopment,
} from "./player-pathway.js";
import { ensurePlayerPositionProfile } from "./player-positions.js";

export const TRAINING_FOCUSES = {
  recovery: {
    key: "recovery",
    label: "恢复调整",
    desc: "优先回体能，几乎不练技术",
    fitnessMod: 1.55,
    fatigue: 0,
    injuryRisk: 0.002,
    growth: 0.01,
    morale: 1,
    attrs: [],
  },
  balanced: {
    key: "balanced",
    label: "综合训练",
    desc: "恢复与成长兼顾",
    fitnessMod: 1.0,
    fatigue: 2,
    injuryRisk: 0.008,
    growth: 0.045,
    morale: 0,
    attrs: null, // 按位置挑
  },
  fitness: {
    key: "fitness",
    label: "体能强化",
    desc: "耐力与爆发，消耗较大",
    fitnessMod: 0.75,
    fatigue: 5,
    injuryRisk: 0.016,
    growth: 0.06,
    morale: -1,
    attrs: ["stamina", "pace", "strength"],
  },
  attack: {
    key: "attack",
    label: "进攻训练",
    desc: "射门、终结、盘带",
    fitnessMod: 0.9,
    fatigue: 3,
    injuryRisk: 0.012,
    growth: 0.055,
    morale: 0,
    attrs: ["shooting", "finishing", "dribbling", "pace"],
  },
  defense: {
    key: "defense",
    label: "防守训练",
    desc: "抢断、盯人、身体对抗",
    fitnessMod: 0.9,
    fatigue: 3,
    injuryRisk: 0.012,
    growth: 0.055,
    morale: 0,
    attrs: ["tackling", "marking", "strength", "positioning"],
  },
  technical: {
    key: "technical",
    label: "技术训练",
    desc: "传球、视野、盘带",
    fitnessMod: 0.95,
    fatigue: 2,
    injuryRisk: 0.008,
    growth: 0.055,
    morale: 0,
    attrs: ["passing", "vision", "dribbling"],
  },
  goalkeeping: {
    key: "goalkeeping",
    label: "门将专项",
    desc: "门将属性优先；外场手几乎不涨",
    fitnessMod: 1.0,
    fatigue: 2,
    injuryRisk: 0.006,
    growth: 0.07,
    morale: 0,
    attrs: ["reflexes", "handling", "positioning", "kicking"],
  },
  match_prep: {
    key: "match_prep",
    label: "赛前准备",
    desc: "轻负荷 + 提士气，适合比赛日前",
    fitnessMod: 1.25,
    fatigue: 1,
    injuryRisk: 0.004,
    growth: 0.02,
    morale: 2,
    attrs: null,
  },
  youth: {
    key: "youth",
    label: "青训侧重",
    desc: "一线轻练；本周青训成长加快",
    fitnessMod: 1.15,
    fatigue: 1,
    injuryRisk: 0.004,
    growth: 0.02,
    morale: 0,
    attrs: [],
    youthGrowthMult: 1.45,
  },
};

export const TRAINING_INTENSITIES = {
  light: {
    key: "light",
    label: "轻松",
    fitnessMod: 1.2,
    fatigueMult: 0.5,
    growthMult: 0.55,
    injuryMult: 0.4,
    morale: 1,
  },
  normal: {
    key: "normal",
    label: "正常",
    fitnessMod: 1.0,
    fatigueMult: 1.0,
    growthMult: 1.0,
    injuryMult: 1.0,
    morale: 0,
  },
  hard: {
    key: "hard",
    label: "高强度",
    fitnessMod: 0.72,
    fatigueMult: 1.55,
    growthMult: 1.55,
    injuryMult: 2.1,
    morale: -1,
  },
};

const POS_ATTRS = {
  GK: ["reflexes", "handling", "positioning", "kicking"],
  DEF: ["tackling", "marking", "strength", "positioning", "stamina"],
  MID: ["passing", "vision", "stamina", "dribbling", "tackling"],
  ATT: ["shooting", "finishing", "pace", "dribbling", "strength"],
};

const DETAILED_POS_ATTRS = {
  GK: ["reflexes", "handling", "positioning", "kicking"],
  LB: ["pace", "tackling", "marking", "crossing", "stamina"],
  CB: ["tackling", "marking", "strength", "positioning", "heading"],
  RB: ["pace", "tackling", "marking", "crossing", "stamina"],
  DM: ["tackling", "marking", "positioning", "passing", "stamina"],
  CM: ["passing", "vision", "stamina", "pace", "decisions"],
  LM: ["pace", "crossing", "dribbling", "passing", "stamina"],
  RM: ["pace", "crossing", "dribbling", "passing", "stamina"],
  AM: ["vision", "passing", "dribbling", "shooting", "decisions"],
  LW: ["pace", "dribbling", "crossing", "finishing", "decisions"],
  RW: ["pace", "dribbling", "crossing", "finishing", "decisions"],
  CF: ["finishing", "shooting", "dribbling", "vision", "decisions"],
  ST: ["finishing", "shooting", "strength", "heading", "positioning"],
};

function rng() {
  return Math.random();
}
function chance(p) {
  return rng() < p;
}
function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

export function ensureTraining(club) {
  if (!club.training || typeof club.training !== "object") {
    club.training = { focus: "balanced", intensity: "normal" };
  }
  if (!TRAINING_FOCUSES[club.training.focus]) club.training.focus = "balanced";
  if (!TRAINING_INTENSITIES[club.training.intensity]) club.training.intensity = "normal";
  return club.training;
}

export function setTraining(club, { focus, intensity } = {}) {
  const t = ensureTraining(club);
  if (focus && TRAINING_FOCUSES[focus]) t.focus = focus;
  if (intensity && TRAINING_INTENSITIES[intensity]) t.intensity = intensity;
  return t;
}

export function trainingSummary(club) {
  const t = ensureTraining(club);
  const f = TRAINING_FOCUSES[t.focus];
  const i = TRAINING_INTENSITIES[t.intensity];
  return {
    focus: t.focus,
    intensity: t.intensity,
    focusLabel: f.label,
    intensityLabel: i.label,
    desc: f.desc,
    line: `${f.label} · ${i.label}`,
  };
}

/** 青训周成长倍率（训练侧重青训时 >1） */
export function youthTrainingMult(club) {
  const t = ensureTraining(club);
  const f = TRAINING_FOCUSES[t.focus];
  return f.youthGrowthMult || 1;
}

function pickAttrKeys(player, focusCfg) {
  if (focusCfg.key === "goalkeeping") {
    if (player.pos !== "GK") return [];
    return focusCfg.attrs.slice();
  }
  if (Array.isArray(focusCfg.attrs) && focusCfg.attrs.length === 0) return [];
  if (focusCfg.attrs == null) {
    ensurePlayerPositionProfile(player);
    return (
      DETAILED_POS_ATTRS[player.positionProfile?.primary] ||
      POS_ATTRS[player.pos] ||
      POS_ATTRS.MID
    ).slice();
  }
  // 专项：门将只练门将项；外场手跳过纯门将属性
  if (player.pos === "GK") {
    const gk = focusCfg.attrs.filter((k) =>
      ["reflexes", "handling", "positioning", "kicking"].includes(k)
    );
    return gk.length ? gk : POS_ATTRS.GK.slice();
  }
  return focusCfg.attrs.filter((k) => !["reflexes", "handling", "kicking"].includes(k));
}

function ageGrowthFactor(age) {
  if (age == null) return 1;
  if (age <= 21) return 1.25;
  if (age <= 24) return 1.1;
  if (age <= 28) return 1.0;
  if (age <= 31) return 0.55;
  if (age <= 33) return 0.25;
  return 0.08;
}

function growFirstTeamPlayer(player, growthRate, focusCfg, context = {}) {
  if (!player || player.injured > 0) return false;
  if (!player.potential) player.potential = Math.min(20, (player.ovr || 10) + 1);
  if ((player.ovr || 0) >= player.potential) return false;

  const rate = growthRate * ageGrowthFactor(player.age);
  if (!chance(rate)) return false;

  const keys = pickAttrKeys(player, focusCfg).filter((k) => (player.attrs?.[k] || 0) < 20);
  if (!keys.length) return false;

  const k = keys[Math.floor(rng() * keys.length)];
  const before = Number(player.attrs[k] || 1);
  const ovrBefore = Number(player.ovr || playerOverall(player));
  player.attrs[k] = Math.min(20, (player.attrs[k] || 1) + 1);
  player.ovr = playerOverall(player);
  player.value = estimateValue(player);
  if (!player.fromYouth || player.age > 18) {
    player.wage = estimateWage(player);
  }
  if (context.record) {
    recordPlayerDevelopment(player, {
      season: context.world?.season,
      day: context.world?.day,
      type: "training",
      source: "first-team-training",
      changes: [{ attribute: k, before, after: player.attrs[k] }],
      ovrBefore,
      ovrAfter: player.ovr,
      reason: `${focusCfg.label}与${context.intensity?.label || "正常"}强度训练见效`,
      reasonEn: `${focusCfg.key} focus and ${context.intensity?.key || "normal"} intensity produced improvement`,
      details: {
        focus: focusCfg.key,
        intensity: context.intensity?.key || null,
        coachRating: context.coachRating ?? null,
        growthRate: Math.round(growthRate * ageGrowthFactor(player.age) * 1000) / 1000,
        ageFactor: ageGrowthFactor(player.age),
        matchSharpness: Number(context.matchSharpness || 0),
      },
    });
  }
  return true;
}

/**
 * AI：按平均体能 / 是否临近比赛日自动调训练
 * nextMatchDays: 距下一场自己比赛的天数，未知则 null
 */
export function autoPickTraining(club, nextMatchDays = null) {
  ensureStaff(club);
  const players = club.players || [];
  if (!players.length) return ensureTraining(club);

  const fit =
    players.reduce((s, p) => s + (p.fitness || 70), 0) / players.length;
  const injured = players.filter((p) => p.injured > 0).length;

  let focus = "balanced";
  let intensity = "normal";

  if (fit < 62 || injured >= 3) {
    focus = "recovery";
    intensity = "light";
  } else if (nextMatchDays != null && nextMatchDays <= 1) {
    focus = "match_prep";
    intensity = "light";
  } else if (nextMatchDays != null && nextMatchDays <= 3) {
    focus = "match_prep";
    intensity = "normal";
  } else if (fit > 88 && chance(0.35)) {
    focus = pickWeighted([
      ["attack", 1],
      ["defense", 1],
      ["fitness", 1],
      ["technical", 1],
    ]);
    intensity = chance(0.4) ? "hard" : "normal";
  } else if (fit < 75) {
    focus = "recovery";
    intensity = "normal";
  }

  return setTraining(club, { focus, intensity });
}

function average(values, fallback = 0) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : fallback;
}

function attrAverage(players, keys, positions = null) {
  const pool = positions ? players.filter((player) => positions.includes(player.pos)) : players;
  const values = [];
  for (const player of pool) {
    for (const key of keys) values.push(Number(player.attrs?.[key] || 0));
  }
  return average(values, 10);
}

function nextFixtureForClub(world, clubId) {
  return [
    ...(world.fixtures || []),
    ...allCompetitionFixtures(world),
  ]
    .filter((fixture) =>
      !fixture.played &&
      (fixture.home === clubId || fixture.away === clubId) &&
      Number(fixture.day || 0) >= Number(world.day || 0)
    )
    .sort((a, b) => Number(a.day || 0) - Number(b.day || 0))[0] || null;
}

/** Build a deterministic recommendation using the assistant coach and current squad state. */
export function assistantTrainingPlan(world, club) {
  ensureStaff(club);
  ensureTraining(club);
  const players = club.players || [];
  const available = players.filter((player) => !(player.injured > 0));
  const sample = available.length ? available : players;
  const coach = club.staff?.coach;
  const coachRating = Number(coach?.rating || 8);
  const avgFitness = Math.round(average(sample.map((player) => Number(player.fitness ?? 70)), 70));
  const avgMorale = Math.round(average(sample.map((player) => Number(player.morale ?? 70)), 70));
  const injured = players.filter((player) => player.injured > 0).length;
  const lowFitness = sample.filter((player) => Number(player.fitness ?? 70) < 65).length;
  const nextFixture = nextFixtureForClub(world, club.id);
  const daysToMatch = nextFixture ? Math.max(0, Number(nextFixture.day || 0) - Number(world.day || 0)) : null;

  const scores = {
    attack: attrAverage(sample, ["shooting", "finishing", "dribbling", "pace"], ["ATT", "MID"]),
    defense: attrAverage(sample, ["tackling", "marking", "positioning", "strength"], ["DEF", "MID"]),
    technical: attrAverage(sample, ["passing", "vision", "dribbling"], ["MID", "ATT"]),
    goalkeeping: attrAverage(sample, ["reflexes", "handling", "positioning", "kicking"], ["GK"]),
    fitness: attrAverage(sample, ["stamina", "pace", "strength"]),
  };
  const weakestFocus = Object.entries(scores).sort((a, b) => a[1] - b[1])[0]?.[0] || "balanced";
  const developmentPlayers = players.filter((player) =>
    player.age <= 21 && Number(player.potential || player.ovr || 0) >= Number(player.ovr || 0) + 2
  ).length;

  let focus = "balanced";
  let intensity = "normal";
  let prepMode = "balanced";
  let reasonKey = "balanced";

  if (avgFitness < 65 || injured >= 3 || lowFitness >= 5) {
    focus = "recovery";
    intensity = "light";
    prepMode = "fitness";
    reasonKey = "recovery";
  } else if (daysToMatch != null && daysToMatch <= 1) {
    focus = "match_prep";
    intensity = "light";
    prepMode = avgFitness < 78 ? "fitness" : avgMorale < 58 ? "morale" : "setpiece";
    reasonKey = "imminent";
  } else if (daysToMatch != null && daysToMatch <= 3) {
    focus = "match_prep";
    intensity = avgFitness < 76 ? "light" : "normal";
    prepMode = avgFitness < 76 ? "fitness" : avgMorale < 58 ? "morale" : "setpiece";
    reasonKey = "matchPrep";
  } else if (avgFitness < 76 || injured >= 2) {
    focus = "recovery";
    intensity = avgFitness < 70 ? "light" : "normal";
    prepMode = "fitness";
    reasonKey = "fitness";
  } else if (avgMorale < 52) {
    focus = "balanced";
    intensity = "light";
    prepMode = "morale";
    reasonKey = "morale";
  } else if (coachRating >= 14 && developmentPlayers >= 6 && (daysToMatch == null || daysToMatch >= 5)) {
    focus = "youth";
    intensity = "normal";
    reasonKey = "youth";
  } else if (coachRating >= 10) {
    focus = weakestFocus;
    reasonKey = "weakness";
    if (coachRating >= 15 && avgFitness >= 88 && injured === 0 && lowFitness === 0 && (daysToMatch == null || daysToMatch >= 5)) {
      intensity = "hard";
    }
  }

  if (prepMode === "balanced" && nextFixture) {
    const opponentId = nextFixture.home === club.id ? nextFixture.away : nextFixture.home;
    const opponent = world.clubs?.find((item) => item.id === opponentId);
    const ownOvr = average(sample.map((player) => Number(player.ovr || 0)), 0);
    const opponentOvr = average((opponent?.players || []).map((player) => Number(player.ovr || 0)), ownOvr);
    prepMode = opponentOvr > ownOvr + 1 ? "defense" : ownOvr > opponentOvr + 1 ? "attack" : "setpiece";
  }

  const reasons = {
    recovery: ["多名球员体能告急或正在伤停，先降低负荷并恢复。", "Several players are fatigued or injured, so workload is reduced for recovery."],
    imminent: ["比赛就在明天，避免额外消耗并集中演练比赛内容。", "The next match is tomorrow, so the squad avoids extra load and rehearses match situations."],
    matchPrep: ["比赛临近，训练转向赛前准备并控制体能消耗。", "With a match approaching, training shifts to preparation while controlling fatigue."],
    fitness: ["阵容体能储备偏低，恢复优先于技术负荷。", "Squad fitness is below target, so recovery takes priority over technical load."],
    morale: ["阵容士气偏低，采用轻负荷并加入团队激励。", "Squad morale is low, so the plan uses a light workload and team-building work."],
    youth: ["队内有较多具备成长空间的年轻球员，本周期侧重发展。", "Several young players have room to develop, so this cycle prioritizes development."],
    weakness: ["赛程允许专项训练，助教选择了阵容数据中最薄弱的环节。", "The schedule allows specialist work, so the assistant targets the squad's weakest measured area."],
    balanced: ["当前体能、士气与赛程较稳定，维持综合训练。", "Fitness, morale and schedule are stable, so the squad keeps a balanced programme."],
  };

  return {
    focus,
    intensity,
    prepMode,
    reason: reasons[reasonKey][0],
    reasonEn: reasons[reasonKey][1],
    metrics: { avgFitness, avgMorale, injured, lowFitness, daysToMatch, developmentPlayers },
  };
}

function pickWeighted(pairs) {
  const total = pairs.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [k, w] of pairs) {
    r -= w;
    if (r <= 0) return k;
  }
  return pairs[0][0];
}

function nextMatchDaysByClub(world) {
  const nextDays = new Map();
  const currentDay = world.day || 0;
  const fixtures = [...(world.fixtures || []), ...allCompetitionFixtures(world)];
  for (const f of fixtures) {
    if (f.played) continue;
    const d = (f.day || 0) - currentDay;
    if (d < 0) continue;
    for (const clubId of [f.home, f.away]) {
      if (!clubId) continue;
      const best = nextDays.get(clubId);
      if (best == null || d < best) nextDays.set(clubId, d);
    }
  }
  return nextDays;
}

/**
 * 每日训练结算：体能 / 伤病 / 士气；每周属性成长
 * 用户队保留其设置；AI 队自动微调
 */
export function processTrainingDay(world) {
  const logs = [];
  const nextMatchDays = nextMatchDaysByClub(world);

  for (const club of world.clubs || []) {
    ensureStaff(club);
    ensureTraining(club);

    const isUser = club.id === world.userClubId;
    if (!isUser) {
      autoPickTraining(club, nextMatchDays.get(club.id) ?? null);
    }

    const t = ensureTraining(club);
    const focus = TRAINING_FOCUSES[t.focus];
    const inten = TRAINING_INTENSITIES[t.intensity];
    const coach = staffRating(club, "coach");
    const healBase =
      (5 + doctorHealBonus(club) + trainingHealBonus(club)) *
      focus.fitnessMod *
      inten.fitnessMod;
    // 教练略提升恢复效率
    const heal = healBase * (0.95 + coach / 20 * 0.1);
    const fatigue = focus.fatigue * inten.fatigueMult;
    const injuryP =
      focus.injuryRisk *
      inten.injuryMult *
      doctorInjuryMod(club) *
      trainingInjuryMod(club);
    const moraleDelta = (focus.morale || 0) + (inten.morale || 0);

    let grewNames = [];
    let injuredNames = [];
    let recoveredNames = [];

    for (const p of club.players || []) {
      ensurePlayerInjury(p);
      if (p.injured > 0) {
        // 伤员：只做恢复向处理，不强制高强度疲劳
        const restHeal = heal * 1.1 + Math.floor(rng() * 3);
        // 体能始终存整数，避免 85.84239999999998% 这种浮点展示
        p.fitness = Math.round(clamp((p.fitness || 50) + restHeal * 0.6, 25, 100));
        const recovery = processInjuryRecoveryDay(p, {
          doctorBonus: doctorHealBonus(club),
          facilityBonus: trainingHealBonus(club),
          random: rng,
        });
        if (isUser && recovery.recovered) recoveredNames.push(p.name);
        continue;
      }

      // 伤愈后仍有短暂复出观察期；每日递减，但期间训练/比赛复发风险更高。
      processInjuryRecoveryDay(p, { random: rng });

      const delta = heal + Math.floor(rng() * 4) - fatigue;
      p.fitness = Math.round(clamp((p.fitness || 80) + delta, 30, 100));

      if (moraleDelta !== 0 && chance(0.35)) {
        p.morale = Math.round(clamp((p.morale || 70) + moraleDelta, 20, 100));
      }

      // 高强度 + 低体能 → 训练伤
      const risk = injuryP * (p.fitness < 55 ? 1.6 : 1) * injuryRiskMultiplier(p);
      if (chance(risk)) {
        const injury = diagnoseInjury(p, {
          cause: "training",
          day: world.day,
          season: world.season,
          random: rng,
        });
        p.fitness = Math.round(Math.min(p.fitness, 55));
        if (isUser) injuredNames.push(`${p.name}（${injury.label}·${injury.totalDays}天）`);
      }
    }

    // 每周：一线队属性成长（教练 + 训练重点）
    if (world.day % 7 === 0) {
      const developmentPlan = isUser && club.delegation?.development === "staff"
        ? club.delegation.developmentPlan
        : null;
      const playerFocus = new Map(
        (developmentPlan?.focusPlayers || []).map((item) => [item.id, item.focus])
      );
      for (const p of club.players || []) {
        const growthFocus = TRAINING_FOCUSES[playerFocus.get(p.id)] || focus;
        const baseGrowthRate =
          growthFocus.growth * inten.growthMult +
          coachGrowthBonus(club) +
          trainingGrowthBonus(club);
        const matchSharpness = developmentSharpness(world, p);
        const growthRate = baseGrowthRate * developmentGrowthMultiplier(world, p);
        if (growFirstTeamPlayer(p, growthRate, growthFocus, {
          world,
          club,
          intensity: inten,
          coachRating: coach,
          matchSharpness,
          record: isUser,
        })) {
          if (isUser) grewNames.push(p.name);
        }
      }
      if (isUser && grewNames.length) {
        const show = grewNames.slice(0, 4).join("、");
        const more = grewNames.length > 4 ? ` 等 ${grewNames.length} 人` : "";
        const focusLabel = developmentPlan
          ? `教练培养计划·${TRAINING_FOCUSES[developmentPlan.focus]?.label || focus.label}`
          : focus.label;
        logs.push({
          day: world.day,
          text: `🏋️ 训练见效：${show}${more} 属性小幅提升（${focusLabel}·${inten.label}）`,
        });
      }
    }

    if (isUser && injuredNames.length) {
      logs.push({
        day: world.day,
        text: `⚠️ 训练受伤：${injuredNames.slice(0, 3).join("、")}${
          injuredNames.length > 3 ? " 等" : ""
        }（建议降低强度或改恢复）`,
      });
    }
    if (isUser && recoveredNames.length) {
      logs.push({
        day: world.day,
        text: `✅ 伤愈复训：${recoveredNames.slice(0, 3).join("、")}${
          recoveredNames.length > 3 ? " 等" : ""
        }进入复出观察期，短期内应控制出场负荷`,
      });
    }
  }

  for (const n of logs) {
    world.news.unshift(n);
  }
  return logs;
}
