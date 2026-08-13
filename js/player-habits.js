/** 球员个人踢球习惯：持久化的行为倾向，只改变动作选择，不改属性或成功率。 */

import { preferredHabitsForAttributeArchetype } from "./player-attributes.js";

export const PLAYER_HABITS_VERSION = 1;

export const PLAYER_HABITS = Object.freeze({
  tries_through_balls: Object.freeze({
    id: "tries_through_balls",
    label: "经常尝试直塞",
    labelEn: "Tries through balls",
    description: "看到防线身后空间时，更愿意承担风险尝试穿透性传球。",
    descriptionEn: "More willing to risk a penetrative pass when space opens behind the defensive line.",
    positions: ["MID", "ATT"],
    attributes: ["vision", "passing", "decisions"],
  }),
  plays_one_twos: Object.freeze({
    id: "plays_one_twos",
    label: "喜欢二过一配合",
    labelEn: "Plays one-twos",
    description: "出球后更愿意继续接应，也更常把球快速回给刚才的传球者。",
    descriptionEn: "More often supports after releasing the ball and returns passes to the previous passer.",
    positions: ["MID", "ATT"],
    attributes: ["passing", "decisions", "pace"],
  }),
  switches_play: Object.freeze({
    id: "switches_play",
    label: "喜欢转移进攻方向",
    labelEn: "Switches play",
    description: "持球时更重视远端接应点，愿意把进攻转移到另一侧。",
    descriptionEn: "Looks more readily for a receiver on the far side to change the point of attack.",
    positions: ["DEF", "MID"],
    attributes: ["passing", "vision", "decisions"],
  }),
  comes_deep: Object.freeze({
    id: "comes_deep",
    label: "喜欢回撤接球",
    labelEn: "Comes deep to get the ball",
    description: "组织阶段更常离开前方站位，回到球侧提供接应。",
    descriptionEn: "Leaves an advanced position more often to offer support near the ball during build-up.",
    positions: ["MID", "ATT"],
    attributes: ["vision", "passing", "decisions"],
    conflicts: ["gets_forward"],
  }),
  gets_forward: Object.freeze({
    id: "gets_forward",
    label: "喜欢前插",
    labelEn: "Gets forward whenever possible",
    description: "本队控球时更积极越过原有站位，寻找纵深和禁区接应。",
    descriptionEn: "Advances beyond the starting position more often to attack depth and the penalty area.",
    positions: ["DEF", "MID", "ATT"],
    attributes: ["pace", "stamina", "positioning"],
    conflicts: ["comes_deep"],
  }),
  hugs_line: Object.freeze({
    id: "hugs_line",
    label: "喜欢贴边活动",
    labelEn: "Hugs the touchline",
    description: "边路推进时更愿意保持宽度并从外侧传中。",
    descriptionEn: "Keeps width more often during wide attacks and looks to deliver from the outside.",
    positions: ["DEF", "MID", "ATT"],
    attributes: ["pace", "crossing", "stamina"],
    wideOnly: true,
    conflicts: ["cuts_inside"],
  }),
  cuts_inside: Object.freeze({
    id: "cuts_inside",
    label: "喜欢从边路内切",
    labelEn: "Cuts inside from the flank",
    description: "在边路接球后更常进入肋部或中路，而不是继续贴边。",
    descriptionEn: "Moves into the half-space or centre more often after receiving in a wide area.",
    positions: ["MID", "ATT"],
    attributes: ["dribbling", "pace", "shooting"],
    wideOnly: true,
    conflicts: ["hugs_line"],
  }),
  runs_with_ball: Object.freeze({
    id: "runs_with_ball",
    label: "喜欢带球推进",
    labelEn: "Runs with the ball",
    description: "有向前空间时更愿意自己带球越过防线。",
    descriptionEn: "More willing to carry the ball forward when space is available.",
    positions: ["DEF", "MID", "ATT"],
    attributes: ["dribbling", "pace", "strength"],
  }),
  shoots_from_distance: Object.freeze({
    id: "shoots_from_distance",
    label: "喜欢远射",
    labelEn: "Shoots from distance",
    description: "在禁区外获得角度时更常考虑射门，但命中仍取决于射门属性和压力。",
    descriptionEn: "Considers shooting from outside the box more often, while execution still depends on ability and pressure.",
    positions: ["MID", "ATT"],
    attributes: ["shooting", "decisions", "finishing"],
  }),
  places_shots: Object.freeze({
    id: "places_shots",
    label: "喜欢巧射角度",
    labelEn: "Places shots",
    description: "近中距离射门时更倾向牺牲力量寻找球门角度。",
    descriptionEn: "More often trades power for placement when shooting from close or medium range.",
    positions: ["MID", "ATT"],
    attributes: ["finishing", "decisions", "shooting"],
  }),
  rounds_keeper: Object.freeze({
    id: "rounds_keeper",
    label: "喜欢盘过门将",
    labelEn: "Rounds the goalkeeper",
    description: "单刀且门将仍在封角时，更可能继续带球寻找真正空门。",
    descriptionEn: "More likely to carry around an advancing goalkeeper before shooting in one-on-one situations.",
    positions: ["ATT"],
    attributes: ["dribbling", "pace", "decisions"],
  }),
  dives_into_tackles: Object.freeze({
    id: "dives_into_tackles",
    label: "喜欢下脚抢断",
    labelEn: "Dives into tackles",
    description: "成为上抢者时更早、更频繁地下脚，同时也承担更多犯规风险。",
    descriptionEn: "Attempts tackles earlier and more often when pressing, accepting the additional foul risk.",
    positions: ["DEF", "MID"],
    attributes: ["tackling", "strength", "marking"],
  }),
  distributes_short: Object.freeze({
    id: "distributes_short",
    label: "门将喜欢短传出球",
    labelEn: "Distributes short",
    description: "没有迫近压力时，优先寻找后场安全接应点。",
    descriptionEn: "Prioritises a safe short receiver when not under immediate pressure.",
    positions: ["GK"],
    attributes: ["kicking", "decisions", "passing"],
    conflicts: ["launches_counters"],
  }),
  launches_counters: Object.freeze({
    id: "launches_counters",
    label: "门将喜欢快速长传反击",
    labelEn: "Launches counter-attacks",
    description: "控制球后更常越过后场，直接寻找中前场接应点。",
    descriptionEn: "More often bypasses the back line to find a midfield or forward target after claiming the ball.",
    positions: ["GK"],
    attributes: ["kicking", "vision", "decisions"],
    conflicts: ["distributes_short"],
  }),
});

