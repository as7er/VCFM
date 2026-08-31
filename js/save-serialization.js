const PLAYING_TIME_HISTORY_FORMAT = 2;

function compactPlayingTimeEntry(entry) {
  if (!entry || Array.isArray(entry)) return entry;
  const flags =
    (entry.started ? 1 : 0) |
    (entry.appeared ? 2 : 0) |
    (entry.available ? 4 : 0);
  return [
    entry.key || "",
    entry.season ?? null,
    Number(entry.day) || 0,
    entry.competitionType || "league",
    flags,
    Number(entry.minutes) || 0,
    entry.competitionId || null,
  ];
}

function saveReplacer(key, value) {
  // Squad plans are derived from the current squad, formation and finances.
  if (key === "squadPlan" && this && Array.isArray(this.players)) return undefined;
  if (key === "playingTime" && value && typeof value === "object" && !Array.isArray(value)) {
    return {
      ...value,
      historyFormat: PLAYING_TIME_HISTORY_FORMAT,
      history: Array.isArray(value.history)
        ? value.history.map(compactPlayingTimeEntry)
        : [],
    };
  }
  return value;
}

export function stringifyWorldForSave(world) {
  return JSON.stringify(world, saveReplacer);
}

export const SAVE_SERIALIZATION_VERSION = 1;
