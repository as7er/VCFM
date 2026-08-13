import {
  advanceDayWithMatchRunner,
  advanceToNextMatchDayWithMatchRunner,
  advanceToSeasonEndWithMatchRunner,
} from "../engine.js";
import { runFixtureBatch } from "./match-worker-pool.js";

const AI_SIMULATION_OPTIONS = Object.freeze({
  aiEngineMode: "spatial",
  aiSimulationProfile: "background",
});

self.onmessage = async (event) => {
  const { requestId, action, world, payload = {} } = event.data || {};
  if (!requestId || !world) return;
  try {
    let result;
    if (action === "day") {
      result = await advanceDayWithMatchRunner(
        world,
        AI_SIMULATION_OPTIONS,
        runFixtureBatch
      );
    } else if (action === "to-matchday") {
      result = await advanceToNextMatchDayWithMatchRunner(
        world,
        Number(payload.maxDays) || 60,
        AI_SIMULATION_OPTIONS,
        runFixtureBatch
      );
    } else if (action === "to-season-end") {
      result = await advanceToSeasonEndWithMatchRunner(
        world,
        {
          maxDays: Number(payload.maxDays) || 400,
          stopOnUserMatch: payload.stopOnUserMatch !== false,
          ...AI_SIMULATION_OPTIONS,
        },
        runFixtureBatch
      );
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