export const PLAYER_HABIT_IDS = Object.freeze(Object.keys(PLAYER_HABITS));

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function stableUnit(seed) {
  let hash = 2166136261;
  const text = String(seed || "");
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function attr(player, key) {
  return clamp(player?.attrs?.[key] ?? player?.[key] ?? 10, 1, 20);
}

function isWidePlayer(player) {
  const positions = new Set([
    player?.detailedPosition,
    player?.positionProfile?.primary,
    ...(player?.positionProfile?.natural || []),
    ...(player?.positionProfile?.accomplished || []),
  ].filter(Boolean));
  if ([...positions].some((position) => ["LB", "RB", "LM", "RM", "LW", "RW"].includes(position))) {
    return true;
  }
  return false;
}

export function habitDefinition(habitId) {
  return PLAYER_HABITS[habitId] || null;
}

export function habitLabel(habitId, lang = "zh") {
  const definition = habitDefinition(habitId);
  if (!definition) return habitId || "-";
  return lang === "en" ? definition.labelEn : definition.label;
}

export function habitDescription(habitId, lang = "zh") {
  const definition = habitDefinition(habitId);
  if (!definition) return "";
  return lang === "en" ? definition.descriptionEn : definition.description;
}

export function isHabitEligible(player, habitId) {
  const definition = habitDefinition(habitId);
  if (!player || !definition || !definition.positions.includes(player.pos)) return false;
  return !definition.wideOnly || isWidePlayer(player);
}

function conflictsWith(ids, habitId) {
  const definition = habitDefinition(habitId);
  return (definition?.conflicts || []).some((id) => ids.includes(id));
}

function normalizedHabitIds(player, ids) {
  const normalized = [];
  for (const id of Array.isArray(ids) ? ids : []) {
    if (!PLAYER_HABITS[id] || !isHabitEligible(player, id) || normalized.includes(id)) continue;
    if (conflictsWith(normalized, id)) continue;
    normalized.push(id);
  }
  return normalized.slice(0, 4);
}

function habitScore(player, definition) {
  const attributes = definition.attributes || [];
  const ability = attributes.length
    ? attributes.reduce((sum, key) => sum + attr(player, key), 0) / attributes.length
    : Number(player?.ovr) || 10;
  const positionFit = player?.pos === "GK" ? 1.5 : definition.positions[0] === player?.pos ? 0.45 : 0;
  const archetypeFit = preferredHabitsForAttributeArchetype(player).includes(definition.id) ? 2.4 : 0;
  return ability + positionFit + archetypeFit + stableUnit(`${player?.id}:${definition.id}:habit`) * 4.2;
}

function deriveInitialHabits(player) {
  const eligible = Object.values(PLAYER_HABITS)
    .filter((definition) => isHabitEligible(player, definition.id))
    .sort((left, right) =>
      habitScore(player, right) - habitScore(player, left) || left.id.localeCompare(right.id)
    );
  const maximum = player?.pos === "GK" ? 1 : 1 + Math.floor(stableUnit(`${player?.id}:habit-count`) * 3);
  const selected = [];
  for (const definition of eligible) {
    if (selected.length >= maximum) break;
    if (conflictsWith(selected, definition.id)) continue;
    selected.push(definition.id);
  }
  return selected;
}

function normalizeTraining(player) {
  const training = player?.habitTraining;
  if (!training || typeof training !== "object") return null;
  const mode = training.mode === "unlearn" ? "unlearn" : "learn";
  const habitId = String(training.habitId || "");
  if (!PLAYER_HABITS[habitId] || !isHabitEligible(player, habitId)) return null;
  const hasHabit = player.playingHabits.includes(habitId);
  if ((mode === "learn" && hasHabit) || (mode === "unlearn" && !hasHabit)) return null;
  if (mode === "learn" && conflictsWith(player.playingHabits, habitId)) return null;
  return {
    habitId,
    mode,
    progress: clamp(training.progress, 0, 99.9),
    startedSeason: Number.isFinite(Number(training.startedSeason)) ? Number(training.startedSeason) : null,
    startedDay: Number.isFinite(Number(training.startedDay)) ? Number(training.startedDay) : null,
    lastProcessedSeason: Number.isFinite(Number(training.lastProcessedSeason))
      ? Number(training.lastProcessedSeason)
      : null,
    lastProcessedDay: Number.isFinite(Number(training.lastProcessedDay))
      ? Number(training.lastProcessedDay)
      : null,
  };
}

export function ensurePlayerHabits(player) {
  if (!player) return false;
  const hadProfile = Array.isArray(player.playingHabits);
  const next = hadProfile ? normalizedHabitIds(player, player.playingHabits) : deriveInitialHabits(player);
  let changed = !hadProfile || JSON.stringify(next) !== JSON.stringify(player.playingHabits);
  player.playingHabits = next;
  const training = normalizeTraining(player);
  if (training === null && player.habitTraining != null) changed = true;
  if (training !== null && JSON.stringify(training) !== JSON.stringify(player.habitTraining)) changed = true;
  player.habitTraining = training;
  if (!Array.isArray(player.habitHistory)) {
    player.habitHistory = [];
    changed = true;
  }
  if ((player.habitsVersion || 0) < PLAYER_HABITS_VERSION) {
    player.habitsVersion = PLAYER_HABITS_VERSION;
    changed = true;
  }
  return changed;
}

export function hasPlayingHabit(player, habitId) {
  ensurePlayerHabits(player);
  return player?.playingHabits?.includes(habitId) || false;
}

export function availableHabitTraining(player) {
  ensurePlayerHabits(player);
  const current = player.playingHabits || [];
  return {
    learn: Object.values(PLAYER_HABITS).filter(
      (definition) =>
        isHabitEligible(player, definition.id) &&
        !current.includes(definition.id) &&
        !conflictsWith(current, definition.id)
    ),
    unlearn: current.map(habitDefinition).filter(Boolean),
  };
}

export function startHabitTraining(player, habitId, mode, context = {}) {
  ensurePlayerHabits(player);
  const normalizedMode = mode === "unlearn" ? "unlearn" : "learn";
  if (player.habitTraining) {
    return { ok: false, msg: "已有一项个人习惯训练正在进行", msgEn: "Another habit programme is already active" };
  }
  if (!isHabitEligible(player, habitId)) {
    return { ok: false, msg: "该习惯不适合球员当前的位置特征", msgEn: "This habit does not fit the player's position profile" };
  }
  const hasHabit = player.playingHabits.includes(habitId);
  if (normalizedMode === "learn" && hasHabit) {
    return { ok: false, msg: "球员已经具备这项习惯", msgEn: "The player already has this habit" };
  }
  if (normalizedMode === "unlearn" && !hasHabit) {
    return { ok: false, msg: "球员没有这项习惯", msgEn: "The player does not have this habit" };
  }
  if (normalizedMode === "learn" && conflictsWith(player.playingHabits, habitId)) {
    return { ok: false, msg: "该习惯与球员现有习惯冲突，需先取消原习惯", msgEn: "An incompatible existing habit must be unlearned first" };
  }
  player.habitTraining = {
    habitId,
    mode: normalizedMode,
    progress: 0,
    startedSeason: Number(context.season) || 0,
    startedDay: Number(context.day) || 1,
    lastProcessedSeason: null,
    lastProcessedDay: null,
  };
  return {
    ok: true,
    msg: `${normalizedMode === "learn" ? "开始培养" : "开始纠正"}：${habitLabel(habitId)}`,
    msgEn: `${normalizedMode === "learn" ? "Started learning" : "Started unlearning"}: ${habitLabel(habitId, "en")}`,
  };
}

export function cancelHabitTraining(player) {
  ensurePlayerHabits(player);
  if (!player.habitTraining) {
    return { ok: false, msg: "当前没有个人习惯训练", msgEn: "No habit programme is active" };
  }
  const habitId = player.habitTraining.habitId;
  player.habitTraining = null;
  return {
    ok: true,
    msg: `已取消：${habitLabel(habitId)}`,
    msgEn: `Cancelled: ${habitLabel(habitId, "en")}`,
  };
}

export function processHabitTrainingWeek(player, context = {}) {
  ensurePlayerHabits(player);
  const training = player.habitTraining;
  if (!training) return { active: false, completed: false, progress: 0 };
  const season = Number(context.season) || 0;
  const day = Number(context.day) || 1;
  if (training.lastProcessedSeason === season && training.lastProcessedDay === day) {
    return { active: true, completed: false, progress: training.progress };
  }
  training.lastProcessedSeason = season;
  training.lastProcessedDay = day;
  if ((player.injured || 0) > 0) {
    return { active: true, completed: false, progress: training.progress, paused: "injured" };
  }
  const coach = clamp(context.coachRating ?? 8, 1, 20);
  const decisions = attr(player, "decisions");
  const age = Number(player.age) || 25;
  const ageFactor = age <= 21 ? 1.15 : age >= 31 ? 0.84 : age >= 28 ? 0.94 : 1;
  const intensityFactor = context.intensity === "hard" ? 1.12 : context.intensity === "light" ? 0.86 : 1;
  const modeFactor = training.mode === "unlearn" ? 1.08 : 1;
  const increment = (4.1 + coach * 0.19 + decisions * 0.08) * ageFactor * intensityFactor * modeFactor;
  training.progress = clamp(training.progress + increment, 0, 100);
  if (training.progress < 100) {
    return { active: true, completed: false, progress: training.progress, increment };
  }
  if (training.mode === "learn") player.playingHabits.push(training.habitId);
  else player.playingHabits = player.playingHabits.filter((id) => id !== training.habitId);
  player.playingHabits = normalizedHabitIds(player, player.playingHabits);
  const completed = {
    habitId: training.habitId,
    mode: training.mode,
    season,
    day,
  };
  player.habitHistory.unshift(completed);
  player.habitHistory = player.habitHistory.slice(0, 20);
  player.habitTraining = null;
  return { active: false, completed: true, progress: 100, ...completed };
}

/** 球探只揭示观察时已确认的习惯；公开信息不会直接泄露完整档案。 */
export function observedHabitIds(player, knowledgeLevel, seed = "") {
  ensurePlayerHabits(player);
  const habits = player.playingHabits || [];
  const level = clamp(knowledgeLevel, 0, 100);
  const count = level >= 86
    ? habits.length
    : level >= 68
      ? Math.min(habits.length, 2)
      : level >= 46
        ? Math.min(habits.length, 1)
        : 0;
  return habits
    .slice()
    .sort((left, right) =>
      stableUnit(`${seed}:${player.id}:${left}`) - stableUnit(`${seed}:${player.id}:${right}`) ||
      left.localeCompare(right)
    )
    .slice(0, count);
}
