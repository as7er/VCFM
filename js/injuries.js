/** Injury diagnosis, rehabilitation and return-to-play state. */

const CONTACT_INJURIES = [
  { key: "knock", label: "碰撞挫伤", labelEn: "Impact bruise", min: 2, max: 5, weight: 68, recurrence: 0.03 },
  { key: "ankle", label: "踝关节扭伤", labelEn: "Ankle sprain", min: 7, max: 16, weight: 25, recurrence: 0.12 },
  { key: "fracture", label: "轻微骨裂", labelEn: "Minor fracture", min: 24, max: 45, weight: 7, recurrence: 0.05 },
];

const FATIGUE_INJURIES = [
  { key: "tightness", label: "肌肉紧张", labelEn: "Muscle tightness", min: 2, max: 4, weight: 62, recurrence: 0.1 },
  { key: "strain", label: "肌肉拉伤", labelEn: "Muscle strain", min: 6, max: 14, weight: 32, recurrence: 0.18 },
  { key: "hamstring", label: "腿后肌拉伤", labelEn: "Hamstring strain", min: 15, max: 28, weight: 6, recurrence: 0.24 },
];

const TRAINING_INJURIES = [
  { key: "training-knock", label: "训练碰伤", labelEn: "Training knock", min: 2, max: 4, weight: 58, recurrence: 0.04 },
  { key: "training-strain", label: "训练拉伤", labelEn: "Training strain", min: 5, max: 11, weight: 38, recurrence: 0.16 },
  { key: "overuse", label: "过度使用伤", labelEn: "Overuse injury", min: 12, max: 24, weight: 4, recurrence: 0.22 },
];

function pickWeighted(items, random = Math.random) {
  const total = items.reduce((sum, item) => sum + item.weight, 0) || 1;
  let roll = random() * total;
  for (const item of items) {
    roll -= item.weight;
    if (roll <= 0) return item;
  }
  return items[items.length - 1];
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, Number(n) || 0));
}

function randomDays(def, random = Math.random) {
  return def.min + Math.floor(random() * (def.max - def.min + 1));
}

export function ensurePlayerInjury(player) {
  if (!player) return null;
  const days = Math.max(0, Math.ceil(Number(player.injured) || 0));
  if (days > 0 && (!player.injury || typeof player.injury !== "object")) {
    player.injury = {
      key: "undisclosed",
      label: "伤情待定",
      labelEn: "Undisclosed injury",
      cause: "legacy",
      totalDays: days,
      daysRemaining: days,
      recurrence: 0.06,
      occurredDay: null,
    };
  }
  if (player.injury && typeof player.injury === "object") {
    player.injury.daysRemaining = days;
  }
  if (!Array.isArray(player.injuryHistory)) player.injuryHistory = [];
  player.returnToPlayDays = Math.max(0, Math.ceil(Number(player.returnToPlayDays) || 0));
  return player.injury || null;
}

export function injuryRiskMultiplier(player) {
  ensurePlayerInjury(player);
  const returnRisk = Math.min(0.65, (player.returnToPlayDays || 0) * 0.1);
  const recent = (player.injuryHistory || []).slice(-3);
  const historyRisk = recent.reduce((sum, item) => sum + (Number(item.recurrence) || 0), 0) * 0.35;
  const currentTypeRisk = Number(player.injury?.recurrence) || 0;
  return clamp(1 + returnRisk + historyRisk + currentTypeRisk, 1, 1.85);
}

export function squadInjuryRiskMultiplier(players) {
  const available = (players || []).filter((player) => player && (player.injured || 0) <= 0);
  if (!available.length) return 1;
  const average = available.reduce((sum, player) => sum + injuryRiskMultiplier(player), 0) / available.length;
  return clamp(average, 1, 1.45);
}

export function diagnoseInjury(player, options = {}) {
  const cause = options.cause || "contact";
  const random = options.random || Math.random;
  const definitions = cause === "fatigue"
    ? FATIGUE_INJURIES
    : cause === "training"
      ? TRAINING_INJURIES
      : CONTACT_INJURIES;
  const def = pickWeighted(definitions, random);
  let days = options.days != null ? Math.max(1, Math.ceil(Number(options.days))) : randomDays(def, random);

  // A recurrence during the monitored return window is usually more serious.
  const recurrenceMul = injuryRiskMultiplier(player);
  if (recurrenceMul > 1.25 && random() < Math.min(0.45, (recurrenceMul - 1) * 0.55)) {
    days = Math.ceil(days * 1.35);
  }

  player.injured = days;
  player.returnToPlayDays = 0;
  player.injury = {
    key: def.key,
    label: def.label,
    labelEn: def.labelEn,
    cause,
    totalDays: days,
    daysRemaining: days,
    recurrence: def.recurrence,
    occurredDay: options.day ?? null,
  };
  if (!Array.isArray(player.injuryHistory)) player.injuryHistory = [];
  player.injuryHistory.push({
    key: def.key,
    label: def.label,
    labelEn: def.labelEn,
    cause,
    days,
    recurrence: def.recurrence,
    season: options.season ?? null,
    day: options.day ?? null,
  });
  if (player.injuryHistory.length > 8) player.injuryHistory = player.injuryHistory.slice(-8);
  return player.injury;
}

export function processInjuryRecoveryDay(player, options = {}) {
  ensurePlayerInjury(player);
  if (!player) return { recovered: false, monitored: false };
  const random = options.random || Math.random;
  const doctorBonus = Math.max(0, Number(options.doctorBonus) || 0);
  const facilityBonus = Math.max(0, Number(options.facilityBonus) || 0);

  if ((player.injured || 0) > 0) {
    const extraChance = clamp(doctorBonus * 0.045 + facilityBonus * 0.025, 0, 0.38);
    const decrement = 1 + (random() < extraChance ? 1 : 0);
    player.injured = Math.max(0, Math.ceil(player.injured) - decrement);
    if (player.injury) player.injury.daysRemaining = player.injured;
    if (player.injured === 0) {
      const total = Math.max(1, Number(player.injury?.totalDays) || 1);
      player.returnToPlayDays = clamp(Math.ceil(total / 4), 2, 8);
      player.fitness = Math.round(Math.min(Number(player.fitness) || 60, total >= 15 ? 58 : 68));
      return { recovered: true, monitored: true, returnToPlayDays: player.returnToPlayDays };
    }
    return { recovered: false, monitored: false };
  }

  if ((player.returnToPlayDays || 0) > 0) {
    player.returnToPlayDays = Math.max(0, player.returnToPlayDays - 1);
    if (player.returnToPlayDays === 0) player.injury = null;
    return { recovered: false, monitored: player.returnToPlayDays > 0 };
  }
  return { recovered: false, monitored: false };
}

export function injuryLabel(player, lang = "zh") {
  ensurePlayerInjury(player);
  if ((player?.injured || 0) > 0) {
    const type = lang === "en" ? player.injury?.labelEn : player.injury?.label;
    const fallback = lang === "en" ? "Injury" : "伤病";
    return `${type || fallback} · ${Math.ceil(player.injured)}${lang === "en" ? "d" : "天"}`;
  }
  if ((player?.returnToPlayDays || 0) > 0) {
    return lang === "en"
      ? `Return monitoring · ${player.returnToPlayDays}d`
      : `复出观察 · ${player.returnToPlayDays}天`;
  }
  return "";
}
