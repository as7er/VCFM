import { runPreparedMatchSimulation } from "../match.js";

self.onmessage = (event) => {
  const { taskId, prepared } = event.data || {};
  if (!taskId || !prepared) return;
  try {
    self.postMessage({
      taskId,
      ok: true,
      prepared: runPreparedMatchSimulation(prepared),
    });
  } catch (error) {
    self.postMessage({
      taskId,
      ok: false,
      error: error?.stack || error?.message || String(error),
    });
  }
};
