import {
  advanceDay,
  advanceToNextMatchDay,
  advanceToSeasonEnd,
} from "../engine.js";

const AI_SIMULATION_OPTIONS = Object.freeze({
  aiEngineMode: "spatial",
  aiSimulationProfile: "background",
});

self.onmessage = (event) => {
  const { requestId, action, world, payload = {} } = event.data || {};
  if (!requestId || !world) return;
  try {
    let result;
    if (action === "day") {
      result = advanceDay(world, AI_SIMULATION_OPTIONS);
    } else if (action === "to-matchday") {
      result = advanceToNextMatchDay(
        world,
        Number(payload.maxDays) || 60,
        AI_SIMULATION_OPTIONS
      );
    } else if (action === "to-season-end") {
      result = advanceToSeasonEnd(world, {
        maxDays: Number(payload.maxDays) || 400,
        stopOnUserMatch: payload.stopOnUserMatch !== false,
        ...AI_SIMULATION_OPTIONS,
      });
    } else {
      throw new Error(`unknown calendar action: ${action}`);
    }
    self.postMessage({ requestId, ok: true, world, result });
  } catch (error) {
    self.postMessage({
      requestId,
      ok: false,
      error: error?.stack || error?.message || String(error),
    });
  }
};
