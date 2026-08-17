import {
  commitPreparedMatch,
  prepareMatchSimulation,
  runPreparedMatchSimulation,
} from "../match.js";

const MAX_WORKERS = 12;
const FALLBACK_WORKERS = 4;
let taskSequence = 0;
let retainedWorkerCount = 0;
const workerSlots = [];
const workerQueue = [];

function workerCount(taskCount) {
  const cores = Math.max(2, Number(globalThis.navigator?.hardwareConcurrency) || FALLBACK_WORKERS);
  return Math.max(1, Math.min(taskCount, MAX_WORKERS, cores));
}

function fixtureWaves(fixtures) {
  const waves = [];
  let current = [];
  let clubs = new Set();
  for (const fixture of fixtures) {
    if (clubs.has(fixture.home) || clubs.has(fixture.away)) {
      waves.push(current);
      current = [];
      clubs = new Set();
    }
    current.push(fixture);
    clubs.add(fixture.home);
    clubs.add(fixture.away);
  }
  if (current.length) waves.push(current);
  return waves;
}

function runPreparedLocally(prepared) {
  return Promise.resolve().then(() => runPreparedMatchSimulation(prepared));
}

function taskError(error, fallback) {
  return error instanceof Error ? error : new Error(String(error || fallback));
}

function rejectQueuedTasks(error) {
  const failure = taskError(error, "match worker pool unavailable");
  for (const task of workerQueue.splice(0)) task.reject(failure);
}

function dispatchWorkerQueue() {
  for (const slot of workerSlots) {
    if (slot.current || !workerQueue.length) continue;
    const task = workerQueue.shift();
    slot.current = task;
    try {
      slot.worker.postMessage({ taskId: task.id, prepared: task.prepared });
    } catch (error) {
      recycleWorker(slot, error);
    }
  }
}

function createWorkerSlot() {
  const worker = new Worker(new URL("./match-worker.js", import.meta.url), {
    type: "module",
    name: `vcfm-match-${workerSlots.length + 1}`,
  });
  const slot = { worker, current: null };
  worker.onerror = (event) => {
    event.preventDefault?.();
    recycleWorker(slot, event.error || new Error(event.message || "match worker crashed"));
  };
  worker.onmessageerror = () => recycleWorker(slot, new Error("match worker returned unreadable data"));
  worker.onmessage = (event) => {
    const task = slot.current;
    if (!task) return;
    const message = event.data || {};
    if (message.taskId !== task.id) {
      recycleWorker(slot, new Error("match worker returned an unexpected task"));
      return;
    }
    slot.current = null;
    if (!message.ok) task.reject(new Error(message.error || "match worker failed"));
    else task.resolve(message.prepared);
    dispatchWorkerQueue();
  };
  workerSlots.push(slot);
  return slot;
}

function ensureWorkerPool(count) {
  retainedWorkerCount = Math.max(retainedWorkerCount, count);
  while (workerSlots.length < retainedWorkerCount) createWorkerSlot();
}

function recycleWorker(slot, error) {
  const index = workerSlots.indexOf(slot);
  if (index < 0) return;
  workerSlots.splice(index, 1);
  try {
    slot.worker.terminate();
  } catch (_) {
    /* already stopped */
  }
  const failure = taskError(error, "match worker crashed");
  if (slot.current) {
    slot.current.reject(failure);
    slot.current = null;
  }
  try {
    ensureWorkerPool(retainedWorkerCount);
    dispatchWorkerQueue();
  } catch (replacementError) {
    rejectQueuedTasks(replacementError);
  }
}

function enqueueWorkerTask(prepared) {
  return new Promise((resolve, reject) => {
    workerQueue.push({
      id: `match-${++taskSequence}`,
      prepared,
      resolve,
      reject,
    });
    dispatchWorkerQueue();
  });
}

function runWorkerWave(preparedMatches, onCompleted = null) {
  let runner = runPreparedLocally;
  if (typeof Worker === "function" && preparedMatches.length >= 2) {
    ensureWorkerPool(workerCount(preparedMatches.length));
    runner = enqueueWorkerTask;
  }
  let completed = 0;
  return Promise.all(preparedMatches.map((prepared) => runner(prepared).then((result) => {
    completed++;
    onCompleted?.(completed);
    return result;
  })));
}

export function shutdownMatchWorkerPool() {
  retainedWorkerCount = 0;
  const error = new Error("match worker pool stopped");
  rejectQueuedTasks(error);
  for (const slot of workerSlots.splice(0)) {
    if (slot.current) slot.current.reject(error);
    try {
      slot.worker.terminate();
    } catch (_) {
      /* already stopped */
    }
  }
}

/**
 * Run independent spatial clocks in parallel, then commit every result on the
 * calendar thread in the original fixture order.
 */
export async function runFixtureBatch(world, fixtures, options) {
  const reports = [];
  const onProgress = typeof options?.onProgress === "function" ? options.onProgress : null;
  let completedBeforeWave = 0;
  for (const wave of fixtureWaves(fixtures)) {
    const prepared = wave.map((fixture) => prepareMatchSimulation(world, fixture, options));
    let completed;
    try {
      completed = await runWorkerWave(prepared, (waveCompleted) => onProgress?.({
        completed: completedBeforeWave + waveCompleted,
        total: fixtures.length,
      }));
    } catch (error) {
      console.warn("parallel match workers unavailable; finishing wave locally", error);
      completed = prepared.map((match) => runPreparedMatchSimulation(match));
      onProgress?.({ completed: completedBeforeWave + wave.length, total: fixtures.length });
    }
    for (let index = 0; index < wave.length; index++) {
      reports.push(commitPreparedMatch(world, wave[index], completed[index]));
    }
    completedBeforeWave += wave.length;
  }
  return reports;
}
